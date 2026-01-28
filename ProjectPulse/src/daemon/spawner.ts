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
import { DelegationRequest, SupportedCli, AGENT_FILES, AgentType, isValidAgentType } from '../lib/delegation/types';

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
 * Validate and sanitize a working directory path.
 * 
 * @param dir - The working directory path to validate
 * @returns The absolute, validated path
 * @throws Error if the path is invalid, doesn't exist, isn't a directory, or is in a restricted location
 */
function validateWorkingDir(dir: string): string {
    // Resolve to absolute path
    const absPath = path.resolve(dir);
    
    // Prevent execution in sensitive system directories (check before existence)
    // This is intentional - we want to reject sensitive paths even if they don't exist
    const sensitiveDirs = process.platform === 'win32'
        ? ['C:\\Windows', 'C:\\Windows\\System32', 'C:\\Program Files']
        : ['/root', '/etc', '/sys', '/proc', '/dev'];
    
    // Helper function to normalize paths for comparison
    // On Windows: normalize and lowercase for case-insensitive comparison
    // On Unix: just normalize (paths are case-sensitive)
    const normalizeForCompare = (p: string): string => {
        const normalized = path.normalize(p);
        return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
    };
    
    const normalizedAbsPath = normalizeForCompare(absPath);
    const normalizedSensitiveDirs = sensitiveDirs.map(normalizeForCompare);
    
    for (const sensitiveDir of normalizedSensitiveDirs) {
        if (normalizedAbsPath === sensitiveDir || normalizedAbsPath.startsWith(sensitiveDir + path.sep)) {
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
            const normalizedRealPath = normalizeForCompare(realPath);
            // Check if real path is in sensitive directory
            for (const sensitiveDir of normalizedSensitiveDirs) {
                if (normalizedRealPath === sensitiveDir || normalizedRealPath.startsWith(sensitiveDir + path.sep)) {
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
 * Load agent prompt content from agentprompts/ directory.
 * 
 * @param agent - The agent type to load
 * @param workingDir - The working directory to search for agent prompts
 * @returns The agent prompt content
 * @throws Error if agent type is invalid or working directory is invalid
 */
async function loadAgentPrompt(agent: AgentType, workingDir: string): Promise<string> {
    // Validate agent type before attempting to load files
    if (!isValidAgentType(agent)) {
        const validTypes = Object.keys(AGENT_FILES).join(', ');
        throw new Error(`Invalid agent type: "${agent}". Valid agent types are: ${validTypes}`);
    }
    
    // Validate working directory before using it
    const validWorkingDir = validateWorkingDir(workingDir);
    
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
    // Validate agent type first (before any other operations)
    if (!isValidAgentType(request.agent)) {
        const validTypes = Object.keys(AGENT_FILES).join(', ');
        return {
            stdout: '',
            stderr: `Invalid agent type: "${request.agent}". Valid agent types are: ${validTypes}`,
            exitCode: 1,
            timedOut: false,
        };
    }
    
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
    let agentContent: string;
    try {
        agentContent = await loadAgentPrompt(request.agent, request.workingDir);
    } catch (error) {
        return {
            stdout: '',
            stderr: error instanceof Error ? error.message : 'Failed to load agent prompt',
            exitCode: 1,
            timedOut: false,
        };
    }

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
