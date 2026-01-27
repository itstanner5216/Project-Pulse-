/**
 * `delegate` command — Start a background delegation.
 *
 * Usage:
 *   projectpulse delegate "analyze this codebase" --agent explorer
 *   projectpulse delegate "review for security issues" --agent reviewer
 *
 * Returns a delegation ID that can be used to retrieve results.
 */
import { AgentType, SupportedCli } from '../lib/delegation';
export interface DelegateOptions {
    /** Agent type to use */
    agent: AgentType;
    /** Target CLI (default: auto) */
    cli?: SupportedCli;
    /** Working directory (default: cwd) */
    workingDir?: string;
    /** Session ID (default: from env) */
    sessionId?: string;
    /** Timeout in seconds (default: 900) */
    timeout?: number;
}
/**
 * Create a delegation request.
 *
 * @param prompt - The task for the agent
 * @param options - Delegation options
 * @returns JSON envelope with delegation ID or error
 */
export declare function delegate(prompt: string, options: DelegateOptions): Promise<string>;
//# sourceMappingURL=delegate.d.ts.map