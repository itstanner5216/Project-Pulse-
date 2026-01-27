#!/usr/bin/env bash
#===============================================================================
# ProjectPulse v4.0.0-phase2 Structured Briefing Pack Generation
# Generates IDE-like context pack: tree, key_files, symbols, entrypoints, hotspots, recent_changes
#
# Interface:
#   hooks/projectpulse.sh
#
# Output:
#   JSON via json_ok with pack object containing all panels
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

#===============================================================================
# Configuration - Panel Caps
#===============================================================================

MAX_TREE_ENTRIES=200
MAX_KEY_FILES=50
MAX_SYMBOLS_FILES=30
MAX_SYMBOLS_PER_FILE=50
MAX_ENTRYPOINTS=20
MAX_HOTSPOTS=30
MAX_RECENT_CHANGES=50
MAX_PACK_LINES=1000

#===============================================================================
# Panel: Tree
# Deterministic directory tree structure
#===============================================================================

generate_tree() {
    local tree_entries=()
    local count=0
    
    load_ignore_patterns
    
    # Collect files and directories, respecting ignores
    while IFS= read -r entry; do
        [[ -z "$entry" ]] && continue
        [[ "$count" -ge "$MAX_TREE_ENTRIES" ]] && break
        
        # Get relative path
        local relpath
        if [[ "$entry" == "$ProjectPulse_Root/"* ]]; then
            relpath="${entry#"$ProjectPulse_Root/"}"
        elif [[ "$entry" == "$ProjectPulse_Root" ]]; then
            relpath="."
        else
            relpath="$entry"
        fi
        
        # Skip ignored paths
        if should_ignore "$relpath"; then
            continue
        fi
        
        # Skip .ProjectPulse internal directory
        if [[ "$relpath" == ".ProjectPulse"* ]]; then
            continue
        fi
        
        tree_entries+=("$relpath")
        ((count++))
    done < <(find "$ProjectPulse_Root" -maxdepth 4 \( -type f -o -type d \) 2>/dev/null | LC_ALL=C sort)
    
    # Output as JSON array
    printf '['
    local first=1
    for entry in "${tree_entries[@]}"; do
        [[ "$first" -eq 0 ]] && printf ','
        printf '"%s"' "$(json_escape "$entry")"
        first=0
    done
    printf ']'
}

#===============================================================================
# Panel: Key Files
# Important files: READMEs, configs, main entrypoints, makefiles
#===============================================================================

generate_key_files() {
    local key_files=()
    local count=0
    
    load_ignore_patterns
    
    # Patterns for key files (case insensitive matching)
    local key_patterns=(
        "README*"
        "readme*"
        "CHANGELOG*"
        "changelog*"
        "LICENSE*"
        "license*"
        "Makefile"
        "makefile"
        "CMakeLists.txt"
        "package.json"
        "Cargo.toml"
        "go.mod"
        "pyproject.toml"
        "setup.py"
        "setup.cfg"
        "requirements.txt"
        "Gemfile"
        "Dockerfile"
        "docker-compose.yml"
        "docker-compose.yaml"
        ".env.example"
        "config.*"
        "main.*"
        "index.*"
        "app.*"
        "server.*"
        "mod.rs"
        "lib.rs"
        "__init__.py"
        "tsconfig.json"
        "webpack.config.*"
        "vite.config.*"
        ".gitignore"
        ".ProjectPulseignore"
    )
    
    # Find key files
    while IFS= read -r file; do
        [[ -z "$file" ]] && continue
        [[ "$count" -ge "$MAX_KEY_FILES" ]] && break
        
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
        
        # Skip .ProjectPulse
        if [[ "$relpath" == ".ProjectPulse"* ]]; then
            continue
        fi
        
        local basename="${relpath##*/}"
        local is_key=0
        
        for pattern in "${key_patterns[@]}"; do
            # shellcheck disable=SC2053
            if [[ "$basename" == $pattern ]]; then
                is_key=1
                break
            fi
        done
        
        if [[ "$is_key" -eq 1 ]]; then
            key_files+=("$relpath")
            ((count++))
        fi
    done < <(find "$ProjectPulse_Root" -type f -maxdepth 3 2>/dev/null | LC_ALL=C sort)
    
    # Output as JSON array
    printf '['
    local first=1
    for kf in "${key_files[@]}"; do
        [[ "$first" -eq 0 ]] && printf ','
        printf '"%s"' "$(json_escape "$kf")"
        first=0
    done
    printf ']'
}

#===============================================================================
# Panel: Symbols
# Extract symbols from key code files
#===============================================================================

generate_symbols() {
    local symbols_output="["
    local file_count=0
    local first_file=1
    
    load_ignore_patterns
    
    # Code file extensions to analyze
    local code_extensions="py|js|ts|jsx|tsx|go|rs|c|cpp|h|hpp|java|rb|sh"
    
    while IFS= read -r file; do
        [[ -z "$file" ]] && continue
        [[ "$file_count" -ge "$MAX_SYMBOLS_FILES" ]] && break
        
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
        
        # Skip .ProjectPulse
        if [[ "$relpath" == ".ProjectPulse"* ]]; then
            continue
        fi
        
        # Check if it's a code file
        local ext="${file##*.}"
        if ! [[ "$ext" =~ ^($code_extensions)$ ]]; then
            continue
        fi
        
        # Extract symbols inline (simplified version for performance)
        local file_symbols
        file_symbols=$(extract_file_symbols "$file" "$relpath")
        
        if [[ -n "$file_symbols" && "$file_symbols" != "[]" ]]; then
            [[ "$first_file" -eq 0 ]] && symbols_output+=","
            symbols_output+=$(printf '{"file":"%s","symbols":%s}' \
                "$(json_escape "$relpath")" \
                "$file_symbols")
            first_file=0
            ((file_count++))
        fi
    done < <(find "$ProjectPulse_Root" -type f -maxdepth 4 2>/dev/null | LC_ALL=C sort)
    
    symbols_output+="]"
    printf '%s' "$symbols_output"
}

# Simplified symbol extraction (inline, no external script dependency)
extract_file_symbols() {
    local filepath="$1"
    local relpath="$2"
    local ext="${filepath##*.}"
    local symbols=()
    local linenum=0
    local sym_count=0
    
    while IFS= read -r line || [[ -n "$line" ]]; do
        ((linenum++))
        [[ "$sym_count" -ge "$MAX_SYMBOLS_PER_FILE" ]] && break
        
        # Skip empty lines
        [[ -z "$line" ]] && continue
        
        local name="" kind=""
        
        case "$ext" in
            py)
                # Python classes and functions
                if [[ "$line" =~ ^[[:space:]]*(class)[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*) ]]; then
                    name="${BASH_REMATCH[2]}"
                    kind="class"
                elif [[ "$line" =~ ^[[:space:]]*(async[[:space:]]+)?def[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*) ]]; then
                    name="${BASH_REMATCH[2]}"
                    kind="function"
                fi
                ;;
            js|ts|jsx|tsx)
                # JS/TS classes, functions, interfaces
                if [[ "$line" =~ class[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*) ]]; then
                    name="${BASH_REMATCH[1]}"
                    kind="class"
                elif [[ "$line" =~ interface[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*) ]]; then
                    name="${BASH_REMATCH[1]}"
                    kind="interface"
                elif [[ "$line" =~ function[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*) ]]; then
                    name="${BASH_REMATCH[1]}"
                    kind="function"
                fi
                ;;
            go)
                # Go types and functions
                if [[ "$line" =~ ^type[[:space:]]+([A-Z][a-zA-Z0-9_]*)[[:space:]]+(struct|interface) ]]; then
                    name="${BASH_REMATCH[1]}"
                    kind="${BASH_REMATCH[2]}"
                elif [[ "$line" =~ ^func[[:space:]]+([A-Z][a-zA-Z0-9_]*) ]]; then
                    name="${BASH_REMATCH[1]}"
                    kind="function"
                fi
                ;;
            rs)
                # Rust structs, enums, functions
                if [[ "$line" =~ ^pub[[:space:]]+(struct|enum|trait)[[:space:]]+([A-Z][a-zA-Z0-9_]*) ]]; then
                    kind="${BASH_REMATCH[1]}"
                    name="${BASH_REMATCH[2]}"
                elif [[ "$line" =~ ^pub[[:space:]]+fn[[:space:]]+([a-z_][a-zA-Z0-9_]*) ]]; then
                    name="${BASH_REMATCH[1]}"
                    kind="function"
                fi
                ;;
            sh|bash)
                # Shell functions
                if [[ "$line" =~ ^[[:space:]]*([a-zA-Z_][a-zA-Z0-9_]*)[[:space:]]*\(\) ]] || \
                   [[ "$line" =~ ^[[:space:]]*function[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*) ]]; then
                    name="${BASH_REMATCH[1]}"
                    kind="function"
                fi
                ;;
        esac
        
        if [[ -n "$name" && -n "$kind" ]]; then
            symbols+=("$(printf '{"name":"%s","kind":"%s","line":%d}' \
                "$(json_escape "$name")" "$kind" "$linenum")")
            ((sym_count++))
        fi
    done < "$filepath" 2>/dev/null
    
    # Output sorted by line
    if [[ ${#symbols[@]} -gt 0 ]]; then
        printf '['
        local first=1
        for sym in "${symbols[@]}"; do
            [[ "$first" -eq 0 ]] && printf ','
            printf '%s' "$sym"
            first=0
        done
        printf ']'
    else
        printf '[]'
    fi
}

#===============================================================================
# Panel: Entrypoints
# Main executables, scripts, entry files
#===============================================================================

generate_entrypoints() {
    local entrypoints=()
    local count=0
    
    load_ignore_patterns
    
    # Entrypoint patterns
    local entry_patterns=(
        "main.py"
        "main.go"
        "main.rs"
        "main.js"
        "main.ts"
        "index.js"
        "index.ts"
        "app.py"
        "app.js"
        "server.py"
        "server.js"
        "server.go"
        "cli.py"
        "cli.js"
        "__main__.py"
        "manage.py"
    )
    
    # Also check for executables in bin/
    while IFS= read -r file; do
        [[ -z "$file" ]] && continue
        [[ "$count" -ge "$MAX_ENTRYPOINTS" ]] && break
        
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
        
        # Skip .ProjectPulse
        if [[ "$relpath" == ".ProjectPulse"* ]]; then
            continue
        fi
        
        local basename="${relpath##*/}"
        local is_entry=0
        
        # Check patterns
        for pattern in "${entry_patterns[@]}"; do
            if [[ "$basename" == "$pattern" ]]; then
                is_entry=1
                break
            fi
        done
        
        # Check if in bin/ directory
        if [[ "$relpath" == "bin/"* ]] && [[ -x "$file" ]]; then
            is_entry=1
        fi
        
        # Check for shebang in executable files
        if [[ "$is_entry" -eq 0 && -x "$file" ]]; then
            local first_line
            first_line=$(head -1 "$file" 2>/dev/null || true)
            if [[ "$first_line" == "#!"* ]]; then
                is_entry=1
            fi
        fi
        
        if [[ "$is_entry" -eq 1 ]]; then
            entrypoints+=("$relpath")
            ((count++))
        fi
    done < <(find "$ProjectPulse_Root" -type f -maxdepth 3 2>/dev/null | LC_ALL=C sort)
    
    # Output as JSON array
    printf '['
    local first=1
    for ep in "${entrypoints[@]}"; do
        [[ "$first" -eq 0 ]] && printf ','
        printf '"%s"' "$(json_escape "$ep")"
        first=0
    done
    printf ']'
}

#===============================================================================
# Panel: Hotspots
# Files with TODO/FIXME/HACK/XXX comments
#===============================================================================

generate_hotspots() {
    local hotspots_json="["
    local count=0
    local first=1
    
    load_ignore_patterns
    
    # Code file extensions
    local code_extensions="py|js|ts|jsx|tsx|go|rs|c|cpp|h|hpp|java|rb|sh|bash"
    
    while IFS= read -r file; do
        [[ -z "$file" ]] && continue
        [[ "$count" -ge "$MAX_HOTSPOTS" ]] && break
        
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
        
        # Skip .ProjectPulse
        if [[ "$relpath" == ".ProjectPulse"* ]]; then
            continue
        fi
        
        # Check extension
        local ext="${file##*.}"
        if ! [[ "$ext" =~ ^($code_extensions)$ ]]; then
            continue
        fi
        
        # Count TODOs/FIXMEs
        local todo_count
        todo_count=$(grep -c -E '(TODO|FIXME|HACK|XXX):?' "$file" 2>/dev/null || echo 0)
        
        if [[ "$todo_count" -gt 0 ]]; then
            [[ "$first" -eq 0 ]] && hotspots_json+=","
            hotspots_json+=$(printf '{"file":"%s","todo_count":%d}' \
                "$(json_escape "$relpath")" \
                "$todo_count")
            first=0
            ((count++))
        fi
    done < <(find "$ProjectPulse_Root" -type f -maxdepth 4 2>/dev/null | LC_ALL=C sort)
    
    hotspots_json+="]"
    printf '%s' "$hotspots_json"
}

#===============================================================================
# Panel: Recent Changes
# Files sorted by modification time
#===============================================================================

generate_recent_changes() {
    local changes_json="["
    local count=0
    local first=1
    
    load_ignore_patterns
    
    # Get files sorted by mtime (newest first)
    while IFS=$'\t' read -r mtime file; do
        [[ -z "$file" ]] && continue
        [[ "$count" -ge "$MAX_RECENT_CHANGES" ]] && break
        
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
        
        # Skip .ProjectPulse
        if [[ "$relpath" == ".ProjectPulse"* ]]; then
            continue
        fi
        
        [[ "$first" -eq 0 ]] && changes_json+=","
        changes_json+=$(printf '{"file":"%s","mtime":%s}' \
            "$(json_escape "$relpath")" \
            "$mtime")
        first=0
        ((count++))
    done < <(find "$ProjectPulse_Root" -type f -maxdepth 4 -printf '%T@\t%p\n' 2>/dev/null | \
             LC_ALL=C sort -t$'\t' -k1 -rn)
    
    changes_json+="]"
    printf '%s' "$changes_json"
}

#===============================================================================
# Main: Assemble Pack
#===============================================================================

generate_pack() {
    # Generate each panel
    local tree key_files symbols entrypoints hotspots recent_changes
    
    tree=$(generate_tree)
    key_files=$(generate_key_files)
    symbols=$(generate_symbols)
    entrypoints=$(generate_entrypoints)
    hotspots=$(generate_hotspots)
    recent_changes=$(generate_recent_changes)
    
    # Assemble pack
    local pack
    pack=$(printf '{"tree":%s,"key_files":%s,"symbols":%s,"entrypoints":%s,"hotspots":%s,"recent_changes":%s}' \
        "$tree" \
        "$key_files" \
        "$symbols" \
        "$entrypoints" \
        "$hotspots" \
        "$recent_changes")
    
    json_ok "$pack"
}

#===============================================================================
# Main Entry Point
#===============================================================================

main() {
    generate_pack
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
