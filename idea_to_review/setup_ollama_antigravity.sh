#!/bin/bash
#-------------------------------------------------------
# Ollama + Antigravity Integration Setup Script (Bangla)
#-------------------------------------------------------

set -e  # কোনো কমান্ড ফেইল করলে স্ক্রিপ্ট থামবে

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Ollama-কে Antigravity-এর সাথে সংযুক্ত করার প্রক্রিয়া শুরু...${NC}"

# 1. Ollama ইনস্টল করা (যদি না থাকে)
if ! command -v ollama &> /dev/null; then
    echo -e "${YELLOW}📦 Ollama ইনস্টল করা হচ্ছে...${NC}"
    curl -fsSL https://ollama.com/install.sh | sh
else
    echo -e "${GREEN}✅ Ollama আগে থেকেই ইনস্টল করা আছে।${NC}"
fi

# 2. প্রয়োজনীয় মডেল ডাউনলোড (আপনার পছন্দমতো)
MODELS=("qwen2.5:7b" "deepseek-r1:8b")
for model in "${MODELS[@]}"; do
    if ! ollama list | grep -q "$model"; then
        echo -e "${YELLOW}⬇️  মডেল ডাউনলোড হচ্ছে: $model${NC}"
        ollama pull "$model"
    else
        echo -e "${GREEN}✅ মডেল $model ইতিমধ্যে আছে।${NC}"
    fi
done

# 3. Python ডিপেন্ডেন্সি ইনস্টল (virtualenv সচেতন)
echo -e "${YELLOW}🐍 Python প্যাকেজ ইনস্টল করা হচ্ছে...${NC}"
if [[ -n "$VIRTUAL_ENV" ]]; then
    echo -e "${YELLOW}🔍 virtualenv সনাক্ত করা হয়েছে, --user ব্যবহার করা হচ্ছে না।${NC}"
    pip install requests pyyaml
else
    pip install --user requests pyyaml
fi

# 4. ওয়ারাপার স্ক্রিপ্ট তৈরি করা (আমাদের আগের ollama_wrapper.py)
WRAPPER_DIR="$HOME/ollama-bridge"
mkdir -p "$WRAPPER_DIR"
cat > "$WRAPPER_DIR/ollama_wrapper.py" << 'EOF'
#!/usr/bin/env python3
import argparse, json, hashlib, os, sys, time, threading
import requests
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, Optional, List

# কনফিগ (আপনি চাইলে পরিবর্তন করতে পারেন)
CONFIG = {
    "routing": {
        "code_generation": "qwen2.5:7b",
        "documentation": "qwen2.5:7b",
        "debugging": "deepseek-r1:8b",
        "default": "qwen2.5:7b"
    },
    "cache": {"enabled": True, "ttl_seconds": 3600, "dir": "./cache"},
    "ollama": {"api_url": "http://localhost:11434/api/generate", "timeout": 120, "max_retries": 3}
}

class OllamaClient:
    def __init__(self, config):
        self.config = config
        self.cache_dir = Path(config['cache']['dir'])
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.ttl = timedelta(seconds=config['cache']['ttl_seconds'])

    def _cache_key(self, prompt, model, temp, max_tokens):
        raw = json.dumps({"p":prompt,"m":model,"t":temp,"mt":max_tokens}, sort_keys=True)
        return hashlib.sha256(raw.encode()).hexdigest()

    def _get_cache(self, key):
        path = self.cache_dir / f"{key}.json"
        if not path.exists(): return None
        with open(path) as f:
            data = json.load(f)
        if datetime.now() - datetime.fromisoformat(data['cached_at']) > self.ttl:
            path.unlink(); return None
        return data['response']

    def _set_cache(self, key, response):
        path = self.cache_dir / f"{key}.json"
        with open(path, 'w') as f:
            json.dump({"cached_at": datetime.now().isoformat(), "response": response}, f)

    def generate(self, prompt, model=None, task=None, temperature=0.7, max_tokens=2000):
        if model is None:
            model = self.config['routing'].get(task, self.config['routing']['default'])
        cache_key = self._cache_key(prompt, model, temperature, max_tokens)
        cached = self._get_cache(cache_key)
        if cached:
            cached['cached'] = True
            return cached
        # API কল
        for attempt in range(self.config['ollama']['max_retries']):
            try:
                resp = requests.post(self.config['ollama']['api_url'],
                                     json={"model":model,"prompt":prompt,"temperature":temperature,
                                           "max_tokens":max_tokens,"stream":False},
                                     timeout=self.config['ollama']['timeout'])
                resp.raise_for_status()
                data = resp.json()
                data['cached'] = False
                data['model_used'] = model
                self._set_cache(cache_key, data)
                return data
            except Exception as e:
                if attempt == self.config['ollama']['max_retries']-1:
                    return {"error": str(e)}
                time.sleep(2**attempt)
        return {"error": "Unknown error"}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--model")
    parser.add_argument("--task")
    parser.add_argument("--temperature", type=float, default=0.7)
    parser.add_argument("--max_tokens", type=int, default=2000)
    args = parser.parse_args()
    client = OllamaClient(CONFIG)
    result = client.generate(args.prompt, args.model, args.task, args.temperature, args.max_tokens)
    print(json.dumps(result))
EOF

chmod +x "$WRAPPER_DIR/ollama_wrapper.py"
echo -e "${GREEN}✅ ওয়ারাপার স্ক্রিপ্ট তৈরি করা হলো: $WRAPPER_DIR/ollama_wrapper.py${NC}"

# 5. MCP সার্ভার তৈরি করা (Antigravity-এর জন্য)
cat > "$WRAPPER_DIR/mcp_server.py" << 'EOF'
#!/usr/bin/env python3
# MCP সার্ভার – Antigravity-এর সাথে যোগাযোগ করবে
import json, subprocess, sys
from http.server import HTTPServer, BaseHTTPRequestHandler

class OllamaMCPHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != '/generate':
            self.send_error(404)
            return
        length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(length).decode())
        prompt = body.get('prompt', '')
        task = body.get('task', 'default')
        # আমাদের ওয়ারাপার কল করি
        cmd = [sys.executable, '/home/'+os.getenv('USER')+'/ollama-bridge/ollama_wrapper.py',
               '--prompt', prompt, '--task', task]
        try:
            output = subprocess.check_output(cmd, stderr=subprocess.STDOUT, text=True)
            response = json.loads(output)
        except Exception as e:
            response = {"error": str(e)}
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(response).encode())

def run_server(port=8765):
    server = HTTPServer(('localhost', port), OllamaMCPHandler)
    print(f"MCP সার্ভার চালু হয়েছে http://localhost:{port}/generate")
    server.serve_forever()

if __name__ == "__main__":
    run_server()
EOF

chmod +x "$WRAPPER_DIR/mcp_server.py"
echo -e "${GREEN}✅ MCP সার্ভার তৈরি করা হলো: $WRAPPER_DIR/mcp_server.py${NC}"

# 6. Antigravity-এর জন্য কনফিগারেশন (ধরে নিচ্ছি এটি ~/.config/antigravity/mcp.json)
ANTIGRAVITY_CONFIG_DIR="$HOME/.config/antigravity"
mkdir -p "$ANTIGRAVITY_CONFIG_DIR"
MCP_CONFIG="$ANTIGRAVITY_CONFIG_DIR/mcp.json"

# আগের কনফিগ থাকলে ব্যাকআপ নেওয়া
if [ -f "$MCP_CONFIG" ]; then
    cp "$MCP_CONFIG" "$MCP_CONFIG.bak"
    echo -e "${YELLOW}📂 পুরানো কনফিগ ব্যাকআপ করা হয়েছে: $MCP_CONFIG.bak${NC}"
fi

# নতুন MCP সার্ভার এন্ট্রি যোগ করা
cat > "$MCP_CONFIG" << EOF
{
  "mcpServers": {
    "ollama-local": {
      "url": "http://localhost:8765/generate",
      "transport": "http",
      "capabilities": {
        "tools": [
          {
            "name": "ollama_generate",
            "description": "Local Ollama model call",
            "parameters": {
              "prompt": {"type": "string"},
              "task": {"type": "string", "enum": ["code_generation","documentation","debugging","default"]}
            }
          }
        ]
      }
    }
  }
}
EOF

echo -e "${GREEN}✅ Antigravity-এর MCP কনফিগ আপডেট করা হয়েছে: $MCP_CONFIG${NC}"

# 7. MCP সার্ভার অটোস্টার্টের জন্য systemd ইউনিট (ঐচ্ছিক)
SERVICE_FILE="$HOME/.config/systemd/user/ollama-mcp.service"
mkdir -p "$(dirname "$SERVICE_FILE")"
cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Ollama MCP Server for Antigravity
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/python3 $WRAPPER_DIR/mcp_server.py
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
EOF

# systemd ইউজার সার্ভিস চালু করা
systemctl --user daemon-reload
systemctl --user enable ollama-mcp.service
systemctl --user start ollama-mcp.service

echo -e "${GREEN}✅ MCP সার্ভার systemd-এর মাধ্যমে চালু করা হয়েছে।${NC}"
echo -e "${GREEN}🎉 সবকিছু প্রস্তুত!${NC}"
echo -e "${YELLOW}🔹 এখন Antigravity ওপেন করুন এবং 'ollama_generate' টুল ব্যবহার করুন।${NC}"
echo -e "${YELLOW}🔹 সার্ভার লগ দেখতে: journalctl --user -u ollama-mcp.service -f${NC}"