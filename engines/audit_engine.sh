#!/usr/bin/env bash
# Injector Orchestrator - Audit Engine (Phase 12)
# Author: Mr. 1nj3ct04

AUDIT_LOG="${LOG_DIR}/audit.log"

audit_log_event() {
    local category="$1"
    local event="$2"
    echo "[$(date +'%Y-%m-%dT%H:%M:%S%z')] [AUDIT:${category}] ${event}" >> "$AUDIT_LOG"
}

run_full_audit() {
    local report_file="${LOG_DIR}/audit_report_$(date +'%Y%m%d_%H%M%S').md"
    
    {
        echo "# Injector Audit Report"
        echo "> Generated: $(date)"
        echo ""

        echo "## System Audit"
        if [ -f "${INJECTOR_DIR}/sys_state.json" ]; then
            local cpu ram disk
            cpu=$(jq -r '.cpu_pct' "${INJECTOR_DIR}/sys_state.json")
            ram=$(jq -r '.ram_pct' "${INJECTOR_DIR}/sys_state.json")
            disk=$(jq -r '.disk_pct' "${INJECTOR_DIR}/sys_state.json")
            echo "- CPU: ${cpu}%"
            echo "- RAM: ${ram}%"
            echo "- Disk: ${disk}%"
        fi

        echo ""
        echo "## Docker Audit"
        if [ -f "${INJECTOR_DIR}/docker_state.json" ]; then
            echo "- Running Containers: $(jq -r '.running_containers' "${INJECTOR_DIR}/docker_state.json")"
            echo "- Total Images: $(jq -r '.total_images' "${INJECTOR_DIR}/docker_state.json")"
        fi

        echo ""
        echo "## Security Audit"
        if [ -f "${INJECTOR_DIR}/security_state.json" ]; then
            echo "- Issues Found: $(jq -r '.issues' "${INJECTOR_DIR}/security_state.json")"
            echo "- Fail2Ban: $(jq -r '.fail2ban' "${INJECTOR_DIR}/security_state.json")"
            echo "- Firewall: $(jq -r '.firewall' "${INJECTOR_DIR}/security_state.json")"
        fi

        echo ""
        echo "## Network Audit"
        if [ -f "${INJECTOR_DIR}/network_state.json" ]; then
            echo "- Interface: $(jq -r '.iface' "${INJECTOR_DIR}/network_state.json")"
            echo "- RX: $(jq -r '.rx_kbps' "${INJECTOR_DIR}/network_state.json") KB/s"
            echo "- TX: $(jq -r '.tx_kbps' "${INJECTOR_DIR}/network_state.json") KB/s"
            echo "- Open Ports: $(jq -r '.open_ports' "${INJECTOR_DIR}/network_state.json")"
        fi

        echo ""
        echo "## AI Recommendations"
        if [ -f "${INJECTOR_DIR}/ai_state.json" ]; then
            jq -r '.recommendations[]' "${INJECTOR_DIR}/ai_state.json" | while IFS= read -r rec; do
                echo "- $rec"
            done
        fi
    } > "$report_file"

    print_success "Audit Report saved: $report_file"
    audit_log_event "AUDIT" "Full audit report generated at $report_file"
}

init_audit_engine() {
    log_info "Initializing Audit Engine..."
    mkdir -p "$LOG_DIR"
    touch "$AUDIT_LOG"
    audit_log_event "SYSTEM" "Injector Orchestrator started."
}
