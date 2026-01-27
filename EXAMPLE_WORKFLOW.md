# Example: Using the Copilot Agent Task Queue

This document provides a concrete example of how to use the task queue workflow.

## Scenario

You want to work through the security and quality tasks identified in the code review.

## Step-by-Step Example

### 1. Initial Setup

```bash
# Clone the repository (if not already done)
git clone https://github.com/itstanner5216/Project-Pulse-.git
cd Project-Pulse-

# Create the long-lived branch
git checkout -b copilot-queue-tasks
git push -u origin copilot-queue-tasks

# Create a draft PR
gh pr create \
  --base main \
  --head copilot-queue-tasks \
  --title "Sequential Task Queue Execution" \
  --draft \
  --body "Executing tasks from agentprompts/QUEUE.yml"
```

### 2. Select First Task

Open `agentprompts/QUEUE.yml` and find the first task:

```yaml
- id: "SEC-001"
  title: "Add workingDir Path Validation"
  description: |
    Add validation for the workingDir parameter before using it...
  status: "todo"
  acceptance_criteria:
    - "Create a validateWorkingDir() function..."
    - "Verify path exists and is a directory"
    - "Prevent execution in sensitive system directories..."
```

### 3. Prepare the Prompt

Open `agentprompts/prompts/TASK_PROMPT.md` and fill in:

```markdown
**Repository:** itstanner5216/Project-Pulse-  
**Current Branch:** copilot-queue-tasks
**Base Branch:** main
**Task ID:** SEC-001
**Task Title:** Add workingDir Path Validation

[... rest of template with values filled in ...]
```

### 4. Execute with Copilot Agent

In VS Code:
1. Open Copilot Chat (Ctrl+Shift+I)
2. Paste the filled-in prompt
3. Review the agent's plan
4. Accept and let it work
5. Review the changes

### 5. Verify Changes

```bash
# Check what was modified
git status
git diff

# Run tests
cd ProjectPulse
npm test

# Run validation
cd ..
python3 scripts/validate_queue.py
```

### 6. Commit the Work

```bash
# Stage the changes
git add ProjectPulse/src/daemon/spawner.ts
git add ProjectPulse/src/daemon/spawner.test.ts

# Commit with message from QUEUE.yml
git commit -m "sec: add workingDir path validation to prevent arbitrary code execution"

# Push to branch
git push origin copilot-queue-tasks
```

### 7. Update Queue Status

Edit `agentprompts/QUEUE.yml`:

```yaml
- id: "SEC-001"
  title: "Add workingDir Path Validation"
  status: "done"  # Changed from "todo"
  # ... rest of task definition
```

Also update the summary:

```yaml
summary:
  total_tasks: 14
  status_counts:
    todo: 13  # Decreased by 1
    done: 1   # Increased by 1
```

Commit the update:

```bash
git add agentprompts/QUEUE.yml
git commit -m "chore: mark task SEC-001 as done in queue"
git push origin copilot-queue-tasks
```

### 8. Verify PR Updated

```bash
# View the PR
gh pr view copilot-queue-tasks

# Check CI status
gh pr checks copilot-queue-tasks
```

### 9. Move to Next Task

Repeat steps 2-8 for the next task (INT-001).

### 10. Final Review (After All Tasks Complete)

```bash
# Run all checks
cd ProjectPulse
npm test
npm run lint
npm run type-check

# Mark PR as ready
gh pr ready

# Request reviews
gh pr edit --add-reviewer username1,username2
```

## Tips

1. **Work in order** - Complete tasks in the sequence they appear in QUEUE.yml
2. **One task at a time** - Don't bundle multiple tasks in one commit
3. **Test frequently** - Run tests after each task
4. **Update queue immediately** - Keep status in sync with actual work
5. **Push regularly** - Don't lose work, push after each task

## Common Commands Quick Reference

```bash
# Check current task status
grep -A 3 'status: "todo"' agentprompts/QUEUE.yml | head -20

# Count remaining tasks
grep 'status: "todo"' agentprompts/QUEUE.yml | wc -l

# Validate queue
python3 scripts/validate_queue.py

# View PR
gh pr view copilot-queue-tasks

# Check tests
cd ProjectPulse && npm test

# Update PR description with progress
gh pr edit --body "Tasks completed: 3/14"
```

## What Success Looks Like

After completing all tasks:
- ✅ All tasks in QUEUE.yml marked as "done" or documented as "blocked"
- ✅ All tests passing
- ✅ No linting errors
- ✅ PR ready for review
- ✅ Comprehensive commit history showing each task

---

**For complete instructions, see [agentprompts/RUNBOOK.md](agentprompts/RUNBOOK.md)**
