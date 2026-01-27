/**
 * CLI spawner module.
 *
 * Spawns AI CLI subprocesses (OpenCode, Codex, Gemini, Claude) to run
 * delegated agent work. Handles process lifecycle, timeout, and output capture.
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { promises as fs } from 'fs';
import { DelegationRequest, SupportedCli, AGENT_FILES, AgentType } from '../lib/delegation/types';

// ============================================================================
// Types
// ============================================================================

export interface SpawnResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    timedOut: boolean;
}

interface CliConfig {
    command: string;
    args: (prompt: string, agentContent: string) => string[];
    available: () => Promise<boolean>;
}

// ============================================================================
// CLI Configurations
// ============================================================================

/**
 * Configuration for each supported CLI.
 */
const CLI_CONFIGS: Record<Exclude<SupportedCli, 'auto'>, CliConfig> = {
    opencode: {
        command: 'opencode',
        args: (prompt, agentContent) => [
            '--print',
            '--system-prompt', agentContent,
            prompt,
        ],
        available: async () => commandExists('opencode'),
    },

    codex: {
        command: 'codex',
        args: (prompt, agentContent) => [
            '--quiet',
            '--approval-mode', 'never',
            `${agentContent}\n\n---\n\nTask: ${prompt}`,
        ],
        available: async () => commandExists('codex'),
    },

    gemini: {
        command: 'gemini',
        args: (prompt, agentContent) => [
            '-p', `${agentContent}\n\n---\n\nTask: ${prompt}`,
        ],
        available: async () => commandExists('gemini'),
    },

    claude: {
        command: 'claude',
        args: (prompt, agentContent) => [
            '-p', `${agentContent}\n\n---\n\nTask: ${prompt}`,
            '--allowedTools', 'Read,Grep,Glob,LS',
        ],
        available: async () => commandExists('claude'),
    },
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if a command exists in PATH.
 */
async function commandExists(cmd: string): Promise<boolean> {
    return new Promise((resolve) => {
        const proc = spawn('which', [cmd], { stdio: 'ignore' });
        proc.on('close', (code) => resolve(code === 0));
        proc.on('error', () => resolve(false));
    });
}

/**
 * Detect which CLI to use based on availability.
 */
async function detectCli(): Promise<Exclude<SupportedCli, 'auto'> | null> {
    // Priority order
    const order: Exclude<SupportedCli, 'auto'>[] = ['opencode', 'codex', 'gemini', 'claude'];

    for (const cli of order) {
        if (await CLI_CONFIGS[cli].available()) {
            return cli;
        }
    }

    return null;
}

/**
 * Load agent prompt content from agentprompts/ directory.
 */
async function loadAgentPrompt(agent: AgentType, workingDir: string): Promise<string> {
    // Look for agentprompts/ in the project root
    const possiblePaths = [
        path.join(workingDir, 'agentprompts', AGENT_FILES[agent]),
        path.join(workingDir, '..', 'agentprompts', AGENT_FILES[agent]),
        path.join(process.cwd(), 'agentprompts', AGENT_FILES[agent]),
    ];

    for (const agentPath of possiblePaths) {
        try {
            const content = await fs.readFile(agentPath, 'utf-8');
            return content;
        } catch {
            continue;
        }
    }

    // If agent file not found, return a basic prompt
    return `You are a ${agent} agent. Complete the following task thoroughly and provide a structured report.`;
}

// ============================================================================
// Spawn Function
// ============================================================================

/**
 * Spawn a CLI subprocess to run an agent.
 *
 * @param request - The delegation request
 * @param timeoutMs - Maximum runtime in milliseconds
 * @returns The spawn result with stdout, stderr, exitCode
 */
export async function spawnAgent(
    request: DelegationRequest,
    timeoutMs: number
): Promise<SpawnResult> {
    // Determine which CLI to use
    let cli: Exclude<SupportedCli, 'auto'>;

    if (request.targetCli === 'auto') {
        const detected = await detectCli();
        if (!detected) {
            return {
                stdout: '',
                stderr: 'No supported CLI found (tried: opencode, codex, gemini, claude)',
                exitCode: 1,
                timedOut: false,
            };
        }
        cli = detected;
    } else {
        cli = request.targetCli;
        if (!(await CLI_CONFIGS[cli].available())) {
            return {
                stdout: '',
                stderr: `CLI not available: ${cli}`,
                exitCode: 1,
                timedOut: false,
            };
        }
    }

    // Load agent prompt
    const agentContent = await loadAgentPrompt(request.agent, request.workingDir);

    // Build command
    const config = CLI_CONFIGS[cli];
    const args = config.args(request.prompt, agentContent);

    return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        let finished = false;

        const proc: ChildProcess = spawn(config.command, args, {
            cwd: request.workingDir,
            env: {
                ...process.env,
                // Inject ProjectPulse session ID for tracking
                PROJECTPULSE_SESSION_ID: request.parentSession,
                PROJECTPULSE_DELEGATION_ID: request.id,
                // Ensure non-interactive mode
                CI: 'true',
                TERM: 'dumb',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        // Capture stdout
        proc.stdout?.on('data', (data: Buffer) => {
            stdout += data.toString();
        });

        // Capture stderr
        proc.stderr?.on('data', (data: Buffer) => {
            stderr += data.toString();
        });

        // Timeout handler
        const timeoutHandle = setTimeout(() => {
            if (!finished) {
                timedOut = true;
                proc.kill('SIGTERM');

                // Force kill after 5 seconds
                setTimeout(() => {
                    if (!finished) {
                        proc.kill('SIGKILL');
                    }
                }, 5000);
            }
        }, timeoutMs);

        // Process exit handler
        proc.on('close', (code) => {
            finished = true;
            clearTimeout(timeoutHandle);

            resolve({
                stdout,
                stderr,
                exitCode: code ?? 1,
                timedOut,
            });
        });

        proc.on('error', (err) => {
            finished = true;
            clearTimeout(timeoutHandle);

            resolve({
                stdout,
                stderr: stderr || err.message,
                exitCode: 1,
                timedOut: false,
            });
        });
    });
}
