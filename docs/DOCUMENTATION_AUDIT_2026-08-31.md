# Documentation Audit — Injector Orchestrator

> Audit Date: 2026-08-31
> Scope: Root-level `.md` doctrine/spec files + cross-check against `engines/`, `system_monitor.sh`, `bin/`, and `docs/PHASE_*`.
> Method: Read every root `.md`, then verify claims against actual implementation. Truth states per COMPARE.md §11: VERIFIED / PARTIALLY VERIFIED / NOT VERIFIED / ASSUMED.
> Auditor note: This is a documentation & consistency audit, not a security pentest or runtime qualification.

---

## 1. Scope & Inventory

Root `.md` files reviewed (16):

| File | Role | Authority Tier |
|------|------|----------------|
| `THE_INJECTOR.md` | Immutable soul / identity | 1 (highest) |
| `CONSTITUTION.md` | Governing principles + priority order | 2 |
| `ARCHITECTURE.md` | Engine blueprint | 3 |
| `DESIGN.md` | Visual / UX language | 4 |
| `REQUIREMENT.md` | Build scope / implementation prompt | spec |
| `IMPLEMENTATION.md` | Phased build master-prompt | spec |
| `COMPARE.md` | "Earth Deployment Constitution" (agent doctrine v3) | parallel doctrine |
| `THE_INJECTOR_COMPARE.md` | Comparison doc | supporting |
| `INJECTOR_V2.md` / `INJECTOR_V3.md` | Version doctrine iterations | supporting |
| `features.md` | Capability system model | supporting |
| `gaps.md` | V2→V3 gap notes (working scratch) | scratch |
| `AGENT.md` | Agent definition | supporting |
| `CHANGELOG.md` | Change history | supporting |
| `usecase_implementation.md` | Use-case integration notes | scratch |
| `scratchpad_implementation_task.md` | Working scratch | scratch |

Implementation cross-checked: `system_monitor.sh` (entry), 13 engines in `engines/`, 4 plugins in `engines/plugins/`, `docs/PHASE_01..13` reports.

---

## 2. Overall Assessment

STATUS: PARTIALLY VERIFIED

The doctrine layer is unusually coherent and internally consistent: `THE_INJECTOR.md` → `CONSTITUTION.md` → `ARCHITECTURE.md` → `DESIGN.md` → `REQUIREMENT.md` form a clean priority chain, and the safety philosophy (Observe → Verify → Confirm → Backup → Proceed; never auto-destroy) is repeated consistently across all tiers. The implementation visibly honors the core safety stance (read-only engines, `set -e` deliberately avoided in the entry point with a documented rationale).

The main problems are (a) doc-vs-code drift where "future" features are already built, (b) two parallel and partly divergent doctrine systems, and (c) several unversioned scratch files living alongside frozen authority docs.

---

## 3. Findings

### F-1 — Doc/code drift: Ollama integration described as "future" but already implemented
TRUTH: VERIFIED · SEVERITY: MEDIUM

- `docs/PHASE_09_13_REPORT.md` (Phase 11) states: "Future: Can pipe to a running Ollama instance..."
- `features.md` §9 marks "AI / Model Routing (FUTURE)" and "Ollama (IIE) as the sole AI engine."
- Actual code: `engines/ai_engine.sh` implements `get_ollama_recommendation()`, curls `http://localhost:11434`, and emits `[OLLAMA]` labeled recommendations (lines ~9–73).

The live Ollama recommendation path exists today and is reachable: `init_ai_engine` → `ai_analyze_system` → `get_ollama_recommendation` (guarded by python3/deps/API-availability checks, falling back cleanly). It calls `idea_to_review/ollama_wrapper.py`. The docs understate the implemented capability. This is a reversed drift (code ahead of docs), less dangerous than the opposite but still misleading and contrary to the doctrine's own "never confuse claim with reality" principle.

Recommendation: Update Phase 11 report and `features.md` §9 to mark Ollama recommendation as IMPLEMENTED (SOURCE/CONFIDENCE labels already present in code), keeping multi-model routing as genuinely future.

### F-2 — Plugin contract: Phase 13 report documents the WRONG hooks (CORRECTED)
TRUTH: VERIFIED · SEVERITY: MEDIUM

> Correction note: An earlier draft of this finding claimed the runtime contract was `name/init/collect/info` and that plugins built from `features.md`/`COMPARE.md` would fail to load. That was based on an incomplete grep and is WRONG. Full function inventory below is the corrected, verified reading.

Enforced runtime contract (`engines/plugin_engine.sh` `load_all_plugins`): a plugin is accepted only if it defines ALL of `plugin_name`, `plugin_health`, `plugin_audit`, `plugin_report`. `plugin_list` additionally calls `plugin_health`; the poll loop calls `plugin_report`.

Actual plugin function inventory (verified via grep):
- `hydra_critic.sh`: name, info, init, report, health, audit ✅ compliant
- `model_pager.sh`: name, info, init, report, health, audit ✅ compliant
- `process_audit.sh`: name, info, docs, install, remove, health, audit, report, collect, init ✅ compliant (superset)
- `safe_cleanup.sh`: name, info, docs, install, remove, health, audit, report, collect, init ✅ compliant (superset)

So all four plugins load correctly; the plugin system is NOT broken.

The real drift is documentation:
- `docs/PHASE_09_13_REPORT.md` (Phase 13) states the contract is `plugin_name()/plugin_init()/plugin_collect()/plugin_info()` and that validation only requires `plugin_init`. This does NOT match the enforced hooks (`name/health/audit/report`). The Phase 13 report is simply wrong about the contract.
- `features.md` §7 and `COMPARE.md` §25 list `validate/install/configure/health/audit/report/remove/rollback/docs`. The two operational plugins (`process_audit`, `safe_cleanup`) largely follow this (they have docs/install/remove/health/audit/report); the two lighter plugins (`hydra_critic`, `model_pager`) implement only the enforced subset.

Recommendation: Fix the Phase 13 report to state the real enforced contract (`plugin_name + plugin_health + plugin_audit + plugin_report`, with `plugin_init` run on load). Optionally note `collect/docs/install/remove/rollback` as supported-but-not-enforced extensions.

### F-9 — Undocumented Hydra Agent (Rust) integration in AI engine
TRUTH: VERIFIED · SEVERITY: LOW-MEDIUM

`engines/ai_engine.sh` `ai_analyze_system` invokes an external `hydra` binary (`bin/hydra doctor`, or `$HOME/working_dir/injector-orchestrator/bin/hydra`) and emits `[HYDRA-AGENT]`-labeled hardware model recommendations. `bin/hydra` exists in the repo. This "Rust brain" integration is not described in any root doctrine doc, the phase reports, or `features.md`. It also hardcodes an absolute path under `$HOME/working_dir/...`, which is environment-specific and will silently no-op on other machines.

Recommendation: Document the Hydra Agent integration (what it is, that it's optional, its output contract) and replace the hardcoded absolute path with a repo-relative or configurable path.

### F-3 — Two parallel doctrine systems (5-pillar vs 7-pillar)
TRUTH: VERIFIED · SEVERITY: LOW-MEDIUM

- `THE_INJECTOR.md` / `CONSTITUTION.md` / `DESIGN.md` define FIVE immutable pillars: Observe, Think, Orchestrate, Optimize, Evolve — and explicitly say these "MUST NEVER change."
- `COMPARE.md` §10 defines SEVEN pillars: Observe, Think, Verify, Orchestrate, Optimize, Audit, Evolve.

`COMPARE.md` inserts Verify and Audit as top-level pillars. This is arguably an improvement (both are heavily emphasized project-wide), but it directly contradicts a clause marked IMMUTABLE in the highest-authority file. Either the five pillars are immutable or they are not; the two docs cannot both be authoritative as written.

Recommendation: Resolve the authority relationship between `THE_INJECTOR.md` and `COMPARE.md`. Either (a) fold Verify/Audit into the canonical set via an explicit amendment in `THE_INJECTOR.md`, or (b) mark `COMPARE.md` as a separate agent-persona doctrine, not a successor to the immutable soul.

### F-4 — Conflicting priority-order lists
TRUTH: VERIFIED · SEVERITY: LOW

- `CONSTITUTION.md` priority order starts at `CONSTITUTION.md` (1) and references `THEMES.md`, `UI_ENGINE.md`, `AI_ENGINE.md`, `PLUGINS.md`.
- `THE_INJECTOR.md` priority order places `THE_INJECTOR.md` at (1) and pushes CONSTITUTION to (2).
- Referenced files `THEMES.md`, `UI_ENGINE.md`, `AI_ENGINE.md`, `PLUGINS.md` do not exist as standalone root files — their content is embedded inside `CONSTITUTION.md` instead.

Recommendation: Reconcile the two priority lists (THE_INJECTOR's is presumably correct since it is the newer immutable layer) and either split out the referenced docs or update references to point at the embedded sections.

### F-5 — Scratch/working files mixed with frozen authority docs
TRUTH: VERIFIED · SEVERITY: LOW

- `gaps.md` opens with "Full comparison done mentally. Now writing V3:" — clearly a working note, not a spec.
- `scratchpad_implementation_task.md` and `usecase_implementation.md` are working documents living at repo root beside FROZEN authority files.

Recommendation: Move scratch/working notes to a `docs/notes/` or `idea_to_review/` subdir so the root contains only authoritative specs. (`idea_to_review/` already exists and holds `ollama_wrapper.py`.)

### F-6 — REQUIREMENT.md entry-point / naming claims match code
TRUTH: VERIFIED · SEVERITY: NONE (positive finding)

- `REQUIREMENT.md` declares entry point `./system_monitor.sh`; the file exists and is the entry point.
- The Easter-egg modes promised in `THE_INJECTOR.md` (`--injector`, `--coffee`, `--whoami`) are all implemented in `system_monitor.sh main()`. `--audit` is additionally implemented (documented in usage but not in the Easter-egg list — minor additive drift, harmless).

### F-7 — Safety doctrine honored in implementation
TRUTH: PARTIALLY VERIFIED · SEVERITY: NONE (positive finding)

- Engines examined (network, security, system) are read-only and documented as such; Phase reports repeatedly assert "never modifies," matching the constitutional "never auto-destroy" rule.
- `system_monitor.sh` deliberately avoids `set -e` with a written rationale about telemetry exit codes — evidence of considered engineering rather than accident.
- NOT fully verified: I did not execute the engines or audit every one of the 13 engines line-by-line. Destructive-safety of `safe_cleanup.sh` in particular (a plugin whose name implies mutation) was NOT verified and should be reviewed separately.

### F-8 — shellcheck compliance claimed but not verifiable here
TRUTH: NOT VERIFIED · SEVERITY: LOW

- `REQUIREMENT.md` mandates "shellcheck compliant" code and `system_monitor.sh` contains `# shellcheck source=` directives (good sign).
- `shellcheck` is not installed in this environment, so compliance could not be confirmed.

Recommendation: Add a CI step running `shellcheck engines/*.sh system_monitor.sh` to make the doctrine's own requirement enforceable.

---

## 4. Consistency Matrix

| Claim source | Claim | Code reality | State |
|--------------|-------|--------------|-------|
| Phase 11 / features.md | Ollama = future | Implemented in ai_engine.sh | CONTRADICTED |
| Phase 13 | contract: name/init/collect/info | Enforced contract is name/health/audit/report | CONTRADICTED |
| features.md §7 / COMPARE §25 | contract: validate/health/audit/report/... | health/audit/report enforced; rest supported-not-enforced | PARTIALLY CONSISTENT |
| ai_engine.sh | [HYDRA-AGENT] bin/hydra integration | Present in code, undocumented | UNDOCUMENTED |
| THE_INJECTOR | 5 immutable pillars | — | vs COMPARE 7 pillars |
| THE_INJECTOR | --injector/--coffee/--whoami | Implemented | CONSISTENT |
| REQUIREMENT | entry ./system_monitor.sh | Exists | CONSISTENT |
| REQUIREMENT | shellcheck compliant | Not testable here | UNVERIFIED |

---

## 5. Prioritized Recommendations

1. (MEDIUM) Fix the Ollama "future vs implemented" drift in Phase 11 report and `features.md` §9. — F-1
2. (MEDIUM) Fix the Phase 13 report: document the actually-enforced plugin contract (`plugin_name + plugin_health + plugin_audit + plugin_report`, `plugin_init` on load). — F-2
2b. (LOW-MED) Document the Hydra Agent (Rust) integration and de-hardcode its `$HOME/working_dir/...` path. — F-9
3. (LOW-MED) Resolve the 5-pillar vs 7-pillar authority conflict between `THE_INJECTOR.md` and `COMPARE.md`. — F-3
4. (LOW) Reconcile the two priority-order lists and fix references to non-existent `THEMES.md`/`UI_ENGINE.md`/`AI_ENGINE.md`/`PLUGINS.md`. — F-4
5. (LOW) Relocate scratch files (`gaps.md`, `scratchpad_implementation_task.md`, `usecase_implementation.md`) out of the authoritative root. — F-5
6. (LOW) Add a CI `shellcheck` gate to make the documented compliance requirement enforceable. — F-8
7. (SEPARATE REVIEW) Audit `engines/plugins/safe_cleanup.sh` for destructive-action safety against the constitutional "never auto-delete" rule. — F-7

---

## 6. Method & Limitations

- VERIFIED findings were confirmed by reading both the doc and the corresponding code/grep output.
- I did NOT run the application, did not execute any engine, and did not line-audit all 13 engines. Runtime behavior, actual shellcheck status, and plugin destructive-safety remain NOT VERIFIED.
- This audit covers documentation consistency and doc-vs-implementation drift only. It is not a security assessment or production-readiness qualification.
- No files were modified as part of this audit; this report is additive.