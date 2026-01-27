# Compile Queue Task Prompts - Bootstrap Task

**⚠️ IMPORTANT:** This is a **bootstrap task** that is **separate from the main queue workflow** defined in `agentprompts/RUNBOOK.md`. This task prepares supporting infrastructure and does NOT modify task statuses in `agentprompts/QUEUE.yml`.

---

## Mission

Generate fully-filled, copy/paste-ready GitHub Copilot Agent prompts for all 14 tasks currently defined in `agentprompts/QUEUE.yml`. Store these compiled prompts in `agentprompts/compiled/` so that operators can quickly access ready-to-use prompts without manual template filling.

## Context

**Repository:** `itstanner5216/Project-Pulse-`  
**Source Queue:** `agentprompts/QUEUE.yml`  
**Prompt Template:** `agentprompts/prompts/TASK_PROMPT.md`  
**Output Directory:** `agentprompts/compiled/`  
**Branch to Use:** `copilot-queue-tasks` (long-lived branch based on `main`)

This bootstrap effort compiles all task prompts once so that during queue execution, operators can:
1. Open the compiled prompt file for a task (e.g., `agentprompts/compiled/SEC-001.md`)
2. Copy the entire content
3. Paste directly into GitHub Copilot Agent
4. Execute without manual template filling

---

## Pre-Flight Checklist for Operator

Before starting this bootstrap task, ensure the following:

### 1. Verify or Create the Long-Lived Branch

The queue workflow uses a dedicated branch called `copilot-queue-tasks`. Ensure it exists:

```bash
# Check if the branch exists locally
git branch --list copilot-queue-tasks

# Check if the branch exists remotely
git branch -r --list origin/copilot-queue-tasks
```

**If the branch does NOT exist:**

```bash
# Ensure you're on main and up to date
git checkout main
git pull origin main

# Create the long-lived branch
git checkout -b copilot-queue-tasks

# Push the branch to GitHub
git push -u origin copilot-queue-tasks
```

**If the branch DOES exist:**

```bash
# Switch to it
git checkout copilot-queue-tasks

# Pull latest changes
git pull origin copilot-queue-tasks

# Optionally, sync with main if needed
git fetch origin main
git merge origin/main
# Resolve any conflicts if they arise
```

### 2. Verify Repository Structure

Confirm the following files and directories exist:

```bash
# Check that queue and template exist
ls -l agentprompts/QUEUE.yml
ls -l agentprompts/prompts/TASK_PROMPT.md
```

Expected output:
- `agentprompts/QUEUE.yml` should exist with 14 tasks defined
- `agentprompts/prompts/TASK_PROMPT.md` should exist as the template

### 3. Read the Queue File

Review the queue to understand all tasks:

```bash
# View the entire queue
cat agentprompts/QUEUE.yml

# Or just view task IDs and titles
grep -E '^\s+- id:|^\s+title:' agentprompts/QUEUE.yml
```

You should see 14 tasks across 9 phases:
- `SEC-001`: Add workingDir Path Validation
- `INT-001`: Fix ID Collision in Delegation Requests
- `INT-002`: Fix Daemon Race Condition on Start
- `RES-001`: Clear Force-Kill Timer on Process Exit
- `RES-002`: Close Watcher Before Polling Fallback
- `VAL-001`: Validate Agent Type at Runtime
- `QUA-001`: Improve Process Existence Check
- `TEST-001`: Add Unit Tests for Security Fixes
- `TEST-002`: Add Integration Tests
- `LINT-001`: Add ESLint Security Rules
- `DOC-001`: Improve Error Messages and Logging
- `DOC-002`: Add API Documentation
- `CI-001`: Setup CI/CD Pipeline
- `CI-002`: Add Performance Tests

---

## Your Mission as Copilot Agent

You will generate compiled prompts for all tasks in the queue. For each task, you will:

1. **Read task details** from `agentprompts/QUEUE.yml`
2. **Read the template** from `agentprompts/prompts/TASK_PROMPT.md`
3. **Replace all placeholders** with actual values from the task
4. **Write the compiled prompt** to `agentprompts/compiled/{TASK_ID}.md`
5. **Verify no placeholders remain** in the compiled file

### Template Variables to Replace

For each task, replace these placeholders in `TASK_PROMPT.md`:

| Placeholder | Source | Example Value |
|-------------|--------|---------------|
| `{{BRANCH}}` | Fixed value | `copilot-queue-tasks` |
| `{{BASE_BRANCH}}` | Fixed value | `main` |
| `{{TASK_ID}}` | `task.id` from QUEUE.yml | `SEC-001` |
| `{{TASK_TITLE}}` | `task.title` from QUEUE.yml | `Add workingDir Path Validation` |
| `{{TASK_DESCRIPTION}}` | `task.description` from QUEUE.yml | Full description text |
| `{{SOURCE_REFS}}` | `task.source_refs` from QUEUE.yml | List of references |
| `{{ACCEPTANCE_CRITERIA}}` | `task.acceptance_criteria` from QUEUE.yml | List of criteria |
| `{{COMMIT_MESSAGE}}` | `task.suggested_commit_message` from QUEUE.yml | Commit message text |

### Additional Processing Rules

1. **Format multi-line fields properly:**
   - Description, acceptance criteria, and source refs are often multi-line
   - Preserve formatting and bullet points
   - Ensure proper YAML indentation is converted to Markdown

2. **Create a structured list for acceptance criteria:**
   - Convert YAML array to Markdown checklist format
   - Each criterion should be a checkbox item: `- [ ] Criterion text`

3. **Format source references as a list:**
   - Each reference should be on its own line
   - Use bullet points or numbered list
   - Include full path if it's a file reference

---

## Implementation Steps

### Step 1: Create Output Directory

```bash
# Create the compiled directory if it doesn't exist
mkdir -p agentprompts/compiled
```

### Step 2: Parse the Queue File

Read and parse `agentprompts/QUEUE.yml` to extract all tasks. You need to extract:
- All task objects from all phases
- For each task: id, title, description, source_refs, acceptance_criteria, suggested_commit_message

Example Python pseudo-code (you can use any approach):
```python
import yaml

with open('agentprompts/QUEUE.yml', 'r') as f:
    queue_data = yaml.safe_load(f)

tasks = []
for phase in queue_data['phases']:
    for task in phase['tasks']:
        tasks.append(task)

# tasks now contains all 14 tasks
```

### Step 3: Load the Template

Read the template file:
```bash
cat agentprompts/prompts/TASK_PROMPT.md
```

Store this as a string template for processing.

### Step 4: Generate Compiled Prompts

For each task in the queue:

1. **Copy the template**
2. **Replace placeholders:**
   ```
   {{BRANCH}} → copilot-queue-tasks
   {{BASE_BRANCH}} → main
   {{TASK_ID}} → task['id']
   {{TASK_TITLE}} → task['title']
   {{TASK_DESCRIPTION}} → task['description']
   {{SOURCE_REFS}} → formatted list of task['source_refs']
   {{ACCEPTANCE_CRITERIA}} → formatted checklist from task['acceptance_criteria']
   {{COMMIT_MESSAGE}} → task['suggested_commit_message']
   ```

3. **Format acceptance criteria** as Markdown checklist:
   ```markdown
   - [ ] Create a validateWorkingDir() function that resolves path to absolute form
   - [ ] Verify path exists and is a directory
   - [ ] Prevent execution in sensitive system directories (/root, /etc, /sys, /proc, /dev)
   ...
   ```

4. **Format source references** as Markdown list:
   ```markdown
   - CODE_REVIEW_FINDINGS.md#1-missing-validation-of-workingdir-path
   - FOLLOWUP_TASKS.md#task-1-add-workingdir-path-validation
   ```

5. **Write to file:**
   ```
   agentprompts/compiled/{TASK_ID}.md
   ```

### Step 5: Create Index File

Create `agentprompts/compiled/README.md` with:

```markdown
# Compiled Task Prompts

This directory contains fully-filled, copy/paste-ready GitHub Copilot Agent prompts for all tasks in `agentprompts/QUEUE.yml`.

## How to Use

1. Identify the task you want to execute from `../QUEUE.yml`
2. Open the corresponding compiled prompt file (e.g., `SEC-001.md`)
3. Copy the entire file content
4. Paste into GitHub Copilot Agent (VS Code, CLI, or web interface)
5. Review the agent's plan and execute

## Available Prompts

| Task ID | Title | Phase | File |
|---------|-------|-------|------|
| SEC-001 | Add workingDir Path Validation | Critical Security Fixes | [SEC-001.md](SEC-001.md) |
| INT-001 | Fix ID Collision in Delegation Requests | High Priority Data Integrity | [INT-001.md](INT-001.md) |
| INT-002 | Fix Daemon Race Condition on Start | High Priority Data Integrity | [INT-002.md](INT-002.md) |
| RES-001 | Clear Force-Kill Timer on Process Exit | Resource Management | [RES-001.md](RES-001.md) |
| RES-002 | Close Watcher Before Polling Fallback | Resource Management | [RES-002.md](RES-002.md) |
| VAL-001 | Validate Agent Type at Runtime | Input Validation | [VAL-001.md](VAL-001.md) |
| QUA-001 | Improve Process Existence Check | Edge Cases and Quality | [QUA-001.md](QUA-001.md) |
| TEST-001 | Add Unit Tests for Security Fixes | Testing Infrastructure | [TEST-001.md](TEST-001.md) |
| TEST-002 | Add Integration Tests | Testing Infrastructure | [TEST-002.md](TEST-002.md) |
| LINT-001 | Add ESLint Security Rules | Code Quality and Linting | [LINT-001.md](LINT-001.md) |
| DOC-001 | Improve Error Messages and Logging | Documentation | [DOC-001.md](DOC-001.md) |
| DOC-002 | Add API Documentation | Documentation | [DOC-002.md](DOC-002.md) |
| CI-001 | Setup CI/CD Pipeline | CI/CD and Automation | [CI-001.md](CI-001.md) |
| CI-002 | Add Performance Tests | CI/CD and Automation | [CI-002.md](CI-002.md) |

## When to Regenerate

Regenerate compiled prompts when:
- Tasks are added to or removed from QUEUE.yml
- Task details (description, criteria, etc.) are significantly updated
- The template (`../prompts/TASK_PROMPT.md`) is modified

## Related Documentation

- **[../QUEUE.yml](../QUEUE.yml)** - Source task queue
- **[../RUNBOOK.md](../RUNBOOK.md)** - Queue execution workflow
- **[../prompts/TASK_PROMPT.md](../prompts/TASK_PROMPT.md)** - Source template

---

**Generated:** 2026-01-27  
**Template Version:** 1.0.0  
**Queue Version:** 1.0.0  
**Total Tasks:** 14
```

### Step 6: Verification

After generating all files, verify:

```bash
# Count compiled prompts (should be 14)
ls -1 agentprompts/compiled/*.md | grep -v README.md | wc -l

# Check for any remaining placeholders (should return nothing)
grep -r '{{' agentprompts/compiled/
grep -r '\[PLACEHOLDER' agentprompts/compiled/
```

**Expected verification results:**
- ✅ 14 compiled prompt files (one per task)
- ✅ 1 README.md index file
- ✅ No `{{...}}` placeholders in any file
- ✅ No `[PLACEHOLDER]` tokens in any file

### Step 7: Spot-Check Quality

Manually review 2-3 compiled prompts to ensure:
- All placeholders are replaced with real values
- Formatting is clean and readable
- Lists and checklists render correctly
- No YAML artifacts or broken Markdown

```bash
# View a compiled prompt
cat agentprompts/compiled/SEC-001.md

# View the index
cat agentprompts/compiled/README.md
```

---

## Acceptance Criteria for Bootstrap Task

This bootstrap task is complete when ALL of the following are met:

- [ ] Branch `copilot-queue-tasks` exists (based on `main`)
- [ ] Directory `agentprompts/compiled/` exists
- [ ] Exactly 14 compiled prompt files exist (one per task in QUEUE.yml)
- [ ] Each compiled file is named `{TASK_ID}.md` (e.g., `SEC-001.md`)
- [ ] File `agentprompts/compiled/README.md` exists with index table
- [ ] No `{{PLACEHOLDER}}` tokens remain in any compiled file
- [ ] No `[PLACEHOLDER]` tokens remain in any compiled file
- [ ] All acceptance criteria are formatted as Markdown checklists
- [ ] All source references are formatted as Markdown lists
- [ ] Each compiled prompt is self-contained and copy/paste ready
- [ ] Index README includes all 14 tasks with correct titles and links
- [ ] Verification commands pass (grep for placeholders returns nothing)
- [ ] Spot-check of 2-3 files shows proper formatting and content
- [ ] All changes committed to `copilot-queue-tasks` branch
- [ ] Changes pushed to GitHub

---

## Commit Instructions

### What to Commit

```bash
# Stage the compiled prompts
git add agentprompts/compiled/

# Commit with descriptive message
git commit -m "chore: generate compiled prompts for all 14 queue tasks"

# Push to the long-lived branch
git push origin copilot-queue-tasks
```

### What NOT to Commit

- Do NOT modify `agentprompts/QUEUE.yml` (this is pre-work, not queue execution)
- Do NOT modify task statuses
- Do NOT modify the template `agentprompts/prompts/TASK_PROMPT.md`
- Do NOT create or update a pull request (this work stays on the branch)

---

## Troubleshooting

### Problem: Branch `copilot-queue-tasks` doesn't exist

**Solution:**
```bash
git checkout main
git pull origin main
git checkout -b copilot-queue-tasks
git push -u origin copilot-queue-tasks
```

### Problem: Can't parse QUEUE.yml

**Solution:**
- Ensure QUEUE.yml is valid YAML (check indentation)
- Use a YAML parser library (PyYAML for Python, js-yaml for Node.js)
- Validate YAML online if needed: https://www.yamllint.com/

### Problem: Template has placeholders I don't recognize

**Solution:**
- Only replace the documented placeholders listed above
- Leave any other `{{...}}` tokens that may be examples or documentation
- If uncertain, check the template file for context around the placeholder

### Problem: Verification finds remaining placeholders

**Solution:**
1. Identify which files have placeholders: `grep -l '{{' agentprompts/compiled/*.md`
2. Open those files and manually inspect the placeholders
3. Determine if they should be replaced or are intentional
4. Re-run generation for affected files if needed

### Problem: Compiled prompts are too long

**Solution:**
- This is expected; some tasks have detailed descriptions and many criteria
- Copilot Agent can handle long prompts
- If truly too long, consider summarizing but keep all acceptance criteria intact

---

## Maintenance

### When to Regenerate

Run this bootstrap task again when:

1. **New tasks are added** to QUEUE.yml
2. **Existing tasks are modified** (description, criteria, etc.)
3. **Template is updated** (`TASK_PROMPT.md`)
4. **Compiled prompts are out of sync** with the queue

### How to Regenerate

```bash
# Switch to the branch
git checkout copilot-queue-tasks

# Re-run this entire bootstrap task
# (Follow all steps from "Implementation Steps")

# Commit updates
git add agentprompts/compiled/
git commit -m "chore: regenerate compiled prompts after queue updates"
git push origin copilot-queue-tasks
```

---

## Example: Manual Compilation (If Automated Script Fails)

If you need to manually compile one prompt:

1. **Open the template:**
   ```bash
   cat agentprompts/prompts/TASK_PROMPT.md > agentprompts/compiled/SEC-001.md
   ```

2. **Edit the file:**
   ```bash
   nano agentprompts/compiled/SEC-001.md
   # or
   code agentprompts/compiled/SEC-001.md
   ```

3. **Find and replace:**
   - Find: `{{BRANCH}}` → Replace: `copilot-queue-tasks`
   - Find: `{{BASE_BRANCH}}` → Replace: `main`
   - Find: `{{TASK_ID}}` → Replace: `SEC-001`
   - Find: `{{TASK_TITLE}}` → Replace: `Add workingDir Path Validation`
   - Find: `{{TASK_DESCRIPTION}}` → Replace: (copy from QUEUE.yml)
   - Find: `{{SOURCE_REFS}}` → Replace: (format from QUEUE.yml)
   - Find: `{{ACCEPTANCE_CRITERIA}}` → Replace: (format as checklist from QUEUE.yml)
   - Find: `{{COMMIT_MESSAGE}}` → Replace: (copy from QUEUE.yml)

4. **Verify:**
   ```bash
   grep '{{' agentprompts/compiled/SEC-001.md
   # Should return nothing
   ```

5. **Repeat for all 14 tasks**

---

## Summary

This bootstrap task creates a library of ready-to-use prompts that eliminates manual work during queue execution. Once complete, operators can simply open a compiled prompt file, copy it, and paste it into Copilot Agent without any template filling.

**Key Points:**
- ✅ This is pre-work, not part of the main queue workflow
- ✅ Does NOT modify QUEUE.yml task statuses
- ✅ Work is done on `copilot-queue-tasks` branch
- ✅ Generates 14 compiled prompt files + 1 index README
- ✅ No placeholders remain after completion
- ✅ Improves operator efficiency and reduces errors

---

**Template Version:** 1.0.0  
**Last Updated:** 2026-01-27  
**Compatible with:** QUEUE.yml v1.0.0 (14 tasks)  
**Bootstrap Task Type:** One-time setup / Regenerate as needed
