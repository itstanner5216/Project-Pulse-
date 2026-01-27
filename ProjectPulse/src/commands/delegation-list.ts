/**
 * `delegation-list` command — List all delegations.
 *
 * Usage:
 *   projectpulse delegation-list
 *   projectpulse delegation-list --status pending
 *
 * Returns a list of delegations with their status.
 */

import { listAll, listPending, listComplete, readRequest, readResult, ok, err } from '../lib/delegation';

// ============================================================================
// Types
// ============================================================================

export interface ListOptions {
    /** Filter by status */
    status?: 'pending' | 'complete' | 'all';
    /** Output format */
    format?: 'json' | 'table';
}

interface DelegationSummary {
    id: string;
    agent: string;
    status: string;
    prompt: string;
    createdAt?: string;
    completedAt?: string;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * List delegations.
 *
 * @param options - List options
 * @returns JSON envelope with delegation list
 */
export async function delegationList(options: ListOptions = {}): Promise<string> {
    const { status = 'all', format = 'json' } = options;

    try {
        const summaries: DelegationSummary[] = [];

        // Get pending delegations
        if (status === 'all' || status === 'pending') {
            const pendingIds = await listPending();
            for (const id of pendingIds) {
                const req = await readRequest(id);
                if (req) {
                    summaries.push({
                        id: req.id,
                        agent: req.agent,
                        status: req.status,
                        prompt: req.prompt.slice(0, 50) + (req.prompt.length > 50 ? '...' : ''),
                        createdAt: req.createdAt,
                    });
                }
            }
        }

        // Get completed delegations
        if (status === 'all' || status === 'complete') {
            const completeIds = await listComplete();
            for (const id of completeIds) {
                const res = await readResult(id);
                if (res) {
                    summaries.push({
                        id: res.id,
                        agent: 'unknown', // Not stored in result
                        status: res.status,
                        prompt: '', // Not stored in result
                        completedAt: res.completedAt,
                    });
                }
            }
        }

        if (format === 'table') {
            // Print as table
            console.log('ID                      STATUS    AGENT        PROMPT');
            console.log('─'.repeat(70));
            for (const s of summaries) {
                const id = s.id.padEnd(22);
                const st = s.status.padEnd(9);
                const ag = s.agent.padEnd(12);
                console.log(`${id} ${st} ${ag} ${s.prompt}`);
            }
            return '';
        }

        return JSON.stringify(ok({
            count: summaries.length,
            delegations: summaries,
        }), null, 2);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return JSON.stringify(err(`Failed to list delegations: ${message}`));
    }
}

// ============================================================================
// CLI Entry Point
// ============================================================================

function printUsage(): void {
    console.log(`
Usage: projectpulse delegation-list [options]

List all delegations.

Options:
  --status <type>   Filter: pending, complete, all (default: all)
  --format <type>   Output: json, table (default: json)

Examples:
  projectpulse delegation-list
  projectpulse delegation-list --status pending
  projectpulse delegation-list --format table
`);
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);

    if (args.includes('--help') || args.includes('-h')) {
        printUsage();
        process.exit(0);
    }

    // Parse arguments
    let status: 'pending' | 'complete' | 'all' = 'all';
    let format: 'json' | 'table' = 'json';

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--status' && args[i + 1]) {
            status = args[++i] as 'pending' | 'complete' | 'all';
        } else if (arg === '--format' && args[i + 1]) {
            format = args[++i] as 'json' | 'table';
        }
    }

    const output = await delegationList({ status, format });
    if (output) {
        console.log(output);
    }
}

// Run if executed directly
if (require.main === module) {
    main().catch((err) => {
        console.error('Error:', err.message);
        process.exit(1);
    });
}
