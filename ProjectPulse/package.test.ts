/**
 * Regression tests for package.json, focused on the dependency `overrides`
 * introduced to pin patched versions of rollup and minimatch (transitive
 * dependency security fixes).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(join(currentDir, 'package.json'), 'utf-8'));

describe('package.json overrides', () => {
    it('should define an overrides section', () => {
        expect(packageJson.overrides).toBeDefined();
        expect(typeof packageJson.overrides).toBe('object');
    });

    it('should pin rollup to a patched version range', () => {
        expect(packageJson.overrides.rollup).toBe('^4.59.0');
    });

    it('should pin minimatch to a patched version range', () => {
        expect(packageJson.overrides.minimatch).toBe('^9.0.7');
    });

    it('should declare overrides using valid caret semver range syntax', () => {
        const semverRangePattern = /^\^\d+\.\d+\.\d+$/;

        for (const range of Object.values(packageJson.overrides)) {
            expect(range).toMatch(semverRangePattern);
        }
    });

    it('should not remove other expected package.json fields', () => {
        expect(packageJson.name).toBe('projectpulse');
        expect(packageJson.scripts.test).toBe('vitest');
        expect(packageJson.engines.node).toBe('>=18.0.0');
    });
});