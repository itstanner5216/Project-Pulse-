/**
 * Agent loader module.
 *
 * Loads agent prompt files from the agentprompts/ directory.
 * Supports optional YAML frontmatter for agent metadata.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { AgentType, AGENT_FILES, AgentFrontmatter } from './types';

// ============================================================================
// Types
// ============================================================================

export interface LoadedAgent {
    /** Agent type */
    type: AgentType;
    /** Full prompt content */
    content: string;
    /** Parsed frontmatter (if present) */
    frontmatter: AgentFrontmatter;
    /** Source file path */
    sourcePath: string;
}

// ============================================================================
// Frontmatter Parser
// ============================================================================

/**
 * Parse YAML frontmatter from markdown content.
 * Returns the frontmatter object and the content without frontmatter.
 */
function parseFrontmatter(content: string): { frontmatter: AgentFrontmatter; body: string } {
    const frontmatter: AgentFrontmatter = {};

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
        if (colonIndex === -1) continue;

        const key = line.slice(0, colonIndex).trim();
        let value: string | number | boolean = line.slice(colonIndex + 1).trim();

        // Parse value types
        if (value === 'true') value = true;
        else if (value === 'false') value = false;
        else if (/^\d+$/.test(value)) value = parseInt(value, 10);

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
async function findAgentPromptsDir(workingDir: string): Promise<string | null> {
    const possiblePaths = [
        path.join(workingDir, 'agentprompts'),
        path.join(workingDir, '..', 'agentprompts'),
        path.join(workingDir, '..', '..', 'agentprompts'),
    ];

    for (const p of possiblePaths) {
        try {
            const stat = await fs.stat(p);
            if (stat.isDirectory()) {
                return p;
            }
        } catch {
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
export async function loadAgent(
    agentType: AgentType,
    workingDir: string = process.cwd()
): Promise<LoadedAgent | null> {
    const filename = AGENT_FILES[agentType];
    if (!filename) {
        return null;
    }

    const agentsDir = await findAgentPromptsDir(workingDir);
    if (!agentsDir) {
        return null;
    }

    const filePath = path.join(agentsDir, filename);

    try {
        const rawContent = await fs.readFile(filePath, 'utf-8');
        const { frontmatter, body } = parseFrontmatter(rawContent);

        return {
            type: agentType,
            content: body || rawContent,
            frontmatter,
            sourcePath: filePath,
        };
    } catch {
        return null;
    }
}

/**
 * Load all available agents.
 *
 * @param workingDir - Working directory to search from
 * @returns Map of agent type to loaded agent
 */
export async function loadAllAgents(
    workingDir: string = process.cwd()
): Promise<Map<AgentType, LoadedAgent>> {
    const agents = new Map<AgentType, LoadedAgent>();

    const agentTypes: AgentType[] = ['explorer', 'reviewer', 'performance', 'architect', 'planner'];

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
export function getAvailableAgentTypes(): AgentType[] {
    return Object.keys(AGENT_FILES) as AgentType[];
}
