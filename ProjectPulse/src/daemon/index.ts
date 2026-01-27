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

/**
 * Atomically write the PID file to claim daemon ownership.
 * 
 * Uses the 'wx' flag for exclusive file creation, which provides atomic
 * locking semantics. If multiple processes try to start the daemon
 * simultaneously, only one will succeed in creating the PID file.
 * 
 * @returns true if PID file was successfully created (daemon claimed),
 *          false if PID file already exists (another daemon is running)
 * @throws Error for unexpected filesystem errors (not EEXIST)
 */
async function writePid(): Promise<boolean> {
    const pidPath = getPidPath();
    await fs.mkdir(path.dirname(pidPath), { recursive: true });
    
    try {
        // Use 'wx' flag for exclusive create - fails if file exists
        // This provides atomic test-and-set semantics
        const handle = await fs.open(pidPath, 'wx');
        await handle.writeFile(String(process.pid));
        await handle.close();
        return true; // Successfully claimed daemon ownership
    } catch (error) {
        // Check if file already exists (another daemon is running)
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
            return false; // Already claimed by another process
        }
        // Re-throw unexpected errors
        throw error;
    }
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
 */
export async function isRunning(): Promise<boolean> {
    const pid = await readPid();
    if (!pid) return false;

    try {
        // Send signal 0 to check if process exists
        process.kill(pid, 0);
        return true;
    } catch {
        // Process doesn't exist, clean up stale PID file
        await removePid();
        return false;
    }
}

// ============================================================================
// Daemon Functions
// ============================================================================

let watcher: DelegationWatcher | null = null;

/**
 * Start the daemon.
 * 
 * Uses atomic PID file creation to prevent race conditions when multiple
 * processes try to start the daemon simultaneously.
 */
export async function startDaemon(): Promise<void> {
    await log('Daemon starting...');
    
    // Atomically claim daemon ownership via PID file
    // This replaces the race-prone isRunning() check
    const claimed = await writePid();
    
    if (!claimed) {
        console.log('Daemon is already running');
        return;
    }

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
