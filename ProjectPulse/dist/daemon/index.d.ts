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
/**
 * Check if the daemon is already running.
 */
export declare function isRunning(): Promise<boolean>;
/**
 * Start the daemon.
 *
 * Uses atomic PID file creation to prevent race conditions when multiple
 * processes try to start the daemon simultaneously.
 */
export declare function startDaemon(): Promise<void>;
/**
 * Stop the daemon.
 */
export declare function stopDaemon(): Promise<boolean>;
/**
 * Get daemon status.
 */
export declare function getDaemonStatus(): Promise<{
    running: boolean;
    pid: number | null;
    logPath: string;
}>;
//# sourceMappingURL=index.d.ts.map