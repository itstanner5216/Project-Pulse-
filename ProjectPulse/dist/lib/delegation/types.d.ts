/**
 * Core types for the CLI-agnostic delegation system.
 *
 * The delegation system enables background agent work across any AI CLI
 * (OpenCode, Codex, Gemini CLI, etc.) using filesystem-based IPC.
 */
/**
 * Lifecycle states for a delegation request.
 */
export type DelegationStatus = 'pending' | 'running' | 'complete' | 'error' | 'timeout';
/**
 * Supported AI CLIs that can be used to run delegated agents.
 */
export type SupportedCli = 'opencode' | 'codex' | 'gemini' | 'claude' | 'auto';
/**
 * Available agent types from the agentprompts/ directory.
 */
export type AgentType = 'explorer' | 'reviewer' | 'performance' | 'architect' | 'planner';
/**
 * Mapping of agent types to their source files.
 */
export declare const AGENT_FILES: Record<AgentType, string>;
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
export declare function isValidAgentType(value: string): value is AgentType;
/**
 * Optional YAML frontmatter that can be added to agent markdown files.
 */
export interface AgentFrontmatter {
    name?: string;
    description?: string;
    timeout?: number;
    read_only?: boolean;
}
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
export declare function ok<T>(data: T): DelegationEnvelope<T>;
/**
 * Wrap an error in the standard envelope.
 */
export declare function err(message: string, code?: number): DelegationEnvelope<never>;
/**
 * Default base directory for delegation storage.
 */
export declare const DEFAULT_DELEGATIONS_DIR = "~/.projectpulse/delegations";
/**
 * Subdirectory structure within delegations dir.
 */
export declare const DELEGATION_SUBDIRS: {
    readonly pending: "pending";
    readonly complete: "complete";
    readonly logs: "logs";
};
/**
 * Default timeout for delegations (15 minutes in milliseconds).
 */
export declare const DEFAULT_TIMEOUT_MS: number;
//# sourceMappingURL=types.d.ts.map