#!/usr/bin/env bash
#===============================================================================
# ProjectPulse v4.0.0-phase1 Search Hook
# Deterministic search via ast-grep/rg/grep with fallback
# Semantic routing is a stub in Phase 1 (returns empty matches)
#
# Interface:
#   hooks/search.sh [QUERY] [OPTIONS]
#
# Options:
#   --name, -n          Filename search (match paths instead of content)
#   --limit N           Hard cap on returned matches (default: 100)
#   --glob PAT          Include glob pattern
#   --iglob PAT         Ignore/exclude glob pattern
#   --json              Output JSON envelope
#   --ast               Prefer ast-grep for content search
#   --force-keyword     Force keyword search strategy
#   --force-semantic    Force semantic search (stub: returns empty)
#===============================================================================

set -euo pipefail

# Resolve script directory and source core library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="${SCRIPT_DIR}/../lib"

# Source core library
# shellcheck source=lib/core.sh
source "${LIB_DIR}/core.sh"

#===============================================================================
# Configuration
#===============================================================================

DEFAULT_LIMIT=100
MAX_LIMIT=1000

#===============================================================================
# Argument Parsing
#===============================================================================

QUERY=""
NAME_MODE=0
LIMIT=$DEFAULT_LIMIT
GLOB_INCLUDE=()
GLOB_EXCLUDE=()
JSON_OUTPUT=0
PREFER_AST=0
FORCE_KEYWORD=0
FORCE_SEMANTIC=0

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --name|-n)
                NAME_MODE=1
                shift
                ;;
            --limit)
                if [[ -z "${2:-}" ]]; then
                    json_err "missing value for --limit" 1 || return 1
                fi
                LIMIT="$2"
                if ! [[ "$LIMIT" =~ ^[0-9]+$ ]]; then
                    json_err "limit must be a positive integer" 1 || return 1
                fi
                if [[ "$LIMIT" -gt "$MAX_LIMIT" ]]; then
                    LIMIT=$MAX_LIMIT
                fi
                shift 2
                ;;
            --glob)
                if [[ -z "${2:-}" ]]; then
                    json_err "missing value for --glob" 1 || return 1
                fi
                GLOB_INCLUDE+=("$2")
                shift 2
                ;;
            --iglob)
                if [[ -z "${2:-}" ]]; then
                    json_err "missing value for --iglob" 1 || return 1
                fi
                GLOB_EXCLUDE+=("$2")
                shift 2
                ;;
            --json)
                JSON_OUTPUT=1
                shift
                ;;
            --ast)
                PREFER_AST=1
                shift
                ;;
            --force-keyword)
                FORCE_KEYWORD=1
                FORCE_SEMANTIC=0
                shift
                ;;
            --force-semantic)
                FORCE_SEMANTIC=1
                FORCE_KEYWORD=0
                shift
                ;;
            -*)
                json_err "unknown option: $1" 1 || return 1
                ;;
            *)
                if [[ -z "$QUERY" ]]; then
                    QUERY="$1"
                else
                    json_err "unexpected argument: $1" 1 || return 1
                fi
                shift
                ;;
        esac
    done
    
    if [[ -z "$QUERY" ]]; then
        json_err "query required" 1 || return 1
    fi
}

#===============================================================================
# Tool Detection
#===============================================================================

has_rg() {
    command -v rg &>/dev/null
}

has_ast_grep() {
    command -v ast-grep &>/dev/null || command -v sg &>/dev/null
}

get_ast_grep_cmd() {
    if command -v ast-grep &>/dev/null; then
        echo "ast-grep"
    elif command -v sg &>/dev/null; then
        echo "sg"
    fi
}

#===============================================================================
# Ignore Pattern Integration
#===============================================================================

# Build ripgrep ignore arguments
build_rg_ignore_args() {
    local args=()
    
    load_ignore_patterns
    
    for pattern in "${_ProjectPulse_IGNORE_PATTERNS[@]}"; do
        args+=("--glob" "!${pattern}")
    done
    
    # Add user-specified excludes
    for pattern in "${GLOB_EXCLUDE[@]}"; do
        args+=("--glob" "!${pattern}")
    done
    
    # Add user-specified includes
    for pattern in "${GLOB_INCLUDE[@]}"; do
        args+=("--glob" "${pattern}")
    done
    
    printf '%s\n' "${args[@]}"
}

# Build grep/find ignore expressions
build_find_ignore_expr() {
    local expr=()
    
    load_ignore_patterns
    
    for pattern in "${_ProjectPulse_IGNORE_PATTERNS[@]}"; do
        # Handle directory names
        if [[ "$pattern" != *"*"* ]]; then
            expr+=("-o" "-name" "$pattern")
        fi
    done
    
    # Add user excludes
    for pattern in "${GLOB_EXCLUDE[@]}"; do
        expr+=("-o" "-name" "$pattern")
    done
    
    if [[ ${#expr[@]} -gt 0 ]]; then
        # Remove leading -o
        printf '%s\n' "${expr[@]:1}"
    fi
}

# Filter file by ignore patterns (for fallback searches)
file_matches_ignores() {
    local filepath="$1"
    local relpath
    
    # Get relative path
    if [[ "$filepath" == "$ProjectPulse_Root/"* ]]; then
        relpath="${filepath#"$ProjectPulse_Root/"}"
    else
        relpath="$filepath"
    fi
    
    should_ignore "$relpath"
}

# Check if file matches include globs (if specified)
file_matches_includes() {
    local filepath="$1"
    local basename="${filepath##*/}"
    
    if [[ ${#GLOB_INCLUDE[@]} -eq 0 ]]; then
        return 0  # No include filter, match all
    fi
    
    for pattern in "${GLOB_INCLUDE[@]}"; do
        # shellcheck disable=SC2053
        if [[ "$basename" == $pattern ]] || [[ "$filepath" == *$pattern ]]; then
            return 0
        fi
    done
    
    return 1
}

#===============================================================================
# Search Implementations
#===============================================================================

# Content search with ripgrep
search_content_rg() {
    local query="$1"
    local matches=()
    local count=0
    
    # Build ignore arguments
    local -a rg_args=()
    while IFS= read -r arg; do
        [[ -n "$arg" ]] && rg_args+=("$arg")
    done < <(build_rg_ignore_args)
    
    # Run ripgrep with line numbers and no heading
    local rg_output
    rg_output=$(rg --no-heading --line-number --with-filename \
        --max-count "$((LIMIT * 2))" \
        "${rg_args[@]}" \
        -- "$query" "$ProjectPulse_Root" 2>/dev/null || true)
    
    # Parse ripgrep output (format: file:line:match)
    while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        [[ $count -ge $LIMIT ]] && break
        
        # Parse file:line:content format
        local file linenum content
        
        # Extract file path (everything before first colon after path)
        file="${line%%:*}"
        local rest="${line#*:}"
        linenum="${rest%%:*}"
        content="${rest#*:}"
        
        # Get relative path
        local relpath
        if [[ "$file" == "$ProjectPulse_Root/"* ]]; then
            relpath="${file#"$ProjectPulse_Root/"}"
        else
            relpath="$file"
        fi
        
        # Build match JSON object
        local match_json
        match_json=$(printf '{"file":"%s","line":%d,"match":"%s"}' \
            "$(json_escape "$relpath")" \
            "$linenum" \
            "$(json_escape "$content")")
        
        matches+=("$match_json")
        ((count++))
    done <<< "$rg_output"
    
    # Output matches array
    printf '['
    local first=1
    for m in "${matches[@]}"; do
        [[ $first -eq 0 ]] && printf ','
        printf '%s' "$m"
        first=0
    done
    printf ']'
    
    printf '%d' "$count" >&3
}

# Content search with ast-grep
search_content_ast() {
    local query="$1"
    local matches=()
    local count=0
    local ast_cmd
    ast_cmd=$(get_ast_grep_cmd)
    
    # ast-grep pattern search
    local ast_output
    ast_output=$("$ast_cmd" --pattern "$query" --json "$ProjectPulse_Root" 2>/dev/null || true)
    
    # Parse JSON output if available (ast-grep outputs JSON lines)
    if [[ -n "$ast_output" ]]; then
        while IFS= read -r line; do
            [[ -z "$line" ]] && continue
            [[ $count -ge $LIMIT ]] && break
            
            # Extract fields from JSON (jq-free parsing)
            local file linenum content
            
            # Try to extract "file" field
            if [[ "$line" == *'"file":'* ]]; then
                file=$(printf '%s' "$line" | sed -n 's/.*"file"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
                linenum=$(printf '%s' "$line" | sed -n 's/.*"line"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p')
                content=$(printf '%s' "$line" | sed -n 's/.*"text"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
                
                [[ -z "$linenum" ]] && linenum=1
                [[ -z "$content" ]] && content="$query"
                
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
                
                local match_json
                match_json=$(printf '{"file":"%s","line":%d,"match":"%s"}' \
                    "$(json_escape "$relpath")" \
                    "$linenum" \
                    "$(json_escape "$content")")
                
                matches+=("$match_json")
                ((count++))
            fi
        done <<< "$ast_output"
    fi
    
    # Output matches array
    printf '['
    local first=1
    for m in "${matches[@]}"; do
        [[ $first -eq 0 ]] && printf ','
        printf '%s' "$m"
        first=0
    done
    printf ']'
    
    printf '%d' "$count" >&3
}

# Content search with grep fallback
search_content_grep() {
    local query="$1"
    local matches=()
    local count=0
    
    # Build find command with prunes
    local find_prune=()
    load_ignore_patterns
    
    for pattern in "${_ProjectPulse_IGNORE_PATTERNS[@]}"; do
        if [[ "$pattern" != *"*"* ]]; then
            find_prune+=("-o" "-name" "$pattern" "-prune")
        fi
    done
    
    for pattern in "${GLOB_EXCLUDE[@]}"; do
        find_prune+=("-o" "-name" "$pattern" "-prune")
    done
    
    # Find files and grep through them
    local files
    if [[ ${#find_prune[@]} -gt 0 ]]; then
        files=$(find "$ProjectPulse_Root" -type f \( "${find_prune[@]:1}" \) -o -type f -print 2>/dev/null | LC_ALL=C sort)
    else
        files=$(find "$ProjectPulse_Root" -type f -print 2>/dev/null | LC_ALL=C sort)
    fi
    
    while IFS= read -r file; do
        [[ -z "$file" ]] && continue
        [[ $count -ge $LIMIT ]] && break
        
        # Get relative path
        local relpath
        if [[ "$file" == "$ProjectPulse_Root/"* ]]; then
            relpath="${file#"$ProjectPulse_Root/"}"
        else
            relpath="$file"
        fi
        
        # Skip ignored
        if should_ignore "$relpath"; then
            continue
        fi
        
        # Check include globs
        if ! file_matches_includes "$relpath"; then
            continue
        fi
        
        # Skip binary files
        if file "$file" 2>/dev/null | grep -q "binary"; then
            continue
        fi
        
        # Grep the file
        local grep_out
        grep_out=$(grep -n -- "$query" "$file" 2>/dev/null || true)
        
        while IFS= read -r gline; do
            [[ -z "$gline" ]] && continue
            [[ $count -ge $LIMIT ]] && break
            
            local linenum="${gline%%:*}"
            local content="${gline#*:}"
            
            local match_json
            match_json=$(printf '{"file":"%s","line":%d,"match":"%s"}' \
                "$(json_escape "$relpath")" \
                "$linenum" \
                "$(json_escape "$content")")
            
            matches+=("$match_json")
            ((count++))
        done <<< "$grep_out"
    done <<< "$files"
    
    # Output matches array
    printf '['
    local first=1
    for m in "${matches[@]}"; do
        [[ $first -eq 0 ]] && printf ','
        printf '%s' "$m"
        first=0
    done
    printf ']'
    
    printf '%d' "$count" >&3
}

# Filename search with ripgrep
search_name_rg() {
    local query="$1"
    local matches=()
    local count=0
    
    # Build ignore arguments
    local -a rg_args=()
    while IFS= read -r arg; do
        [[ -n "$arg" ]] && rg_args+=("$arg")
    done < <(build_rg_ignore_args)
    
    # Use ripgrep --files with glob to list files, then filter
    local files
    files=$(rg --files "${rg_args[@]}" "$ProjectPulse_Root" 2>/dev/null | \
        grep -i -- "$query" | \
        LC_ALL=C sort | \
        head -n "$LIMIT")
    
    while IFS= read -r file; do
        [[ -z "$file" ]] && continue
        [[ $count -ge $LIMIT ]] && break
        
        # Get relative path
        local relpath
        if [[ "$file" == "$ProjectPulse_Root/"* ]]; then
            relpath="${file#"$ProjectPulse_Root/"}"
        else
            relpath="$file"
        fi
        
        local match_json
        match_json=$(printf '{"file":"%s","line":0,"match":"%s"}' \
            "$(json_escape "$relpath")" \
            "$(json_escape "$relpath")")
        
        matches+=("$match_json")
        ((count++))
    done <<< "$files"
    
    # Output matches array
    printf '['
    local first=1
    for m in "${matches[@]}"; do
        [[ $first -eq 0 ]] && printf ','
        printf '%s' "$m"
        first=0
    done
    printf ']'
    
    printf '%d' "$count" >&3
}

# Filename search with find fallback
search_name_find() {
    local query="$1"
    local matches=()
    local count=0
    
    # Build find prunes
    local find_prune=()
    load_ignore_patterns
    
    for pattern in "${_ProjectPulse_IGNORE_PATTERNS[@]}"; do
        if [[ "$pattern" != *"*"* ]]; then
            find_prune+=("-o" "-name" "$pattern" "-prune")
        fi
    done
    
    for pattern in "${GLOB_EXCLUDE[@]}"; do
        find_prune+=("-o" "-name" "$pattern" "-prune")
    done
    
    local files
    if [[ ${#find_prune[@]} -gt 0 ]]; then
        files=$(find "$ProjectPulse_Root" -type f \( "${find_prune[@]:1}" \) -o -type f -print 2>/dev/null | \
            grep -i -- "$query" | \
            LC_ALL=C sort | \
            head -n "$LIMIT")
    else
        files=$(find "$ProjectPulse_Root" -type f -print 2>/dev/null | \
            grep -i -- "$query" | \
            LC_ALL=C sort | \
            head -n "$LIMIT")
    fi
    
    while IFS= read -r file; do
        [[ -z "$file" ]] && continue
        [[ $count -ge $LIMIT ]] && break
        
        # Get relative path
        local relpath
        if [[ "$file" == "$ProjectPulse_Root/"* ]]; then
            relpath="${file#"$ProjectPulse_Root/"}"
        else
            relpath="$file"
        fi
        
        # Skip ignored
        if should_ignore "$relpath"; then
            continue
        fi
        
        # Check include globs
        if ! file_matches_includes "$relpath"; then
            continue
        fi
        
        local match_json
        match_json=$(printf '{"file":"%s","line":0,"match":"%s"}' \
            "$(json_escape "$relpath")" \
            "$(json_escape "$relpath")")
        
        matches+=("$match_json")
        ((count++))
    done <<< "$files"
    
    # Output matches array
    printf '['
    local first=1
    for m in "${matches[@]}"; do
        [[ $first -eq 0 ]] && printf ','
        printf '%s' "$m"
        first=0
    done
    printf ']'
    
    printf '%d' "$count" >&3
}

# Semantic search stub (Phase 1: returns empty matches)
search_semantic() {
    printf '[]'
    printf '0' >&3
}

#===============================================================================
# Main Search Logic
#===============================================================================

do_search() {
    local strategy="keyword"
    local matches_json
    local count
    
    # Determine strategy
    if [[ $FORCE_SEMANTIC -eq 1 ]]; then
        strategy="semantic"
    fi
    
    # Execute search based on mode and strategy
    if [[ "$strategy" == "semantic" ]]; then
        # Semantic stub
        exec 3>&1
        matches_json=$(search_semantic)
        count=$(cat <&3 2>/dev/null || echo 0)
        exec 3>&-
    elif [[ $NAME_MODE -eq 1 ]]; then
        # Filename search
        exec 3>&1
        if has_rg; then
            matches_json=$(search_name_rg "$QUERY" 3>&1 1>&4) 4>&1
            count=$(cat <&3 2>/dev/null || echo 0) || count=0
        else
            matches_json=$(search_name_find "$QUERY" 3>&1 1>&4) 4>&1
            count=$(cat <&3 2>/dev/null || echo 0) || count=0
        fi
        exec 3>&-
    else
        # Content search
        exec 3>&1
        if [[ $PREFER_AST -eq 1 ]] && has_ast_grep; then
            matches_json=$(search_content_ast "$QUERY" 3>&1 1>&4) 4>&1
            count=$(cat <&3 2>/dev/null || echo 0) || count=0
        elif has_rg; then
            matches_json=$(search_content_rg "$QUERY" 3>&1 1>&4) 4>&1
            count=$(cat <&3 2>/dev/null || echo 0) || count=0
        else
            matches_json=$(search_content_grep "$QUERY" 3>&1 1>&4) 4>&1
            count=$(cat <&3 2>/dev/null || echo 0) || count=0
        fi
        exec 3>&-
    fi
    
    # Ensure count is numeric
    [[ -z "$count" ]] && count=0
    [[ ! "$count" =~ ^[0-9]+$ ]] && count=0
    
    # Ensure matches_json is valid
    [[ -z "$matches_json" ]] && matches_json="[]"
    
    # Build result object
    local result_json
    result_json=$(printf '{"strategy":"%s","matches":%s,"count":%d,"limit":%d}' \
        "$strategy" "$matches_json" "$count" "$LIMIT")
    
    if [[ $JSON_OUTPUT -eq 1 ]]; then
        json_ok "$result_json"
    else
        # Human-readable output
        printf 'Strategy: %s\n' "$strategy"
        printf 'Matches: %d (limit: %d)\n' "$count" "$LIMIT"
        printf '\n'
        
        # Parse and display matches
        # Simple extraction without jq
        local in_matches=0
        local match_count=0
        printf '%s' "$matches_json" | tr '{},' '\n' | while IFS= read -r field; do
            if [[ "$field" == *'"file"'* ]]; then
                local file_val
                file_val=$(printf '%s' "$field" | sed 's/.*"file"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
                printf '%s' "$file_val"
            elif [[ "$field" == *'"line"'* ]]; then
                local line_val
                line_val=$(printf '%s' "$field" | sed 's/.*"line"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/')
                printf ':%s: ' "$line_val"
            elif [[ "$field" == *'"match"'* ]]; then
                local match_val
                match_val=$(printf '%s' "$field" | sed 's/.*"match"[[:space:]]*:[[:space:]]*"\(.*\)"/\1/')
                printf '%s\n' "$match_val"
            fi
        done
    fi
}

#===============================================================================
# Alternative search execution with proper FD handling
#===============================================================================

execute_search() {
    local strategy="keyword"
    local matches_json="[]"
    local count=0
    
    # Determine strategy
    if [[ $FORCE_SEMANTIC -eq 1 ]]; then
        strategy="semantic"
        matches_json="[]"
        count=0
    elif [[ $NAME_MODE -eq 1 ]]; then
        # Filename search
        if has_rg; then
            matches_json=$(search_name_rg_simple "$QUERY")
        else
            matches_json=$(search_name_find_simple "$QUERY")
        fi
    else
        # Content search
        if [[ $PREFER_AST -eq 1 ]] && has_ast_grep; then
            matches_json=$(search_content_ast_simple "$QUERY")
        elif has_rg; then
            matches_json=$(search_content_rg_simple "$QUERY")
        else
            matches_json=$(search_content_grep_simple "$QUERY")
        fi
    fi
    
    # Count matches from JSON array
    count=$(printf '%s' "$matches_json" | grep -o '"file"' | wc -l || echo 0)
    
    # Build result
    local result_json
    result_json=$(printf '{"strategy":"%s","matches":%s,"count":%d,"limit":%d}' \
        "$strategy" "$matches_json" "$count" "$LIMIT")
    
    if [[ $JSON_OUTPUT -eq 1 ]]; then
        json_ok "$result_json"
    else
        printf 'Strategy: %s\n' "$strategy"
        printf 'Matches: %d (limit: %d)\n\n' "$count" "$LIMIT"
        printf '%s\n' "$matches_json"
    fi
}

# Simplified search functions that return JSON directly

search_content_rg_simple() {
    local query="$1"
    local matches=()
    local count=0
    
    # Build ignore arguments
    local -a rg_args=()
    while IFS= read -r arg; do
        [[ -n "$arg" ]] && rg_args+=("$arg")
    done < <(build_rg_ignore_args)
    
    # Run ripgrep
    local rg_output
    rg_output=$(rg --no-heading --line-number --with-filename \
        --max-count "$((LIMIT * 2))" \
        "${rg_args[@]}" \
        -- "$query" "$ProjectPulse_Root" 2>/dev/null || true)
    
    while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        [[ $count -ge $LIMIT ]] && break
        
        local file linenum content
        file="${line%%:*}"
        local rest="${line#*:}"
        linenum="${rest%%:*}"
        content="${rest#*:}"
        
        # Validate linenum is numeric
        if ! [[ "$linenum" =~ ^[0-9]+$ ]]; then
            continue
        fi
        
        local relpath
        if [[ "$file" == "$ProjectPulse_Root/"* ]]; then
            relpath="${file#"$ProjectPulse_Root/"}"
        else
            relpath="$file"
        fi
        
        matches+=("$(printf '{"file":"%s","line":%d,"match":"%s"}' \
            "$(json_escape "$relpath")" \
            "$linenum" \
            "$(json_escape "$content")")")
        
        ((count++))
    done <<< "$rg_output"
    
    # Output JSON array
    printf '['
    local first=1
    for m in "${matches[@]}"; do
        [[ $first -eq 0 ]] && printf ','
        printf '%s' "$m"
        first=0
    done
    printf ']'
}

search_content_ast_simple() {
    local query="$1"
    local ast_cmd
    ast_cmd=$(get_ast_grep_cmd)
    
    # For now, fall back to rg since ast-grep JSON parsing is complex
    if has_rg; then
        search_content_rg_simple "$query"
    else
        search_content_grep_simple "$query"
    fi
}

search_content_grep_simple() {
    local query="$1"
    local matches=()
    local count=0
    
    # Find files
    load_ignore_patterns
    local find_cmd="find \"$ProjectPulse_Root\" -type f"
    
    for pattern in "${_ProjectPulse_IGNORE_PATTERNS[@]}"; do
        if [[ "$pattern" != *"*"* ]]; then
            find_cmd+=" ! -path \"*/${pattern}/*\" ! -name \"$pattern\""
        fi
    done
    
    for pattern in "${GLOB_EXCLUDE[@]}"; do
        find_cmd+=" ! -path \"*/${pattern}/*\" ! -name \"$pattern\""
    done
    
    local files
    files=$(eval "$find_cmd" 2>/dev/null | LC_ALL=C sort)
    
    while IFS= read -r file; do
        [[ -z "$file" ]] && continue
        [[ $count -ge $LIMIT ]] && break
        
        local relpath
        if [[ "$file" == "$ProjectPulse_Root/"* ]]; then
            relpath="${file#"$ProjectPulse_Root/"}"
        else
            relpath="$file"
        fi
        
        # Skip ignored and non-matching includes
        if should_ignore "$relpath"; then
            continue
        fi
        if ! file_matches_includes "$relpath"; then
            continue
        fi
        
        # Skip binary files  
        if file "$file" 2>/dev/null | grep -q "binary"; then
            continue
        fi
        
        local grep_out
        grep_out=$(grep -n -- "$query" "$file" 2>/dev/null || true)
        
        while IFS= read -r gline; do
            [[ -z "$gline" ]] && continue
            [[ $count -ge $LIMIT ]] && break
            
            local linenum="${gline%%:*}"
            local content="${gline#*:}"
            
            # Validate linenum
            if ! [[ "$linenum" =~ ^[0-9]+$ ]]; then
                continue
            fi
            
            matches+=("$(printf '{"file":"%s","line":%d,"match":"%s"}' \
                "$(json_escape "$relpath")" \
                "$linenum" \
                "$(json_escape "$content")")")
            
            ((count++))
        done <<< "$grep_out"
    done <<< "$files"
    
    printf '['
    local first=1
    for m in "${matches[@]}"; do
        [[ $first -eq 0 ]] && printf ','
        printf '%s' "$m"
        first=0
    done
    printf ']'
}

search_name_rg_simple() {
    local query="$1"
    local matches=()
    local count=0
    
    local -a rg_args=()
    while IFS= read -r arg; do
        [[ -n "$arg" ]] && rg_args+=("$arg")
    done < <(build_rg_ignore_args)
    
    local files
    files=$(rg --files "${rg_args[@]}" "$ProjectPulse_Root" 2>/dev/null | \
        grep -i -- "$query" | \
        LC_ALL=C sort | \
        head -n "$LIMIT")
    
    while IFS= read -r file; do
        [[ -z "$file" ]] && continue
        [[ $count -ge $LIMIT ]] && break
        
        local relpath
        if [[ "$file" == "$ProjectPulse_Root/"* ]]; then
            relpath="${file#"$ProjectPulse_Root/"}"
        else
            relpath="$file"
        fi
        
        matches+=("$(printf '{"file":"%s","line":0,"match":"%s"}' \
            "$(json_escape "$relpath")" \
            "$(json_escape "$relpath")")")
        
        ((count++))
    done <<< "$files"
    
    printf '['
    local first=1
    for m in "${matches[@]}"; do
        [[ $first -eq 0 ]] && printf ','
        printf '%s' "$m"
        first=0
    done
    printf ']'
}

search_name_find_simple() {
    local query="$1"
    local matches=()
    local count=0
    
    load_ignore_patterns
    local find_cmd="find \"$ProjectPulse_Root\" -type f"
    
    for pattern in "${_ProjectPulse_IGNORE_PATTERNS[@]}"; do
        if [[ "$pattern" != *"*"* ]]; then
            find_cmd+=" ! -path \"*/${pattern}/*\" ! -name \"$pattern\""
        fi
    done
    
    for pattern in "${GLOB_EXCLUDE[@]}"; do
        find_cmd+=" ! -path \"*/${pattern}/*\" ! -name \"$pattern\""
    done
    
    local files
    files=$(eval "$find_cmd" 2>/dev/null | grep -i -- "$query" | LC_ALL=C sort | head -n "$LIMIT")
    
    while IFS= read -r file; do
        [[ -z "$file" ]] && continue
        [[ $count -ge $LIMIT ]] && break
        
        local relpath
        if [[ "$file" == "$ProjectPulse_Root/"* ]]; then
            relpath="${file#"$ProjectPulse_Root/"}"
        else
            relpath="$file"
        fi
        
        if should_ignore "$relpath"; then
            continue
        fi
        if ! file_matches_includes "$relpath"; then
            continue
        fi
        
        matches+=("$(printf '{"file":"%s","line":0,"match":"%s"}' \
            "$(json_escape "$relpath")" \
            "$(json_escape "$relpath")")")
        
        ((count++))
    done <<< "$files"
    
    printf '['
    local first=1
    for m in "${matches[@]}"; do
        [[ $first -eq 0 ]] && printf ','
        printf '%s' "$m"
        first=0
    done
    printf ']'
}

#===============================================================================
# Main Entry Point
#===============================================================================

main() {
    parse_args "$@" || return $?
    execute_search
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
