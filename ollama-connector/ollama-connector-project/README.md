# ☠️ Ollama Connector — Agentic Loop Engine

[![Version](https://img.shields.io/badge/version-1.0.9-brightgreen)](https://github.com/1nj3ct04/ollama-connector)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![ShellCheck](https://img.shields.io/badge/ShellCheck-passed-success)](https://github.com/koalaman/shellcheck)

**Write Yourselfer, Injector** — A complete Agentic Loop Engine that connects Ollama with Cursor, Antigravity, and any IDE. Automates the entire development lifecycle: code generation → verification → rollback → improvement → completion.

---

## What It Does

- **Agentic Loop** – Runs an AI agent in a loop until all tests pass.
- **Checkpoint & Resume** – Saves state every iteration. Resume from where it stopped.
- **OOM Guard** – Monitors RAM usage. Switches models or saves checkpoint before crash.
- **Real-Time Dashboard** – Live metrics: RAM, CPU, Tokens, Latency, Cost.
- **Notifications** – Desktop & Telegram alerts on completion or errors.
- **Git Auto-Commit** – Commits every passing iteration automatically.
- **Parallel Models** – Runs multiple models simultaneously for consensus.
- **Web Dashboard** – Node.js server with real-time logs and charts.
- **Extensible** – Drop `.ext` files in `extensions/` folder.
- **IDE Integration** – Works with Cursor, VSCode, and any OpenAI-compatible IDE.

---

## Installation

```bash
git clone https://github.com/1nj3ct04/ollama-connector.git
cd ollama-connector
chmod +x ollama_connector.sh
./ollama_connector.sh
```

### One-Line Setup (Linux/macOS)

```bash
curl -fsSL https://raw.githubusercontent.com/1nj3ct04/ollama-connector/main/install.sh | bash
```

---

## Usage

### Interactive Mode

```bash
./ollama_connector.sh
```

### CLI Flags

| Flag | Description |
|------|-------------|
| `--start` | Start the full agentic loop |
| `--resume` | Resume from last checkpoint |
| `--dashboard` | Start web dashboard on port 3000 |
| `--parallel "<prompt>"` | Run models in parallel |
| `--ide` | Full IDE integration |
| `--help` | Show help |

### Examples

```bash
# Start full agentic loop
./ollama_connector.sh --start

# Resume from checkpoint
./ollama_connector.sh --resume

# Run parallel models
./ollama_connector.sh --parallel "Write a Python function to sort a list"
```

---

## Project Structure

```
ollama-connector/
├── ollama_connector.sh          # Main entry point
├── src/
│   ├── core/                    # Core modules
│   │   ├── connector.sh         # Cursor/Ollama setup
│   │   ├── loop_engine.sh       # Main loop logic
│   │   ├── checkpoint.sh        # Save/Resume state
│   │   ├── oom_guard.sh         # Memory monitoring
│   │   ├── notifications.sh     # Desktop/Telegram alerts
│   │   ├── git_auto.sh          # Auto-commit
│   │   └── metrics.sh           # Metrics collection
│   ├── bin/                     # Executable scripts
│   │   ├── setup_cursor_ollama.sh
│   │   └── test_connector.sh
│   └── web/                     # Web dashboard
│       ├── server.js
│       └── package.json
├── config/                      # Configuration
├── extensions/                  # Drop-in extensions
└── docs/                        # Full documentation
```

---

## Configuration

Edit `~/.ollama_connector/config/settings.conf`:

```ini
OLLAMA_MODEL_DEFAULT="qwen2.5:7b"
OLLAMA_MODEL_FALLBACK="deepseek-r1:8b"
CURSOR_AUTO_START="true"
LOG_LEVEL="INFO"
THEME="dark"
AUTO_METRICS="true"
METRICS_INTERVAL="5"
MAX_ITERATIONS="50"
GIT_AUTO_COMMIT="true"
ENABLE_NOTIFICATIONS="true"
```

---

## Web Dashboard

The web dashboard runs on http://localhost:3000 and shows:

- Live iteration count
- Token usage & cost estimation
- RAM & CPU usage
- Real-time log stream
- Historical charts

Start it with:

```bash
./ollama_connector.sh --dashboard
```

---

## Extensions

Create a `.ext` file in `~/.ollama_connector/extensions/`:

```bash
# Description: My custom extension
echo "Loading my extension..."
my_custom_function() {
    echo "Hello from extension!"
}
```

Extensions are auto-loaded on startup.

---

## Performance Metrics

Metrics are stored in `~/.ollama_connector/data/metrics.json`:

```json
[
  {
    "timestamp": "2026-07-24T12:34:56Z",
    "iteration": 12,
    "total_tokens": 12345,
    "ram_percent": 68,
    "cpu_load": 1.2,
    "latency_ms": 145
  }
]
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Ollama not running | Run `ollama serve` in another terminal |
| RAM usage too high | Reduce `num_ctx` or use smaller model |
| Checkpoint not found | Run `--resume` after at least one successful iteration |
| Web dashboard not starting | Install Node.js: `sudo apt install nodejs npm` |
| Telegram notifications not working | Create `~/.ollama_connector/config/telegram.conf` with your bot token |

---

## Contributing

We welcome contributions! Please read CONTRIBUTING.md first.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open a Pull Request

---

## License

MIT License — see LICENSE for details.

---

## Author

**Mr. 1nj3ct04 ☠️**

- GitHub: [@1nj3ct04](https://github.com/1nj3ct04)
- Tagline: Write Yourselfer, Injector

---

Made with ☠️ and brain power.
