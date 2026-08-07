#!/usr/bin/env bash
# ================================================================
#  OLLAMA-FORGE v1.1  –  full production local LLM stack
#  Target : Ryzen 5 3400G + Vega iGPU + 14GB RAM  |  Ubuntu 24.04
#  Includes : Tailscale, Cloudflared, firewall, self‑heal, backups,
#             telemetry, resource guards, and all patch‑note fixes.
# ================================================================
set -Eeuo pipefail
IFS=$'\n\t'

# ---------- config ----------
OLLAMA_HOST_BIND="127.0.0.1:11434"               # local only
OLLAMA_ORIGINS="http://localhost,https://ops.codazi.com"
OLLAMA_NUM_PARALLEL="1"
OLLAMA_MAX_LOADED_MODELS="1"
OLLAMA_KEEP_ALIVE="30m"
OLLAMA_FLASH_ATTENTION="1"
OLLAMA_METRICS="1"                               # enable Prometheus metrics
MODELS_DEFAULT=("qwen3:4b" "qwen2.5-coder:3b" "nomic-embed-text")
CONNECTOR_URL="https://57f6e9fe-1f4e-4ed6-996a-429b0644b0c8-00-h8fufe1k8rs3.sisko.replit.dev"
LOG_DIR="$HOME/.ollama-forge/logs"
STATE_DIR="$HOME/.ollama-forge/state"
ENV_FILE="$HOME/.ollama-forge/env"
SYSTEMD_DROPIN_DIR="/etc/systemd/system/ollama.service.d"
BACKUP_DIR="$STATE_DIR/backup"
TELEMETRY_LOG="$LOG_DIR/telemetry.log"
TAILSCALE_AUTH_KEY="${TAILSCALE_AUTH_KEY:-}"     # set this env var before run if you have a pre‑auth key, else interactive

mkdir -p "$LOG_DIR" "$STATE_DIR" "$BACKUP_DIR" "$(dirname "$ENV_FILE")"
LOG="$LOG_DIR/forge-$(date -u +%Y%m%dT%H%M%SZ).log"

# ---------- ui ----------
c(){ printf "\033[%sm%s\033[0m" "$1" "$2"; }
info(){  printf "%s %s\n" "$(c '1;36' '[i]')" "$*" | tee -a "$LOG"; }
ok(){    printf "%s %s\n" "$(c '1;32' '[✓]')" "$*" | tee -a "$LOG"; }
warn(){  printf "%s %s\n" "$(c '1;33' '[!]')" "$*" | tee -a "$LOG"; }
err(){   printf "%s %s\n" "$(c '1;31' '[x]')" "$*" | tee -a "$LOG" >&2; }
step(){  printf "\n%s %s\n" "$(c '1;35' '==>')" "$*" | tee -a "$LOG"; }

trap 'err "line $LINENO failed. See $LOG"; exit 1' ERR

# ---------- helpers ----------
need_sudo(){ if [ "$EUID" -ne 0 ]; then SUDO="sudo"; else SUDO=""; fi; }
have(){ command -v "$1" >/dev/null 2>&1; }
retry(){ local n=0 max=${2:-5}; until "$1" ; do n=$((n+1)); [ $n -ge $max ] && return 1; sleep $((n*2)); done; }
url_ok(){ curl -fsS --max-time 5 "$1" >/dev/null 2>&1; }

# ================================================================
# STEP 0 – system validation
# ================================================================
step "SYSTEM VALIDATION"
need_sudo

UBUNTU_VER=$(lsb_release -rs 2>/dev/null || echo "0")
[[ "$UBUNTU_VER" == "24.04" ]] && ok "Ubuntu 24.04" || warn "Ubuntu 24.04 recommended (you have $UBUNTU_VER)"

AVAIL_RAM_GB=$(free -g | awk '/^Mem:/{print $2}')
if [ "$AVAIL_RAM_GB" -lt 4 ]; then
  err "RAM <4GB (${AVAIL_RAM_GB}GB) – cannot run Ollama. Aborting."
  exit 1
fi
ok "RAM: ${AVAIL_RAM_GB}GB"

CPU_THREADS=$(nproc); ok "CPU threads: $CPU_THREADS"

AVAIL_DISK_GB=$(df -BG / | awk 'NR==2 {print $4}' | sed 's/G//')
if [ "$AVAIL_DISK_GB" -lt 10 ]; then
  warn "Root disk <10GB free (${AVAIL_DISK_GB}GB) – pulls may fail."
else
  ok "Disk free: ${AVAIL_DISK_GB}GB"
fi

url_ok "https://1.1.1.1" && ok "Internet reachable" || warn "No internet – remote pulls will fail."

# ================================================================
# STEP 1 – install base deps + firewall
# ================================================================
step "INSTALL DEPENDENCIES & FIREWALL"
$SUDO apt-get update -y | tee -a "$LOG" >/dev/null
$SUDO apt-get install -y curl wget jq ca-certificates git zsh lsof \
    build-essential pciutils dnsutils net-tools ripgrep unzip \
    software-properties-common ufw | tee -a "$LOG" >/dev/null

# Firewall hardening
if have ufw; then
  $SUDO ufw status | grep -q "Status: active" || warn "UFW not active – run: sudo ufw enable"
  $SUDO ufw deny 11434 >/dev/null 2>&1 || true
  $SUDO ufw allow from 192.168.0.0/16 to any port 11434 >/dev/null 2>&1 || true
  ok "UFW rules: deny all, allow 192.168.0.0/16"
else
  warn "UFW not installed – skip firewall hardening."
fi
ok "Base packages installed."

# ================================================================
# STEP 2 – install Ollama (self‑heal)
# ================================================================
step "OLLAMA BINARY"
if ! have ollama; then
  info "Installing Ollama..."
  curl -fsSL https://ollama.com/install.sh | sh
else
  info "Upgrading existing Ollama..."
  curl -fsSL https://ollama.com/install.sh | sh || warn "Upgrade non‑fatal"
fi
have ollama || { err "Ollama not installed"; exit 1; }
ok "Ollama binary: $(command -v ollama)"

# ================================================================
# STEP 3 – GPU detection (safe CPU fallback)
# ================================================================
step "GPU DETECTION"
GPU_MODE="cpu"
if lspci | grep -qiE 'vga|3d|display' && lspci | grep -qi 'AMD'; then
  if [ -d /opt/rocm ] || ldconfig -p | grep -qi rocm; then
    GPU_MODE="rocm"
    ok "ROCm detected – GPU acceleration possible"
  else
    warn "AMD GPU present but ROCm not installed – staying on CPU"
  fi
else
  info "No discrete GPU – CPU inference"
fi

# ================================================================
# STEP 4 – systemd override with all env vars
# ================================================================
step "SYSTEMD SERVICE OVERRIDE"
$SUDO mkdir -p "$SYSTEMD_DROPIN_DIR"
$SUDO tee "$SYSTEMD_DROPIN_DIR/override.conf" >/dev/null <<EOF
[Service]
Environment="OLLAMA_HOST=$OLLAMA_HOST_BIND"
Environment="OLLAMA_ORIGINS=$OLLAMA_ORIGINS"
Environment="OLLAMA_KEEP_ALIVE=$OLLAMA_KEEP_ALIVE"
Environment="OLLAMA_NUM_PARALLEL=$OLLAMA_NUM_PARALLEL"
Environment="OLLAMA_MAX_LOADED_MODELS=$OLLAMA_MAX_LOADED_MODELS"
Environment="OLLAMA_FLASH_ATTENTION=$OLLAMA_FLASH_ATTENTION"
Environment="OLLAMA_METRICS=$OLLAMA_METRICS"
Restart=always
RestartSec=3
EOF
ok "Systemd override written"

# Shell environment
cat > "$ENV_FILE" <<EOF
# ollama-forge env v1.1
export OLLAMA_HOST="http://127.0.0.1:11434"
export OLLAMA_ORIGINS="$OLLAMA_ORIGINS"
export OLLAMA_API_BASE="http://127.0.0.1:11434"
export OPENAI_API_BASE="http://127.0.0.1:11434/v1"
export OPENAI_API_KEY="ollama"
export OLLAMA_METRICS="$OLLAMA_METRICS"
EOF
for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
  [ -f "$rc" ] || continue
  grep -q "ollama-forge/env" "$rc" || echo "source $ENV_FILE" >> "$rc"
done
ok "Shell env wired."

# ================================================================
# STEP 5 – start/restart Ollama service
# ================================================================
step "START OLLAMA SERVICE"
$SUDO systemctl daemon-reload
if systemctl list-unit-files | grep -q '^ollama.service'; then
  $SUDO systemctl enable ollama >/dev/null 2>&1 || true
  $SUDO systemctl restart ollama
else
  warn "No systemd unit – starting foreground fallback."
  pkill -f 'ollama serve' >/dev/null 2>&1 || true
  nohup env OLLAMA_HOST="$OLLAMA_HOST_BIND" OLLAMA_ORIGINS="$OLLAMA_ORIGINS" \
        OLLAMA_METRICS="$OLLAMA_METRICS" \
        ollama serve >"$LOG_DIR/ollama.serve.log" 2>&1 &
  disown || true
fi

# Health check (multiple endpoints)
_health(){
  for ep in "/api/tags" "/api/version" "/api/ps"; do
    if ! url_ok "http://127.0.0.1:11434$ep"; then return 1; fi
  done
}
info "Waiting for API (tags, version, ps)..."
for i in {1..10}; do
  if _health; then ok "API fully up on 11434"; break; fi
  sleep 2
  [ "$i" -eq 10 ] && { err "API not responding"; journalctl -u ollama -n 40 --no-pager | tee -a "$LOG"; exit 1; }
done

# ================================================================
# STEP 6 – pull models (with resource guards)
# ================================================================
step "PULL MODELS"
have_model(){ ollama list | awk 'NR>1{print $1}' | grep -qx "$1"; }
for m in "${MODELS_DEFAULT[@]}"; do
  if have_model "$m"; then
    ok "Model present: $m"
  else
    [ "$AVAIL_RAM_GB" -lt 4 ] && { err "RAM <4GB – cannot pull $m"; break; }
    [ "$AVAIL_DISK_GB" -lt 10 ] && warn "Disk <10GB – pull may fail"
    info "Pulling $m ..."
    ollama pull "$m" | tee -a "$LOG" || warn "Pull failed for $m"
  fi
done

# ================================================================
# STEP 7 – backup models
# ================================================================
step "BACKUP MODELS"
BACKUP_FILE="$BACKUP_DIR/models-$(date -u +%Y%m%d).txt"
ollama list > "$BACKUP_FILE" 2>/dev/null || true
ollama show "$(ollama list | awk 'NR==2{print $1}')" >> "$BACKUP_FILE" 2>/dev/null || true
ok "Model list backed up to $BACKUP_FILE"

# ================================================================
# STEP 8 – telemetry (optional, but we do it)
# ================================================================
step "TELEMETRY LOGGING"
if [ ! -f "$TELEMETRY_LOG" ] || [ "$(wc -l < "$TELEMETRY_LOG")" -lt 100 ]; then
  echo "# timestamp,cpu_load,ram_used_gb,load_avg" > "$TELEMETRY_LOG"
fi
LOAD_AVG=$(awk '{print $1}' /proc/loadavg)
CPU_PCT=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
RAM_USED_GB=$(free -g | awk '/^Mem:/{print $3}')
echo "$(date -u +%Y%m%dT%H%M%SZ),$CPU_PCT,$RAM_USED_GB,$LOAD_AVG" >> "$TELEMETRY_LOG"
ok "Telemetry appended to $TELEMETRY_LOG"

# ================================================================
# STEP 9 – Tailscale (high priority)
# ================================================================
step "TAILSCALE SETUP"
if ! have tailscale; then
  info "Installing Tailscale..."
  curl -fsSL https://tailscale.com/install.sh | sh
fi
if have tailscale; then
  if ! tailscale status >/dev/null 2>&1; then
    if [ -n "$TAILSCALE_AUTH_KEY" ]; then
      info "Authenticating with provided key..."
      $SUDO tailscale up --auth-key "$TAILSCALE_AUTH_KEY" --accept-routes
    else
      warn "No TAILSCALE_AUTH_KEY set. Please run: sudo tailscale up"
      warn "After authentication, Tailscale will provide a stable IP for remote access."
    fi
  else
    ok "Tailscale already connected."
  fi
else
  warn "Tailscale installation failed – skip."
fi

# ================================================================
# STEP 10 – Cloudflared tunnel (high priority)
# ================================================================
step "CLOUDFLARED TUNNEL"
if ! have cloudflared; then
  info "Installing cloudflared..."
  curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
  chmod +x /usr/local/bin/cloudflared
fi
if have cloudflared; then
  # Create a systemd service to expose Ollama
  CLOUD_SERVICE="/etc/systemd/system/cloudflared-ollama.service"
  if [ ! -f "$CLOUD_SERVICE" ]; then
    $SUDO tee "$CLOUD_SERVICE" >/dev/null <<EOF
[Unit]
Description=Cloudflare Tunnel for Ollama
After=network.target ollama.service

[Service]
Type=simple
ExecStart=/usr/local/bin/cloudflared tunnel --url http://127.0.0.1:11434
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
    $SUDO systemctl daemon-reload
    $SUDO systemctl enable cloudflared-ollama >/dev/null 2>&1 || true
    $SUDO systemctl start cloudflared-ollama
    ok "Cloudflared tunnel service started (public URL will appear in logs)."
    info "Check URL with: sudo journalctl -u cloudflared-ollama -f"
  else
    ok "Cloudflared tunnel already configured."
  fi
else
  warn "cloudflared not installed – skip."
fi

# ================================================================
# STEP 11 – VSCode Continue, Antigravity, Claude Code
# ================================================================
step "INTEGRATIONS (VSCode / Antigravity / Claude)"

# Continue
CONT_DIR="$HOME/.continue"
mkdir -p "$CONT_DIR"
CONT_CFG="$CONT_DIR/config.json"
if [ ! -f "$CONT_CFG" ] || ! jq -e . "$CONT_CFG" >/dev/null 2>&1; then
  cat > "$CONT_CFG" <<'JSON'
{
  "models": [
    { "title": "Qwen2.5 Coder 3B",  "provider": "ollama", "model": "qwen2.5-coder:3b", "apiBase": "http://127.0.0.1:11434" },
    { "title": "Qwen3 4B",          "provider": "ollama", "model": "qwen3:4b",          "apiBase": "http://127.0.0.1:11434" },
    { "title": "Llama 3.2 3B",      "provider": "ollama", "model": "llama3.2:3b",      "apiBase": "http://127.0.0.1:11434" }
  ],
  "tabAutocompleteModel": { "title": "Qwen Coder", "provider": "ollama", "model": "qwen2.5-coder:3b", "apiBase": "http://127.0.0.1:11434" },
  "embeddingsProvider": { "provider": "ollama", "model": "nomic-embed-text", "apiBase": "http://127.0.0.1:11434" }
}
JSON
  ok "Continue config written."
else
  ok "Existing Continue config kept."
fi
if have code; then code --install-extension continue.continue --force >/dev/null 2>&1 || warn "VSCode extension install skipped"; fi

# Antigravity
AG_DIR="$HOME/.antigravity"
mkdir -p "$AG_DIR"
cat > "$AG_DIR/ollama.env" <<EOF
OLLAMA_HOST=http://127.0.0.1:11434
OPENAI_API_BASE=http://127.0.0.1:11434/v1
OPENAI_API_KEY=ollama
DEFAULT_MODEL=qwen2.5-coder:3b
EOF
ok "Antigravity env written."

# Claude Code bridge
CC_ENV="$HOME/.claude/ollama-bridge.env"
mkdir -p "$(dirname "$CC_ENV")"
cat > "$CC_ENV" <<EOF
# Claude Code – OpenAI primary, Anthropic optional
export OPENAI_API_BASE="http://127.0.0.1:11434/v1"
export OPENAI_API_KEY="ollama"
# export ANTHROPIC_BASE_URL="http://127.0.0.1:11434"
# export ANTHROPIC_API_KEY="ollama"
export CLAUDE_MODEL="qwen2.5-coder:3b"
EOF
ok "Claude bridge env written."

# ================================================================
# STEP 12 – watchdog (self‑heal) – fixed naming
# ================================================================
step "WATCHDOG (self‑heal)"
WATCH="$HOME/.ollama-forge/watchdog.sh"
cat > "$WATCH" <<'WD'
#!/usr/bin/env bash
set -e
for ep in /api/tags /api/version /api/ps; do
  if ! curl -fsS --max-time 4 "http://127.0.0.1:11434$ep" >/dev/null; then
    if systemctl --user restart ollama-heal.service 2>/dev/null; then
      : # user service restarted
    else
      sudo systemctl restart ollama 2>/dev/null || {
        pkill -f 'ollama serve' || true
        nohup ollama serve >/tmp/ollama.log 2>&1 &
      }
    fi
    break
  fi
done
WD
chmod +x "$WATCH"

mkdir -p "$HOME/.config/systemd/user"
cat > "$HOME/.config/systemd/user/ollama-heal.service" <<EOF
[Unit]
Description=Ollama self-heal check

[Service]
Type=oneshot
ExecStart=$WATCH
EOF
cat > "$HOME/.config/systemd/user/ollama-heal.timer" <<EOF
[Unit]
Description=Run Ollama self-heal every minute

[Timer]
OnBootSec=30s
OnUnitActiveSec=60s
Unit=ollama-heal.service

[Install]
WantedBy=timers.target
EOF
systemctl --user daemon-reload || true
systemctl --user enable --now ollama-heal.timer >/dev/null 2>&1 || warn "User timer requires: loginctl enable-linger $USER"
ok "Watchdog armed (ollama-heal.service)."

# ================================================================
# STEP 13 – cleanup (prune + journal)
# ================================================================
step "CLEANUP"
ollama prune -f 2>/dev/null || warn "ollama prune failed"
if sudo journalctl --vacuum-time=7d >/dev/null 2>&1; then
  ok "Journal vacuumed (7d)"
else
  warn "Journal vacuum skipped."
fi

# ================================================================
# STEP 14 – smoke test
# ================================================================
step "SMOKE TEST"
TEST_MODEL="$(ollama list | awk 'NR==2{print $1}')"
if [ -n "${TEST_MODEL:-}" ]; then
  info "Testing model: $TEST_MODEL"
  echo "Say OK in one word." | ollama run "$TEST_MODEL" | tee -a "$LOG"
  ok "Inference reachable"
else
  warn "No models available for smoke test"
fi

# ================================================================
# DONE
# ================================================================
step "COMPLETE"
cat <<EOF | tee -a "$LOG"

  ✅ Ollama endpoint : http://127.0.0.1:11434
  ✅ OpenAI compat   : http://127.0.0.1:11434/v1
  ✅ Metrics         : http://127.0.0.1:11434/metrics (Prometheus)

  Models installed : $(ollama list | awk 'NR>1{print $1}' | paste -sd, -)

  🔹 Tailscale       : $(tailscale status 2>/dev/null | grep -q "Logged out" && echo "Not logged in – run: sudo tailscale up" || echo "Connected")
  🔹 Cloudflared     : $(systemctl is-active cloudflared-ollama 2>/dev/null || echo "inactive – check logs")

  Shell env         : source $ENV_FILE
  Claude Code       : source $CC_ENV
  Antigravity       : source $AG_DIR/ollama.env
  VSCode Continue   : $CONT_CFG

  Logs              : $LOG
  Telemetry         : $TELEMETRY_LOG
  Backups           : $BACKUP_DIR

  To expose Ollama publicly via Cloudflared, run:
    sudo journalctl -u cloudflared-ollama -f
  (the public URL will appear there)
EOF
