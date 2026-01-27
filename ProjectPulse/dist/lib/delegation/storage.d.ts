/**
 * Delegation storage module.
 *
 * Handles reading/writing delegation requests and results to the filesystem.
 * Uses a simple directory structure:
 *   ~/.projectpulse/delegations/
 *     pending/    - Requests waiting for daemon pickup
 *     complete/   - Finished results
 *     logs/       - Daemon logs
 */
import { DelegationRequest, DelegationResult, DelegationStatus, DELEGATION_SUBDIRS, DelegationEnvelope } from './types';
/**
 * Get the base delegations directory.
 */
export declare function getDelegationsDir(): string;
/**
 * Get path for a specific subdirectory.
 */
export declare function getSubdir(subdir: keyof typeof DELEGATION_SUBDIRS): string;
/**
 * Get path for a delegation request file.
 */
export declare function getRequestPath(id: string): string;
/**
 * Get path for a delegation result file.
 */
export declare function getResultPath(id: string): string;
/**
 * Ensure the delegation directories exist.
 */
export declare function ensureDirs(): Promise<void>;
/**
 * Create a new delegation request and write it to the pending directory.
 */
export declare function createRequest(request: Omit<DelegationRequest, 'id' | 'status' | 'createdAt'>): Promise<DelegationEnvelope<{
    id: string;
}>>;
/**
 * Read a pending request by ID.
 */
export declare function readRequest(id: string): Promise<DelegationRequest | null>;
/**
 * Delete a pending request (called after completion).
 */
export declare function deleteRequest(id: string): Promise<void>;
/**
 * List all pending delegation IDs.
 */
export declare function listPending(): Promise<string[]>;
/**
 * Write a delegation result to the complete directory.
 */
export declare function writeResult(result: DelegationResult): Promise<void>;
/**
 * Read a completed result by ID.
 */
export declare function readResult(id: string): Promise<DelegationResult | null>;
/**
 * List all completed delegation IDs.
 */
export declare function listComplete(): Promise<string[]>;
/**
 * Check the status of a delegation by ID.
 * Returns the current status and optionally the result if complete.
 */
export declare function checkStatus(id: string): Promise<DelegationEnvelope<{
    status: DelegationStatus;
    result?: DelegationResult;
}>>;
/**
 * Summary of a delegation for listing.
 */
export interface DelegationSummary {
    id: string;
    agent: string;
    status: DelegationStatus;
    createdAt: string;
    completedAt?: string;
}
/**
 * List all delegations (pending + complete) with summary info.
 */
export declare function listAll(): Promise<DelegationEnvelope<DelegationSummary[]>>;
//# sourceMappingURL=storage.d.ts.map