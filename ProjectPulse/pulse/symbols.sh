#!/usr/bin/env bash
#===============================================================================
# ProjectPulse v4.0.0-phase1 Symbol Extraction Hook
# Multi-language symbol extraction (tree-sitter ready, MVP regex)
#
# Interface:
#   hooks/symbols.sh --file RELPATH [--json]
#   hooks/symbols.sh RELPATH [--json]
#
# Supported Languages:
#   Python (.py), JavaScript/TypeScript (.js, .ts, .jsx, .tsx),
#   Go (.go), Rust (.rs), C/C++ (.c, .cpp, .h, .hpp)
#
# Output:
#   {"file":"relpath","symbols":[{"name":"...","kind":"...","line":N},...],"count":N}
#===============================================================================

set -euo pipefail

# Resolve script directory and source core library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="${SCRIPT_DIR}/../lib"

# Source core library
# shellcheck source=lib/core.sh
source "${LIB_DIR}/core.sh"

#===============================================================================
# Argument Parsing
#===============================================================================

FILE_PATH=""
JSON_OUTPUT=0

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --file|-f)
                if [[ -z "${2:-}" ]]; then
                    json_err "missing value for --file" 1 || return 1
                fi
                FILE_PATH="$2"
                shift 2
                ;;
            --json)
                JSON_OUTPUT=1
                shift
                ;;
            -*)
                json_err "unknown option: $1" 1 || return 1
                ;;
            *)
                if [[ -z "$FILE_PATH" ]]; then
                    FILE_PATH="$1"
                else
                    json_err "unexpected argument: $1" 1 || return 1
                fi
                shift
                ;;
        esac
    done
    
    if [[ -z "$FILE_PATH" ]]; then
        json_err "file path required (use --file PATH or positional)" 1 || return 1
    fi
}

#===============================================================================
# Language Detection
#===============================================================================

get_language() {
    local filepath="$1"
    local ext="${filepath##*.}"
    
    case "$ext" in
        py)
            echo "python"
            ;;
        js|jsx|mjs)
            echo "javascript"
            ;;
        ts|tsx|mts)
            echo "typescript"
            ;;
        go)
            echo "go"
            ;;
        rs)
            echo "rust"
            ;;
        c|h)
            echo "c"
            ;;
        cpp|cc|cxx|hpp|hxx)
            echo "cpp"
            ;;
        java)
            echo "java"
            ;;
        rb)
            echo "ruby"
            ;;
        sh|bash)
            echo "shell"
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

#===============================================================================
# Symbol Extraction - Python
#===============================================================================

extract_python_symbols() {
    local filepath="$1"
    local symbols=()
    local linenum=0
    
    while IFS= read -r line || [[ -n "$line" ]]; do
        ((linenum++))
        
        # Skip empty lines and comments
        [[ -z "$line" ]] && continue
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        
        # Class definitions
        if [[ "$line" =~ ^[[:space:]]*(class)[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*) ]]; then
            local name="${BASH_REMATCH[2]}"
            symbols+=("$(printf '{"name":"%s","kind":"class","line":%d}' \
                "$(json_escape "$name")" "$linenum")")
            continue
        fi
        
        # Function/method definitions
        if [[ "$line" =~ ^[[:space:]]*(async[[:space:]]+)?def[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*) ]]; then
            local name="${BASH_REMATCH[2]}"
            # Check if it's a method (indented) or function (not indented)
            if [[ "$line" =~ ^[[:space:]]+ ]] && [[ ! "$line" =~ ^def ]]; then
                symbols+=("$(printf '{"name":"%s","kind":"method","line":%d}' \
                    "$(json_escape "$name")" "$linenum")")
            else
                symbols+=("$(printf '{"name":"%s","kind":"function","line":%d}' \
                    "$(json_escape "$name")" "$linenum")")
            fi
            continue
        fi
        
        # Module-level constants (UPPER_CASE = value at module level)
        if [[ "$line" =~ ^([A-Z][A-Z0-9_]*)[[:space:]]*= ]]; then
            local name="${BASH_REMATCH[1]}"
            symbols+=("$(printf '{"name":"%s","kind":"const","line":%d}' \
                "$(json_escape "$name")" "$linenum")")
            continue
        fi
        
    done < "$filepath"
    
    # Output sorted array
    output_symbols_array "${symbols[@]}"
}

#===============================================================================
# Symbol Extraction - JavaScript/TypeScript
#===============================================================================

extract_js_symbols() {
    local filepath="$1"
    local symbols=()
    local linenum=0
    
    while IFS= read -r line || [[ -n "$line" ]]; do
        ((linenum++))
        
        # Skip empty lines and comments
        [[ -z "$line" ]] && continue
        [[ "$line" =~ ^[[:space:]]*/[/*] ]] && continue
        
        # Class definitions
        if [[ "$line" =~ (export[[:space:]]+)?(default[[:space:]]+)?class[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*) ]]; then
            local name="${BASH_REMATCH[3]}"
            symbols+=("$(printf '{"name":"%s","kind":"class","line":%d}' \
                "$(json_escape "$name")" "$linenum")")
            continue
        fi
        
        # Interface definitions (TypeScript)
        if [[ "$line" =~ (export[[:space:]]+)?interface[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*) ]]; then
            local name="${BASH_REMATCH[2]}"
            symbols+=("$(printf '{"name":"%s","kind":"interface","line":%d}' \
                "$(json_escape "$name")" "$linenum")")
            continue
        fi
        
        # Type alias definitions (TypeScript)
        if [[ "$line" =~ (export[[:space:]]+)?type[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*)[[:space:]]*= ]]; then
            local name="${BASH_REMATCH[2]}"
            symbols+=("$(printf '{"name":"%s","kind":"type","line":%d}' \
                "$(json_escape "$name")" "$linenum")")
            continue
        fi
        
        # Function declarations
        if [[ "$line" =~ (export[[:space:]]+)?(async[[:space:]]+)?function[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*) ]]; then
            local name="${BASH_REMATCH[3]}"
            symbols+=("$(printf '{"name":"%s","kind":"function","line":%d}' \
                "$(json_escape "$name")" "$linenum")")
            continue
        fi
        
        # Arrow functions with const/let/var
        if [[ "$line" =~ (export[[:space:]]+)?(const|let|var)[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*)[[:space:]]*=[[:space:]]*(async[[:space:]]*)?\( ]] && \
           [[ "$line" =~ =\> ]]; then
            local name="${BASH_REMATCH[3]}"
            symbols+=("$(printf '{"name":"%s","kind":"function","line":%d}' \
                "$(json_escape "$name")" "$linenum")")
            continue
        fi
        
        # Const/let declarations (top-level constants)
        if [[ "$line" =~ ^(export[[:space:]]+)?(const)[[:space:]]+([A-Z][A-Z0-9_]*)[[:space:]]*= ]]; then
            local name="${BASH_REMATCH[3]}"
            symbols+=("$(printf '{"name":"%s","kind":"const","line":%d}' \
                "$(json_escape "$name")" "$linenum")")
            continue
        fi
        
    done < "$filepath"
    
    output_symbols_array "${symbols[@]}"
}

#===============================================================================
# Symbol Extraction - Go
#===============================================================================

extract_go_symbols() {
    local filepath="$1"
    local symbols=()
    local linenum=0
    
    while IFS= read -r line || [[ -n "$line" ]]; do
        ((linenum++))
        
        # Skip empty lines and comments
        [[ -z "$line" ]] && continue
        [[ "$line" =~ ^[[:space:]]*/[/*] ]] && continue
        
        # Function definitions
        if [[ "$line" =~ ^func[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*)[[:space:]]*\( ]]; then
            local name="${BASH_REMATCH[1]}"
            symbols+=("$(printf '{"name":"%s","kind":"function","line":%d}' \
                "$(json_escape "$name")" "$linenum")")
            continue
        fi
        
        # Method definitions (with receiver)
        if [[ "$line" =~ ^func[[:space:]]*\(.+\)[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*)[[:space:]]*\( ]]; then
            local name="${BASH_REMATCH[1]}"
            symbols+=("$(printf '{"name":"%s","kind":"method","line":%d}' \
                "$(json_escape "$name")" "$linenum")")
            continue
        fi
        
        # Type definitions (struct, interface, type alias)
        if [[ "$line" =~ ^type[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*)[[:space:]]+(struct|interface) ]]; then
            local name="${BASH_REMATCH[1]}"
            local kind="${BASH_REMATCH[2]}"
            symbols+=("$(printf '{"name":"%s","kind":"%s","line":%d}' \
                "$(json_escape "$name")" "$kind" "$linenum")")
            continue
        fi
        
        # Type alias
        if [[ "$line" =~ ^type[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*)[[:space:]]+ ]] && \
           [[ ! "$line" =~ struct ]] && [[ ! "$line" =~ interface ]]; then
            local name="${BASH_REMATCH[1]}"
            symbols+=("$(printf '{"name":"%s","kind":"type","line":%d}' \
                "$(json_escape "$name")" "$linenum")")
            continue
        fi
        
        # Const declarations
        if [[ "$line" =~ ^const[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*) ]]; then
            local name="${BASH_REMATCH[1]}"
            symbols+=("$(printf '{"name":"%s","kind":"const","line":%d}' \
                "$(json_escape "$name")" "$linenum")")
            continue
        fi
        
        # Var declarations (package level)
        if [[ "$line" =~ ^var[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*) ]]; then
            local name="${BASH_REMATCH[1]}"
            symbols+=("$(printf '{"name":"%s","kind":"var","line":%d}' \
                "$(json_escape "$name")" "$linenum")")
            continue
        fi
        
    done < "$filepath"
    
    output_symbols_array "${symbols[@]}"
}

#===============================================================================
# Symbol Extraction - Rust
#===============================================================================

extract_rust_symbols() {
    local filepath="$1"
    local symbols=()
    local linenum=0
    
    while IFS= read -r line || [[ -n "$line" ]]; do
        ((linenum++))
        
        # Skip empty lines and comments
        [[ -z "$line" ]] && continue
        [[ "$line" =~ ^[[:space:]]*/[/*] ]] && continue
        
        # Function definitions
        if [[ "$line" =~ (pub[[:space:]]+)?(async[[:space:]]+)?fn[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*) ]]; then
            local name="${BASH_REMATCH[3]}"
            # Determine if method or function based on context (simplified)
            symbols+=("$(printf '{"name":"%s","kind":"function","line":%d}' \
                "$(json_escape "$name")" "$linenum")")
            continue
        fi
        
        # Struct definitions
        if [[ "$line" =~ (pub[[:space:]]+)?struct[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*) ]]; then
            local name="${BASH_REMATCH[2]}"
            symbols+=("$(printf '{"name":"%s","kind":"struct","line":%d}' \
                "$(json_escape "$name")" "$linenum")")
            continue
        fi
        
        # Enum definitions
        if [[ "$line" =~ (pub[[:space:]]+)?enum[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*) ]]; then
            local name="${BASH_REMATCH[2]}"
            symbols+=("$(printf '{"name":"%s","kind":"enum","line":%d}' \
                "$(json_escape "$name")" "$linenum")")
            continue
        fi
        
        # Trait definitions
        if [[ "$line" =~ (pub[[:space:]]+)?trait[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*) ]]; then
            local name="${BASH_REMATCH[2]}"
            symbols+=("$(printf '{"name":"%s","kind":"trait","line":%d}' \
                "$(json_escape "$name")" "$linenum")")
            continue
        fi
        
        # Impl blocks
        if [[ "$line" =~ ^impl[[:space:]]+(\<[^>]+\>[[:space:]]+)?([a-zA-Z_][a-zA-Z0-9_]*) ]]; then
            local name="${BASH_REMATCH[2]}"
            symbols+=("$(printf '{"name":"%s","kind":"impl","line":%d}' \
                "$(json_escape "$name")" "$linenum")")
            continue
        fi
        
        # Const definitions
        if [[ "$line" =~ (pub[[:space:]]+)?const[[:space:]]+([A-Z][A-Z0-9_]*) ]]; then
            local name="${BASH_REMATCH[2]}"
            symbols+=("$(printf '{"name":"%s","kind":"const","line":%d}' \
                "$(json_escape "$name")" "$linenum")")
            continue
        fi
        
        # Static definitions
        if [[ "$line" =~ (pub[[:space:]]+)?static[[:space:]]+(mut[[:space:]]+)?([A-Z][A-Z0-9_]*) ]]; then
            local name="${BASH_REMATCH[3]}"
            symbols+=("$(printf '{"name":"%s","kind":"static","line":%d}' \
                "$(json_escape "$name")" "$linenum")")
            continue
        fi
        
        # Type alias
        if [[ "$line" =~ (pub[[:space:]]+)?type[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*) ]]; then
            local name="${BASH_REMATCH[2]}"
            symbols+=("$(printf '{"name":"%s","kind":"type","line":%d}' \
                "$(json_escape "$name")" "$linenum")")
            continue
        fi
        
        # Mod definitions
        if [[ "$line" =~ (pub[[:space:]]+)?mod[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*) ]]; then
            local name="${BASH_REMATCH[2]}"
            symbols+=("$(printf '{"name":"%s","kind":"module","line":%d}' \
                "$(json_escape "$name")" "$linenum")")
            continue
        fi
        
    done < "$filepath"
    
    output_symbols_array "${symbols[@]}"
}

#===============================================================================
# Symbol Extraction - C/C++
#===============================================================================

extract_c_symbols() {
    local filepath="$1"
    local symbols=()
    local linenum=0
    
    while IFS= read -r line || [[ -n "$line" ]]; do
        ((linenum++))
        
        # Skip empty lines and comments
        [[ -z "$line" ]] && continue
        [[ "$line" =~ ^[[:space:]]*/[/*] ]] && continue
        [[ "$line" =~ ^[[:space:]]*# ]] && continue  # preprocessor
        
        # Struct definitions
        if [[ "$line" =~ ^(typedef[[:space:]]+)?struct[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*) ]]; then
            local name="${BASH_REMATCH[2]}"
            symbols+=("$(printf '{"name":"%s","kind":"struct","line":%d}' \
                "$(json_escape "$name")" "$linenum")")
            continue
        fi
        
        # Class definitions (C++)
        if [[ "$line" =~ ^class[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*) ]]; then
            local name="${BASH_REMATCH[1]}"
            symbols+=("$(printf '{"name":"%s","kind":"class","line":%d}' \
                "$(json_escape "$name")" "$linenum")")
            continue
        fi
        
        # Enum definitions
        if [[ "$line" =~ ^(typedef[[:space:]]+)?enum[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*) ]]; then
            local name="${BASH_REMATCH[2]}"
            symbols+=("$(printf '{"name":"%s","kind":"enum","line":%d}' \
                "$(json_escape "$name")" "$linenum")")
            continue
        fi
        
        # Function definitions (simplified - looks for return_type function_name()
        if [[ "$line" =~ ^([a-zA-Z_][a-zA-Z0-9_*[:space:]]+)[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*)[[:space:]]*\( ]] && \
           [[ ! "$line" =~ ^(if|while|for|switch|return|sizeof)[[:space:]]*\( ]]; then
            local name="${BASH_REMATCH[2]}"
            # Skip common keywords that look like functions
            if [[ "$name" != "if" && "$name" != "while" && "$name" != "for" && \
                  "$name" != "switch" && "$name" != "return" && "$name" != "sizeof" ]]; then
                symbols+=("$(printf '{"name":"%s","kind":"function","line":%d}' \
                    "$(json_escape "$name")" "$linenum")")
            fi
            continue
        fi
        
        # #define macros
        if [[ "$line" =~ ^[[:space:]]*#define[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*) ]]; then
            local name="${BASH_REMATCH[1]}"
            symbols+=("$(printf '{"name":"%s","kind":"macro","line":%d}' \
                "$(json_escape "$name")" "$linenum")")
            continue
        fi
        
        # typedef
        if [[ "$line" =~ typedef.*[[:space:]]([a-zA-Z_][a-zA-Z0-9_]*)[[:space:]]*\; ]]; then
            local name="${BASH_REMATCH[1]}"
            symbols+=("$(printf '{"name":"%s","kind":"type","line":%d}' \
                "$(json_escape "$name")" "$linenum")")
            continue
        fi
        
    done < "$filepath"
    
    output_symbols_array "${symbols[@]}"
}

#===============================================================================
# Symbol Extraction - Java
#===============================================================================

extract_java_symbols() {
    local filepath="$1"
    local symbols=()
    local linenum=0
    
    while IFS= read -r line || [[ -n "$line" ]]; do
        ((linenum++))
        
        # Skip empty lines and comments
        [[ -z "$line" ]] && continue
        [[ "$line" =~ ^[[:space:]]*(/\*|//) ]] && continue
        
        # Class definitions
        if [[ "$line" =~ (public|private|protected)?[[:space:]]*(abstract|final)?[[:space:]]*class[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*) ]]; then
            local name="${BASH_REMATCH[3]}"
            symbols+=("$(printf '{"name":"%s","kind":"class","line":%d}' \
                "$(json_escape "$name")" "$linenum")")
            continue
        fi
        
        # Interface definitions
        if [[ "$line" =~ (public|private|protected)?[[:space:]]*interface[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*) ]]; then
            local name="${BASH_REMATCH[2]}"
            symbols+=("$(printf '{"name":"%s","kind":"interface","line":%d}' \
                "$(json_escape "$name")" "$linenum")")
            continue
        fi
        
        # Enum definitions
        if [[ "$line" =~ (public|private|protected)?[[:space:]]*enum[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*) ]]; then
            local name="${BASH_REMATCH[2]}"
            symbols+=("$(printf '{"name":"%s","kind":"enum","line":%d}' \
                "$(json_escape "$name")" "$linenum")")
            continue
        fi
        
        # Method definitions
        if [[ "$line" =~ (public|private|protected)?[[:space:]]*(static)?[[:space:]]*(final)?[[:space:]]*[a-zA-Z_<>[\],[:space:]]+[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*)[[:space:]]*\( ]] && \
           [[ ! "$line" =~ ^[[:space:]]*(if|while|for|switch|return|new)[[:space:]]*\( ]]; then
            local name="${BASH_REMATCH[4]}"
            if [[ "$name" != "if" && "$name" != "while" && "$name" != "for" && \
                  "$name" != "switch" && "$name" != "return" && "$name" != "new" && \
                  "$name" != "class" && "$name" != "interface" ]]; then
                symbols+=("$(printf '{"name":"%s","kind":"method","line":%d}' \
                    "$(json_escape "$name")" "$linenum")")
            fi
            continue
        fi
        
    done < "$filepath"
    
    output_symbols_array "${symbols[@]}"
}

#===============================================================================
# Symbol Extraction - Ruby
#===============================================================================

extract_ruby_symbols() {
    local filepath="$1"
    local symbols=()
    local linenum=0
    
    while IFS= read -r line || [[ -n "$line" ]]; do
        ((linenum++))
        
        # Skip empty lines and comments
        [[ -z "$line" ]] && continue
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        
        # Class definitions
        if [[ "$line" =~ ^[[:space:]]*class[[:space:]]+([A-Z][a-zA-Z0-9_]*) ]]; then
            local name="${BASH_REMATCH[1]}"
            symbols+=("$(printf '{"name":"%s","kind":"class","line":%d}' \
                "$(json_escape "$name")" "$linenum")")
            continue
        fi
        
        # Module definitions
        if [[ "$line" =~ ^[[:space:]]*module[[:space:]]+([A-Z][a-zA-Z0-9_]*) ]]; then
            local name="${BASH_REMATCH[1]}"
            symbols+=("$(printf '{"name":"%s","kind":"module","line":%d}' \
                "$(json_escape "$name")" "$linenum")")
            continue
        fi
        
        # Method definitions
        if [[ "$line" =~ ^[[:space:]]*def[[:space:]]+([a-zA-Z_][a-zA-Z0-9_?!]*) ]]; then
            local name="${BASH_REMATCH[1]}"
            symbols+=("$(printf '{"name":"%s","kind":"method","line":%d}' \
                "$(json_escape "$name")" "$linenum")")
            continue
        fi
        
        # Constants
        if [[ "$line" =~ ^[[:space:]]*([A-Z][A-Z0-9_]*)[[:space:]]*= ]]; then
            local name="${BASH_REMATCH[1]}"
            symbols+=("$(printf '{"name":"%s","kind":"const","line":%d}' \
                "$(json_escape "$name")" "$linenum")")
            continue
        fi
        
    done < "$filepath"
    
    output_symbols_array "${symbols[@]}"
}

#===============================================================================
# Symbol Extraction - Shell
#===============================================================================

extract_shell_symbols() {
    local filepath="$1"
    local symbols=()
    local linenum=0
    
    while IFS= read -r line || [[ -n "$line" ]]; do
        ((linenum++))
        
        # Skip empty lines and comments
        [[ -z "$line" ]] && continue
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        
        # Function definitions (both syntaxes)
        if [[ "$line" =~ ^[[:space:]]*function[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*) ]] || \
           [[ "$line" =~ ^[[:space:]]*([a-zA-Z_][a-zA-Z0-9_]*)[[:space:]]*\(\)[[:space:]]* ]]; then
            local name="${BASH_REMATCH[1]}"
            symbols+=("$(printf '{"name":"%s","kind":"function","line":%d}' \
                "$(json_escape "$name")" "$linenum")")
            continue
        fi
        
        # Exported variables
        if [[ "$line" =~ ^[[:space:]]*export[[:space:]]+([A-Z][A-Z0-9_]*)= ]]; then
            local name="${BASH_REMATCH[1]}"
            symbols+=("$(printf '{"name":"%s","kind":"var","line":%d}' \
                "$(json_escape "$name")" "$linenum")")
            continue
        fi
        
    done < "$filepath"
    
    output_symbols_array "${symbols[@]}"
}

#===============================================================================
# Generic Fallback Extraction
#===============================================================================

extract_generic_symbols() {
    local filepath="$1"
    local symbols=()
    local linenum=0
    
    while IFS= read -r line || [[ -n "$line" ]]; do
        ((linenum++))
        
        # Look for common patterns
        # function-like: something(
        # class-like: class Something
        # def-like: def something
        
        if [[ "$line" =~ ^[[:space:]]*(class|struct|interface|trait|enum)[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*) ]]; then
            local kind="${BASH_REMATCH[1]}"
            local name="${BASH_REMATCH[2]}"
            symbols+=("$(printf '{"name":"%s","kind":"%s","line":%d}' \
                "$(json_escape "$name")" "$kind" "$linenum")")
            continue
        fi
        
        if [[ "$line" =~ ^[[:space:]]*(def|fn|func|function)[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*) ]]; then
            local name="${BASH_REMATCH[2]}"
            symbols+=("$(printf '{"name":"%s","kind":"function","line":%d}' \
                "$(json_escape "$name")" "$linenum")")
            continue
        fi
        
    done < "$filepath"
    
    output_symbols_array "${symbols[@]}"
}

#===============================================================================
# Helper Functions
#===============================================================================

# Output symbols as deterministically sorted JSON array
output_symbols_array() {
    local symbols=("$@")
    
    # Sort symbols by line number (deterministic ordering)
    if [[ ${#symbols[@]} -gt 0 ]]; then
        printf '%s\n' "${symbols[@]}" | LC_ALL=C sort -t':' -k1 | \
        {
            printf '['
            local first=1
            while IFS= read -r sym; do
                [[ $first -eq 0 ]] && printf ','
                printf '%s' "$sym"
                first=0
            done
            printf ']'
        }
    else
        printf '[]'
    fi
}

#===============================================================================
# Main Logic
#===============================================================================

extract_symbols() {
    local filepath="$1"
    
    # Resolve and validate path
    local abs_path
    abs_path=$(realpath_safe "$filepath") || return $?
    
    # Check file exists
    if [[ ! -f "$abs_path" ]]; then
        json_err "file not found: $filepath" 1 || return 1
    fi
    
    # Get relative path for output
    local relpath="$filepath"
    if [[ "$abs_path" == "$ProjectPulse_Root/"* ]]; then
        relpath="${abs_path#"$ProjectPulse_Root/"}"
    fi
    
    # Detect language
    local lang
    lang=$(get_language "$filepath")
    
    # Extract symbols based on language
    local symbols_json
    case "$lang" in
        python)
            symbols_json=$(extract_python_symbols "$abs_path")
            ;;
        javascript|typescript)
            symbols_json=$(extract_js_symbols "$abs_path")
            ;;
        go)
            symbols_json=$(extract_go_symbols "$abs_path")
            ;;
        rust)
            symbols_json=$(extract_rust_symbols "$abs_path")
            ;;
        c|cpp)
            symbols_json=$(extract_c_symbols "$abs_path")
            ;;
        java)
            symbols_json=$(extract_java_symbols "$abs_path")
            ;;
        ruby)
            symbols_json=$(extract_ruby_symbols "$abs_path")
            ;;
        shell)
            symbols_json=$(extract_shell_symbols "$abs_path")
            ;;
        *)
            symbols_json=$(extract_generic_symbols "$abs_path")
            ;;
    esac
    
    # Count symbols
    local count
    count=$(printf '%s' "$symbols_json" | grep -o '"name"' | wc -l || echo 0)
    
    # Build result object
    local result_json
    result_json=$(printf '{"file":"%s","language":"%s","symbols":%s,"count":%d}' \
        "$(json_escape "$relpath")" \
        "$lang" \
        "$symbols_json" \
        "$count")
    
    if [[ $JSON_OUTPUT -eq 1 ]]; then
        json_ok "$result_json"
    else
        printf 'File: %s\n' "$relpath"
        printf 'Language: %s\n' "$lang"
        printf 'Symbols: %d\n\n' "$count"
        
        # Pretty print symbols (simple extraction)
        printf '%s' "$symbols_json" | tr '{},' '\n' | while IFS= read -r field; do
            if [[ "$field" == *'"name"'* ]]; then
                local name_val
                name_val=$(printf '%s' "$field" | sed 's/.*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
                printf '  %s' "$name_val"
            elif [[ "$field" == *'"kind"'* ]]; then
                local kind_val
                kind_val=$(printf '%s' "$field" | sed 's/.*"kind"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
                printf ' (%s)' "$kind_val"
            elif [[ "$field" == *'"line"'* ]]; then
                local line_val
                line_val=$(printf '%s' "$field" | sed 's/.*"line"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/')
                printf ' at line %s\n' "$line_val"
            fi
        done
    fi
}

#===============================================================================
# Main Entry Point
#===============================================================================

main() {
    parse_args "$@" || return $?
    extract_symbols "$FILE_PATH"
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
