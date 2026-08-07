#!/usr/bin/env bash
#===============================================================
# loop_engine.sh – Main Agentic Loop Engine
#===============================================================

TOTAL_TOKENS=0
ITERATION=0
MESSAGES='[]'

call_ollama() {
    local prompt="$1"
    local model="${OLLAMA_MODEL_DEFAULT:-qwen2.5:7b}"
    local response

    response=$(curl -s http://localhost:11434/api/generate \
        -H "Content-Type: application/json" \
        -d "{\"model\":\"$model\",\"prompt\":\"$prompt\",\"stream\":false}" 2>/dev/null)

    if [ $? -ne 0 ] || [ -z "$response" ]; then
        log WARN "Primary model failed. Switching to fallback: $OLLAMA_MODEL_FALLBACK"
        model="$OLLAMA_MODEL_FALLBACK"
        response=$(curl -s http://localhost:11434/api/generate \
            -H "Content-Type: application/json" \
            -d "{\"model\":\"$model\",\"prompt\":\"$prompt\",\"stream\":false}" 2>/dev/null)
    fi

    echo "$response"
}

run_tests() {
    local code="$1"
    echo "$code" > /tmp/agent_test_$$.py
    if python3 -m pytest /tmp/agent_test_$$.py -q 2>&1; then
        rm -f /tmp/agent_test_$$.py
        return 0
    fi
    rm -f /tmp/agent_test_$$.py
    return 1
}

run_agentic_loop() {
    log STEP "Starting Agentic Loop..."
    check_ollama   || return 1
    configure_cursor || return 1
    auto_setup_env  || return 1

    ITERATION=0
    TOTAL_TOKENS=0

    log INFO "Max iterations: ${MAX_ITERATIONS:-50}"
    log INFO "Model: ${OLLAMA_MODEL_DEFAULT:-qwen2.5:7b}"

    local code="" tests=""
    read -r -p "$(echo -e "\033[38;5;226mEnter your task prompt: \033[0m")" user_prompt

    while [ "$ITERATION" -lt "${MAX_ITERATIONS:-50}" ]; do
        ITERATION=$((ITERATION + 1))
        log STEP "Iteration $ITERATION / ${MAX_ITERATIONS:-50}"

        check_oom || { log ERROR "OOM guard triggered. Saving checkpoint and exiting."; break; }

        local start_ms; start_ms=$(date +%s%3N)
        local response; response=$(call_ollama "$user_prompt\n\nPrevious code:\n$code")
        local end_ms; end_ms=$(date +%s%3N)
        local latency=$((end_ms - start_ms))

        code=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('response',''))" 2>/dev/null || echo "")
        local tokens; tokens=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('eval_count',0))" 2>/dev/null || echo "0")
        TOTAL_TOKENS=$((TOTAL_TOKENS + tokens))

        save_checkpoint "$ITERATION" "$code" "$tests" "$MESSAGES"
        collect_metrics "$latency" "$tokens"

        if run_tests "$code"; then
            log SUCCESS "Tests passed on iteration $ITERATION"
            if [ "${GIT_AUTO_COMMIT:-true}" = "true" ]; then
                git_auto_commit "$ITERATION" "$code"
            fi
            send_notification "Loop complete after $ITERATION iterations" "SUCCESS"
            break
        else
            log WARN "Tests failed on iteration $ITERATION. Improving..."
        fi
    done

    log INFO "Loop ended. Total tokens: $TOTAL_TOKENS"
}

start_web_dashboard() {
    local web_src
    web_src="$(dirname "$0")/src/web/server.js"
    if [ ! -f "$web_src" ]; then
        log ERROR "Web server not found: $web_src"
        return 1
    fi
    log INFO "Starting web dashboard on http://localhost:3000..."
    node "$web_src" &
    local dash_pid=$!
    echo "$dash_pid" > "$PID_FILE"
    log SUCCESS "Dashboard running. PID: $dash_pid"
    log INFO "Press Ctrl+C to stop"
    wait "$dash_pid"
}

run_parallel_models() {
    local prompt="${1:-Write a Python sorting function}"
    local models=("${OLLAMA_MODEL_DEFAULT:-qwen2.5:7b}" "${OLLAMA_MODEL_FALLBACK:-deepseek-r1:8b}")
    local pids=()

    log STEP "Running parallel models..."
    for model in "${models[@]}"; do
        (
            curl -s http://localhost:11434/api/generate \
                -H "Content-Type: application/json" \
                -d "{\"model\":\"$model\",\"prompt\":\"$prompt\",\"stream\":false}" \
                > "/tmp/parallel_${model//[:\/]/_}.json" 2>/dev/null
        ) &
        pids+=($!)
        log INFO "Model $model started (PID: $!)"
    done

    for pid in "${pids[@]}"; do
        wait "$pid"
    done

    log SUCCESS "All models completed. Comparing results..."
    for model in "${models[@]}"; do
        local f="/tmp/parallel_${model//[:\/]/_}.json"
        if [ -f "$f" ]; then
            local tokens; tokens=$(python3 -c "import json; d=json.load(open('$f')); print(d.get('eval_count',0))" 2>/dev/null || echo "0")
            log CHECK "$model — $tokens tokens"
            rm -f "$f"
        fi
    done
}
