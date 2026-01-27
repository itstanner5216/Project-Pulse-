/**
 * Readable ID generator for delegations.
 *
 * Generates memorable IDs in the format: adjective-color-animal
 * (e.g., "swift-amber-falcon", "bold-coral-panther")
 */
/**
 * Generate a readable delegation ID.
 *
 * Format: adjective-color-animal
 * Example: "swift-amber-falcon"
 *
 * Collision probability is low for typical use cases:
 * ~40 × ~48 × ~56 = ~107,520 combinations
 */
export declare function generateId(): string;
/**
 * Validate that a string looks like a valid delegation ID.
 */
export declare function isValidId(id: string): boolean;
/**
 * Generate a unique ID with a timestamp suffix for guaranteed uniqueness.
 *
 * Format: adjective-color-animal-timestamp
 * Example: "swift-amber-falcon-1706345678901"
 */
export declare function generateUniqueId(): string;
//# sourceMappingURL=id.d.ts.map