#!/usr/bin/env bash
# Injector Orchestrator - Terminal UI Engine
# DESIGN.md compliant — btop V10 inspired
# Author: Mr. 1nj3ct04

# ─── 256-Color Palette (DESIGN.md) ───────────────────────────────────────────
C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'
C_CYAN=$'\033[38;5;51m';   C_CYAN2=$'\033[38;5;45m'
C_GREEN=$'\033[38;5;82m';  C_GREEN2=$'\033[38;5;46m'
C_PURPLE=$'\033[38;5;135m';C_PURPLE2=$'\033[38;5;141m'
C_WHITE=$'\033[38;5;255m'; C_GREY=$'\033[38;5;240m'
C_GREY2=$'\033[38;5;245m'; C_YELLOW=$'\033[38;5;220m'
C_WARN=$'\033[38;5;220m';  C_DANGER=$'\033[38;5;196m'
C_SUCCESS=$'\033[38;5;82m';C_AI=$'\033[38;5;135m'
C_NC=$'\033[0m'

# ─── Ring Buffers ──────────────────────────────────────────────────────────────
declare -a CPU_HIST=()
declare -a RAM_HIST=()
declare -a RX_HIST=()
declare -a TX_HIST=()
HIST_LEN=50

hist_push() {
    local -n _arr=$1
    local val=$2
    _arr+=("$val")
    if [ "${#_arr[@]}" -gt "$HIST_LEN" ]; then
        _arr=("${_arr[@]:1}")
    fi
}

# ─── Sparkline ────────────────────────────────────────────────────────────────
SPARK_CHARS=(' ' '▁' '▂' '▃' '▄' '▅' '▆' '▇' '█')

sparkline_str() {
    # Usage: sparkline_str CPU_HIST width
    # Outputs via stdout — intentionally no ANSI here so caller wraps color
    local arr_name="$1"
    local width="${2:-36}"
    local -n _sa="$arr_name"
    local len="${#_sa[@]}"
    local out="" i v idx

    # determine start index so we show last `width` values
    local start=0
    (( len > width )) && start=$(( len - width ))

    # left-pad with spaces if not enough history
    local have=$(( len - start ))
    local pad=$(( width - have ))
    for (( i=0; i<pad; i++ )); do out+=' '; done

    for (( i=start; i<len; i++ )); do
        v="${_sa[$i]}"
        (( v < 0 ))   && v=0
        (( v > 100 )) && v=100
        idx=$(( v * 8 / 100 ))
        out+="${SPARK_CHARS[$idx]}"
    done
    printf '%s' "$out"
}

# ─── Progress Bar ─────────────────────────────────────────────────────────────
bar_str() {
    local pct=$1
    local width="${2:-28}"
    (( pct < 0 ))   && pct=0
    (( pct > 100 )) && pct=100
    local filled=$(( pct * width / 100 ))
    local empty=$(( width - filled ))

    local color
    if   (( pct >= 90 )); then color="$C_DANGER"
    elif (( pct >= 70 )); then color="$C_WARN"
    elif (( pct >= 45 )); then color="$C_CYAN2"
    else                       color="$C_SUCCESS"
    fi

    local b=""
    local i
    for (( i=0; i<filled; i++ )); do b+='█'; done
    # gradient transition char
    if (( filled < width && filled > 0 )); then b+='▓'; (( empty-- )) || true; fi
    for (( i=0; i<empty; i++ )); do b+='░'; done
    printf '%b%s%b %3d%%%b' "$color" "$b" "$C_GREY" "$pct" "$C_NC"
}

mini_bar_str() {
    local pct=$1
    local width="${2:-12}"
    (( pct < 0 ))   && pct=0
    (( pct > 100 )) && pct=100
    local filled=$(( pct * width / 100 ))
    local empty=$(( width - filled ))
    local color
    (( pct >= 85 )) && color="$C_DANGER" || { (( pct >= 60 )) && color="$C_WARN" || color="$C_SUCCESS"; }
    local b=""; local i
    for (( i=0; i<filled; i++ )); do b+='█'; done
    for (( i=0; i<empty; i++ )); do b+='░'; done
    printf '%b%s%b' "$color" "$b" "$C_NC"
}

# ─── Status Dot ───────────────────────────────────────────────────────────────
dot_str() {
    local state="$1" label="$2"
    if [[ "$state" == "active" ]]; then
        printf '%b● %s%b' "$C_SUCCESS" "$label" "$C_NC"
    else
        printf '%b○ %s%b' "$C_DANGER"  "$label" "$C_NC"
    fi
}

# ─── ANSI-aware visible length ────────────────────────────────────────────────
# Strips all common ANSI CSI/OSC sequences before measuring
vlen() {
    local s="$1"
    # strip ANSI escape sequences using a single sed invocation
    local plain
    plain=$(printf '%s' "$s" | sed -E 's/\x1B\[[0-9;?]*[A-Za-z]//g; s/\x1B[()][B012]//g; s/\x1B].*\x07//g')
    # approximate: emoji are 2 cols wide; count non-ASCII runs
    local byte_len="${#plain}"
    echo "$byte_len"
}

# ─── Box System (dynamic width) ───────────────────────────────────────────────
BOX_W=74
INNER_W=70   # BOX_W - 4

init_box_dims() {
    local cols
    cols=$(tput cols 2>/dev/null || echo 80)
    BOX_W=$(( cols < 78 ? cols : 76 ))
    # ensure even for border chars
    (( BOX_W % 2 != 0 )) && (( BOX_W-- ))
    INNER_W=$(( BOX_W - 4 ))
}

_hline() { printf '%0.s─' $(seq 1 "$1"); }

box_top_w() {
    local title="${1:-}"
    local w="${2:-$BOX_W}"
    local tlen; tlen=$(vlen "$title")
    local right=$(( w - tlen - 5 ))
    (( right < 0 )) && right=0
    printf '%b╭── %b%s%b %b%s%b╮%b' \
        "$C_CYAN" "$C_BOLD$C_CYAN2" "$title" "$C_NC" \
        "$C_CYAN" "$(_hline $right)" "$C_NC" "$C_NC"
}

box_bot_w() {
    local w="${1:-$BOX_W}"
    printf '%b╰%s╯%b' "$C_CYAN" "$(_hline $(( w - 2 )))" "$C_NC"
}

box_div_w() {
    local w="${1:-$BOX_W}"
    printf '%b├%s┤%b' "$C_CYAN" "$(_hline $(( w - 2 )))" "$C_NC"
}

box_row_w() {
    local content="$1"
    local w="${2:-$BOX_W}"
    local inner_w=$(( w - 4 ))
    local vl; vl=$(vlen "$content")
    local pad=$(( inner_w - vl ))
    (( pad < 0 )) && pad=0
    local spaces
    spaces=$(printf "%-${pad}s" "")
    printf '%b│ %b%s%s %b│%b' "$C_CYAN" "$C_NC" "$content" "$spaces" "$C_CYAN" "$C_NC"
}

# Compatibility fallbacks
box_top() { box_top_w "$1" "$BOX_W"; printf '\n'; }
box_bot() { box_bot_w "$BOX_W"; printf '\n'; }
box_div() { box_div_w "$BOX_W"; printf '\n'; }
box_row() { box_row_w "$1" "$BOX_W"; printf '\n'; }

# ─── Spinner & AI cycler ──────────────────────────────────────────────────────
SPIN_F=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
_SPIN_I=0
_spinner() { _SPIN_I=$(( (_SPIN_I + 1) % ${#SPIN_F[@]} )); printf '%s' "${SPIN_F[$_SPIN_I]}"; }

AI_RECS=("Initializing Intelligence Engine...")
_AI_IDX=0
_FRAME=0

load_ai_recs() {
    local f="${INJECTOR_DIR}/ai_state.json"
    AI_RECS=()
    if [[ -f "$f" ]]; then
        local line
        while IFS= read -r line; do
            [[ -n "$line" ]] && AI_RECS+=("$line")
        done < <(jq -r '.recommendations[]? // empty' "$f" 2>/dev/null || true)
    fi
    [[ "${#AI_RECS[@]}" -eq 0 ]] && AI_RECS=("System Healthy. No actions required.")
}

# ─── READ STATE HELPERS ───────────────────────────────────────────────────────
_jq() { jq -r "${1}" "${2}" 2>/dev/null || echo "${3:-0}"; }

# ─── FRAME RENDERER ───────────────────────────────────────────────────────────
draw_mission_control() {
    (( _FRAME++ ))
    init_box_dims

    # ── Load all state in optimized batches ───────────────────────
    local cpu=0 ram=0 disk=0
    local sf="${INJECTOR_DIR}/sys_state.json"
    if [[ -f "$sf" ]]; then
        eval "$(jq -r '"cpu="+(.cpu_pct|tostring)+" ram="+(.ram_pct|tostring)+" disk="+(.disk_pct|tostring)' "$sf" 2>/dev/null || true)"
    fi
    local ram_detail
    ram_detail=$(free -m 2>/dev/null | awk '/Mem/{printf "%dMB/%dMB", $3, $2}' || echo "N/A")

    local d_running=0 d_total=0 d_images=0
    local df="${INJECTOR_DIR}/docker_state.json"
    if [[ -f "$df" ]]; then
        eval "$(jq -r '"d_running="+(.running_containers|tostring)+" d_total="+(.total_containers|tostring)+" d_images="+(.total_images|tostring)' "$df" 2>/dev/null || true)"
    fi

    local s_nginx="inactive" s_redis="inactive" s_postgres="inactive"
    local s_pm2="inactive" s_ollama="inactive"
    local svf="${INJECTOR_DIR}/services_state.json"
    if [[ -f "$svf" ]]; then
        eval "$(jq -r '"s_nginx="+(.nginx // "inactive")+" s_redis="+(.redis // "inactive")+" s_postgres="+(.postgresql // "inactive")+" s_pm2="+(.pm2 // "inactive")+" s_ollama="+(.ollama // "inactive")' "$svf" 2>/dev/null || true)"
    fi

    local st_logs=0 st_models=0
    local stf="${INJECTOR_DIR}/storage_state.json"
    if [[ -f "$stf" ]]; then
        eval "$(jq -r '"st_logs="+(.logs_mb|tostring)+" st_models="+(.models_mb|tostring)' "$stf" 2>/dev/null || true)"
    fi

    local n_iface="N/A" n_rx=0 n_tx=0 n_ports=0
    local nf="${INJECTOR_DIR}/network_state.json"
    if [[ -f "$nf" ]]; then
        eval "$(jq -r '"n_iface="+(.iface // "N/A")+" n_rx="+(.rx_kbps|tostring)+" n_tx="+(.tx_kbps|tostring)+" n_ports="+(.open_ports|tostring)' "$nf" 2>/dev/null || true)"
    fi

    local sec_issues=0 sec_f2b="inactive" sec_ufw="inactive"
    local secf="${INJECTOR_DIR}/security_state.json"
    if [[ -f "$secf" ]]; then
        eval "$(jq -r '"sec_issues="+(.issues|tostring)+" sec_f2b="+(.fail2ban // "inactive")+" sec_ufw="+(.firewall // "inactive")' "$secf" 2>/dev/null || true)"
    fi

    # Push to ring buffers (bounded values)
    local rxp=$(( n_rx > 100 ? 100 : n_rx ))
    local txp=$(( n_tx > 100 ? 100 : n_tx ))
    hist_push CPU_HIST "$cpu"
    hist_push RAM_HIST "$ram"
    hist_push RX_HIST  "$rxp"
    hist_push TX_HIST  "$txp"

    # Cycle AI recs every 6 frames
    (( _FRAME % 6 == 0 )) && _AI_IDX=$(( (_AI_IDX + 1) % ${#AI_RECS[@]} ))
    local spin; spin=$(_spinner)
    local ts;   ts=$(date +'%H:%M:%S')

    local host;   host=$(hostname 2>/dev/null || echo "localhost")
    local kernel; kernel=$(uname -r 2>/dev/null | cut -d'-' -f1 || echo "Linux")
    local uptime; uptime=$(uptime -p 2>/dev/null | sed 's/up //' || echo "N/A")

    # Get terminal dimensions
    local cols; cols=$(tput cols 2>/dev/null || echo 80)
    local rows; rows=$(tput rows 2>/dev/null || echo 24)
    
    # Grid Layout Setup
    local side_by_side=false
    local LEFT_W RIGHT_W
    if (( cols >= 80 )); then
        side_by_side=true
        LEFT_W=$(( cols / 2 + 1 ))
        RIGHT_W=$(( cols - LEFT_W - 1 ))
    else
        LEFT_W=$cols
        RIGHT_W=$cols
    fi

    # Prevent layout scrolling/blinking on small terminals
    local min_rows=20
    if [ "$side_by_side" = false ]; then
        min_rows=36
    fi
    if (( rows < min_rows )); then
        local frame
        frame=$(
            printf '\033[1;1H'
            printf "${C_DANGER}${C_BOLD}⚠️  TERMINAL TOO SMALL${C_NC}\n"
            printf "Current: ${cols}x${rows}\n"
            printf "Required: 80x20 (side-by-side) or 80x36 (stacked)\n"
            printf "Please resize your terminal window."
        )
        printf '%s\033[J' "$frame"
        return
    fi

    local LW_INNER=$(( LEFT_W - 4 ))
    local RW_INNER=$(( RIGHT_W - 4 ))

    local L_LINES=()
    local R_LINES=()

    # ── Left Column Elements ──────────────────────────────────────
    # CPU
    local cpu_bar_w=$(( LW_INNER - 13 ))
    (( cpu_bar_w < 5 )) && cpu_bar_w=5
    local cpu_bar; cpu_bar=$(bar_str "$cpu" "$cpu_bar_w")
    local cpu_spark_w=$(( LW_INNER - 8 ))
    (( cpu_spark_w < 5 )) && cpu_spark_w=5
    local cpu_spark; cpu_spark=$(sparkline_str CPU_HIST "$cpu_spark_w")

    L_LINES+=("$(box_top_w "⚡ CPU" "$LEFT_W")")
    L_LINES+=("$(box_row_w "Usage   ${cpu_bar}" "$LEFT_W")")
    L_LINES+=("$(box_row_w "History ${C_CYAN2}${cpu_spark}${C_NC}" "$LEFT_W")")
    L_LINES+=("$(box_bot_w "$LEFT_W")")
    L_LINES+=("")

    # MEMORY & STORAGE
    local mem_bar_w=$(( LW_INNER - 13 ))
    (( mem_bar_w < 5 )) && mem_bar_w=5
    local ram_bar; ram_bar=$(bar_str "$ram" "$mem_bar_w")
    local disk_bar; disk_bar=$(bar_str "$disk" "$mem_bar_w")
    local ram_spark_w=$(( LW_INNER - 8 ))
    (( ram_spark_w < 5 )) && ram_spark_w=5
    local ram_spark; ram_spark=$(sparkline_str RAM_HIST "$ram_spark_w")

    L_LINES+=("$(box_top_w "🧠 MEMORY & STORAGE" "$LEFT_W")")
    L_LINES+=("$(box_row_w "RAM     ${ram_bar}" "$LEFT_W")")
    L_LINES+=("$(box_row_w "Disk    ${disk_bar}" "$LEFT_W")")
    L_LINES+=("$(box_row_w "History ${C_PURPLE2}${ram_spark}${C_NC}" "$LEFT_W")")
    L_LINES+=("$(box_bot_w "$LEFT_W")")
    L_LINES+=("")

    # NETWORK
    local net_spark_w=$(( (LW_INNER - 10) / 2 ))
    (( net_spark_w < 5 )) && net_spark_w=5
    local rx_spark; rx_spark=$(sparkline_str RX_HIST "$net_spark_w")
    local tx_spark; tx_spark=$(sparkline_str TX_HIST "$net_spark_w")
    local net_bar_w=$(( LW_INNER - 20 ))
    (( net_bar_w < 5 )) && net_bar_w=5
    local rx_bar; rx_bar=$(mini_bar_str "$rxp" "$net_bar_w")
    local tx_bar; tx_bar=$(mini_bar_str "$txp" "$net_bar_w")

    L_LINES+=("$(box_top_w "🌐 NETWORK [${n_iface}]" "$LEFT_W")")
    L_LINES+=("$(box_row_w "Rx   ${rx_bar} ${n_rx} KB/s" "$LEFT_W")")
    L_LINES+=("$(box_row_w "Tx   ${tx_bar} ${n_tx} KB/s" "$LEFT_W")")
    L_LINES+=("$(box_row_w "Down ${C_GREEN2}${rx_spark}${C_NC} Up ${C_WARN}${tx_spark}${C_NC}" "$LEFT_W")")
    L_LINES+=("$(box_bot_w "$LEFT_W")")

    # ── Right Column Elements ─────────────────────────────────────
    # SERVICES & DOCKER
    local d_bar_w=$(( RW_INNER - 15 ))
    (( d_bar_w < 5 )) && d_bar_w=5
    local d_pct=0
    (( d_total > 0 )) && d_pct=$(( d_running * 100 / d_total ))
    local d_bar; d_bar=$(mini_bar_str "$d_pct" "$d_bar_w")

    R_LINES+=("$(box_top_w "⚙️ SERVICES & DOCKER" "$RIGHT_W")")
    R_LINES+=("$(box_row_w "Docker  ${d_bar}  ${C_SUCCESS}${d_running}${C_NC}/${C_GREY}${d_total}${C_NC}" "$RIGHT_W")")
    
    local s_nginx_dot; s_nginx_dot=$(dot_str "$s_nginx" "Nginx")
    local s_redis_dot; s_redis_dot=$(dot_str "$s_redis" "Redis")
    local s_postgres_dot; s_postgres_dot=$(dot_str "$s_postgres" "Postgres")
    local s_pm2_dot; s_pm2_dot=$(dot_str "$s_pm2" "PM2")
    local s_ollama_dot; s_ollama_dot=$(dot_str "$s_ollama" "Ollama")

    R_LINES+=("$(box_row_w "${s_nginx_dot}   ${s_redis_dot}   ${s_postgres_dot}" "$RIGHT_W")")
    R_LINES+=("$(box_row_w "${s_pm2_dot}   ${s_ollama_dot}" "$RIGHT_W")")
    R_LINES+=("$(box_bot_w "$RIGHT_W")")
    R_LINES+=("")

    # SECURITY
    local sec_color="$C_SUCCESS"
    (( sec_issues > 0 )) && sec_color="$C_WARN"
    (( sec_issues > 3 )) && sec_color="$C_DANGER"

    R_LINES+=("$(box_top_w "🛡️ SECURITY" "$RIGHT_W")")
    R_LINES+=("$(box_row_w "Issues  ${sec_color}${sec_issues}${C_NC}" "$RIGHT_W")")
    R_LINES+=("$(box_row_w "$(dot_str "$sec_f2b" "Fail2Ban")   $(dot_str "$sec_ufw" "Firewall UFW")" "$RIGHT_W")")
    R_LINES+=("$(box_bot_w "$RIGHT_W")")
    R_LINES+=("")

    # AI ENGINE
    R_LINES+=("$(box_top_w "🧠 INTELLIGENCE ENGINE" "$RIGHT_W")")
    local raw_rec="${AI_RECS[$_AI_IDX]:-Analyzing...}"
    local chunk_w=$(( RW_INNER - 4 ))
    (( chunk_w < 10 )) && chunk_w=10
    local line_count=0
    while read -r line; do
        if [[ -n "$line" ]]; then
            R_LINES+=("$(box_row_w "${C_AI}💡 ${C_PURPLE2}${line}${C_NC}" "$RIGHT_W")")
            (( line_count++ ))
        fi
    done < <(echo "$raw_rec" | fold -s -w "$chunk_w")
    for (( i=line_count; i<3; i++ )); do
        R_LINES+=("$(box_row_w "" "$RIGHT_W")")
    done
    R_LINES+=("$(box_bot_w "$RIGHT_W")")

    # ── Render: merge columns and write atomically ───────────────
    local frame
    frame=$(
        printf '\033[1;1H'
        # Btop style top header
        printf " ${C_BOLD}${C_CYAN}☠️  INJECTOR MISSION CONTROL${C_NC}  ${C_GREY}│${C_NC}  Host: ${C_CYAN}${host}${C_NC}  ${C_GREY}│${C_NC}  Kernel: ${C_CYAN}${kernel}${C_NC}  ${C_GREY}│${C_NC}  Uptime: ${C_CYAN}${uptime}${C_NC}  ${C_GREY}│${C_NC}  ${C_YELLOW}${ts}${C_NC}\n\n"
        
        if [ "$side_by_side" = true ]; then
            local max_lines
            if [ "${#L_LINES[@]}" -gt "${#R_LINES[@]}" ]; then
                max_lines="${#L_LINES[@]}"
            else
                max_lines="${#R_LINES[@]}"
            fi

            for ((i=0; i<max_lines; i++)); do
                local l="${L_LINES[i]:-}"
                local r="${R_LINES[i]:-}"
                
                local lvl; lvl=$(vlen "$l")
                local rvl; rvl=$(vlen "$r")
                
                local lpad=$(( LEFT_W - lvl ))
                local rpad=$(( RIGHT_W - rvl ))
                
                local lspaces="" rspaces=""
                (( lpad > 0 )) && lspaces=$(printf "%-${lpad}s" "")
                (( rpad > 0 )) && rspaces=$(printf "%-${rpad}s" "")
                
                printf "%s%s %s%s\n" "$l" "$lspaces" "$r" "$rspaces"
            done
        else
            for line in "${L_LINES[@]}" "${R_LINES[@]}"; do
                printf "%s\n" "$line"
            done
        fi
        
        # Btop style footer
        printf "\n  ${C_BOLD}${C_YELLOW}q${C_NC} ${C_WHITE}Exit${C_NC}    ${C_BOLD}${C_YELLOW}a${C_NC} ${C_WHITE}Full Audit${C_NC}    ${C_BOLD}${C_YELLOW}r${C_NC} ${C_WHITE}AI Refresh${C_NC}    ${C_BOLD}${C_YELLOW}p${C_NC} ${C_WHITE}Plugins${C_NC}"
    )
    
    # Write atomically
    printf '%s\033[J' "$frame"
}

# ─── UI Event Loop ─────────────────────────────────────────────────────────────
start_ui_loop() {
    log_info "Activating Mission Control UI..."
    AI_RECS=(); load_ai_recs

    # Enter alternate screen buffer + hide cursor
    printf '\033[?1049h\033[?25l'
    clear

    # Restore on any exit
    trap 'printf "\033[?25h\033[?1049l"; tput cnorm 2>/dev/null || true; cleanup; exit 0' EXIT INT TERM

    local key=""
    while true; do
        draw_mission_control

        # Non-blocking key read (800ms)
        key=""
        IFS= read -r -s -t 0.8 -n 1 key 2>/dev/null || true

        case "${key}" in
            q|Q)
                break
                ;;
            a|A)
                printf '\033[?25h'
                clear
                if type run_full_audit >/dev/null 2>&1; then run_full_audit 2>/dev/null || true; fi
                printf '\n%b[Press Enter to return]%b ' "$C_CYAN" "$C_NC"
                read -r _ 2>/dev/null || true
                printf '\033[?25l'
                clear
                ;;
            r|R)
                if type ai_analyze_system >/dev/null 2>&1; then
                    ai_analyze_system 2>/dev/null || true
                fi
                load_ai_recs
                ;;
            p|P)
                printf '\033[?25h'
                clear
                printf '%b🔌 Loaded Plugins:%b\n' "$C_PURPLE" "$C_NC"
                if type plugin_list >/dev/null 2>&1; then plugin_list 2>/dev/null || true; fi
                printf '\n%b[Press Enter to return]%b ' "$C_CYAN" "$C_NC"
                read -r _ 2>/dev/null || true
                printf '\033[?25l'
                clear
                ;;
        esac
    done

    printf '\033[?25h\033[?1049l'
    tput cnorm 2>/dev/null || true
}
