#!/usr/bin/env bash
# ProjectPulse Context Sampler v3.1 - Intelligent file sampling for LLM context
# Scores files by importance, extracts relevant content
#
# CHANGELOG v3.0 -> v3.1:
# - Fixed all grep pipeline failures with || true (set -e compatibility)
# - Added file type caching to avoid repeated file calls
# - Added stable tie-break sorting (score desc, mtime desc, path asc)
# - Added more language extraction patterns (c/cpp, rb, php, sh)
# - Improved content extraction robustness

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/core.sh"

#=============================================================================
# Configuration
#=============================================================================

MAX_FILES=$(get_config_value '.context.max_files' '20')
MAX_BYTES=$(get_config_value '.context.max_bytes' '65536')
MAX_LINES=$(get_config_value '.context.max_lines' '500')
FOCUS_MODE=$(get_config_value '.context.focus' 'auto')
MAX_FILE_SIZE=524288  # 512KB per file limit

# File type cache to avoid repeated 'file' command calls
declare -A FILE_TYPE_CACHE=()

#=============================================================================
# File Type Detection (with caching)
#=============================================================================

get_file_type() {
    local file="$1"
    
    # Check cache first
    if [[ -n "${FILE_TYPE_CACHE[$file]:-}" ]]; then
        echo "${FILE_TYPE_CACHE[$file]}"
        return
    fi
    
    local ext="${file##*.}"
    local basename
    basename=$(basename "$file")
    local result=""
    
    # Config files
    case "$basename" in
        *.json|*.yaml|*.yml|*.toml|*.ini|*.conf|*.cfg|.env*|*.env)
            result="config" ;;
        Dockerfile*|docker-compose*|Makefile|CMakeLists.txt|Vagrantfile|Justfile)
            result="config" ;;
    esac
    
    # Documentation
    if [[ -z "$result" ]]; then
        case "$basename" in
            README*|CHANGELOG*|LICENSE*|CONTRIBUTING*|AUTHORS*|HISTORY*)
                result="docs" ;;
        esac
    fi
    
    if [[ -z "$result" ]]; then
        case "$ext" in
            md|rst|txt|adoc)
                result="docs" ;;
        esac
    fi
    
    # Code files
    if [[ -z "$result" ]]; then
        case "$ext" in
            py|js|ts|jsx|tsx|go|rs|java|kt|scala|c|cpp|h|hpp|cs|rb|php|swift|m|mm)
                result="code" ;;
            sh|bash|zsh|fish|ps1|bat|cmd)
                result="code" ;;
            sql|graphql|proto|prisma)
                result="code" ;;
        esac
    fi
    
    [[ -z "$result" ]] && result="other"
    
    # Cache the result
    FILE_TYPE_CACHE[$file]="$result"
    echo "$result"
}

#=============================================================================
# Smart Content Extraction
#=============================================================================

extract_file_content() {
    local file="$1"
    local max_lines="${2:-$MAX_LINES}"
    local ext="${file##*.}"
    
    # Check size
    local size
    size=$(file_size "$file")
    [[ $size -gt $MAX_FILE_SIZE ]] && {
        echo "[FILE TOO LARGE: $(( size / 1024 ))KB]"
        return
    }
    
    # Check binary
    is_binary "$file" && {
        echo "[BINARY FILE]"
        return
    }
    
    # Smart extraction based on file type
    # CRITICAL FIX: All grep pipelines use || true to prevent exit under set -e
    case "$ext" in
        py)
            # Extract imports, class/function defs, docstrings
            head -n "$max_lines" "$file" 2>/dev/null | \
                grep -E '^(import |from |class |def |"""|\s+"""|\s*#.*TODO|\s*#.*FIXME|@)' 2>/dev/null | \
                head -n 50 || true
            ;;
        js|ts|jsx|tsx)
            # Extract imports, exports, function/class defs
            head -n "$max_lines" "$file" 2>/dev/null | \
                grep -E '^(import |export |const |let |var |function |class |interface |type |/\*\*|//|module\.exports|async )' 2>/dev/null | \
                head -n 50 || true
            ;;
        go)
            # Extract package, imports, type/func defs
            head -n "$max_lines" "$file" 2>/dev/null | \
                grep -E '^(package |import |type |func |var |const |//)' 2>/dev/null | \
                head -n 50 || true
            ;;
        rs)
            # Extract use, mod, fn, struct, impl
            head -n "$max_lines" "$file" 2>/dev/null | \
                grep -E '^(use |mod |pub |fn |struct |impl |enum |trait |type |const |static |//)' 2>/dev/null | \
                head -n 50 || true
            ;;
        java|kt|scala)
            # Extract package, import, class/interface defs
            head -n "$max_lines" "$file" 2>/dev/null | \
                grep -E '^(package |import |public |private |protected |class |interface |abstract |@|//)' 2>/dev/null | \
                head -n 50 || true
            ;;
        c|cpp|h|hpp|cc|cxx)
            # Extract includes, defines, function/class defs
            head -n "$max_lines" "$file" 2>/dev/null | \
                grep -E '^(#include|#define|#pragma|class |struct |typedef |enum |namespace |void |int |char |bool |auto |template|//)' 2>/dev/null | \
                head -n 50 || true
            ;;
        rb)
            # Extract requires, modules, classes, methods
            head -n "$max_lines" "$file" 2>/dev/null | \
                grep -E '^(require|include|module |class |def |attr_|private|protected|public|#)' 2>/dev/null | \
                head -n 50 || true
            ;;
        php)
            # Extract use, namespace, class/function defs
            head -n "$max_lines" "$file" 2>/dev/null | \
                grep -E '^(<\?php|namespace |use |class |interface |trait |function |public |private |protected |//)' 2>/dev/null | \
                head -n 50 || true
            ;;
        sh|bash|zsh)
            # Extract shebang, functions, important variables
            head -n "$max_lines" "$file" 2>/dev/null | \
                grep -E '^(#!/|#.*|[A-Z_]+=|function |[a-z_]+\(\)|source |export |alias )' 2>/dev/null | \
                head -n 50 || true
            ;;
        *)
            # Default: head of file
            head -n "$max_lines" "$file" 2>/dev/null || true
            ;;
    esac
}

#=============================================================================
# File Discovery
#=============================================================================

discover_files() {
    local Root="$1"
    local focus="$2"
    
    # Build find command with exclusions
    local find_args=()
    find_args+=("$Root")
    find_args+=(-maxdepth 6)
    
    # Add exclusions
    for d in "${IGNORE_DIRS[@]}"; do
        find_args+=(-path "*/$d" -prune -o)
    done
    
    find_args+=(-type f)
    
    # Focus mode filtering
    case "$focus" in
        code)
            find_args+=(\( -name "*.py" -o -name "*.js" -o -name "*.ts" -o -name "*.go" \
                         -o -name "*.rs" -o -name "*.java" -o -name "*.c" -o -name "*.cpp" \
                         -o -name "*.rb" -o -name "*.php" -o -name "*.sh" -o -name "*.jsx" \
                         -o -name "*.tsx" -o -name "*.kt" -o -name "*.scala" -o -name "*.swift" \))
            ;;
        docs)
            find_args+=(\( -name "*.md" -o -name "*.rst" -o -name "*.txt" \
                         -o -name "README*" -o -name "CHANGELOG*" -o -name "LICENSE*" \
                         -o -name "*.adoc" -o -name "CONTRIBUTING*" \))
            ;;
        config)
            find_args+=(\( -name "*.json" -o -name "*.yaml" -o -name "*.yml" \
                         -o -name "*.toml" -o -name "*.ini" -o -name "*.env*" \
                         -o -name "Makefile" -o -name "Dockerfile*" -o -name "*.conf" \))
            ;;
        recent)
            find_args+=(-mtime -1)  # Last 24h
            ;;
    esac
    
    find_args+=(-print)
    
    find "${find_args[@]}" 2>/dev/null | head -500 || true
}

#=============================================================================
# Main Sampling Logic
#=============================================================================

sample_context() {
    local Root="${1:-$(find_project_Root)}"
    local focus="${2:-$FOCUS_MODE}"
    local max_files="${3:-$MAX_FILES}"
    local json_output="${4:-false}"
    
    [[ ! -d "$Root" ]] && _die "Invalid project Root: $Root"
    
    # Clear file type cache for this run
    FILE_TYPE_CACHE=()
    
    # Discover and score files
    local -a scored_files=()
    
    while IFS= read -r file; do
        [[ -z "$file" ]] && continue
        [[ ! -f "$file" ]] && continue
        
        # Skip binary files
        is_binary "$file" && continue
        
        # Skip large files
        local size
        size=$(file_size "$file")
        [[ $size -gt $MAX_FILE_SIZE ]] && continue
        
        # Calculate score
        local score
        score=$(file_importance_score "$file" "$Root")
        
        # Get mtime for tie-breaking
        local mtime
        mtime=$(file_mtime "$file")
        
        # Format: score:mtime:file (allows stable sorting)
        scored_files+=("$score:$mtime:$file")
    done < <(discover_files "$Root" "$focus")
    
    # Sort by score descending, then mtime descending, then path ascending for determinism
    # This ensures stable output across runs
    local -a sorted_files=()
    while IFS= read -r entry; do
        # Extract file path (third colon-separated field and beyond)
        local file="${entry#*:}"
        file="${file#*:}"
        sorted_files+=("$file")
    done < <(printf '%s\n' "${scored_files[@]}" | sort -t: -k1,1rn -k2,2rn -k3 | head -n "$max_files")
    
    # Output
    local total_bytes=0
    local file_count=0
    
    if [[ "$json_output" == "true" ]]; then
        echo "{"
        echo "  \"version\": \"$ProjectPulse_VERSION\","
        echo "  \"Root\": \"$(json_escape "$Root")\","
        echo "  \"focus\": \"$focus\","
        echo "  \"generated_at\": \"$(date -Iseconds)\","
        echo "  \"files\": ["
    else
        echo "=== Context Sample ==="
        echo "Root: $Root"
        echo "Focus: $focus"
        echo ""
    fi
    
    local first=true
    for file in "${sorted_files[@]}"; do
        local size
        size=$(file_size "$file")
        
        # Check byte limit
        if [[ $((total_bytes + size)) -gt $MAX_BYTES ]]; then
            break
        fi
        
        local relpath="${file#$Root/}"
        local filetype
        filetype=$(get_file_type "$file")
        
        if [[ "$json_output" == "true" ]]; then
            $first || echo ","
            first=false
            echo "    {"
            echo "      \"path\": \"$(json_escape "$relpath")\","
            echo "      \"type\": \"$filetype\","
            echo "      \"size\": $size,"
            local content
            content=$(extract_file_content "$file" 100 | head -c 8192) || content=""
            echo "      \"content\": \"$(json_escape "$content")\""
            echo -n "    }"
        else
            echo "--- $relpath ($filetype, ${size}B) ---"
            extract_file_content "$file" 100 || true
            echo ""
        fi
        
        ((total_bytes += size))
        ((++file_count))  # Fixed: was ((file_count++))
    done
    
    if [[ "$json_output" == "true" ]]; then
        echo ""
        echo "  ],"
        echo "  \"total_files\": $file_count,"
        echo "  \"total_bytes\": $total_bytes"
        echo "}"
    else
        echo "=== Summary: $file_count files, $total_bytes bytes ==="
    fi
}

#=============================================================================
# CLI
#=============================================================================

usage() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS] [Root]

Sample project context for LLM injection.

Options:
  -f, --focus MODE    Focus mode: auto, code, docs, config, recent
  -n, --max-files N   Maximum files to sample (default: $MAX_FILES)
  -b, --max-bytes N   Maximum total bytes (default: $MAX_BYTES)
  -j, --json          Output as JSON
  -h, --help          Show this help

Focus Modes:
  auto    - All file types, scored by importance
  code    - Source code files only
  docs    - Documentation files only
  config  - Configuration files only
  recent  - Recently modified files (24h)

Examples:
  $(basename "$0")                    # Auto mode sampling
  $(basename "$0") -f code -n 30      # Code files, max 30
  $(basename "$0") -j                 # JSON output for integration
EOF
}

main() {
    local Root=""
    local focus="$FOCUS_MODE"
    local max_files="$MAX_FILES"
    local json_output="false"
    
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -f|--focus)
                focus="$2"; shift 2 ;;
            -n|--max-files)
                max_files="$2"; shift 2 ;;
            -b|--max-bytes)
                MAX_BYTES="$2"; shift 2 ;;
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
    
    sample_context "$Root" "$focus" "$max_files" "$json_output"
}

main "$@"
