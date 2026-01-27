#!/usr/bin/env bash
#===============================================================================
# ProjectPulse v4.0.0-phase1 Core Library
# Foundation: JSON helpers, caching, project ID, ignore mechanics, safety
#
# Exports:
#   json_ok(data_json_string)
#   json_err(message, code_int)
#   json_escape(string)
#   project_id()
#   index_version()
#   cache_get(key) / cache_set(key, ttl, value)
#   load_ignore_patterns()
#   should_ignore(path)
#   realpath_safe(relpath)
#   deterministic_sort()
#   google_project() / google_location() / google_api_key()
#===============================================================================

set -euo pipefail

ProjectPulse_VERSION="4.0.0-phase1"

# Project root must be set by caller or detected
: "${ProjectPulse_Root:=$(pwd)}"
export ProjectPulse_Root

# Internal state directory
ProjectPulse_STATE_DIR="${ProjectPulse_Root}/.ProjectPulse"

# Ignore patterns array (populated by load_ignore_patterns)
declare -a _ProjectPulse_IGNORE_PATTERNS=()
_ProjectPulse_IGNORE_LOADED=0

#===============================================================================
# JSON Helpers (printf-based, deterministic)
#===============================================================================

# Escape string for JSON embedding
# Handles: backslash, double-quote, newline, tab, carriage return
json_escape() {
    local s="${1:-}"
    s="${s//\\/\\\\}"        # backslash first
    s="${s//\"/\\\"}"        # double quotes
    s="${s//$'\n'/\\n}"      # newlines
    s="${s//$'\t'/\\t}"      # tabs
    s="${s//$'\r'/\\r}"      # carriage return
    printf '%s' "$s"
}

# Output success JSON envelope
# Usage: json_ok '{"key":"value"}'
json_ok() {
    local data="${1:-null}"
    printf '{"ok":true,"tool":"ProjectPulse","Root":"%s","data":%s}\n' \
        "$(json_escape "$ProjectPulse_Root")" "$data"
}

# Output error JSON envelope (to stderr, returns non-zero)
# Usage: json_err "error message" 1
json_err() {
    local msg="$1"
    local code="${2:-1}"
    printf '{"ok":false,"tool":"ProjectPulse","error":"%s","code":%d}\n' \
        "$(json_escape "$msg")" "$code" >&2
    return "$code"
}

#===============================================================================
# Project Identity
#===============================================================================

# Get or create stable project ID (persisted)
# Format: UUID derived from sha256(canonical_path)
project_id() {
    local id_file="${ProjectPulse_STATE_DIR}/project_id"
    
    # Return cached ID if exists
    if [[ -f "$id_file" ]]; then
        cat "$id_file"
        return 0
    fi
    
    # Create state directory
    mkdir -p "$ProjectPulse_STATE_DIR"
    
    # Generate deterministic UUID from path
    local hash
    hash=$(printf '%s' "$ProjectPulse_Root" | sha256sum | cut -c1-32)
    local uuid="${hash:0:8}-${hash:8:4}-${hash:12:4}-${hash:16:4}-${hash:20:12}"
    
    # Persist and return
    printf '%s' "$uuid" > "$id_file"
    printf '%s' "$uuid"
}

# Get deterministic index version (for cache invalidation)
# Combines: merkle root + file count + newest mtime
index_version() {
    local merkle_root_val file_count last_mtime version_sig
    
    # Source merkle.sh if merkle_root not available
    if ! declare -f merkle_root &>/dev/null; then
        local merkle_lib="${BASH_SOURCE[0]%/*}/merkle.sh"
        if [[ -f "$merkle_lib" ]]; then
            # shellcheck source=lib/merkle.sh
            source "$merkle_lib"
        fi
    fi
    
    # Get merkle root (fallback to empty if unavailable)
    if declare -f merkle_root &>/dev/null; then
        merkle_root_val=$(merkle_root 2>/dev/null || echo "none")
    else
        merkle_root_val="none"
    fi
    
    # Count tracked files
    file_count=$(find_tracked_files | wc -l)
    
    # Get newest mtime (seconds since epoch)
    last_mtime=$(find_tracked_files -print0 2>/dev/null | \
        xargs -0 stat -c '%Y' 2>/dev/null | \
        sort -rn | head -1 || echo "0")
    
    # Generate version signature
    version_sig=$(printf '%s:%d:%s' "$merkle_root_val" "$file_count" "$last_mtime" | sha256sum | cut -c1-16)
    printf '%s' "$version_sig"
}

# Helper: find all tracked files (respecting ignore patterns)
find_tracked_files() {
    load_ignore_patterns
    
    local find_args=("$ProjectPulse_Root" -type f)
    
    # Build prune expressions for ignored directories
    local prune_expr=()
    for pattern in "${_ProjectPulse_IGNORE_PATTERNS[@]}"; do
        # Handle directory patterns (no wildcards, or ending with /)
        if [[ "$pattern" != *"*"* ]] || [[ "$pattern" == */ ]]; then
            local dir_name="${pattern%/}"
            if [[ -n "$dir_name" ]]; then
                prune_expr+=(-o -name "$dir_name" -type d)
            fi
        fi
    done
    
    if [[ ${#prune_expr[@]} -gt 0 ]]; then
        # Remove leading -o
        prune_expr=("${prune_expr[@]:1}")
        find "${find_args[@]}" \( "${prune_expr[@]}" \) -prune -o -type f -print 2>/dev/null
    else
        find "${find_args[@]}" -print 2>/dev/null
    fi
}

#===============================================================================
# Caching (Redis optional, graceful fallback)
#===============================================================================

# Get cached value by key
# Returns: value on stdout, exit 0 if found, exit 1 if miss
cache_get() {
    local key="$1"
    local cache_file="${ProjectPulse_STATE_DIR}/cache/${key}"
    
    # Try redis-cli first if available
    if command -v redis-cli &>/dev/null; then
        local val
        val=$(redis-cli --no-auth-warning GET "ProjectPulse:${key}" 2>/dev/null || true)
        if [[ -n "$val" && "$val" != "(nil)" ]]; then
            printf '%s' "$val"
            return 0
        fi
    fi
    
    # Fallback to file cache
    if [[ -f "$cache_file" ]]; then
        local expiry content
        expiry=$(head -1 "$cache_file")
        if [[ "$expiry" -gt "$(date +%s)" ]] 2>/dev/null; then
            tail -n +2 "$cache_file"
            return 0
        else
            rm -f "$cache_file"
        fi
    fi
    
    return 1
}

# Set cached value with TTL
# Usage: cache_set "key" 3600 "value"
cache_set() {
    local key="$1"
    local ttl="$2"
    local value="$3"
    local cache_dir="${ProjectPulse_STATE_DIR}/cache"
    local cache_file="${cache_dir}/${key}"
    
    # Try redis-cli first if available
    if command -v redis-cli &>/dev/null; then
        redis-cli --no-auth-warning SETEX "ProjectPulse:${key}" "$ttl" "$value" &>/dev/null && return 0
    fi
    
    # Fallback to file cache
    mkdir -p "$cache_dir"
    local expiry=$(($(date +%s) + ttl))
    printf '%d\n%s' "$expiry" "$value" > "$cache_file"
}

#===============================================================================
# Ignore Patterns
#===============================================================================

# Built-in default ignore patterns
_ProjectPulse_DEFAULT_IGNORES=(
    ".git"
    ".ProjectPulse"
    "node_modules"
    "__pycache__"
    ".pycache"
    "venv"
    ".venv"
    "build"
    "dist"
    ".idea"
    ".vscode"
    "*.pyc"
    "*.pyo"
    "*.o"
    "*.a"
    "*.so"
    "*.dylib"
    "*.dll"
    "*.exe"
    "*.bin"
    "*.class"
    "*.jar"
    "*.war"
    ".DS_Store"
    "Thumbs.db"
    "*.swp"
    "*.swo"
    "*~"
    ".cache"
    ".pytest_cache"
    ".mypy_cache"
    ".ruff_cache"
    "coverage"
    ".coverage"
    "htmlcov"
    ".tox"
    ".nox"
    "*.egg-info"
    ".eggs"
    "target"
    "Cargo.lock"
    "package-lock.json"
    "yarn.lock"
    "pnpm-lock.yaml"
)

# Load ignore patterns from .ProjectPulseignore + defaults
load_ignore_patterns() {
    # Skip if already loaded
    if [[ "$_ProjectPulse_IGNORE_LOADED" -eq 1 ]]; then
        return 0
    fi
    
    _ProjectPulse_IGNORE_PATTERNS=()
    
    # Add built-in defaults
    for pattern in "${_ProjectPulse_DEFAULT_IGNORES[@]}"; do
        _ProjectPulse_IGNORE_PATTERNS+=("$pattern")
    done
    
    # Load user ignore file if exists
    local ignore_file="${ProjectPulse_Root}/.ProjectPulseignore"
    if [[ -f "$ignore_file" ]]; then
        while IFS= read -r line || [[ -n "$line" ]]; do
            # Skip empty lines and comments
            line="${line%%#*}"
            line="${line#"${line%%[![:space:]]*}"}"
            line="${line%"${line##*[![:space:]]}"}"
            if [[ -n "$line" ]]; then
                _ProjectPulse_IGNORE_PATTERNS+=("$line")
            fi
        done < "$ignore_file"
    fi
    
    _ProjectPulse_IGNORE_LOADED=1
}

# Check if path should be ignored
# Usage: should_ignore "relative/path"
# Returns: 0 if should ignore, 1 if should include
should_ignore() {
    local path="$1"
    
    load_ignore_patterns
    
    # Normalize path (remove leading ./ and trailing /)
    path="${path#./}"
    path="${path%/}"
    
    for pattern in "${_ProjectPulse_IGNORE_PATTERNS[@]}"; do
        # Exact match on basename
        local basename="${path##*/}"
        if [[ "$basename" == "$pattern" ]]; then
            return 0
        fi
        
        # Exact match on any path component
        if [[ "/$path/" == *"/$pattern/"* ]]; then
            return 0
        fi
        
        # Glob pattern matching (simple wildcards)
        if [[ "$pattern" == *"*"* ]]; then
            # Match against basename
            # shellcheck disable=SC2053
            if [[ "$basename" == $pattern ]]; then
                return 0
            fi
            # Match against full path
            # shellcheck disable=SC2053
            if [[ "$path" == $pattern ]]; then
                return 0
            fi
        fi
        
        # Directory pattern (ends with /)
        if [[ "$pattern" == */ ]]; then
            local dir_pattern="${pattern%/}"
            if [[ "/$path/" == *"/$dir_pattern/"* ]] || [[ "$path" == "$dir_pattern" ]]; then
                return 0
            fi
        fi
    done
    
    return 1
}

# Reset ignore patterns (for testing)
reset_ignore_patterns() {
    _ProjectPulse_IGNORE_PATTERNS=()
    _ProjectPulse_IGNORE_LOADED=0
}

#===============================================================================
# Path Safety
#===============================================================================

# Safely resolve relative path within project root
# Rejects: absolute paths, paths escaping root via ..
# Returns: resolved absolute path on success
realpath_safe() {
    local relpath="$1"
    
    # Reject absolute paths
    if [[ "$relpath" == /* ]]; then
        printf 'error: absolute paths not allowed: %s\n' "$relpath" >&2
        return 1
    fi
    
    # Reject empty path
    if [[ -z "$relpath" ]]; then
        printf 'error: empty path\n' >&2
        return 1
    fi
    
    # Resolve the path
    local resolved
    resolved=$(cd "$ProjectPulse_Root" && realpath -m "$relpath" 2>/dev/null) || {
        printf 'error: cannot resolve path: %s\n' "$relpath" >&2
        return 1
    }
    
    # Ensure resolved path is within root
    local root_resolved
    root_resolved=$(realpath -m "$ProjectPulse_Root")
    
    if [[ "$resolved" != "$root_resolved" && "$resolved" != "$root_resolved/"* ]]; then
        printf 'error: path escapes project root: %s\n' "$relpath" >&2
        return 1
    fi
    
    printf '%s' "$resolved"
}

#===============================================================================
# Deterministic Helpers
#===============================================================================

# Stable sort helper (LC_ALL=C for byte ordering)
deterministic_sort() {
    LC_ALL=C sort -u
}

#===============================================================================
# Cloud Config Getters (Phase 2)
#===============================================================================

# Get Google Cloud project ID
google_project() {
    printf '%s' "${GOOGLE_CLOUD_PROJECT:-${PROJECTPULSE_GOOGLE_PROJECT:-}}"
}

# Get Google Cloud location/region
google_location() {
    printf '%s' "${GOOGLE_CLOUD_LOCATION:-${PROJECTPULSE_GOOGLE_LOCATION:-us-central1}}"
}

# Get Google API key
google_api_key() {
    printf '%s' "${GOOGLE_API_KEY:-${PROJECTPULSE_GOOGLE_API_KEY:-}}"
}

# Get Google access token (Phase 2)
# Priority: 1) PROJECTPULSE_GOOGLE_ACCESS_TOKEN env var
#           2) gcloud auth print-access-token if available
#           3) empty string (unconfigured)
google_access_token() {
    # Check explicit token first
    if [[ -n "${PROJECTPULSE_GOOGLE_ACCESS_TOKEN:-}" ]]; then
        printf '%s' "$PROJECTPULSE_GOOGLE_ACCESS_TOKEN"
        return 0
    fi
    
    # Try gcloud CLI
    if has_command gcloud; then
        local token
        token=$(gcloud auth print-access-token 2>/dev/null || true)
        if [[ -n "$token" ]]; then
            printf '%s' "$token"
            return 0
        fi
    fi
    
    # Unconfigured
    printf ''
}

# Check if Google Cloud is configured
google_configured() {
    local token
    token=$(google_access_token)
    [[ -n "$token" ]]
}

#===============================================================================
# Utility Functions
#===============================================================================

# Check if command exists
has_command() {
    command -v "$1" &>/dev/null
}

# Debug logging (only if ProjectPulse_DEBUG set)
debug_log() {
    if [[ -n "${PROJECTPULSE_DEBUG:-}" ]]; then
        printf '[DEBUG] %s\n' "$*" >&2
    fi
}

# Get relative path from root
rel_path() {
    local abs_path="$1"
    local root_path
    root_path=$(realpath -m "$ProjectPulse_Root")
    
    if [[ "$abs_path" == "$root_path" ]]; then
        printf '.'
    elif [[ "$abs_path" == "$root_path/"* ]]; then
        printf '%s' "${abs_path#"$root_path/"}"
    else
        printf '%s' "$abs_path"
    fi
}

#===============================================================================
# Phase 2: Session ID Generation
#===============================================================================

# Generate stable session ID
# Uses: TTY + PID + shell level to create per-terminal-session identifier
generate_session_id() {
    local tty_part pid_part time_part
    
    # Try to get TTY
    tty_part=$(tty 2>/dev/null | tr '/' '_' || echo "notty")
    
    # Use parent PID for more stability across subshells
    pid_part="${PPID:-$$}"
    
    # Add shell level for nested shells
    local shlvl="${SHLVL:-1}"
    
    # Combine into stable identifier
    printf 'sess_%s_%s_%s' "$tty_part" "$pid_part" "$shlvl"
}

#===============================================================================
# Phase 2: Local File Cache Helpers
#===============================================================================

# Ensure .ProjectPulse directory structure exists
ensure_state_dir() {
    local subdir="${1:-}"
    local dir="${ProjectPulse_STATE_DIR}"
    
    if [[ -n "$subdir" ]]; then
        dir="${dir}/${subdir}"
    fi
    
    if [[ ! -d "$dir" ]]; then
        mkdir -p "$dir"
        chmod 700 "$dir" 2>/dev/null || true
    fi
    
    printf '%s' "$dir"
}

# Local cache get (file-based fallback)
local_cache_get() {
    local key="$1"
    local cache_dir
    cache_dir=$(ensure_state_dir "cache")
    local cache_file="${cache_dir}/${key}"
    
    if [[ -f "$cache_file" ]]; then
        local expiry
        expiry=$(head -1 "$cache_file" 2>/dev/null || echo 0)
        if [[ "$expiry" -gt "$(date +%s)" ]] 2>/dev/null; then
            tail -n +2 "$cache_file"
            return 0
        else
            rm -f "$cache_file" 2>/dev/null || true
        fi
    fi
    
    return 1
}

# Local cache set (file-based fallback)
local_cache_set() {
    local key="$1"
    local ttl="$2"
    local value="$3"
    local cache_dir
    cache_dir=$(ensure_state_dir "cache")
    local cache_file="${cache_dir}/${key}"
    
    local expiry=$(($(date +%s) + ttl))
    printf '%d\n%s' "$expiry" "$value" > "$cache_file" 2>/dev/null
}

#===============================================================================
# Phase 2: Injection Sentinel Helpers
#===============================================================================

# Check if injection already happened for this (project_id, session_id)
# Returns: 0 if already injected, 1 if not yet
injected_check() {
    local proj_id="$1"
    local sess_id="$2"
    local sentinel_key="injected:${proj_id}:${sess_id}"
    
    # Try Redis first
    if has_command redis-cli; then
        local val
        val=$(redis-cli --no-auth-warning GET "ProjectPulse:${sentinel_key}" 2>/dev/null || true)
        if [[ -n "$val" && "$val" != "(nil)" ]]; then
            return 0
        fi
    fi
    
    # Fallback to local sentinel file
    local sentinel_dir
    sentinel_dir=$(ensure_state_dir "sentinels")
    local sentinel_file="${sentinel_dir}/${sess_id}_${proj_id}"
    
    if [[ -f "$sentinel_file" ]]; then
        local expiry
        expiry=$(cat "$sentinel_file" 2>/dev/null || echo 0)
        if [[ "$expiry" -gt "$(date +%s)" ]] 2>/dev/null; then
            return 0
        else
            rm -f "$sentinel_file" 2>/dev/null || true
        fi
    fi
    
    return 1
}

# Mark injection as done for this (project_id, session_id)
injected_mark() {
    local proj_id="$1"
    local sess_id="$2"
    local sentinel_key="injected:${proj_id}:${sess_id}"
    local ttl="${3:-86400}"  # Default 24 hours
    
    # Try Redis first
    if has_command redis-cli; then
        redis-cli --no-auth-warning SETEX "ProjectPulse:${sentinel_key}" "$ttl" "1" &>/dev/null && return 0
    fi
    
    # Fallback to local sentinel file
    local sentinel_dir
    sentinel_dir=$(ensure_state_dir "sentinels")
    local sentinel_file="${sentinel_dir}/${sess_id}_${proj_id}"
    
    local expiry=$(($(date +%s) + ttl))
    printf '%d' "$expiry" > "$sentinel_file" 2>/dev/null
}
