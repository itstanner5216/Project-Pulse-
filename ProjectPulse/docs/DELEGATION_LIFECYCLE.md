# Delegation Lifecycle

This document describes the complete lifecycle of a delegation request in ProjectPulse, from creation to completion or error.

## State Machine

```text
┌─────────┐
│ PENDING │ ─── Request created in pending/ directory
└────┬────┘
     │
     │ Daemon picks up request
     ▼
┌─────────┐
│ RUNNING │ ─── CLI subprocess spawned
└────┬────┘
     │
     │ Process completes or fails
     ▼
┌──────────┬──────────┬──────────┐
│ COMPLETE │  ERROR   │ TIMEOUT  │
└──────────┴──────────┴──────────┘
     │          │          │
     └──────────┴──────────┘
              │
     Result written to complete/
```

## State Descriptions

### 1. PENDING

**When**: Request file created in `pending/` directory  
**Duration**: Until daemon picks it up (typically < 1 second)  
**File Location**: `~/.projectpulse/delegations/pending/{id}.json`

**Request Structure**:
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

**Transitions**:
- → `RUNNING`: Daemon spawns CLI subprocess
- → (none): Request can be cancelled by deleting file

---

### 2. RUNNING

**When**: Daemon has spawned CLI subprocess  
**Duration**: Until subprocess exits or timeout  
**File Location**: Request moved from `pending/` (file is deleted)

**Activities**:
- CLI subprocess executes with agent prompt
- Stdout/stderr captured
- Timeout timer active
- Process can be interrupted by daemon shutdown (graceful)

**Transitions**:
- → `COMPLETE`: Process exits with code 0
- → `ERROR`: Process exits with non-zero code
- → `TIMEOUT`: Process exceeds configured timeout

---

### 3. COMPLETE

**When**: CLI subprocess exits successfully (code 0)  
**Duration**: Permanent (until result file deleted)  
**File Location**: `~/.projectpulse/delegations/complete/{id}.json`

**Result Structure**:
```json
{
  "id": "swift-amber-falcon",
  "status": "complete",
  "result": "Agent output here...",
  "exitCode": 0,
  "durationMs": 12345
}
```

**Final State**: Yes (terminal)

---

### 4. ERROR

**When**: CLI subprocess exits with non-zero code  
**Duration**: Permanent (until result file deleted)  
**File Location**: `~/.projectpulse/delegations/complete/{id}.json`

**Result Structure**:
```json
{
  "id": "swift-amber-falcon",
  "status": "error",
  "result": "Captured stdout/stderr...",
  "error": "Process exited with code 1",
  "exitCode": 1,
  "durationMs": 5432
}
```

**Common Error Scenarios**:
- CLI not found on PATH
- Invalid agent type
- Working directory doesn't exist
- CLI internal error
- Out of memory

**Final State**: Yes (terminal)

---

### 5. TIMEOUT

**When**: Process exceeds configured timeout (default: 15 minutes)  
**Duration**: Permanent (until result file deleted)  
**File Location**: `~/.projectpulse/delegations/complete/{id}.json`

**Result Structure**:
```json
{
  "id": "swift-amber-falcon",
  "status": "timeout",
  "result": "Captured stdout/stderr before timeout...",
  "error": "Process exceeded timeout of 900 seconds",
  "exitCode": -1,
  "durationMs": 900000
}
```

**Timeout Behavior**:
1. Timer starts when subprocess spawns
2. On timeout, `SIGTERM` sent to process
3. After 5 seconds, `SIGKILL` (force kill)
4. Result written with partial output

**Final State**: Yes (terminal)

---

## Filesystem Operations

### Request Creation

```typescript
// 1. Generate unique ID
const id = generateId(); // e.g., "swift-amber-falcon"

// 2. Create request object
const request: DelegationRequest = {
  id,
  parentSession: 'abc123',
  sourceCli: 'opencode',
  targetCli: 'auto',
  agent: 'explorer',
  prompt: 'Analyze code',
  workingDir: process.cwd(),
  status: 'pending',
  createdAt: new Date().toISOString(),
  timeout: 900
};

// 3. Write to pending directory
await fs.writeFile(
  `~/.projectpulse/delegations/pending/${id}.json`,
  JSON.stringify(request, null, 2)
);
```

### Daemon Processing

```typescript
// 1. Watch pending/ directory
watcher.on('add', async (filePath) => {
  // 2. Read request
  const request = JSON.parse(await fs.readFile(filePath));
  
  // 3. Delete from pending
  await fs.unlink(filePath);
  
  // 4. Spawn subprocess
  const proc = spawn(cliCommand, cliArgs, {
    cwd: request.workingDir,
    timeout: request.timeout * 1000
  });
  
  // 5. Capture output
  let output = '';
  proc.stdout.on('data', (data) => output += data);
  proc.stderr.on('data', (data) => output += data);
  
  // 6. Handle completion
  proc.on('close', async (code) => {
    const result: DelegationResult = {
      id: request.id,
      status: code === 0 ? 'complete' : 'error',
      result: output,
      exitCode: code,
      durationMs: Date.now() - startTime,
      error: code !== 0 ? `Process exited with code ${code}` : undefined
    };
    
    // 7. Write result
    await fs.writeFile(
      `~/.projectpulse/delegations/complete/${request.id}.json`,
      JSON.stringify(result, null, 2)
    );
  });
});
```

### Result Reading

```typescript
// 1. Check if result exists
const resultPath = `~/.projectpulse/delegations/complete/${id}.json`;
const exists = await fs.access(resultPath).then(() => true).catch(() => false);

if (!exists) {
  // Check if still pending
  const pendingPath = `~/.projectpulse/delegations/pending/${id}.json`;
  const pendingExists = await fs.access(pendingPath).then(() => true).catch(() => false);
  
  return { status: pendingExists ? 'pending' : 'not_found' };
}

// 2. Read result
const result = JSON.parse(await fs.readFile(resultPath, 'utf-8'));
return result;
```

---

## Timing Considerations

### Typical Timings

| Operation | Typical Duration |
|-----------|-----------------|
| Create request | < 10ms |
| Daemon picks up | < 1 second |
| CLI spawns | 100-500ms |
| Agent execution | 10-300 seconds |
| Result write | < 10ms |

### Timeout Configuration

**Default**: 900 seconds (15 minutes)

**Per-Request Override**:
```typescript
createRequest({
  // ... other fields
  timeout: 600 // 10 minutes for this specific delegation
});
```

**When to Adjust**:
- **Increase**: Large codebase analysis, complex reviews
- **Decrease**: Simple queries, quick checks

---

## Error Handling

### Client-Side Errors (Before PENDING)

```typescript
// Validation errors - never create request file
try {
  await createRequest({
    agent: 'invalid-agent', // ❌ Invalid agent type
  });
} catch (error) {
  // Handle synchronously
}
```

### Daemon-Side Errors (After PENDING)

```typescript
// Process errors - written to result file
const result = await readResult(id);

if (result.ok && result.data.status === 'error') {
  console.error('Delegation failed:', result.data.error);
  console.error('Output:', result.data.result);
}
```

### Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `Working directory does not exist` | Invalid workingDir path | Use absolute path, verify existence |
| `Invalid agent type` | Unknown agent | Use: explorer, reviewer, performance, architect, planner |
| `CLI not found: opencode` | CLI not installed | Install CLI or use `targetCli: 'auto'` |
| `Process exceeded timeout` | Long-running task | Increase timeout or optimize task |
| `Permission denied` | No execute permission | Check file permissions |

---

## Advanced Scenarios

### Daemon Shutdown During RUNNING

If daemon receives SIGTERM/SIGINT while processing:

1. **Graceful**: Wait up to 30 seconds for active delegation
2. **Force**: After 30s, SIGKILL active subprocess
3. **Result**: Partial output written with error status

```json
{
  "id": "swift-amber-falcon",
  "status": "error",
  "result": "Partial output before daemon shutdown...",
  "error": "Daemon shutdown interrupted processing",
  "exitCode": -1,
  "durationMs": 12345
}
```

### Multiple Delegations

Daemon processes delegations **sequentially** (one at a time):


This prevents resource contention and ensures stable execution.

### Request Cancellation

While request is **PENDING**:
```bash
# Delete request file
rm ~/.projectpulse/delegations/pending/{id}.json
```

While request is **RUNNING**:
```bash
# Cannot cancel directly - must stop daemon
projectpulse daemon stop
```

---

## Observability

### Logs

Daemon logs all lifecycle events:

```text
[2026-01-28T05:00:00.000Z] Daemon started
[2026-01-28T05:00:01.000Z] Processing delegation: swift-amber-falcon
[2026-01-28T05:00:02.000Z] Spawning CLI: opencode with agent: explorer
[2026-01-28T05:00:15.000Z] Delegation complete: swift-amber-falcon (12345ms)
```

**Log Location**: `~/.projectpulse/delegations/logs/daemon.log`

### Status Checks

```bash
# List all delegations
projectpulse delegation list

# Check specific delegation
projectpulse delegation read {id}
```

---

## Best Practices

1. **Use Auto-Detection**: Set `targetCli: 'auto'` unless specific CLI required
2. **Set Reasonable Timeouts**: Default 15min is generous; reduce for simple tasks
3. **Check Status**: Always verify delegation completed before reading result
4. **Handle Errors**: Check `result.status` and handle error/timeout cases
5. **Clean Up**: Delete old result files to prevent disk usage growth
6. **Monitor Daemon**: Check daemon logs if delegations hang or fail frequently

---

## See Also

- [Configuration Guide](CONFIGURATION.md) - Timeout and directory configuration
- [Troubleshooting](TROUBLESHOOTING.md) - Common issues and debugging
- [API Reference](README.md) - Full API documentation
