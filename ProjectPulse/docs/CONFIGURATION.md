# Configuration Guide

This document describes all configuration options available in ProjectPulse.

## Environment Variables

### PROJECTPULSE_DELEGATIONS_DIR

**Description**: Override the default delegations directory  
**Default**: `~/.projectpulse/delegations`  
**Type**: String (absolute or relative path with `~` support)

**Usage**:
```bash
# Use custom directory
export PROJECTPULSE_DELEGATIONS_DIR="~/my-delegations"
projectpulse daemon start

# Use absolute path
export PROJECTPULSE_DELEGATIONS_DIR="/var/lib/projectpulse"
projectpulse daemon start
```

**Use Cases**:
- **Multi-user systems**: Separate delegations per user
- **Network storage**: Store delegations on NFS/SMB mount
- **Testing**: Isolate test delegations from production
- **Debugging**: Keep old delegations separate while debugging

---

### PROJECTPULSE_SESSION_ID

**Description**: Parent session context identifier  
**Default**: None (optional)  
**Type**: String (any identifier)

**Usage**:
```bash
export PROJECTPULSE_SESSION_ID="my-session-123"
projectpulse delegate "Analyze code"
```

**Purpose**:
- Track which CLI session created each delegation
- Group related delegations together
- Useful for debugging and auditing

**Example**:
```typescript
const request = await createRequest({
  parentSession: process.env.PROJECTPULSE_SESSION_ID || 'unknown',
  // ... other fields
});
```

---

### CLI_NAME

**Description**: Source CLI identifier  
**Default**: None (auto-detected if possible)  
**Type**: String (opencode | codex | gemini | claude)

**Usage**:
```bash
export CLI_NAME="opencode"
projectpulse delegate "Review code"
```

**Purpose**:
- Identify which CLI created the delegation
- Useful when multiple CLIs share same delegations directory

---

## Request-Level Configuration

### timeout

**Description**: Maximum execution time in seconds  
**Default**: `900` (15 minutes)  
**Type**: Number (seconds)  
**Range**: 1 - 3600 (1 second to 1 hour)

**Usage**:
```typescript
await createRequest({
  // ... other fields
  timeout: 600 // 10 minutes
});
```

**CLI Usage**:
```bash
projectpulse delegate "Quick check" --timeout 60
```

**Timeout Behavior**:
1. Timer starts when subprocess spawns
2. On timeout, `SIGTERM` sent to process
3. After 5 seconds, `SIGKILL` sent (force kill)
4. Result written with `status: 'timeout'`

**Recommendations**:

| Task Type | Recommended Timeout |
|-----------|-------------------|
| Simple query | 60-120 seconds |
| Code review | 300-600 seconds |
| Full codebase analysis | 900-1800 seconds |
| Performance testing | 300-900 seconds |

---

### workingDir

**Description**: Project root directory for CLI execution  
**Default**: `process.cwd()` (current directory)  
**Type**: String (absolute path)

**Usage**:
```typescript
await createRequest({
  // ... other fields
  workingDir: '/path/to/my/project'
});
```

**CLI Usage**:
```bash
cd /path/to/project
projectpulse delegate "Analyze this project"
# workingDir automatically set to current directory
```

**Validation**:
- Must be an existing directory
- Must be absolute path (relative paths resolved)
- Cannot be system directory (`/root`, `/etc`, `/sys`, `/proc`, `/dev`)

---

### targetCli

**Description**: Which CLI to use for execution  
**Default**: None (must be specified)  
**Type**: `'opencode' | 'codex' | 'gemini' | 'claude' | 'auto'`

**Usage**:
```typescript
await createRequest({
  // ... other fields
  targetCli: 'auto' // Recommended
});
```

**CLI Usage**:
```bash
# Auto-detect available CLI
projectpulse delegate "Analyze code" --cli auto

# Use specific CLI
projectpulse delegate "Analyze code" --cli opencode
```

**Auto-Detection Order**:
1. `opencode` (checks for `opencode` command)
2. `codex` (checks for `codex` command)
3. `gemini` (checks for `gemini` command)
4. `claude` (checks for `claude` command)

**Recommendation**: Always use `'auto'` unless you have specific CLI requirements.

---

### agent

**Description**: Which specialized agent to use  
**Default**: None (must be specified)  
**Type**: `'explorer' | 'reviewer' | 'performance' | 'architect' | 'planner'`

**Options**:

| Agent | Purpose | Best For |
|-------|---------|----------|
| `explorer` | Codebase cartography (A.T.L.A.S.) | Understanding project structure, finding files |
| `reviewer` | Risk-driven code review | Security analysis, code quality checks |
| `performance` | Static performance analysis | Identifying bottlenecks, optimization opportunities |
| `architect` | Cost/efficiency review | Architecture decisions, scalability analysis |
| `planner` | Task decomposition | Breaking down large tasks, creating plans |

**Usage**:
```typescript
await createRequest({
  // ... other fields
  agent: 'explorer'
});
```

**CLI Usage**:
```bash
projectpulse delegate "Find authentication code" --agent explorer
projectpulse delegate "Review for security issues" --agent reviewer
projectpulse delegate "Analyze performance" --agent performance
```

---

## Daemon Configuration

### PID File Location

**Path**: `{DELEGATIONS_DIR}/daemon.pid`  
**Purpose**: Stores daemon process ID  
**Format**: Plain text with single integer

**Example**:
```
12345
```

**Usage**:
- Check if daemon is running
- Send signals to daemon (SIGTERM for shutdown)

---

### Log File Location

**Path**: `{DELEGATIONS_DIR}/logs/daemon.log`  
**Purpose**: Daemon activity log  
**Format**: Line-delimited with timestamps

**Example**:
```
[2026-01-28T05:00:00.000Z] Daemon started
[2026-01-28T05:00:01.000Z] Processing delegation: swift-amber-falcon
[2026-01-28T05:00:15.000Z] Delegation complete: swift-amber-falcon (12345ms)
```

**Log Rotation**: Not automatic (manual cleanup required)

---

## Directory Structure

### Default Layout

```
~/.projectpulse/delegations/
├── pending/          # Pending delegation requests
├── complete/         # Completed results
├── logs/             # Daemon logs
│   └── daemon.log
└── daemon.pid        # Daemon process ID
```

### Custom Directory

```bash
export PROJECTPULSE_DELEGATIONS_DIR="/custom/path"
```

Creates:
```
/custom/path/
├── pending/
├── complete/
├── logs/
│   └── daemon.log
└── daemon.pid
```

---

## File Formats

### Delegation Request

**Location**: `{DELEGATIONS_DIR}/pending/{id}.json`  
**Format**: JSON

```json
{
  "id": "swift-amber-falcon",
  "parentSession": "abc123",
  "sourceCli": "opencode",
  "targetCli": "auto",
  "agent": "explorer",
  "prompt": "Analyze this codebase",
  "workingDir": "/path/to/project",
  "status": "pending",
  "createdAt": "2026-01-28T05:00:00.000Z",
  "timeout": 900
}
```

### Delegation Result

**Location**: `{DELEGATIONS_DIR}/complete/{id}.json`  
**Format**: JSON

```json
{
  "id": "swift-amber-falcon",
  "status": "complete",
  "result": "Agent output here...",
  "exitCode": 0,
  "durationMs": 12345
}
```

**With Error**:
```json
{
  "id": "swift-amber-falcon",
  "status": "error",
  "result": "Stdout/stderr output...",
  "error": "Process exited with code 1",
  "exitCode": 1,
  "durationMs": 5432
}
```

---

## Advanced Configuration

### Custom Agent Prompts

Agent prompts are loaded from the `agentprompts/` directory in the project root.

**Default Locations**:

**Customization**:
1. Copy agent file to your project's `agentprompts/` directory
2. Modify as needed
3. Daemon will use project-local version if found

---

### Multiple Users

**Scenario**: Multiple users on same system want separate delegations.

**Solution 1**: Per-user directories (automatic with default `~/.projectpulse`)
```bash
# User 1
export PROJECTPULSE_DELEGATIONS_DIR="~/.projectpulse/delegations"

# User 2
export PROJECTPULSE_DELEGATIONS_DIR="~/.projectpulse/delegations"
# Both use ~ which expands to their home directory
```

**Solution 2**: Shared directory with user prefixes
```bash
# User 1
export PROJECTPULSE_DELEGATIONS_DIR="/shared/delegations/user1"

# User 2
export PROJECTPULSE_DELEGATIONS_DIR="/shared/delegations/user2"
```

**Solution 3**: Systemd service with dynamic users
```ini
[Service]
User=%i
Environment="PROJECTPULSE_DELEGATIONS_DIR=/var/lib/projectpulse/%i"
ExecStart=/usr/bin/pulse-agents daemon start
```

---

### Network Storage

**Use Case**: Share delegations across multiple machines.

**NFS Example**:
```bash
# Mount NFS
mount -t nfs server:/export/projectpulse /mnt/projectpulse

# Configure ProjectPulse
export PROJECTPULSE_DELEGATIONS_DIR="/mnt/projectpulse/delegations"
projectpulse daemon start
```

**Considerations**:
- File locking may not work reliably on NFS
- Daemon should run on only ONE machine
- Clients can be on multiple machines

---

### Docker/Container Deployment

**Dockerfile Example**:
```dockerfile
FROM node:18

# Install ProjectPulse
RUN npm install -g projectpulse

# Configure delegations directory
ENV PROJECTPULSE_DELEGATIONS_DIR=/data/delegations

# Create volume for persistent storage
VOLUME ["/data/delegations"]

# Start daemon
CMD ["pulse-agents", "daemon", "start"]
```

**Docker Compose**:
```yaml
version: '3.8'
services:
  projectpulse:
    image: projectpulse:latest
    volumes:
      - delegations:/data/delegations
    environment:
      - PROJECTPULSE_DELEGATIONS_DIR=/data/delegations

volumes:
  delegations:
```

---

## Performance Tuning

### Reduce Delegation Latency

**Problem**: Delegations take too long to start.

**Solutions**:
1. Keep daemon running (don't start/stop frequently)
2. Use SSD for delegations directory
3. Reduce file system overhead (local disk vs network)

### Handle High Volume

**Problem**: Many delegations queuing up.

**Current Behavior**: Daemon processes one delegation at a time.

**Solutions**:
1. Run multiple daemon instances with separate directories
2. Use faster CLIs for simple tasks
3. Reduce timeout for quick-failing tasks

---

## Security Configuration

### Restrict Working Directories

**Built-in Protection**: Cannot use system directories:
- `/root`
- `/etc`
- `/sys`
- `/proc`
- `/dev`

**Additional Restriction** (application level):
```typescript
const ALLOWED_DIRS = ['/home', '/projects'];

function validateWorkingDir(dir: string): boolean {
  const absPath = path.resolve(dir);
  return ALLOWED_DIRS.some(allowed => absPath.startsWith(allowed));
}
```

### File Permissions

**Recommendation**:
```bash
# Delegations directory should be user-private
chmod 700 ~/.projectpulse/delegations

# Request/result files
chmod 600 ~/.projectpulse/delegations/pending/*.json
chmod 600 ~/.projectpulse/delegations/complete/*.json
```

---

## See Also

- [Delegation Lifecycle](DELEGATION_LIFECYCLE.md) - State machine and transitions
- [Troubleshooting](TROUBLESHOOTING.md) - Common configuration issues
- [Architecture](ARCHITECTURE.md) - Design decisions behind configuration
- [API Reference](README.md) - Programmatic configuration
