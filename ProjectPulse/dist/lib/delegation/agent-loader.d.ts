/**
 * Agent loader module.
 *
 * Loads agent prompt files from the agentprompts/ directory.
 * Supports optional YAML frontmatter for agent metadata.
 */
import { AgentType, AgentFrontmatter } from './types';
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
/**
 * Load an agent by type.
 *
 * @param agentType - The agent type to load
 * @param workingDir - Working directory to search from
 * @returns Loaded agent or null if not found
 */
export declare function loadAgent(agentType: AgentType, workingDir?: string): Promise<LoadedAgent | null>;
/**
 * Load all available agents.
 *
 * @param workingDir - Working directory to search from
 * @returns Map of agent type to loaded agent
 */
export declare function loadAllAgents(workingDir?: string): Promise<Map<AgentType, LoadedAgent>>;
/**
 * Get list of available agent types.
 */
export declare function getAvailableAgentTypes(): AgentType[];
//# sourceMappingURL=agent-loader.d.ts.map