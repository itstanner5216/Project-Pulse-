#!/usr/bin/env bash
# HookSys Project Pulse v3.1 - Local-only project health metrics
# No git dependency - uses filesystem signals
#
# CHANGELOG v3.0 -> v3.1:
# - Fixed ((count++)) -> ((++count)) for set -e compatibility
# - Added version info to JSON output
# - Improved deterministic output ordering
# - Enhanced error handling throughout

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/core.sh"

#=============================================================================
# Configuration
#=============================================================================

ANALYSIS_HOURS=$(get_config_value '.pulse.analysis_hours' '168')  # 7 days
LARGE_FILE_KB=$(get_config_value '.pulse.large_file_kb' '500')

#=============================================================================
# Metrics Collection
#=============================================================================

# Get recently modified files with metadata
get_recent_activity() {
    local root="$1"
    local hours="$2"
    local limit="${3:-20}"
    
    local find_args=()
    find_args+=("$root")
    find_args+=(-maxdepth 8)
    
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
    
    # Sort by mtime descending - deterministic output
    if [[ ${#files[@]} -gt 0 ]]; then
        printf '%s\n' "${files[@]}" | sort -t: -k1 -rn | head -n "$limit" | cut -d: -f2-
    fi
}

# Calculate churn hotspots (files modified frequently and recently)
calculate_churn_hotspots() {
    local root="$1"
    local hours="$2"
    local limit="${3:-10}"
    
    local now
    now=$(_now)
    local cutoff=$((now - hours * 3600))
    
    local -A file_scores=()
    
    local find_args=()
    find_args+=("$root")
    find_args+=(-maxdepth 8)
    
    for d in "${IGNORE_DIRS[@]}"; do
        find_args+=(-path "*/$d" -prune -o)
    done
    
    find_args+=(-type f)
    find_args+=(-mmin "-$((hours * 60))")
    find_args+=(-print)
    
    while IFS= read -r file; do
        [[ -z "$file" ]] && continue
        [[ ! -f "$file" ]] && continue
        
        local mtime size
        mtime=$(file_mtime "$file")
        size=$(file_size "$file")
        
        # Score based on recency and size
        local age=$((now - mtime))
        local recency_score=0
        
        if [[ $age -lt 3600 ]]; then
            recency_score=100  # <1h
        elif [[ $age -lt 86400 ]]; then
            recency_score=50   # <24h
        elif [[ $age -lt 259200 ]]; then
            recency_score=25   # <3d
        else
            recency_score=10
        fi
        
        # Size factor (larger files = more impactful changes)
        local size_factor=1
        [[ $size -gt 10240 ]] && size_factor=2
        [[ $size -gt 51200 ]] && size_factor=3
        
        local score=$((recency_score * size_factor))
        file_scores["$file"]=$score
    done < <(find "${find_args[@]}" 2>/dev/null || true)
    
    # Sort and output top files - deterministic by score desc, then path asc
    for file in "${!file_scores[@]}"; do
        echo "${file_scores[$file]}:$file"
    done | sort -t: -k1,1rn -k2 | head -n "$limit"
}

# Find large files
find_large_files() {
    local root="$1"
    local threshold_kb="$2"
    local limit="${3:-10}"
    
    local find_args=()
    find_args+=("$root")
    find_args+=(-maxdepth 8)
    
    for d in "${IGNORE_DIRS[@]}"; do
        find_args+=(-path "*/$d" -prune -o)
    done
    
    find_args+=(-type f)
    find_args+=(-size "+${threshold_kb}k")
    find_args+=(-print)
    
    local -a files=()
    while IFS= read -r file; do
        [[ -z "$file" ]] && continue
        local size
        size=$(file_size "$file")
        files+=("$size:$file")
    done < <(find "${find_args[@]}" 2>/dev/null || true)
    
    # Sort by size descending - deterministic
    if [[ ${#files[@]} -gt 0 ]]; then
        printf '%s\n' "${files[@]}" | sort -t: -k1,1rn -k2 | head -n "$limit"
    fi
}

# Calculate TODO/FIXME density
calculate_todo_density() {
    local root="$1"
    local limit="${2:-10}"
    
    local -A file_counts=()
    local total=0
    
    local find_args=()
    find_args+=("$root")
    find_args+=(-maxdepth 6)
    
    for d in "${IGNORE_DIRS[@]}"; do
        find_args+=(-path "*/$d" -prune -o)
    done
    
    find_args+=(-type f)
    find_args+=(\( -name "*.py" -o -name "*.js" -o -name "*.ts" -o -name "*.go" \
                  -o -name "*.rs" -o -name "*.java" -o -name "*.c" -o -name "*.cpp" \
                  -o -name "*.rb" -o -name "*.php" -o -name "*.sh" \))
    find_args+=(-print)
    
    while IFS= read -r file; do
        [[ -z "$file" ]] && continue
        [[ ! -f "$file" ]] && continue
        is_binary "$file" && continue
        
        local count
        count=$(grep -c -E '(TODO|FIXME|HACK|XXX|BUG):?' "$file" 2>/dev/null || echo 0)
        
        if [[ $count -gt 0 ]]; then
            file_counts["$file"]=$count
            ((total += count))
        fi
    done < <(find "${find_args[@]}" 2>/dev/null || true)
    
    echo "total:$total"
    for file in "${!file_counts[@]}"; do
        echo "${file_counts[$file]}:$file"
    done | sort -t: -k1,1rn -k2 | head -n "$limit"
}

# File type distribution
get_file_type_distribution() {
    local root="$1"
    
    local -A type_counts=()
    local -A type_sizes=()
    
    local find_args=()
    find_args+=("$root")
    find_args+=(-maxdepth 8)
    
    for d in "${IGNORE_DIRS[@]}"; do
        find_args+=(-path "*/$d" -prune -o)
    done
    
    find_args+=(-type f -print)
    
    while IFS= read -r file; do
        [[ -z "$file" ]] && continue
        local ext="${file##*.}"
        [[ "$ext" == "$file" ]] && ext="(none)"
        
        type_counts[$ext]=$(( ${type_counts[$ext]:-0} + 1 ))
        local size
        size=$(file_size "$file")
        type_sizes[$ext]=$(( ${type_sizes[$ext]:-0} + size ))
    done < <(find "${find_args[@]}" 2>/dev/null || true)
    
    # Output sorted by count - deterministic
    for ext in "${!type_counts[@]}"; do
        local size_kb=$(( ${type_sizes[$ext]} / 1024 ))
        echo "${type_counts[$ext]}:${size_kb}:$ext"
    done | sort -t: -k1,1rn -k3 | head -20
}

#=============================================================================
# Pulse Report Generation
#=============================================================================

generate_pulse() {
    local root="$1"
    local hours="$2"
    local json_output="$3"
    local quick_mode="$4"
    
    if [[ "$json_output" == "true" ]]; then
        generate_pulse_json "$root" "$hours" "$quick_mode"
    else
        generate_pulse_text "$root" "$hours" "$quick_mode"
    fi
}

generate_pulse_text() {
    local root="$1"
    local hours="$2"
    local quick_mode="$3"
    
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                    PROJECT PULSE REPORT                      ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    echo "Project: $root"
    echo "Analysis window: ${hours}h"
    echo "Generated: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "HookSys Version: $HOOKSYS_VERSION"
    echo ""
    
    # Recent Activity
    echo "┌─────────────────────────────────────────────────────────────┐"
    echo "│ RECENT ACTIVITY                                             │"
    echo "└─────────────────────────────────────────────────────────────┘"
    local recent_count=0
    while IFS= read -r file; do
        [[ -z "$file" ]] && continue
        local relpath="${file#$root/}"
        local mtime
        mtime=$(file_mtime "$file")
        local age=$(( $(_now) - mtime ))
        local age_str
        if [[ $age -lt 3600 ]]; then
            age_str="$((age/60))m ago"
        elif [[ $age -lt 86400 ]]; then
            age_str="$((age/3600))h ago"
        else
            age_str="$((age/86400))d ago"
        fi
        echo "  • $relpath ($age_str)"
        ((++recent_count))  # Fixed: was ((recent_count++))
    done < <(get_recent_activity "$root" "$hours" 10)
    [[ $recent_count -eq 0 ]] && echo "  (no recent activity)"
    echo ""
    
    if [[ "$quick_mode" != "true" ]]; then
        # Churn Hotspots
        echo "┌─────────────────────────────────────────────────────────────┐"
        echo "│ CHURN HOTSPOTS (high activity files)                        │"
        echo "└─────────────────────────────────────────────────────────────┘"
        while IFS=: read -r score file || [[ -n "$score" ]]; do
            [[ -z "$file" ]] && continue
            local relpath="${file#$root/}"
            echo "  [${score}] $relpath"
        done < <(calculate_churn_hotspots "$root" "$hours" 8)
        echo ""
        
        # Large Files
        echo "┌─────────────────────────────────────────────────────────────┐"
        echo "│ LARGE FILES (>${LARGE_FILE_KB}KB)                           │"
        echo "└─────────────────────────────────────────────────────────────┘"
        local large_count=0
        while IFS=: read -r size file || [[ -n "$size" ]]; do
            [[ -z "$file" ]] && continue
            local relpath="${file#$root/}"
            local size_kb=$((size / 1024))
            echo "  ${size_kb}KB  $relpath"
            ((++large_count))  # Fixed: was ((large_count++))
        done < <(find_large_files "$root" "$LARGE_FILE_KB" 8)
        [[ $large_count -eq 0 ]] && echo "  (none found)"
        echo ""
        
        # TODO/FIXME Density
        echo "┌─────────────────────────────────────────────────────────────┐"
        echo "│ TODO/FIXME DENSITY                                          │"
        echo "└─────────────────────────────────────────────────────────────┘"
        local first=true
        while IFS=: read -r count item || [[ -n "$count" ]]; do
            [[ -z "$item" ]] && continue
            if $first && [[ "$count" == "total" ]]; then
                echo "  Total markers: $item"
                first=false
                continue
            fi
            local relpath="${item#$root/}"
            echo "  [$count] $relpath"
        done < <(calculate_todo_density "$root" 8)
        echo ""
        
        # File Type Distribution
        echo "┌─────────────────────────────────────────────────────────────┐"
        echo "│ FILE TYPE DISTRIBUTION                                      │"
        echo "└─────────────────────────────────────────────────────────────┘"
        printf "  %-10s %8s %10s\n" "EXT" "COUNT" "SIZE(KB)"
        echo "  ─────────────────────────────────"
        while IFS=: read -r count size ext || [[ -n "$count" ]]; do
            [[ -z "$ext" ]] && continue
            printf "  %-10s %8s %10s\n" ".$ext" "$count" "$size"
        done < <(get_file_type_distribution "$root" | head -10)
    fi
    
    echo ""
    echo "════════════════════════════════════════════════════════════════"
}

generate_pulse_json() {
    local root="$1"
    local hours="$2"
    local quick_mode="$3"
    
    echo "{"
    echo "  \"version\": \"$HOOKSYS_VERSION\","
    echo "  \"root\": \"$(json_escape "$root")\","
    echo "  \"analysis_hours\": $hours,"
    echo "  \"generated_at\": \"$(date -Iseconds)\","
    
    # Recent activity
    echo "  \"recent_activity\": ["
    local first=true
    while IFS= read -r file; do
        [[ -z "$file" ]] && continue
        $first || echo ","
        first=false
        local relpath="${file#$root/}"
        local mtime
        mtime=$(file_mtime "$file")
        echo -n "    {\"path\": \"$(json_escape "$relpath")\", \"mtime\": $mtime}"
    done < <(get_recent_activity "$root" "$hours" 15)
    echo ""
    echo "  ],"
    
    if [[ "$quick_mode" != "true" ]]; then
        # Churn hotspots
        echo "  \"churn_hotspots\": ["
        first=true
        while IFS=: read -r score file || [[ -n "$score" ]]; do
            [[ -z "$file" ]] && continue
            $first || echo ","
            first=false
            local relpath="${file#$root/}"
            echo -n "    {\"path\": \"$(json_escape "$relpath")\", \"score\": $score}"
        done < <(calculate_churn_hotspots "$root" "$hours" 10)
        echo ""
        echo "  ],"
        
        # Large files
        echo "  \"large_files\": ["
        first=true
        while IFS=: read -r size file || [[ -n "$size" ]]; do
            [[ -z "$file" ]] && continue
            $first || echo ","
            first=false
            local relpath="${file#$root/}"
            echo -n "    {\"path\": \"$(json_escape "$relpath")\", \"size\": $size}"
        done < <(find_large_files "$root" "$LARGE_FILE_KB" 10)
        echo ""
        echo "  ],"
        
        # TODO density
        echo "  \"todo_density\": {"
        local total=0
        local files_json=""
        while IFS=: read -r count item || [[ -n "$count" ]]; do
            [[ -z "$item" ]] && continue
            if [[ "$count" == "total" ]]; then
                total=$item
                continue
            fi
            local relpath="${item#$root/}"
            [[ -n "$files_json" ]] && files_json+=","
            files_json+="\n      {\"path\": \"$(json_escape "$relpath")\", \"count\": $count}"
        done < <(calculate_todo_density "$root" 10)
        echo "    \"total\": $total,"
        echo "    \"files\": [$files_json"
        echo "    ]"
        echo "  },"
    fi
    
    # File distribution
    echo "  \"file_distribution\": ["
    first=true
    while IFS=: read -r count size ext || [[ -n "$count" ]]; do
        [[ -z "$ext" ]] && continue
        $first || echo ","
        first=false
        echo -n "    {\"extension\": \".$ext\", \"count\": $count, \"size_kb\": $size}"
    done < <(get_file_type_distribution "$root" | head -15)
    echo ""
    echo "  ]"
    echo "}"
}

#=============================================================================
# CLI
#=============================================================================

usage() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS] [ROOT]

Generate project health metrics (local-only, no git).

Options:
  -t, --hours N       Analysis time window in hours (default: $ANALYSIS_HOURS)
  -q, --quick         Quick mode (recent activity only)
  -j, --json          Output as JSON
  -h, --help          Show this help

Metrics:
  • Recent Activity    - Files modified within time window
  • Churn Hotspots     - High-activity files (frequent/recent changes)
  • Large Files        - Files exceeding ${LARGE_FILE_KB}KB
  • TODO/FIXME Density - Code markers needing attention
  • File Distribution  - Breakdown by file type
EOF
}

main() {
    local root=""
    local hours="$ANALYSIS_HOURS"
    local json_output="false"
    local quick_mode="false"
    
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -t|--hours)
                hours="$2"; shift 2 ;;
            -q|--quick)
                quick_mode="true"; shift ;;
            -j|--json)
                json_output="true"; shift ;;
            -h|--help)
                usage; exit 0 ;;
            -*)
                _die "Unknown option: $1" ;;
            *)
                root="$1"; shift ;;
        esac
    done
    
    [[ -z "$root" ]] && root=$(find_project_root)
    [[ ! -d "$root" ]] && _die "Invalid root: $root"
    
    generate_pulse "$root" "$hours" "$json_output" "$quick_mode"
}

main "$@"
