#!/usr/bin/env bash
# Injector Orchestrator - Plugin Engine (Phase 13 - V3 Compliant)
# Author: Mr. 1nj3ct04

PLUGIN_DIR="${PWD}/engines/plugins"

plugin_run_all_reports() {
    for plugin_file in "${PLUGIN_DIR}"/*.sh; do
        [ -f "$plugin_file" ] || continue
        # Run in subshell to avoid function collision in parent scope
        (
            source "$plugin_file"
            if type plugin_report >/dev/null 2>&1; then
                plugin_report
            fi
        )
    done
}

_plugins_poll_loop() {
    while true; do
        plugin_run_all_reports >/dev/null 2>&1
        sleep 10
    done
}

load_all_plugins() {
    mkdir -p "$PLUGIN_DIR"
    log_info "Scanning for plugins in $PLUGIN_DIR..."
    
    local count=0
    for plugin_file in "${PLUGIN_DIR}"/*.sh; do
        [ -f "$plugin_file" ] || continue
        
        # Verify V3 compliance (mandatory hooks check in subshell)
        local compliant
        compliant=$( (
            source "$plugin_file"
            if type plugin_name >/dev/null 2>&1 && \
               type plugin_health >/dev/null 2>&1 && \
               type plugin_audit >/dev/null 2>&1 && \
               type plugin_report >/dev/null 2>&1; then
                echo "yes"
            else
                echo "no"
            fi
        ) )

        if [ "$compliant" = "yes" ]; then
            # Load (init) in subshell to isolate side effects
            (
                source "$plugin_file"
                plugin_init
            )
            log_info "Plugin loaded and verified: $(basename "$plugin_file")"
            count=$((count + 1))
        else
            log_err "Non-compliant plugin rejected: $(basename "$plugin_file")"
        fi
    done
    
    log_info "Plugin Engine: $count plugins loaded."
}

plugin_list() {
    local count=0
    for plugin_file in "${PLUGIN_DIR}"/*.sh; do
        [ -f "$plugin_file" ] || continue
        count=$((count + 1))
        local name
        name=$( (source "$plugin_file"; plugin_name) )
        local info
        info=$( (source "$plugin_file"; plugin_info) )
        local health
        health=$( (source "$plugin_file"; plugin_health) )
        echo -e "${C_CYAN}  🔌 $name ($health)${C_NC} - $info"
    done
    [ "$count" -eq 0 ] && echo -e "${C_YELLOW}  No plugins installed.${C_NC}"
}

init_plugin_engine() {
    log_info "Initializing Plugin Engine..."
    load_all_plugins
    _plugins_poll_loop &
}
