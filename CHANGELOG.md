# CHANGELOG

## [3.0.0] - 2026-08-08

### Added
- `INJECTOR_V3.md`: Earth Deployment Constitution & Phase Map.
- `engines/core_helper.sh`: Centralized risk-adaptive execution (`safe_execute`) & truth engine (`probe_truth`).
- Dynamic truth states (`VERIFIED`, `ASSUMED`, `UNKNOWN`) in all telemetry JSON state files.
- Structured AI metadata (`[SOURCE]`, `[CONF]`, `[REV]`, `Evidence`) in `ai_state.json`.
- Dynamic subshell plugin loader in `plugin_engine.sh` to prevent namespace collision.
- V3 compliance hooks in `safe_cleanup.sh` and `process_audit.sh` plugins.
- `usecase_implementation.md`: Complete Hydra-Agent audit & usecase implementation map.
- `engines/plugins/hydra_critic.sh`: V3 AST code verification plugin.
- `engines/plugins/model_pager.sh`: V3 RAM-aware Ollama model paging plugin.
- `engines/core_helper.sh`: `sop_execute` helper applying Hydra SOP branch semantics.
- `bin/hydra`: Compiled Hydra-Agent v1.0.0 Rust release binary.
- SentryBill CI Gate: Added Hydra AST Critic Gate integration script.

### Changed
- Sourced `core_helper.sh` in `system_monitor.sh`.
- Upgraded `service_control` (`services_engine.sh`) to use risk-adaptive execution (Medium/High).
- Upgraded `docker_safe_cleanup` (`docker_engine.sh`) to use safe High-risk execution.
- Configured audit engine (`audit_engine.sh`) to query and print truth states and active plugin telemetry.
- Upgraded IIE (`ai_engine.sh`) to support Hydra Rust agent recommendations.
