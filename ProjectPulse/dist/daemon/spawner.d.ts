/**
 * CLI spawner module.
 *
 * Spawns AI CLI subprocesses (OpenCode, Codex, Gemini, Claude) to run
 * delegated agent work. Handles process lifecycle, timeout, and output capture.
 */
import { DelegationRequest } from '../lib/delegation/types';
export interface SpawnResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    timedOut: boolean;
}
/**
 * Spawn a configured CLI process to execute the given delegation request for an agent.
 *
 * Validates the agent type and working directory, selects or validates the target CLI, loads the agent prompt, runs the CLI with the assembled arguments, and returns the process outcome.
 *
 * @param request - Delegation request containing agent, workingDir, prompt, id, parentSession, and targetCli
 * @param timeoutMs - Maximum allowed runtime for the spawned process in milliseconds
 * @returns The SpawnResult containing captured `stdout`, `stderr`, the process `exitCode` (process exit code or `1` on failure), and `timedOut` which is `true` if the process exceeded `timeoutMs` and was terminated. */
export declare function spawnAgent(request: DelegationRequest, timeoutMs: number): Promise<SpawnResult>;
//# sourceMappingURL=spawner.d.ts.map