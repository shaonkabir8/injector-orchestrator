#!/usr/bin/env bash
#===============================================================
# git_auto.sh – Git Auto-Commit on passing iterations
#===============================================================

git_auto_commit() {
    local iteration="$1"
    local code="$2"

    if [ "${GIT_AUTO_COMMIT:-true}" != "true" ]; then
        return 0
    fi

    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        log WARN "Not a git repository. Skipping auto-commit."
        return 0
    fi

    if ! command -v git &>/dev/null; then
        log WARN "git not found. Skipping auto-commit."
        return 0
    fi

    local tmp_file="/tmp/agent_code_${iteration}.py"
    echo "$code" > "$tmp_file"

    local target_dir="${GIT_TARGET_DIR:-./src}"
    mkdir -p "$target_dir"
    cp "$tmp_file" "$target_dir/agent_output_${iteration}.py"
    rm -f "$tmp_file"

    git add "$target_dir/agent_output_${iteration}.py" 2>/dev/null || true

    local commit_msg="feat(agent): iteration ${iteration} — tests passing [skip ci]"
    if git commit -m "$commit_msg" 2>/dev/null; then
        log SUCCESS "Auto-committed: $commit_msg"
    else
        log WARN "Nothing to commit for iteration $iteration"
    fi
}

git_status_check() {
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        log WARN "Not inside a git repository."
        return 1
    fi

    local branch
    branch=$(git branch --show-current 2>/dev/null || echo "unknown")
    local commits
    commits=$(git rev-list HEAD --count 2>/dev/null || echo "0")

    log INFO "Git status — branch: $branch, commits: $commits"
    return 0
}
