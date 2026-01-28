# Troubleshooting Guide

This guide helps you diagnose and fix common issues with ProjectPulse.

## Table of Contents

- [Daemon Issues](#daemon-issues)
- [Delegation Issues](#delegation-issues)
- [CLI Detection Issues](#cli-detection-issues)
- [Timeout Issues](#timeout-issues)
- [Performance Issues](#performance-issues)
- [File System Issues](#file-system-issues)
- [Debugging Tips](#debugging-tips)

---

## Daemon Issues

### Daemon Won't Start

**Symptom**: `projectpulse daemon start` fails or exits immediately.

**Diagnosis**:
```bash
# Check if daemon is already running
projectpulse daemon status

# Check for error in logs
cat ~/.projectpulse/delegations/logs/daemon.log

# Check permissions
ls -la ~/.projectpulse/delegations/
```

**Common Causes & Solutions**:

| Cause | Solution |
|-------|----------|
| Daemon already running | Use `projectpulse daemon stop` first |
| Permission denied | `chmod 700 ~/.projectpulse/delegations` |
| Disk full | Free up disk space |
| Invalid directory | Check `PROJECTPULSE_DELEGATIONS_DIR` |

---

### Daemon Stops Unexpectedly

**Symptom**: Daemon running, then stops without manual intervention.

**Diagnosis**:
```bash
# Check logs for errors
tail -n 50 ~/.projectpulse/delegations/logs/daemon.log

# Check system logs
journalctl -u projectpulse # If running as systemd service
dmesg | grep -i kill       # Check for OOM killer
```

**Common Causes**:

1. **Out of Memory (OOM)**
   - **Symptom**: Daemon killed by system
   - **Log**: `dmesg` shows OOM killer
   - **Solution**: Reduce concurrent delegations, increase system RAM

2. **Unhandled Exception**
   - **Symptom**: Daemon crashes on error
   - **Log**: Stack trace in `daemon.log`
   - **Solution**: Report bug with stack trace

3. **File System Error**
   - **Symptom**: Cannot read/write delegation files
   - **Log**: `ENOSPC` (disk full) or `EACCES` (permission denied)
   - **Solution**: Free disk space, fix permissions

---

### Daemon Status Shows Wrong PID

**Symptom**: `projectpulse daemon status` shows PID, but process doesn't exist.

**Diagnosis**:
```bash
# Check if PID exists
ps aux | grep $(cat ~/.projectpulse/delegations/daemon.pid)

# Check PID file
cat ~/.projectpulse/delegations/daemon.pid
```

**Solution**:
```bash
# Remove stale PID file
rm ~/.projectpulse/delegations/daemon.pid

# Start daemon fresh
projectpulse daemon start
```

**Prevention**: This is automatically handled by `isRunning()` function (checks process existence with `kill -0`).

---

## Delegation Issues

### Delegation Stuck in PENDING

**Symptom**: Delegation created, but never moves to RUNNING or COMPLETE.

**Diagnosis**:
```bash
# Check daemon status
projectpulse daemon status

# List pending delegations
ls -la ~/.projectpulse/delegations/pending/

# Check daemon logs
tail -f ~/.projectpulse/delegations/logs/daemon.log
```

**Common Causes**:

| Cause | Solution |
|-------|----------|
| Daemon not running | `projectpulse daemon start` |
| File watcher not working | Check daemon logs for watcher errors |
| Permission denied | `chmod 600 pending/*.json` |
| Another delegation running | Wait for current delegation to complete |

**Workaround**: Restart daemon to trigger re-scan.

---

### Delegation Immediately Goes to ERROR

**Symptom**: Delegation created, moves to ERROR within seconds.

**Diagnosis**:
```bash
# Read error result
projectpulse delegation read <delegation-id>

# Check logs
tail ~/.projectpulse/delegations/logs/daemon.log
```

**Common Errors**:

#### 1. "Working directory does not exist"

```bash
# Check directory
ls -la /path/to/workingDir
```

**Solution**: Use absolute path, verify directory exists.

#### 2. "Invalid agent type"

```bash
# List valid agents
projectpulse delegate --help
```

**Valid agents**: explorer, reviewer, performance, architect, planner

#### 3. "CLI not found: <cli-name>"

```bash
# Check if CLI is installed
which opencode
which codex
which gemini
which claude
```

**Solution**: Install CLI or use `--cli auto`.

#### 4. "Working directory is in restricted path"

**Cause**: Trying to use system directory (`/root`, `/etc`, etc.)

**Solution**: Use project directory, not system directory.

---

### Delegation Completes But Result is Empty

**Symptom**: Delegation shows `status: 'complete'` but `result` field is empty.

**Diagnosis**:
```bash
# Read result
projectpulse delegation read <delegation-id>

# Check result file directly
cat ~/.projectpulse/delegations/complete/<delegation-id>.json
```

**Common Causes**:

1. **Agent produced no output**
   - CLI ran successfully but agent didn't write anything
   - **Solution**: Check agent prompt, may need modification

2. **Output was sent to stderr**
   - Some CLIs write to stderr instead of stdout
   - **Solution**: Both stdout and stderr are captured, check full result

---

## CLI Detection Issues

### Auto-Detection Fails

**Symptom**: `targetCli: 'auto'` results in error "No CLI found on system".

**Diagnosis**:
```bash
# Check which CLIs are available
which opencode
which codex
which gemini
which claude

# Check PATH
echo $PATH
```

**Solution**:

1. **Install at least one CLI**
   ```bash
   npm install -g opencode  # Example
   ```

2. **Add CLI to PATH**
   ```bash
   export PATH="$PATH:/path/to/cli"
   ```

3. **Use specific CLI instead of auto**
   ```bash
   projectpulse delegate "Task" --cli opencode
   ```

---

### Specific CLI Not Detected

**Symptom**: CLI installed but ProjectPulse can't find it.

**Diagnosis**:
```bash
# Verify CLI works
opencode --version

# Check which returns path
which opencode
```

**Common Causes**:

1. **CLI not in PATH**
   - **Solution**: Add to PATH or create symlink
   ```bash
   ln -s /opt/opencode/bin/opencode /usr/local/bin/opencode
   ```

2. **CLI name mismatch**
   - **Symptom**: CLI has different executable name
   - **Solution**: Create wrapper script
   ```bash
   #!/bin/bash
   # /usr/local/bin/opencode
   exec /opt/my-cli/run "$@"
   ```

---

## Timeout Issues

### Delegation Always Times Out

**Symptom**: Every delegation reaches timeout, even simple tasks.

**Diagnosis**:
```bash
# Read result to see timeout
projectpulse delegation read <delegation-id>

# Check daemon logs for actual execution time
grep <delegation-id> ~/.projectpulse/delegations/logs/daemon.log
```

**Common Causes**:

1. **Timeout too short**
   - **Solution**: Increase timeout
   ```bash
   projectpulse delegate "Task" --timeout 1800  # 30 minutes
   ```

2. **CLI hangs waiting for input**
   - **Symptom**: Process never exits
   - **Solution**: Check CLI configuration, may need non-interactive mode

3. **Infinite loop in agent**
   - **Symptom**: Agent keeps running forever
   - **Solution**: Review agent prompt, may have logical error

---

### Timeout Not Working (Process Keeps Running)

**Symptom**: Delegation marked as timeout, but process still running.

**Diagnosis**:
```bash
# Check for zombie processes
ps aux | grep <cli-name>

# Check daemon logs
grep "force kill" ~/.projectpulse/delegations/logs/daemon.log
```

**Explanation**: 
- `SIGTERM` sent at timeout
- `SIGKILL` sent 5 seconds later
- Some processes may ignore SIGTERM

**Solution**: Daemon will force-kill after 5 seconds. If process still running, it's a bug - please report.

---

## Performance Issues

### Delegations Take Too Long to Start

**Symptom**: Long delay between creating delegation and daemon picking it up.

**Diagnosis**:
```bash
# Check daemon logs for timing
grep "Processing delegation" ~/.projectpulse/delegations/logs/daemon.log
```

**Common Causes**:

1. **File watcher lag**
   - **Cause**: File system latency (network drive, slow disk)
   - **Solution**: Use local SSD for delegations directory

2. **Polling mode active**
   - **Cause**: File watcher failed, using polling fallback (5-second interval)
   - **Log**: "Falling back to polling mode"
   - **Solution**: Fix file system issues, restart daemon

---

### High CPU Usage

**Symptom**: Daemon or CLI subprocess uses 100% CPU.

**Diagnosis**:
```bash
# Check CPU usage
top -p $(cat ~/.projectpulse/delegations/daemon.pid)

# Check running delegations
ps aux | grep opencode
```

**Common Causes**:

1. **Agent task is CPU-intensive**
   - **Example**: Analyzing large codebase
   - **Solution**: Normal behavior, wait for completion

2. **Infinite loop in agent**
   - **Symptom**: CPU stays at 100% for entire timeout period
   - **Solution**: Review agent prompt, reduce timeout

---

### High Memory Usage

**Symptom**: Daemon or CLI subprocess uses excessive RAM.

**Diagnosis**:
```bash
# Check memory usage
ps aux | grep pulse-agents

# Check available memory
free -h
```

**Solution**:

1. **Increase system RAM** (if frequently hitting limit)
2. **Reduce concurrent delegations** (daemon processes one at a time by design)
3. **Use smaller context** (agent may be loading large files)

---

## File System Issues

### Permission Denied Errors

**Symptom**: Errors like `EACCES: permission denied`.

**Diagnosis**:
```bash
# Check directory permissions
ls -la ~/.projectpulse/delegations/

# Check file permissions
ls -la ~/.projectpulse/delegations/pending/
```

**Solution**:
```bash
# Fix directory permissions
chmod 700 ~/.projectpulse/delegations/
chmod 700 ~/.projectpulse/delegations/pending/
chmod 700 ~/.projectpulse/delegations/complete/
chmod 700 ~/.projectpulse/delegations/logs/

# Fix file permissions
chmod 600 ~/.projectpulse/delegations/daemon.pid
chmod 600 ~/.projectpulse/delegations/logs/daemon.log
chmod 600 ~/.projectpulse/delegations/pending/*.json
chmod 600 ~/.projectpulse/delegations/complete/*.json
```

---

### Disk Full Errors

**Symptom**: `ENOSPC: no space left on device`.

**Diagnosis**:
```bash
# Check disk usage
df -h ~/.projectpulse/

# Check delegation directory size
du -sh ~/.projectpulse/delegations/
```

**Solution**:

1. **Clean up old results**
   ```bash
   # Remove results older than 7 days
   find ~/.projectpulse/delegations/complete/ -name "*.json" -mtime +7 -delete
   ```

2. **Truncate daemon log**
   ```bash
   # Keep last 10000 lines
   tail -n 10000 ~/.projectpulse/delegations/logs/daemon.log > /tmp/daemon.log
   mv /tmp/daemon.log ~/.projectpulse/delegations/logs/daemon.log
   ```

3. **Move delegations directory**
   ```bash
   export PROJECTPULSE_DELEGATIONS_DIR="/path/with/more/space"
   ```

---

## Debugging Tips

### Enable Verbose Logging

**Daemon**:
```bash
# Add debug logging to daemon (requires code modification)
# Set DEBUG=true environment variable if supported
```

**CLI**:
```bash
# Most CLIs have verbose flags
opencode --verbose <args>
```

---

### Manual Delegation Testing

**Create delegation manually**:
```bash
cat > ~/.projectpulse/delegations/pending/test-delegation.json << EOF
{
  "id": "test-delegation",
  "parentSession": "test",
  "sourceCli": "opencode",
  "targetCli": "opencode",
  "agent": "explorer",
  "prompt": "List files in current directory",
  "workingDir": "$(pwd)",
  "status": "pending",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)",
  "timeout": 60
}
EOF

# Watch daemon pick it up
tail -f ~/.projectpulse/delegations/logs/daemon.log

# Check result
cat ~/.projectpulse/delegations/complete/test-delegation.json
```

---

### Capture CLI Output

**Run CLI manually**:
```bash
# Test what daemon would run
cd /path/to/workingDir
opencode --system-file agentprompts/ExplorationAgent.md \
  --prompt "Your task here" \
  2>&1 | tee output.log
```

---

### Check File Watcher

**Test file watcher**:
```bash
# Create test file
touch ~/.projectpulse/delegations/pending/test.json

# Check daemon logs immediately
tail ~/.projectpulse/delegations/logs/daemon.log

# Should see "Processing delegation: test"
```

If no response, file watcher may be broken (check logs for "Falling back to polling mode").

---

### Trace System Calls

**Advanced debugging**:
```bash
# Linux: strace daemon
strace -f -e trace=file pulse-agents daemon start

# macOS: dtruss daemon (requires sudo)
sudo dtruss pulse-agents daemon start
```

---

## Common Error Messages

| Error | Meaning | Solution |
|-------|---------|----------|
| `Working directory does not exist` | Invalid workingDir path | Use absolute path, verify exists |
| `Working directory is not a directory` | workingDir points to file | Use directory path |
| `Working directory is in restricted path` | Trying to use /root, /etc, etc. | Use project directory |
| `Invalid agent type` | Unknown agent name | Use: explorer, reviewer, performance, architect, planner |
| `CLI not found: <cli>` | CLI not installed or not in PATH | Install CLI or use `--cli auto` |
| `Process exceeded timeout` | Execution took too long | Increase timeout or optimize task |
| `No CLI found on system` | No supported CLI installed | Install opencode, codex, gemini, or claude |
| `Daemon already running` | Daemon PID file exists | Use `daemon stop` first |
| `Permission denied` | Insufficient file permissions | Fix permissions (see above) |
| `ENOSPC: no space left` | Disk full | Free disk space, clean old results |

---

## Getting Help

If you've tried these troubleshooting steps and still have issues:

1. **Check daemon logs**:
   ```bash
   cat ~/.projectpulse/delegations/logs/daemon.log
   ```

2. **Gather diagnostic info**:
   ```bash
   # System info
   uname -a
   node --version
   npm list -g projectpulse
   
   # Daemon status
   projectpulse daemon status
   
   # List delegations
   projectpulse delegation list
   
   # Recent logs
   tail -n 100 ~/.projectpulse/delegations/logs/daemon.log
   ```

3. **Report bug** with:
   - Error message
   - Relevant logs
   - Steps to reproduce
   - System information

---

## See Also

- [Configuration Guide](CONFIGURATION.md) - All configuration options
- [Delegation Lifecycle](DELEGATION_LIFECYCLE.md) - Understanding delegation states
- [Architecture](ARCHITECTURE.md) - How ProjectPulse works internally
- [API Reference](README.md) - Full API documentation
