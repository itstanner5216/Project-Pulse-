"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRunning = isRunning;
exports.startDaemon = startDaemon;
exports.stopDaemon = stopDaemon;
exports.getDaemonStatus = getDaemonStatus;
const fs_1 = require("fs");
const path = __importStar(require("path"));
const watcher_1 = require("./watcher");
const storage_1 = require("../lib/delegation/storage");
// ============================================================================
// Constants
// ============================================================================
const PID_FILE = 'daemon.pid';
const LOG_FILE = 'daemon.log';
// ============================================================================
// Logging
// ============================================================================
function getLogPath() {
    return path.join((0, storage_1.getDelegationsDir)(), 'logs', LOG_FILE);
}
function getPidPath() {
    return path.join((0, storage_1.getDelegationsDir)(), PID_FILE);
}
async function log(message) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}\n`;
    try {
        const logPath = getLogPath();
        await fs_1.promises.mkdir(path.dirname(logPath), { recursive: true });
        await fs_1.promises.appendFile(logPath, line);
    }
    catch {
        // Fall back to console
        console.log(line.trim());
    }
}
// ============================================================================
// PID Management
// ============================================================================
async function writePid() {
    const pidPath = getPidPath();
    await fs_1.promises.mkdir(path.dirname(pidPath), { recursive: true });
    await fs_1.promises.writeFile(pidPath, String(process.pid));
}
async function readPid() {
    try {
        const content = await fs_1.promises.readFile(getPidPath(), 'utf-8');
        return parseInt(content.trim(), 10);
    }
    catch {
        return null;
    }
}
async function removePid() {
    try {
        await fs_1.promises.unlink(getPidPath());
    }
    catch {
        // Ignore
    }
}
/**
 * Check if the daemon is already running.
 */
async function isRunning() {
    const pid = await readPid();
    if (!pid)
        return false;
    try {
        // Send signal 0 to check if process exists
        process.kill(pid, 0);
        return true;
    }
    catch {
        // Process doesn't exist, clean up stale PID file
        await removePid();
        return false;
    }
}
// ============================================================================
// Daemon Functions
// ============================================================================
let watcher = null;
/**
 * Start the daemon.
 */
async function startDaemon() {
    if (await isRunning()) {
        console.log('Daemon is already running');
        return;
    }
    await log('Daemon starting...');
    await writePid();
    watcher = new watcher_1.DelegationWatcher({
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
async function stopDaemon() {
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
    }
    catch (error) {
        console.log(`Failed to stop daemon: ${error}`);
        await removePid();
        return false;
    }
}
/**
 * Get daemon status.
 */
async function getDaemonStatus() {
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
async function main() {
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
            }
            else {
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
//# sourceMappingURL=index.js.map