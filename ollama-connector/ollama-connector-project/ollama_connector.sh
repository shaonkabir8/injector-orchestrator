#!/usr/bin/env bash
#===============================================================
# Tool:    Ollama Connector ☠️
# Version: 1.0.9
# Author:  Mr. 1nj3ct04 ☠️
# Tagline: Write Yourselfer, Injector
# License: MIT
#===============================================================

set -euo pipefail
IFS=$'\n\t'

VERSION="1.0.9"
TOOL_DIR="${HOME}/.ollama_connector"
mkdir -p "$TOOL_DIR"/{bin,logs,config,data,checkpoints,extensions,web,dashboard}

LOG_FILE="$TOOL_DIR/logs/connector.log"
CONFIG_FILE="$TOOL_DIR/config/settings.conf"
METRICS_FILE="$TOOL_DIR/data/metrics.json"
CHECKPOINT_DIR="$TOOL_DIR/checkpoints"
WEB_DIR="$TOOL_DIR/web"
PID_FILE="$TOOL_DIR/connector.pid"

reset="\033[0m"; bold="\033[1m"; dim="\033[2m"; italic="\033[3m"
neon_blue="\033[38;5;39m"; neon_cyan="\033[38;5;51m"; neon_green="\033[38;5;82m"
neon_magenta="\033[38;5;201m"; neon_yellow="\033[38;5;226m"; neon_orange="\033[38;5;208m"
neon_red="\033[38;5;196m"; neon_white="\033[38;5;231m"; neon_gray="\033[38;5;240m"
neon_pink="\033[38;5;205m"; bg_deep="\033[48;5;233m"

show_logo() {
    clear
    echo -e "${bg_deep}${neon_cyan}"
    cat << 'EOF'
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║   ██████╗ ██╗     ██╗      █████╗ ███╗   ███╗ █████╗            ║
║   ██╔══██╗██║     ██║     ██╔══██╗████╗ ████║██╔══██╗           ║
║   ██████╔╝██║     ██║     ███████║██╔████╔██║███████║           ║
║   ██╔═══╝ ██║     ██║     ██╔══██║██║╚██╔╝██║██╔══██║           ║
║   ██║     ███████╗███████╗██║  ██║██║ ╚═╝ ██║██║  ██║           ║
║   ╚═╝     ╚══════╝╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝           ║
║                                                                   ║
║   ╔═══════════════════════════════════════════════════════════╗   ║
║   ║  O L L A M A   C O N N E C T O R  ☠️                     ║   ║
║   ║  Author : Mr. 1nj3ct04 ☠️                                ║   ║
║   ║  ✍  Write Yourselfer, Injector                           ║   ║
EOF
    echo -e "║   ║  v${VERSION}                                                     ║   ║"
    echo -e "║   ╚═══════════════════════════════════════════════════════════╝   ║"
    echo -e "║                                                                   ║"
    echo -e "╚═══════════════════════════════════════════════════════════════════╝"
    echo -e "${reset}"
}

log() {
    local level="$1"; local msg="$2"
    local timestamp; timestamp=$(date +"%H:%M:%S")
    local color=""
    case "$level" in
        INFO)    color="$neon_blue" ;;
        SUCCESS) color="$neon_green" ;;
        WARN)    color="$neon_orange" ;;
        ERROR)   color="$neon_red" ;;
        STEP)    color="$neon_magenta" ;;
        CHECK)   color="$neon_pink" ;;
        *)       color="$neon_white" ;;
    esac
    echo -e "${dim}[${color}${timestamp}${dim}]${reset} ${color}${level}${reset} → $msg"
    echo "[$timestamp] [$level] $msg" >> "$LOG_FILE"
}

spinner() {
    local pid="$1"; local msg="$2"
    local spin='⣾⣽⣻⢿⡿⣟⣯⣷'
    local i=0
    while kill -0 "$pid" 2>/dev/null; do
        printf "\r${neon_cyan}${spin:$((i % 8)):1}${reset} ${bold}${msg}${reset}"
        ((i++))
        sleep 0.08
    done
    printf "\r${neon_green}✔${reset} ${bold}${msg}${reset} ${dim}[DONE]${reset}\n"
}

load_config() {
    if [ ! -f "$CONFIG_FILE" ]; then
        cat > "$CONFIG_FILE" << 'CONF'
OLLAMA_MODEL_DEFAULT="qwen2.5:7b"
OLLAMA_MODEL_FALLBACK="deepseek-r1:8b"
CURSOR_AUTO_START="true"
LOG_LEVEL="INFO"
THEME="dark"
AUTO_METRICS="true"
METRICS_INTERVAL="5"
MAX_ITERATIONS="50"
GIT_AUTO_COMMIT="true"
ENABLE_NOTIFICATIONS="true"
CONF
    fi
    # shellcheck source=/dev/null
    source "$CONFIG_FILE"
}

load_modules() {
    local src_dir
    src_dir="$(dirname "$0")/src/core"
    if [ -d "$src_dir" ]; then
        for module in "$src_dir"/*.sh; do
            # shellcheck source=/dev/null
            source "$module"
        done
        log INFO "Core modules loaded."
    fi
}

load_extensions() {
    local ext_dir="$TOOL_DIR/extensions"
    if [ -d "$ext_dir" ]; then
        for ext in "$ext_dir"/*.ext; do
            [ -f "$ext" ] || continue
            # shellcheck source=/dev/null
            source "$ext"
        done
    fi
}

clean_exit() {
    log INFO "Shutting down Ollama Connector..."
    rm -f "$PID_FILE"
    exit 0
}

show_help() {
    echo -e "${neon_cyan}Usage:${reset} ./ollama_connector.sh [OPTIONS]"
    echo ""
    echo -e "${neon_yellow}Options:${reset}"
    echo -e "  ${neon_cyan}--start${reset}              Start the full agentic loop"
    echo -e "  ${neon_cyan}--resume${reset}             Resume from last checkpoint"
    echo -e "  ${neon_cyan}--dashboard${reset}          Start web dashboard on port 3000"
    echo -e "  ${neon_cyan}--parallel \"<prompt>\"${reset} Run models in parallel"
    echo -e "  ${neon_cyan}--ide${reset}                Full IDE integration"
    echo -e "  ${neon_cyan}--help${reset}               Show this help"
    echo ""
}

main_menu() {
    while true; do
        show_logo
        echo -e "${neon_cyan}┌─────────────────────────────────────────────────────────────────────┐${reset}"
        echo -e "${neon_cyan}│${reset}  ${neon_white}MAIN MENU${reset}                                                       ${neon_cyan}│${reset}"
        echo -e "${neon_cyan}├─────────────────────────────────────────────────────────────────────┤${reset}"
        echo -e "${neon_cyan}│${reset}                                                                   ${neon_cyan}│${reset}"
        echo -e "${neon_cyan}│${reset}  ${neon_cyan}[1]${reset} ${bold}Run Full Agentic Loop${reset}    ${dim}Start complete automation${reset}        ${neon_cyan}│${reset}"
        echo -e "${neon_cyan}│${reset}  ${neon_cyan}[2]${reset} ${bold}Resume from Checkpoint${reset}   ${dim}Continue from last save${reset}          ${neon_cyan}│${reset}"
        echo -e "${neon_cyan}│${reset}  ${neon_cyan}[3]${reset} ${bold}Web Dashboard${reset}            ${dim}Open http://localhost:3000${reset}        ${neon_cyan}│${reset}"
        echo -e "${neon_cyan}│${reset}  ${neon_cyan}[4]${reset} ${bold}Parallel Models${reset}          ${dim}Run models concurrently${reset}           ${neon_cyan}│${reset}"
        echo -e "${neon_cyan}│${reset}  ${neon_cyan}[5]${reset} ${bold}IDE Integration${reset}          ${dim}Cursor + VSCode setup${reset}             ${neon_cyan}│${reset}"
        echo -e "${neon_cyan}│${reset}  ${neon_cyan}[6]${reset} ${bold}Configure${reset}                ${dim}Change settings${reset}                   ${neon_cyan}│${reset}"
        echo -e "${neon_cyan}│${reset}  ${neon_cyan}[7]${reset} ${bold}Help${reset}                     ${dim}Full documentation${reset}                ${neon_cyan}│${reset}"
        echo -e "${neon_cyan}│${reset}  ${neon_cyan}[q]${reset} ${bold}Quit${reset}                     ${dim}Exit${reset}                               ${neon_cyan}│${reset}"
        echo -e "${neon_cyan}│${reset}                                                                   ${neon_cyan}│${reset}"
        echo -e "${neon_cyan}└─────────────────────────────────────────────────────────────────────┘${reset}"
        echo ""
        read -r -p "$(echo -e "${neon_yellow}Select option: ${reset}")" choice
        case "$choice" in
            1) run_agentic_loop ;;
            2) resume_from_checkpoint ;;
            3) start_web_dashboard ;;
            4) run_parallel_models ;;
            5) ide_integration ;;
            6) "${EDITOR:-nano}" "$CONFIG_FILE" ;;
            7) show_help; read -r -p "Press Enter to continue..." ;;
            q|Q) clean_exit ;;
            *) echo -e "${neon_red}Invalid option${reset}"; sleep 1 ;;
        esac
    done
}

main() {
    touch "$LOG_FILE"
    if [ ! -f "$METRICS_FILE" ]; then echo '[]' > "$METRICS_FILE"; fi
    load_config
    load_modules
    load_extensions
    main_menu
}

if [[ $# -gt 0 ]]; then
    load_config
    load_modules
    case "$1" in
        --start)     run_agentic_loop; exit 0 ;;
        --resume)    resume_from_checkpoint; exit 0 ;;
        --dashboard) start_web_dashboard; exit 0 ;;
        --parallel)  shift; run_parallel_models "$*"; exit 0 ;;
        --ide)       ide_integration; exit 0 ;;
        --help)      show_help; exit 0 ;;
        *)           echo "Unknown flag: $1"; exit 1 ;;
    esac
fi

trap clean_exit INT TERM
main "$@"
