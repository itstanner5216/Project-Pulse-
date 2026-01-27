/**
 * `delegation-list` command — List all delegations.
 *
 * Usage:
 *   projectpulse delegation-list
 *   projectpulse delegation-list --status pending
 *
 * Returns a list of delegations with their status.
 */
export interface ListOptions {
    /** Filter by status */
    status?: 'pending' | 'complete' | 'all';
    /** Output format */
    format?: 'json' | 'table';
}
/**
 * List delegations.
 *
 * @param options - List options
 * @returns JSON envelope with delegation list
 */
export declare function delegationList(options?: ListOptions): Promise<string>;
//# sourceMappingURL=delegation-list.d.ts.map