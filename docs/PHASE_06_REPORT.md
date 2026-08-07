# Phase 06: Docker Engine Report

## Documentation
- **Module:** `engines/docker_engine.sh`
- **Capabilities:** Collects Docker telemetry (containers, images). Provides `docker_safe_cleanup`.
- **Core Feature:** Exposes metrics to `docker_state.json` for UI consumption. Adheres strictly to the "Always ask: Are you sure?" safety requirement.

## Architecture
- Completely isolated telemetry loop. Fails gracefully if Docker is missing or daemon is down (outputs `0`).
- No direct coupling with `ui_engine.sh`; UI reads the `json` file instead of calling docker commands.

## Trade Off Analysis
- **Synchronous Docker CLI Calls:** Calling `docker ps` synchronously in the event loop might block UI slightly if the Docker daemon hangs. To fix in the future, telemetry dumping can be moved to an async coprocess or background job.

## Security Analysis
- No destructive commands (like `docker rm -f`) happen automatically. `docker_safe_cleanup` forces explicit user consent (Y/N prompt).
- Adheres to Immutable Constitution Pillar 2: "Security First."

## Production Analysis
- Graceful degradation: If `docker` command isn't available, UI just shows 0.

## Testing Strategies
- Used `xargs` to trim `wc -l` outputs so JSON doesn't contain bad whitespace leading to parsing errors.

## Future Compatibility
- Easy to extend `docker_state.json` with volume stats, network stats, and individual container CPU stats (via `docker stats`).

## Resource Usage Analysis
- Requires 3 subprocesses per poll (`docker ps`, `docker ps -aq`, `docker images`). Minimal latency overhead.
