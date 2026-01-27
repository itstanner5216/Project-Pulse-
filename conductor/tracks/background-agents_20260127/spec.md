# Background Agents Specification

## Overview

Implement a **CLI-agnostic background agents system** for ProjectPulse that enables asynchronous task delegation across any AI CLI (OpenCode, Codex, Claude Code, Gemini CLI, Antigravity).

## Problem Statement

Current background agent implementations (like `opencode-background-agents`) are tightly coupled to specific CLI plugin APIs, making them unusable across different AI coding tools. ProjectPulse needs a universal solution that:

1. Works with all AI CLIs via the existing wrapper pattern
2. Uses filesystem-based IPC (no CLI-specific hooks)
3. Follows ProjectPulse's deterministic JSON output principles
4. Integrates with the existing context injection and search infrastructure

## Requirements

### Functional Requirements

1. **Delegation Tool Interface**
   - `delegate(prompt, agent)` — Start a background task, return immediately with ID
   - `delegation_read(id)` — Retrieve result (blocking if still running)
   - `delegation_list()` — List all delegations with status

2. **Background Daemon**
   - Watch for delegation requests in filesystem
   - Spawn appropriate CLI subprocess for agent work
   - Persist results to disk
   - Handle timeouts (15-minute max)

3. **Agent Definitions**
   - Portable markdown format with YAML frontmatter
   - Work across OpenCode, Codex, Claude Code
   - Read-only agents only (no write operations in background)

4. **Wrapper Integration**
   - Extend existing wrappers to expose delegation tools
   - Inject session ID for tracking

### Non-Functional Requirements

- **Determinism**: All outputs follow ProjectPulse JSON envelope
- **Offline-first**: Works without network
- **Security**: Validate paths, prevent traversal attacks
- **Performance**: Minimal overhead when delegation not in use

## User Stories

1. As an agent, I want to delegate research tasks so I can continue coding while research runs in background
2. As an agent, I want to read delegation results even after context compaction
3. As a developer, I want one delegation system that works across all my AI tools

## Acceptance Criteria

- [ ] `delegate` tool creates request file and returns ID immediately
- [ ] Daemon spawns separate CLI process for agent work
- [ ] Results persist to `~/.projectpulse/delegations/{session}/{id}.md`
- [ ] `delegation_read` blocks until result available, then returns content
- [ ] Works with at least 2 different CLIs (OpenCode + Codex)
- [ ] 15-minute timeout for long-running delegations
- [ ] >80% test coverage for delegation module

## Existing Agent Prompts (to be integrated)

Located in `agentprompts/`:

| Agent | File | Purpose | Background-Safe |
|-------|------|---------|-----------------|
| **A.T.L.A.S.** | `ExplorationAgent.md` | Codebase cartography — repo structure, critical paths, build/test commands | ✅ Read-only |
| **Reviewer** | `CodingAgenticReviewer.md` | Risk-driven code review with coverage accountability | ✅ Read-only |
| **Performance** | `AutonomousPerformance.md` | Static analysis for hotspots, bottlenecks, optimization plan | ✅ Read-only |
| **Architect** | `System_Prompt_Autonomous_Architect.md` | Principal engineer review with cost/efficiency focus | ✅ Read-only |
| **Planner** | `PlanningAgent.md` | Task decomposition — "Rule of 10" batching, backward chaining, critical path | ✅ Read-only |

All four agents produce structured reports with:
- Evidence-based findings (file paths, line numbers)
- Confidence levels (High/Medium/Low)
- Prioritized recommendations
- Self-check quality gates

These will be loaded by the daemon and injected as system prompts when spawning CLI subprocesses.

## Out of Scope (v1)

- Write-capable agents in background (requires undo/branching)
- Real-time progress streaming
- Distributed delegation across machines
- Web UI for delegation monitoring
