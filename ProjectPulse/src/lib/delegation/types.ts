/**
 * Core types for the CLI-agnostic delegation system.
 *
 * The delegation system enables background agent work across any AI CLI
 * (OpenCode, Codex, Gemini CLI, etc.) using filesystem-based IPC.
 */

// ============================================================================
// Status Types
// ============================================================================

/**
 * Lifecycle states for a delegation request.
 */
export type DelegationStatus =
    | 'pending'   // Request created, waiting for daemon to pick up
    | 'running'   // Daemon is actively processing (CLI spawned)
    | 'complete'  // Agent finished successfully
    | 'error'     // Agent encountered an error
    | 'timeout';  // Exceeded maximum runtime (default: 15 min)

/**
 * Supported AI CLIs that can be used to run delegated agents.
 */
export type SupportedCli = 'opencode' | 'codex' | 'gemini' | 'claude' | 'auto';

// ============================================================================
// Agent Types
// ============================================================================

/**
 * Available agent types from the agentprompts/ directory.
 */
export type AgentType =
    | 'explorer'     // A.T.L.A.S. — codebase cartography
    | 'reviewer'     // Risk-driven code review
    | 'performance'  // Static performance analysis
    | 'architect'    // Cost/efficiency review
    | 'planner';     // Task decomposition

/**
 * Mapping of agent types to their source files.
 */
export const AGENT_FILES: Record<AgentType, string> = {
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
export function isValidAgentType(value: string): value is AgentType {
    // Use Object.hasOwn to check only own properties, not inherited ones
    // This prevents validation bypass via prototype pollution (e.g., "toString", "__proto__")
    return Object.hasOwn(AGENT_FILES, value);
}

/**
 * Optional YAML frontmatter that can be added to agent markdown files.
 */
export interface AgentFrontmatter {
    name?: string;
    description?: string;
    timeout?: number;      // Override default timeout (seconds)
    read_only?: boolean;   // Safety flag (should always be true for background)
}

// ============================================================================
// Delegation Request/Result Types
// ============================================================================

/**
 * A delegation request — written to pending/ directory.
 */
export interface DelegationRequest {
    /** Unique readable ID (e.g., "swift-amber-falcon") */
    id: string;

    /** Session ID of the parent agent that created this delegation */
    parentSession: string;

    /** Which CLI spawned this request (for reference) */
    sourceCli: SupportedCli;

    /** Which CLI should run the agent (can differ from source) */
    targetCli: SupportedCli;

    /** Agent type to run */
    agent: AgentType;

    /** The prompt/task for the agent */
    prompt: string;

    /** Current status */
    status: DelegationStatus;

    /** Working directory for the agent (usually the project root) */
    workingDir: string;

    /** ISO timestamp when request was created */
    createdAt: string;

    /** Optional: timeout in seconds (default: 900 = 15 min) */
    timeout?: number;
}

/**
 * A delegation result — written to complete/ directory.
 */
export interface DelegationResult {
    /** Matches the request ID */
    id: string;

    /** Final status */
    status: Extract<DelegationStatus, 'complete' | 'error' | 'timeout'>;

    /** The agent's output (full response) */
    result: string;

    /** Exit code from the CLI process */
    exitCode: number;

    /** ISO timestamp when agent finished */
    completedAt: string;

    /** Duration in milliseconds */
    durationMs: number;

    /** Error message if status is 'error' */
    error?: string;
}

// ============================================================================
// JSON Envelope (matches ProjectPulse patterns)
// ============================================================================

/**
 * Standard JSON envelope for all delegation outputs.
 * Follows ProjectPulse's deterministic JSON output pattern.
 */
export interface DelegationEnvelope<T = unknown> {
    ok: boolean;
    tool: 'delegation';
    data?: T;
    error?: string;
    code?: number;
}

/**
 * Wrap successful data in the standard envelope.
 */
export function ok<T>(data: T): DelegationEnvelope<T> {
    return { ok: true, tool: 'delegation', data };
}

/**
 * Wrap an error in the standard envelope.
 */
export function err(message: string, code = 1): DelegationEnvelope<never> {
    return { ok: false, tool: 'delegation', error: message, code };
}

// ============================================================================
// Storage Paths
// ============================================================================

/**
 * Default base directory for delegation storage.
 */
export const DEFAULT_DELEGATIONS_DIR = '~/.projectpulse/delegations';

/**
 * Subdirectory structure within delegations dir.
 */
export const DELEGATION_SUBDIRS = {
    pending: 'pending',
    complete: 'complete',
    logs: 'logs',
} as const;

/**
 * Default timeout for delegations (15 minutes in milliseconds).
 */
export const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
