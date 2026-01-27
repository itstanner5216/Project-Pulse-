#!/usr/bin/env bash
# ProjectPulse Backup v3.2 - Simple file/directory backup utility
# Creates timestamped backups with metadata
#
# CHANGELOG v3.1 -> v3.2:
# - FIXED: Directory backup metadata now matches archive name (.tar.gz.meta)
# - FIXED: backup_list() now correctly finds directory backups
# - Added manifest info to directory backup metadata (file_count, top_level)
# - Improved restore target naming for clarity
#
# CHANGELOG v3.0 -> v3.1:
# - Fixed ((i++)) and ((removed++)) -> ((++i)) and ((++removed)) for set -e compatibility
# - Added backup_info command for detailed backup inspection
# - Added atomic metadata writes using _atomic_write
# - Fixed pattern matching to use grep -F for safety
# - Added version info to output

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/core.sh"

#=============================================================================
# Configuration
#=============================================================================

BACKUP_DIR="${ProjectPulse_DIR}/backups"
MAX_BACKUPS=50
MAX_AGE_DAYS=30

#=============================================================================
# Backup Functions
#=============================================================================

backup_create() {
    local source="$1"
    local comment="${2:-}"
    
    [[ ! -e "$source" ]] && _die "Source not found: $source"
    
    mkdir -p "$BACKUP_DIR"
    
    local basename
    basename=$(basename "$source")
    local timestamp
    timestamp=$(date +%Y%m%d-%H%M%S)
    local backup_name="${basename}.${timestamp}"
    local backup_path="$BACKUP_DIR/$backup_name"
    
    # FIX #3: Determine final backup_path BEFORE setting meta_path
    # For directories, the archive will be .tar.gz, so meta must be .tar.gz.meta
    local is_directory="false"
    local file_count=0
    local top_level=""
    
    if [[ -d "$source" ]]; then
        is_directory="true"
        backup_path="${backup_path}.tar.gz"
        # Gather manifest info for directories
        file_count=$(find "$source" -type f 2>/dev/null | wc -l)
        top_level=$(ls -1 "$source" 2>/dev/null | head -10 | tr '\n' ',' | sed 's/,$//')
    fi
    
    # meta_path is now set AFTER backup_path is finalized
    local meta_path="${backup_path}.meta"
    
    # Create backup
    if [[ "$is_directory" == "true" ]]; then
        tar -czf "$backup_path" -C "$(dirname "$source")" "$basename" 2>/dev/null
    else
        cp "$source" "$backup_path"
    fi
    
    # Create metadata atomically
    local size
    size=$(file_size "$backup_path")
    local source_realpath
    source_realpath=$(realpath "$source")
    
    local meta_content="source=$source_realpath
created=$(date -Iseconds)
size=$size
type=$( [[ "$is_directory" == "true" ]] && echo "directory" || echo "file" )
comment=$comment
user=${USER:-unknown}
host=$(hostname -s 2>/dev/null || echo "unknown")
ProjectPulse_version=$ProjectPulse_VERSION"
    
    # Add manifest info for directory backups (upgrade)
    if [[ "$is_directory" == "true" ]]; then
        meta_content+="
file_count=$file_count
top_level=$top_level"
    fi
    
    _atomic_write "$meta_path" "$meta_content"
    
    echo "Backup created: $backup_path"
    echo "Size: $((size / 1024))KB"
    [[ "$is_directory" == "true" ]] && echo "Files: $file_count"
}

backup_restore() {
    local backup_name="$1"
    local dest="${2:-.}"
    
    local backup_path="$BACKUP_DIR/$backup_name"
    
    # Find backup file
    if [[ ! -f "$backup_path" ]]; then
        # Try with common extensions
        for ext in "" ".tar.gz"; do
            [[ -f "${backup_path}${ext}" ]] && backup_path="${backup_path}${ext}" && break
        done
    fi
    
    [[ ! -f "$backup_path" ]] && _die "Backup not found: $backup_name"
    
    # Restore
    if [[ "$backup_path" == *.tar.gz ]]; then
        tar -xzf "$backup_path" -C "$dest"
        echo "Restored (extracted) to: $dest"
    else
        local basename
        basename=$(basename "$backup_path")
        # Remove timestamp from name: file.20240101-120000 -> file
        local original_name="${basename%%.[0-9]*}"
        local restore_path="$dest/$original_name"
        
        # UPGRADE: Avoid overwriting without warning
        if [[ -e "$restore_path" ]]; then
            _warn "Target exists: $restore_path"
            echo -n "Overwrite? [y/N] "
            read -r confirm
            [[ "$confirm" != "y" && "$confirm" != "Y" ]] && { echo "Aborted."; return 1; }
        fi
        
        cp "$backup_path" "$restore_path"
        echo "Restored to: $restore_path"
    fi
}

backup_info() {
    local backup_name="$1"
    
    local backup_path="$BACKUP_DIR/$backup_name"
    
    # Find backup file
    if [[ ! -f "$backup_path" ]]; then
        for ext in "" ".tar.gz"; do
            [[ -f "${backup_path}${ext}" ]] && backup_path="${backup_path}${ext}" && break
        done
    fi
    
    [[ ! -f "$backup_path" ]] && _die "Backup not found: $backup_name"
    
    local meta_path="${backup_path}.meta"
    
    echo "=== Backup Info ==="
    echo "File: $backup_path"
    echo "Size: $(($(file_size "$backup_path") / 1024))KB"
    echo ""
    
    if [[ -f "$meta_path" ]]; then
        echo "Metadata:"
        while IFS='=' read -r key value || [[ -n "$key" ]]; do
            [[ -z "$key" ]] && continue
            echo "  $key: $value"
        done < "$meta_path"
    else
        echo "Metadata: (none)"
    fi
    
    # Show contents for tar.gz
    if [[ "$backup_path" == *.tar.gz ]]; then
        echo ""
        echo "Contents (first 20 files):"
        tar -tzf "$backup_path" 2>/dev/null | head -20 | sed 's/^/  /'
        local total_files
        total_files=$(tar -tzf "$backup_path" 2>/dev/null | wc -l)
        [[ $total_files -gt 20 ]] && echo "  ... and $((total_files - 20)) more files"
    fi
}

backup_list() {
    local pattern="${1:-}"
    local json_output="${2:-false}"
    
    mkdir -p "$BACKUP_DIR"
    
    local -a backups=()
    
    while IFS= read -r meta_file; do
        [[ -z "$meta_file" ]] && continue
        [[ ! -f "$meta_file" ]] && continue
        
        # FIX #3: Correctly derive backup_file from meta_file
        # Meta is always ${backup_path}.meta, so strip .meta to get backup path
        local backup_file="${meta_file%.meta}"
        
        # Verify the backup file actually exists
        [[ ! -f "$backup_file" ]] && continue
        
        # Filter by pattern if provided (using grep -F for fixed string matching)
        if [[ -n "$pattern" ]]; then
            echo "$backup_file" | grep -qF "$pattern" || continue
        fi
        
        local source="" created="" size="" comment="" backup_type="file"
        while IFS='=' read -r key value || [[ -n "$key" ]]; do
            case "$key" in
                source) source="$value" ;;
                created) created="$value" ;;
                size) size="$value" ;;
                comment) comment="$value" ;;
                type) backup_type="$value" ;;
            esac
        done < "$meta_file"
        
        backups+=("$created|$backup_file|$source|$size|$comment|$backup_type")
    done < <(find "$BACKUP_DIR" -name "*.meta" -type f 2>/dev/null | sort -r || true)
    
    if [[ "$json_output" == "true" ]]; then
        echo "{"
        echo "  \"version\": \"$ProjectPulse_VERSION\","
        echo "  \"backup_dir\": \"$(json_escape "$BACKUP_DIR")\","
        echo "  \"backups\": ["
        local first=true
        for entry in "${backups[@]}"; do
            IFS='|' read -r created path source size comment backup_type <<< "$entry"
            $first || echo ","
            first=false
            local name
            name=$(basename "$path")
            echo -n "    {\"name\": \"$(json_escape "$name")\", \"source\": \"$(json_escape "$source")\", \"type\": \"$backup_type\", \"created\": \"$created\", \"size\": ${size:-0}"
            [[ -n "$comment" ]] && echo -n ", \"comment\": \"$(json_escape "$comment")\""
            echo -n "}"
        done
        echo ""
        echo "  ]"
        echo "}"
    else
        if [[ ${#backups[@]} -eq 0 ]]; then
            echo "No backups found"
            return
        fi
        
        echo "=== Backups ==="
        echo ""
        local i=1
        for entry in "${backups[@]}"; do
            IFS='|' read -r created path source size comment backup_type <<< "$entry"
            local name
            name=$(basename "$path")
            local size_kb=$((${size:-0} / 1024))
            local type_indicator=""
            [[ "$backup_type" == "directory" ]] && type_indicator=" [DIR]"
            echo "[$i] $name$type_indicator"
            echo "    Source:  $source"
            echo "    Created: $created"
            echo "    Size:    ${size_kb}KB"
            [[ -n "$comment" ]] && echo "    Comment: $comment"
            echo ""
            ((++i))  # Fixed: was ((i++))
        done
    fi
}

backup_find() {
    local pattern="$1"
    
    backup_list "$pattern" "false"
}

backup_clean() {
    local dry_run="${1:-false}"
    
    mkdir -p "$BACKUP_DIR"
    
    local removed=0
    local cutoff_time
    cutoff_time=$(date -d "$MAX_AGE_DAYS days ago" +%s 2>/dev/null || date -v-${MAX_AGE_DAYS}d +%s 2>/dev/null || echo 0)
    
    # Get all backups sorted by age (oldest first)
    local -a all_backups=()
    while IFS= read -r backup; do
        [[ -z "$backup" ]] && continue
        all_backups+=("$backup")
    done < <(find "$BACKUP_DIR" -type f ! -name "*.meta" 2>/dev/null | sort || true)
    
    local total=${#all_backups[@]}
    local to_remove=$((total - MAX_BACKUPS))
    [[ $to_remove -lt 0 ]] && to_remove=0
    
    for backup in "${all_backups[@]}"; do
        local should_remove="false"
        
        # Remove if over count limit
        if [[ $to_remove -gt 0 ]]; then
            should_remove="true"
            ((--to_remove)) || true  # Prevent exit on decrement to zero
        fi
        
        # Remove if too old
        local mtime
        mtime=$(file_mtime "$backup")
        if [[ $cutoff_time -gt 0 ]] && [[ $mtime -lt $cutoff_time ]]; then
            should_remove="true"
        fi
        
        if [[ "$should_remove" == "true" ]]; then
            if [[ "$dry_run" == "true" ]]; then
                echo "[DRY RUN] Would remove: $(basename "$backup")"
            else
                rm -f "$backup" "${backup}.meta"
                echo "Removed: $(basename "$backup")"
            fi
            ((++removed))  # Fixed: was ((removed++))
        fi
    done
    
    echo ""
    if [[ "$dry_run" == "true" ]]; then
        echo "Would remove $removed backup(s)"
    else
        echo "Removed $removed backup(s)"
    fi
}

#=============================================================================
# CLI
#=============================================================================

usage() {
    cat << EOF
Usage: $(basename "$0") COMMAND [OPTIONS]

Simple backup utility.

Commands:
  create SOURCE [-m COMMENT]    Create backup of file/directory
  restore BACKUP [DEST]         Restore backup to destination
  list [PATTERN]                List backups (optional filter pattern)
  find PATTERN                  Find backups matching pattern
  info BACKUP                   Show detailed backup information
  clean [--dry-run]             Clean old backups

Options:
  -m, --comment TEXT    Add comment to backup
  -j, --json            Output list as JSON
  --dry-run             Show what would be cleaned
  -h, --help            Show this help

Retention: max $MAX_BACKUPS backups, $MAX_AGE_DAYS days

Examples:
  $(basename "$0") create ./myfile.txt -m "Before refactor"
  $(basename "$0") create ./src/
  $(basename "$0") list
  $(basename "$0") info myfile.txt.20240101-120000
  $(basename "$0") restore myfile.txt.20240101-120000
  $(basename "$0") clean --dry-run
EOF
}

main() {
    local command="${1:-}"
    shift || true
    
    case "$command" in
        create)
            local source=""
            local comment=""
            while [[ $# -gt 0 ]]; do
                case "$1" in
                    -m|--comment)
                        comment="$2"; shift 2 ;;
                    -*)
                        _die "Unknown option: $1" ;;
                    *)
                        source="$1"; shift ;;
                esac
            done
            [[ -z "$source" ]] && { usage; exit 1; }
            backup_create "$source" "$comment"
            ;;
        restore)
            local backup="${1:-}"
            local dest="${2:-.}"
            [[ -z "$backup" ]] && { usage; exit 1; }
            backup_restore "$backup" "$dest"
            ;;
        list)
            local pattern=""
            local json_output="false"
            while [[ $# -gt 0 ]]; do
                case "$1" in
                    -j|--json) json_output="true"; shift ;;
                    -*) _die "Unknown option: $1" ;;
                    *) pattern="$1"; shift ;;
                esac
            done
            backup_list "$pattern" "$json_output"
            ;;
        find)
            local pattern="${1:-}"
            [[ -z "$pattern" ]] && { usage; exit 1; }
            backup_find "$pattern"
            ;;
        info)
            local backup="${1:-}"
            [[ -z "$backup" ]] && { usage; exit 1; }
            backup_info "$backup"
            ;;
        clean)
            local dry_run="false"
            [[ "${1:-}" == "--dry-run" ]] && dry_run="true"
            backup_clean "$dry_run"
            ;;
        -h|--help|help)
            usage; exit 0 ;;
        "")
            usage; exit 1 ;;
        *)
            _die "Unknown command: $command" ;;
    esac
}

main "$@"
