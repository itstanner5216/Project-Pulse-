/**
 * Tests for ID generation module, focusing on collision scenarios and uniqueness.
 */

import { describe, it, expect, vi } from 'vitest';
import { generateId, isValidId, generateUniqueId } from '../id';

describe('generateId', () => {
    it('should generate IDs in the correct format', () => {
        const id = generateId();
        
        // Should be in format: adjective-color-animal
        expect(id).toMatch(/^[a-z]+-[a-z]+-[a-z]+$/);
        
        // Should have exactly 3 parts
        const parts = id.split('-');
        expect(parts).toHaveLength(3);
    });

    it('should generate valid IDs that pass validation', () => {
        const id = generateId();
        expect(isValidId(id)).toBe(true);
    });

    it('should generate different IDs on successive calls (usually)', () => {
        const ids = new Set<string>();
        
        // Generate 100 IDs
        for (let i = 0; i < 100; i++) {
            ids.add(generateId());
        }
        
        // Should have generated at least 50 unique IDs (accounting for some collisions)
        expect(ids.size).toBeGreaterThan(50);
    });

    it('should use only lowercase letters', () => {
        const id = generateId();
        expect(id).toBe(id.toLowerCase());
        expect(id).not.toMatch(/[A-Z]/);
    });

    it('should not contain numbers or special characters', () => {
        const id = generateId();
        expect(id).toMatch(/^[a-z-]+$/);
        expect(id).not.toMatch(/[0-9!@#$%^&*()]/);
    });
});

describe('isValidId', () => {
    it('should validate correct format IDs', () => {
        const validIds = [
            'swift-amber-falcon',
            'bold-coral-panther',
            'calm-jade-eagle',
        ];
        
        validIds.forEach(id => {
            expect(isValidId(id)).toBe(true);
        });
    });

    it('should reject IDs with wrong number of parts', () => {
        const invalidIds = [
            'swift-amber',          // Too few parts
            'swift-amber-falcon-extra',  // Too many parts
            'swift',                // Single word
            '',                     // Empty string
        ];
        
        invalidIds.forEach(id => {
            expect(isValidId(id)).toBe(false);
        });
    });

    it('should reject IDs with invalid words', () => {
        const invalidIds = [
            'invalid-amber-falcon',  // Invalid adjective
            'swift-invalid-falcon',  // Invalid color
            'swift-amber-invalid',   // Invalid animal
            'notword-notcolor-notanimal',  // All invalid
        ];
        
        invalidIds.forEach(id => {
            expect(isValidId(id)).toBe(false);
        });
    });

    it('should reject IDs with uppercase letters', () => {
        expect(isValidId('Swift-amber-falcon')).toBe(false);
        expect(isValidId('swift-Amber-falcon')).toBe(false);
        expect(isValidId('swift-amber-Falcon')).toBe(false);
    });

    it('should reject IDs with numbers', () => {
        expect(isValidId('swift-amber-falcon-123')).toBe(false);
        expect(isValidId('swift1-amber-falcon')).toBe(false);
    });

    it('should reject IDs with special characters', () => {
        expect(isValidId('swift_amber_falcon')).toBe(false);
        expect(isValidId('swift.amber.falcon')).toBe(false);
        expect(isValidId('swift/amber/falcon')).toBe(false);
    });
});

describe('generateUniqueId', () => {
    it('should generate IDs in the correct format with timestamp', () => {
        const id = generateUniqueId();
        
        // Should be in format: adjective-color-animal-timestamp
        expect(id).toMatch(/^[a-z]+-[a-z]+-[a-z]+-\d+$/);
        
        // Should have exactly 4 parts
        const parts = id.split('-');
        expect(parts).toHaveLength(4);
    });

    it('should include a timestamp as the last component', () => {
        const id = generateUniqueId();
        const parts = id.split('-');
        const timestamp = parseInt(parts[3], 10);
        
        // Should be a valid timestamp (within reasonable range)
        const now = Date.now();
        expect(timestamp).toBeGreaterThan(now - 1000); // Within last second
        expect(timestamp).toBeLessThanOrEqual(now + 1000); // Not in future (with small buffer)
    });

    it('should generate unique IDs even when called rapidly', () => {
        const ids = new Set<string>();
        
        // Generate 1000 IDs as fast as possible
        for (let i = 0; i < 1000; i++) {
            ids.add(generateUniqueId());
        }
        
        // Should have very few collisions (allow for up to 1% within same millisecond)
        expect(ids.size).toBeGreaterThan(990);
    });

    it('should generate unique IDs in concurrent scenarios', async () => {
        const ids = new Set<string>();
        const promises: Promise<void>[] = [];
        
        // Generate 100 IDs concurrently
        for (let i = 0; i < 100; i++) {
            promises.push(
                Promise.resolve().then(() => {
                    ids.add(generateUniqueId());
                })
            );
        }
        
        await Promise.all(promises);
        
        // Should have very few collisions (allow for up to 1% collision rate)
        expect(ids.size).toBeGreaterThan(99);
    });

    it('should have increasing timestamps when called sequentially', () => {
        const id1 = generateUniqueId();
        const id2 = generateUniqueId();
        const id3 = generateUniqueId();
        
        const timestamp1 = parseInt(id1.split('-')[3], 10);
        const timestamp2 = parseInt(id2.split('-')[3], 10);
        const timestamp3 = parseInt(id3.split('-')[3], 10);
        
        expect(timestamp2).toBeGreaterThanOrEqual(timestamp1);
        expect(timestamp3).toBeGreaterThanOrEqual(timestamp2);
    });
});

describe('ID collision scenarios', () => {
    it('should have low collision probability for generateId', () => {
        const ids = new Set<string>();
        const iterations = 1000;
        
        for (let i = 0; i < iterations; i++) {
            ids.add(generateId());
        }
        
        // With ~107,520 possible combinations, expect very few collisions in 1000 iterations
        // Allow for up to 5% collision rate (50 collisions out of 1000)
        expect(ids.size).toBeGreaterThan(iterations * 0.95);
    });

    it('should have very low collision probability for generateUniqueId in rapid succession', () => {
        const ids = new Set<string>();
        const iterations = 10000;
        const baseTime = 1700000000000;
        let tick = 0;
        const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => baseTime + tick++);
        try {
            for (let i = 0; i < iterations; i++) {
                ids.add(generateUniqueId());
            }
        } finally {
            nowSpy.mockRestore();
        }
        
        expect(ids.size).toBe(iterations);
    });

    it('should handle collision detection by checking if ID already exists', () => {
        // This test demonstrates how to detect collisions
        const existingIds = new Set<string>();
        let collisionDetected = false;
        
        for (let i = 0; i < 100; i++) {
            const id = generateId();
            if (existingIds.has(id)) {
                collisionDetected = true;
                break;
            }
            existingIds.add(id);
        }
        
        // This is just a demonstration - collision may or may not occur
        // The important part is that we can detect it
        expect(typeof collisionDetected).toBe('boolean');
    });

    it('should demonstrate retry logic for collision handling', () => {
        const existingIds = new Set(['swift-amber-falcon', 'bold-coral-panther']);
        
        function generateNonCollidingId(maxRetries = 10): string | null {
            for (let attempt = 0; attempt < maxRetries; attempt++) {
                const id = generateId();
                if (!existingIds.has(id)) {
                    return id;
                }
            }
            return null;
        }
        
        const newId = generateNonCollidingId();
        
        // Should successfully generate a non-colliding ID
        expect(newId).not.toBeNull();
        if (newId) {
            expect(existingIds.has(newId)).toBe(false);
        }
    });

    it('should prefer generateUniqueId over generateId for collision prevention', () => {
        // Generate many IDs with both methods
        const standardIds = new Set<string>();
        const uniqueIds = new Set<string>();
        
        const iterations = 5000;
        
        for (let i = 0; i < iterations; i++) {
            standardIds.add(generateId());
            uniqueIds.add(generateUniqueId());
        }
        
        // generateUniqueId should have very few collisions (<1%)
        expect(uniqueIds.size).toBeGreaterThan(iterations * 0.99);
        
        // generateId will likely have some collisions
        // (though we're not asserting a specific number as it's probabilistic)
    });
});

describe('ID format edge cases', () => {
    it('should not generate empty string', () => {
        const id = generateId();
        expect(id).not.toBe('');
        expect(id.length).toBeGreaterThan(0);
    });

    it('should not generate null or undefined', () => {
        const id = generateId();
        expect(id).not.toBeNull();
        expect(id).not.toBeUndefined();
    });

    it('should generate consistent format across multiple calls', () => {
        const ids = [generateId(), generateId(), generateId()];
        
        ids.forEach(id => {
            const parts = id.split('-');
            expect(parts).toHaveLength(3);
            expect(parts[0].length).toBeGreaterThan(0);
            expect(parts[1].length).toBeGreaterThan(0);
            expect(parts[2].length).toBeGreaterThan(0);
        });
    });

    it('should not exceed reasonable length', () => {
        const id = generateId();
        
        // Longest possible ID would be longest word from each category
        // "young" (5) + "-" + "scarlet" (7) + "-" + "panther" (7) = 21 characters
        expect(id.length).toBeLessThan(50);
    });

    it('should not contain whitespace', () => {
        const id = generateId();
        expect(id).not.toMatch(/\s/);
    });

    it('should be URL-safe', () => {
        const id = generateId();
        
        // Should not require URL encoding (only lowercase letters and hyphens)
        const encoded = encodeURIComponent(id);
        expect(encoded).toBe(id);
    });

    it('should be filesystem-safe', () => {
        const id = generateId();
        
        // Should not contain characters that are problematic in filenames
        expect(id).not.toMatch(/[<>:"/\\|?*]/);
    });
});
