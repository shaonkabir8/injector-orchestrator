#!/usr/bin/env bash
#===============================================================
# checkpoint.sh – Checkpoint & Resume System
#===============================================================

save_checkpoint() {
    local iteration="$1"
    local code="$2"
    local tests="$3"
    local messages="$4"
    local cp_dir="$CHECKPOINT_DIR/iter_$(printf "%03d" "$iteration")"

    mkdir -p "$cp_dir"
    echo "$code"     > "$cp_dir/code.py"
    echo "$tests"    > "$cp_dir/test.py"
    echo "$messages" > "$cp_dir/messages.json"
    echo "$iteration" > "$cp_dir/iteration.txt"
    date -Iseconds    > "$cp_dir/timestamp.txt"

    log CHECK "Checkpoint saved: iteration $iteration"
}

load_checkpoint() {
    local latest
    latest=$(find "$CHECKPOINT_DIR" -maxdepth 1 -type d -name "iter_*" 2>/dev/null | sort -r | head -1)

    if [ -z "$latest" ]; then
        log WARN "No checkpoint found."
        return 1
    fi

    local iteration code tests messages
    iteration=$(cat "$latest/iteration.txt" 2>/dev/null || echo "0")
    code=$(cat      "$latest/code.py"      2>/dev/null || echo "")
    tests=$(cat     "$latest/test.py"      2>/dev/null || echo "")
    messages=$(cat  "$latest/messages.json" 2>/dev/null || echo "[]")

    echo "$iteration|$code|$tests|$messages"
    return 0
}

list_checkpoints() {
    log INFO "Saved checkpoints:"
    local found=0
    for cp_dir in "$CHECKPOINT_DIR"/iter_* ; do
        [ -d "$cp_dir" ] || continue
        found=1
        local iter ts size
        iter=$(cat "$cp_dir/iteration.txt" 2>/dev/null || echo "?")
        ts=$(cat   "$cp_dir/timestamp.txt" 2>/dev/null || echo "?")
        size=$(du -sh "$cp_dir" 2>/dev/null | cut -f1 || echo "?")
        echo -e "  Iteration \033[38;5;226m${iter}\033[0m — ${ts} — ${size}"
    done
    [ $found -eq 0 ] && log WARN "No checkpoints found."
}

resume_from_checkpoint() {
    log STEP "Resuming from checkpoint..."
    local cp_data
    cp_data=$(load_checkpoint)
    if [ $? -eq 0 ]; then
        IFS='|' read -r iteration code tests messages <<< "$cp_data"
        log CHECK "Resumed from iteration $iteration"
        ITERATION="$iteration"
        run_agentic_loop
    else
        log ERROR "No checkpoint found. Starting fresh."
        run_agentic_loop
    fi
}

delete_checkpoint() {
    local iteration="$1"
    local cp_dir="$CHECKPOINT_DIR/iter_$(printf "%03d" "$iteration")"
    if [ -d "$cp_dir" ]; then
        rm -rf "$cp_dir"
        log SUCCESS "Checkpoint $iteration deleted."
    else
        log WARN "Checkpoint $iteration not found."
    fi
}
