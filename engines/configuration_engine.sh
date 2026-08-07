#!/usr/bin/env bash
# Injector Orchestrator - Configuration Engine (Phase 03)
# Author: Mr. 1nj3ct04

CONFIG_FILE="${INJECTOR_DIR}/config.json"
BACKUP_DIR="${INJECTOR_DIR}/backups"

init_config_engine() {
    log_info "Initializing Configuration Engine..."
    mkdir -p "$BACKUP_DIR"
    
    if [ ! -f "$CONFIG_FILE" ]; then
        print_info "Generating default configurations..."
        cat <<EOF > "$CONFIG_FILE"
{
  "theme": "injector",
  "safe_mode": true,
  "telemetry": false,
  "refresh_rate_ms": 1000,
  "ai_polling_enabled": false
}
EOF
        log_info "Default config created at $CONFIG_FILE"
    fi
}

config_get() {
    local key="$1"
    if [ -f "$CONFIG_FILE" ]; then
        jq -r ".\"$key\" // empty" "$CONFIG_FILE"
    fi
}

config_set() {
    local key="$1"
    local val="$2"
    
    if [ -f "$CONFIG_FILE" ]; then
        # Handle boolean and numeric values cleanly without quotes
        if [[ "$val" == "true" || "$val" == "false" || "$val" =~ ^[0-9]+$ ]]; then
            jq ".\"$key\" = $val" "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" && mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"
        else
            jq ".\"$key\" = \"$val\"" "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" && mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"
        fi
        log_info "Config set: $key = $val"
    fi
}

config_backup() {
    local ts
    ts=$(date +'%Y%m%d_%H%M%S')
    cp "$CONFIG_FILE" "${BACKUP_DIR}/config_${ts}.json"
    print_success "Configuration backed up to ${BACKUP_DIR}/config_${ts}.json"
    log_info "Config backed up."
}

config_restore() {
    local backup_file="$1"
    if [ -f "$backup_file" ]; then
        cp "$backup_file" "$CONFIG_FILE"
        print_success "Configuration restored from $backup_file"
        log_info "Config restored from $backup_file"
    else
        print_err "Backup file not found."
    fi
}
