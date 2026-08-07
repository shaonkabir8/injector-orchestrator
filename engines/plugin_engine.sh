#!/usr/bin/env bash
# Injector Orchestrator - Plugin Engine (Phase 13)
# Author: Mr. 1nj3ct04
# Plugin Contract: Each plugin is a sourced .sh file in engines/plugins/
# Must implement: plugin_name(), plugin_init(), plugin_collect(), plugin_info()

PLUGIN_DIR="${PWD}/engines/plugins"

load_all_plugins() {
    mkdir -p "$PLUGIN_DIR"
    log_info "Scanning for plugins in $PLUGIN_DIR..."
    
    local count=0
    for plugin_file in "${PLUGIN_DIR}"/*.sh; do
        [ -f "$plugin_file" ] || continue
        
        # shellcheck source=/dev/null
        source "$plugin_file"
        
        if type plugin_init >/dev/null 2>&1; then
            plugin_init
            log_info "Plugin loaded: $(basename "$plugin_file")"
            count=$((count + 1))
        else
            log_err "Invalid plugin (missing plugin_init): $(basename "$plugin_file")"
        fi
    done
    
    log_info "Plugin Engine: $count plugins loaded."
}

plugin_list() {
    local count=0
    for plugin_file in "${PLUGIN_DIR}"/*.sh; do
        [ -f "$plugin_file" ] || continue
        count=$((count + 1))
        echo -e "${C_CYAN}  🔌 $(basename "$plugin_file" .sh)${C_NC}"
    done
    [ "$count" -eq 0 ] && echo -e "${C_YELLOW}  No plugins installed.${C_NC}"
}

init_plugin_engine() {
    log_info "Initializing Plugin Engine..."
    load_all_plugins
}
