"use strict";
/**
 * File watcher for pending delegation requests.
 *
 * Uses native fs.watch for cross-platform file watching.
 * Falls back to polling if watch is unavailable.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DelegationWatcher = void 0;
const fs_1 = require("fs");
const storage_1 = require("../lib/delegation/storage");
const types_1 = require("../lib/delegation/types");
const spawner_1 = require("./spawner");
// ============================================================================
// Watcher Class
// ============================================================================
class DelegationWatcher {
    pendingDir;
    watcher = null;
    pollTimer = null;
    processing = new Set();
    options;
    running = false;
    constructor(options = {}) {
        this.pendingDir = (0, storage_1.getSubdir)('pending');
        this.options = {
            pollInterval: options.pollInterval ?? 1000,
            onPickup: options.onPickup ?? (() => { }),
            onComplete: options.onComplete ?? (() => { }),
            onError: options.onError ?? (() => { }),
        };
    }
    /**
     * Start watching for pending requests.
     */
    async start() {
        if (this.running)
            return;
        this.running = true;
        // Ensure directory exists
        await fs_1.promises.mkdir(this.pendingDir, { recursive: true });
        // Try native watch first
        try {
            this.watcher = (0, fs_1.watch)(this.pendingDir, async (eventType, filename) => {
                if (eventType === 'rename' && filename?.endsWith('.json')) {
                    const id = filename.replace('.json', '');
                    await this.processRequest(id);
                }
            });
            this.watcher.on('error', (err) => {
                // Close and clean up the broken watcher before falling back
                // Do this BEFORE calling onError callback to ensure cleanup happens
                // even if the callback throws
                if (this.watcher) {
                    try {
                        this.watcher.close();
                    }
                    catch {
                        // Ignore close errors - watcher may already be in error state
                    }
                    this.watcher = null;
                }
                // Fall back to polling on watch error
                this.startPolling();
                // Call error callback last, so cleanup happens even if it throws
                this.options.onError(err);
            });
        }
        catch {
            // Fall back to polling if watch fails
            this.startPolling();
        }
        // Also poll initially to catch any existing requests
        await this.pollOnce();
    }
    /**
     * Stop the watcher.
     */
    stop() {
        this.running = false;
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }
    /**
     * Start polling fallback.
     */
    startPolling() {
        if (this.pollTimer)
            return;
        this.pollTimer = setInterval(async () => {
            await this.pollOnce();
        }, this.options.pollInterval);
    }
    /**
     * Poll once for pending requests.
     */
    async pollOnce() {
        if (!this.running)
            return;
        try {
            const files = await fs_1.promises.readdir(this.pendingDir);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const id = file.replace('.json', '');
                    await this.processRequest(id);
                }
            }
        }
        catch {
            // Directory might not exist yet
        }
    }
    /**
     * Process a single delegation request.
     */
    async processRequest(id) {
        // Skip if already processing
        if (this.processing.has(id))
            return;
        this.processing.add(id);
        try {
            const request = await (0, storage_1.readRequest)(id);
            if (!request) {
                this.processing.delete(id);
                return;
            }
            // Skip if not pending
            if (request.status !== 'pending') {
                this.processing.delete(id);
                return;
            }
            this.options.onPickup(request);
            const startTime = Date.now();
            const timeout = request.timeout ?? types_1.DEFAULT_TIMEOUT_MS;
            // Spawn the agent
            const agentResult = await (0, spawner_1.spawnAgent)(request, timeout);
            const result = {
                id: request.id,
                status: agentResult.timedOut ? 'timeout' : agentResult.exitCode === 0 ? 'complete' : 'error',
                result: agentResult.stdout,
                exitCode: agentResult.exitCode,
                completedAt: new Date().toISOString(),
                durationMs: Date.now() - startTime,
                error: agentResult.stderr || undefined,
            };
            // Write result and remove pending request
            await (0, storage_1.writeResult)(result);
            await (0, storage_1.deleteRequest)(id);
            this.options.onComplete(result);
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.options.onError(err, id);
            // Write error result
            const result = {
                id,
                status: 'error',
                result: '',
                exitCode: 1,
                completedAt: new Date().toISOString(),
                durationMs: 0,
                error: err.message,
            };
            try {
                await (0, storage_1.writeResult)(result);
                await (0, storage_1.deleteRequest)(id);
            }
            catch {
                // Ignore cleanup errors
            }
        }
        finally {
            this.processing.delete(id);
        }
    }
}
exports.DelegationWatcher = DelegationWatcher;
//# sourceMappingURL=watcher.js.map