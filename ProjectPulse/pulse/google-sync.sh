#!/usr/bin/env bash
#===============================================================================
# ProjectPulse v4.0.0-phase2 Incremental Cloud Sync
# Uploads changed files metadata/chunks to cloud service
# Features: resumable checkpoints, budget-based time limits, delta-only sync
#
# Interface:
#   hooks/google-sync.sh [--budget-seconds N] [--status]
#
# Requirements:
#   - Cloud optional: graceful degradation if unconfigured
#   - Resumable: checkpoint persistence via Redis or local files
#   - Budgeted: stop when elapsed time >= budget
#===============================================================================

set -euo pipefail

# Resolve script directory and source libraries
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="${SCRIPT_DIR}/../lib"
PULSE_DIR="${SCRIPT_DIR}/../pulse"

# Source core library
if [[ -f "${LIB_DIR}/core.sh" ]]; then
    # shellcheck source=lib/core.sh
    source "${LIB_DIR}/core.sh"
else
    printf '{"ok":false,"error":"core.sh not found","code":1}\n' >&2
    exit 1
fi

# Source merkle library for change detection
if [[ -f "${PULSE_DIR}/merkle.sh" ]]; then
    # shellcheck source=pulse/merkle.sh
    source "${PULSE_DIR}/merkle.sh"
fi

#===============================================================================
# Configuration
#===============================================================================

DEFAULT_BUDGET_SECONDS=300
CHECKPOINT_DIR="${ProjectPulse_Root}/.ProjectPulse/checkpoints"
SYNC_SNAPSHOT_NAME="sync"

#===============================================================================
# Argument Parsing
#===============================================================================

BUDGET_SECONDS="$DEFAULT_BUDGET_SECONDS"
STATUS_ONLY=0

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --budget-seconds|--budget)
                if [[ -z "${2:-}" ]]; then
                    json_err "missing value for --budget-seconds" 1
                    return 1
                fi
                BUDGET_SECONDS="$2"
                if ! [[ "$BUDGET_SECONDS" =~ ^[0-9]+$ ]]; then
                    json_err "budget-seconds must be a positive integer" 1
                    return 1
                fi
                shift 2
                ;;
            --status)
                STATUS_ONLY=1
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            -*)
                json_err "unknown option: $1" 1
                return 1
                ;;
            *)
                json_err "unexpected argument: $1" 1
                return 1
                ;;
        esac
    done
}

show_help() {
    cat <<EOF
ProjectPulse Cloud Sync

Usage: google-sync.sh [options]

Options:
  --budget-seconds N    Maximum seconds to run (default: 300)
  --status              Show sync status without syncing
  --help, -h            Show this help

Examples:
  google-sync.sh                        # Full sync with default budget
  google-sync.sh --budget-seconds 60    # Quick sync, max 60 seconds
  google-sync.sh --status               # Check sync status
EOF
}

#===============================================================================
# Checkpoint Management
#===============================================================================

get_checkpoint_key() {
    local proj_id idx_ver
    proj_id=$(project_id)
    idx_ver=$(index_version)
    printf 'sync:checkpoint:%s:%s' "$proj_id" "$idx_ver"
}

get_checkpoint_file() {
    local idx_ver
    idx_ver=$(index_version)
    printf '%s/sync_%s.json' "$CHECKPOINT_DIR" "$idx_ver"
}

# Load checkpoint: returns JSON or empty
load_checkpoint() {
    local checkpoint_key checkpoint_file
    checkpoint_key=$(get_checkpoint_key)
    checkpoint_file=$(get_checkpoint_file)
    
    # Try Redis first
    if has_command redis-cli; then
        local val
        val=$(redis-cli --no-auth-warning GET "ProjectPulse:${checkpoint_key}" 2>/dev/null || true)
        if [[ -n "$val" && "$val" != "(nil)" ]]; then
            printf '%s' "$val"
            return 0
        fi
    fi
    
    # Fallback to local file
    if [[ -f "$checkpoint_file" ]]; then
        local expiry content
        expiry=$(head -1 "$checkpoint_file" 2>/dev/null || echo 0)
        if [[ "$expiry" -gt "$(date +%s)" ]] 2>/dev/null; then
            tail -n +2 "$checkpoint_file"
            return 0
        else
            rm -f "$checkpoint_file" 2>/dev/null || true
        fi
    fi
    
    # No checkpoint
    printf ''
}

# Save checkpoint
save_checkpoint() {
    local checkpoint_json="$1"
    local ttl="${2:-86400}"  # Default 24h
    local checkpoint_key checkpoint_file
    checkpoint_key=$(get_checkpoint_key)
    checkpoint_file=$(get_checkpoint_file)
    
    # Try Redis first
    if has_command redis-cli; then
        redis-cli --no-auth-warning SETEX "ProjectPulse:${checkpoint_key}" "$ttl" "$checkpoint_json" &>/dev/null && return 0
    fi
    
    # Fallback to local file
    mkdir -p "$CHECKPOINT_DIR"
    local expiry=$(($(date +%s) + ttl))
    printf '%d\n%s' "$expiry" "$checkpoint_json" > "$checkpoint_file" 2>/dev/null || true
}

# Clear checkpoint after successful full sync
clear_checkpoint() {
    local checkpoint_key checkpoint_file
    checkpoint_key=$(get_checkpoint_key)
    checkpoint_file=$(get_checkpoint_file)
    
    if has_command redis-cli; then
        redis-cli --no-auth-warning DEL "ProjectPulse:${checkpoint_key}" &>/dev/null || true
    fi
    
    rm -f "$checkpoint_file" 2>/dev/null || true
}

#===============================================================================
# Cloud API Helpers (Phase 2: Structural, not fully implemented)
#===============================================================================

# Upload file metadata to cloud
# Returns: 0 on success, 1 on failure
upload_file_metadata() {
    local relpath="$1"
    local file_hash="$2"
    
    local access_token
    access_token=$(google_access_token)
    
    if [[ -z "$access_token" ]]; then
        return 1
    fi
    
    # Phase 2: Structural stub
    # In Phase 3, this would make actual API calls to Vertex AI or Cloud Storage
    # For now, simulate success if we have a token
    
    # Example of what the actual call would look like:
    # local endpoint="${PROJECTPULSE_GOOGLE_ENDPOINT:-https://storage.googleapis.com/upload/storage/v1/b/BUCKET/o}"
    # curl -s -X POST "$endpoint" \
    #   -H "Authorization: Bearer $access_token" \
    #   -H "Content-Type: application/json" \
    #   -d "{\"name\":\"$relpath\",\"hash\":\"$file_hash\"}"
    
    debug_log "upload_file_metadata: $relpath (hash: $file_hash)"
    return 0
}

#===============================================================================
# Sync Logic
#===============================================================================

cmd_sync_status() {
    local proj_id idx_ver
    proj_id=$(project_id)
    idx_ver=$(index_version)
    
    local cloud_status="unconfigured"
    if google_configured; then
        cloud_status="configured"
    fi
    
    local checkpoint_data
    checkpoint_data=$(load_checkpoint)
    
    local has_checkpoint="false"
    local checkpoint_info="null"
    if [[ -n "$checkpoint_data" ]]; then
        has_checkpoint="true"
        checkpoint_info="$checkpoint_data"
    fi
    
    # Check for changes
    local has_changes="false"
    if declare -f merkle_has_changes &>/dev/null; then
        if merkle_has_changes "$SYNC_SNAPSHOT_NAME" 2>/dev/null; then
            has_changes="true"
        fi
    fi
    
    local data
    data=$(printf '{"status":"ok","project_id":"%s","index_version":"%s","cloud_status":"%s","has_checkpoint":%s,"has_changes":%s,"checkpoint":%s}' \
        "$(json_escape "$proj_id")" \
        "$(json_escape "$idx_ver")" \
        "$cloud_status" \
        "$has_checkpoint" \
        "$has_changes" \
        "$checkpoint_info")
    
    json_ok "$data"
}

cmd_sync() {
    # Check if cloud is configured
    if ! google_configured; then
        json_ok '{"status":"cloud_unconfigured","message":"Google Cloud not configured. Set PROJECTPULSE_GOOGLE_ACCESS_TOKEN or install gcloud CLI."}'
        return 0
    fi
    
    local start_time
    start_time=$(date +%s)
    
    local proj_id idx_ver
    proj_id=$(project_id)
    idx_ver=$(index_version)
    
    # Load existing checkpoint
    local checkpoint
    checkpoint=$(load_checkpoint)
    
    local synced_files=()
    local resume_from=""
    
    if [[ -n "$checkpoint" ]]; then
        # Parse checkpoint for resume point
        # Simple extraction without jq
        if [[ "$checkpoint" =~ \"last_file\":\"([^\"]+)\" ]]; then
            resume_from="${BASH_REMATCH[1]}"
        fi
        
        debug_log "Resuming from checkpoint: $resume_from"
    fi
    
    # Get changed files
    local changes_json
    if declare -f merkle_changed_files &>/dev/null; then
        changes_json=$(merkle_changed_files "$SYNC_SNAPSHOT_NAME" 2>/dev/null || echo '{"added":[],"modified":[],"deleted":[]}')
    else
        changes_json='{"added":[],"modified":[],"deleted":[]}'
    fi
    
    # Extract file lists (simple parsing)
    local files_to_sync=()
    
    # Parse added files
    local added_section
    added_section=$(printf '%s' "$changes_json" | sed 's/.*"added":\[\([^]]*\)\].*/\1/' || true)
    while IFS= read -r match; do
        [[ -z "$match" ]] && continue
        if [[ "$match" =~ \"file\":\"([^\"]+)\" ]]; then
            files_to_sync+=("added:${BASH_REMATCH[1]}")
        fi
    done < <(printf '%s' "$added_section" | tr '{}' '\n')
    
    # Parse modified files
    local modified_section
    modified_section=$(printf '%s' "$changes_json" | sed 's/.*"modified":\[\([^]]*\)\].*/\1/' || true)
    while IFS= read -r match; do
        [[ -z "$match" ]] && continue
        if [[ "$match" =~ \"file\":\"([^\"]+)\" ]]; then
            files_to_sync+=("modified:${BASH_REMATCH[1]}")
        fi
    done < <(printf '%s' "$modified_section" | tr '{}' '\n')
    
    local total_files=${#files_to_sync[@]}
    local synced_count=0
    local skipped_count=0
    local failed_count=0
    local last_synced_file=""
    local past_resume=0
    
    if [[ -z "$resume_from" ]]; then
        past_resume=1
    fi
    
    for entry in "${files_to_sync[@]}"; do
        # Check budget
        local elapsed=$(($(date +%s) - start_time))
        if [[ "$elapsed" -ge "$BUDGET_SECONDS" ]]; then
            # Save checkpoint and exit
            local checkpoint_json
            checkpoint_json=$(printf '{"last_file":"%s","synced_count":%d,"total_files":%d,"elapsed":%d}' \
                "$(json_escape "$last_synced_file")" \
                "$synced_count" \
                "$total_files" \
                "$elapsed")
            save_checkpoint "$checkpoint_json"
            
            local data
            data=$(printf '{"status":"partial","synced":%d,"total":%d,"elapsed":%d,"budget":%d,"checkpoint":"%s"}' \
                "$synced_count" \
                "$total_files" \
                "$elapsed" \
                "$BUDGET_SECONDS" \
                "$(json_escape "$last_synced_file")")
            json_ok "$data"
            return 0
        fi
        
        local change_type="${entry%%:*}"
        local filepath="${entry#*:}"
        
        # Skip until we're past the resume point
        if [[ "$past_resume" -eq 0 ]]; then
            if [[ "$filepath" == "$resume_from" ]]; then
                past_resume=1
            fi
            ((skipped_count++))
            continue
        fi
        
        # Get file hash
        local file_hash="unknown"
        local abs_path="${ProjectPulse_Root}/${filepath}"
        if [[ -f "$abs_path" ]]; then
            file_hash=$(sha256sum "$abs_path" 2>/dev/null | cut -d' ' -f1 || echo "unknown")
        fi
        
        # Upload
        if upload_file_metadata "$filepath" "$file_hash"; then
            ((synced_count++))
            last_synced_file="$filepath"
        else
            ((failed_count++))
        fi
    done
    
    # Sync complete - save merkle snapshot and clear checkpoint
    if declare -f merkle_snapshot &>/dev/null; then
        merkle_snapshot "$SYNC_SNAPSHOT_NAME" &>/dev/null || true
    fi
    clear_checkpoint
    
    local elapsed=$(($(date +%s) - start_time))
    local data
    data=$(printf '{"status":"complete","synced":%d,"skipped":%d,"failed":%d,"total":%d,"elapsed":%d}' \
        "$synced_count" \
        "$skipped_count" \
        "$failed_count" \
        "$total_files" \
        "$elapsed")
    json_ok "$data"
}

#===============================================================================
# Main Entry Point
#===============================================================================

main() {
    parse_args "$@" || return $?
    
    if [[ "$STATUS_ONLY" -eq 1 ]]; then
        cmd_sync_status
    else
        cmd_sync
    fi
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
