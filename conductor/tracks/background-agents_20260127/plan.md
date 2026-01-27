# Background Agents Implementation Plan

## Phase 1: Core Delegation Protocol

### 1.1 [x] Create delegation types and interfaces
- File: `src/lib/delegation/types.ts`
- Define `Delegation`, `DelegationRequest`, `DelegationResult` interfaces
- Define status enum: `pending`, `running`, `complete`, `error`, `timeout`
- Define JSON envelope format matching ProjectPulse patterns

### 1.2 [x] Implement ID generator
- File: `src/lib/delegation/id.ts`
- Use adjective-color-animal pattern (e.g., "swift-amber-falcon")
- No external dependencies (built-in word lists)

### 1.3 [x] Create delegation storage module
- File: `src/lib/delegation/storage.ts`
- Functions: `createRequest()`, `writeResult()`, `readResult()`, `listDelegations()`
- Storage path: `~/.projectpulse/delegations/{pending,complete}/*.json`
- Use deterministic JSON output

---

## Phase 2: Daemon Process

### 2.1 [x] Implement file watcher for pending requests
- File: `src/daemon/watcher.ts`
- Native fs.watch with polling fallback
- Watch `~/.projectpulse/delegations/pending/`

### 2.2 [x] Create CLI spawner module
- File: `src/daemon/spawner.ts`
- Spawn appropriate CLI based on request (opencode, codex, gemini, claude)
- Capture stdout/stderr
- Handle process exit/timeout

### 2.3 [x] Implement daemon main entry
- File: `src/daemon/index.ts`
- Start watcher, handle signals (SIGTERM, SIGINT)
- Log to `~/.projectpulse/delegations/logs/daemon.log`

### 2.4 [x] Add timeout handling
- Maximum runtime: 15 minutes
- Kill process on timeout, write error result

---

## Phase 3: CLI Tools

### 3.1 [x] Implement `delegate` command
- File: `src/commands/delegate.ts`
- Parse agent and prompt args
- Create pending request file
- Return ID in JSON envelope

### 3.2 [x] Implement `delegation_read` command
- File: `src/commands/delegation-read.ts`
- Poll for result file (with timeout)
- Return result content or error

### 3.3 [x] Implement `delegation_list` command
- File: `src/commands/delegation-list.ts`
- List pending + complete delegations
- Show ID, status, title, agent

### 3.4 [x] Register commands in main CLI
- File: `src/commands/index.ts`
- Barrel exports for all commands

---

## Phase 4: Agent Integration

### 4.1 [x] Create agent loader module
- File: `src/lib/delegation/agent-loader.ts`
- Load agents from `agentprompts/` directory
- Parse markdown, extract any YAML frontmatter if present
- Return agent content for injection into CLI subprocess

### 4.2 [ ] Add YAML frontmatter to existing agents (optional)
- Files: `agentprompts/*.md`
- Add minimal frontmatter: `name`, `timeout`, `read_only: true`
- Keep existing prompt content unchanged

### 4.3 [x] Create agent registry
- File: `src/lib/delegation/types.ts` (AGENT_FILES constant)
- Map agent names to files:
  - `explorer` → `ExplorationAgent.md` (A.T.L.A.S.)
  - `reviewer` → `CodingAgenticReviewer.md`
  - `performance` → `AutonomousPerformance.md`
  - `architect` → `System_Prompt_Autonomous_Architect.md`
  - `planner` → `PlanningAgent.md`
- Validate agent exists before delegation

---

## Phase 5: Wrapper Integration

### 5.1 [ ] Extend codex-wrapper.sh
- Inject PROJECTPULSE_SESSION_ID
- Add delegation tool aliases

### 5.2 [ ] Extend opencode-wrapper.sh
- Same integration pattern

### 5.3 [ ] Document wrapper integration pattern
- File: `docs/wrapper-integration.md`

---

## Phase 6: Testing & Verification

### 6.1 [ ] Unit tests for delegation module
- File: `tests/delegation.test.ts`
- Test ID generation, storage, JSON format

### 6.2 [ ] Integration tests for daemon
- File: `tests/daemon.test.ts`
- Test file watch, CLI spawn, timeout

### 6.3 [ ] End-to-end test
- File: `tests/e2e.test.ts`
- Full delegate→daemon→read cycle

---

## Metadata

- **Track ID**: background-agents_20260127
- **Estimated Effort**: 2-3 days
- **Dependencies**: MVP CLI track (for core infrastructure)
