# Phases 09–13: Final Engine Reports

---

## Phase 09: Network Engine

**Module:** `engines/network_engine.sh`

**Capabilities:** Interface detection via `ip route`. RX/TX KB/s via `/proc/net/dev` delta. Open ports via `ss`.

**Architecture:** Runs in background subshell `(...) &` to prevent 1s sampling delay blocking the boot.

**Trade Off:** 1s delta sample for accurate throughput measurement. Acceptable because it's backgrounded.

**Security:** Read-only. No packet capture. No raw sockets.

**Future:** Easy to add per-process network usage via `nethogs` plugin.

---

## Phase 10: Security Engine

**Module:** `engines/security_engine.sh`

**Capabilities:** SSH root login check, fail2ban detection, UFW firewall status. Writes issues count and service states.

**Architecture:** Backgrounded `security_audit`. Reads system config files + uses `systemctl is-active`.

**Security:** Never modifies security configs. Strictly read-only observation.

**Future:** Can add CIS Benchmark checks, CVE scan integration, and certificate expiry checks as plugins.

---

## Phase 11: AI Engine (IIE)

**Module:** `engines/ai_engine.sh`

**Capabilities:** Evidence-based recommendations only. Reads all state JSON files and generates human-readable suggestions. Every recommendation carries `[SOURCE] [CONF:x] [REV:x]` labels.

**Constraints:** Strictly never hallucinate. Rule-based recommendations only fire on measurable thresholds (e.g., CPU > 85%).

**AI Model Recommendations:** Based on detected RAM, recommends appropriate local Ollama models.

**Ollama integration (IMPLEMENTED):** `ai_analyze_system` calls `get_ollama_recommendation`, which (when python3 + `requests`/`pyyaml` + a reachable Ollama API at `localhost:11434` are present) runs `idea_to_review/ollama_wrapper.py` and emits an `[OLLAMA] [CONF:MEDIUM]` recommendation. It fails closed and is skipped cleanly when any prerequisite is missing.

**Hydra Agent integration (IMPLEMENTED):** When a `hydra` binary is available (PATH or `bin/hydra`), `hydra doctor` output produces a `[HYDRA-AGENT] [CONF:HIGH]` hardware-optimized model recommendation.

**Future:** Multi-model routing (fast/reasoning/coding/external model selection) remains conceptual; current implementation uses Ollama + Hydra + rule-based sources.

---

## Phase 12: Audit Engine

**Module:** `engines/audit_engine.sh`

**Capabilities:** Generates timestamped Markdown audit reports from all engine state JSONs. Supports `[a]` keyboard shortcut from Mission Control.

**Architecture:** Separate `audit.log` for all lifecycle events. Reports saved to `~/.injector/logs/`.

**Future:** Reports can be exported to a Web Dashboard or emailed.

---

## Phase 13: Plugin Engine

**Module:** `engines/plugin_engine.sh`

**Capabilities:** Auto-discovers and loads any `.sh` plugin in `engines/plugins/`. Validates plugin contract (`plugin_init` function must exist).

**Plugin Contract (enforced):** `load_all_plugins` accepts a plugin only if it defines ALL of `plugin_name()`, `plugin_health()`, `plugin_audit()`, and `plugin_report()`. On acceptance, `plugin_init()` is run once (in a subshell). `plugin_list` also calls `plugin_health()`, and the background poll loop calls `plugin_report()` every 10s.

**Optional/extended hooks (supported, not enforced):** `plugin_info()`, `plugin_collect()`, `plugin_docs()`, `plugin_install()`, `plugin_remove()`. The `process_audit` and `safe_cleanup` plugins implement the extended set; `hydra_critic` and `model_pager` implement the enforced subset plus `info`/`init`.

**Architecture:** Fully decoupled. Plugins cannot modify the Injector constitution or bypass safety rules.

**Future:** Plugin marketplace concept. Kubernetes, Prometheus, Grafana, OpenWebUI plugins all possible.
