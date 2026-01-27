# Agent Prompts Directory

This directory contains prompts for various AI coding agents and the task queue workflow for Project Pulse.

## Task Queue Workflow (NEW)

For the sequential Copilot agent workflow, see:

- **[QUEUE.yml](QUEUE.yml)** - Canonical ordered task queue with all tasks
- **[RUNBOOK.md](RUNBOOK.md)** - Step-by-step instructions for executing tasks
- **[prompts/TASK_PROMPT.md](prompts/TASK_PROMPT.md)** - Reusable prompt template for executing tasks
- **[prompts/PLAN_REFINEMENT_PROMPT.md](prompts/PLAN_REFINEMENT_PROMPT.md)** - Prompt for refining the queue

### Quick Start

1. Read [RUNBOOK.md](RUNBOOK.md) for complete workflow instructions
2. Select the next task from [QUEUE.yml](QUEUE.yml)
3. Use [prompts/TASK_PROMPT.md](prompts/TASK_PROMPT.md) template to create your prompt
4. Execute with GitHub Copilot Agent
5. Update task status in QUEUE.yml
6. Commit and push changes

## Other Agent Prompts

This directory also contains other agent prompt files:

- `AutonomousPerformance.md` - Performance optimization agent
- `CodingAgenticReviewer.md` - Code review agent  
- `ExplorationAgent.md` - Codebase exploration agent
- `PlanningAgent.md` - Planning and architecture agent
- `System_Prompt_Autonomous_Architect.md` - System architecture agent

---

**Last Updated:** 2026-01-27
