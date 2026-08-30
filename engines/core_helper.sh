#!/usr/bin/env bash
# Injector Core Helper - Risk-Adaptive Execution & Truth Engine
# Author: Mr. 1nj3ct04

# Risk Levels: LOW, MEDIUM, HIGH
# Truth States: VERIFIED, PARTIALLY VERIFIED, NOT VERIFIED, ASSUMED, UNKNOWN

# Verify evidence for a state
probe_truth() {
    local cmd="$1"
    local fallback_state="${2:-UNKNOWN}"
    
    if eval "$cmd" >/dev/null 2>&1; then
        echo "VERIFIED"
    else
        echo "$fallback_state"
    fi
}

# Execute action based on risk level
safe_execute() {
    local cmd="$1"
    local risk="${2:-LOW}"
    local desc="${3:-Action}"
    local backup_cmd="${4:-}"
    
    log_info "safe_execute: Risk=$risk Cmd='$cmd' Desc='$desc'"
    
    case "$risk" in
        LOW)
            # Flow: OBSERVE -> ACT -> VERIFY
            eval "$cmd"
            local ret=$?
            [ $ret -eq 0 ] && log_info "LOW Risk execution OK: $desc" || log_err "LOW Risk execution FAIL: $desc"
            return $ret
            ;;
        MEDIUM)
            # Flow: OBSERVE -> CLASSIFY -> ACT -> VERIFY -> REPORT
            print_info "Executing Medium Risk: $desc"
            eval "$cmd"
            local ret=$?
            if [ $ret -eq 0 ]; then
                print_success "Success: $desc"
                log_info "MEDIUM Risk execution OK: $desc"
            else
                print_err "Failed: $desc"
                log_err "MEDIUM Risk execution FAIL: $desc"
            fi
            return $ret
            ;;
        HIGH)
            # Flow: OBSERVE -> CLASSIFY -> AUDIT -> RECOMMEND -> CONFIRM -> BACKUP -> EXECUTE -> VERIFY -> AUDIT -> REPORT
            print_warn "HIGH RISK ACTION DETECTED: $desc"
            print_warn "Command: $cmd"
            
            # Explicit confirmation
            read -r -p "[☠️ ] CONFIRM DESTRUCTIVE/HIGH-RISK OPERATION? (y/N) " confirm
            if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
                print_info "High-risk action aborted by user: $desc"
                log_info "HIGH Risk execution aborted: $desc"
                return 127
            fi
            
            # Backup if provided
            if [ -n "$backup_cmd" ]; then
                print_info "Creating backup..."
                eval "$backup_cmd"
                if [ $? -ne 0 ]; then
                    print_err "Backup failed. Aborting high-risk action for safety."
                    log_err "HIGH Risk backup failed. Aborted: $desc"
                    return 1
                fi
                print_success "Backup verified."
            fi
            
            # Execute
            eval "$cmd"
            local ret=$?
            if [ $ret -eq 0 ]; then
                print_success "VERIFIED: $desc completed successfully."
                log_info "HIGH Risk execution OK: $desc"
                [ -n "$backup_cmd" ] && audit_log_event "HIGH_RISK" "Action '$desc' executed and verified. Backup retained."
            else
                print_err "CRITICAL FAILURE: $desc failed during execution."
                log_err "HIGH Risk execution FAIL: $desc"
                audit_log_event "HIGH_RISK_FAIL" "Action '$desc' failed. Recovery recommended."
            fi
            return $ret
            ;;
    esac
}

# SOP Engine Branch Execution (Hydra SOP pattern)
# Gated/Conditioned steps run if matching context exists, otherwise fallback to unconditional.
sop_execute() {
    local context="$1"
    shift
    local conditioned_steps=()
    local unconditional_steps=()

    for step in "$@"; do
        local condition="${step%%:*}"
        local action="${step#*:}"
        if [ "$condition" = "$action" ]; then
            unconditional_steps+=("$action")
        elif echo "$context" | grep -q "$condition"; then
            conditioned_steps+=("$action")
        fi
    done

    if [ ${#conditioned_steps[@]} -gt 0 ]; then
        for step in "${conditioned_steps[@]}"; do
            safe_execute "$step" "MEDIUM" "SOP Conditioned Step: $step"
        done
    else
        for step in "${unconditional_steps[@]}"; do
            safe_execute "$step" "LOW" "SOP Fallback Step: $step"
        done
    fi
}
