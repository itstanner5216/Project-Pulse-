/**
 * File watcher for pending delegation requests.
 *
 * Uses native fs.watch for cross-platform file watching.
 * Falls back to polling if watch is unavailable.
 */
import { DelegationRequest, DelegationResult } from '../lib/delegation/types';
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
export declare class DelegationWatcher {
    private pendingDir;
    private watcher;
    private pollTimer;
    private processing;
    private options;
    private running;
    constructor(options?: WatcherOptions);
    /**
     * Start watching for pending requests.
     */
    start(): Promise<void>;
    /**
     * Stop the watcher.
     */
    stop(): void;
    /**
     * Start polling fallback.
     */
    private startPolling;
    /**
     * Poll once for pending requests.
     */
    private pollOnce;
    /**
     * Process a single delegation request.
     */
    private processRequest;
}
//# sourceMappingURL=watcher.d.ts.map