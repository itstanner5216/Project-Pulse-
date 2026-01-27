"use strict";
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
exports.getDelegationsDir = getDelegationsDir;
exports.getSubdir = getSubdir;
exports.getRequestPath = getRequestPath;
exports.getResultPath = getResultPath;
exports.ensureDirs = ensureDirs;
exports.createRequest = createRequest;
exports.readRequest = readRequest;
exports.deleteRequest = deleteRequest;
exports.listPending = listPending;
exports.writeResult = writeResult;
exports.readResult = readResult;
exports.listComplete = listComplete;
exports.checkStatus = checkStatus;
exports.listAll = listAll;
const fs_1 = require("fs");
const path = __importStar(require("path"));
const os_1 = require("os");
const types_1 = require("./types");
const id_1 = require("./id");
// ============================================================================
// Path Helpers
// ============================================================================
/**
 * Expand ~ to home directory.
 */
function expandPath(p) {
    if (p.startsWith('~/')) {
        return path.join((0, os_1.homedir)(), p.slice(2));
    }
    return p;
}
/**
 * Get the base delegations directory.
 */
function getDelegationsDir() {
    return expandPath(process.env.PROJECTPULSE_DELEGATIONS_DIR || types_1.DEFAULT_DELEGATIONS_DIR);
}
/**
 * Get path for a specific subdirectory.
 */
function getSubdir(subdir) {
    return path.join(getDelegationsDir(), types_1.DELEGATION_SUBDIRS[subdir]);
}
/**
 * Get path for a delegation request file.
 */
function getRequestPath(id) {
    return path.join(getSubdir('pending'), `${id}.json`);
}
/**
 * Get path for a delegation result file.
 */
function getResultPath(id) {
    return path.join(getSubdir('complete'), `${id}.json`);
}
// ============================================================================
// Initialization
// ============================================================================
/**
 * Ensure the delegation directories exist.
 */
async function ensureDirs() {
    const dirs = Object.values(types_1.DELEGATION_SUBDIRS).map((sub) => path.join(getDelegationsDir(), sub));
    for (const dir of dirs) {
        await fs_1.promises.mkdir(dir, { recursive: true });
    }
}
// ============================================================================
// Request Operations
// ============================================================================
/**
 * Create a new delegation request and write it to the pending directory.
 *
 * Uses generateUniqueId() which appends a timestamp to ensure uniqueness
 * and prevent ID collisions. ID format: adjective-color-animal-timestamp
 * (e.g., "swift-amber-falcon-1706345678901")
 */
async function createRequest(request) {
    try {
        await ensureDirs();
        const id = (0, id_1.generateUniqueId)();
        const fullRequest = {
            ...request,
            id,
            status: 'pending',
            createdAt: new Date().toISOString(),
        };
        const filePath = getRequestPath(id);
        await fs_1.promises.writeFile(filePath, JSON.stringify(fullRequest, null, 2), 'utf-8');
        return (0, types_1.ok)({ id });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return (0, types_1.err)(`Failed to create delegation request: ${message}`);
    }
}
/**
 * Read a pending request by ID.
 */
async function readRequest(id) {
    try {
        const filePath = getRequestPath(id);
        const content = await fs_1.promises.readFile(filePath, 'utf-8');
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
/**
 * Delete a pending request (called after completion).
 */
async function deleteRequest(id) {
    try {
        await fs_1.promises.unlink(getRequestPath(id));
    }
    catch {
        // Ignore if file doesn't exist
    }
}
/**
 * List all pending delegation IDs.
 */
async function listPending() {
    try {
        await ensureDirs();
        const files = await fs_1.promises.readdir(getSubdir('pending'));
        return files
            .filter((f) => f.endsWith('.json'))
            .map((f) => f.replace('.json', ''));
    }
    catch {
        return [];
    }
}
// ============================================================================
// Result Operations
// ============================================================================
/**
 * Write a delegation result to the complete directory.
 */
async function writeResult(result) {
    await ensureDirs();
    const filePath = getResultPath(result.id);
    await fs_1.promises.writeFile(filePath, JSON.stringify(result, null, 2), 'utf-8');
}
/**
 * Read a completed result by ID.
 */
async function readResult(id) {
    try {
        const filePath = getResultPath(id);
        const content = await fs_1.promises.readFile(filePath, 'utf-8');
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
/**
 * List all completed delegation IDs.
 */
async function listComplete() {
    try {
        await ensureDirs();
        const files = await fs_1.promises.readdir(getSubdir('complete'));
        return files
            .filter((f) => f.endsWith('.json'))
            .map((f) => f.replace('.json', ''));
    }
    catch {
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
async function checkStatus(id) {
    // Check if complete
    const result = await readResult(id);
    if (result) {
        return (0, types_1.ok)({ status: result.status, result });
    }
    // Check if pending
    const request = await readRequest(id);
    if (request) {
        return (0, types_1.ok)({ status: request.status });
    }
    return (0, types_1.err)(`Delegation not found: ${id}`, 404);
}
/**
 * List all delegations (pending + complete) with summary info.
 */
async function listAll() {
    try {
        const summaries = [];
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
        return (0, types_1.ok)(summaries);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return (0, types_1.err)(`Failed to list delegations: ${message}`);
    }
}
//# sourceMappingURL=storage.js.map