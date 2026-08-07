#!/usr/bin/env bash
# Injector Orchestrator Plugin - Active Process Auditor

plugin_name() {
    echo "Active Process Auditor"
}

plugin_info() {
    echo "Identifies and displays top CPU/Memory consuming processes."
}

plugin_init() {
    log_info "Process Auditor plugin initialized."
    # Run once at startup
    plugin_collect
}

plugin_collect() {
    local audit_file="${INJECTOR_DIR}/process_audit_state.json"
    local top_proc
    # Get top 5 processes by CPU usage, format to JSON array safely
    if command -v jq >/dev/null 2>&1; then
        top_proc=$(ps -eo pid,%cpu,%mem,comm --sort=-%cpu | head -n 6 | tail -n 5 | jq -R -s -c 'split("\n")[:-1]')
        cat <<EOF > "$audit_file"
{
  "top_processes": $top_proc,
  "timestamp": $(date +'%s')
}
EOF
    fi
}
