"use strict";
/**
 * Agent loader module.
 *
 * Loads agent prompt files from the agentprompts/ directory.
 * Supports optional YAML frontmatter for agent metadata.
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
exports.loadAgent = loadAgent;
exports.loadAllAgents = loadAllAgents;
exports.getAvailableAgentTypes = getAvailableAgentTypes;
const fs_1 = require("fs");
const path = __importStar(require("path"));
const types_1 = require("./types");
// ============================================================================
// Frontmatter Parser
// ============================================================================
/**
 * Parse YAML frontmatter from markdown content.
 * Returns the frontmatter object and the content without frontmatter.
 */
function parseFrontmatter(content) {
    const frontmatter = {};
    // Check for frontmatter (starts with ---)
    if (!content.startsWith('---')) {
        return { frontmatter, body: content };
    }
    // Find end of frontmatter
    const endIndex = content.indexOf('\n---', 3);
    if (endIndex === -1) {
        return { frontmatter, body: content };
    }
    // Parse frontmatter lines
    const frontmatterText = content.slice(4, endIndex);
    const lines = frontmatterText.split('\n');
    for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1)
            continue;
        const key = line.slice(0, colonIndex).trim();
        let value = line.slice(colonIndex + 1).trim();
        // Parse value types
        if (value === 'true')
            value = true;
        else if (value === 'false')
            value = false;
        else if (/^\d+$/.test(value))
            value = parseInt(value, 10);
        // Map known keys
        switch (key) {
            case 'name':
                frontmatter.name = String(value);
                break;
            case 'description':
                frontmatter.description = String(value);
                break;
            case 'timeout':
                frontmatter.timeout = typeof value === 'number' ? value : parseInt(String(value), 10);
                break;
            case 'read_only':
                frontmatter.read_only = value === true || value === 'true';
                break;
        }
    }
    // Return body without frontmatter
    const body = content.slice(endIndex + 4).trimStart();
    return { frontmatter, body };
}
// ============================================================================
// Agent Loading
// ============================================================================
/**
 * Find the agentprompts directory.
 * Searches up from the working directory.
 */
async function findAgentPromptsDir(workingDir) {
    const possiblePaths = [
        path.join(workingDir, 'agentprompts'),
        path.join(workingDir, '..', 'agentprompts'),
        path.join(workingDir, '..', '..', 'agentprompts'),
    ];
    for (const p of possiblePaths) {
        try {
            const stat = await fs_1.promises.stat(p);
            if (stat.isDirectory()) {
                return p;
            }
        }
        catch {
            continue;
        }
    }
    return null;
}
/**
 * Load an agent by type.
 *
 * @param agentType - The agent type to load
 * @param workingDir - Working directory to search from
 * @returns Loaded agent or null if not found
 */
async function loadAgent(agentType, workingDir = process.cwd()) {
    const filename = types_1.AGENT_FILES[agentType];
    if (!filename) {
        return null;
    }
    const agentsDir = await findAgentPromptsDir(workingDir);
    if (!agentsDir) {
        return null;
    }
    const filePath = path.join(agentsDir, filename);
    try {
        const rawContent = await fs_1.promises.readFile(filePath, 'utf-8');
        const { frontmatter, body } = parseFrontmatter(rawContent);
        return {
            type: agentType,
            content: body || rawContent,
            frontmatter,
            sourcePath: filePath,
        };
    }
    catch {
        return null;
    }
}
/**
 * Load all available agents.
 *
 * @param workingDir - Working directory to search from
 * @returns Map of agent type to loaded agent
 */
async function loadAllAgents(workingDir = process.cwd()) {
    const agents = new Map();
    const agentTypes = ['explorer', 'reviewer', 'performance', 'architect', 'planner'];
    for (const type of agentTypes) {
        const agent = await loadAgent(type, workingDir);
        if (agent) {
            agents.set(type, agent);
        }
    }
    return agents;
}
/**
 * Get list of available agent types.
 */
function getAvailableAgentTypes() {
    return Object.keys(types_1.AGENT_FILES);
}
//# sourceMappingURL=agent-loader.js.map