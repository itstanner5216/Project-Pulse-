#!/usr/bin/env bash
#===============================================================================
# ProjectPulse v4.0.0-phase1 Merkle Tree Change Detection
# Git-free change detection using content-addressable hashing
#
# Exports:
#   merkle_root()       - Get deterministic root hash of all tracked files
#   merkle_snapshot()   - Save current state to snapshot file
#   merkle_load()       - Load snapshot from file
#   merkle_diff()       - Compare current state to snapshot, return changes
#   merkle_changed_files() - Return JSON object with added/modified/deleted
#===============================================================================

set -euo pipefail

# Resolve script directory and source core library if needed
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source core library if not already loaded
if ! declare -f json_escape &>/dev/null; then
    # shellcheck source=lib/core.sh
    source "${SCRIPT_DIR}/core.sh"
fi

#===============================================================================
# Configuration
#===============================================================================

MERKLE_DIR="${ProjectPulse_Root}/.ProjectPulse/merkle"
MERKLE_SNAPSHOT_FILE="${MERKLE_DIR}/snapshot"
MERKLE_HASH_ALG="sha256sum"

#===============================================================================
# Core Hashing Functions
#===============================================================================

# Compute hash of file content
file_hash() {
    local filepath="$1"
    
    if [[ -f "$filepath" ]]; then
        $MERKLE_HASH_ALG "$filepath" 2>/dev/null | cut -d' ' -f1
    else
        echo "deleted"
    fi
}

# Compute hash of a string
string_hash() {
    local str="$1"
    printf '%s' "$str" | $MERKLE_HASH_ALG | cut -d' ' -f1
}

#===============================================================================
# File Enumeration (respects ignore patterns)
#===============================================================================

# Get all tracked files (sorted, relative paths)
get_tracked_files() {
    load_ignore_patterns
    
    local files=()
    
    # Use find to enumerate files
    while IFS= read -r file; do
        [[ -z "$file" ]] && continue
        
        # Get relative path
        local relpath
        if [[ "$file" == "$ProjectPulse_Root/"* ]]; then
            relpath="${file#"$ProjectPulse_Root/"}"
        else
            relpath="$file"
        fi
        
        # Skip ignored files
        if should_ignore "$relpath"; then
            continue
        fi
        
        # Skip the .ProjectPulse directory
        if [[ "$relpath" == ".ProjectPulse"* ]]; then
            continue
        fi
        
        files+=("$relpath")
    done < <(find "$ProjectPulse_Root" -type f 2>/dev/null)
    
    # Output sorted (deterministic ordering)
    printf '%s\n' "${files[@]}" | LC_ALL=C sort -u
}

# Build file->hash mapping for current state
build_file_hashes() {
    local -A hashes=()
    
    while IFS= read -r relpath; do
        [[ -z "$relpath" ]] && continue
        local abs_path="${ProjectPulse_Root}/${relpath}"
        local hash
        hash=$(file_hash "$abs_path")
        printf '%s\t%s\n' "$relpath" "$hash"
    done < <(get_tracked_files)
}

#===============================================================================
# Merkle Root Computation
#===============================================================================

# Compute deterministic merkle root hash
# Algorithm: Sort files, hash each file content, concatenate all path:hash pairs, hash result
merkle_root() {
    local combined=""
    
    while IFS=$'\t' read -r relpath hash; do
        [[ -z "$relpath" ]] && continue
        combined+="${relpath}:${hash};"
    done < <(build_file_hashes)
    
    if [[ -z "$combined" ]]; then
        # Empty project - return zero hash
        echo "0000000000000000000000000000000000000000000000000000000000000000"
        return 0
    fi
    
    string_hash "$combined"
}

#===============================================================================
# Snapshot Management
#===============================================================================

# Save current state to snapshot
merkle_snapshot() {
    local snapshot_name="${1:-default}"
    local snapshot_file="${MERKLE_DIR}/${snapshot_name}.snapshot"
    
    # Create merkle directory if needed
    mkdir -p "$MERKLE_DIR"
    
    # Write snapshot header
    {
        printf '# ProjectPulse Merkle Snapshot\n'
        printf '# Created: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
        printf '# Root: %s\n' "$ProjectPulse_Root"
        printf '# Format: relpath<TAB>hash\n'
        printf '#\n'
        
        # Write file hashes
        build_file_hashes
    } > "$snapshot_file"
    
    # Also save the root hash
    local root_hash
    root_hash=$(merkle_root)
    printf '%s' "$root_hash" > "${MERKLE_DIR}/${snapshot_name}.root"
    
    printf '%s' "$snapshot_file"
}

# Load snapshot from file
# Returns: outputs path:hash lines to stdout
merkle_load() {
    local snapshot_name="${1:-default}"
    local snapshot_file="${MERKLE_DIR}/${snapshot_name}.snapshot"
    
    if [[ ! -f "$snapshot_file" ]]; then
        return 1
    fi
    
    # Skip comment lines, output path:hash
    grep -v '^#' "$snapshot_file" | grep -v '^$'
}

# Get saved root hash
merkle_saved_root() {
    local snapshot_name="${1:-default}"
    local root_file="${MERKLE_DIR}/${snapshot_name}.root"
    
    if [[ -f "$root_file" ]]; then
        cat "$root_file"
    else
        echo ""
    fi
}

#===============================================================================
# Change Detection
#===============================================================================

# Compare current state to snapshot and return changes
# Output: JSON object with added, modified, deleted arrays
merkle_changed_files() {
    local snapshot_name="${1:-default}"
    
    # Load snapshot into associative array
    declare -A snapshot_hashes=()
    declare -A current_hashes=()
    
    # Load snapshot
    if merkle_load "$snapshot_name" &>/dev/null; then
        while IFS=$'\t' read -r relpath hash; do
            [[ -z "$relpath" ]] && continue
            snapshot_hashes["$relpath"]="$hash"
        done < <(merkle_load "$snapshot_name")
    fi
    
    # Build current state
    while IFS=$'\t' read -r relpath hash; do
        [[ -z "$relpath" ]] && continue
        current_hashes["$relpath"]="$hash"
    done < <(build_file_hashes)
    
    # Arrays for changes
    local added=()
    local modified=()
    local deleted=()
    
    # Find added and modified files
    for relpath in "${!current_hashes[@]}"; do
        local current_hash="${current_hashes[$relpath]}"
        
        if [[ -z "${snapshot_hashes[$relpath]:-}" ]]; then
            # File not in snapshot = added
            added+=("$(printf '{"file":"%s","hash":"%s"}' \
                "$(json_escape "$relpath")" \
                "$current_hash")")
        elif [[ "${snapshot_hashes[$relpath]}" != "$current_hash" ]]; then
            # Hash changed = modified
            modified+=("$(printf '{"file":"%s","hash":"%s"}' \
                "$(json_escape "$relpath")" \
                "$current_hash")")
        fi
    done
    
    # Find deleted files
    for relpath in "${!snapshot_hashes[@]}"; do
        if [[ -z "${current_hashes[$relpath]:-}" ]]; then
            deleted+=("$(printf '{"file":"%s","hash":"deleted"}' \
                "$(json_escape "$relpath")")")
        fi
    done
    
    # Build JSON output
    local added_json modified_json deleted_json
    
    # Build added array
    added_json="["
    local first=1
    for item in "${added[@]}"; do
        [[ $first -eq 0 ]] && added_json+=","
        added_json+="$item"
        first=0
    done
    added_json+="]"
    
    # Build modified array
    modified_json="["
    first=1
    for item in "${modified[@]}"; do
        [[ $first -eq 0 ]] && modified_json+=","
        modified_json+="$item"
        first=0
    done
    modified_json+="]"
    
    # Build deleted array
    deleted_json="["
    first=1
    for item in "${deleted[@]}"; do
        [[ $first -eq 0 ]] && deleted_json+=","
        deleted_json+="$item"
        first=0
    done
    deleted_json+="]"
    
    # Combine into result
    printf '{"added":%s,"modified":%s,"deleted":%s}' \
        "$added_json" "$modified_json" "$deleted_json"
}

# Check if there are any changes since snapshot
merkle_has_changes() {
    local snapshot_name="${1:-default}"
    
    local current_root saved_root
    current_root=$(merkle_root)
    saved_root=$(merkle_saved_root "$snapshot_name")
    
    if [[ -z "$saved_root" ]]; then
        # No snapshot exists = everything is new
        return 0
    fi
    
    if [[ "$current_root" != "$saved_root" ]]; then
        return 0  # Has changes
    fi
    
    return 1  # No changes
}

# Get summary statistics of changes
merkle_stats() {
    local snapshot_name="${1:-default}"
    local changes
    changes=$(merkle_changed_files "$snapshot_name")
    
    # Count each category (without jq)
    local added_count modified_count deleted_count
    added_count=$(printf '%s' "$changes" | grep -o '"file"' | head -n 100 | wc -l || echo 0)
    
    # More precise counting by parsing the JSON structure
    local in_added=0 in_modified=0 in_deleted=0
    added_count=0
    modified_count=0
    deleted_count=0
    
    # Simple state machine to count files in each array
    local current_section=""
    while IFS= read -r char; do
        case "$char" in
            '"added"')
                current_section="added"
                ;;
            '"modified"')
                current_section="modified"
                ;;
            '"deleted"')
                current_section="deleted"
                ;;
        esac
    done <<< "$(printf '%s' "$changes" | grep -o '"[a-z]*"')"
    
    # Simpler approach: count occurrences in each section
    local added_section modified_section deleted_section
    added_section=$(printf '%s' "$changes" | sed 's/.*"added":\[\([^]]*\)\].*/\1/')
    modified_section=$(printf '%s' "$changes" | sed 's/.*"modified":\[\([^]]*\)\].*/\1/')
    deleted_section=$(printf '%s' "$changes" | sed 's/.*"deleted":\[\([^]]*\)\].*/\1/')
    
    added_count=$(printf '%s' "$added_section" | grep -o '"file"' | wc -l || echo 0)
    modified_count=$(printf '%s' "$modified_section" | grep -o '"file"' | wc -l || echo 0)
    deleted_count=$(printf '%s' "$deleted_section" | grep -o '"file"' | wc -l || echo 0)
    
    printf '{"added":%d,"modified":%d,"deleted":%d,"total":%d}' \
        "$added_count" "$modified_count" "$deleted_count" \
        "$((added_count + modified_count + deleted_count))"
}

#===============================================================================
# CLI Interface
#===============================================================================

merkle_cli_help() {
    cat <<EOF
Usage: merkle.sh <command> [options]

Commands:
  root                  Compute and print merkle root hash
  snapshot [name]       Save current state to snapshot (default: 'default')
  diff [name]          Show changes since snapshot
  stats [name]         Show change statistics
  has-changes [name]   Exit 0 if changes exist, 1 otherwise

Options:
  --json               Output in JSON format
  --help, -h           Show this help

Examples:
  merkle.sh root
  merkle.sh snapshot
  merkle.sh diff --json
  merkle.sh has-changes && echo "Changes detected"
EOF
}

merkle_cli() {
    local cmd="${1:-}"
    local json_output=0
    local snapshot_name="default"
    
    shift || true
    
    # Parse remaining arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --json)
                json_output=1
                shift
                ;;
            --help|-h)
                merkle_cli_help
                return 0
                ;;
            -*)
                printf 'Unknown option: %s\n' "$1" >&2
                return 1
                ;;
            *)
                snapshot_name="$1"
                shift
                ;;
        esac
    done
    
    case "$cmd" in
        root)
            local root
            root=$(merkle_root)
            if [[ $json_output -eq 1 ]]; then
                json_ok "$(printf '{"root":"%s"}' "$root")"
            else
                printf '%s\n' "$root"
            fi
            ;;
        
        snapshot)
            local snapshot_file
            snapshot_file=$(merkle_snapshot "$snapshot_name")
            local root
            root=$(merkle_root)
            if [[ $json_output -eq 1 ]]; then
                json_ok "$(printf '{"snapshot":"%s","root":"%s"}' \
                    "$(json_escape "$snapshot_file")" "$root")"
            else
                printf 'Snapshot saved: %s\n' "$snapshot_file"
                printf 'Root hash: %s\n' "$root"
            fi
            ;;
        
        diff)
            local changes
            changes=$(merkle_changed_files "$snapshot_name")
            if [[ $json_output -eq 1 ]]; then
                json_ok "$changes"
            else
                printf 'Changes since snapshot "%s":\n\n' "$snapshot_name"
                # Pretty print changes
                printf 'Added:\n'
                printf '%s' "$changes" | sed 's/.*"added":\[\([^]]*\)\].*/\1/' | tr ',' '\n' | \
                    sed -n 's/.*"file":"\([^"]*\)".*/  \1/p'
                printf '\nModified:\n'
                printf '%s' "$changes" | sed 's/.*"modified":\[\([^]]*\)\].*/\1/' | tr ',' '\n' | \
                    sed -n 's/.*"file":"\([^"]*\)".*/  \1/p'
                printf '\nDeleted:\n'
                printf '%s' "$changes" | sed 's/.*"deleted":\[\([^]]*\)\].*/\1/' | tr ',' '\n' | \
                    sed -n 's/.*"file":"\([^"]*\)".*/  \1/p'
            fi
            ;;
        
        stats)
            local stats
            stats=$(merkle_stats "$snapshot_name")
            if [[ $json_output -eq 1 ]]; then
                json_ok "$stats"
            else
                printf 'Change statistics:\n'
                printf '  Added: %s\n' "$(printf '%s' "$stats" | sed 's/.*"added":\([0-9]*\).*/\1/')"
                printf '  Modified: %s\n' "$(printf '%s' "$stats" | sed 's/.*"modified":\([0-9]*\).*/\1/')"
                printf '  Deleted: %s\n' "$(printf '%s' "$stats" | sed 's/.*"deleted":\([0-9]*\).*/\1/')"
                printf '  Total: %s\n' "$(printf '%s' "$stats" | sed 's/.*"total":\([0-9]*\).*/\1/')"
            fi
            ;;
        
        has-changes)
            if merkle_has_changes "$snapshot_name"; then
                if [[ $json_output -eq 1 ]]; then
                    json_ok '{"hasChanges":true}'
                fi
                return 0
            else
                if [[ $json_output -eq 1 ]]; then
                    json_ok '{"hasChanges":false}'
                fi
                return 1
            fi
            ;;
        
        help|--help|-h)
            merkle_cli_help
            ;;
        
        "")
            merkle_cli_help
            return 1
            ;;
        
        *)
            printf 'Unknown command: %s\n' "$cmd" >&2
            merkle_cli_help
            return 1
            ;;
    esac
}

#===============================================================================
# Main Entry Point
#===============================================================================

# Run CLI if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    merkle_cli "$@"
fi
