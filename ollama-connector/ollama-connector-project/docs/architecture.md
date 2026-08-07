# Architecture

## Overview

Ollama Connector is a modular Bash-based agentic loop engine with a pluggable extension system and a Node.js web dashboard.

## Components

### 1. Core Engine (`src/core/`)

| File | Purpose |
|------|---------|
| `connector.sh` | Ollama service management & Cursor/VSCode configuration |
| `loop_engine.sh` | Main agentic loop, parallel model runner, web dashboard starter |
| `checkpoint.sh` | Save/resume state across iterations |
| `oom_guard.sh` | Memory monitoring with automatic model switching |
| `notifications.sh` | Desktop & Telegram alerts |
| `git_auto.sh` | Auto-commit on each passing iteration |
| `metrics.sh` | Metrics collection and predictive token analysis |

### 2. Executables (`src/bin/`)

| File | Purpose |
|------|---------|
| `setup_cursor_ollama.sh` | One-shot installer: Ollama + model pull + Cursor config |
| `test_connector.sh` | Test suite verifying all components |

### 3. Web Dashboard (`src/web/`)

- `server.js` — Node.js HTTP + Server-Sent Events server
- Serves real-time metrics cards and live log stream
- No external dependencies beyond Node.js stdlib

### 4. Configuration (`config/`)

- `settings.conf` — User configuration (models, thresholds, toggles)
- `telegram.conf.example` — Template for Telegram notifications

### 5. Extensions (`extensions/`)

- Drop `.ext` files in `~/.ollama_connector/extensions/`
- They are sourced alphabetically at startup
- First line must be: `# Description: <name>`

## Data Flow

```
User runs ollama_connector.sh
        │
        ▼
Load config (settings.conf)
        │
        ▼
Source core modules + extensions
        │
        ▼
Main menu
        │
        ├─ [Start]   → check_ollama → configure_cursor → run_agentic_loop
        │               │
        │               ├─ Each iteration:
        │               │   call_ollama → run_tests → save_checkpoint
        │               │   collect_metrics → git_auto_commit → send_notification
        │               └─ OOM guard running in background
        │
        ├─ [Resume]  → load_checkpoint → run_agentic_loop
        ├─ [Dashboard] → node src/web/server.js (SSE on :3000)
        └─ [Parallel]  → spawn N model calls concurrently
```

## Extension System

Extensions are sourced in alphabetical order. Each must be a valid Bash script.
The convention is:

```bash
# Description: Short one-line description
# (rest of the file is normal Bash)
my_function() { ... }
```

After being sourced, all functions defined in the extension are available in the main shell.

## Metrics Format

```json
{
  "timestamp": "2026-07-24T12:34:56Z",
  "iteration": 12,
  "total_tokens": 12345,
  "tokens_this_iter": 487,
  "ram_percent": 68.2,
  "cpu_load": 1.24,
  "latency_ms": 145
}
```
