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
  "status": "VERIFIED",
  "timestamp": $(date +'%s'),
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
    local risk="MEDIUM"
    [[ "$action" == "stop" ]] && risk="HIGH"
    
    local cmd="sudo systemctl $action $service"
    if ! command -v systemctl >/dev/null 2>&1; then
        if [[ "$action" == "stop" ]]; then
            cmd="pkill -f $service"
        else
            cmd="log_err 'Cannot start without systemctl'"
        fi
    fi
    
    safe_execute "$cmd" "$risk" "Service $service $action"
}
