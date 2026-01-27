# Follow-up Tasks for Project Pulse

This document outlines all identified issues and improvements for Project Pulse, organized by priority. Each task is designed to be actionable and can be assigned to developers or AI agents for completion.

## 🚨 Critical Priority (Security - Immediate Action Required)

### Task 1: Add workingDir Path Validation
**Issue Reference:** CODE_REVIEW_FINDINGS.md - Issue #1  
**File:** `ProjectPulse/src/daemon/spawner.ts`  
**Severity:** Critical  
**Estimated Effort:** 2-3 hours

**Description:**  
Add validation for the `workingDir` parameter before using it as the current working directory for spawning subprocesses. This prevents potential security vulnerabilities from malicious or corrupted delegation requests.

**Acceptance Criteria:**
- [ ] Create a `validateWorkingDir()` function that:
  - Resolves path to absolute form
  - Verifies path exists and is a directory
  - Prevents execution in sensitive system directories (/root, /etc, /sys, /proc, /dev)
  - Returns sanitized absolute path
- [ ] Apply validation in `spawnAgent()` before spawning subprocess
- [ ] Apply validation in `loadAgentPrompt()` before reading files
- [ ] Add error handling with descriptive messages
- [ ] Add unit tests for validation function
- [ ] Test with edge cases (non-existent paths, files, system directories)

**Implementation Hints:**
```typescript
function validateWorkingDir(dir: string): string {
    const absPath = path.resolve(dir);
    if (!fs.existsSync(absPath)) {
        throw new Error(`Working directory does not exist: ${dir}`);
    }
    const stat = fs.statSync(absPath);
    if (!stat.isDirectory()) {
        throw new Error(`Working directory is not a directory: ${dir}`);
    }
    const sensitive = ['/root', '/etc', '/sys', '/proc', '/dev'];
    if (sensitive.some(s => absPath.startsWith(s))) {
        throw new Error(`Working directory is in restricted path: ${dir}`);
    }
    return absPath;
}
```

---

## 🔴 High Priority (Data Integrity & Concurrency)

### Task 2: Fix ID Collision in Delegation Requests
**Issue Reference:** CODE_REVIEW_FINDINGS.md - Issue #2  
**File:** `ProjectPulse/src/lib/delegation/storage.ts`  
**Severity:** High  
**Estimated Effort:** 1-2 hours

**Description:**  
Replace the collision-prone `generateId()` with the existing `generateUniqueId()` function, or implement collision detection with retry logic.

**Acceptance Criteria:**
- [ ] Option A: Update `createRequest()` to use `generateUniqueId()` instead of `generateId()`
- [ ] Option B: Implement collision detection with atomic file creation (wx flag)
- [ ] Add retry logic (max 10 attempts) if using collision detection
- [ ] Add unit tests to verify uniqueness
- [ ] Add integration test that creates 1000+ concurrent requests
- [ ] Update documentation to explain ID format

**Implementation Hints:**
```typescript
// Option A (Simple):
import { generateUniqueId } from './id';
const id = generateUniqueId(); // Adds timestamp suffix

// Option B (Robust):
const handle = await fs.open(filePath, 'wx'); // Create only if not exists
await handle.writeFile(JSON.stringify(fullRequest, null, 2));
await handle.close();
```

---

### Task 3: Fix Daemon Race Condition on Start
**Issue Reference:** CODE_REVIEW_FINDINGS.md - Issue #3  
**File:** `ProjectPulse/src/daemon/index.ts`  
**Severity:** High  
**Estimated Effort:** 2 hours

**Description:**  
Use atomic file creation for the PID file to prevent race conditions when multiple processes try to start the daemon simultaneously.

**Acceptance Criteria:**
- [ ] Modify `writePid()` to use `fs.open()` with 'wx' flag (exclusive create)
- [ ] Return boolean indicating success/failure
- [ ] Update `startDaemon()` to check result of `writePid()`
- [ ] Remove separate `isRunning()` check before `writePid()`
- [ ] Add unit tests for concurrent start attempts
- [ ] Add integration test that starts daemon from multiple processes
- [ ] Document the atomic locking mechanism

**Implementation Hints:**
```typescript
async function writePid(): Promise<boolean> {
    try {
        const handle = await fs.open(getPidPath(), 'wx');
        await handle.writeFile(String(process.pid));
        await handle.close();
        return true; // Successfully claimed
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
            return false; // Already claimed
        }
        throw error;
    }
}
```

---

## 🟡 Medium Priority (Resource Management & Cleanup)

### Task 4: Clear Force-Kill Timer on Process Exit
**Issue Reference:** CODE_REVIEW_FINDINGS.md - Issue #4  
**File:** `ProjectPulse/src/daemon/spawner.ts`  
**Severity:** Medium  
**Estimated Effort:** 30 minutes

**Description:**  
Store the force-kill timer and clear it when the subprocess exits to prevent timer leaks.

**Acceptance Criteria:**
- [ ] Add variable to store force-kill timer handle
- [ ] Clear force-kill timer in process 'close' handler
- [ ] Clear force-kill timer in process 'error' handler
- [ ] Add unit test to verify timer is cleared
- [ ] Add test to verify event loop can exit cleanly

**Implementation Hints:**
```typescript
let forceKillHandle: NodeJS.Timeout | null = null;

forceKillHandle = setTimeout(() => { ... }, 5000);

proc.on('close', (code) => {
    clearTimeout(timeoutHandle);
    if (forceKillHandle) clearTimeout(forceKillHandle);
    // ...
});
```

---

### Task 5: Close Watcher Before Polling Fallback
**Issue Reference:** CODE_REVIEW_FINDINGS.md - Issue #5  
**File:** `ProjectPulse/src/daemon/watcher.ts`  
**Severity:** Medium  
**Estimated Effort:** 30 minutes

**Description:**  
Properly close the file watcher instance when falling back to polling mode to prevent resource leaks.

**Acceptance Criteria:**
- [ ] Close watcher in error handler before calling `startPolling()`
- [ ] Set watcher to null after closing
- [ ] Add try-catch around watcher.close() to handle close errors
- [ ] Add unit test for error handling
- [ ] Add test to verify no duplicate processing (watcher + polling)

**Implementation Hints:**
```typescript
this.watcher.on('error', (err) => {
    this.options.onError(err);
    if (this.watcher) {
        try {
            this.watcher.close();
        } catch {
            // Ignore close errors
        }
        this.watcher = null;
    }
    this.startPolling();
});
```

---

### Task 6: Validate Agent Type at Runtime
**Issue Reference:** CODE_REVIEW_FINDINGS.md - Issue #6  
**File:** `ProjectPulse/src/daemon/spawner.ts`  
**Severity:** Medium  
**Estimated Effort:** 1 hour

**Description:**  
Add runtime validation to ensure agent types are valid before attempting to load agent prompt files.

**Acceptance Criteria:**
- [ ] Add validation at start of `loadAgentPrompt()` function
- [ ] Throw descriptive error if agent type is invalid
- [ ] List valid agent types in error message
- [ ] Add optional: Create `isValidAgentType()` type guard function
- [ ] Add unit tests for invalid agent types
- [ ] Update documentation with list of valid agent types

**Implementation Hints:**
```typescript
async function loadAgentPrompt(agent: AgentType, workingDir: string): Promise<string> {
    if (!AGENT_FILES[agent]) {
        const validTypes = Object.keys(AGENT_FILES).join(', ');
        throw new Error(`Invalid agent type: ${agent}. Valid types: ${validTypes}`);
    }
    // ...
}
```

---

## 🔵 Low Priority (Quality of Life & Edge Cases)

### Task 7: Improve Process Existence Check
**Issue Reference:** CODE_REVIEW_FINDINGS.md - Issue #7  
**File:** `ProjectPulse/src/daemon/index.ts`  
**Severity:** Low  
**Estimated Effort:** 30 minutes

**Description:**  
Differentiate between "process doesn't exist" (ESRCH) and "permission denied" (EPERM) when checking if daemon is running.

**Acceptance Criteria:**
- [ ] Check error code in `isRunning()` catch block
- [ ] Handle ESRCH: remove PID file, return false
- [ ] Handle EPERM: keep PID file, return true
- [ ] Handle other errors: remove PID file, return false
- [ ] Add unit tests for each error code
- [ ] Update documentation about multi-user scenarios

**Implementation Hints:**
```typescript
catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ESRCH') {
        await removePid();
        return false; // Process doesn't exist
    } else if (err.code === 'EPERM') {
        return true; // Process exists but not ours
    } else {
        await removePid();
        return false; // Unexpected error
    }
}
```

---

## 🎯 Additional Improvements (Nice to Have)

### Task 8: Add Comprehensive Unit Tests
**Estimated Effort:** 4-6 hours

**Test Coverage Needed:**
- [ ] Delegation ID generation (collision scenarios)
- [ ] Daemon concurrent start attempts
- [ ] Subprocess timeout handling
- [ ] Watcher error recovery and fallback
- [ ] File path validation edge cases
- [ ] Agent type validation
- [ ] Process existence check with different error codes

**Acceptance Criteria:**
- [ ] Achieve >80% code coverage
- [ ] All edge cases documented in CODE_REVIEW_FINDINGS.md are covered
- [ ] Tests pass consistently
- [ ] CI/CD integration configured

---

### Task 9: Add ESLint Security Rules
**Estimated Effort:** 1-2 hours

**Rules to Add:**
- [ ] `no-eval` - Prevent eval usage
- [ ] `no-implied-eval` - Prevent setTimeout/setInterval with strings
- [ ] `no-new-func` - Prevent Function constructor
- [ ] Security plugin: `eslint-plugin-security`
- [ ] Require error handling in async functions
- [ ] Enforce consistent error types
- [ ] Prefer const over let

**Acceptance Criteria:**
- [ ] ESLint configuration updated
- [ ] All existing code passes new rules or has documented exceptions
- [ ] Add to CI/CD pipeline
- [ ] Document rules in contribution guide

---

### Task 10: Improve Error Messages and Logging
**Estimated Effort:** 2-3 hours

**Improvements:**
- [ ] Add structured logging (JSON format option)
- [ ] Include delegation ID in all log messages
- [ ] Add log levels (DEBUG, INFO, WARN, ERROR)
- [ ] Add context to error messages (what operation failed)
- [ ] Add timestamps to daemon logs
- [ ] Add log rotation for daemon.log

**Acceptance Criteria:**
- [ ] All errors include actionable information
- [ ] Logs can be filtered by level
- [ ] Logs include enough context for debugging
- [ ] Log file doesn't grow unbounded

---

### Task 11: Add Integration Tests
**Estimated Effort:** 4-6 hours

**Test Scenarios:**
- [ ] End-to-end delegation workflow (create → process → read result)
- [ ] Daemon lifecycle (start → process requests → stop)
- [ ] Concurrent delegation requests
- [ ] Multi-agent execution
- [ ] Error recovery and retry
- [ ] File watcher vs polling fallback

**Acceptance Criteria:**
- [ ] Tests run in isolated environment
- [ ] Tests clean up after themselves
- [ ] Tests are idempotent
- [ ] Tests run in CI/CD

---

### Task 12: Add API Documentation
**Estimated Effort:** 3-4 hours

**Documentation Needed:**
- [ ] TypeScript API documentation (TSDoc comments)
- [ ] Generate API docs with TypeDoc or similar
- [ ] Document delegation lifecycle
- [ ] Document configuration options
- [ ] Create troubleshooting guide
- [ ] Add architecture diagrams

**Acceptance Criteria:**
- [ ] All public functions have JSDoc/TSDoc comments
- [ ] Generated API docs are accessible
- [ ] Examples provided for common use cases
- [ ] Architecture documented with diagrams

---

### Task 13: Add Performance Tests
**Estimated Effort:** 2-3 hours

**Test Scenarios:**
- [ ] ID generation performance (measure collision rate)
- [ ] Context pack generation time
- [ ] File watcher responsiveness
- [ ] Daemon overhead (CPU, memory)
- [ ] Large repository handling (10K+ files)

**Acceptance Criteria:**
- [ ] Performance benchmarks documented
- [ ] Tests identify performance regressions
- [ ] Optimization opportunities identified
- [ ] Performance targets defined

---

### Task 14: Setup CI/CD Pipeline
**Estimated Effort:** 2-3 hours

**Pipeline Steps:**
- [ ] Lint check (ESLint)
- [ ] Type check (TypeScript)
- [ ] Unit tests (Vitest)
- [ ] Integration tests
- [ ] Security scan (CodeQL)
- [ ] Build verification
- [ ] Dependency audit

**Acceptance Criteria:**
- [ ] All checks run on PR
- [ ] Build artifacts generated
- [ ] Test coverage reported
- [ ] Security issues reported
- [ ] Failed checks block merge

---

## 📊 Summary

| Priority | Total Tasks | Estimated Effort |
|----------|-------------|------------------|
| Critical | 1 | 2-3 hours |
| High | 2 | 3-4 hours |
| Medium | 3 | 2-2.5 hours |
| Low | 1 | 30 min |
| Additional | 7 | 18-27 hours |
| **Total** | **14** | **~26-37 hours** |

## 🎯 Recommended Implementation Order

### Sprint 1 (Critical & High - 1 week)
1. Task 1: Add workingDir validation (Critical - Security)
2. Task 2: Fix ID collision (High - Data integrity)
3. Task 3: Fix daemon race condition (High - Concurrency)

### Sprint 2 (Medium & Testing - 1 week)
4. Task 4: Clear force-kill timer (Medium)
5. Task 5: Close watcher before polling (Medium)
6. Task 6: Validate agent type (Medium)
7. Task 8: Add comprehensive unit tests

### Sprint 3 (Quality & Documentation - 1 week)
8. Task 7: Improve process check (Low)
9. Task 9: Add ESLint security rules
10. Task 10: Improve error messages
11. Task 12: Add API documentation

### Sprint 4 (Infrastructure - 1 week)
12. Task 11: Add integration tests
13. Task 13: Add performance tests
14. Task 14: Setup CI/CD pipeline

---

## 🤖 AI Agent Delegation

Many of these tasks can be delegated to AI coding agents:

**Good for AI Agents:**
- Tasks 1-7: Code fixes with clear specifications
- Task 8: Writing unit tests
- Task 9: ESLint configuration
- Task 10: Improving error messages
- Task 12: Adding code documentation

**Requires Human Review:**
- Task 11: Integration tests (environment setup)
- Task 13: Performance tests (benchmark selection)
- Task 14: CI/CD pipeline (infrastructure decisions)

---

## 📝 Notes

- All tasks should include:
  - Unit tests for changes
  - Documentation updates
  - Code review before merging
  - Security review for critical changes

- Before starting a task:
  - Review the corresponding issue in CODE_REVIEW_FINDINGS.md
  - Understand the context and impact
  - Plan the implementation approach
  - Identify test scenarios

- After completing a task:
  - Run full test suite
  - Update this document to mark task complete
  - Create PR with clear description
  - Request code review

---

**Document Version:** 1.0  
**Last Updated:** 2026-01-27  
**Next Review:** After Sprint 1 completion
