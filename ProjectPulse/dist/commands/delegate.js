"use strict";
/**
 * `delegate` command — Start a background delegation.
 *
 * Usage:
 *   projectpulse delegate "analyze this codebase" --agent explorer
 *   projectpulse delegate "review for security issues" --agent reviewer
 *
 * Returns a delegation ID that can be used to retrieve results.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.delegate = delegate;
const delegation_1 = require("../lib/delegation");
// ============================================================================
// Main Function
// ============================================================================
/**
 * Create a delegation request.
 *
 * @param prompt - The task for the agent
 * @param options - Delegation options
 * @returns JSON envelope with delegation ID or error
 */
async function delegate(prompt, options) {
    // Validate agent
    if (!delegation_1.AGENT_FILES[options.agent]) {
        const validAgents = Object.keys(delegation_1.AGENT_FILES).join(', ');
        return JSON.stringify((0, delegation_1.err)(`Invalid agent: ${options.agent}. Valid: ${validAgents}`));
    }
    // Validate prompt
    if (!prompt || prompt.trim().length === 0) {
        return JSON.stringify((0, delegation_1.err)('Prompt cannot be empty'));
    }
    // Create request
    const result = await (0, delegation_1.createRequest)({
        parentSession: options.sessionId || process.env.PROJECTPULSE_SESSION_ID || 'unknown',
        sourceCli: process.env.CLI_NAME || 'auto',
        targetCli: options.cli || 'auto',
        agent: options.agent,
        prompt: prompt.trim(),
        workingDir: options.workingDir || process.cwd(),
        timeout: options.timeout ? options.timeout * 1000 : undefined,
    });
    return JSON.stringify(result, null, 2);
}
// ============================================================================
// CLI Entry Point
// ============================================================================
function printUsage() {
    console.log(`
Usage: projectpulse delegate <prompt> [options]

Start a background agent task.

Options:
  --agent <type>    Agent type: explorer, reviewer, performance, architect, planner
  --cli <cli>       Target CLI: opencode, codex, gemini, claude, auto (default: auto)
  --timeout <sec>   Timeout in seconds (default: 900)

Examples:
  projectpulse delegate "analyze this codebase" --agent explorer
  projectpulse delegate "review for security issues" --agent reviewer
  projectpulse delegate "find performance hotspots" --agent performance
  projectpulse delegate "break down this feature" --agent planner
`);
}
async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        printUsage();
        process.exit(0);
    }
    // Parse arguments
    let prompt = '';
    let agent = 'explorer';
    let cli = 'auto';
    let timeout = 900;
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--agent' && args[i + 1]) {
            agent = args[++i];
        }
        else if (arg === '--cli' && args[i + 1]) {
            cli = args[++i];
        }
        else if (arg === '--timeout' && args[i + 1]) {
            timeout = parseInt(args[++i], 10);
        }
        else if (!arg.startsWith('-')) {
            prompt = arg;
        }
    }
    if (!prompt) {
        console.error('Error: Prompt is required');
        printUsage();
        process.exit(1);
    }
    const output = await delegate(prompt, { agent, cli, timeout });
    console.log(output);
}
// Run if executed directly
if (require.main === module) {
    main().catch((err) => {
        console.error('Error:', err.message);
        process.exit(1);
    });
}
//# sourceMappingURL=delegate.js.map