#!/usr/bin/env bash
#===============================================================
# install.sh – One-Line Installer
# Ollama Connector ☠️ v1.0.9
#===============================================================

set -euo pipefail

REPO="https://github.com/1nj3ct04/ollama-connector.git"
INSTALL_DIR="${HOME}/ollama-connector"

echo "☠️ Installing Ollama Connector..."

if [ -d "$INSTALL_DIR" ]; then
    echo "Updating existing installation..."
    cd "$INSTALL_DIR" && git pull
else
    git clone "$REPO" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

chmod +x ollama_connector.sh
chmod +x src/bin/*.sh

sudo ln -sf "$INSTALL_DIR/ollama_connector.sh" /usr/local/bin/ollama-connector

echo "✅ Installation complete!"
echo "Run: ollama-connector"
