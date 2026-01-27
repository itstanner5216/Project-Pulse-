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
 * Spawn a CLI subprocess to run an agent.
 *
 * @param request - The delegation request
 * @param timeoutMs - Maximum runtime in milliseconds
 * @returns The spawn result with stdout, stderr, exitCode
 */
export declare function spawnAgent(request: DelegationRequest, timeoutMs: number): Promise<SpawnResult>;
//# sourceMappingURL=spawner.d.ts.map