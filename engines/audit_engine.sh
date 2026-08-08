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
            local status cpu ram disk
            status=$(jq -r '.status // "UNKNOWN"' "${INJECTOR_DIR}/sys_state.json")
            cpu=$(jq -r '.cpu_pct' "${INJECTOR_DIR}/sys_state.json")
            ram=$(jq -r '.ram_pct' "${INJECTOR_DIR}/sys_state.json")
            disk=$(jq -r '.disk_pct' "${INJECTOR_DIR}/sys_state.json")
            echo "- Status: ${status}"
            echo "- CPU: ${cpu}%"
            echo "- RAM: ${ram}%"
            echo "- Disk: ${disk}%"
        fi

        echo ""
        echo "## Docker Audit"
        if [ -f "${INJECTOR_DIR}/docker_state.json" ]; then
            local status run_c tot_c
            status=$(jq -r '.status // "UNKNOWN"' "${INJECTOR_DIR}/docker_state.json")
            run_c=$(jq -r '.running_containers' "${INJECTOR_DIR}/docker_state.json")
            tot_c=$(jq -r '.total_containers' "${INJECTOR_DIR}/docker_state.json")
            echo "- Status: ${status}"
            echo "- Running Containers: ${run_c}"
            echo "- Total Containers: ${tot_c}"
        fi

        echo ""
        echo "## Security Audit"
        if [ -f "${INJECTOR_DIR}/security_state.json" ]; then
            local status issues f2b ufw
            status=$(jq -r '.status // "UNKNOWN"' "${INJECTOR_DIR}/security_state.json")
            issues=$(jq -r '.issues' "${INJECTOR_DIR}/security_state.json")
            f2b=$(jq -r '.fail2ban' "${INJECTOR_DIR}/security_state.json")
            ufw=$(jq -r '.firewall' "${INJECTOR_DIR}/security_state.json")
            echo "- Status: ${status}"
            echo "- Issues Found: ${issues}"
            echo "- Fail2Ban: ${f2b}"
            echo "- Firewall: ${ufw}"
        fi

        echo ""
        echo "## Network Audit"
        if [ -f "${INJECTOR_DIR}/network_state.json" ]; then
            local status iface rx tx ports
            status=$(jq -r '.status // "UNKNOWN"' "${INJECTOR_DIR}/network_state.json")
            iface=$(jq -r '.iface' "${INJECTOR_DIR}/network_state.json")
            rx=$(jq -r '.rx_kbps' "${INJECTOR_DIR}/network_state.json")
            tx=$(jq -r '.tx_kbps' "${INJECTOR_DIR}/network_state.json")
            ports=$(jq -r '.open_ports' "${INJECTOR_DIR}/network_state.json")
            echo "- Status: ${status}"
            echo "- Interface: ${iface}"
            echo "- RX: ${rx} KB/s"
            echo "- TX: ${tx} KB/s"
            echo "- Open Ports: ${ports}"
        fi

        echo ""
        echo "## AI Recommendations"
        if [ -f "${INJECTOR_DIR}/ai_state.json" ]; then
            jq -r '.recommendations[]' "${INJECTOR_DIR}/ai_state.json" | while IFS= read -r rec; do
                echo "- $rec"
            done
        fi

        echo ""
        echo "## Active Plugins Audit"
        for pf in "${INJECTOR_DIR}"/plugin_*.json; do
            [ -f "$pf" ] || continue
            local p_name p_stat p_time
            p_name=$(jq -r '.plugin // "unknown"' "$pf")
            p_stat=$(jq -r '.status // "UNKNOWN"' "$pf")
            p_time=$(jq -r '.timestamp // 0' "$pf")
            echo "- Plugin: ${p_name} | Status: ${p_stat} | Updated: ${p_time}"
        done
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
