#!/usr/bin/env bash
# Injector Orchestrator Plugin - Active Process Auditor (V3 Compliant)

plugin_name() {
    echo "Active Process Auditor"
}

plugin_info() {
    echo "Identifies and displays top CPU/Memory consuming processes."
}

plugin_docs() {
    echo "Active Process Auditor: run plugin_report to scan active processes."
}

plugin_install() {
    return 0
}

plugin_remove() {
    return 0
}

plugin_health() {
    if command -v ps >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
        echo "VERIFIED"
    else
        echo "NOT VERIFIED"
    fi
}

plugin_audit() {
    echo '{"open_ports": [], "secrets_exposed": false}'
}

plugin_report() {
    local health; health=$(plugin_health)
    local audit; audit=$(plugin_audit)
    local top_proc="[]"
    
    if [[ "$health" == "VERIFIED" ]]; then
        top_proc=$(ps -eo pid,%cpu,%mem,comm --sort=-%cpu | head -n 6 | tail -n 5 | jq -R -s -c 'split("\n")[:-1]' 2>/dev/null || echo "[]")
    fi

    cat <<EOF > "${INJECTOR_DIR}/plugin_process_audit.json"
{
  "plugin": "process_audit",
  "status": "$health",
  "timestamp": $(date +'%s'),
  "services": {
    "top_processes": $top_proc
  },
  "recommendations": [],
  "audit": $audit
}
EOF
}

# Alias for backwards compatibility
plugin_collect() {
    plugin_report
}

plugin_init() {
    log_info "Process Auditor plugin initialized."
    plugin_report
}
