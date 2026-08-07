#!/usr/bin/env bash
#===============================================================
# test_connector.sh – Test Suite
# Verifies that Ollama Connector is correctly installed
#===============================================================

set -euo pipefail

TOOL_DIR="${HOME}/.ollama_connector"
LOG_FILE="$TOOL_DIR/logs/connector.log"
METRICS_FILE="$TOOL_DIR/data/metrics.json"
mkdir -p "$TOOL_DIR/logs"

reset="\033[0m"
green="\033[38;5;82m"
red="\033[38;5;196m"
yellow="\033[38;5;226m"

pass=0
fail=0

check() {
    local name="$1"
    local result="$2"
    if [ "$result" = "ok" ]; then
        echo -e "  ${green}PASS${reset} $name"
        ((pass++))
    else
        echo -e "  ${red}FAIL${reset} $name — $result"
        ((fail++))
    fi
}

log() {
    echo "[$(date +"%H:%M:%S")] $1" | tee -a "$LOG_FILE"
}

echo ""
echo -e "${yellow}Ollama Connector — Test Suite${reset}"
echo "=================================="

# Test: Ollama running
if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    check "Ollama service running" "ok"
else
    check "Ollama service running" "not reachable at http://localhost:11434"
fi

# Test: Default model available
if ollama list 2>/dev/null | grep -q "qwen2.5:7b"; then
    check "qwen2.5:7b installed" "ok"
else
    check "qwen2.5:7b installed" "model not found"
fi

# Test: Fallback model available
if ollama list 2>/dev/null | grep -q "deepseek-r1:8b"; then
    check "deepseek-r1:8b installed" "ok"
else
    check "deepseek-r1:8b installed" "model not found"
fi

# Test: Cursor config
if grep -q "Ollama" "$HOME/.config/Cursor/User/settings.json" 2>/dev/null; then
    check "Cursor configured" "ok"
else
    check "Cursor configured" "settings.json missing or not configured"
fi

# Test: Metrics file
if [ -f "$METRICS_FILE" ]; then
    check "Metrics file exists" "ok"
else
    check "Metrics file exists" "not found at $METRICS_FILE"
fi

# Test: Tool directory
if [ -d "$TOOL_DIR" ]; then
    check "Tool directory exists" "ok"
else
    check "Tool directory exists" "missing: $TOOL_DIR"
fi

# Test: Python3 available
if command -v python3 &>/dev/null; then
    check "python3 available" "ok"
else
    check "python3 available" "not installed"
fi

# Test: Git available
if command -v git &>/dev/null; then
    check "git available" "ok"
else
    check "git available" "not installed"
fi

echo ""
echo "=================================="
echo -e "  Results: ${green}${pass} passed${reset} / ${red}${fail} failed${reset}"
echo ""

exit "$fail"
