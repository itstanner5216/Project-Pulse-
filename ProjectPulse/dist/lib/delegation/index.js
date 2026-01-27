"use strict";
/**
 * Delegation module - CLI-agnostic background agents.
 *
 * Enables async task delegation across any AI CLI (OpenCode, Codex, Gemini, etc.)
 * using filesystem-based IPC.
 *
 * @example
 * ```typescript
 * import { createRequest, checkStatus, generateId } from './lib/delegation';
 *
 * // Create a delegation
 * const result = await createRequest({
 *   parentSession: 'abc123',
 *   sourceCli: 'opencode',
 *   targetCli: 'auto',
 *   agent: 'explorer',
 *   prompt: 'Analyze this codebase',
 *   workingDir: process.cwd(),
 * });
 *
 * if (result.ok) {
 *   console.log(`Delegation started: ${result.data.id}`);
 * }
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAvailableAgentTypes = exports.loadAllAgents = exports.loadAgent = exports.listAll = exports.checkStatus = exports.listComplete = exports.readResult = exports.writeResult = exports.listPending = exports.deleteRequest = exports.readRequest = exports.createRequest = exports.ensureDirs = exports.getResultPath = exports.getRequestPath = exports.getSubdir = exports.getDelegationsDir = exports.isValidId = exports.generateUniqueId = exports.generateId = exports.DEFAULT_TIMEOUT_MS = exports.DELEGATION_SUBDIRS = exports.DEFAULT_DELEGATIONS_DIR = exports.err = exports.ok = exports.AGENT_FILES = void 0;
// Types
var types_1 = require("./types");
Object.defineProperty(exports, "AGENT_FILES", { enumerable: true, get: function () { return types_1.AGENT_FILES; } });
Object.defineProperty(exports, "ok", { enumerable: true, get: function () { return types_1.ok; } });
Object.defineProperty(exports, "err", { enumerable: true, get: function () { return types_1.err; } });
Object.defineProperty(exports, "DEFAULT_DELEGATIONS_DIR", { enumerable: true, get: function () { return types_1.DEFAULT_DELEGATIONS_DIR; } });
Object.defineProperty(exports, "DELEGATION_SUBDIRS", { enumerable: true, get: function () { return types_1.DELEGATION_SUBDIRS; } });
Object.defineProperty(exports, "DEFAULT_TIMEOUT_MS", { enumerable: true, get: function () { return types_1.DEFAULT_TIMEOUT_MS; } });
// ID generation
var id_1 = require("./id");
Object.defineProperty(exports, "generateId", { enumerable: true, get: function () { return id_1.generateId; } });
Object.defineProperty(exports, "generateUniqueId", { enumerable: true, get: function () { return id_1.generateUniqueId; } });
Object.defineProperty(exports, "isValidId", { enumerable: true, get: function () { return id_1.isValidId; } });
// Storage operations
var storage_1 = require("./storage");
Object.defineProperty(exports, "getDelegationsDir", { enumerable: true, get: function () { return storage_1.getDelegationsDir; } });
Object.defineProperty(exports, "getSubdir", { enumerable: true, get: function () { return storage_1.getSubdir; } });
Object.defineProperty(exports, "getRequestPath", { enumerable: true, get: function () { return storage_1.getRequestPath; } });
Object.defineProperty(exports, "getResultPath", { enumerable: true, get: function () { return storage_1.getResultPath; } });
Object.defineProperty(exports, "ensureDirs", { enumerable: true, get: function () { return storage_1.ensureDirs; } });
Object.defineProperty(exports, "createRequest", { enumerable: true, get: function () { return storage_1.createRequest; } });
Object.defineProperty(exports, "readRequest", { enumerable: true, get: function () { return storage_1.readRequest; } });
Object.defineProperty(exports, "deleteRequest", { enumerable: true, get: function () { return storage_1.deleteRequest; } });
Object.defineProperty(exports, "listPending", { enumerable: true, get: function () { return storage_1.listPending; } });
Object.defineProperty(exports, "writeResult", { enumerable: true, get: function () { return storage_1.writeResult; } });
Object.defineProperty(exports, "readResult", { enumerable: true, get: function () { return storage_1.readResult; } });
Object.defineProperty(exports, "listComplete", { enumerable: true, get: function () { return storage_1.listComplete; } });
Object.defineProperty(exports, "checkStatus", { enumerable: true, get: function () { return storage_1.checkStatus; } });
Object.defineProperty(exports, "listAll", { enumerable: true, get: function () { return storage_1.listAll; } });
// Agent loading
var agent_loader_1 = require("./agent-loader");
Object.defineProperty(exports, "loadAgent", { enumerable: true, get: function () { return agent_loader_1.loadAgent; } });
Object.defineProperty(exports, "loadAllAgents", { enumerable: true, get: function () { return agent_loader_1.loadAllAgents; } });
Object.defineProperty(exports, "getAvailableAgentTypes", { enumerable: true, get: function () { return agent_loader_1.getAvailableAgentTypes; } });
//# sourceMappingURL=index.js.map