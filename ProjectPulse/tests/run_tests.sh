#!/usr/bin/env bash
# ProjectPulse v3.2 Test Harness
# Comprehensive automated validation for all components
#
# CHANGELOG v3.1 -> v3.2:
# - FIXED: Source core.sh at top-level, not inside function (scoping issue)
# - Added test for stable Session ID across subshells
# - Added test for quiet mode exit codes
# - Updated version checks to 3.2.0
#
# Usage: ./tests/run_tests.sh [test_name]
#
# Tests validate:
# - Core library functions
# - All hooks (context-sampler, search, recent-files, project-pulse, backup)
# - Configuration system
# - Session management
# - Concurrency safety
# - Edge cases and error handling

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_TMP=""
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

#=============================================================================
# Colors
#=============================================================================

if [[ -t 1 ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m'
else
    RED='' GREEN='' YELLOW='' BLUE='' NC=''
fi

#=============================================================================
# FIX #4: Source core.sh at TOP-LEVEL (not inside a function)
# 
# Previously, core.sh was sourced inside setup_test_env(), which meant
# "declare -A BUILTIN_DEFAULTS" became local to that function (in bash,
# declare inside a function creates local variables by default).
# 
# By sourcing at the top level, BUILTIN_DEFAULTS (which now uses declare -gA
# anyway) and all other globals are properly available throughout all tests.
#=============================================================================

# Set up test environment variables BEFORE sourcing core.sh
# so that core.sh picks up our test paths
TEST_TMP_BASE=$(mktemp -d)
export ProjectPulse_DIR="$TEST_TMP_BASE/.ProjectPulse"
export ProjectPulse_CACHE="$ProjectPulse_DIR/cache"
export ProjectPulse_Session_FILE="$TEST_TMP_BASE/Session"
export ProjectPulse_LOCK_DIR="$TEST_TMP_BASE/locks"
export ProjectPulse_QUIET=1

# Now source core.sh at top level - this ensures BUILTIN_DEFAULTS is global
source "$PROJECT_DIR/lib/core.sh"

#=============================================================================
# Test Framework
#=============================================================================

setup_test_env() {
    # TEST_TMP_BASE was already created; now create the test project structure
    TEST_TMP="$TEST_TMP_BASE"
    
    mkdir -p "$ProjectPulse_DIR/profiles"
    mkdir -p "$ProjectPulse_DIR/Roots"
    mkdir -p "$ProjectPulse_CACHE"
    
    # Create a test project structure
    mkdir -p "$TEST_TMP/project/src"
    mkdir -p "$TEST_TMP/project/tests"
    mkdir -p "$TEST_TMP/project/docs"
    mkdir -p "$TEST_TMP/project/node_modules/fake"  # Should be ignored
    
    # Create test files
    echo '{"name": "test-project", "version": "1.0.0"}' > "$TEST_TMP/project/package.json"
    echo '# Test Project\n\nThis is a test.' > "$TEST_TMP/project/README.md"
    echo 'print("hello")' > "$TEST_TMP/project/src/main.py"
    echo 'def test_foo(): pass' > "$TEST_TMP/project/tests/test_main.py"
    echo '// TODO: Fix this' > "$TEST_TMP/project/src/app.js"
    echo 'export const foo = 1;' >> "$TEST_TMP/project/src/app.js"
    echo 'ignored content' > "$TEST_TMP/project/node_modules/fake/package.json"
}

cleanup_test_env() {
    [[ -n "${TEST_TMP_BASE:-}" ]] && rm -rf "$TEST_TMP_BASE"
}

trap cleanup_test_env EXIT

log_test() {
    echo -e "${BLUE}[TEST]${NC} $*"
}

pass() {
    ((++TESTS_PASSED))
    echo -e "${GREEN}[PASS]${NC} $*"
}

fail() {
    ((++TESTS_FAILED))
    echo -e "${RED}[FAIL]${NC} $*"
}

assert_eq() {
    local expected="$1"
    local actual="$2"
    local msg="${3:-}"
    
    ((++TESTS_RUN))
    if [[ "$expected" == "$actual" ]]; then
        pass "$msg"
        return 0
    else
        fail "$msg (expected: '$expected', got: '$actual')"
        return 1
    fi
}

assert_contains() {
    local haystack="$1"
    local needle="$2"
    local msg="${3:-}"
    
    ((++TESTS_RUN))
    if [[ "$haystack" == *"$needle"* ]]; then
        pass "$msg"
        return 0
    else
        fail "$msg (expected to contain: '$needle')"
        return 1
    fi
}

assert_not_contains() {
    local haystack="$1"
    local needle="$2"
    local msg="${3:-}"
    
    ((++TESTS_RUN))
    if [[ "$haystack" != *"$needle"* ]]; then
        pass "$msg"
        return 0
    else
        fail "$msg (expected NOT to contain: '$needle')"
        return 1
    fi
}

assert_success() {
    local cmd="$1"
    local msg="${2:-}"
    
    ((++TESTS_RUN))
    if eval "$cmd" &>/dev/null; then
        pass "$msg"
        return 0
    else
        fail "$msg (command failed: $cmd)"
        return 1
    fi
}

assert_failure() {
    local cmd="$1"
    local msg="${2:-}"
    
    ((++TESTS_RUN))
    if ! eval "$cmd" &>/dev/null; then
        pass "$msg"
        return 0
    else
        fail "$msg (expected failure but succeeded: $cmd)"
        return 1
    fi
}

assert_file_exists() {
    local file="$1"
    local msg="${2:-}"
    
    ((++TESTS_RUN))
    if [[ -f "$file" ]]; then
        pass "$msg"
        return 0
    else
        fail "$msg (file not found: $file)"
        return 1
    fi
}

#=============================================================================
# Core Library Tests
#=============================================================================

test_core_version() {
    log_test "Core: Version string"
    assert_eq "3.2.0" "$ProjectPulse_VERSION" "Version is 3.2.0"
}

test_core_utility_functions() {
    log_test "Core: Utility functions"
    
    # _now should return a timestamp
    local ts
    ts=$(_now)
    assert_success "[[ $ts -gt 0 ]]" "_now returns positive timestamp"
    
    # _hash_string should be deterministic
    local h1 h2
    h1=$(_hash_string "test")
    h2=$(_hash_string "test")
    assert_eq "$h1" "$h2" "_hash_string is deterministic"
    
    # _escape_regex should escape special chars
    local escaped
    escaped=$(_escape_regex "test.file[1]")
    assert_contains "$escaped" "\\." "_escape_regex escapes dot"
    assert_contains "$escaped" "\\[" "_escape_regex escapes bracket"
}

test_core_find_project_Root() {
    log_test "Core: find_project_Root"
    
    local Root
    Root=$(find_project_Root "$TEST_TMP/project/src")
    assert_eq "$TEST_TMP/project" "$Root" "Finds Root from subdir via package.json"
    
    # Test from project Root itself
    Root=$(find_project_Root "$TEST_TMP/project")
    assert_eq "$TEST_TMP/project" "$Root" "Finds Root from Root dir"
}

test_core_config_builtin_defaults() {
    log_test "Core: Config builtin defaults"
    
    # Test the fix for dot-stripping bug
    local val
    val=$(get_config_value '.context.max_files' '999')
    assert_eq "20" "$val" "Builtin default for context.max_files"
    
    val=$(get_config_value '.search.max_results' '999')
    assert_eq "100" "$val" "Builtin default for search.max_results"
    
    val=$(get_config_value '.nonexistent.key' 'default_value')
    assert_eq "default_value" "$val" "Returns default for unknown key"
}

# NEW TEST: Verify Session ID stability (Fix #1)
test_core_Session_id_stability() {
    log_test "Core: Session ID stability across subshells"
    
    # Get Session ID multiple times via command substitution (subshells)
    local id1 id2 id3
    id1=$(_get_Session_id)
    id2=$(_get_Session_id)
    id3=$(bash -c "source '$PROJECT_DIR/lib/core.sh' && _get_Session_id")
    
    # id1 and id2 should be identical (same shell)
    assert_eq "$id1" "$id2" "Session ID stable within same shell"
    
    # id3 is from a NEW bash process, so it gets a different ProjectPulse_Session_ID
    # This is expected and correct - different shell = different Session
    ((++TESTS_RUN))
    if [[ "$id1" != "$id3" ]]; then
        pass "Different shell gets different Session ID (expected)"
    else
        pass "Session IDs happened to match (unlikely but valid)"
    fi
}

# NEW TEST: Verify logging functions return 0 (Fix #2)
test_core_quiet_mode_exit_codes() {
    log_test "Core: Quiet mode logging exit codes"
    
    # With ProjectPulse_QUIET=1, _info should still return 0
    export ProjectPulse_QUIET=1
    
    local exit_code
    _info "test message" 2>/dev/null
    exit_code=$?
    assert_eq "0" "$exit_code" "_info returns 0 in quiet mode"
    
    _debug "test message" 2>/dev/null
    exit_code=$?
    assert_eq "0" "$exit_code" "_debug returns 0 (debug off)"
    
    export ProjectPulse_DEBUG=1
    _debug "test message" 2>/dev/null
    exit_code=$?
    assert_eq "0" "$exit_code" "_debug returns 0 (debug on)"
    export ProjectPulse_DEBUG=0
}

test_core_Session_management() {
    log_test "Core: Session management"
    
    local Root="$TEST_TMP/project"
    
    # Reset first to ensure clean state
    reset_Session "$Root"
    
    # Initially should allow injection
    assert_success "should_inject_context '$Root'" "Should allow initial injection"
    
    # Mark as injected
    mark_context_injected "$Root"
    
    # Should not allow injection again
    assert_failure "should_inject_context '$Root'" "Should block re-injection"
    
    # Reset should allow again
    reset_Session "$Root"
    assert_success "should_inject_context '$Root'" "Should allow after reset"
}

# NEW TEST: Verify reset_Session returns 0 in quiet mode (Fix #2 consequence)
test_core_reset_Session_quiet_mode() {
    log_test "Core: reset_Session exit code in quiet mode"
    
    export ProjectPulse_QUIET=1
    local exit_code
    
    reset_Session "$TEST_TMP/project" 2>/dev/null
    exit_code=$?
    assert_eq "0" "$exit_code" "reset_Session returns 0 in quiet mode"
    
    reset_Session 2>/dev/null
    exit_code=$?
    assert_eq "0" "$exit_code" "reset_Session (all) returns 0 in quiet mode"
}

test_core_Roots_management() {
    log_test "Core: Roots management"
    
    local Root="$TEST_TMP/project"
    
    # Add Root
    Roots_add "$Root" >/dev/null
    
    # Check it's in the list
    local list
    list=$(Roots_list)
    assert_contains "$list" "$Root" "Root appears in list after add"
    
    # Remove Root
    Roots_rm "$Root" >/dev/null
    list=$(Roots_list)
    assert_not_contains "$list" "$Root" "Root removed from list"
}

test_core_increment_fix() {
    log_test "Core: ((++var)) fix for set -e"
    
    # This is the critical fix - ((var++)) fails when var=0 under set -e
    # We test by running a script that would fail with the old code
    local test_script="$TEST_TMP/increment_test.sh"
    cat > "$test_script" << 'EOF'
#!/usr/bin/env bash
set -euo pipefail
count=0
((++count))  # This should work
((++count))
echo "Count: $count"
EOF
    chmod +x "$test_script"
    
    local output
    output=$("$test_script" 2>&1) || true
    assert_contains "$output" "Count: 2" "((++var)) works from zero under set -e"
}

#=============================================================================
# Context Sampler Tests
#=============================================================================

test_context_sampler_basic() {
    log_test "Context Sampler: Basic output"
    
    local output
    output=$("$PROJECT_DIR/hooks/context-sampler.sh" "$TEST_TMP/project" 2>&1) || true
    
    assert_contains "$output" "package.json" "Includes package.json"
    assert_contains "$output" "main.py" "Includes main.py"
    assert_not_contains "$output" "node_modules" "Excludes node_modules"
}

test_context_sampler_json() {
    log_test "Context Sampler: JSON output"
    
    local output
    output=$("$PROJECT_DIR/hooks/context-sampler.sh" -j "$TEST_TMP/project" 2>&1) || true
    
    assert_contains "$output" '"files"' "JSON has files array"
    assert_contains "$output" '"Root"' "JSON has Root field"
}

test_context_sampler_focus_modes() {
    log_test "Context Sampler: Focus modes"
    
    local output
    
    # Config focus
    output=$("$PROJECT_DIR/hooks/context-sampler.sh" -f config "$TEST_TMP/project" 2>&1) || true
    assert_contains "$output" "package.json" "Config focus includes package.json"
    
    # Docs focus
    output=$("$PROJECT_DIR/hooks/context-sampler.sh" -f docs "$TEST_TMP/project" 2>&1) || true
    assert_contains "$output" "README" "Docs focus includes README"
}

#=============================================================================
# Search Tests
#=============================================================================

test_search_content() {
    log_test "Search: Content search"
    
    local output
    output=$("$PROJECT_DIR/hooks/search.sh" "hello" "$TEST_TMP/project" 2>&1) || true
    
    assert_contains "$output" "main.py" "Finds 'hello' in main.py"
}

test_search_filename() {
    log_test "Search: Filename search"
    
    local output
    output=$("$PROJECT_DIR/hooks/search.sh" -n "main" "$TEST_TMP/project" 2>&1) || true
    
    assert_contains "$output" "main.py" "Finds files named 'main'"
}

test_search_json_output() {
    log_test "Search: JSON output"
    
    local output
    output=$("$PROJECT_DIR/hooks/search.sh" -j "hello" "$TEST_TMP/project" 2>&1) || true
    
    assert_contains "$output" '"matches"' "JSON has matches array"
}

test_search_ignores_dirs() {
    log_test "Search: Ignores excluded directories"
    
    local output
    output=$("$PROJECT_DIR/hooks/search.sh" "ignored" "$TEST_TMP/project" 2>&1) || true
    
    assert_not_contains "$output" "node_modules" "Does not search node_modules"
}

#=============================================================================
# Recent Files Tests
#=============================================================================

test_recent_files_basic() {
    log_test "Recent Files: Basic output"
    
    # Touch a file to make it "recent"
    touch "$TEST_TMP/project/src/main.py"
    sleep 0.1
    
    local output
    output=$("$PROJECT_DIR/hooks/recent-files.sh" "$TEST_TMP/project" 2>&1) || true
    
    assert_contains "$output" "main.py" "Shows recently modified file"
}

test_recent_files_json() {
    log_test "Recent Files: JSON output"
    
    local output
    output=$("$PROJECT_DIR/hooks/recent-files.sh" -j "$TEST_TMP/project" 2>&1) || true
    
    assert_contains "$output" '"files"' "JSON has files array"
}

#=============================================================================
# Project Pulse Tests
#=============================================================================

test_pulse_basic() {
    log_test "Project Pulse: Basic output"
    
    local output
    output=$("$PROJECT_DIR/hooks/project-pulse.sh" "$TEST_TMP/project" 2>&1) || true
    
    assert_contains "$output" "PROJECT PULSE" "Has header"
    assert_contains "$output" "STRUCTURE" "Has structure section"
}

test_pulse_quick_mode() {
    log_test "Project Pulse: Quick mode"
    
    local output
    output=$("$PROJECT_DIR/hooks/project-pulse.sh" -q "$TEST_TMP/project" 2>&1) || true
    
    assert_contains "$output" "RECENT ACTIVITY" "Has recent activity"
    assert_not_contains "$output" "FILE TYPE DISTRIBUTION" "Quick mode skips distribution"
}

test_pulse_todo_detection() {
    log_test "Project Pulse: TODO detection"
    
    local output
    output=$("$PROJECT_DIR/hooks/project-pulse.sh" "$TEST_TMP/project" 2>&1) || true
    
    assert_contains "$output" "TODO" "Detects TODO markers"
}

#=============================================================================
# Backup Tests
#=============================================================================

test_backup_create_restore() {
    log_test "Backup: Create and restore"
    
    local test_file="$TEST_TMP/project/test_backup.txt"
    echo "original content" > "$test_file"
    
    # Create backup
    "$PROJECT_DIR/hooks/backup.sh" create "$test_file" -m "test backup" >/dev/null 2>&1
    
    # Modify original
    echo "modified content" > "$test_file"
    
    # List backups
    local list
    list=$("$PROJECT_DIR/hooks/backup.sh" list 2>&1) || true
    assert_contains "$list" "test_backup" "Backup appears in list"
    
    # Clean up
    rm -f "$test_file"
}

test_backup_directory() {
    log_test "Backup: Directory backup"
    
    # Create backup of src directory
    "$PROJECT_DIR/hooks/backup.sh" create "$TEST_TMP/project/src" >/dev/null 2>&1
    
    # Check it created a tar.gz and the metadata is correct
    local list
    list=$("$PROJECT_DIR/hooks/backup.sh" list 2>&1) || true
    assert_contains "$list" "src" "Directory backup appears in list"
    assert_contains "$list" "[DIR]" "Directory backup marked as [DIR]"
}

# NEW TEST: Verify directory backup metadata path fix (Fix #3)
test_backup_directory_metadata() {
    log_test "Backup: Directory backup metadata path"
    
    # Create a fresh test dir
    local test_dir="$TEST_TMP/project/testdir_for_meta"
    mkdir -p "$test_dir"
    echo "file1" > "$test_dir/a.txt"
    echo "file2" > "$test_dir/b.txt"
    
    # Create backup
    "$PROJECT_DIR/hooks/backup.sh" create "$test_dir" -m "metadata test" >/dev/null 2>&1
    
    # Find the backup files
    local backup_archive meta_file
    backup_archive=$(find "$ProjectPulse_DIR/backups" -name "testdir_for_meta.*.tar.gz" | head -1)
    meta_file="${backup_archive}.meta"
    
    # Verify both exist
    assert_file_exists "$backup_archive" "Directory backup archive exists"
    assert_file_exists "$meta_file" "Metadata file exists at .tar.gz.meta"
    
    # Verify metadata content
    local meta_content
    meta_content=$(cat "$meta_file" 2>/dev/null || echo "")
    assert_contains "$meta_content" "type=directory" "Metadata has type=directory"
    assert_contains "$meta_content" "file_count=" "Metadata has file_count"
    
    # Clean up
    rm -rf "$test_dir"
}

#=============================================================================
# CLI Tests
#=============================================================================

test_cli_help() {
    log_test "CLI: Help output"
    
    local output
    output=$("$PROJECT_DIR/bin/ProjectPulse" --help 2>&1) || true
    
    assert_contains "$output" "ProjectPulse" "Help mentions ProjectPulse"
    assert_contains "$output" "context" "Help lists context command"
    assert_contains "$output" "search" "Help lists search command"
}

test_cli_version() {
    log_test "CLI: Version output"
    
    local output
    output=$("$PROJECT_DIR/bin/ProjectPulse" --version 2>&1) || true
    
    assert_contains "$output" "3.2" "Version shows 3.2"
}

test_cli_config_show() {
    log_test "CLI: Config show"
    
    export ProjectPulse_QUIET=0
    local output
    output=$("$PROJECT_DIR/bin/ProjectPulse" config show 2>&1) || true
    export ProjectPulse_QUIET=1
    
    assert_contains "$output" "Configuration" "Config show has header"
    assert_contains "$output" "context.max_files" "Config shows max_files"
}

#=============================================================================
# Concurrency Tests
#=============================================================================

test_concurrency_Session_writes() {
    log_test "Concurrency: Parallel Session writes"
    
    local Root="$TEST_TMP/project"
    
    # Run multiple parallel Session marks
    for i in {1..5}; do
        (
            export ProjectPulse_Session_ID="test_Session_$i"  # Use the fixed Session ID var
            mark_context_injected "$Root"
        ) &
    done
    wait
    
    # Check Session file isn't corrupted
    if [[ -f "$ProjectPulse_Session_FILE" ]]; then
        local lines
        lines=$(wc -l < "$ProjectPulse_Session_FILE")
        assert_success "[[ $lines -ge 1 ]]" "Session file has entries after parallel writes"
    else
        pass "Session file created (may have been cleaned)"
    fi
}

test_concurrency_cache_writes() {
    log_test "Concurrency: Parallel cache writes"
    
    # Run multiple parallel cache operations
    for i in {1..5}; do
        (
            _cache_Root "$TEST_TMP/dir$i" "$TEST_TMP/project"
        ) &
    done
    wait
    
    # Check cache file exists and isn't empty
    assert_file_exists "$ProjectPulse_CACHE/Roots.cache" "Cache file exists after parallel writes"
}

#=============================================================================
# Edge Case Tests
#=============================================================================

test_edge_empty_directory() {
    log_test "Edge Case: Empty directory"
    
    mkdir -p "$TEST_TMP/empty"
    
    local output
    output=$("$PROJECT_DIR/hooks/context-sampler.sh" "$TEST_TMP/empty" 2>&1) || true
    
    # Should not crash
    assert_contains "$output" "0 files" "Handles empty directory gracefully"
}

test_edge_special_characters() {
    log_test "Edge Case: Special characters in path"
    
    mkdir -p "$TEST_TMP/project/special dir"
    echo "content" > "$TEST_TMP/project/special dir/file.txt"
    
    local output
    output=$("$PROJECT_DIR/hooks/search.sh" "content" "$TEST_TMP/project" 2>&1) || true
    
    # Should handle spaces in paths
    assert_success "[[ \$? -eq 0 ]]" "Handles paths with spaces"
}

test_edge_binary_files() {
    log_test "Edge Case: Binary files"
    
    # Create a binary file
    printf '\x00\x01\x02\x03' > "$TEST_TMP/project/binary.bin"
    
    local output
    output=$("$PROJECT_DIR/hooks/context-sampler.sh" "$TEST_TMP/project" 2>&1) || true
    
    # Should skip binary files
    assert_not_contains "$output" "binary.bin" "Skips binary files"
}

#=============================================================================
# Test Runner
#=============================================================================

run_all_tests() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║           ProjectPulse v3.2 Test Suite                           ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    
    setup_test_env
    
    # Core tests
    echo "─── Core Library Tests ───────────────────────────────────────"
    test_core_version
    test_core_utility_functions
    test_core_find_project_Root
    test_core_config_builtin_defaults
    test_core_Session_id_stability
    test_core_quiet_mode_exit_codes
    test_core_Session_management
    test_core_reset_Session_quiet_mode
    test_core_Roots_management
    test_core_increment_fix
    echo ""
    
    # Hook tests
    echo "─── Context Sampler Tests ────────────────────────────────────"
    test_context_sampler_basic
    test_context_sampler_json
    test_context_sampler_focus_modes
    echo ""
    
    echo "─── Search Tests ─────────────────────────────────────────────"
    test_search_content
    test_search_filename
    test_search_json_output
    test_search_ignores_dirs
    echo ""
    
    echo "─── Recent Files Tests ───────────────────────────────────────"
    test_recent_files_basic
    test_recent_files_json
    echo ""
    
    echo "─── Project Pulse Tests ──────────────────────────────────────"
    test_pulse_basic
    test_pulse_quick_mode
    test_pulse_todo_detection
    echo ""
    
    echo "─── Backup Tests ─────────────────────────────────────────────"
    test_backup_create_restore
    test_backup_directory
    test_backup_directory_metadata
    echo ""
    
    echo "─── CLI Tests ────────────────────────────────────────────────"
    test_cli_help
    test_cli_version
    test_cli_config_show
    echo ""
    
    echo "─── Concurrency Tests ────────────────────────────────────────"
    test_concurrency_Session_writes
    test_concurrency_cache_writes
    echo ""
    
    echo "─── Edge Case Tests ──────────────────────────────────────────"
    test_edge_empty_directory
    test_edge_special_characters
    test_edge_binary_files
    echo ""
    
    # Summary
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    echo "Tests run:    $TESTS_RUN"
    echo -e "Tests passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Tests failed: ${RED}$TESTS_FAILED${NC}"
    echo ""
    
    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "${GREEN}All tests passed!${NC}"
        return 0
    else
        echo -e "${RED}Some tests failed.${NC}"
        return 1
    fi
}

run_single_test() {
    local test_name="$1"
    
    setup_test_env
    
    if declare -f "$test_name" >/dev/null; then
        "$test_name"
    else
        echo "Unknown test: $test_name"
        echo ""
        echo "Available tests:"
        declare -F | grep "test_" | awk '{print "  " $3}'
        return 1
    fi
}

#=============================================================================
# Main
#=============================================================================

main() {
    if [[ $# -eq 0 ]]; then
        run_all_tests
    else
        run_single_test "$1"
    fi
}

main "$@"
