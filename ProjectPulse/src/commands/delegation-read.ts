/**
 * `delegation-read` command — Retrieve a delegation result.
 *
 * Usage:
 *   projectpulse delegation-read <id>
 *   projectpulse delegation-read swift-amber-falcon --wait
 *
 * Returns the delegation result or status if still running.
 */

import { checkStatus, readResult, ok, err } from '../lib/delegation';

// ============================================================================
// Types
// ============================================================================

export interface ReadOptions {
    /** Wait for completion (blocking) */
    wait?: boolean;
    /** Maximum wait time in seconds (default: 900) */
    waitTimeout?: number;
    /** Poll interval in milliseconds (default: 2000) */
    pollInterval?: number;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Read a delegation result.
 *
 * @param id - Delegation ID
 * @param options - Read options
 * @returns JSON envelope with result or status
 */
export async function delegationRead(
    id: string,
    options: ReadOptions = {}
): Promise<string> {
    const { wait = false, waitTimeout = 900, pollInterval = 2000 } = options;

    if (!id || id.trim().length === 0) {
        return JSON.stringify(err('Delegation ID is required'));
    }

    // Check current status
    const status = await checkStatus(id);

    if (!status.ok) {
        return JSON.stringify(status);
    }

    // If complete (or error/timeout), return result
    if (status.data?.result) {
        return JSON.stringify(ok({
            id,
            status: status.data.status,
            result: status.data.result.result,
            completedAt: status.data.result.completedAt,
            durationMs: status.data.result.durationMs,
            error: status.data.result.error,
        }));
    }

    // If not waiting, return current status
    if (!wait) {
        return JSON.stringify(ok({
            id,
            status: status.data?.status || 'unknown',
            message: 'Delegation is still running. Use --wait to block until complete.',
        }));
    }

    // Wait for completion
    const deadline = Date.now() + waitTimeout * 1000;

    while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, pollInterval));

        const result = await readResult(id);
        if (result) {
            return JSON.stringify(ok({
                id,
                status: result.status,
                result: result.result,
                completedAt: result.completedAt,
                durationMs: result.durationMs,
                error: result.error,
            }));
        }
    }

    return JSON.stringify(err(`Timeout waiting for delegation: ${id}`));
}

// ============================================================================
// CLI Entry Point
// ============================================================================

function printUsage(): void {
    console.log(`
Usage: projectpulse delegation-read <id> [options]

Retrieve a delegation result.

Options:
  --wait            Wait for completion (blocking)
  --timeout <sec>   Maximum wait time (default: 900)

Examples:
  projectpulse delegation-read swift-amber-falcon
  projectpulse delegation-read swift-amber-falcon --wait
  projectpulse delegation-read swift-amber-falcon --wait --timeout 60
`);
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        printUsage();
        process.exit(0);
    }

    // Parse arguments
    let id = '';
    let wait = false;
    let waitTimeout = 900;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--wait') {
            wait = true;
        } else if (arg === '--timeout' && args[i + 1]) {
            waitTimeout = parseInt(args[++i], 10);
        } else if (!arg.startsWith('-')) {
            id = arg;
        }
    }

    if (!id) {
        console.error('Error: Delegation ID is required');
        printUsage();
        process.exit(1);
    }

    const output = await delegationRead(id, { wait, waitTimeout });
    console.log(output);
}

// Run if executed directly
if (require.main === module) {
    main().catch((err) => {
        console.error('Error:', err.message);
        process.exit(1);
    });
}
