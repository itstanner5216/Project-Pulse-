"use strict";
/**
 * CLI spawner module.
 *
 * Spawns AI CLI subprocesses (OpenCode, Codex, Gemini, Claude) to run
 * delegated agent work. Handles process lifecycle, timeout, and output capture.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.spawnAgent = spawnAgent;
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const fs_1 = require("fs");
const fsSync = __importStar(require("fs"));
const types_1 = require("../lib/delegation/types");
// ============================================================================
// CLI Configurations
// ============================================================================
/**
 * Configuration for each supported CLI.
 */
const CLI_CONFIGS = {
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
async function commandExists(cmd) {
    return new Promise((resolve) => {
        const proc = (0, child_process_1.spawn)('which', [cmd], { stdio: 'ignore' });
        proc.on('close', (code) => resolve(code === 0));
        proc.on('error', () => resolve(false));
    });
}
/**
 * Detect which CLI to use based on availability.
 */
async function detectCli() {
    // Priority order
    const order = ['opencode', 'codex', 'gemini', 'claude'];
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
function validateWorkingDir(dir) {
    // Resolve to absolute path
    const absPath = path.resolve(dir);
    // Prevent execution in sensitive system directories (check before existence)
    // This is intentional - we want to reject sensitive paths even if they don't exist
    const sensitiveDirs = process.platform === 'win32'
        ? ['C:\\Windows', 'C:\\Windows\\System32', 'C:\\Program Files']
        : ['/root', '/etc', '/sys', '/proc', '/dev'];
    // Windows paths are case-insensitive, normalize for comparison
    const normalizedAbsPath = process.platform === 'win32' ? absPath.toLowerCase() : absPath;
    for (const sensitiveDir of sensitiveDirs) {
        const normalizedSensitiveDir = process.platform === 'win32' ? sensitiveDir.toLowerCase() : sensitiveDir;
        if (normalizedAbsPath === normalizedSensitiveDir || normalizedAbsPath.startsWith(normalizedSensitiveDir + path.sep)) {
            throw new Error(`Working directory is in restricted path: ${dir}`);
        }
    }
    // Check if path exists
    let stats;
    try {
        // Use lstat to check symlink itself, not target
        stats = fsSync.lstatSync(absPath);
    }
    catch (error) {
        throw new Error(`Working directory does not exist: ${dir}`);
    }
    // For symlinks, also validate the real path
    if (stats.isSymbolicLink()) {
        try {
            const realPath = fsSync.realpathSync(absPath);
            const normalizedRealPath = process.platform === 'win32' ? realPath.toLowerCase() : realPath;
            // Check if real path is in sensitive directory
            for (const sensitiveDir of sensitiveDirs) {
                const normalizedSensitiveDir = process.platform === 'win32' ? sensitiveDir.toLowerCase() : sensitiveDir;
                if (normalizedRealPath === normalizedSensitiveDir || normalizedRealPath.startsWith(normalizedSensitiveDir + path.sep)) {
                    throw new Error(`Working directory symlink points to restricted path: ${dir}`);
                }
            }
            // Check if real path is a directory
            const realStats = fsSync.statSync(realPath);
            if (!realStats.isDirectory()) {
                throw new Error(`Working directory is not a directory: ${dir}`);
            }
        }
        catch (error) {
            if (error instanceof Error) {
                // Preserve specific validation errors
                if (error.message.includes('restricted path') || error.message.includes('not a directory')) {
                    throw error;
                }
            }
            throw new Error(`Working directory symlink is broken: ${dir}`);
        }
    }
    else {
        // Verify it's a directory
        if (!stats.isDirectory()) {
            throw new Error(`Working directory is not a directory: ${dir}`);
        }
    }
    return absPath;
}
/**
 * Load agent prompt content from agentprompts/ directory.
 */
async function loadAgentPrompt(agent, workingDir) {
    // Validate working directory before using it
    const validWorkingDir = validateWorkingDir(workingDir);
    // Look for agentprompts/ in the project root
    const possiblePaths = [
        path.join(validWorkingDir, 'agentprompts', types_1.AGENT_FILES[agent]),
        path.join(validWorkingDir, '..', 'agentprompts', types_1.AGENT_FILES[agent]),
        path.join(process.cwd(), 'agentprompts', types_1.AGENT_FILES[agent]),
    ];
    for (const agentPath of possiblePaths) {
        try {
            const content = await fs_1.promises.readFile(agentPath, 'utf-8');
            return content;
        }
        catch {
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
async function spawnAgent(request, timeoutMs) {
    // Validate working directory before using it
    let validWorkingDir;
    try {
        validWorkingDir = validateWorkingDir(request.workingDir);
    }
    catch (error) {
        return {
            stdout: '',
            stderr: error instanceof Error ? error.message : 'Invalid working directory',
            exitCode: 1,
            timedOut: false,
        };
    }
    // Determine which CLI to use
    let cli;
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
    }
    else {
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
        let forceKillHandle = null;
        const proc = (0, child_process_1.spawn)(config.command, args, {
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
        proc.stdout?.on('data', (data) => {
            stdout += data.toString();
        });
        // Capture stderr
        proc.stderr?.on('data', (data) => {
            stderr += data.toString();
        });
        // Timeout handler
        const timeoutHandle = setTimeout(() => {
            if (!finished) {
                timedOut = true;
                proc.kill('SIGTERM');
                // Force kill after 5 seconds
                forceKillHandle = setTimeout(() => {
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
            if (forceKillHandle) {
                clearTimeout(forceKillHandle);
            }
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
            if (forceKillHandle) {
                clearTimeout(forceKillHandle);
            }
            resolve({
                stdout,
                stderr: stderr || err.message,
                exitCode: 1,
                timedOut: false,
            });
        });
    });
}
//# sourceMappingURL=spawner.js.map