# ProjectPulse API Documentation

Welcome to the ProjectPulse API documentation. ProjectPulse is a CLI-agnostic delegation system that enables async background agent execution across any AI CLI (OpenCode, Codex, Gemini, Claude, etc.).

## Overview

ProjectPulse provides a filesystem-based IPC (Inter-Process Communication) system where:

1. **Clients** create delegation requests as JSON files
2. **Daemon** watches for new requests and spawns CLI subprocesses
3. **Results** are written back to the filesystem
4. **Clients** poll for results or block until completion

This architecture allows any AI CLI to delegate work to specialized agents running in other CLIs without tight coupling.

## Key Features

- **CLI-Agnostic**: Works with any AI CLI (OpenCode, Codex, Gemini, Claude)
- **Auto-Detection**: Automatically discovers available CLIs on your system
- **Filesystem IPC**: Simple JSON-based communication, no network required
- **Readable IDs**: Uses 3-word memorable IDs (e.g., "swift-amber-falcon") instead of UUIDs
- **Background Daemon**: Processes delegations asynchronously
- **Multiple Agents**: Supports explorer, reviewer, performance, architect, and planner agents
- **Graceful Shutdown**: Daemon waits for active tasks before exiting
- **Timeout Protection**: Configurable timeouts prevent runaway processes

## Core Concepts

### Delegation Lifecycle

```
1. PENDING  → Request created in ~/.projectpulse/delegations/pending/
2. RUNNING  → Daemon picks up request, spawns CLI subprocess
3. COMPLETE → Result written to complete/ directory
4. ERROR    → Error logged with message
5. TIMEOUT  → Exceeded configured timeout (default: 15 minutes)
```

### Directory Structure

```
~/.projectpulse/delegations/
├── pending/          # Requests waiting for daemon
├── complete/         # Completed results
└── logs/             # Daemon logs (daemon.log, daemon.pid)
```

### Agent Types

ProjectPulse supports five specialized agents:

- **explorer** (A.T.L.A.S.): Codebase exploration and cartography
- **reviewer**: Risk-driven code review
- **performance**: Static performance analysis
- **architect**: Cost and efficiency review
- **planner**: Task decomposition and planning

### Supported CLIs

- **opencode**: OpenCode AI CLI
- **codex**: GitHub Codex
- **gemini**: Google Gemini
- **claude**: Anthropic Claude
- **auto**: Auto-detect available CLI (recommended)

## Quick Start

### Installation

```bash
npm install -g projectpulse
```

### Start the Daemon

```bash
projectpulse daemon start
```

### Create a Delegation

```bash
projectpulse delegate "Analyze this codebase structure" \
  --agent explorer \
  --cli auto
```

### Check Status

```bash
projectpulse delegation list
```

### Read Results

```bash
# Poll and wait for result
projectpulse delegation read <delegation-id> --wait

# Read immediately (may return pending status)
projectpulse delegation read <delegation-id>
```

## Configuration

### Environment Variables

- `PROJECTPULSE_DELEGATIONS_DIR`: Override default delegations directory (default: `~/.projectpulse/delegations`)
- `PROJECTPULSE_SESSION_ID`: Parent session context identifier
- `CLI_NAME`: Source CLI identifier

### Default Values

- **Timeout**: 900 seconds (15 minutes)
- **Delegations Directory**: `~/.projectpulse/delegations`
- **Max Concurrent Delegations**: Unlimited (daemon processes one at a time)

## API Modules

### [Delegation Module](api/modules/lib_delegation.html)

Core library for creating, reading, and managing delegation requests.

**Key Functions:**
- `createRequest()` - Create a new delegation
- `checkStatus()` - Check delegation status
- `readResult()` - Read delegation result
- `listPending()` - List pending delegations
- `listComplete()` - List completed delegations

### [Daemon Module](api/modules/daemon.html)

Background service for processing delegation requests.

**Key Functions:**
- `startDaemon()` - Start background watcher
- `stopDaemon()` - Graceful shutdown
- `isRunning()` - Check daemon status
- `getDaemonStatus()` - Get PID and log path

### [Commands Module](api/modules/commands.html)

CLI command implementations.

**Key Functions:**
- `delegate()` - Create delegation command
- `delegationRead()` - Read result command
- `delegationList()` - List delegations command

## Examples

### Programmatic Usage

```typescript
import { createRequest, checkStatus, readResult } from 'projectpulse/lib/delegation';

// Create a delegation
const result = await createRequest({
  parentSession: 'my-session-123',
  sourceCli: 'opencode',
  targetCli: 'auto',
  agent: 'explorer',
  prompt: 'Analyze the authentication flow in this codebase',
  workingDir: process.cwd(),
  timeout: 600 // 10 minutes
});

if (result.ok) {
  const delegationId = result.data.id;
  console.log(`Delegation created: ${delegationId}`);
  
  // Poll for result
  while (true) {
    const status = await checkStatus(delegationId);
    if (status.ok && status.data.status !== 'pending') {
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Read result
  const finalResult = await readResult(delegationId);
  if (finalResult.ok) {
    console.log('Result:', finalResult.data.result);
  }
}
```

## Additional Documentation

- [Delegation Lifecycle](DELEGATION_LIFECYCLE.md) - Detailed delegation state machine
- [Configuration Guide](CONFIGURATION.md) - All configuration options
- [Troubleshooting](TROUBLESHOOTING.md) - Common issues and solutions
- [Architecture](ARCHITECTURE.md) - System architecture and design decisions

## Support

For issues, questions, or contributions, please visit the [GitHub repository](https://github.com/itstanner5216/Project-Pulse-).
