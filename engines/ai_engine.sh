#!/usr/bin/env bash
# Injector Orchestrator - AI Engine / Injector Intelligence Engine (Phase 11)
# Author: Mr. 1nj3ct04

# IIE: Injector Intelligence Engine
# AI must NEVER: lie, delete, modify, override users, hallucinate stats
# AI must ONLY: recommend, analyze, educate, explain

get_ollama_recommendation() {
    local cpu="$1" ram="$2" disk="$3"
    
    # 1. Check if python3 is available
    if ! command -v python3 >/dev/null 2>&1; then
        return 1
    fi
    
    # 2. Check python dependencies
    if ! python3 -c "import requests, yaml" >/dev/null 2>&1; then
        log_info "Ollama wrapper skipped: missing python dependencies (requests/pyyaml)."
        return 1
    fi
    
    # 3. Check if Ollama is accessible
    if ! curl -s -m 2 http://localhost:11434 >/dev/null 2>&1; then
        log_info "Ollama wrapper skipped: Ollama API is not running or accessible."
        return 1
    fi
    
    # Build prompt
    local active_services=""
    if [ -f "${INJECTOR_DIR}/services_state.json" ]; then
        active_services=$(jq -r 'to_entries | map(select(.value == "active") | .key) | join(", ")' "${INJECTOR_DIR}/services_state.json" 2>/dev/null || true)
    fi
    
    local prompt="Analyze system telemetry and output ONE action-oriented recommendation (under 60 chars) to keep it healthy. Stats: CPU:${cpu}%, RAM:${ram}%, Disk:${disk}%, Services:[${active_services}]."
    
    # Execute wrapper
    local wrapper_path="idea_to_review/ollama_wrapper.py"
    local config_path="idea_to_review/config.yaml"
    local json_out
    json_out=$(python3 "$wrapper_path" --prompt "$prompt" --config "$config_path" --max_tokens 100 2>/dev/null)
    
    if [ $? -eq 0 ] && [ -n "$json_out" ]; then
        local response
        response=$(echo "$json_out" | jq -r '.response' 2>/dev/null)
        if [ -n "$response" ] && [ "$response" != "null" ]; then
            echo "$response"
            return 0
        fi
    fi
    return 1
}

ai_analyze_system() {
    local state_file="${INJECTOR_DIR}/sys_state.json"
    local recommendations=()

    if [ ! -f "$state_file" ]; then return; fi

    local cpu ram disk
    cpu=$(jq -r '.cpu_pct // 0' "$state_file")
    ram=$(jq -r '.ram_pct // 0' "$state_file")
    disk=$(jq -r '.disk_pct // 0' "$state_file")

    # 1. Evidence-based rule recommendations
    [ "$cpu" -gt 85 ] && recommendations+=("[RULE-BASED] [CONF:HIGH] [REV:YES] CPU Usage critical at ${cpu}% (Evidence: cpu_pct=${cpu})")
    [ "$ram" -gt 85 ] && recommendations+=("[RULE-BASED] [CONF:HIGH] [REV:YES] RAM Usage critical at ${ram}% (Evidence: ram_pct=${ram})")
    [ "$disk" -gt 85 ] && recommendations+=("[RULE-BASED] [CONF:HIGH] [REV:YES] Disk Usage critical at ${disk}% (Evidence: disk_pct=${disk})")

    # 2. Try Ollama dynamic recommendation first
    local ollama_rec
    if ollama_rec=$(get_ollama_recommendation "$cpu" "$ram" "$disk"); then
        recommendations+=("[OLLAMA] [CONF:MEDIUM] [REV:YES] $ollama_rec (Evidence: Dynamic Ollama model)")
    fi

    # 3. Try Hydra Agent recommendation (Hydra = Rust brain)
    if command -v hydra &>/dev/null; then
        local hydra_rec
        hydra_rec=$(hydra run hydra.toml 2>/dev/null | tail -n 1)
        [ -n "$hydra_rec" ] && recommendations+=("[HYDRA-AGENT] [CONF:HIGH] [REV:YES] $hydra_rec (Evidence: Hydra Rust Agent Loop)")
    fi

    # AI model RAM recommendations
    local total_ram_mb
    total_ram_mb=$(free -m | awk '/Mem/ {print $2}')
    local rec_model="Gemma / Qwen / Phi"
    if [ "$total_ram_mb" -lt 8192 ]; then
        rec_model="Phi-2 (lightweight only)"
    elif [ "$total_ram_mb" -gt 32768 ]; then
        rec_model="Llama3 / Qwen72B / Mixtral"
    fi
    recommendations+=("[RULE-BASED] [CONF:HIGH] [REV:YES] Recommended AI Models: ${rec_model} (Evidence: RAM=${total_ram_mb}MB)")

    # Docker volumes warning
    local docker_state="${INJECTOR_DIR}/docker_state.json"
    if [ -f "$docker_state" ]; then
        local img_count
        img_count=$(jq -r '.total_images // 0' "$docker_state")
        [ "$img_count" -gt 10 ] && recommendations+=("[RULE-BASED] [CONF:HIGH] [REV:YES] ${img_count} Docker images. Safe Cleanup Available (Evidence: image_count=${img_count})")
    fi

    # Write results conforming to V3 Integration Bus
    local json_array
    json_array=$(printf '%s\n' "${recommendations[@]}" | jq -R . | jq -sc .)
    cat <<EOF > "${INJECTOR_DIR}/ai_state.json"
{
  "status": "VERIFIED",
  "recommendations": $json_array,
  "timestamp": $(date +'%s')
}
EOF
    log_info "IIE analysis completed. Recommendations: ${#recommendations[@]}"
}

init_ai_engine() {
    log_info "Initializing Injector Intelligence Engine (IIE)..."
    (ai_analyze_system) &
}
