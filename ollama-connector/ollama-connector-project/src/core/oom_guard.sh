#!/usr/bin/env bash
#===============================================================
# oom_guard.sh – Out-of-Memory Guard
# Monitors RAM usage and triggers model switch or checkpoint save
#===============================================================

OOM_THRESHOLD="${OOM_THRESHOLD:-85}"

check_oom() {
    local ram_total ram_used ram_percent
    ram_total=$(free -m | awk '/^Mem:/{print $2}')
    ram_used=$(free -m  | awk '/^Mem:/{print $3}')
    ram_percent=$((ram_used * 100 / ram_total))

    log CHECK "RAM: ${ram_percent}% (${ram_used}MB / ${ram_total}MB)"

    if [ "$ram_percent" -ge "$OOM_THRESHOLD" ]; then
        log WARN "RAM usage critical: ${ram_percent}% >= ${OOM_THRESHOLD}%"

        # Try switching to fallback model
        if [ "${OLLAMA_MODEL_DEFAULT:-}" != "${OLLAMA_MODEL_FALLBACK:-}" ]; then
            log WARN "Switching to fallback model: $OLLAMA_MODEL_FALLBACK"
            OLLAMA_MODEL_DEFAULT="$OLLAMA_MODEL_FALLBACK"
            return 0
        fi

        # Last resort: save checkpoint and abort
        if [ -n "${ITERATION:-}" ] && [ -n "${code:-}" ]; then
            save_checkpoint "$ITERATION" "${code:-}" "${tests:-}" "${MESSAGES:-[]}"
        fi
        send_notification "OOM guard triggered at iteration ${ITERATION:-0}" "ERROR"
        return 1
    fi

    return 0
}

monitor_oom_background() {
    while true; do
        local ram_total ram_used ram_percent
        ram_total=$(free -m | awk '/^Mem:/{print $2}')
        ram_used=$(free -m  | awk '/^Mem:/{print $3}')
        ram_percent=$((ram_used * 100 / ram_total))

        if [ "$ram_percent" -ge "$OOM_THRESHOLD" ]; then
            log WARN "Background OOM monitor: RAM at ${ram_percent}%"
            send_notification "RAM usage high: ${ram_percent}%" "WARN"
        fi

        sleep "${METRICS_INTERVAL:-5}"
    done
}
