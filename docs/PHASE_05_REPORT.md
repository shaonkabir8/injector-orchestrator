# Phase 05: Terminal UI Engine Report

## Documentation
- **Module:** `engines/ui_engine.sh`
- **Capabilities:** Displays terminal widgets, layout structures, and animated progress bars.
- **Core Feature:** `start_ui_loop` rendering an Apple-meets-Cyberpunk Mission Control dashboard.

## Architecture
- Separates view logic from data polling (`draw_mission_control` strictly reads JSON state).
- Implements anti-flicker strategy using ANSI cursor jumps (`\033[H`) rather than full `clear` commands in the tight loop.
- Dynamic color casting on progress bars (Green -> Yellow -> Red) based on threshold logic.

## Trade Off Analysis
- **Synchronous polling:** Inside `start_ui_loop`, polling (`sys_collect_telemetry`) block execution for 0.1s before UI render. While not entirely asynchronous, it is sufficient for the 1-second refresh cycle goal without adding subshell complexity.

## Security Analysis
- UI is strictly read-only display. Safe mode default applied.

## Production Analysis
- Captures and restores cursor state (`\033[?25l` / `\033[?25h`) automatically upon exit traps so the user's terminal isn't broken on interrupt.
- Aligns perfectly inside rounded unicode box structures.

## Testing Strategies
- Validated fixed-width spacing (`%3s` padding) to prevent layout shifting when usage crosses 10% or 100%.

## Future Compatibility
- The central frame can easily be divided into dual panes (btop style) when we add Docker Engine stats in Phase 06.

## Resource Usage Analysis
- Minimally invasive loop, sleeps during `read -t 1` avoiding CPU spin.
