/**
 * Readable ID generator for delegations.
 *
 * Generates memorable IDs in the format: adjective-color-animal
 * (e.g., "swift-amber-falcon", "bold-coral-panther")
 */

// ============================================================================
// Word Lists
// ============================================================================

const ADJECTIVES = [
    'swift', 'bold', 'calm', 'dark', 'eager', 'fair', 'glad', 'hale',
    'keen', 'loud', 'meek', 'neat', 'odd', 'pale', 'quick', 'rare',
    'safe', 'tall', 'vast', 'warm', 'wild', 'wise', 'young', 'zesty',
    'brave', 'crisp', 'deft', 'fresh', 'grand', 'hardy', 'jolly', 'lucky',
    'merry', 'noble', 'proud', 'royal', 'sharp', 'stark', 'tight', 'vivid',
];

const COLORS = [
    'amber', 'azure', 'beige', 'black', 'blush', 'brass', 'brick', 'bronze',
    'brown', 'coral', 'cream', 'crimson', 'cyan', 'denim', 'ebony', 'fawn',
    'frost', 'gold', 'grape', 'green', 'grey', 'ivory', 'jade', 'lemon',
    'lilac', 'lime', 'mauve', 'mint', 'navy', 'olive', 'onyx', 'peach',
    'pearl', 'pink', 'plum', 'rose', 'ruby', 'rust', 'sage', 'sand',
    'scarlet', 'silver', 'slate', 'steel', 'stone', 'tan', 'teal', 'violet',
];

const ANIMALS = [
    'ant', 'bat', 'bear', 'bee', 'bird', 'boar', 'cat', 'crab',
    'crow', 'deer', 'dog', 'dove', 'duck', 'eagle', 'elk', 'falcon',
    'fish', 'frog', 'goat', 'goose', 'hawk', 'heron', 'horse', 'hound',
    'jay', 'lark', 'lion', 'lynx', 'mice', 'mole', 'moth', 'newt',
    'owl', 'ox', 'panda', 'panther', 'pike', 'puma', 'rat', 'raven',
    'seal', 'shark', 'sheep', 'snake', 'spider', 'squid', 'stag', 'swan',
    'tiger', 'toad', 'trout', 'viper', 'whale', 'wolf', 'wren', 'zebra',
];

// ============================================================================
// ID Generator
// ============================================================================

/**
 * Pick a random element from an array.
 */
function pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate a readable delegation ID.
 *
 * Format: adjective-color-animal
 * Example: "swift-amber-falcon"
 *
 * Collision probability is low for typical use cases:
 * ~40 × ~48 × ~56 = ~107,520 combinations
 */
export function generateId(): string {
    return `${pick(ADJECTIVES)}-${pick(COLORS)}-${pick(ANIMALS)}`;
}

/**
 * Validate that a string looks like a valid delegation ID.
 * 
 * Accepts both standard format (adjective-color-animal) and 
 * unique format with timestamp (adjective-color-animal-timestamp).
 */
export function isValidId(id: string): boolean {
    const parts = id.split('-');
    
    // Standard format: adjective-color-animal (3 parts)
    // Unique format: adjective-color-animal-timestamp (4 parts)
    if (parts.length !== 3 && parts.length !== 4) return false;

    const [adj, color, animal] = parts;
    const isStandardFormat = (
        ADJECTIVES.includes(adj) &&
        COLORS.includes(color) &&
        ANIMALS.includes(animal)
    );
    
    // If 4 parts, validate timestamp (should be numeric)
    if (parts.length === 4) {
        const timestamp = parts[3];
        return isStandardFormat && /^\d+$/.test(timestamp);
    }
    
    return isStandardFormat;
}

/**
 * Generate a unique ID with a timestamp suffix for guaranteed uniqueness.
 *
 * Format: adjective-color-animal-timestamp
 * Example: "swift-amber-falcon-1706345678901"
 */
export function generateUniqueId(): string {
    return `${generateId()}-${Date.now()}`;
}
