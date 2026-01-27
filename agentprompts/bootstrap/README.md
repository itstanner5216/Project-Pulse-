# Bootstrap Tasks

This directory contains pre-work documentation and instructions that are **separate from the main task queue workflow** defined in `agentprompts/QUEUE.yml` and `agentprompts/RUNBOOK.md`.

## Purpose

Bootstrap tasks are one-time setup activities that prepare supporting infrastructure for the queue workflow. These tasks:

- **Do NOT** modify task statuses in `QUEUE.yml`
- **Do NOT** count toward the task queue progress
- **Are NOT** tracked on the `copilot-queue-tasks` branch
- **Are** preparatory work that enhances the queue execution process

## Bootstrap Tasks

### 1. Compile Prompts Task

**File:** [COMPILE_PROMPTS_TASK.md](COMPILE_PROMPTS_TASK.md)

**Purpose:** Generate fully-filled, copy/paste-ready Copilot Agent prompts for every task in `QUEUE.yml` and store them in `agentprompts/compiled/` for quick access.

**Why This Helps:**
- Eliminates manual prompt assembly from templates
- Ensures consistency across all task executions
- Reduces human error when preparing Copilot Agent prompts
- Provides a quick reference for all queued tasks
- Makes it easier to preview and validate prompts before execution

**When to Run:** Before starting the main queue workflow, or when tasks are added/modified in `QUEUE.yml`.

## Relationship to Main Queue Workflow

```
Bootstrap Tasks (this directory)
    ↓
    Prepares compiled prompts
    ↓
Main Queue Workflow (QUEUE.yml + RUNBOOK.md)
    ↓
    Uses compiled prompts for task execution
    ↓
    Sequential task completion
```

Bootstrap tasks are a **prerequisite** to the main queue workflow but are managed independently.

## Usage

**Important:** The compiled prompts reference a long-lived branch called `copilot-queue-tasks` that must be created before executing tasks from the queue. 

### First-Time Setup

Before using the compiled prompts:

```bash
# Create the long-lived branch for queue execution
git checkout -b copilot-queue-tasks
git push -u origin copilot-queue-tasks
```

### Regular Usage

1. Execute bootstrap tasks as needed (typically once at the beginning)
2. Use the generated artifacts (e.g., compiled prompts) during queue execution
3. Re-run bootstrap tasks when the queue structure changes significantly

## Related Documentation

- **[../QUEUE.yml](../QUEUE.yml)** - Main task queue
- **[../RUNBOOK.md](../RUNBOOK.md)** - Queue execution workflow
- **[../prompts/TASK_PROMPT.md](../prompts/TASK_PROMPT.md)** - Task prompt template
- **[../README.md](../README.md)** - Agent prompts overview

---

**Last Updated:** 2026-01-27  
**Version:** 1.0.0
