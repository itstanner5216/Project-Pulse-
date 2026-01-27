"use strict";
/**
 * `delegation-list` command — List all delegations.
 *
 * Usage:
 *   projectpulse delegation-list
 *   projectpulse delegation-list --status pending
 *
 * Returns a list of delegations with their status.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.delegationList = delegationList;
const delegation_1 = require("../lib/delegation");
// ============================================================================
// Main Function
// ============================================================================
/**
 * List delegations.
 *
 * @param options - List options
 * @returns JSON envelope with delegation list
 */
async function delegationList(options = {}) {
    const { status = 'all', format = 'json' } = options;
    try {
        const summaries = [];
        // Get pending delegations
        if (status === 'all' || status === 'pending') {
            const pendingIds = await (0, delegation_1.listPending)();
            for (const id of pendingIds) {
                const req = await (0, delegation_1.readRequest)(id);
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
            const completeIds = await (0, delegation_1.listComplete)();
            for (const id of completeIds) {
                const res = await (0, delegation_1.readResult)(id);
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
        return JSON.stringify((0, delegation_1.ok)({
            count: summaries.length,
            delegations: summaries,
        }), null, 2);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return JSON.stringify((0, delegation_1.err)(`Failed to list delegations: ${message}`));
    }
}
// ============================================================================
// CLI Entry Point
// ============================================================================
function printUsage() {
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
async function main() {
    const args = process.argv.slice(2);
    if (args.includes('--help') || args.includes('-h')) {
        printUsage();
        process.exit(0);
    }
    // Parse arguments
    let status = 'all';
    let format = 'json';
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--status' && args[i + 1]) {
            status = args[++i];
        }
        else if (arg === '--format' && args[i + 1]) {
            format = args[++i];
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
//# sourceMappingURL=delegation-list.js.map