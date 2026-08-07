# Troubleshooting

## Common Issues

### Ollama not running

```bash
ollama serve
```

Or start it in the background:

```bash
ollama serve > /tmp/ollama.log 2>&1 &
```

### RAM usage too high

Reduce context window or switch to a smaller model in `settings.conf`:

```bash
OLLAMA_MODEL_DEFAULT="llama3.2:3b"
OOM_THRESHOLD="80"
```

Or set `num_ctx` when calling Ollama:

```bash
export NUM_CTX="2048"
```

### Checkpoint not found

At least one iteration must complete successfully before a checkpoint is saved.
Check `~/.ollama_connector/checkpoints/` for existing saves:

```bash
ls ~/.ollama_connector/checkpoints/
```

### Web dashboard not starting

Install Node.js:

```bash
# Ubuntu/Debian
sudo apt install nodejs npm

# macOS
brew install node

# Verify
node --version
```

### Telegram notifications not working

Create `~/.ollama_connector/config/telegram.conf`:

```ini
TELEGRAM_BOT_TOKEN="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
TELEGRAM_CHAT_ID="123456789"
```

Get a token from [@BotFather](https://t.me/botfather) on Telegram.
Find your chat ID by messaging [@userinfobot](https://t.me/userinfobot).

### Git auto-commit fails

Ensure the target directory is a git repository:

```bash
cd ~/my-project
git init
git add .
git commit -m "initial"
```

Then set `GIT_TARGET_DIR` in `settings.conf` to point to your project.

### Extension not loading

Check file permissions:

```bash
chmod +x ~/.ollama_connector/extensions/*.ext
```

Ensure the first line is a valid comment:

```bash
# Description: My Extension Name
```

### ShellCheck warnings

Run ShellCheck to validate scripts:

```bash
shellcheck ollama_connector.sh src/**/*.sh
```

Fix any `SC2` warnings — they usually indicate quoting or variable expansion issues.
