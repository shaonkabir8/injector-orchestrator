#!/usr/bin/env bash
# Injector Orchestrator Plugin - Safe Disk Space Vacuum

plugin_name() {
    echo "Safe Disk Vacuum"
}

plugin_info() {
    echo "Identifies clearable disk caches, unused docker volumes, and log sizes."
}

plugin_init() {
    log_info "Safe Disk Vacuum plugin initialized."
    plugin_collect
}

plugin_collect() {
    local cleanup_file="${INJECTOR_DIR}/safe_cleanup_state.json"
    
    local docker_cache_mb=0
    if command -v docker >/dev/null 2>&1; then
        # Check volume size / unused volumes
        docker_cache_mb=$(docker system df --format "{{.Size}}" 2>/dev/null | head -n 1 | grep -o '[0-9]\+' || echo 0)
    fi

    local journal_size_mb=0
    if command -v journalctl >/dev/null 2>&1; then
        journal_size_mb=$(journalctl --disk-usage 2>/dev/null | grep -o '[0-9]\+\.[0-9]\+\s*[M|G]' | head -n 1 | tr -d ' ' || echo 0)
    fi

    cat <<EOF > "$cleanup_file"
{
  "docker_cache_mb": "${docker_cache_mb}",
  "journal_size": "${journal_size_mb}",
  "timestamp": $(date +'%s')
}
EOF
}
