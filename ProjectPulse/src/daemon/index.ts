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
import { initLogger, getLogger, Logger } from '../lib/logger';

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

/**
 * Initialize the daemon logger with structured logging.
 */
function initDaemonLogger(): Logger {
    return initLogger({
        logPath: getLogPath(),
        minLevel: process.env.LOG_LEVEL as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' || 'INFO',
        format: process.env.LOG_FORMAT === 'json' ? 'json' : 'text',
        maxSize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
    });
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
 * Start the delegation daemon if it is not already running.
 *
 * Creates and writes the daemon PID file, instantiates and starts a DelegationWatcher
 * with logging callbacks, and registers signal handlers to perform a graceful shutdown.
 */
export async function startDaemon(): Promise<void> {
    if (await isRunning()) {
        console.log('Daemon is already running');
        return;
    }

    // Initialize structured logger
    const logger = initDaemonLogger();
    
    logger.info('Daemon starting...', undefined, { pid: process.pid });
    await writePid();

    watcher = new DelegationWatcher({
        onPickup: (request) => {
            logger.info(
                `Picked up delegation request for ${request.agent} agent`,
                request.id,
                { 
                    agent: request.agent,
                    prompt: request.prompt.substring(0, 100),
                    workingDir: request.workingDir,
                }
            );
        },
        onComplete: (result) => {
            logger.info(
                `Delegation completed with status: ${result.status}`,
                result.id,
                { 
                    status: result.status,
                    durationMs: result.durationMs,
                    exitCode: result.exitCode,
                }
            );
        },
        onError: (error, id) => {
            logger.error(
                `Delegation processing failed: ${error.message}`,
                id,
                error,
                { operation: 'delegation_processing' }
            );
        },
    });

    // Handle shutdown signals
    const shutdown = async () => {
        logger.info('Daemon received shutdown signal, stopping gracefully...');
        watcher?.stop();
        await removePid();
        logger.info('Daemon shutdown complete');
        process.exit(0);
    };

    process.on('SIGTERM', () => void shutdown());
    process.on('SIGINT', () => void shutdown());
    process.on('SIGHUP', () => void shutdown());

    await watcher.start();
    logger.info('Daemon started successfully, watching for delegations', undefined, {
        logPath: getLogPath(),
        pidPath: getPidPath(),
    });

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
            console.log('Daemon did not stop gracefully, sending SIGKILL');
            process.kill(pid, 'SIGKILL');
            console.log('Force killed daemon');
        }

        await removePid();
        return true;
    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.log(`Failed to stop daemon (PID: ${pid}): ${err.message}`);
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