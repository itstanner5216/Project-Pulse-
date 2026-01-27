# Plan Refinement Prompt for GitHub Copilot Agent

**Purpose:** Use this prompt to help GitHub Copilot Agent refine the task queue by mapping items from code review findings and follow-up tasks into specific, actionable tasks.

**When to Use:**
- When adding new tasks to QUEUE.yml
- When breaking down a complex task into subtasks
- When extracting tasks from new code review findings
- When re-prioritizing or reorganizing the queue

---

## Prompt Template

Copy and paste this prompt to Copilot Agent, adjusting the `[PLACEHOLDERS]` as needed:

---

## Your Mission: Refine Task Queue

You are helping to refine and expand the task queue for Project Pulse. Your goal is to analyze code review findings and create well-structured, actionable tasks for the queue file.

### Context

**Repository:** itstanner5216/Project-Pulse-  
**Queue File:** `agentprompts/QUEUE.yml`  
**Source Documents:**
- `CODE_REVIEW_FINDINGS.md` - Detailed code review with security and quality issues
- `FOLLOWUP_TASKS.md` - Organized follow-up work items
- `REVIEW_SUMMARY.md` - Executive summary of review
- `CONTRIBUTING.md` - Development guidelines
- `SECURITY.md` - Security policies

### Your Task

[Choose one or more of the following:]

**Option A: Extract New Tasks from a Document**
- Review: `[DOCUMENT_NAME]`
- Section: `[SPECIFIC_SECTION]` (optional)
- Extract actionable tasks that are not yet in QUEUE.yml
- Create proper task entries with all required fields

**Option B: Break Down an Existing Task**
- Review task: `[TASK_ID]` in QUEUE.yml
- Break it into smaller, more manageable subtasks
- Maintain the same quality and detail level

**Option C: Add Missing Details to a Task**
- Review task: `[TASK_ID]` in QUEUE.yml
- Add missing acceptance criteria
- Improve description clarity
- Add relevant source references

**Option D: Re-organize Queue Structure**
- Review the entire QUEUE.yml
- Suggest better phase organization
- Identify dependencies between tasks
- Optimize execution order

---

## Task Entry Requirements

Each task you create or refine MUST include:

### Required Fields

```yaml
- id: "[PHASE]-[NUMBER]"
  # Format: Phase prefix (SEC/INT/RES/VAL/QUA/TEST/LINT/DOC/CI) + 3-digit number
  # Example: SEC-001, INT-002, TEST-001
  
  title: "[Concise, action-oriented title]"
  # 5-10 words, starts with verb
  # Example: "Add workingDir Path Validation"
  
  description: |
    [Detailed explanation of what needs to be done and why]
    [2-4 sentences minimum]
    [Include context about the problem being solved]
  
  source_refs:
    - "[Document]#[section-anchor]"
    - "[Document]#[another-section]"
  # At least one reference to source documentation
  # Use GitHub-style anchors for sections
  
  status: "todo"
  # One of: todo, doing, done, blocked
  
  acceptance_criteria:
    - "[Specific, measurable criterion 1]"
    - "[Specific, measurable criterion 2]"
    - "[Specific, measurable criterion 3]"
    # Minimum 3 criteria, more for complex tasks
    # Each should be clear and verifiable
  
  suggested_commit_message: "[type]: [concise description]"
  # Follow conventional commits: fix/feat/sec/test/docs/chore
  # Example: "sec: add workingDir path validation to prevent arbitrary code execution"
  
  labels:
    - "[label1]"
    - "[label2]"
  # At least one label from: security, bug, feature, testing, docs, performance, etc.
  
  owners: []
  # Leave empty unless assigning to specific person
  
  estimated_hours: [number]
  # Realistic time estimate for the work
```

### Quality Standards

**Good Task Titles:**
- ✅ "Add workingDir Path Validation"
- ✅ "Fix ID Collision in Delegation Requests"
- ✅ "Implement Atomic PID File Creation"

**Bad Task Titles:**
- ❌ "Fix bug" (too vague)
- ❌ "Security stuff" (not specific)
- ❌ "Improve code quality" (not measurable)

**Good Descriptions:**
- ✅ Include context about the problem
- ✅ Explain why this is important
- ✅ Reference specific files or components
- ✅ Mention potential impacts

**Bad Descriptions:**
- ❌ Just repeat the title
- ❌ Too technical without context
- ❌ Missing the "why"

**Good Acceptance Criteria:**
- ✅ "Create a validateWorkingDir() function that resolves path to absolute form"
- ✅ "Add unit tests for validation function with edge cases"
- ✅ "Verify path exists and is a directory"

**Bad Acceptance Criteria:**
- ❌ "Make it work" (not measurable)
- ❌ "Fix the issue" (not specific)
- ❌ "Test it" (not detailed enough)

---

## Phase Categories

Assign each task to the appropriate phase:

### Critical Security Fixes (SEC-XXX)
- Immediate security vulnerabilities
- Potential data breaches or system compromise
- Input validation failures
- Authentication/authorization issues

### High Priority Data Integrity (INT-XXX)
- Data corruption risks
- Concurrency issues
- Race conditions
- ID collision problems

### Resource Management (RES-XXX)
- Memory leaks
- File handle leaks
- Timer leaks
- Process cleanup

### Input Validation (VAL-XXX)
- Runtime validation
- Type checking
- Schema validation
- Error handling

### Edge Cases and Quality (QUA-XXX)
- Edge case handling
- Error message improvements
- Code quality improvements

### Testing Infrastructure (TEST-XXX)
- Unit tests
- Integration tests
- Performance tests
- Security tests

### Code Quality and Linting (LINT-XXX)
- ESLint configuration
- Code style enforcement
- Static analysis
- Formatting

### Documentation (DOC-XXX)
- API documentation
- User guides
- Code comments
- Architecture docs

### CI/CD and Automation (CI-XXX)
- Build automation
- Test automation
- Deployment pipelines
- Monitoring

---

## Analysis Workflow

Follow these steps:

### Step 1: Review Source Documents

```bash
# Read the relevant sections
code CODE_REVIEW_FINDINGS.md
code FOLLOWUP_TASKS.md
code agentprompts/QUEUE.yml
```

Identify:
- Issues not yet in the queue
- Vague tasks that need detail
- Missing dependencies
- Incorrect prioritization

### Step 2: Extract or Refine Tasks

For each item:
1. Determine if it's already in QUEUE.yml
2. If not, create a new task entry
3. If yes, check if it needs refinement
4. Assign to appropriate phase
5. Generate unique ID
6. Write clear description
7. Create measurable acceptance criteria
8. Add source references
9. Suggest commit message
10. Add appropriate labels
11. Estimate effort

### Step 3: Validate Task Quality

Check each task:
- [ ] Has unique ID in correct format
- [ ] Title is action-oriented and clear
- [ ] Description provides context and explains "why"
- [ ] Has at least 3 specific acceptance criteria
- [ ] References source documentation
- [ ] Commit message follows conventional format
- [ ] Has appropriate labels
- [ ] Effort is estimated realistically
- [ ] Belongs to correct phase

### Step 4: Check Dependencies

Identify task dependencies:
- Tasks that must be done before others
- Tasks that can be parallelized
- Tasks that share code areas
- Tasks that affect the same tests

### Step 5: Provide Output

Generate output in this format:

```markdown
## Task Queue Refinement Results

### Tasks to Add

[Provide complete YAML entries for new tasks]

### Tasks to Modify

**Task ID:** [ID]  
**Current Issues:** [What's wrong]  
**Suggested Changes:** [YAML with changes]

### Phase Re-organization

**Current:** [Current phase structure]  
**Suggested:** [Improved phase structure]  
**Reason:** [Why this is better]

### Dependency Graph

[List task dependencies in order]
- Task A must be done before Task B
- Tasks C and D can be done in parallel
- etc.

### Summary Statistics

- Tasks added: [number]
- Tasks modified: [number]
- Tasks removed: [number]
- Total tasks: [number]
- Total estimated effort: [hours]
```

---

## Example: Good Task Entry

```yaml
- id: "SEC-002"
  title: "Implement Input Sanitization for File Paths"
  description: |
    Add comprehensive input sanitization for all file path inputs to prevent 
    path traversal attacks. Currently, user-provided paths are used without 
    validation in several locations (config loading, log file access). This 
    creates a security vulnerability where attackers could read arbitrary files.
  source_refs:
    - "CODE_REVIEW_FINDINGS.md#security-recommendations"
    - "SECURITY.md#input-validation"
  status: "todo"
  acceptance_criteria:
    - "Create sanitizePath() utility function in src/lib/utils/path.ts"
    - "Validate paths don't contain .. or absolute paths to sensitive areas"
    - "Apply sanitization to config file loading in src/lib/config.ts"
    - "Apply sanitization to log file paths in src/daemon/logger.ts"
    - "Add unit tests covering path traversal attempts"
    - "Add tests for edge cases (symlinks, Unicode, etc.)"
    - "Document the sanitization approach in SECURITY.md"
  suggested_commit_message: "sec: implement file path sanitization to prevent path traversal"
  labels:
    - "security"
    - "critical"
    - "input-validation"
  owners: []
  estimated_hours: 4
```

---

## Example: Good Task Breakdown

**Original Large Task:**
```yaml
- id: "TEST-001"
  title: "Add Comprehensive Test Coverage"
  status: "todo"
```

**Broken Down Into:**
```yaml
- id: "TEST-001"
  title: "Add Unit Tests for Delegation Module"
  # [full details...]
  
- id: "TEST-002"
  title: "Add Unit Tests for Daemon Module"
  # [full details...]
  
- id: "TEST-003"
  title: "Add Integration Tests for End-to-End Workflow"
  # [full details...]
  
- id: "TEST-004"
  title: "Add Security Tests for Input Validation"
  # [full details...]
```

---

## Common Pitfalls to Avoid

❌ **Don't:**
- Create tasks that are too large (>8 hours)
- Write vague acceptance criteria
- Skip source references
- Ignore dependencies
- Duplicate existing tasks
- Mix multiple unrelated changes in one task
- Create tasks without clear completion criteria

✅ **Do:**
- Keep tasks focused and atomic
- Make criteria measurable
- Link to source documentation
- Document dependencies
- Check for duplicates first
- One concern per task
- Clear definition of "done"

---

## Final Checklist

Before submitting your refinement:

- [ ] All new tasks have unique IDs
- [ ] IDs follow the correct format ([PHASE]-[NUMBER])
- [ ] Each task has 3+ specific acceptance criteria
- [ ] All tasks reference source documentation
- [ ] Commit messages follow conventional format
- [ ] Labels are appropriate and consistent
- [ ] Effort estimates are realistic
- [ ] Dependencies are documented
- [ ] No duplicate tasks exist
- [ ] Phase assignments are correct
- [ ] Summary statistics are updated

---

## How to Apply Your Refinements

After receiving the refinement results:

1. **Review the suggestions** carefully
2. **Edit QUEUE.yml** with the changes
3. **Validate YAML syntax**: `python scripts/validate_queue.py`
4. **Commit the changes**:
   ```bash
   git add agentprompts/QUEUE.yml
   git commit -m "chore: refine task queue with [X] new tasks"
   git push origin copilot-queue-tasks
   ```

---

**Ready to refine? Provide your specific request above and let's improve the queue!**

---

**Template Version:** 1.0.0  
**Last Updated:** 2026-01-27  
**Compatible with:** Project Pulse Queue v1.0.0
