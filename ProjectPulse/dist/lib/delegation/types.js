"use strict";
/**
 * Core types for the CLI-agnostic delegation system.
 *
 * The delegation system enables background agent work across any AI CLI
 * (OpenCode, Codex, Gemini CLI, etc.) using filesystem-based IPC.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_TIMEOUT_MS = exports.DELEGATION_SUBDIRS = exports.DEFAULT_DELEGATIONS_DIR = exports.AGENT_FILES = void 0;
exports.isValidAgentType = isValidAgentType;
exports.ok = ok;
exports.err = err;
/**
 * Mapping of agent types to their source files.
 */
exports.AGENT_FILES = {
    explorer: 'ExplorationAgent.md',
    reviewer: 'CodingAgenticReviewer.md',
    performance: 'AutonomousPerformance.md',
    architect: 'System_Prompt_Autonomous_Architect.md',
    planner: 'PlanningAgent.md',
};
/**
 * Type guard to check if a value is a valid AgentType.
 *
 * @param value - The value to check
 * @returns True if the value is a valid agent type, false otherwise
 *
 * @example
 * ```typescript
 * if (isValidAgentType('explorer')) {
 *   // value is guaranteed to be AgentType
 * }
 * ```
 */
function isValidAgentType(value) {
    // Use Object.hasOwn to check only own properties, not inherited ones
    // This prevents validation bypass via prototype pollution (e.g., "toString", "__proto__")
    return Object.hasOwn(exports.AGENT_FILES, value);
}
/**
 * Wrap successful data in the standard envelope.
 */
function ok(data) {
    return { ok: true, tool: 'delegation', data };
}
/**
 * Wrap an error in the standard envelope.
 */
function err(message, code = 1) {
    return { ok: false, tool: 'delegation', error: message, code };
}
// ============================================================================
// Storage Paths
// ============================================================================
/**
 * Default base directory for delegation storage.
 */
exports.DEFAULT_DELEGATIONS_DIR = '~/.projectpulse/delegations';
/**
 * Subdirectory structure within delegations dir.
 */
exports.DELEGATION_SUBDIRS = {
    pending: 'pending',
    complete: 'complete',
    logs: 'logs',
};
/**
 * Default timeout for delegations (15 minutes in milliseconds).
 */
exports.DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
//# sourceMappingURL=types.js.map