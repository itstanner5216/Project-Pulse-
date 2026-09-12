/**
 * Tests for the Vitest configuration itself, covering the exclude pattern
 * and coverage settings introduced/maintained in vitest.config.ts.
 */

import { describe, it, expect } from 'vitest';
import { configDefaults } from 'vitest/config';
import vitestConfig from './vitest.config';

describe('vitest.config', () => {
    it('should enable global test APIs', () => {
        expect(vitestConfig.test?.globals).toBe(true);
    });

    it('should use the node test environment', () => {
        expect(vitestConfig.test?.environment).toBe('node');
    });

    it('should exclude build output (dist) in addition to the default exclude patterns', () => {
        const exclude = vitestConfig.test?.exclude ?? [];

        expect(exclude).toContain('**/dist/**');
        for (const pattern of configDefaults.exclude) {
            expect(exclude).toContain(pattern);
        }
    });

    it('should not add unexpected extra exclude patterns beyond the defaults plus dist', () => {
        const exclude = vitestConfig.test?.exclude ?? [];

        expect(exclude.length).toBe(configDefaults.exclude.length + 1);
    });

    it('should preserve the relative ordering of the default exclude patterns', () => {
        const exclude = vitestConfig.test?.exclude ?? [];
        const excludedDefaults = exclude.slice(0, configDefaults.exclude.length);

        expect(excludedDefaults).toEqual(configDefaults.exclude);
    });

    it('should configure v8 coverage with text/json/html reporters', () => {
        const coverage = vitestConfig.test?.coverage as Record<string, unknown> | undefined;

        expect(coverage?.provider).toBe('v8');
        expect(coverage?.reporter).toEqual(['text', 'json', 'json-summary', 'html']);
        expect(coverage?.reportsDirectory).toBe('./coverage');
    });

    it('should enforce 70% coverage thresholds for all metrics', () => {
        const coverage = vitestConfig.test?.coverage as Record<string, unknown> | undefined;

        expect(coverage?.lines).toBe(70);
        expect(coverage?.functions).toBe(70);
        expect(coverage?.branches).toBe(70);
        expect(coverage?.statements).toBe(70);
    });

    it('should exclude non-source files from coverage collection', () => {
        const coverage = vitestConfig.test?.coverage as Record<string, unknown> | undefined;

        expect(coverage?.exclude).toEqual(
            expect.arrayContaining([
                'node_modules/**',
                'dist/**',
                'tests/**',
                '**/*.d.ts',
                '**/*.config.*',
                '**/index.ts',
            ])
        );
    });

    it('should collect coverage across all src TypeScript files', () => {
        const coverage = vitestConfig.test?.coverage as Record<string, unknown> | undefined;

        expect(coverage?.include).toEqual(['src/**/*.ts']);
        expect(coverage?.all).toBe(true);
    });
});