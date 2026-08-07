# Project Understanding Report

## Philosophy Analysis
- **Core philosophy:** "Don't Make Injector Bigger. Make Injector Wiser."
- **Identity:** A beautiful, intelligent, production-ready Terminal Operating Center.
- **Pillars:** Observe, Think, Orchestrate, Optimize, Evolve.
- **Constraints:** Must not be a bloated monolithic script or a basic htop/lazydocker clone.
- **AI Role:** AI must advise, explain, and recommend. It must never act destructively or automatically overwrite user decisions. User has final authority.

## Architecture Analysis
- **Structure:** Modular design with a Core Orchestrator at the center.
- **Engines (6):** System, AI, UI, Security, Configuration, Plugin.
- **Communication:** Engines do not control each other directly; they route through the Core Orchestrator.
- **Safety Pipeline:** Observe -> Verify -> Audit -> Recommend -> Confirm -> Backup -> Proceed.
- **Extensibility:** Built for plugins (Docker, PM2, Ollama) and future tech (Kubernetes, MCP, AI Agents) without altering the immutable core.

## Design Analysis
- **Aesthetic:** Apple simplicity meets Cyberpunk/Hacker Matrix vibes and Mission Control interfaces.
- **UI Elements:** Smooth animations, rounded Unicode borders, live charts, interactive widgets, and colorful status indicators.
- **Themes:** Injector, Hacker, Cyberpunk, Matrix, minimal, etc.
- **Feedback:** Progress bars must be animated and beautiful. Error messages must be clean and actionable.

## Implementation Analysis
- **Phased Approach:** 14 strict phases starting with Core Foundation -> Package Engine -> Configuration, etc. Never skip phases.
- **Language/Stack:** Terminal-based, primarily using shell scripting but orchestrated with software engineering rigor (defensive programming, shellcheck, robust error handling).
- **Dependencies:** Relies on existing tools (docker, htop, jq, curl, ollama) but wraps them in a unified, intelligent layer.
- **Startup:** Requires beautiful boot sequence, dependency checks, and auto-installation of missing tools.

## Risks
- **Performance:** Bash/Shell is notoriously slow for complex UI animations and asynchronous data polling. Flickering and CPU spikes are major risks.
- **Complexity:** Orchestrating many external tools synchronously can block the event loop and freeze the UI.
- **Scope Creep:** Tracking CPU, GPU, Docker, PM2, and AI simultaneously risks making the orchestrator the exact bloated tool it swears not to be.

## Improvements
- **Asynchronous Architecture:** Use named pipes, background jobs, or coprocesses to decouple data collection from UI rendering.
- **TUI Framework:** Strongly recommend using tools like `gum` (by Charmbracelet) or writing the UI engine in a more performant compiled language (Go/Rust) if pure Bash hits a wall.
- **Caching:** Cache AI recommendations and heavy system audit results to maintain minimal latency.

## Conflicts
- **Automated Actions vs. Safety:** The requirements state "Never perform destructive operations without confirmation" but also mandate "If packages are missing: install them automatically". Installing global packages alters system state and should ideally prompt for confirmation or sudo elevation first.
- **Tech Stack vs. UI Goals:** "Smooth animations", "Interactive widgets", and "Minimal latency" are highly conflicting with a pure shell script architecture.

## Missing Requirements
- **Permission Model:** How does Injector handle `sudo` elevation for package installations or deep network monitoring (e.g., `iftop`)?
- **Fallback Mode:** What happens if the host terminal does not support TrueColor, Unicode fonts, or advanced ANSI escapes?
- **Plugin Contract:** Specific data schemas (JSON/YAML structures) for how plugins communicate with the Core Orchestrator.

## Implementation Suggestions
- **Phase 01 (Core Foundation):** Focus purely on the event loop, state management, and logging. Build a robust `draw()` loop separate from a `poll()` loop.
- **Standardized IPC:** Use local JSON files or a lightweight in-memory store (like a Redis instance or simple RAM disk files) for inter-engine communication.
- **Error Boundaries:** Wrap every external command execution in a safety function that catches hangs, timeouts, and stderr.

## Future Concerns
- **Distro Fragmentation:** The Package Engine must handle `apt`, `pacman`, `dnf`, etc., which requires extensive OS detection logic.
- **AI Token Costs / Resource Usage:** If local AI (Ollama) constantly polls to analyze logs, it will spike the CPU/GPU, negating the "optimization" goal. AI polling must be on-demand or rate-limited.
