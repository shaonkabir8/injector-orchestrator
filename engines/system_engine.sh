#!/usr/bin/env bash
# Injector Orchestrator - System Engine (Phase 04) — Async CPU polling
# Author: Mr. 1nj3ct04

# CPU polling runs in a persistent background loop.
# It writes to sys_state.json every second — no sleep in the render path.
_sys_cpu_poll_loop() {
    while true; do
        local cpu user nice system idle iowait irq softirq steal guest guest_nice
        read -r cpu user nice system idle iowait irq softirq steal guest guest_nice < /proc/stat
        local p_idle=$(( idle + iowait ))
        local p_total=$(( user + nice + system + idle + iowait + irq + softirq + steal ))
        sleep 1
        read -r cpu user nice system idle iowait irq softirq steal guest guest_nice < /proc/stat
        local n_idle=$(( idle + iowait ))
        local n_total=$(( user + nice + system + idle + iowait + irq + softirq + steal ))
        local diff_idle=$(( n_idle - p_idle ))
        local diff_total=$(( n_total - p_total ))
        local cpu_pct=0
        [ "$diff_total" -gt 0 ] && cpu_pct=$(( 100 * (diff_total - diff_idle) / diff_total ))

        local ram_pct
        ram_pct=$(free | awk '/Mem/ {printf("%.0f", $3/$2 * 100.0)}')
        local disk_pct
        disk_pct=$(df / | awk 'NR==2 {gsub(/%/,"",$5); print $5}')

        local status="VERIFIED"
        [ -z "$cpu_pct" ] && status="UNKNOWN"
        cat > "${INJECTOR_DIR}/sys_state.json" <<EOF
{
  "status": "$status",
  "cpu_pct": $cpu_pct,
  "ram_pct": ${ram_pct:-0},
  "disk_pct": ${disk_pct:-0},
  "timestamp": $(date +'%s')
}
EOF
    done
}

sys_collect_telemetry() {
    # No-op: data is collected by the background poller.
    # Called from ui_engine for compatibility — just returns immediately.
    :
}

init_system_engine() {
    log_info "Initializing System Engine (async poller)..."
    # Prime the state file once synchronously so UI has data on first frame
    local ram_pct
    ram_pct=$(free | awk '/Mem/ {printf("%.0f", $3/$2 * 100.0)}')
    local disk_pct
    disk_pct=$(df / | awk 'NR==2 {gsub(/%/,"",$5); print $5}')
    cat > "${INJECTOR_DIR}/sys_state.json" <<EOF
{
  "status": "VERIFIED",
  "cpu_pct": 0,
  "ram_pct": ${ram_pct:-0},
  "disk_pct": ${disk_pct:-0},
  "timestamp": $(date +'%s')
}
EOF
    # Launch background poller (killed when parent shell exits via job control)
    _sys_cpu_poll_loop &
    SYS_POLL_PID=$!
    log_info "System poller PID: $SYS_POLL_PID"
}
