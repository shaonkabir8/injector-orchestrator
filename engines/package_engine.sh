#!/usr/bin/env bash
# Injector Orchestrator - Package Engine (Phase 02)
# Author: Mr. 1nj3ct04

# Required Packages List
CORE_PACKAGES=("jq" "curl" "wget" "git" "unzip" "htop" "btop")

detect_package_manager() {
    if command -v apt-get >/dev/null 2>&1; then
        PKG_MANAGER="apt-get"
        PKG_INSTALL="sudo apt-get install -y"
        PKG_UPDATE="sudo apt-get update -y"
    elif command -v dnf >/dev/null 2>&1; then
        PKG_MANAGER="dnf"
        PKG_INSTALL="sudo dnf install -y"
        PKG_UPDATE="sudo dnf check-update"
    elif command -v pacman >/dev/null 2>&1; then
        PKG_MANAGER="pacman"
        PKG_INSTALL="sudo pacman -S --noconfirm"
        PKG_UPDATE="sudo pacman -Sy"
    else
        print_err "No supported package manager found (apt, dnf, pacman)."
        exit 1
    fi
    log_info "Detected package manager: $PKG_MANAGER"
}

check_dependencies() {
    local missing=()
    
    print_info "Scanning Core Packages..."
    
    for pkg in "${CORE_PACKAGES[@]}"; do
        if ! command -v "$pkg" >/dev/null 2>&1; then
            missing+=("$pkg")
        fi
    done
    
    local total=${#CORE_PACKAGES[@]}
    local missing_count=${#missing[@]}
    local found=$((total - missing_count))
    
    echo -e "${C_CYAN}Found Packages : ${found}${C_NC}"
    echo -e "${C_YELLOW}Missing : ${missing_count}${C_NC}"
    
    if [ ${missing_count} -gt 0 ]; then
        install_packages "${missing[@]}"
    else
        print_success "Everything Looks Great."
    fi
}

install_packages() {
    local pkgs=("$@")
    print_warn "Missing packages detected: ${pkgs[*]}"
    print_info "Requesting permission to install..."
    
    # Update first
    $PKG_UPDATE >/dev/null 2>&1 || true
    
    local total=${#pkgs[@]}
    local current=0
    
    for pkg in "${pkgs[@]}"; do
        current=$((current + 1))
        local pct=$((current * 100 / total))
        
        # Beautiful progress simulation
        local bar_length=20
        local filled=$((current * bar_length / total))
        local empty=$((bar_length - filled))
        local bar_str=$(printf "█%.0s" $(seq 1 $filled))$(printf "░%.0s" $(seq 1 $empty 2>/dev/null || true))
        
        echo -ne "\r${C_CYAN}Installing [${pkg}]: ${bar_str} ${pct}%${C_NC}"
        
        $PKG_INSTALL "$pkg" >/dev/null 2>&1 || {
            echo ""
            print_err "Failed to install: $pkg"
            log_err "Package Engine failed on: $pkg"
        }
    done
    echo ""
    print_success "Installation Completed."
    log_info "Package installation done."
}

init_package_engine() {
    log_info "Initializing Package Engine..."
    detect_package_manager
    check_dependencies
}
