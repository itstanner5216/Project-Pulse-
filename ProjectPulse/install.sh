#!/usr/bin/env bash
# HookSys v3.2 Installer
# Local-only project context system for Ubuntu 25.10
#
# CHANGELOG v3.1 -> v3.2:
# - UPGRADE: Shell integration now uses PROMPT_COMMAND (bash) / chpwd (zsh)
#   instead of aliasing cd - more reliable, less intrusive
# - UPGRADE: Smart root-change detection - only injects when project root changes
# - UPGRADE: Generates shell integration script for easy sourcing
# - Updated version to 3.2.0
#
# CHANGELOG v3.0 -> v3.1:
# - Updated version references
# - Added better shell integration options
# - Improved error handling

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${HOOKSYS_INSTALL_DIR:-$HOME/.local/share/hooksys}"
BIN_DIR="${HOME}/.local/bin"
CONFIG_DIR="${HOME}/.hooksys"

HOOKSYS_VERSION="3.2.0"

#=============================================================================
# Colors (if terminal supports)
#=============================================================================

if [[ -t 1 ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m'
else
    RED='' GREEN='' YELLOW='' BLUE='' NC=''
fi

info() { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

#=============================================================================
# Dependency Checking
#=============================================================================

check_dependencies() {
    info "Checking dependencies..."
    
    local missing_required=()
    local missing_optional=()
    
    # Required
    for cmd in bash find grep sed awk stat file; do
        if ! command -v "$cmd" &>/dev/null; then
            missing_required+=("$cmd")
        fi
    done
    
    # Check bash version
    local bash_version="${BASH_VERSION%%.*}"
    if [[ "$bash_version" -lt 4 ]]; then
        error "Bash 4.0+ required (found: $BASH_VERSION)"
        missing_required+=("bash-4.0+")
    fi
    
    # Optional
    for cmd in jq rg tree fzf flock; do
        if ! command -v "$cmd" &>/dev/null; then
            missing_optional+=("$cmd")
        fi
    done
    
    # Report
    if [[ ${#missing_required[@]} -gt 0 ]]; then
        error "Missing required dependencies: ${missing_required[*]}"
        echo ""
        echo "Install with:"
        echo "  sudo apt install coreutils findutils grep sed gawk file"
        exit 1
    fi
    
    success "Required dependencies OK"
    
    if [[ ${#missing_optional[@]} -gt 0 ]]; then
        warn "Missing optional dependencies: ${missing_optional[*]}"
        echo "    Install for better experience:"
        echo "    sudo apt install jq ripgrep tree fzf"
    else
        success "Optional dependencies OK"
    fi
}

#=============================================================================
# Shell Integration Script Generation
#=============================================================================

# Generate a shell integration script that uses PROMPT_COMMAND (bash) or
# chpwd_functions (zsh) instead of aliasing cd. This is more reliable and
# doesn't break other tools that depend on cd.
generate_shell_integration() {
    local integration_file="$INSTALL_DIR/shell-integration.sh"
    
    cat > "$integration_file" << 'SHELL_INTEGRATION'
#!/usr/bin/env bash
# HookSys v3.2 Shell Integration
# Source this file in your .bashrc or .zshrc for automatic context injection
#
# Features:
# - Detects when you enter/leave a project root (not just any cd)
# - Uses PROMPT_COMMAND (bash) or chpwd (zsh) - no cd aliasing
# - Only triggers injection once per session per root
# - Lightweight: only runs hooksys when root actually changes

# Skip if hooksys not in PATH
command -v hooksys &>/dev/null || return 0

# Track the last known project root to detect changes
_HOOKSYS_LAST_ROOT=""

# Main hook function - called after each command (bash) or on chdir (zsh)
_hooksys_check_root() {
    # Don't run in subshells (e.g., command substitution)
    [[ "$$" != "$BASHPID" ]] 2>/dev/null && return 0
    
    # Get current project root (fast - uses cache)
    local current_root
    current_root=$(hooksys root 2>/dev/null) || return 0
    
    # Only act if root changed
    if [[ "$current_root" != "$_HOOKSYS_LAST_ROOT" ]]; then
        _HOOKSYS_LAST_ROOT="$current_root"
        
        # Check if this root is in known roots (user opted in)
        if hooksys roots list 2>/dev/null | grep -qF "$current_root"; then
            # Inject context (respects session tracking - won't re-inject)
            hooksys inject 2>/dev/null || true
        fi
    fi
}

# Bash integration: use PROMPT_COMMAND
if [[ -n "${BASH_VERSION:-}" ]]; then
    # Append to PROMPT_COMMAND (don't replace existing)
    if [[ -z "${PROMPT_COMMAND:-}" ]]; then
        PROMPT_COMMAND="_hooksys_check_root"
    elif [[ "$PROMPT_COMMAND" != *"_hooksys_check_root"* ]]; then
        PROMPT_COMMAND="_hooksys_check_root;${PROMPT_COMMAND}"
    fi
fi

# Zsh integration: use chpwd_functions
if [[ -n "${ZSH_VERSION:-}" ]]; then
    # Add to chpwd_functions array (called on directory change)
    if [[ -z "${chpwd_functions[(r)_hooksys_check_root]:-}" ]]; then
        chpwd_functions+=(_hooksys_check_root)
    fi
fi

# Export for subshells
export _HOOKSYS_LAST_ROOT
SHELL_INTEGRATION

    chmod +x "$integration_file"
    success "Shell integration script: $integration_file"
}

#=============================================================================
# Installation
#=============================================================================

do_install() {
    info "Installing HookSys v${HOOKSYS_VERSION}..."
    
    # Create directories
    mkdir -p "$INSTALL_DIR"
    mkdir -p "$BIN_DIR"
    mkdir -p "$CONFIG_DIR/profiles"
    mkdir -p "$CONFIG_DIR/roots"
    mkdir -p "$CONFIG_DIR/cache"
    
    # Copy files
    cp -r "$SCRIPT_DIR/lib" "$INSTALL_DIR/"
    cp -r "$SCRIPT_DIR/hooks" "$INSTALL_DIR/"
    cp -r "$SCRIPT_DIR/bin" "$INSTALL_DIR/"
    cp -r "$SCRIPT_DIR/config" "$INSTALL_DIR/"
    
    # Copy tests if present
    [[ -d "$SCRIPT_DIR/tests" ]] && cp -r "$SCRIPT_DIR/tests" "$INSTALL_DIR/"
    
    # Make executable
    chmod +x "$INSTALL_DIR/bin/hooksys"
    chmod +x "$INSTALL_DIR/hooks/"*.sh
    [[ -f "$INSTALL_DIR/tests/run_tests.sh" ]] && chmod +x "$INSTALL_DIR/tests/run_tests.sh"
    
    # Create symlink
    ln -sf "$INSTALL_DIR/bin/hooksys" "$BIN_DIR/hooksys"
    
    # Copy default config if not exists
    if [[ ! -f "$CONFIG_DIR/config.json" ]]; then
        cp "$INSTALL_DIR/config/default.json" "$CONFIG_DIR/config.json"
    fi
    
    # Copy profiles if not exist
    for profile in default fast deep; do
        if [[ ! -f "$CONFIG_DIR/profiles/${profile}.json" ]]; then
            [[ -f "$INSTALL_DIR/config/profiles/${profile}.json" ]] && \
                cp "$INSTALL_DIR/config/profiles/${profile}.json" "$CONFIG_DIR/profiles/"
        fi
    done
    
    # Generate shell integration script
    generate_shell_integration
    
    success "Files installed to: $INSTALL_DIR"
    success "Symlink created: $BIN_DIR/hooksys"
    
    # Setup PATH and shell integration
    setup_path
    
    echo ""
    success "Installation complete!"
    echo ""
    echo "Quick start:"
    echo "  1. Restart your shell or run: source ~/.bashrc"
    echo "  2. Navigate to a project: cd /path/to/project"
    echo "  3. Add to known roots: hooksys roots add"
    echo "  4. Context will auto-inject on future visits!"
    echo ""
    echo "Manual commands:"
    echo "  hooksys inject      # Inject context now"
    echo "  hooksys context     # Sample project files"
    echo "  hooksys pulse       # Project health metrics"
    echo "  hooksys search X    # Search project"
    echo "  hooksys --help      # Full help"
}

setup_path() {
    local shell_rc=""
    local current_shell
    current_shell=$(basename "${SHELL:-bash}")
    
    case "$current_shell" in
        zsh)  shell_rc="$HOME/.zshrc" ;;
        bash) shell_rc="$HOME/.bashrc" ;;
        *)    shell_rc="$HOME/.bashrc" ;;
    esac
    
    # Check if PATH already includes bin dir
    if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
        if [[ -f "$shell_rc" ]]; then
            # Check if already added
            if ! grep -q "HOOKSYS" "$shell_rc" 2>/dev/null; then
                cat >> "$shell_rc" << EOF

# ─────────────────────────────────────────────────────────────────────────────
# HookSys v3.2 - Local Project Context System
# ─────────────────────────────────────────────────────────────────────────────
export PATH="\$HOME/.local/bin:\$PATH"

# Shell integration: auto-inject context when entering known project roots
# Uses PROMPT_COMMAND (bash) / chpwd (zsh) - not cd aliasing
# Comment out the next line to disable auto-injection:
[[ -f "$INSTALL_DIR/shell-integration.sh" ]] && source "$INSTALL_DIR/shell-integration.sh"
EOF
                success "PATH + shell integration added to: $shell_rc"
            else
                info "HookSys config already in: $shell_rc"
                # Check if shell integration needs updating
                if ! grep -q "shell-integration.sh" "$shell_rc" 2>/dev/null; then
                    echo "" >> "$shell_rc"
                    echo "# HookSys v3.2 shell integration (upgraded from v3.1)" >> "$shell_rc"
                    echo "[[ -f \"$INSTALL_DIR/shell-integration.sh\" ]] && source \"$INSTALL_DIR/shell-integration.sh\"" >> "$shell_rc"
                    success "Added shell integration to: $shell_rc"
                fi
            fi
        else
            warn "Could not find shell rc file. Add manually:"
            echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
            echo "  source $INSTALL_DIR/shell-integration.sh"
        fi
    else
        info "PATH already includes: $BIN_DIR"
    fi
}

#=============================================================================
# Uninstallation
#=============================================================================

do_uninstall() {
    info "Uninstalling HookSys..."
    
    # Remove symlink
    rm -f "$BIN_DIR/hooksys"
    
    # Remove installation
    rm -rf "$INSTALL_DIR"
    
    success "HookSys uninstalled"
    echo ""
    echo "Config preserved at: $CONFIG_DIR"
    echo "To remove config: rm -rf $CONFIG_DIR"
    echo ""
    echo "Remove HookSys section from ~/.bashrc or ~/.zshrc manually if desired."
}

#=============================================================================
# Verification
#=============================================================================

do_verify() {
    info "Verifying HookSys installation..."
    
    local errors=0
    
    # Check binary
    if [[ -x "$BIN_DIR/hooksys" ]]; then
        success "Binary: $BIN_DIR/hooksys"
    else
        error "Binary not found: $BIN_DIR/hooksys"
        ((++errors))
    fi
    
    # Check core files
    for file in lib/core.sh hooks/context-sampler.sh hooks/search.sh hooks/backup.sh; do
        if [[ -f "$INSTALL_DIR/$file" ]]; then
            success "File: $file"
        else
            error "File not found: $INSTALL_DIR/$file"
            ((++errors))
        fi
    done
    
    # Check shell integration
    if [[ -f "$INSTALL_DIR/shell-integration.sh" ]]; then
        success "Shell integration: $INSTALL_DIR/shell-integration.sh"
    else
        warn "Shell integration not found (run install to generate)"
    fi
    
    # Check config
    if [[ -d "$CONFIG_DIR" ]]; then
        success "Config dir: $CONFIG_DIR"
    else
        warn "Config dir not found: $CONFIG_DIR"
    fi
    
    # Test execution
    if command -v hooksys &>/dev/null; then
        local version
        version=$(hooksys --version 2>/dev/null || echo "error")
        if [[ "$version" == "hooksys $HOOKSYS_VERSION" ]]; then
            success "Version check: $version"
        else
            warn "Version mismatch: $version (expected: hooksys $HOOKSYS_VERSION)"
        fi
    else
        warn "hooksys not in PATH (restart shell or source ~/.bashrc)"
    fi
    
    echo ""
    if [[ $errors -eq 0 ]]; then
        success "Verification complete - no errors"
    else
        error "Verification found $errors error(s)"
        return 1
    fi
}

#=============================================================================
# Run Tests
#=============================================================================

do_test() {
    local test_script="$INSTALL_DIR/tests/run_tests.sh"
    
    if [[ ! -f "$test_script" ]]; then
        # Try source location
        test_script="$SCRIPT_DIR/tests/run_tests.sh"
    fi
    
    if [[ -f "$test_script" ]]; then
        info "Running test suite..."
        bash "$test_script" "$@"
    else
        error "Test suite not found"
        return 1
    fi
}

#=============================================================================
# Main
#=============================================================================

usage() {
    cat << EOF
HookSys v${HOOKSYS_VERSION} Installer

Usage: ./install.sh [command]

Commands:
  install     Install HookSys (default)
  uninstall   Remove HookSys
  verify      Verify installation
  deps        Check dependencies only
  test        Run test suite

Locations:
  Install:  $INSTALL_DIR
  Config:   $CONFIG_DIR
  Binary:   $BIN_DIR/hooksys

Shell Integration:
  v3.2 uses PROMPT_COMMAND (bash) / chpwd_functions (zsh) instead of
  aliasing cd. This is more reliable and won't interfere with other tools.
  
  Context auto-injects only when:
  1. You enter a directory that's a known root (hooksys roots add)
  2. The root changed since last check
  3. Context wasn't already injected this session
EOF
}

main() {
    local command="${1:-install}"
    shift || true
    
    case "$command" in
        install)
            check_dependencies
            do_install
            ;;
        uninstall|remove)
            do_uninstall
            ;;
        verify|check)
            do_verify
            ;;
        deps|dependencies)
            check_dependencies
            ;;
        test|tests)
            do_test "$@"
            ;;
        -h|--help|help)
            usage
            ;;
        *)
            error "Unknown command: $command"
            usage
            exit 1
            ;;
    esac
}

main "$@"
