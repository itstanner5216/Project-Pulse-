#!/usr/bin/env bash
# ProjectPulse v3.2 - Unified CLI Entrypoint
# Local-only project context system for Ubuntu 25.10
#
# CHANGELOG v3.0 -> v3.2:
# - Updated version references
# - Added cache invalidation command
# - Enhanced error messaging

set -euo pipefail

# Resolve installation directory
if [[ -L "${BASH_SOURCE[0]}" ]]; then
    ProjectPulse_BIN="$(readlink -f "${BASH_SOURCE[0]}")"
else
    ProjectPulse_BIN="${BASH_SOURCE[0]}"
fi
ProjectPulse_Root="$(cd "$(dirname "$ProjectPulse_BIN")/.." && pwd)"

# Source core library
source "$ProjectPulse_Root/lib/core.sh"

#=============================================================================
# Help & Version
#=============================================================================

show_version() {
    echo "ProjectPulse $ProjectPulse_VERSION"
}

show_help() {
    cat << EOF
ProjectPulse v${ProjectPulse_VERSION} - Local-Only Project Context System

Usage: ProjectPulse <command> [options]

Context Commands (auto-inject once per Session):
  context      Sample project files for LLM context
  pulse        Project health metrics and activity
  recent       Recently modified files
  inject       Manually trigger full context injection

On-Demand Commands:
  search       Search project files (content or filenames)
  backup       Backup and restore files

Management Commands:
  Roots        Manage known project Roots
  Session      View/reset Session injection state
  config       Configuration management
  cache        Cache management (invalidate)

Options:
  -h, --help      Show this help
  -v, --version   Show version
  --debug         Enable debug output

Examples:
  ProjectPulse context -f code       # Sample code files only
  ProjectPulse search "TODO"         # Search for TODOs
  ProjectPulse pulse -q              # Quick project health
  ProjectPulse Roots add .           # Add current dir as known Root
  ProjectPulse Session reset         # Force re-injection
  ProjectPulse cache clear           # Clear Root cache

Environment:
  ProjectPulse_PROFILE      Active profile (default/fast/deep)
  ProjectPulse_ACTIVE_Root  Override project Root
  ProjectPulse_DEBUG        Enable debug output (1)
  ProjectPulse_QUIET        Suppress info messages (1)

Run 'ProjectPulse <command> --help' for command-specific help.
EOF
}

#=============================================================================
# Context Injection
#=============================================================================

do_inject() {
    local Root
    Root=$(find_project_Root)
    local force="${1:-false}"
    
    if [[ "$force" != "true" ]] && ! should_inject_context "$Root"; then
        _info "Context already injected for this Session. Use 'ProjectPulse Session reset' to force."
        return 0
    fi
    
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║              ProjectPulse CONTEXT INJECTION                       ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    echo "Project: $Root"
    echo "Profile: ${ProjectPulse_PROFILE:-default}"
    echo ""
    
    # Run context hooks
    echo "─── Context Sample ───────────────────────────────────────────"
    "$ProjectPulse_Root/hooks/context-sampler.sh" "$Root"
    echo ""
    
    echo "─── Project Pulse ────────────────────────────────────────────"
    "$ProjectPulse_Root/hooks/project-pulse.sh" -q "$Root"
    echo ""
    
    echo "─── Recent Files ─────────────────────────────────────────────"
    "$ProjectPulse_Root/hooks/recent-files.sh" -n 10 "$Root"
    echo ""
    
    # Mark as injected
    mark_context_injected "$Root"
    
    echo "════════════════════════════════════════════════════════════════"
    echo "Context injection complete."
}

#=============================================================================
# Roots Subcommand
#=============================================================================

cmd_Roots() {
    local subcmd="${1:-list}"
    shift || true
    
    case "$subcmd" in
        add)
            Roots_add "${1:-$PWD}"
            ;;
        rm|remove)
            Roots_rm "${1:-$PWD}"
            ;;
        list|ls)
            echo "=== Known Roots ==="
            Roots_list
            ;;
        pick|select)
            Roots_pick
            ;;
        set)
            [[ -z "${1:-}" ]] && _die "Usage: ProjectPulse Roots set <path>"
            Roots_set_active "$1"
            ;;
        -h|--help|help)
            cat << EOF
Usage: ProjectPulse Roots <subcommand> [path]

Manage known project Roots.

Subcommands:
  add [path]     Add path as known Root (default: current dir)
  rm [path]      Remove path from known Roots
  list           List all known Roots
  pick           Interactive selection (fzf or numbered)
  set <path>     Set active Root for this Session

Examples:
  ProjectPulse Roots add ~/projects/myapp
  ProjectPulse Roots list
  ProjectPulse Roots pick
EOF
            ;;
        *)
            _die "Unknown Roots subcommand: $subcmd"
            ;;
    esac
}

#=============================================================================
# Session Subcommand
#=============================================================================

cmd_Session() {
    local subcmd="${1:-status}"
    shift || true
    
    case "$subcmd" in
        status)
            Session_status
            ;;
        reset)
            reset_Session "${1:-}"
            ;;
        -h|--help|help)
            cat << EOF
Usage: ProjectPulse Session <subcommand>

Manage Session injection state.

Subcommands:
  status         Show current Session status
  reset [Root]   Reset injection state (all or specific Root)

The Session system ensures context injection happens only once per
shell Session per project Root. Use 'reset' to force re-injection.
EOF
            ;;
        *)
            _die "Unknown Session subcommand: $subcmd"
            ;;
    esac
}

#=============================================================================
# Config Subcommand
#=============================================================================

cmd_config() {
    local subcmd="${1:-show}"
    shift || true
    
    case "$subcmd" in
        show)
            show_config
            ;;
        profile)
            local profile="${1:-}"
            if [[ -z "$profile" ]]; then
                echo "Current profile: ${ProjectPulse_PROFILE:-default}"
                echo ""
                echo "Available profiles:"
                echo "  default  - Balanced settings"
                echo "  fast     - Quick sampling, smaller output"
                echo "  deep     - Thorough analysis, larger output"
            else
                export ProjectPulse_PROFILE="$profile"
                echo "Profile set: $profile"
                echo "Note: Add to shell rc for persistence:"
                echo "  export ProjectPulse_PROFILE=$profile"
            fi
            ;;
        init)
            init_project_config
            ;;
        get)
            local key="${1:-}"
            local default="${2:-}"
            [[ -z "$key" ]] && _die "Usage: ProjectPulse config get <key> [default]"
            get_config_value "$key" "$default"
            ;;
        -h|--help|help)
            cat << EOF
Usage: ProjectPulse config <subcommand>

Configuration management.

Subcommands:
  show             Show effective configuration
  profile [name]   Get/set active profile (default/fast/deep)
  init             Create .ProjectPulse.json in project Root
  get <key> [def]  Get specific config value

Config Resolution Order (highest priority first):
  1. Project: .ProjectPulse.json or .ProjectPulse/config.json
  2. Profile: ~/.ProjectPulse/profiles/<profile>.json
  3. Global:  ~/.ProjectPulse/config.json
  4. Builtin: hardcoded defaults
EOF
            ;;
        *)
            _die "Unknown config subcommand: $subcmd"
            ;;
    esac
}

#=============================================================================
# Cache Subcommand
#=============================================================================

cmd_cache() {
    local subcmd="${1:-status}"
    shift || true
    
    case "$subcmd" in
        status)
            local cache_file="$ProjectPulse_CACHE/Roots.cache"
            echo "=== Cache Status ==="
            echo "Cache directory: $ProjectPulse_CACHE"
            if [[ -f "$cache_file" ]]; then
                local entries
                entries=$(wc -l < "$cache_file")
                local age
                age=$(( $(_now) - $(stat -c %Y "$cache_file" 2>/dev/null || echo 0) ))
                echo "Root cache entries: $entries"
                echo "Cache age: $((age / 60)) minutes"
            else
                echo "Root cache: (empty)"
            fi
            ;;
        clear|invalidate)
            invalidate_cache
            echo "Cache cleared"
            ;;
        -h|--help|help)
            cat << EOF
Usage: ProjectPulse cache <subcommand>

Cache management.

Subcommands:
  status     Show cache status
  clear      Clear all cached data

The cache stores project Root lookups to speed up repeated operations.
Cache entries expire after 24 hours or when cleared manually.
EOF
            ;;
        *)
            _die "Unknown cache subcommand: $subcmd"
            ;;
    esac
}

#=============================================================================
# Main Dispatch
#=============================================================================

main() {
    # Global options
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --debug)
                export ProjectPulse_DEBUG=1
                shift ;;
            --quiet)
                export ProjectPulse_QUIET=1
                shift ;;
            -v|--version)
                show_version
                exit 0 ;;
            -h|--help)
                show_help
                exit 0 ;;
            -*)
                # Unknown global option - might be command-specific
                break ;;
            *)
                break ;;
        esac
    done
    
    local command="${1:-help}"
    shift || true
    
    case "$command" in
        # Context hooks
        context|ctx)
            exec "$ProjectPulse_Root/hooks/context-sampler.sh" "$@"
            ;;
        pulse|health)
            exec "$ProjectPulse_Root/hooks/project-pulse.sh" "$@"
            ;;
        recent|rec)
            exec "$ProjectPulse_Root/hooks/recent-files.sh" "$@"
            ;;
        
        # On-demand hooks
        search|grep|find)
            exec "$ProjectPulse_Root/hooks/search.sh" "$@"
            ;;
        backup|bak)
            exec "$ProjectPulse_Root/hooks/backup.sh" "$@"
            ;;
        
        # Management
        Roots|Root)
            cmd_Roots "$@"
            ;;
        Session|sess)
            cmd_Session "$@"
            ;;
        config|cfg)
            cmd_config "$@"
            ;;
        cache)
            cmd_cache "$@"
            ;;
        
        # Full injection
        inject|inj)
            local force="false"
            [[ "${1:-}" == "-f" || "${1:-}" == "--force" ]] && force="true"
            do_inject "$force"
            ;;
        
        # Help
        help|-h|--help)
            show_help
            ;;
        version)
            show_version
            ;;
        
        *)
            _error "Unknown command: $command"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

main "$@"
