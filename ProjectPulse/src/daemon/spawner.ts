/**
 * CLI spawner module.
 *
 * Spawns AI CLI subprocesses (OpenCode, Codex, Gemini, Claude) to run
 * delegated agent work. Handles process lifecycle, timeout, and output capture.
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';
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
 * Validate a working directory and return its absolute, canonical path.
 *
 * @param dir - The working directory path to validate
 * @returns The absolute validated path
 * @throws Error if the path does not exist, is not a directory, is a broken symlink, or is inside a restricted system location
 */
function validateWorkingDir(dir: string): string {
    // Resolve to absolute path
    const absPath = path.resolve(dir);
    
    // Prevent execution in sensitive system directories (check before existence)
    // This is intentional - we want to reject sensitive paths even if they don't exist
    const sensitiveDirs = process.platform === 'win32'
        ? ['C:\\Windows', 'C:\\Windows\\System32', 'C:\\Program Files']
        : ['/root', '/etc', '/sys', '/proc', '/dev'];
    
    for (const sensitiveDir of sensitiveDirs) {
        const comparePath = process.platform === 'win32' ? absPath.toLowerCase() : absPath;
        const compareSensitive = process.platform === 'win32' ? sensitiveDir.toLowerCase() : sensitiveDir;
        if (comparePath === compareSensitive || comparePath.startsWith(compareSensitive + path.sep)) {
            throw new Error(`Working directory is in restricted path: ${dir}`);
        }
    }
    
    // Check if path exists
    let stats;
    try {
        // Use lstat to check symlink itself, not target
        stats = fsSync.lstatSync(absPath);
    } catch (error) {
        throw new Error(`Working directory does not exist: ${dir}`);
    }
    
    // For symlinks, also validate the real path
    if (stats.isSymbolicLink()) {
        try {
            const realPath = fsSync.realpathSync(absPath);
            // Check if real path is in sensitive directory
            for (const sensitiveDir of sensitiveDirs) {
                if (realPath === sensitiveDir || realPath.startsWith(sensitiveDir + path.sep)) {
                    throw new Error(`Working directory symlink points to restricted path: ${dir}`);
                }
            }
            // Check if real path is a directory
            const realStats = fsSync.statSync(realPath);
            if (!realStats.isDirectory()) {
                throw new Error(`Working directory is not a directory: ${dir}`);
            }
        } catch (error) {
            if (error instanceof Error && error.message.includes('restricted path')) {
                throw error;
            }
            throw new Error(`Working directory symlink is broken: ${dir}`);
        }
    } else {
        // Verify it's a directory
        if (!stats.isDirectory()) {
            throw new Error(`Working directory is not a directory: ${dir}`);
        }
    }
    
    return absPath;
}

/**
 * Load the prompt template for a given agent from the project's agentprompts directory.
 *
 * Attempts to read the agent's prompt file from one of three locations relative to the validated working directory and the current working directory; if no file is found, returns a built-in default prompt.
 *
 * @param agent - The agent type to load the prompt for
 * @param validWorkingDir - The already-validated working directory to resolve project-relative prompt files
 * @returns The agent prompt content; if no prompt file is found, a default prompt string tailored to `agent`
 */
async function loadAgentPrompt(agent: AgentType, validWorkingDir: string): Promise<string> {
    // Look for agentprompts/ in the project root
    const possiblePaths = [
        path.join(validWorkingDir, 'agentprompts', AGENT_FILES[agent]),
        path.join(validWorkingDir, '..', 'agentprompts', AGENT_FILES[agent]),
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
 * Launches the selected AI CLI to execute a delegated agent task and captures its output.
 *
 * @param request - Delegation request containing agent id, prompt, workingDir, targetCli, parentSession, and id
 * @param timeoutMs - Maximum runtime in milliseconds before the process is terminated
 * @returns An object with captured `stdout` and `stderr`, the process `exitCode`, and a `timedOut` flag
 */
export async function spawnAgent(
    request: DelegationRequest,
    timeoutMs: number
): Promise<SpawnResult> {
    // Validate working directory before using it
    let validWorkingDir: string;
    try {
        validWorkingDir = validateWorkingDir(request.workingDir);
    } catch (error) {
        return {
            stdout: '',
            stderr: error instanceof Error ? error.message : 'Invalid working directory',
            exitCode: 1,
            timedOut: false,
        };
    }
    
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
    const agentContent = await loadAgentPrompt(request.agent, validWorkingDir);

    // Build command
    const config = CLI_CONFIGS[cli];
    const args = config.args(request.prompt, agentContent);

    return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        let finished = false;

        const proc: ChildProcess = spawn(config.command, args, {
            cwd: validWorkingDir,
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