#!/usr/bin/env bash
#===============================================================
# metrics.sh – Metrics Collection & Predictive Analysis
#===============================================================

declare -a TOKEN_HISTORY=()

collect_metrics() {
    local latency_ms="${1:-0}"
    local tokens="${2:-0}"

    TOKEN_HISTORY+=("$tokens")

    local ram_percent cpu_load
    ram_percent=$(free -m | awk '/^Mem:/{printf "%.1f", $3*100/$2}')
    cpu_load=$(uptime | awk -F'load average:' '{print $2}' | cut -d, -f1 | xargs)

    local json
    json=$(cat << EOF
{
  "timestamp": "$(date -Iseconds)",
  "iteration": ${ITERATION:-0},
  "total_tokens": ${TOTAL_TOKENS:-0},
  "tokens_this_iter": $tokens,
  "ram_percent": $ram_percent,
  "cpu_load": $cpu_load,
  "latency_ms": $latency_ms
}
EOF
)

    # Append to metrics file (keep as JSON array)
    if [ -f "$METRICS_FILE" ]; then
        local tmp; tmp=$(mktemp)
        python3 -c "
import json, sys
data = json.load(open('$METRICS_FILE'))
data.append(json.loads(sys.stdin.read()))
print(json.dumps(data, indent=2))
" <<< "$json" > "$tmp" && mv "$tmp" "$METRICS_FILE"
    fi

    log CHECK "Metrics: RAM=${ram_percent}%, CPU=${cpu_load}, tokens=${tokens}, latency=${latency_ms}ms"
    predictive_analysis "${TOKEN_HISTORY[@]}"
}

predictive_analysis() {
    local history=("$@")
    local count=${#history[@]}

    if [ "$count" -lt 3 ]; then
        return 0
    fi

    local total=0
    for t in "${history[@]}"; do
        total=$((total + t))
    done

    local avg=$((total / count))
    local remaining=$((${MAX_ITERATIONS:-50} - ${ITERATION:-0}))
    local predicted=$((avg * remaining))
    local cost; cost=$(python3 -c "print(f'\${${predicted}*0.002/1000000:.5f}')" 2>/dev/null || echo "0.00000")

    log CHECK "Prediction: ~${predicted} tokens, ~\$${cost} USD for remaining ${remaining} iterations"
}

show_metrics_summary() {
    if [ ! -f "$METRICS_FILE" ]; then
        log WARN "No metrics data found."
        return 0
    fi

    python3 << 'PYEOF'
import json

with open(METRICS_FILE) as f:
    data = json.load(f)

if not data:
    print("No metrics yet.")
else:
    total_tokens = sum(d.get("total_tokens", 0) for d in data)
    avg_ram = sum(float(d.get("ram_percent", 0)) for d in data) / len(data)
    avg_latency = sum(d.get("latency_ms", 0) for d in data) / len(data)
    print(f"Total tokens : {total_tokens}")
    print(f"Avg RAM      : {avg_ram:.1f}%")
    print(f"Avg latency  : {avg_latency:.0f}ms")
    print(f"Est. cost    : ${total_tokens * 0.002 / 1000000:.5f}")
PYEOF
}
