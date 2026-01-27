/**
 * File watcher for pending delegation requests.
 *
 * Uses native fs.watch for cross-platform file watching.
 * Falls back to polling if watch is unavailable.
 */

import { watch, promises as fs, FSWatcher } from 'fs';
import * as path from 'path';
import { getSubdir, readRequest, deleteRequest, writeResult } from '../lib/delegation/storage';
import { DelegationRequest, DelegationResult, DEFAULT_TIMEOUT_MS } from '../lib/delegation/types';
import { spawnAgent } from './spawner';

// ============================================================================
// Types
// ============================================================================

export interface WatcherOptions {
    /** Polling interval if watch is unavailable (ms) */
    pollInterval?: number;
    /** Callback when a request is picked up */
    onPickup?: (request: DelegationRequest) => void;
    /** Callback when processing completes */
    onComplete?: (result: DelegationResult) => void;
    /** Callback on error */
    onError?: (error: Error, requestId?: string) => void;
}

// ============================================================================
// Watcher Class
// ============================================================================

export class DelegationWatcher {
    private pendingDir: string;
    private watcher: FSWatcher | null = null;
    private pollTimer: NodeJS.Timeout | null = null;
    private processing: Set<string> = new Set();
    private options: Required<WatcherOptions>;
    private running = false;

    constructor(options: WatcherOptions = {}) {
        this.pendingDir = getSubdir('pending');
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
    async start(): Promise<void> {
        if (this.running) return;
        this.running = true;

        // Ensure directory exists
        await fs.mkdir(this.pendingDir, { recursive: true });

        // Try native watch first
        try {
            this.watcher = watch(this.pendingDir, async (eventType, filename) => {
                if (eventType === 'rename' && filename?.endsWith('.json')) {
                    const id = filename.replace('.json', '');
                    await this.processRequest(id);
                }
            });

            this.watcher.on('error', (err) => {
                this.options.onError(err);
                // Fall back to polling on watch error
                this.startPolling();
            });
        } catch {
            // Fall back to polling if watch fails
            this.startPolling();
        }

        // Also poll initially to catch any existing requests
        await this.pollOnce();
    }

    /**
     * Stop the watcher.
     */
    stop(): void {
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
    private startPolling(): void {
        if (this.pollTimer) return;

        this.pollTimer = setInterval(async () => {
            await this.pollOnce();
        }, this.options.pollInterval);
    }

    /**
     * Poll once for pending requests.
     */
    private async pollOnce(): Promise<void> {
        if (!this.running) return;

        try {
            const files = await fs.readdir(this.pendingDir);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const id = file.replace('.json', '');
                    await this.processRequest(id);
                }
            }
        } catch {
            // Directory might not exist yet
        }
    }

    /**
     * Process a single delegation request.
     */
    private async processRequest(id: string): Promise<void> {
        // Skip if already processing
        if (this.processing.has(id)) return;
        this.processing.add(id);

        try {
            const request = await readRequest(id);
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
            const timeout = request.timeout ?? DEFAULT_TIMEOUT_MS;

            // Spawn the agent
            const agentResult = await spawnAgent(request, timeout);

            const result: DelegationResult = {
                id: request.id,
                status: agentResult.timedOut ? 'timeout' : agentResult.exitCode === 0 ? 'complete' : 'error',
                result: agentResult.stdout,
                exitCode: agentResult.exitCode,
                completedAt: new Date().toISOString(),
                durationMs: Date.now() - startTime,
                error: agentResult.stderr || undefined,
            };

            // Write result and remove pending request
            await writeResult(result);
            await deleteRequest(id);

            this.options.onComplete(result);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.options.onError(err, id);

            // Write error result
            const result: DelegationResult = {
                id,
                status: 'error',
                result: '',
                exitCode: 1,
                completedAt: new Date().toISOString(),
                durationMs: 0,
                error: err.message,
            };

            try {
                await writeResult(result);
                await deleteRequest(id);
            } catch {
                // Ignore cleanup errors
            }
        } finally {
            this.processing.delete(id);
        }
    }
}
