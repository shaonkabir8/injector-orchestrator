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
    if command -v jq &> /dev/null; then
        if [ ! -f "$settings" ]; then echo '{}' > "$settings"; fi
        jq '.customModels = [
            {"name":"Ollama Qwen2.5","provider":"openai","baseUrl":"http://localhost:11434/v1","apiKey":"ollama","model":"qwen2.5:7b"},
            {"name":"Ollama DeepSeek R1","provider":"openai","baseUrl":"http://localhost:11434/v1","apiKey":"ollama","model":"deepseek-r1:8b"}
        ] + (.customModels // [])' "$settings" > "$settings.tmp"
        mv "$settings.tmp" "$settings"
        log SUCCESS "Cursor configured with jq."
    else
        log WARN "jq not found. Creating minimal config."
        cat > "$settings" << 'CURSOR_CONF'
{
  "customModels": [
    {
      "name": "Ollama Qwen2.5",
      "provider": "openai",
      "baseUrl": "http://localhost:11434/v1",
      "apiKey": "ollama",
      "model": "qwen2.5:7b"
    }
  ]
}
CURSOR_CONF
        log SUCCESS "Cursor configured (fallback)."
    fi
    return 0
}

ide_integration() {
    check_ollama || return 1
    configure_cursor || return 1
    log SUCCESS "IDE integration complete. Restart Cursor to apply changes."
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
