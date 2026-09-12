/**
 * Regression tests for package metadata, focused on the dependency `overrides`
 * and lockfile updates that pin patched transitive dependency versions.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(join(currentDir, 'package.json'), 'utf-8'));
const packageLock = JSON.parse(readFileSync(join(currentDir, 'package-lock.json'), 'utf-8'));

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
        expect(packageJson.engines.node).toBe('>=18.18.0');
    });
});

describe('package-lock.json Vite resolution', () => {
    const vitePackage = packageLock.packages['node_modules/vite'];

    it('should lock Vite to the patched 7.3.6 release', () => {
        expect(vitePackage).toBeDefined();
        expect(vitePackage.version).toBe('7.3.6');
        expect(vitePackage.resolved).toBe('https://registry.npmjs.org/vite/-/vite-7.3.6.tgz');
        expect(vitePackage.integrity).toMatch(/^sha512-[A-Za-z0-9+/]+={0,2}$/);
    });

    it('should retain Vite as a development-only transitive dependency', () => {
        expect(vitePackage.dev).toBe(true);
        expect(vitePackage.dependencies.esbuild).toBe('^0.27.0 || ^0.28.0');
        expect(packageLock.packages[''].devDependencies.vite).toBeUndefined();
    });

    it('should not retain another stale or vulnerable Vite installation', () => {
        const viteInstallations = Object.entries(packageLock.packages)
            .filter(([packagePath]) => packagePath === 'node_modules/vite' || packagePath.endsWith('/node_modules/vite'))
            .map(([, metadata]) => (metadata as { version: string }).version);

        expect(viteInstallations).toEqual(['7.3.6']);
    });
});
