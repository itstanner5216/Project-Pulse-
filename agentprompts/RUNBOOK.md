# Copilot Agent Task Queue Runbook

This runbook provides step-by-step instructions for manually executing tasks from the task queue (`QUEUE.yml`) using GitHub Copilot Agent. This workflow ensures all work is done on a single long-lived PR branch with proper tracking and documentation.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Task Execution Workflow](#task-execution-workflow)
4. [Handling Special Situations](#handling-special-situations)
5. [Final Review Checklist](#final-review-checklist)
6. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Tools
- Git (configured with your GitHub account)
- GitHub CLI (`gh`) - for easier PR management
- GitHub Copilot with Agent capability (VS Code or CLI)
- Text editor (VS Code recommended)
- Access to the repository with write permissions

### Required Knowledge
- Basic Git operations (commit, push, branch)
- Basic YAML editing
- How to run GitHub Copilot Agent in your environment

---

## Initial Setup

### Step 1: Create or Switch to the Long-Lived Branch

#### For New Work (First Time):

```bash
# Ensure you're on main and up to date
git checkout main
git pull origin main

# Create a new branch for all queue tasks
git checkout -b copilot-queue-tasks

# Push the branch to GitHub
git push -u origin copilot-queue-tasks
```

#### For Continuing Work (Subsequent Sessions):

```bash
# Switch to your existing branch
git checkout copilot-queue-tasks

# Pull any updates
git pull origin copilot-queue-tasks

# Sync with main if needed
git fetch origin main
git merge origin/main
# Resolve any conflicts if they arise
```

### Step 2: Open or Update the Draft PR

#### Creating the PR (First Time):

Using GitHub CLI:
```bash
gh pr create \
  --base main \
  --head copilot-queue-tasks \
  --title "Sequential Task Queue Execution" \
  --draft \
  --body "This PR tracks the sequential execution of tasks from agentprompts/QUEUE.yml. Tasks will be committed one at a time as they are completed."
```

Or via GitHub Web UI:
1. Go to your repository on GitHub
2. Click "Pull Requests" → "New Pull Request"
3. Set base: `main`, compare: `copilot-queue-tasks`
4. Click "Create Pull Request" → "Create Draft Pull Request"
5. Add description: "Sequential task queue execution from QUEUE.yml"

#### Updating the PR (Subsequent Sessions):

The PR will automatically update as you push commits. You can update the description to track progress:

```bash
gh pr edit --body "$(cat <<EOF
# Sequential Task Queue Progress

Currently working on tasks from agentprompts/QUEUE.yml

## Completed Tasks
- [x] SEC-001: Add workingDir Path Validation
- [x] INT-001: Fix ID Collision in Delegation Requests

## In Progress
- [ ] INT-002: Fix Daemon Race Condition on Start

## Remaining
- See QUEUE.yml for full list
EOF
)"
```

---

## Task Execution Workflow

### Step 3: Select the Next Task

1. **Open the queue file:**
   ```bash
   code agentprompts/QUEUE.yml
   ```

2. **Find the next task with status: `todo`:**
   - Tasks should be executed in order within each phase
   - Always complete the "Critical Security Fixes" phase first
   - Look for the first task with `status: "todo"`

3. **Read the task details:**
   - Note the `id` (e.g., `SEC-001`)
   - Read the `description`
   - Review the `acceptance_criteria`
   - Check the `source_refs` for additional context

4. **Review source documentation:**
   ```bash
   # Open referenced documents
   code CODE_REVIEW_FINDINGS.md
   code FOLLOWUP_TASKS.md
   ```

### Step 4: Prepare the Copilot Agent Prompt

1. **Open the task prompt template:**
   ```bash
   code agentprompts/prompts/TASK_PROMPT.md
   ```

2. **Fill in the variables:**
   - Replace `{{TASK_ID}}` with the task ID (e.g., `SEC-001`)
   - Replace `{{BRANCH}}` with `copilot-queue-tasks`
   - Replace `{{BASE_BRANCH}}` with `main`
   - Copy the task description, acceptance criteria, and source refs from QUEUE.yml

3. **Customize the prompt if needed:**
   - Add any specific context from your review of source docs
   - Highlight any particular concerns or edge cases
   - Specify test requirements

### Step 5: Execute the Task with Copilot Agent

#### Using VS Code Copilot Chat:

1. Open VS Code in the repository
2. Open Copilot Chat (Ctrl+Shift+I or Cmd+Shift+I)
3. Paste your prepared prompt
4. Review the agent's plan before accepting
5. Monitor the agent's work
6. Review all changes made by the agent

#### Using GitHub Copilot CLI:

```bash
# Run copilot agent with your prompt
gh copilot suggest
# Paste your prepared prompt and follow interactive guidance
```

#### Manual Review After Agent Execution:

```bash
# Check what files were modified
git status

# Review all changes
git diff

# Check if tests pass (if applicable)
npm test  # or appropriate test command
```

### Step 6: Commit the Changes

1. **Review the suggested commit message** from QUEUE.yml for this task

2. **Stage the changes:**
   ```bash
   # Stage specific files (recommended)
   git add ProjectPulse/src/daemon/spawner.ts
   git add ProjectPulse/src/daemon/spawner.test.ts
   
   # Or stage all changes (use with caution)
   git add .
   ```

3. **Commit with the suggested message:**
   ```bash
   # Use the exact commit message from QUEUE.yml
   git commit -m "sec: add workingDir path validation to prevent arbitrary code execution"
   ```

4. **Push to the branch:**
   ```bash
   git push origin copilot-queue-tasks
   ```

### Step 7: Update the Queue Status

1. **Open QUEUE.yml:**
   ```bash
   code agentprompts/QUEUE.yml
   ```

2. **Update the task status:**
   - Change `status: "todo"` to `status: "done"`
   - Optionally add a `completed_at` field with the date

3. **Update the summary section:**
   - Increment `done` count
   - Decrement `todo` count

4. **Commit the queue update:**
   ```bash
   git add agentprompts/QUEUE.yml
   git commit -m "chore: mark task SEC-001 as done in queue"
   git push origin copilot-queue-tasks
   ```

### Step 8: Verify and Continue

1. **Verify the PR updated:**
   ```bash
   gh pr view copilot-queue-tasks
   ```

2. **Check CI/CD status** (if configured):
   ```bash
   gh pr checks copilot-queue-tasks
   ```

3. **If all looks good, return to Step 3** to select the next task

---

## Handling Special Situations

### When a Task is Blocked

1. **Update task status to `blocked` in QUEUE.yml:**
   ```yaml
   status: "blocked"
   blocked_reason: "Waiting for external dependency / Requires design decision / etc."
   ```

2. **Add a note to the PR:**
   ```bash
   gh pr comment --body "Task SEC-001 is blocked: [reason]. Moving to next available task."
   ```

3. **Skip to the next non-blocked task** in the queue

### When You Need to Make Manual Changes

Sometimes Copilot Agent may not complete a task perfectly:

1. **Make the manual edits** to fix issues
2. **Document what you changed** in the commit message:
   ```bash
   git commit -m "sec: add workingDir path validation (manual refinement of agent work)"
   ```
3. **Continue with the normal workflow**

### Handling Merge Conflicts with Main

If `main` branch has updates that conflict:

1. **Fetch latest main:**
   ```bash
   git fetch origin main
   ```

2. **Merge main into your branch:**
   ```bash
   git merge origin/main
   ```

3. **Resolve conflicts:**
   - Open conflicted files in your editor
   - Resolve each conflict marker
   - Test that everything still works

4. **Commit the merge:**
   ```bash
   git add .
   git commit -m "merge: resolve conflicts with main branch"
   git push origin copilot-queue-tasks
   ```

### Rolling Back a Task

If a task was completed incorrectly:

1. **Revert the task commit:**
   ```bash
   # Find the commit hash
   git log --oneline
   
   # Revert the specific commit
   git revert <commit-hash>
   git push origin copilot-queue-tasks
   ```

2. **Update queue status back to `todo`:**
   ```bash
   code agentprompts/QUEUE.yml
   # Change status from "done" to "todo"
   git add agentprompts/QUEUE.yml
   git commit -m "chore: revert task SEC-001 status to todo"
   git push origin copilot-queue-tasks
   ```

3. **Re-run the task** following the normal workflow

### Pausing and Resuming Work

#### To Pause:

1. **Ensure all changes are committed:**
   ```bash
   git status  # Should show "nothing to commit"
   ```

2. **If you have work-in-progress, create a WIP commit:**
   ```bash
   git add .
   git commit -m "WIP: pausing work on task SEC-001"
   git push origin copilot-queue-tasks
   ```

3. **Update task status to `doing` in QUEUE.yml:**
   ```yaml
   status: "doing"
   ```

#### To Resume:

1. **Pull latest changes:**
   ```bash
   git checkout copilot-queue-tasks
   git pull origin copilot-queue-tasks
   ```

2. **Check QUEUE.yml for your in-progress task:**
   ```bash
   code agentprompts/QUEUE.yml
   # Look for status: "doing"
   ```

3. **Continue from Step 4** of the main workflow

---

## Final Review Checklist

Before marking the PR as "Ready for Review":

### Code Quality Checks

- [ ] All tasks in "Critical Security Fixes" phase are complete
- [ ] All tasks in "High Priority Data Integrity" phase are complete
- [ ] All planned tasks are either `done` or documented as `blocked`
- [ ] All commits follow the suggested commit message format
- [ ] No WIP commits remain (squash or clean up if needed)

### Testing Checks

- [ ] All unit tests pass: `npm test` (or appropriate command)
- [ ] Integration tests pass (if applicable)
- [ ] No new linting errors: `npm run lint`
- [ ] No TypeScript errors: `npm run type-check`

### Documentation Checks

- [ ] QUEUE.yml is up to date with all task statuses
- [ ] Any blocked tasks are documented with reasons
- [ ] PR description is updated with summary of completed work
- [ ] Any breaking changes are documented

### Security Checks

- [ ] No secrets or sensitive data in commits
- [ ] Security fixes have been verified manually
- [ ] Dependencies have been audited: `npm audit`

### Final Steps

1. **Update PR description** with final summary:
   ```bash
   gh pr edit --body "$(cat agentprompts/QUEUE.yml | grep -A 5 'summary:')"
   ```

2. **Mark PR as ready for review:**
   ```bash
   gh pr ready
   ```

3. **Request reviews** from team members:
   ```bash
   gh pr edit --add-reviewer @username1,@username2
   ```

4. **Add labels** if needed:
   ```bash
   gh pr edit --add-label "security,refactoring,ready-for-review"
   ```

---

## Troubleshooting

### Problem: Copilot Agent Doesn't Follow Instructions

**Solution:**
- Break down the task into smaller sub-tasks
- Be more specific in the prompt
- Include examples of the desired outcome
- Try multiple iterations with refined prompts

### Problem: Tests Fail After Agent Changes

**Solution:**
1. Review the test failures: `npm test -- --verbose`
2. Determine if tests need updating or if code has bugs
3. Either fix the code or update tests (document why in commit)
4. Re-run tests to verify

### Problem: Queue File Has Merge Conflicts

**Solution:**
1. This usually happens if multiple people edit QUEUE.yml
2. Open the file and manually resolve conflicts
3. Keep the most accurate status information
4. Commit the resolution: `git commit -m "fix: resolve queue file conflict"`

### Problem: Can't Push to Branch

**Solution:**
```bash
# Ensure you're on the right branch
git branch

# Pull latest changes
git pull origin copilot-queue-tasks

# Try push again
git push origin copilot-queue-tasks

# If still fails, check if branch protection rules are blocking
gh pr view copilot-queue-tasks
```

### Problem: Lost Track of Which Task You're On

**Solution:**
```bash
# Check the queue file
grep -A 2 'status: "doing"' agentprompts/QUEUE.yml

# Check your recent commits
git log --oneline -10

# Check the PR description
gh pr view copilot-queue-tasks
```

### Problem: Need to Add a New Task

**Solution:**
1. Use the PLAN_REFINEMENT_PROMPT.md to generate task details
2. Add the new task to QUEUE.yml in the appropriate phase
3. Update summary counts
4. Commit: `git commit -m "chore: add new task to queue"`

---

## Best Practices

1. **One task, one commit** - Keep changes focused and reviewable
2. **Update queue immediately** - Don't let status get out of sync
3. **Test before committing** - Run tests after each task
4. **Descriptive commit messages** - Use the suggested format from queue
5. **Regular pushes** - Push after each task to avoid losing work
6. **Document blockers** - Always explain why a task is blocked
7. **Ask for help** - If stuck, mark task as blocked and move on

---

## Quick Reference Commands

```bash
# Setup
git checkout -b copilot-queue-tasks
gh pr create --base main --head copilot-queue-tasks --draft

# Select next task
code agentprompts/QUEUE.yml

# After completing a task
git add <files>
git commit -m "<message from QUEUE.yml>"
git push origin copilot-queue-tasks
code agentprompts/QUEUE.yml  # Update status to "done"
git commit -am "chore: mark task XYZ-001 as done"
git push

# Check status
gh pr view copilot-queue-tasks
gh pr checks

# Final review
npm test && npm run lint
gh pr ready
```

---

## Getting Help

- **Queue workflow questions**: Check this runbook
- **Task-specific questions**: Check source docs (CODE_REVIEW_FINDINGS.md, FOLLOWUP_TASKS.md)
- **Technical issues**: Check CONTRIBUTING.md
- **Security concerns**: Check SECURITY.md
- **General questions**: Open an issue or discussion

---

**Last Updated:** 2026-01-27  
**Version:** 1.0.0  
**Maintainer:** Project Pulse Team
