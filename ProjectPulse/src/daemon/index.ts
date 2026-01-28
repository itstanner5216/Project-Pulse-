/**
 * Background delegation daemon.
 *
 * Runs as a background process, watching for pending delegation requests
 * and spawning CLI subprocesses to handle them.
 *
 * Usage:
 *   projectpulse daemon start    # Start daemon
 *   projectpulse daemon stop     # Stop daemon
 *   projectpulse daemon status   # Check if running
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { DelegationWatcher } from './watcher';
import { getDelegationsDir } from '../lib/delegation/storage';

// ============================================================================
// Constants
// ============================================================================

const PID_FILE = 'daemon.pid';
const LOG_FILE = 'daemon.log';

// ============================================================================
// Logging
// ============================================================================

function getLogPath(): string {
    return path.join(getDelegationsDir(), 'logs', LOG_FILE);
}

function getPidPath(): string {
    return path.join(getDelegationsDir(), PID_FILE);
}

async function log(message: string): Promise<void> {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}\n`;

    try {
        const logPath = getLogPath();
        await fs.mkdir(path.dirname(logPath), { recursive: true });
        await fs.appendFile(logPath, line);
    } catch {
        // Fall back to console
        console.log(line.trim());
    }
}

// ============================================================================
// PID Management
// ============================================================================

async function writePid(): Promise<void> {
    const pidPath = getPidPath();
    await fs.mkdir(path.dirname(pidPath), { recursive: true });
    await fs.writeFile(pidPath, String(process.pid));
}

async function readPid(): Promise<number | null> {
    try {
        const content = await fs.readFile(getPidPath(), 'utf-8');
        return parseInt(content.trim(), 10);
    } catch {
        return null;
    }
}

async function removePid(): Promise<void> {
    try {
        await fs.unlink(getPidPath());
    } catch {
        // Ignore
    }
}

/**
 * Check if the daemon is already running.
 * 
 * This function uses `process.kill(pid, 0)` to check process existence.
 * On POSIX systems, this can return different error codes:
 * - ESRCH: Process doesn't exist (we clean up stale PID file)
 * - EPERM: Process exists but is owned by another user (daemon is running)
 * 
 * This distinction is important in multi-user scenarios where the daemon
 * might be running as a different user (e.g., root vs regular user).
 */
export async function isRunning(): Promise<boolean> {
    const pid = await readPid();
    if (!pid) return false;

    try {
        // Send signal 0 to check if process exists
        process.kill(pid, 0);
        return true;
    } catch (error) {
        const err = error as NodeJS.ErrnoException;
        
        if (err.code === 'ESRCH') {
            // Process doesn't exist - clean up stale PID file
            await removePid();
            return false;
        } else if (err.code === 'EPERM') {
            // Process exists but we don't have permission to signal it
            // This means daemon IS running (just owned by another user)
            return true;
        } else {
            // Unexpected error - clean up and assume not running for safety
            await removePid();
            return false;
        }
    }
}

// ============================================================================
// Daemon Functions
// ============================================================================

let watcher: DelegationWatcher | null = null;

/**
 * Start the daemon.
 */
export async function startDaemon(): Promise<void> {
    if (await isRunning()) {
        console.log('Daemon is already running');
        return;
    }

    await log('Daemon starting...');
    await writePid();

    watcher = new DelegationWatcher({
        onPickup: (request) => {
            log(`Picked up: ${request.id} (agent: ${request.agent})`);
        },
        onComplete: (result) => {
            log(`Completed: ${result.id} (status: ${result.status}, duration: ${result.durationMs}ms)`);
        },
        onError: (error, id) => {
            log(`Error${id ? ` (${id})` : ''}: ${error.message}`);
        },
    });

    // Handle shutdown signals
    const shutdown = async () => {
        await log('Daemon shutting down...');
        watcher?.stop();
        await removePid();
        process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    process.on('SIGHUP', shutdown);

    await watcher.start();
    await log('Daemon started, watching for delegations');

    console.log(`Delegation daemon started (PID: ${process.pid})`);
    console.log(`Log file: ${getLogPath()}`);
}

/**
 * Stop the daemon.
 */
export async function stopDaemon(): Promise<boolean> {
    const pid = await readPid();

    if (!pid) {
        console.log('Daemon is not running');
        return false;
    }

    try {
        process.kill(pid, 'SIGTERM');
        console.log(`Sent SIGTERM to daemon (PID: ${pid})`);

        // Wait a moment then verify
        await new Promise((r) => setTimeout(r, 1000));

        if (await isRunning()) {
            process.kill(pid, 'SIGKILL');
            console.log('Force killed daemon');
        }

        await removePid();
        return true;
    } catch (error) {
        console.log(`Failed to stop daemon: ${error}`);
        await removePid();
        return false;
    }
}

/**
 * Get daemon status.
 */
export async function getDaemonStatus(): Promise<{
    running: boolean;
    pid: number | null;
    logPath: string;
}> {
    const running = await isRunning();
    const pid = running ? await readPid() : null;

    return {
        running,
        pid,
        logPath: getLogPath(),
    };
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main(): Promise<void> {
    const command = process.argv[2];

    switch (command) {
        case 'start':
            await startDaemon();
            break;

        case 'stop':
            await stopDaemon();
            break;

        case 'status': {
            const status = await getDaemonStatus();
            if (status.running) {
                console.log(`Daemon is running (PID: ${status.pid})`);
            } else {
                console.log('Daemon is not running');
            }
            console.log(`Log: ${status.logPath}`);
            break;
        }

        case 'foreground':
            // Run in foreground (for debugging)
            await startDaemon();
            // Keep process alive
            await new Promise(() => { });
            break;

        default:
            console.log('Usage: pulse-agents <start|stop|status|foreground>');
            process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    main().catch((err) => {
        console.error('Daemon error:', err);
        process.exit(1);
    });
}
