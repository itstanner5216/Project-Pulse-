/**
 * `delegation-read` command — Retrieve a delegation result.
 *
 * Usage:
 *   projectpulse delegation-read <id>
 *   projectpulse delegation-read swift-amber-falcon --wait
 *
 * Returns the delegation result or status if still running.
 */
export interface ReadOptions {
    /** Wait for completion (blocking) */
    wait?: boolean;
    /** Maximum wait time in seconds (default: 900) */
    waitTimeout?: number;
    /** Poll interval in milliseconds (default: 2000) */
    pollInterval?: number;
}
/**
 * Read a delegation result.
 *
 * @param id - Delegation ID
 * @param options - Read options
 * @returns JSON envelope with result or status
 */
export declare function delegationRead(id: string, options?: ReadOptions): Promise<string>;
//# sourceMappingURL=delegation-read.d.ts.map