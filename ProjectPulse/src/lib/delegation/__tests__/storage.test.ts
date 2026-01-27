/**
 * Tests for delegation storage module, focusing on ID collision prevention.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
    createRequest,
    getDelegationsDir,
    getRequestPath,
    ensureDirs,
    readRequest,
    deleteRequest,
} from '../storage';
import { DelegationRequest } from '../types';

describe('storage - ID collision prevention', () => {
    let originalEnv: string | undefined;
    let tempBaseDir: string;

    beforeEach(async () => {
        // Save original env
        originalEnv = process.env.PROJECTPULSE_DELEGATIONS_DIR;

        // Create a temporary directory for tests
        tempBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-storage-test-'));
        process.env.PROJECTPULSE_DELEGATIONS_DIR = tempBaseDir;

        // Ensure directories exist
        await ensureDirs();
    });

    afterEach(() => {
        // Restore original env
        if (originalEnv !== undefined) {
            process.env.PROJECTPULSE_DELEGATIONS_DIR = originalEnv;
        } else {
            delete process.env.PROJECTPULSE_DELEGATIONS_DIR;
        }

        // Clean up temporary directory
        if (fs.existsSync(tempBaseDir)) {
            fs.rmSync(tempBaseDir, { recursive: true, force: true });
        }
    });

    describe('createRequest ID uniqueness', () => {
        it('should generate unique IDs for sequential requests', async () => {
            const ids = new Set<string>();
            const numRequests = 100;

            for (let i = 0; i < numRequests; i++) {
                const result = await createRequest({
                    parentSession: 'test-session',
                    sourceCli: 'auto',
                    targetCli: 'auto',
                    agent: 'explorer',
                    prompt: `Test prompt ${i}`,
                    workingDir: '/tmp',
                });

                expect(result.ok).toBe(true);
                if (result.ok && result.data) {
                    expect(ids.has(result.data.id)).toBe(false);
                    ids.add(result.data.id);
                }
            }

            expect(ids.size).toBe(numRequests);
        });

        it('should generate unique IDs even when created rapidly', async () => {
            const ids = new Set<string>();
            const numRequests = 50;

            // Create requests in parallel (simulating rapid creation)
            const promises = [];
            for (let i = 0; i < numRequests; i++) {
                promises.push(
                    createRequest({
                        parentSession: 'test-session',
                        sourceCli: 'auto',
                        targetCli: 'auto',
                        agent: 'explorer',
                        prompt: `Test prompt ${i}`,
                        workingDir: '/tmp',
                    })
                );
            }

            const results = await Promise.all(promises);

            results.forEach((result) => {
                expect(result.ok).toBe(true);
                if (result.ok && result.data) {
                    expect(ids.has(result.data.id)).toBe(false);
                    ids.add(result.data.id);
                }
            });

            expect(ids.size).toBe(numRequests);
        });

        it('should generate IDs with timestamp suffix', async () => {
            const result = await createRequest({
                parentSession: 'test-session',
                sourceCli: 'auto',
                targetCli: 'auto',
                agent: 'explorer',
                prompt: 'Test prompt',
                workingDir: '/tmp',
            });

            expect(result.ok).toBe(true);
            if (result.ok && result.data) {
                const id = result.data.id;
                const parts = id.split('-');
                
                // Should have 4 parts: adjective-color-animal-timestamp
                expect(parts.length).toBe(4);
                
                // Last part should be a timestamp (numeric)
                const timestamp = parts[3];
                expect(/^\d+$/.test(timestamp)).toBe(true);
                
                // Timestamp should be reasonable (within last few seconds)
                const timestampMs = parseInt(timestamp, 10);
                const now = Date.now();
                expect(timestampMs).toBeGreaterThan(now - 5000);
                expect(timestampMs).toBeLessThanOrEqual(now);
            }
        });

        it('should create files that do not overwrite existing ones', async () => {
            const result1 = await createRequest({
                parentSession: 'test-session',
                sourceCli: 'auto',
                targetCli: 'auto',
                agent: 'explorer',
                prompt: 'First prompt',
                workingDir: '/tmp',
            });

            const result2 = await createRequest({
                parentSession: 'test-session',
                sourceCli: 'auto',
                targetCli: 'auto',
                agent: 'explorer',
                prompt: 'Second prompt',
                workingDir: '/tmp',
            });

            expect(result1.ok).toBe(true);
            expect(result2.ok).toBe(true);

            if (result1.ok && result1.data && result2.ok && result2.data) {
                expect(result1.data.id).not.toBe(result2.data.id);

                // Read both requests and verify they have different prompts
                const request1 = await readRequest(result1.data.id);
                const request2 = await readRequest(result2.data.id);

                expect(request1).not.toBeNull();
                expect(request2).not.toBeNull();
                expect(request1?.prompt).toBe('First prompt');
                expect(request2?.prompt).toBe('Second prompt');

                // Clean up
                await deleteRequest(result1.data.id);
                await deleteRequest(result2.data.id);
            }
        });
    });

    describe('concurrent request creation stress test', () => {
        it('should handle 1000+ concurrent requests without collisions', async () => {
            const ids = new Set<string>();
            const numRequests = 1000;
            const batchSize = 100;

            // Create requests in batches to avoid overwhelming the system
            for (let batch = 0; batch < numRequests / batchSize; batch++) {
                const promises = [];
                
                for (let i = 0; i < batchSize; i++) {
                    promises.push(
                        createRequest({
                            parentSession: `session-${batch}-${i}`,
                            sourceCli: 'auto',
                            targetCli: 'auto',
                            agent: 'explorer',
                            prompt: `Concurrent test ${batch * batchSize + i}`,
                            workingDir: '/tmp',
                        })
                    );
                }

                const results = await Promise.all(promises);

                results.forEach((result) => {
                    expect(result.ok).toBe(true);
                    if (result.ok && result.data) {
                        expect(ids.has(result.data.id)).toBe(false);
                        ids.add(result.data.id);
                    }
                });
            }

            expect(ids.size).toBe(numRequests);

            // Clean up all requests
            const cleanupPromises = Array.from(ids).map((id) => deleteRequest(id));
            await Promise.all(cleanupPromises);
        }, 30000); // 30 second timeout for this stress test
    });

    describe('ID format validation', () => {
        it('should create IDs in the documented format', async () => {
            const result = await createRequest({
                parentSession: 'test-session',
                sourceCli: 'auto',
                targetCli: 'auto',
                agent: 'explorer',
                prompt: 'Test prompt',
                workingDir: '/tmp',
            });

            expect(result.ok).toBe(true);
            if (result.ok && result.data) {
                const id = result.data.id;
                
                // Format: adjective-color-animal-timestamp
                const parts = id.split('-');
                expect(parts.length).toBe(4);
                
                // Verify each part has content
                parts.forEach((part, index) => {
                    expect(part.length).toBeGreaterThan(0);
                });
            }
        });

        it('should write valid JSON files with all required fields', async () => {
            const result = await createRequest({
                parentSession: 'test-session-123',
                sourceCli: 'opencode',
                targetCli: 'auto',
                agent: 'reviewer',
                prompt: 'Review this code',
                workingDir: '/tmp',
                timeout: 600,
            });

            expect(result.ok).toBe(true);
            if (result.ok && result.data) {
                const request = await readRequest(result.data.id);
                
                expect(request).not.toBeNull();
                expect(request?.id).toBe(result.data.id);
                expect(request?.parentSession).toBe('test-session-123');
                expect(request?.sourceCli).toBe('opencode');
                expect(request?.targetCli).toBe('auto');
                expect(request?.agent).toBe('reviewer');
                expect(request?.prompt).toBe('Review this code');
                expect(request?.workingDir).toBe('/tmp');
                expect(request?.timeout).toBe(600);
                expect(request?.status).toBe('pending');
                expect(request?.createdAt).toBeTruthy();

                // Clean up
                await deleteRequest(result.data.id);
            }
        });
    });

    describe('error handling', () => {
        it('should handle filesystem errors gracefully', async () => {
            // Make directory read-only
            const readOnlyDir = path.join(tempBaseDir, 'readonly');
            fs.mkdirSync(readOnlyDir, { recursive: true });
            
            // Override PROJECTPULSE_DELEGATIONS_DIR to point to read-only dir
            process.env.PROJECTPULSE_DELEGATIONS_DIR = readOnlyDir;
            
            // Make pending directory if it doesn't exist
            const pendingDir = path.join(readOnlyDir, 'pending');
            if (!fs.existsSync(pendingDir)) {
                fs.mkdirSync(pendingDir, { recursive: true });
            }
            
            // Make it read-only
            fs.chmodSync(pendingDir, 0o444);

            const result = await createRequest({
                parentSession: 'test-session',
                sourceCli: 'auto',
                targetCli: 'auto',
                agent: 'explorer',
                prompt: 'Test prompt',
                workingDir: '/tmp',
            });

            expect(result.ok).toBe(false);
            expect(result.error).toBeTruthy();
            expect(result.error).toMatch(/Failed to create delegation request/);

            // Restore write permissions for cleanup
            try {
                fs.chmodSync(pendingDir, 0o755);
            } catch (err) {
                // Ignore errors during cleanup
            }
        });
    });
});
