#!/usr/bin/env bash
# Injector Orchestrator - Entry Point
# Author: Mr. 1nj3ct04
# Philosophy: Don't Make Injector Bigger. Make Injector Wiser.

# -u: fail on unbound variables. Do NOT use -e here — engine telemetry
# commands (docker, systemctl, etc.) will legitimately return non-zero
# when services are absent. -e would silently kill the process.
set -uo pipefail

# Constants
VERSION="1.0.0"
INJECTOR_DIR="${HOME}/.injector"
LOG_DIR="${INJECTOR_DIR}/logs"
CORE_LOG="${LOG_DIR}/core.log"

# Colors
C_CYAN=$'\033[0;36m'
C_GREEN=$'\033[0;32m'
C_PURPLE=$'\033[0;35m'
C_RED=$'\033[0;31m'
C_YELLOW=$'\033[0;33m'
C_NC=$'\033[0m'

# Logger
log_info() { echo "[$(date +'%Y-%m-%dT%H:%M:%S%z')] [INFO] $1" >> "$CORE_LOG"; }
log_err()  { echo "[$(date +'%Y-%m-%dT%H:%M:%S%z')] [ERR]  $1" >> "$CORE_LOG"; }

# Print helpers
print_info()    { echo "${C_CYAN}[☠️ ] $1${C_NC}"; }
print_success() { echo "${C_GREEN}[✔] $1${C_NC}"; }
print_warn()    { echo "${C_YELLOW}[⚠️ ] $1${C_NC}"; }
print_err()     { echo "${C_RED}[🚨] $1${C_NC}"; }

sleep_delay=0.3

startup_animation() {
    clear
    echo "${C_PURPLE}"
    cat << "EOF"
      _____       _           _             
     |_   _|     (_)         | |            
       | |  _ __  _  ___  ___| |_ ___  _ __ 
       | | | '_ \| |/ _ \/ __| __/ _ \| '__|
      _| |_| | | | |  __/ (__| || (_) | |   
     |_____|_| |_| |\___|\___|\__\___/|_|   
                _/ |                        
               |__/                         
EOF
    echo "${C_NC}"
    
    print_info "Injecting Modules...."
    # Source all engines
    source "${PWD}/engines/core_helper.sh"
    # shellcheck source=engines/package_engine.sh
    source "${PWD}/engines/package_engine.sh"
    # shellcheck source=engines/configuration_engine.sh
    source "${PWD}/engines/configuration_engine.sh"
    # shellcheck source=engines/system_engine.sh
    source "${PWD}/engines/system_engine.sh"
    # shellcheck source=engines/docker_engine.sh
    source "${PWD}/engines/docker_engine.sh"
    # shellcheck source=engines/services_engine.sh
    source "${PWD}/engines/services_engine.sh"
    # shellcheck source=engines/storage_engine.sh
    source "${PWD}/engines/storage_engine.sh"
    # shellcheck source=engines/network_engine.sh
    source "${PWD}/engines/network_engine.sh"
    # shellcheck source=engines/security_engine.sh
    source "${PWD}/engines/security_engine.sh"
    # shellcheck source=engines/ai_engine.sh
    source "${PWD}/engines/ai_engine.sh"
    # shellcheck source=engines/audit_engine.sh
    source "${PWD}/engines/audit_engine.sh"
    # shellcheck source=engines/plugin_engine.sh
    source "${PWD}/engines/plugin_engine.sh"
    # UI last — depends on all engines
    # shellcheck source=engines/ui_engine.sh
    source "${PWD}/engines/ui_engine.sh"

    sleep $sleep_delay
    print_info "Checking Dependencies...."
    init_package_engine
    init_config_engine
    sleep $sleep_delay
    print_info "Loading AI Engines...."
    init_ai_engine
    sleep $sleep_delay
    print_info "Initializing Mission Control...."
    init_audit_engine
    init_system_engine
    init_docker_engine
    init_services_engine
    init_storage_engine
    init_network_engine
    init_security_engine
    init_plugin_engine
    sleep $sleep_delay
    print_info "Starting Monitoring Engines...."
    sleep $sleep_delay
    print_success "Injector Orchestrator Online."
    sleep 1
}

init_core() {
    mkdir -p "$LOG_DIR"
    touch "$CORE_LOG"
    log_info "Core init. Version: $VERSION"
}

cleanup() {
    log_info "Injector shutdown. Safe exit."
}
trap cleanup EXIT

main() {
    init_core
    
    # Argument handling (Easter Eggs per THE_INJECTOR.md)
    case "${1:-}" in
        --injector)
            print_info "Injector Mode Activated. ☠️"
            sleep 1
            ;;
        --coffee)
            echo -e "${C_GREEN}☕ Enjoy your coffee, Mr. 1nj3ct04.${C_NC}"
            exit 0
            ;;
        --whoami)
            echo -e "${C_PURPLE}Mr. 1nj3ct04 — Creator of Injector Orchestrator.${C_NC}"
            exit 0
            ;;
        --audit)
            init_core
            source "${PWD}/engines/package_engine.sh"
            source "${PWD}/engines/configuration_engine.sh"
            source "${PWD}/engines/system_engine.sh"
            source "${PWD}/engines/docker_engine.sh"
            source "${PWD}/engines/security_engine.sh"
            source "${PWD}/engines/network_engine.sh"
            source "${PWD}/engines/ai_engine.sh"
            source "${PWD}/engines/audit_engine.sh"
            init_audit_engine
            init_system_engine; init_docker_engine; init_security_engine
            init_network_engine; init_ai_engine
            sleep 2
            run_full_audit
            exit 0
            ;;
    esac
    
    startup_animation
    start_ui_loop
}

main "$@"
