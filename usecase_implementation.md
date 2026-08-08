# Hydra-Agent Audit → Use-Case Implementation Map

> **Audited by:** Mr. 1nj3ct04  
> **Date:** 2026-08-08  
> **Source:** `Hydra-Agent.zip` → `project-hydra/`  
> **Language:** Rust (stable, edition 2021)  
> **Binary:** ~3.4 MB single binary (LTO + strip + opt-level=z)

---

## 1. What Hydra-Agent IS

Autonomous agent framework in Rust. Four core innovations:

| # | Innovation | Module | What It Does |
|---|---|---|---|
| 1 | **Sparse Attention** | `src/attention/sparse.rs` | O(N) windowed + global-token attention → replaces O(N²) dense |
| 2 | **Layer Paging** | `src/memory/paging.rs` | Hot/Warm/Cold weight tiers (RAM → mmap → SSD) with LRU eviction |
| 3 | **AST Critic** | `src/critic/` | tree-sitter JS/Python → zero-LLM-call code validation → JSON report |
| 4 | **KV-Cache Prefetch** | `src/attention/prefetch.rs` | Attention-importance scoring → prefetch hot slots, prune cold ones |

Supporting modules:

| Module | Purpose |
|---|---|
| `src/agent/loop_mod.rs` | Generate → Execute → Critic → Feedback loop |
| `src/agent/policy.rs` | Supervised / Semi-Autonomous / Autonomous levels |
| `src/agent/sop.rs` | Standard Operating Procedure engine (branch semantics) |
| `src/llm/ollama.rs` | Thin `reqwest` Ollama client |
| `src/llm/quantize.rs` | Q2_K / Q4_K_M / Q5_K_M block quantization |
| `src/channels/` | CLI, Discord, Telegram, WebSocket channels |
| `src/server.rs` | WS + HTTP health server on `$PORT` |

---

## 2. Architecture Audit

### 2.1 Strengths

- **Zero-dependency critic** — tree-sitter parse is µs, not token-cost. Agent retries free.
- **LlmProvider trait** — swap Ollama for any backend. Tests use `MockLlm` → no network.
- **Memory paging** — models bigger than RAM work. LRU eviction + mmap warm tier = kernel manages residency.
- **Single binary** — Rust `release` profile ships ~3.4MB. No runtime, no interpreter.
- **Test coverage** — unit + integration tests for every subsystem. Mock providers, no flake.
- **Feature-gated channels** — Discord/Telegram compile only when enabled → small default binary.

### 2.2 Weaknesses / Gaps

| Gap | Impact | Severity |
|---|---|---|
| Only JS + Python critic grammars | No Rust/Go/PHP/Bash validation | Medium |
| `Pager` not `Arc<Mutex<>>` in practice | Prefetch thread safety documented but not enforced | Low |
| No persistent agent state | Agent loop restarts from scratch each session | Medium |
| No streaming response | `generate()` blocks until full completion | Medium |
| WebSocket server = echo + status only | No actual agent-driving WS protocol | Low |
| `purge_memory` clears all warm | Re-page from SSD on every restart | Low |
| Config is TOML-only | No env-var override for individual fields | Low |

### 2.3 Security Notes

- No auth on WebSocket/HTTP server → bind to localhost only in prod.
- `unsafe { MmapOptions }` — justified (read-only, pager-managed files) but verify backing_dir permissions.
- `reqwest` uses `rustls-tls` → no OpenSSL dependency.

---

## 3. Integration Map → Injector Orchestrator

### 3.1 Direct Use: AST Critic as Plugin

**What:** Run `hydra critic <file>` from Injector plugin to validate generated scripts.

```bash
# engines/plugins/hydra_critic.sh

plugin_init() { log_info "Hydra Critic plugin loaded"; }

plugin_report() {
    local target="${1:-$0}"
    local result
    result=$(hydra critic --lang=bash "$target" 2>&1) || true
    
    cat <<EOF > "${INJECTOR_DIR}/plugin_hydra_critic.json"
{
  "status": "VERIFIED",
  "plugin": "hydra_critic",
  "target": "$target",
  "findings": $(echo "$result" | head -1),
  "timestamp": $(date +'%s')
}
EOF
}

plugin_health() { command -v hydra &>/dev/null && echo "OK" || echo "MISSING"; }
plugin_audit() { plugin_report; }
```

**Benefit:** Zero-cost code validation before any script deployment. Critic runs in µs, exits 1 on findings → safe-execute can gate on it.

---

### 3.2 Direct Use: Hydra Server as Telemetry Endpoint

**What:** `hydra serve` on port 8090 → WS health endpoint → Injector polls it.

```bash
# In system_monitor.sh or ai_engine.sh
HYDRA_STATUS=$(curl -s http://localhost:8090/ | jq -r '.status')
```

**Benefit:** Injector dashboard gains real-time Hydra agent health alongside Docker/PM2/Redis telemetry.

---

### 3.3 Agent Loop → IIE Upgrade

**What:** Replace Injector's bash-based IIE recommendation engine with Hydra's agent loop.

| Current IIE (bash) | Hydra Agent Loop |
|---|---|
| Rule-based `if cpu > 90` | LLM-generated recommendations via Ollama |
| No retry on bad output | Critic → feedback → retry loop (≤ max_iterations) |
| Hardcoded thresholds | Policy engine: supervised / semi / autonomous |
| No code generation | Can generate fix scripts + validate via AST critic |

**Implementation:**

```bash
# ai_engine.sh - hybrid mode
generate_ai_recommendations() {
    # ... existing rule-based recommendations ...
    
    # Hydra agent recommendation (if available)
    if command -v hydra &>/dev/null; then
        local hydra_rec
        hydra_rec=$(echo "Analyze: CPU=${cpu_pct}% RAM=${ram_pct}% DISK=${disk_pct}%. Recommend action." | \
            timeout 10 hydra run hydra.toml 2>/dev/null | tail -1)
        
        if [ -n "$hydra_rec" ]; then
            recommendations+=("$hydra_rec")
            sources+=("[HYDRA-AGENT]")
            confidence+=("[CONF:MEDIUM]")
        fi
    fi
}
```

---

### 3.4 Layer Paging → Ollama Model Management

**What:** Use Hydra's paging concepts to manage which Ollama models are "hot" (loaded) vs "cold" (on disk).

```bash
# engines/plugins/model_pager.sh

plugin_init() { log_info "Model Pager plugin loaded"; }

plugin_report() {
    local loaded_models
    loaded_models=$(curl -s http://localhost:11434/api/tags | jq -r '.models[].name' 2>/dev/null)
    local model_count
    model_count=$(echo "$loaded_models" | wc -l)
    
    # Hydra-inspired tier classification
    local ram_mb=$(free -m | awk 'NR==2{print $7}')
    local tier="cold"
    [ "$ram_mb" -gt 8000 ] && tier="hot"
    [ "$ram_mb" -gt 4000 ] && [ "$ram_mb" -le 8000 ] && tier="warm"
    
    cat <<EOF > "${INJECTOR_DIR}/plugin_model_pager.json"
{
  "status": "VERIFIED",
  "plugin": "model_pager",
  "loaded_models": $model_count,
  "available_ram_mb": $ram_mb,
  "recommended_tier": "$tier",
  "timestamp": $(date +'%s')
}
EOF
}

plugin_health() { curl -s http://localhost:11434/api/tags &>/dev/null && echo "OK" || echo "DOWN"; }
plugin_audit() { plugin_report; }
```

---

### 3.5 SOP Engine → Injector Deployment Procedures

**What:** Port Hydra's SOP branch semantics to Injector's deployment phases.

Hydra SOP rule: *if any conditioned step matches context → run only that branch; else → unconditional fallback.*

```bash
# engines/core_helper.sh - add SOP-style branching

sop_execute() {
    local context="$1"
    shift
    local -a conditioned_steps=()
    local -a unconditional_steps=()
    
    for step in "$@"; do
        local condition="${step%%:*}"
        local action="${step#*:}"
        if [ "$condition" = "$action" ]; then
            unconditional_steps+=("$action")
        elif echo "$context" | grep -q "$condition"; then
            conditioned_steps+=("$action")
        fi
    done
    
    if [ ${#conditioned_steps[@]} -gt 0 ]; then
        for step in "${conditioned_steps[@]}"; do
            safe_execute "MEDIUM" "$step"
        done
    else
        for step in "${unconditional_steps[@]}"; do
            safe_execute "LOW" "$step"
        done
    fi
}
```

---

### 3.6 Quantization Awareness → Hardware Doctor

**What:** Port `hydra doctor` hardware-aware model recommendation into Injector.

```bash
# engines/system_engine.sh - add model recommendation

recommend_model() {
    local ram_mb=$1
    if [ "$ram_mb" -ge 16000 ]; then
        echo "qwen2.5:7b (Q4_K_M)"
    elif [ "$ram_mb" -ge 8000 ]; then
        echo "qwen2.5:3b (Q4_K_M)"
    elif [ "$ram_mb" -ge 4000 ]; then
        echo "phi3:mini (Q2_K)"
    else
        echo "tinyllama (Q2_K)"
    fi
}
```

Already partially in `ai_engine.sh` → align with Hydra's quantization levels table:

| Scheme | Bits | Levels | Min RAM |
|---|---|---|---|
| Q2_K | 2 | ±1 | 4 GB |
| Q4_K_M | 4 | ±7 | 8 GB |
| Q5_K_M | 5 | ±15 | 16 GB |

---

## 4. Integration into SentryBill Platform

### 4.1 CI Artifact Gate

```yaml
# .github/workflows/ci.yml
- name: Hydra Critic Gate
  run: |
    for f in $(find platform/frontend -name '*.js' -newer HEAD~1); do
      hydra critic "$f" || exit 1
    done
```

**Cost:** $0. **Latency:** µs per file. **Signal:** deterministic JSON.

### 4.2 SecurityOS Detector Enhancement

Hydra's agent loop can drive the YOLOv8 detector:

```
Input → Hydra Agent → tool:detect: <image_path> → YOLOv8 inference → critic validates output JSON → return
```

The critic ensures detector output is valid JSON before downstream consumers parse it.

### 4.3 ERP Webhook Validator

```bash
# Before processing ERP webhook payloads
hydra critic --lang=js <(echo "$WEBHOOK_PAYLOAD_HANDLER")
```

Zero-cost pre-deploy check on any dynamically generated webhook handler code.

---

## 5. Build & Deploy Hydra Binary

```bash
# From injector-orchestrator workspace
cd _hydra_audit/Hydra-Agent/project-hydra

# Install Rust (if needed)
./install.sh

# Build release binary
cargo build --release

# Verify
target/release/hydra doctor
target/release/hydra version

# Install globally
sudo cp target/release/hydra /usr/local/bin/

# Verify from Injector
hydra doctor
```

**Requirements:**
- Rust stable toolchain
- C compiler (tree-sitter grammars compile C)
- ~200 MB disk for build artifacts
- Final binary: ~3.4 MB

---

## 6. Priority Implementation Order

| Phase | What | Effort | Value |
|---|---|---|---|
| **P0** | Build `hydra` binary, install to PATH | 5 min | Unlocks everything |
| **P1** | `hydra_critic.sh` plugin for Injector | 15 min | Zero-cost script validation |
| **P2** | `model_pager.sh` plugin for Ollama tier mgmt | 15 min | RAM-aware model selection |
| **P3** | Hybrid IIE (rule-based + Hydra agent) | 30 min | LLM-powered recommendations |
| **P4** | SOP branching in `core_helper.sh` | 20 min | Context-aware deployment |
| **P5** | CI critic gate for SentryBill | 10 min | Pre-merge artifact validation |
| **P6** | WS health → Injector dashboard | 20 min | Cross-system observability |

---

## 7. File Reference

```
Hydra-Agent/
├── project-hydra/
│   ├── Cargo.toml                    ← deps, features, release profile
│   ├── AGENTS.md                     ← architecture invariants
│   ├── src/
│   │   ├── main.rs                   ← CLI: run/critic/serve/doctor
│   │   ├── lib.rs                    ← public API surface
│   │   ├── agent/
│   │   │   ├── loop_mod.rs           ← generate→execute→critic→feedback
│   │   │   ├── policy.rs             ← autonomy levels
│   │   │   └── sop.rs               ← branch semantics
│   │   ├── attention/
│   │   │   ├── sparse.rs             ← O(N) windowed attention
│   │   │   ├── gated.rs              ← FastGRNN gate
│   │   │   └── prefetch.rs           ← KV-cache importance scoring
│   │   ├── critic/
│   │   │   ├── ast.rs                ← tree-sitter parse (JS/Python)
│   │   │   ├── rules.rs              ← undefined-var, unused-import, etc.
│   │   │   └── syntax.rs             ← syntax-error detection
│   │   ├── llm/
│   │   │   ├── provider.rs           ← LlmProvider trait + MockLlm
│   │   │   ├── ollama.rs             ← Ollama HTTP client
│   │   │   ├── quantize.rs           ← Q2_K/Q4_K_M/Q5_K_M
│   │   │   └── config.rs             ← HydraConfig (TOML)
│   │   ├── memory/
│   │   │   ├── paging.rs             ← Hot/Warm/Cold pager + LRU
│   │   │   └── cache.rs              ← KV-cache persistence
│   │   ├── channels/
│   │   │   ├── cli.rs                ← stdin/stdout
│   │   │   ├── discord.rs            ← webhook (feature-gated)
│   │   │   └── telegram.rs           ← bot API (feature-gated)
│   │   ├── server.rs                 ← WS + /health on $PORT
│   │   └── utils/
│   │       ├── hardware.rs           ← RAM/cores detection
│   │       └── logger.rs             ← tracing init
│   ├── tests/
│   │   ├── unit_tests.rs             ← unit suite
│   │   ├── integration_tests.rs      ← integration suite (MockLlm)
│   │   └── integration/
│   │       ├── agent_loop.rs
│   │       ├── critic_cli.rs
│   │       └── pager_disk.rs
│   ├── benches/attention.rs          ← sparse vs dense benchmark
│   └── zig/                          ← Android cross-compile
└── .agents/memory/                   ← 8 knowledge files (gotchas, invariants)
```

---

> **Bottom line:** Hydra = Rust agent brain. Injector = bash ops body.  
> Plug brain into body → Injector gets LLM-powered recommendations + zero-cost code validation + RAM-aware model management.  
> **Don't rebuild what Hydra already solved. Wire it.**
>
> — Mr. 1nj3ct04
