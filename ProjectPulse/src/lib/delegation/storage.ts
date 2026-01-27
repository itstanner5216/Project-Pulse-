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

import { promises as fs } from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import {
    DelegationRequest,
    DelegationResult,
    DelegationStatus,
    DEFAULT_DELEGATIONS_DIR,
    DELEGATION_SUBDIRS,
    ok,
    err,
    DelegationEnvelope,
} from './types';
import { generateId } from './id';

// ============================================================================
// Path Helpers
// ============================================================================

/**
 * Expand ~ to home directory.
 */
function expandPath(p: string): string {
    if (p.startsWith('~/')) {
        return path.join(homedir(), p.slice(2));
    }
    return p;
}

/**
 * Get the base delegations directory.
 */
export function getDelegationsDir(): string {
    return expandPath(process.env.PROJECTPULSE_DELEGATIONS_DIR || DEFAULT_DELEGATIONS_DIR);
}

/**
 * Get path for a specific subdirectory.
 */
export function getSubdir(subdir: keyof typeof DELEGATION_SUBDIRS): string {
    return path.join(getDelegationsDir(), DELEGATION_SUBDIRS[subdir]);
}

/**
 * Get path for a delegation request file.
 */
export function getRequestPath(id: string): string {
    return path.join(getSubdir('pending'), `${id}.json`);
}

/**
 * Get path for a delegation result file.
 */
export function getResultPath(id: string): string {
    return path.join(getSubdir('complete'), `${id}.json`);
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Ensure the delegation directories exist.
 */
export async function ensureDirs(): Promise<void> {
    const dirs = Object.values(DELEGATION_SUBDIRS).map((sub) =>
        path.join(getDelegationsDir(), sub)
    );

    for (const dir of dirs) {
        await fs.mkdir(dir, { recursive: true });
    }
}

// ============================================================================
// Request Operations
// ============================================================================

/**
 * Create a new delegation request and write it to the pending directory.
 */
export async function createRequest(
    request: Omit<DelegationRequest, 'id' | 'status' | 'createdAt'>
): Promise<DelegationEnvelope<{ id: string }>> {
    try {
        await ensureDirs();

        const id = generateId();
        const fullRequest: DelegationRequest = {
            ...request,
            id,
            status: 'pending',
            createdAt: new Date().toISOString(),
        };

        const filePath = getRequestPath(id);
        await fs.writeFile(filePath, JSON.stringify(fullRequest, null, 2), 'utf-8');

        return ok({ id });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return err(`Failed to create delegation request: ${message}`);
    }
}

/**
 * Read a pending request by ID.
 */
export async function readRequest(id: string): Promise<DelegationRequest | null> {
    try {
        const filePath = getRequestPath(id);
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content) as DelegationRequest;
    } catch {
        return null;
    }
}

/**
 * Delete a pending request (called after completion).
 */
export async function deleteRequest(id: string): Promise<void> {
    try {
        await fs.unlink(getRequestPath(id));
    } catch {
        // Ignore if file doesn't exist
    }
}

/**
 * List all pending delegation IDs.
 */
export async function listPending(): Promise<string[]> {
    try {
        await ensureDirs();
        const files = await fs.readdir(getSubdir('pending'));
        return files
            .filter((f) => f.endsWith('.json'))
            .map((f) => f.replace('.json', ''));
    } catch {
        return [];
    }
}

// ============================================================================
// Result Operations
// ============================================================================

/**
 * Write a delegation result to the complete directory.
 */
export async function writeResult(result: DelegationResult): Promise<void> {
    await ensureDirs();
    const filePath = getResultPath(result.id);
    await fs.writeFile(filePath, JSON.stringify(result, null, 2), 'utf-8');
}

/**
 * Read a completed result by ID.
 */
export async function readResult(id: string): Promise<DelegationResult | null> {
    try {
        const filePath = getResultPath(id);
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content) as DelegationResult;
    } catch {
        return null;
    }
}

/**
 * List all completed delegation IDs.
 */
export async function listComplete(): Promise<string[]> {
    try {
        await ensureDirs();
        const files = await fs.readdir(getSubdir('complete'));
        return files
            .filter((f) => f.endsWith('.json'))
            .map((f) => f.replace('.json', ''));
    } catch {
        return [];
    }
}

// ============================================================================
// Status Check
// ============================================================================

/**
 * Check the status of a delegation by ID.
 * Returns the current status and optionally the result if complete.
 */
export async function checkStatus(
    id: string
): Promise<DelegationEnvelope<{ status: DelegationStatus; result?: DelegationResult }>> {
    // Check if complete
    const result = await readResult(id);
    if (result) {
        return ok({ status: result.status, result });
    }

    // Check if pending
    const request = await readRequest(id);
    if (request) {
        return ok({ status: request.status });
    }

    return err(`Delegation not found: ${id}`, 404);
}

// ============================================================================
// List All
// ============================================================================

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
export async function listAll(): Promise<DelegationEnvelope<DelegationSummary[]>> {
    try {
        const summaries: DelegationSummary[] = [];

        // Get pending
        const pendingIds = await listPending();
        for (const id of pendingIds) {
            const req = await readRequest(id);
            if (req) {
                summaries.push({
                    id: req.id,
                    agent: req.agent,
                    status: req.status,
                    createdAt: req.createdAt,
                });
            }
        }

        // Get complete
        const completeIds = await listComplete();
        for (const id of completeIds) {
            const res = await readResult(id);
            if (res) {
                // Need to read the original request for agent info
                // For now, we'll mark agent as unknown for completed items
                summaries.push({
                    id: res.id,
                    agent: 'unknown', // Could enhance by storing agent in result
                    status: res.status,
                    createdAt: '', // Not stored in result
                    completedAt: res.completedAt,
                });
            }
        }

        return ok(summaries);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return err(`Failed to list delegations: ${message}`);
    }
}
