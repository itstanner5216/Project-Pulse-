#!/bin/bash
# Codex CLI Wrapper with Project-Specific Hook Activation
# Activates hooks once per session when first tool is called
# Version: 2.1.0 - Ubuntu 25.10 Edition

set -euo pipefail

# Configuration
readonly WRAPPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_MANAGER="$(dirname "$WRAPPER_DIR")/scripts/project-hook-manager.sh"
readonly CLI_NAME="codex"

# Export CLI name for hook manager
export CLI_NAME

# Check if hooks need activation (first tool call in session)
maybe_activate_hooks() {
    # Only activate if not already done in this session
    if [[ "${CLI_ENHANCER_HOOKS_ACTIVATED:-0}" -ne 1 ]]; then
        if [[ -x "$PROJECT_MANAGER" ]]; then
            # Activate hooks silently
            "$PROJECT_MANAGER" activate "$CLI_NAME" >/dev/null 2>&1 || true
            export CLI_ENHANCER_HOOKS_ACTIVATED=1
        fi
    fi
}

# Main wrapper function
main() {
    # Check if this is a tool call (not just CLI startup)
    local is_tool_call=0
    
    # Look for tool-related arguments or environment
    for arg in "$@"; do
        case "$arg" in
            edit|create|read|bash|shell|cmd|command|agent)
                is_tool_call=1
                break
                ;;
            --model|--prompt|*.md|*.txt|*.json|*.yaml|*.yml)
                is_tool_call=1
                break
                ;;
        esac
    done
    
    # Check CODEX specific environment variables
    if [[ -n "${CODEX_PROMPT:-}" ]] || [[ -n "${CODEX_MODEL:-}" ]]; then
        is_tool_call=1
    fi
    
    # Activate hooks on first tool call
    if [[ $is_tool_call -eq 1 ]]; then
        maybe_activate_hooks
    fi
    
    # Pass through to actual Codex CLI
    if command -v codex >/dev/null 2>&1; then
        exec codex "$@"
    else
        echo "[Codex Wrapper] Error: 'codex' command not found" >&2
        echo "[Codex Wrapper] Please install Codex CLI or ensure it's in your PATH" >&2
        exit 1
    fi
}

# If script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi