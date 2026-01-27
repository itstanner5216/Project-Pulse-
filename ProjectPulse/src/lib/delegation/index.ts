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

// Types
export {
    DelegationStatus,
    SupportedCli,
    AgentType,
    AGENT_FILES,
    AgentFrontmatter,
    DelegationRequest,
    DelegationResult,
    DelegationEnvelope,
    ok,
    err,
    DEFAULT_DELEGATIONS_DIR,
    DELEGATION_SUBDIRS,
    DEFAULT_TIMEOUT_MS,
} from './types';

// ID generation
export { generateId, generateUniqueId, isValidId } from './id';

// Storage operations
export {
    getDelegationsDir,
    getSubdir,
    getRequestPath,
    getResultPath,
    ensureDirs,
    createRequest,
    readRequest,
    deleteRequest,
    listPending,
    writeResult,
    readResult,
    listComplete,
    checkStatus,
    listAll,
    DelegationSummary,
} from './storage';

// Agent loading
export {
    loadAgent,
    loadAllAgents,
    getAvailableAgentTypes,
    LoadedAgent,
} from './agent-loader';
