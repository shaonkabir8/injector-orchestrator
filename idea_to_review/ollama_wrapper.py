#!/usr/bin/env python3
"""
Claude Code ↔ Ollama Bridge
Features:
- Disk cache with TTL
- Task‑aware model routing
- Retry with exponential backoff
- Concurrent request batching (via threading)
- JSON output for Claude Code
- Resource monitoring (optional)
"""

import argparse
import json
import hashlib
import os
import sys
import time
import threading
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
import requests
import yaml  # pip install pyyaml

# ---------- CONFIG ----------
DEFAULT_CONFIG = {
    "models": {
        "deepseek-r1:8b": {"context": 4096, "speed": "slow", "capabilities": ["reasoning", "debug"]},
        "qwen2.5:7b": {"context": 32768, "speed": "fast", "capabilities": ["code", "doc"]},
        "deepseek-v2:lite": {"context": 16384, "speed": "medium", "capabilities": ["refactor"]}
    },
    "routing": {
        "code_generation": "qwen2.5:7b",
        "documentation": "qwen2.5:7b",
        "debugging": "deepseek-r1:8b",
        "refactoring": "deepseek-v2:lite",
        "default": "qwen2.5:7b"
    },
    "cache": {
        "enabled": True,
        "ttl_seconds": 3600,      # 1 hour
        "dir": "./cache"
    },
    "ollama": {
        "api_url": "http://localhost:11434/api/generate",
        "timeout": 120,
        "max_retries": 3,
        "backoff_factor": 2
    }
}

class OllamaCache:
    def __init__(self, cache_dir: str, ttl_seconds: int):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.ttl = timedelta(seconds=ttl_seconds)

    def _key_path(self, key: str) -> Path:
        return self.cache_dir / f"{hashlib.sha256(key.encode()).hexdigest()}.json"

    def get(self, key: str) -> Optional[Dict]:
        path = self._key_path(key)
        if not path.exists():
            return None
        try:
            with open(path, 'r') as f:
                data = json.load(f)
            # Check TTL
            cached_time = datetime.fromisoformat(data['cached_at'])
            if datetime.now() - cached_time > self.ttl:
                path.unlink()
                return None
            return data['response']
        except Exception:
            return None

    def set(self, key: str, response: Dict):
        path = self._key_path(key)
        data = {
            "cached_at": datetime.now().isoformat(),
            "response": response
        }
        with open(path, 'w') as f:
            json.dump(data, f)

class OllamaClient:
    def __init__(self, config: Dict):
        self.config = config
        self.cache = OllamaCache(
            config['cache']['dir'],
            config['cache']['ttl_seconds']
        ) if config['cache']['enabled'] else None

    def _call_api(self, model: str, prompt: str, temperature: float, max_tokens: int) -> Dict:
        """Raw API call with retries"""
        url = self.config['ollama']['api_url']
        payload = {
            "model": model,
            "prompt": prompt,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": False
        }
        for attempt in range(self.config['ollama']['max_retries'] + 1):
            try:
                resp = requests.post(
                    url,
                    json=payload,
                    timeout=self.config['ollama']['timeout']
                )
                resp.raise_for_status()
                return resp.json()
            except (requests.RequestException, json.JSONDecodeError) as e:
                if attempt == self.config['ollama']['max_retries']:
                    raise RuntimeError(f"Ollama API failed after {attempt+1} attempts: {e}")
                wait = self.config['ollama']['backoff_factor'] ** attempt
                time.sleep(wait)

    def generate(self, prompt: str, model: Optional[str] = None,
                 temperature: float = 0.7, max_tokens: int = 2000,
                 task: Optional[str] = None) -> Dict:
        """
        Main entry point.
        - If model is given, use it; else route by task or default.
        - Cache lookup before calling API.
        """
        if model is None:
            if task and task in self.config['routing']:
                model = self.config['routing'][task]
            else:
                model = self.config['routing']['default']

        # Build cache key (includes all parameters)
        cache_key = json.dumps({
            "model": model,
            "prompt": prompt,
            "temperature": temperature,
            "max_tokens": max_tokens
        }, sort_keys=True)

        if self.cache:
            cached = self.cache.get(cache_key)
            if cached is not None:
                cached['cached'] = True
                return cached

        # Call API
        response = self._call_api(model, prompt, temperature, max_tokens)
        response['cached'] = False
        response['model_used'] = model

        # Store in cache
        if self.cache:
            self.cache.set(cache_key, response)

        return response

# ---------- BATCH SUPPORT ----------
class BatchOllamaClient(OllamaClient):
    """Thread‑pool based batch processing"""
    def generate_batch(self, prompts: List[str], **kwargs) -> List[Dict]:
        results = []
        threads = []
        lock = threading.Lock()
        def worker(prompt):
            try:
                result = self.generate(prompt, **kwargs)
            except Exception as e:
                result = {"error": str(e)}
            with lock:
                results.append(result)
        for p in prompts:
            t = threading.Thread(target=worker, args=(p,))
            t.start()
            threads.append(t)
        for t in threads:
            t.join()
        return results

# ---------- CLI WRAPPER ----------
def main():
    parser = argparse.ArgumentParser(description="Ollama bridge for Claude Code")
    parser.add_argument("--prompt", required=True, help="Input prompt")
    parser.add_argument("--model", help="Model name (overrides task routing)")
    parser.add_argument("--task", help="Task type for routing (code_generation, documentation, debugging, refactoring)")
    parser.add_argument("--temperature", type=float, default=0.7)
    parser.add_argument("--max_tokens", type=int, default=2000)
    parser.add_argument("--batch", action="store_true", help="Treat prompt as newline‑separated list")
    parser.add_argument("--config", default="config.yaml", help="Path to config file")
    args = parser.parse_args()

    # Load config (with fallback to defaults)
    config = DEFAULT_CONFIG.copy()
    if os.path.exists(args.config):
        with open(args.config, 'r') as f:
            user_config = yaml.safe_load(f)
            config.update(user_config)

    client = BatchOllamaClient(config) if args.batch else OllamaClient(config)

    if args.batch:
        prompts = [p.strip() for p in args.prompt.split('\n') if p.strip()]
        results = client.generate_batch(
            prompts,
            model=args.model,
            temperature=args.temperature,
            max_tokens=args.max_tokens,
            task=args.task
        )
        # Output each result as a line of JSON (for streaming)
        for res in results:
            print(json.dumps(res))
    else:
        try:
            result = client.generate(
                prompt=args.prompt,
                model=args.model,
                temperature=args.temperature,
                max_tokens=args.max_tokens,
                task=args.task
            )
            print(json.dumps(result))
        except Exception as e:
            error_output = {"error": str(e)}
            print(json.dumps(error_output), file=sys.stderr)
            sys.exit(1)

if __name__ == "__main__":
    main()