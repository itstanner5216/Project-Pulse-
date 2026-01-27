/**
 * `delegate` command — Start a background delegation.
 *
 * Usage:
 *   projectpulse delegate "analyze this codebase" --agent explorer
 *   projectpulse delegate "review for security issues" --agent reviewer
 *
 * Returns a delegation ID that can be used to retrieve results.
 */

import { createRequest, ok, err, AgentType, SupportedCli, AGENT_FILES } from '../lib/delegation';

// ============================================================================
// Types
// ============================================================================

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
export async function delegate(
    prompt: string,
    options: DelegateOptions
): Promise<string> {
    // Validate agent
    if (!AGENT_FILES[options.agent]) {
        const validAgents = Object.keys(AGENT_FILES).join(', ');
        return JSON.stringify(err(`Invalid agent: ${options.agent}. Valid: ${validAgents}`));
    }

    // Validate prompt
    if (!prompt || prompt.trim().length === 0) {
        return JSON.stringify(err('Prompt cannot be empty'));
    }

    // Create request
    const result = await createRequest({
        parentSession: options.sessionId || process.env.PROJECTPULSE_SESSION_ID || 'unknown',
        sourceCli: (process.env.CLI_NAME as SupportedCli) || 'auto',
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

function printUsage(): void {
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

async function main(): Promise<void> {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        printUsage();
        process.exit(0);
    }

    // Parse arguments
    let prompt = '';
    let agent: AgentType = 'explorer';
    let cli: SupportedCli = 'auto';
    let timeout = 900;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--agent' && args[i + 1]) {
            agent = args[++i] as AgentType;
        } else if (arg === '--cli' && args[i + 1]) {
            cli = args[++i] as SupportedCli;
        } else if (arg === '--timeout' && args[i + 1]) {
            timeout = parseInt(args[++i], 10);
        } else if (!arg.startsWith('-')) {
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
