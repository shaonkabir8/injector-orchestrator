#!/usr/bin/env bash
# Injector Orchestrator - Services Engine (Phase 07)
# Author: Mr. 1nj3ct04

SERVICES_LIST=("nginx" "redis" "postgresql" "pm2" "ollama")

_services_poll_loop() {
    while true; do
        local services_json=""
        local first=true

        for svc in "${SERVICES_LIST[@]}"; do
            local status="inactive"
            
            # Check systemd status
            if command -v systemctl >/dev/null 2>&1; then
                if systemctl is-active "$svc" >/dev/null 2>&1; then
                    status="active"
                fi
            fi
            
            # Fallback check if it's running via process check (e.g., pm2 or ollama as user binary)
            if [ "$status" != "active" ]; then
                if pgrep -f "$svc" >/dev/null 2>&1; then
                    status="active"
                fi
            fi

            if [ "$first" = true ]; then
                first=false
            else
                services_json+=", "
            fi
            services_json+="\"$svc\": \"$status\""
        done

        cat <<EOF > "${INJECTOR_DIR}/services_state.json"
{
  $services_json
}
EOF
        sleep 3
    done
}

services_collect_telemetry() {
    :
}

init_services_engine() {
    log_info "Initializing Services Engine..."
    _services_poll_loop &
}

service_control() {
    local action="$1"
    local service="$2"
    
    print_warn "Control Action: $action on $service"
    read -r -p "Confirm action? (y/N) " confirm
    if [[ "$confirm" =~ ^[Yy]$ ]]; then
        if command -v systemctl >/dev/null 2>&1; then
            sudo systemctl "$action" "$service"
            print_success "Service $service $action command sent."
            log_info "Service control: $action $service executed."
        else
            print_err "systemctl not available."
        fi
    else
        print_info "Action aborted."
    fi
}
