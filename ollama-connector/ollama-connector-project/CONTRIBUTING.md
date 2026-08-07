# Contributing to Ollama Connector ☠️

First off, thank you for considering contributing! 🎉

## Code of Conduct

Please be respectful and inclusive. We follow the [Contributor Covenant](https://www.contributor-covenant.org/).

## How to Contribute

### 1. Report Bugs

Open an issue with:
- Clear title and description
- Steps to reproduce
- Expected vs actual behavior
- Environment (OS, Ollama version, etc.)

### 2. Suggest Features

Open an issue with:
- Clear title and description
- Why this feature is useful
- How it should work (if you have ideas)

### 3. Submit Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing`
3. Make your changes
4. Test thoroughly (run `./src/bin/test_connector.sh`)
5. Update documentation
6. Commit with clear message
7. Push and open PR

## Development Setup

```bash
git clone https://github.com/1nj3ct04/ollama-connector.git
cd ollama-connector
chmod +x ollama_connector.sh
./ollama_connector.sh --help
```

## Code Style

- Use 4-space indentation
- Add comments for complex logic
- Follow ShellCheck recommendations
- Keep functions short and focused

## Testing

Run the test suite:

```bash
./src/bin/test_connector.sh
```

## Documentation

- Update README.md for user-facing changes
- Update `docs/` for technical changes
- Add inline comments in code

## Questions?

Open an issue or reach out to the maintainer.

Thank you for contributing! ☠️
