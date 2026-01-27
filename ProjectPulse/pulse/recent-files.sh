#!/usr/bin/env bash
# ProjectPulse Recent Files v3.1 - Track recently modified files
# Focused view of recent project activity
#
# CHANGELOG v3.0 -> v3.1:
# - Fixed ((count++)) -> ((++count)) for set -e compatibility
# - Added version info to JSON output
# - Improved error handling

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/core.sh"

#=============================================================================
# Configuration
#=============================================================================

DEFAULT_HOURS=$(get_config_value '.recent.hours' '24')
MAX_FILES=50

#=============================================================================
# Recent File Discovery
#=============================================================================

get_recent_files() {
    local Root="$1"
    local hours="$2"
    local max_files="${3:-$MAX_FILES}"
    
    local find_args=()
    find_args+=("$Root")
    find_args+=(-maxdepth 10)
    
    # Exclusions
    for d in "${IGNORE_DIRS[@]}"; do
        find_args+=(-path "*/$d" -prune -o)
    done
    
    find_args+=(-type f)
    find_args+=(-mmin "-$((hours * 60))")
    find_args+=(-print)
    
    local -a files=()
    while IFS= read -r file; do
        [[ -z "$file" ]] && continue
        [[ ! -f "$file" ]] && continue
        local mtime
        mtime=$(file_mtime "$file")
        files+=("$mtime:$file")
    done < <(find "${find_args[@]}" 2>/dev/null || true)
    
    # Sort by mtime descending and limit
    # Handle empty array case gracefully
    if [[ ${#files[@]} -gt 0 ]]; then
        printf '%s\n' "${files[@]}" | sort -t: -k1 -rn | head -n "$max_files"
    fi
}

format_age() {
    local seconds="$1"
    
    if [[ $seconds -lt 60 ]]; then
        echo "${seconds}s ago"
    elif [[ $seconds -lt 3600 ]]; then
        echo "$((seconds / 60))m ago"
    elif [[ $seconds -lt 86400 ]]; then
        echo "$((seconds / 3600))h ago"
    else
        echo "$((seconds / 86400))d ago"
    fi
}

#=============================================================================
# Output Functions
#=============================================================================

output_text() {
    local Root="$1"
    local hours="$2"
    local max_files="$3"
    local show_content="$4"
    
    local now
    now=$(_now)
    local count=0
    
    echo "=== Recent Files (last ${hours}h) ==="
    echo "Root: $Root"
    echo ""
    
    while IFS=: read -r mtime file || [[ -n "$mtime" ]]; do
        [[ -z "$file" ]] && continue
        
        local relpath="${file#$Root/}"
        local age=$((now - mtime))
        local age_str
        age_str=$(format_age "$age")
        local size
        size=$(file_size "$file")
        local size_str
        if [[ $size -gt 1048576 ]]; then
            size_str="$((size / 1048576))MB"
        elif [[ $size -gt 1024 ]]; then
            size_str="$((size / 1024))KB"
        else
            size_str="${size}B"
        fi
        
        echo "[$age_str] $relpath ($size_str)"
        
        if [[ "$show_content" == "true" ]] && ! is_binary "$file"; then
            echo "  ─────────────────────────────────────"
            head -n 5 "$file" 2>/dev/null | sed 's/^/  │ /' || true
            echo "  ─────────────────────────────────────"
        fi
        
        ((++count))  # Fixed: was ((count++))
    done < <(get_recent_files "$Root" "$hours" "$max_files")
    
    echo ""
    echo "Total: $count files"
}

output_json() {
    local Root="$1"
    local hours="$2"
    local max_files="$3"
    
    local now
    now=$(_now)
    
    echo "{"
    echo "  \"version\": \"$ProjectPulse_VERSION\","
    echo "  \"Root\": \"$(json_escape "$Root")\","
    echo "  \"hours\": $hours,"
    echo "  \"generated_at\": \"$(date -Iseconds)\","
    echo "  \"files\": ["
    
    local first=true
    local count=0
    while IFS=: read -r mtime file || [[ -n "$mtime" ]]; do
        [[ -z "$file" ]] && continue
        
        $first || echo ","
        first=false
        
        local relpath="${file#$Root/}"
        local size
        size=$(file_size "$file")
        local age=$((now - mtime))
        
        echo -n "    {"
        echo -n "\"path\": \"$(json_escape "$relpath")\", "
        echo -n "\"mtime\": $mtime, "
        echo -n "\"size\": $size, "
        echo -n "\"age_seconds\": $age"
        echo -n "}"
        
        ((++count))  # Fixed: was ((count++))
    done < <(get_recent_files "$Root" "$hours" "$max_files")
    
    echo ""
    echo "  ],"
    echo "  \"total_files\": $count"
    echo "}"
}

#=============================================================================
# CLI
#=============================================================================

usage() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS] [Root]

List recently modified files.

Options:
  -t, --hours N       Time window in hours (default: $DEFAULT_HOURS)
  -n, --max N         Maximum files to show (default: $MAX_FILES)
  -c, --content       Show file content preview
  -j, --json          Output as JSON
  -h, --help          Show this help

Examples:
  $(basename "$0")              # Last 24 hours
  $(basename "$0") -t 1         # Last hour
  $(basename "$0") -t 168       # Last week
  $(basename "$0") -c -n 10     # Show content, max 10 files
EOF
}

main() {
    local Root=""
    local hours="$DEFAULT_HOURS"
    local max_files="$MAX_FILES"
    local show_content="false"
    local json_output="false"
    
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -t|--hours)
                hours="$2"; shift 2 ;;
            -n|--max)
                max_files="$2"; shift 2 ;;
            -c|--content)
                show_content="true"; shift ;;
            -j|--json)
                json_output="true"; shift ;;
            -h|--help)
                usage; exit 0 ;;
            -*)
                _die "Unknown option: $1" ;;
            *)
                Root="$1"; shift ;;
        esac
    done
    
    [[ -z "$Root" ]] && Root=$(find_project_Root)
    [[ ! -d "$Root" ]] && _die "Invalid Root: $Root"
    
    if [[ "$json_output" == "true" ]]; then
        output_json "$Root" "$hours" "$max_files"
    else
        output_text "$Root" "$hours" "$max_files" "$show_content"
    fi
}

main "$@"
