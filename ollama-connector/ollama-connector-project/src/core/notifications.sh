#!/usr/bin/env bash
#===============================================================
# notifications.sh – Desktop & Telegram Alerts
#===============================================================

TELEGRAM_CONF="${HOME}/.ollama_connector/config/telegram.conf"

send_desktop_notification() {
    local title="$1"
    local msg="$2"
    local urgency="${3:-normal}"  # low, normal, critical

    if command -v notify-send &>/dev/null; then
        notify-send --urgency="$urgency" "☠️ $title" "$msg"
    elif command -v osascript &>/dev/null; then
        # macOS
        osascript -e "display notification \"$msg\" with title \"☠️ $title\""
    fi
}

send_telegram() {
    local msg="$1"

    if [ ! -f "$TELEGRAM_CONF" ]; then
        return 0
    fi

    local bot_token chat_id
    # shellcheck source=/dev/null
    source "$TELEGRAM_CONF"
    bot_token="${TELEGRAM_BOT_TOKEN:-}"
    chat_id="${TELEGRAM_CHAT_ID:-}"

    if [ -z "$bot_token" ] || [ -z "$chat_id" ]; then
        log WARN "Telegram not configured."
        return 0
    fi

    curl -s "https://api.telegram.org/bot${bot_token}/sendMessage" \
        -d "chat_id=${chat_id}" \
        -d "text=☠️ Ollama Connector: ${msg}" \
        -d "parse_mode=Markdown" > /dev/null 2>&1 || true
}

send_notification() {
    local msg="$1"
    local status="${2:-SUCCESS}"

    if [ "${ENABLE_NOTIFICATIONS:-true}" != "true" ]; then
        return 0
    fi

    local icon
    [ "$status" = "SUCCESS" ] && icon="✅" || icon="❌"
    local full_msg="${icon} ${msg}"

    send_desktop_notification "Ollama Connector" "$full_msg" \
        "$([ "$status" = "ERROR" ] && echo critical || echo normal)"
    send_telegram "$full_msg"
    log INFO "Notification sent: $full_msg"
}
