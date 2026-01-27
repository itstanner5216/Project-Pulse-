#!/usr/bin/env bash
#===============================================================================
# ProjectPulse v4.0.0-phase2 Smoke Test Suite  
# Comprehensive testing for Phase 1 + Phase 2 components
# Usage: bash tests/smoke.sh
#===============================================================================

set -euo pipefail

# Colors
if [[ -t 1 ]]; then
    RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; BLUE='\033[0;34m'; NC='\033[0m'
else
    RED=''; GREEN=''; YELLOW=''; BLUE=''; NC=''
fi

TESTS_RUN=0; TESTS_PASSED=0; TESTS_FAILED=0
TEST_ROOT=""; ORIGINAL_DIR=""

test_start() { CURRENT_TEST="$1"; ((TESTS_RUN++)) || true; printf "${BLUE}[TEST]${NC} %s... " "$1"; }
test_pass() { ((TESTS_PASSED++)) || true; printf "${GREEN}PASS${NC}\n"; }
test_fail() { ((TESTS_FAILED++)) || true; printf "${RED}FAIL${NC}"; [[ -n "${1:-}" ]] && printf " - %s" "$1"; printf "\n"; }
test_skip() { printf "${YELLOW}SKIP${NC}"; [[ -n "${1:-}" ]] && printf " - %s" "$1"; printf "\n"; }

assert_eq() { [[ "$1" == "$2" ]]; }
assert_contains() { [[ "$1" == *"$2"* ]]; }
assert_not_contains() { [[ "$1" != *"$2"* ]]; }
assert_file_exists() { [[ -f "$1" ]]; }
assert_empty() { [[ -z "$1" ]]; }
assert_not_empty() { [[ -n "$1" ]]; }

assert_json_valid() {
    local json="$1"
    if command -v jq &>/dev/null; then
        printf '%s' "$json" | jq . &>/dev/null; return $?
    fi
    local ob cb; ob=$(printf '%s' "$json" | tr -cd '{' | wc -c); cb=$(printf '%s' "$json" | tr -cd '}' | wc -c)
    [[ "$ob" -eq "$cb" ]] && [[ "$json" =~ ^[[:space:]]*[\{\[] ]]
}

assert_json_ok() { [[ "$1" == *'"ok":true'* ]]; }

#===============================================================================
# Test Fixtures
#===============================================================================

setup_test_fixtures() {
    TEST_ROOT=$(mktemp -d); ORIGINAL_DIR=$(pwd)
    export ProjectPulse_Root="$TEST_ROOT" PROJECTPULSE_ROOT="$TEST_ROOT"
    
    mkdir -p "$TEST_ROOT"/{src,lib,tests,bin,ignored_dir,node_modules/pkg,.git/objects}
    
    cat > "$TEST_ROOT/src/main.py" <<'EOF'
#!/usr/bin/env python3
CONSTANT_VALUE = 42
class MyClass:
    def __init__(self, value): self.value = value
    def get_value(self): return self.value
def main():
    # TODO: implement
    return MyClass(CONSTANT_VALUE).get_value()
async def async_function(): pass
if __name__ == "__main__": main()
EOF

    cat > "$TEST_ROOT/src/app.js" <<'EOF'
const API_URL = 'https://api.example.com';
class ApiClient {
    constructor(baseUrl) { this.baseUrl = baseUrl; }
    async fetch(endpoint) { return fetch(`${this.baseUrl}${endpoint}`); }
}
function initialize() { return new ApiClient(API_URL); }
export { ApiClient, initialize };
EOF

    cat > "$TEST_ROOT/src/lib.rs" <<'EOF'
pub const MAX_SIZE: usize = 1024;
pub struct Config { pub name: String }
pub fn process_data(data: &[u8]) -> Vec<u8> {
    // FIXME: optimize
    data.to_vec()
}
EOF

    cat > "$TEST_ROOT/README.md" <<'EOF'
# Test Project
This is a test project for ProjectPulse.
TODO: Add more docs
EOF

    cat > "$TEST_ROOT/.ProjectPulseignore" <<'EOF'
ignored_dir/
*.secret
EOF

    cat > "$TEST_ROOT/bin/entry" <<'EOF'
#!/usr/bin/env bash
echo "Entry"
EOF
    chmod +x "$TEST_ROOT/bin/entry"
    
    cat > "$TEST_ROOT/ignored_dir/secret.py" <<'EOF'
SECRET = "hidden"
EOF

    printf "Fixtures in: %s\n" "$TEST_ROOT"
}

cleanup_test_fixtures() {
    [[ -n "$TEST_ROOT" && -d "$TEST_ROOT" ]] && rm -rf "$TEST_ROOT"
    [[ -n "$ORIGINAL_DIR" ]] && cd "$ORIGINAL_DIR" || true
}
trap cleanup_test_fixtures EXIT

#===============================================================================
# Script Paths
#===============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

CORE_SH="${PROJECT_DIR}/lib/core.sh"
MERKLE_SH="${PROJECT_DIR}/pulse/merkle.sh"
SEARCH_SH="${PROJECT_DIR}/pulse/search.sh"
SYMBOLS_SH="${PROJECT_DIR}/pulse/symbols.sh"

PROJECTPULSE_CLI="${PROJECT_DIR}/bin/projectpulse"
BRIEFING_SH="${PROJECT_DIR}/hooks/projectpulse.sh"
GOOGLE_SYNC_SH="${PROJECT_DIR}/hooks/google-sync.sh"
GOOGLE_QUERY_SH="${PROJECT_DIR}/hooks/google-query.sh"

#===============================================================================
# Test: Syntax Validation
#===============================================================================

test_syntax_validation() {
    printf "\n${BLUE}=== Syntax Validation Tests ===${NC}\n\n"
    
    test_start "lib/core.sh syntax"
    bash -n "$CORE_SH" 2>/dev/null && test_pass || test_fail
    
    test_start "pulse/merkle.sh syntax"
    [[ -f "$MERKLE_SH" ]] && bash -n "$MERKLE_SH" 2>/dev/null && test_pass || test_fail
    
    test_start "pulse/search.sh syntax"
    [[ -f "$SEARCH_SH" ]] && bash -n "$SEARCH_SH" 2>/dev/null && test_pass || test_fail
    
    test_start "pulse/symbols.sh syntax"
    [[ -f "$SYMBOLS_SH" ]] && bash -n "$SYMBOLS_SH" 2>/dev/null && test_pass || test_fail
    
    test_start "bin/projectpulse syntax"
    [[ -f "$PROJECTPULSE_CLI" ]] && bash -n "$PROJECTPULSE_CLI" 2>/dev/null && test_pass || test_fail
    
    test_start "hooks/projectpulse.sh syntax"
    [[ -f "$BRIEFING_SH" ]] && bash -n "$BRIEFING_SH" 2>/dev/null && test_pass || test_fail
    
    test_start "hooks/google-sync.sh syntax"
    [[ -f "$GOOGLE_SYNC_SH" ]] && bash -n "$GOOGLE_SYNC_SH" 2>/dev/null && test_pass || test_fail
    
    test_start "hooks/google-query.sh syntax"
    [[ -f "$GOOGLE_QUERY_SH" ]] && bash -n "$GOOGLE_QUERY_SH" 2>/dev/null && test_pass || test_fail
}

#===============================================================================
# Test: JSON Helpers
#===============================================================================

test_json_helpers() {
    printf "\n${BLUE}=== JSON Helper Tests ===${NC}\n\n"
    source "$CORE_SH"
    
    test_start "json_escape handles backslash"
    local escaped; escaped=$(json_escape 'path\\to')
    assert_eq 'path\\\\to' "$escaped" && test_pass || test_fail "got: $escaped"
    
    test_start "json_escape handles quotes"
    escaped=$(json_escape 'say "hi"')
    assert_eq 'say \\"hi\\"' "$escaped" && test_pass || test_fail "got: $escaped"
    
    test_start "json_ok produces valid JSON"
    local ok; ok=$(json_ok '{"test":true}')
    assert_json_valid "$ok" && assert_contains "$ok" '"ok":true' && test_pass || test_fail
    
    test_start "json_err produces error JSON"
    local err; err=$(json_err "test error" 42 2>&1 || true)
    assert_contains "$err" '"ok":false' && assert_contains "$err" '"code":42' && test_pass || test_fail
}

#===============================================================================
# Test: Project Identity
#===============================================================================

test_project_identity() {
    printf "\n${BLUE}=== Project Identity Tests ===${NC}\n\n"
    source "$CORE_SH"
    
    test_start "project_id is stable"
    local id1 id2; id1=$(project_id); id2=$(project_id)
    assert_eq "$id1" "$id2" && test_pass || test_fail "$id1 vs $id2"
    
    test_start "project_id persists to file"
    assert_file_exists "${ProjectPulse_Root}/.ProjectPulse/project_id" && test_pass || test_fail
    
    test_start "project_id format is UUID-like"
    [[ "$id1" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] && test_pass || test_fail "$id1"
}

#===============================================================================
# Test: Ignore Patterns
#===============================================================================

test_ignore_patterns() {
    printf "\n${BLUE}=== Ignore Pattern Tests ===${NC}\n\n"
    source "$CORE_SH"
    
    test_start "should_ignore matches node_modules"
    should_ignore "node_modules/pkg/index.js" && test_pass || test_fail
    
    test_start "should_ignore matches .git"
    should_ignore ".git/objects/abc" && test_pass || test_fail
    
    test_start "should_ignore matches custom ignored_dir"
    should_ignore "ignored_dir/secret.py" && test_pass || test_fail
    
    test_start "should_ignore allows normal files"
    ! should_ignore "src/main.py" && test_pass || test_fail
}

#===============================================================================
# Test: Path Safety
#===============================================================================

test_path_safety() {
    printf "\n${BLUE}=== Path Safety Tests ===${NC}\n\n"
    source "$CORE_SH"
    
    test_start "realpath_safe resolves relative path"
    local resolved; resolved=$(realpath_safe "src/main.py" 2>/dev/null)
    [[ "$resolved" == "${ProjectPulse_Root}/src/main.py" ]] && test_pass || test_fail "$resolved"
    
    test_start "realpath_safe rejects absolute path"
    ! realpath_safe "/etc/passwd" 2>/dev/null && test_pass || test_fail
    
    test_start "realpath_safe rejects path traversal"
    ! realpath_safe "../../../etc/passwd" 2>/dev/null && test_pass || test_fail
}

#===============================================================================
# Phase 2 Test: Inject Gating
#===============================================================================

test_inject_gating() {
    printf "\n${BLUE}=== Phase 2: Inject Gating Tests ===${NC}\n\n"
    
    if [[ ! -x "$PROJECTPULSE_CLI" ]]; then
        test_start "inject gating"
        test_skip "bin/projectpulse not executable"
        return
    fi
    
    local test_session="test_session_$$_$(date +%s)"
    export PROJECTPULSE_SESSION_ID="$test_session"
    
    test_start "first inject prints banner and JSON"
    local first_output
    first_output=$("$PROJECTPULSE_CLI" inject 2>/dev/null || true)
    if assert_contains "$first_output" "Context pack (compressed):" && \
       assert_contains "$first_output" '"tree"'; then
        test_pass
    else
        test_fail "missing banner or pack"
    fi
    
    test_start "second inject is silent (no output)"
    local second_output
    second_output=$("$PROJECTPULSE_CLI" inject 2>/dev/null || true)
    if assert_empty "$second_output"; then
        test_pass
    else
        test_fail "expected empty, got: $second_output"
    fi
    
    test_start "different session gets banner again"
    export PROJECTPULSE_SESSION_ID="different_session_$$"
    local third_output
    third_output=$("$PROJECTPULSE_CLI" inject 2>/dev/null || true)
    if assert_contains "$third_output" "Context pack"; then
        test_pass
    else
        test_fail "expected banner for new session"
    fi
    
    rm -rf "${ProjectPulse_Root}/.ProjectPulse/sentinels" 2>/dev/null || true
}

#===============================================================================
# Phase 2 Test: File Commands
#===============================================================================

test_file_commands() {
    printf "\n${BLUE}=== Phase 2: File Command Tests ===${NC}\n\n"
    
    if [[ ! -x "$PROJECTPULSE_CLI" ]]; then
        test_start "file commands"
        test_skip "bin/projectpulse not executable"
        return
    fi
    
    test_start "file head returns JSON with content"
    local head_out
    head_out=$("$PROJECTPULSE_CLI" file head README.md --lines 5 2>/dev/null || true)
    if assert_json_ok "$head_out" && assert_contains "$head_out" '"content"'; then
        test_pass
    else
        test_fail "invalid output: $head_out"
    fi
    
    test_start "file show returns JSON with range"
    local show_out
    show_out=$("$PROJECTPULSE_CLI" file show README.md --range 1-3 2>/dev/null || true)
    if assert_json_ok "$show_out" && assert_contains "$show_out" '"range"'; then
        test_pass
    else
        test_fail "invalid output: $show_out"
    fi
    
    test_start "file grep finds matches"
    local grep_out
    grep_out=$("$PROJECTPULSE_CLI" file grep "TODO" README.md 2>/dev/null || true)
    if assert_json_ok "$grep_out" && assert_contains "$grep_out" '"matches"'; then
        test_pass
    else
        test_fail "invalid output: $grep_out"
    fi
    
    test_start "file head rejects path traversal"
    local traversal_out
    traversal_out=$("$PROJECTPULSE_CLI" file head ../../../etc/passwd 2>&1 || true)
    if assert_contains "$traversal_out" '"ok":false' || assert_contains "$traversal_out" 'error'; then
        test_pass
    else
        test_fail "should reject traversal"
    fi
    
    test_start "file head rejects absolute path"
    local abs_out
    abs_out=$("$PROJECTPULSE_CLI" file head /etc/passwd 2>&1 || true)
    if assert_contains "$abs_out" '"ok":false' || assert_contains "$abs_out" 'error'; then
        test_pass
    else
        test_fail "should reject absolute"
    fi
}

#===============================================================================
# Phase 2 Test: Config Print
#===============================================================================

test_config_print() {
    printf "\n${BLUE}=== Phase 2: Config Print Tests ===${NC}\n\n"
    
    if [[ ! -x "$PROJECTPULSE_CLI" ]]; then
        test_start "config print"
        test_skip "bin/projectpulse not executable"
        return
    fi
    
    test_start "config print returns valid JSON"
    local config_out
    config_out=$("$PROJECTPULSE_CLI" config print 2>/dev/null || true)
    if assert_json_ok "$config_out"; then
        test_pass
    else
        test_fail "not valid JSON"
    fi
    
    test_start "config print includes project_id"
    assert_contains "$config_out" '"project_id"' && test_pass || test_fail
    
    test_start "config print includes root"
    assert_contains "$config_out" '"root"' && test_pass || test_fail
    
    test_start "config print includes session_id"
    assert_contains "$config_out" '"session_id"' && test_pass || test_fail
    
    test_start "config print includes redis_available"
    assert_contains "$config_out" '"redis_available"' && test_pass || test_fail
    
    test_start "config print includes google_configured"
    assert_contains "$config_out" '"google_configured"' && test_pass || test_fail
}

#===============================================================================
# Phase 2 Test: Sync Status
#===============================================================================

test_sync_status() {
    printf "\n${BLUE}=== Phase 2: Sync Status Tests ===${NC}\n\n"
    
    if [[ ! -x "$GOOGLE_SYNC_SH" ]]; then
        test_start "sync status"
        test_skip "google-sync.sh not found"
        return
    fi
    
    test_start "sync --status returns valid JSON"
    local status_out
    status_out=$("$GOOGLE_SYNC_SH" --status 2>/dev/null || true)
    if assert_json_ok "$status_out"; then
        test_pass
    else
        test_fail "not valid JSON: $status_out"
    fi
    
    test_start "sync --status includes cloud_status"
    assert_contains "$status_out" 'cloud_status' && test_pass || test_fail
    
    test_start "sync without creds returns unconfigured gracefully"
    unset PROJECTPULSE_GOOGLE_ACCESS_TOKEN 2>/dev/null || true
    local sync_out
    sync_out=$("$GOOGLE_SYNC_SH" 2>/dev/null || true)
    if assert_json_ok "$sync_out" && assert_contains "$sync_out" 'unconfigured'; then
        test_pass
    else
        test_fail "should indicate unconfigured"
    fi
}

#===============================================================================
# Phase 2 Test: Briefing Pack Generation
#===============================================================================

test_briefing_pack() {
    printf "\n${BLUE}=== Phase 2: Briefing Pack Tests ===${NC}\n\n"
    
    if [[ ! -x "$BRIEFING_SH" ]]; then
        test_start "briefing pack"
        test_skip "hooks/projectpulse.sh not found"
        return
    fi
    
    test_start "briefing pack returns valid JSON"
    local pack_out
    pack_out=$("$BRIEFING_SH" 2>/dev/null || true)
    if assert_json_ok "$pack_out"; then
        test_pass
    else
        test_fail "not valid JSON"
    fi
    
    test_start "briefing pack includes tree"
    assert_contains "$pack_out" '"tree"' && test_pass || test_fail
    
    test_start "briefing pack includes key_files"
    assert_contains "$pack_out" '"key_files"' && test_pass || test_fail
    
    test_start "briefing pack includes symbols"
    assert_contains "$pack_out" '"symbols"' && test_pass || test_fail
    
    test_start "briefing pack includes entrypoints"
    assert_contains "$pack_out" '"entrypoints"' && test_pass || test_fail
    
    test_start "briefing pack includes hotspots"
    assert_contains "$pack_out" '"hotspots"' && test_pass || test_fail
    
    test_start "briefing pack includes recent_changes"
    assert_contains "$pack_out" '"recent_changes"' && test_pass || test_fail
    
    test_start "briefing pack excludes ignored directories"
    if assert_not_contains "$pack_out" 'node_modules' && \
       assert_not_contains "$pack_out" 'ignored_dir'; then
        test_pass
    else
        test_fail "should not include ignored dirs"
    fi
}

#===============================================================================
# Phase 2 Test: Google Query
#===============================================================================

test_google_query() {
    printf "\n${BLUE}=== Phase 2: Google Query Tests ===${NC}\n\n"
    
    if [[ ! -x "$GOOGLE_QUERY_SH" ]]; then
        test_start "google query"
        test_skip "google-query.sh not found"
        return
    fi
    
    test_start "inject mode returns JSON without cloud"
    unset PROJECTPULSE_GOOGLE_ACCESS_TOKEN 2>/dev/null || true
    local inject_out
    inject_out=$("$GOOGLE_QUERY_SH" inject '{"test":true}' 2>/dev/null || true)
    if assert_json_ok "$inject_out" && assert_contains "$inject_out" '"briefing"'; then
        test_pass
    else
        test_fail "invalid output: $inject_out"
    fi
    
    test_start "semsearch mode returns empty results without cloud"
    local search_out
    search_out=$("$GOOGLE_QUERY_SH" semsearch "test query" 2>/dev/null || true)
    if assert_json_ok "$search_out" && assert_contains "$search_out" '"results"'; then
        test_pass
    else
        test_fail "invalid output: $search_out"
    fi
}

#===============================================================================
# Test Summary
#===============================================================================

print_summary() {
    printf "\n${BLUE}======================================${NC}\n"
    printf "${BLUE}         TEST SUMMARY${NC}\n"
    printf "${BLUE}======================================${NC}\n\n"
    printf "Tests run:    %d\n" "$TESTS_RUN"
    printf "Tests passed: ${GREEN}%d${NC}\n" "$TESTS_PASSED"
    printf "Tests failed: ${RED}%d${NC}\n" "$TESTS_FAILED"
    
    if [[ $TESTS_FAILED -eq 0 ]]; then
        printf "\n${GREEN}All tests passed!${NC}\n"
        return 0
    else
        printf "\n${RED}Some tests failed.${NC}\n"
        return 1
    fi
}

#===============================================================================
# Main
#===============================================================================

main() {
    printf "${BLUE}======================================${NC}\n"
    printf "${BLUE}  ProjectPulse Phase 2 Smoke Tests${NC}\n"
    printf "${BLUE}======================================${NC}\n"
    
    if [[ ! -f "$CORE_SH" ]]; then
        printf "${RED}ERROR: lib/core.sh not found${NC}\n"
        exit 1
    fi
    
    printf "\nSetting up test fixtures...\n"
    setup_test_fixtures
    
    chmod +x "$PROJECTPULSE_CLI" "$BRIEFING_SH" "$GOOGLE_SYNC_SH" "$GOOGLE_QUERY_SH" 2>/dev/null || true
    
    test_syntax_validation
    test_json_helpers
    test_project_identity
    test_ignore_patterns
    test_path_safety
    
    test_inject_gating
    test_file_commands
    test_config_print
    test_sync_status
    test_briefing_pack
    test_google_query
    
    print_summary
}

main "$@"
