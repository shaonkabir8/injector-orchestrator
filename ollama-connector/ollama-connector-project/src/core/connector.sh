#!/usr/bin/env bash
#===============================================================
# connector.sh – Core Connector Logic
# Handles Ollama service and Cursor/IDE configuration
#===============================================================

check_ollama() {
    log STEP "Checking Ollama..."
    if ! command -v ollama &> /dev/null; then
        log WARN "Ollama not found. Installing..."
        curl -fsSL https://ollama.com/install.sh | sh > /dev/null 2>&1 &
        spinner $! "Installing Ollama"
        if ! command -v ollama &> /dev/null; then
            log ERROR "Ollama installation failed."
            return 1
        fi
    fi
    if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        log WARN "Ollama not running. Starting..."
        ollama serve > /dev/null 2>&1 &
        sleep 3
        if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
            log ERROR "Ollama failed to start."
            return 1
        fi
    fi
    log SUCCESS "Ollama is running."
    return 0
}

configure_cursor() {
    log STEP "Configuring Cursor..."
    local settings="$HOME/.config/Cursor/User/settings.json"
    mkdir -p "$(dirname "$settings")"
    if [ -f "$settings" ]; then
        cp "$settings" "$settings.bak_$(date +%Y%m%d_%H%M%S)"
    fi
    local key="${KKTOKEN_API_KEY:?KKTOKEN_API_KEY not set in environment (.env)}"
    local base="${KKTOKEN_BASE_URL:-https://kktoken.cc/v1}"
    if command -v jq &> /dev/null; then
        if [ ! -f "$settings" ]; then echo '{}' > "$settings"; fi
        jq --arg key "$key" --arg base "$base" '.customModels = [
            {"name":"KKToken Claude Opus 5 Thinking","provider":"openai","baseUrl":$base,"apiKey":$key,"model":"claude-opus-5-thinking"},
            {"name":"KKToken Claude Opus 4.8 Thinking","provider":"openai","baseUrl":$base,"apiKey":$key,"model":"claude-opus-4-8-thinking"},
            {"name":"Ollama Qwen2.5","provider":"openai","baseUrl":"http://localhost:11434/v1","apiKey":"ollama","model":"qwen2.5:7b"}
        ] + (.customModels // [])' "$settings" > "$settings.tmp"
        mv "$settings.tmp" "$settings"
        log SUCCESS "Cursor configured with KKToken + Ollama."
    fi
    return 0
}

configure_vscode() {
    log STEP "Configuring VSCode..."
    local key="${KKTOKEN_API_KEY:?KKTOKEN_API_KEY not set in environment (.env)}"
    local base="${KKTOKEN_BASE_URL:-https://kktoken.cc/v1}"
    local vscode_settings="$HOME/.config/Code/User/settings.json"
    local continue_config="$HOME/.continue/config.json"
    mkdir -p "$(dirname "$vscode_settings")" "$(dirname "$continue_config")"

    if command -v jq &> /dev/null; then
        if [ ! -f "$vscode_settings" ]; then echo '{}' > "$vscode_settings"; fi
        jq --arg key "$key" --arg base "$base" '.customModels = [
            {"name":"KKToken Claude Opus 5 Thinking","provider":"openai","baseUrl":$base,"apiKey":$key,"model":"claude-opus-5-thinking"},
            {"name":"KKToken Claude Opus 4.8 Thinking","provider":"openai","baseUrl":$base,"apiKey":$key,"model":"claude-opus-4-8-thinking"}
        ] + (.customModels // [])' "$vscode_settings" > "$vscode_settings.tmp"
        mv "$vscode_settings.tmp" "$vscode_settings"
        log SUCCESS "VSCode settings configured with KKToken API."
    fi

    jq -n --arg key "$key" --arg base "$base" '{
      models: [
        {title:"KKToken Claude Opus 5 Thinking",provider:"openai",model:"claude-opus-5-thinking",apiKey:$key,apiBase:$base},
        {title:"KKToken Claude Opus 4.8 Thinking",provider:"openai",model:"claude-opus-4-8-thinking",apiKey:$key,apiBase:$base},
        {title:"Local Ollama Qwen2.5 7B",provider:"ollama",model:"qwen2.5:7b",apiBase:"http://127.0.0.1:11434"}
      ],
      tabAutocompleteModel: {title:"KKToken Claude Opus 5 Thinking",provider:"openai",model:"claude-opus-5-thinking",apiKey:$key,apiBase:$base}
    }' > "$continue_config"
    log SUCCESS "VSCode Continue extension configured with KKToken API."
    return 0
}

ide_integration() {
    check_ollama || return 1
    configure_cursor || return 1
    configure_vscode || return 1
    log SUCCESS "IDE integration complete. Restart VSCode / Cursor to apply changes."
}

auto_setup_env() {
    log STEP "Checking environment dependencies..."
    local missing=()

    command -v python3 &>/dev/null || missing+=("python3")
    command -v pip3   &>/dev/null || missing+=("pip3")
    command -v node   &>/dev/null || missing+=("nodejs")
    command -v git    &>/dev/null || missing+=("git")
    command -v jq     &>/dev/null || missing+=("jq")

    if [ ${#missing[@]} -gt 0 ]; then
        log WARN "Missing: ${missing[*]}"
        if command -v apt-get &>/dev/null; then
            sudo apt-get install -y "${missing[@]}" > /dev/null 2>&1 || true
        elif command -v brew &>/dev/null; then
            brew install "${missing[@]}" > /dev/null 2>&1 || true
        fi
    fi

    log SUCCESS "Environment ready."
    return 0
}
