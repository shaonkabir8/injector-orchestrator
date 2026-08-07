#!/usr/bin/env bash
#===============================================================
# setup_cursor_ollama.sh – Complete Setup Script
# Installs Ollama, pulls models, configures Cursor
#===============================================================

set -euo pipefail

TOOL_DIR="${HOME}/.ollama_connector"
LOG_FILE="$TOOL_DIR/logs/connector.log"
mkdir -p "$TOOL_DIR/logs"

log() {
    echo "[$(date +"%H:%M:%S")] $1" | tee -a "$LOG_FILE"
}

log "Starting Ollama + Cursor setup..."

# Install Ollama if missing
if ! command -v ollama &> /dev/null; then
    log "Installing Ollama..."
    curl -fsSL https://ollama.com/install.sh | sh
    log "Ollama installed."
fi

# Start Ollama if not running
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    log "Starting Ollama service..."
    ollama serve > /dev/null 2>&1 &
    sleep 3
fi

# Pull required models
for model in qwen2.5:7b deepseek-r1:8b; do
    if ! ollama list | grep -q "$model"; then
        log "Pulling $model..."
        ollama pull "$model"
        log "$model ready."
    else
        log "$model already available."
    fi
done

# Configure Cursor
log "Configuring Cursor..."
mkdir -p "$HOME/.config/Cursor/User"
cat > "$HOME/.config/Cursor/User/settings.json" << 'CURSOR_EOF'
{
  "customModels": [
    {
      "name": "Ollama Qwen2.5",
      "provider": "openai",
      "baseUrl": "http://localhost:11434/v1",
      "apiKey": "ollama",
      "model": "qwen2.5:7b"
    },
    {
      "name": "Ollama DeepSeek R1",
      "provider": "openai",
      "baseUrl": "http://localhost:11434/v1",
      "apiKey": "ollama",
      "model": "deepseek-r1:8b"
    }
  ]
}
CURSOR_EOF

log "Setup complete! Restart Cursor to apply model configuration."
