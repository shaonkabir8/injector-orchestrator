#!/usr/bin/env bash
# Injector Orchestrator - Docker Engine (Phase 06)
# Author: Mr. 1nj3ct04

_docker_poll_loop() {
    while true; do
        local running_containers=0
        local total_containers=0
        local total_images=0
        
        if command -v docker >/dev/null 2>&1; then
            # wc -l padded with xargs to trim whitespace
            running_containers=$(docker ps -q 2>/dev/null | wc -l | xargs)
            total_containers=$(docker ps -aq 2>/dev/null | wc -l | xargs)
            total_images=$(docker images -q 2>/dev/null | wc -l | xargs)
        fi

        cat <<EOF > "${INJECTOR_DIR}/docker_state.json"
{
  "running_containers": $running_containers,
  "total_containers": $total_containers,
  "total_images": $total_images,
  "timestamp": $(date +'%s')
}
EOF
        sleep 3
    done
}

docker_collect_telemetry() {
    :
}

init_docker_engine() {
    log_info "Initializing Docker Engine..."
    if command -v docker >/dev/null 2>&1; then
        _docker_poll_loop &
    else
        log_err "Docker is not installed or accessible."
    fi
}

docker_safe_cleanup() {
    print_warn "Safe Cleanup Available for Docker."
    read -r -p "Are you sure you want to prune unused resources? (y/N) " confirm
    if [[ "$confirm" =~ ^[Yy]$ ]]; then
        print_info "Cleaning up unused docker resources..."
        docker system prune -f >/dev/null 2>&1
        print_success "Docker Cleanup Complete."
        log_info "Docker system prune executed by user."
    else
        print_info "Cleanup aborted."
    fi
}
