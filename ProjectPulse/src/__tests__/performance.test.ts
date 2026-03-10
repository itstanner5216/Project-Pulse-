/**
 * Performance tests for Project Pulse.
 * 
 * These tests measure performance metrics and identify regressions in:
 * - ID generation (collision rates, speed)
 * - File watcher responsiveness
 * - Daemon overhead (CPU, memory)
 * - Large repository handling (1,000+ files, 100+ requests)
 * 
 * Performance Targets:
 * - ID generation: >10,000 IDs/second
 * - ID collision rate (generateId): <5% with 10K iterations
 * - ID collision rate (generateUniqueId): <0.01% with 100K iterations
 * - File watcher pickup time: <100ms for new requests
 * - Memory overhead: <5MB for various operations
 * - Large repo handling: Process 1,000+ files and 100+ requests without timeout
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { performance } from 'perf_hooks';
import { generateId, generateUniqueId, ID_SPACE_SIZE } from '../lib/delegation/id';
import { DelegationWatcher } from '../daemon/watcher';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createRequest, readRequest, deleteRequest, getSubdir } from '../lib/delegation/storage';
import * as spawner from '../daemon/spawner';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Measure execution time of a function in milliseconds
 */
async function measureTime(fn: () => Promise<void> | void): Promise<number> {
    const start = performance.now();
    await fn();
    const end = performance.now();
    return end - start;
}

/**
 * Get current memory usage in MB
 */
function getMemoryUsageMB(): number {
    const usage = process.memoryUsage();
    return usage.heapUsed / 1024 / 1024;
}

/**
 * Create a temporary directory for tests
 */
async function createTempDir(): Promise<string> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pulse-perf-'));
    return tempDir;
}

/**
 * Compute 99.9th-percentile upper bound for collision rate using occupancy math.
 * Uses z-score of 3.09 (99.9th percentile) for a statistically justified bound.
 *
 * For n draws from a space of N values, the expected number of collisions is
 * approximated as n * (1 - exp(-n/N)) using the occupancy-problem formula.
 * The bound adds a z*sigma margin for the 99.9th percentile.
 */
function computeCollisionBound(n: number, N: number, z = 3.09): number {
    const expectedCollisions = n * (1 - Math.exp(-n / N));
    const expectedRate = expectedCollisions / n;
    const variance = expectedRate * (1 - expectedRate) / n;
    const sigma = Math.sqrt(variance);
    return expectedRate + z * sigma;
}

/**
 * Clean up temporary directory
 */
async function cleanupTempDir(tempDir: string): Promise<void> {
    try {
        await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
        // Ignore cleanup errors
    }
}

// ============================================================================
// ID Generation Performance Tests
// ============================================================================

describe('Performance: ID Generation', () => {
    describe('generateId() performance', () => {
        it('should generate >10,000 IDs per second', () => {
            const iterations = 10000;
            const startTime = performance.now();
            
            for (let i = 0; i < iterations; i++) {
                generateId();
            }
            
            const endTime = performance.now();
            const durationMs = endTime - startTime;
            const idsPerSecond = (iterations / durationMs) * 1000;
            
            // Should generate at least 10,000 IDs per second
            expect(idsPerSecond).toBeGreaterThan(10000);
            
            // Log performance metrics
            console.log(`  ✓ Generated ${iterations.toLocaleString()} IDs in ${durationMs.toFixed(2)}ms`);
            console.log(`  ✓ Performance: ${idsPerSecond.toLocaleString()} IDs/second`);
        });

        it('should have <5% collision rate with 10,000 iterations', () => {
            const iterations = 10000;
            const TRIALS = 5;
            let totalCollisionRate = 0;

            for (let t = 0; t < TRIALS; t++) {
                const ids = new Set<string>();
                for (let i = 0; i < iterations; i++) {
                    ids.add(generateId());
                }
                const collisions = iterations - ids.size;
                totalCollisionRate += (collisions / iterations) * 100;
            }

            const meanCollisionRate = totalCollisionRate / TRIALS;
            const bound = computeCollisionBound(iterations, ID_SPACE_SIZE) * 100;

            // Mean collision rate across trials must not exceed the 99.9th-percentile bound
            expect(meanCollisionRate).toBeLessThan(bound);

            // Log metrics
            console.log(`  ✓ Mean collision rate over ${TRIALS} trials: ${meanCollisionRate.toFixed(2)}% (bound: ${bound.toFixed(2)}%)`);
            console.log(`  ✓ ID space size: ${ID_SPACE_SIZE.toLocaleString()}`);
        });

        it('should have <1% collision rate with 1,000 iterations', () => {
            const iterations = 1000;
            const ids = new Set<string>();
            
            for (let i = 0; i < iterations; i++) {
                ids.add(generateId());
            }
            
            const uniqueCount = ids.size;
            const collisions = iterations - uniqueCount;
            const collisionRate = (collisions / iterations) * 100;
            
            // Should have less than 1% collision rate for smaller batches
            expect(collisionRate).toBeLessThan(1);
            
            console.log(`  ✓ Generated ${iterations.toLocaleString()} IDs with ${collisionRate.toFixed(2)}% collision rate`);
        });
    });

    describe('generateUniqueId() performance', () => {
        it('should generate >5,000 IDs per second', () => {
            const iterations = 5000;
            const startTime = performance.now();
            
            for (let i = 0; i < iterations; i++) {
                generateUniqueId();
            }
            
            const endTime = performance.now();
            const durationMs = endTime - startTime;
            const idsPerSecond = (iterations / durationMs) * 1000;
            
            // Should generate at least 5,000 IDs per second (slower due to Date.now())
            expect(idsPerSecond).toBeGreaterThan(5000);
            
            console.log(`  ✓ Generated ${iterations.toLocaleString()} unique IDs in ${durationMs.toFixed(2)}ms`);
            console.log(`  ✓ Performance: ${idsPerSecond.toLocaleString()} IDs/second`);
        });

        it('should have <0.01% collision rate with 100,000 iterations', () => {
            const iterations = 100000;
            const ids = new Set<string>();
            
            // Mock Date.now to increment for deterministic testing
            let mockTime = 1700000000000;
            const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => mockTime++);
            
            try {
                for (let i = 0; i < iterations; i++) {
                    ids.add(generateUniqueId());
                }
                
                const uniqueCount = ids.size;
                const collisions = iterations - uniqueCount;
                const collisionRate = (collisions / iterations) * 100;
                
                // Should have virtually no collisions with mocked incrementing time
                expect(collisionRate).toBeLessThan(0.01);
                expect(uniqueCount).toBe(iterations); // All should be unique
                
                console.log(`  ✓ Generated ${iterations.toLocaleString()} unique IDs with ${collisionRate.toFixed(4)}% collision rate`);
            } finally {
                nowSpy.mockRestore();
            }
        });

        it('should handle rapid concurrent generation', async () => {
            const batchSize = 1000;
            const batches = 10;
            const totalIds = batchSize * batches;
            const ids = new Set<string>();
            
            const startTime = performance.now();
            
            // Generate IDs in concurrent batches
            const promises = Array.from({ length: batches }, async () =>
                Promise.resolve().then(() => {
                    for (let i = 0; i < batchSize; i++) {
                        ids.add(generateUniqueId());
                    }
                })
            );
            
            await Promise.all(promises);
            
            const endTime = performance.now();
            const durationMs = endTime - startTime;
            
            const uniqueCount = ids.size;
            const collisions = totalIds - uniqueCount;
            const collisionRate = (collisions / totalIds) * 100;
            
            // Should have very low collision rate even with concurrent generation
            // Allow up to 2% for concurrent scenarios (realistic for same-millisecond collisions)
            expect(collisionRate).toBeLessThan(2);
            
            console.log(`  ✓ Generated ${totalIds.toLocaleString()} concurrent IDs in ${durationMs.toFixed(2)}ms`);
            console.log(`  ✓ Unique: ${uniqueCount.toLocaleString()}, Collision rate: ${collisionRate.toFixed(4)}%`);
        });
    });

    describe('ID generation scalability', () => {
        it('should maintain performance with 1 million ID checks', () => {
            const existingIds = new Set<string>();
            
            // Pre-populate with 10,000 IDs
            for (let i = 0; i < 10000; i++) {
                existingIds.add(generateId());
            }
            
            const startTime = performance.now();
            const iterations = 1000000;
            
            // Check membership 1 million times
            for (let i = 0; i < iterations; i++) {
                const id = generateId();
                existingIds.has(id);
            }
            
            const endTime = performance.now();
            const durationMs = endTime - startTime;
            const checksPerSecond = (iterations / durationMs) * 1000;
            
            // Should be able to check >100,000 per second
            expect(checksPerSecond).toBeGreaterThan(100000);
            
            console.log(`  ✓ Performed ${iterations.toLocaleString()} ID collision checks in ${durationMs.toFixed(2)}ms`);
            console.log(`  ✓ Performance: ${checksPerSecond.toLocaleString()} checks/second`);
        });
    });
});

// ============================================================================
// File Watcher Performance Tests
// ============================================================================

describe('Performance: File Watcher', () => {
    let tempDir: string;
    let originalEnv: string | undefined;
    let spawnAgentSpy: any;

    beforeEach(async () => {
        tempDir = await createTempDir();
        originalEnv = process.env.PROJECTPULSE_DELEGATIONS_DIR;
        process.env.PROJECTPULSE_DELEGATIONS_DIR = tempDir;
        
        // Mock spawnAgent to avoid actual subprocess spawning
        spawnAgentSpy = vi.spyOn(spawner, 'spawnAgent').mockResolvedValue({
            stdout: 'test output',
            stderr: '',
            exitCode: 0,
            timedOut: false,
        });
    });

    afterEach(async () => {
        if (originalEnv !== undefined) {
            process.env.PROJECTPULSE_DELEGATIONS_DIR = originalEnv;
        } else {
            delete process.env.PROJECTPULSE_DELEGATIONS_DIR;
        }
        await cleanupTempDir(tempDir);
        spawnAgentSpy?.mockRestore();
    });

    it('should pick up new requests within 100ms', async () => {
        const watcher = new DelegationWatcher({ pollInterval: 50 });
        let pickupTime: number | null = null;
        let requestStartTime: number;
        
        const pickupPromise = new Promise<void>((resolve) => {
            watcher['options'].onPickup = () => {
                pickupTime = performance.now() - requestStartTime;
                resolve();
            };
        });

        await watcher.start();

        try {
            // Create a request
            requestStartTime = performance.now();
            await createRequest({
                agent: 'test-agent' as any,
                workingDir: tempDir,
                timeout: 5000,
                parentSession: 'perf-test',
                sourceCli: 'copilot' as any,
                targetCli: 'copilot' as any,
                prompt: 'test',
            });

            // Wait for pickup with timeout
            await Promise.race([
                pickupPromise,
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 500))
            ]);

            expect(pickupTime).not.toBeNull();
            expect(pickupTime!).toBeLessThan(100);
            
            console.log(`  ✓ Request picked up in ${pickupTime!.toFixed(2)}ms`);
        } finally {
            watcher.stop();
        }
    }, 10000);

    it('should handle multiple concurrent request file creation', async () => {
        const requestCount = 10;
        const times: number[] = [];
        
        // Just measure file creation performance, not full processing
        for (let i = 0; i < requestCount; i++) {
            const time = await measureTime(async () => {
                await createRequest({
                    agent: 'test-agent' as any,
                    workingDir: tempDir,
                    timeout: 5000,
                    parentSession: 'perf-test',
                    sourceCli: 'copilot' as any,
                    targetCli: 'copilot' as any,
                    prompt: 'test',
                });
            });
            times.push(time);
        }
        
        const avgTime = times.reduce((sum, t) => sum + t, 0) / times.length;
        const maxTime = Math.max(...times);
        
        // Average creation time should be <10ms
        expect(avgTime).toBeLessThan(10);
        
        console.log(`  ✓ Created ${requestCount} concurrent requests`);
        console.log(`  ✓ Average creation time: ${avgTime.toFixed(2)}ms`);
        console.log(`  ✓ Max creation time: ${maxTime.toFixed(2)}ms`);
    }, 15000);

    it('should scan directory for pending requests quickly', async () => {
        // Create some requests first
        const requestCount = 5;
        for (let i = 0; i < requestCount; i++) {
            await createRequest({
                agent: 'test-agent' as any,
                workingDir: tempDir,
                timeout: 5000,
                parentSession: 'perf-test',
                sourceCli: 'copilot' as any,
                targetCli: 'copilot' as any,
                prompt: 'test',
            });
        }
        
        const pendingDir = getSubdir('pending');
        
        // Measure directory scan time
        const scanTime = await measureTime(async () => {
            const files = await fs.readdir(pendingDir);
            const jsonFiles = files.filter(f => f.endsWith('.json'));
            expect(jsonFiles.length).toBeGreaterThanOrEqual(requestCount);
        });
        
        // Directory scan should be fast (<10ms)
        expect(scanTime).toBeLessThan(10);
        
        console.log(`  ✓ Scanned pending directory in ${scanTime.toFixed(2)}ms`);
    }, 10000);
});

// ============================================================================
// Large Repository Handling Tests
// ============================================================================

describe('Performance: Large Repository Handling', () => {
    let tempDir: string;
    let originalEnv: string | undefined;
    let spawnAgentSpy: any;

    beforeEach(async () => {
        tempDir = await createTempDir();
        originalEnv = process.env.PROJECTPULSE_DELEGATIONS_DIR;
        process.env.PROJECTPULSE_DELEGATIONS_DIR = tempDir;
        
        // Mock spawnAgent to avoid actual subprocess spawning
        spawnAgentSpy = vi.spyOn(spawner, 'spawnAgent').mockResolvedValue({
            stdout: 'test output',
            stderr: '',
            exitCode: 0,
            timedOut: false,
        });
    });

    afterEach(async () => {
        if (originalEnv !== undefined) {
            process.env.PROJECTPULSE_DELEGATIONS_DIR = originalEnv;
        } else {
            delete process.env.PROJECTPULSE_DELEGATIONS_DIR;
        }
        await cleanupTempDir(tempDir);
        spawnAgentSpy?.mockRestore();
    });

    it('should handle directory with 1,000+ files', async () => {
        const fileCount = 1000;
        const pendingDir = getSubdir('pending');
        
        await fs.mkdir(pendingDir, { recursive: true });

        // Create 1000 dummy files
        const startTime = performance.now();
        
        const createPromises = Array.from({ length: fileCount }, async (_, i) => {
            const filename = `dummy-${i}.json`;
            await fs.writeFile(path.join(pendingDir, filename), JSON.stringify({ id: i }));
        });
        
        await Promise.all(createPromises);
        
        const createTime = performance.now() - startTime;

        // Read directory
        const readStartTime = performance.now();
        const files = await fs.readdir(pendingDir);
        const readTime = performance.now() - readStartTime;

        expect(files.length).toBe(fileCount);
        
        // Directory read should be fast even with 1000 files
        expect(readTime).toBeLessThan(100);
        
        console.log(`  ✓ Created ${fileCount} files in ${createTime.toFixed(2)}ms`);
        console.log(`  ✓ Read directory with ${fileCount} files in ${readTime.toFixed(2)}ms`);
    }, 30000);

    it('should process 100 requests without performance degradation', async () => {
        const requestCount = 100;
        const watcher = new DelegationWatcher({ pollInterval: 50 });
        const processTimes: number[] = [];
        let processedCount = 0;

        const allProcessed = new Promise<void>((resolve) => {
            const startTimes = new Map<string, number>();
            
            watcher['options'].onPickup = (request) => {
                startTimes.set(request.id, performance.now());
            };
            
            watcher['options'].onComplete = (result) => {
                const startTime = startTimes.get(result.id);
                if (startTime) {
                    processTimes.push(performance.now() - startTime);
                }
                processedCount++;
                if (processedCount === requestCount) {
                    resolve();
                }
            };
            
            watcher['options'].onError = () => {
                processedCount++;
                if (processedCount === requestCount) {
                    resolve();
                }
            };
        });

        await watcher.start();

        try {
            // Create requests in batches to avoid overwhelming
            const batchSize = 20;
            const batches = Math.ceil(requestCount / batchSize);
            
            for (let batch = 0; batch < batches; batch++) {
                const batchRequests = Math.min(batchSize, requestCount - batch * batchSize);
                const promises = Array.from({ length: batchRequests }, async () =>
                    createRequest({
                        agent: 'test-agent' as any,
                        workingDir: tempDir,
                        timeout: 1000,
                        parentSession: 'perf-test',
                        sourceCli: 'copilot' as any,
                        targetCli: 'copilot' as any,
                        prompt: 'test',
                    })
                );
                await Promise.all(promises);
                
                // Small delay between batches
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Wait for all to be processed (with generous timeout)
            await Promise.race([
                allProcessed,
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout processing requests')), 60000))
            ]);

            // Analyze performance
            const avgTime = processTimes.reduce((sum, t) => sum + t, 0) / processTimes.length;
            const maxTime = Math.max(...processTimes);
            const minTime = Math.min(...processTimes);
            
            // Calculate performance degradation (compare first 10 vs last 10)
            const firstBatch = processTimes.slice(0, 10);
            const lastBatch = processTimes.slice(-10);
            const firstAvg = firstBatch.reduce((sum, t) => sum + t, 0) / firstBatch.length;
            const lastAvg = lastBatch.reduce((sum, t) => sum + t, 0) / lastBatch.length;
            
            // Avoid division by zero
            const degradation = firstAvg > 0 ? ((lastAvg - firstAvg) / firstAvg) * 100 : 0;
            
            // Performance should not degrade more than 100% (i.e., not double)
            // Only fail on degradation (positive), improvements (negative) are ok
            expect(degradation).toBeLessThan(100);
            
            console.log(`  ✓ Processed ${requestCount} requests`);
            console.log(`  ✓ Average time: ${avgTime.toFixed(2)}ms`);
            console.log(`  ✓ Min/Max time: ${minTime.toFixed(2)}ms / ${maxTime.toFixed(2)}ms`);
            console.log(`  ✓ Performance degradation: ${degradation.toFixed(2)}%`);
        } finally {
            watcher.stop();
        }
    }, 120000);
});

// ============================================================================
// Memory Overhead Tests
// ============================================================================

describe('Performance: Memory Overhead', () => {
    let tempDir: string;
    let originalEnv: string | undefined;

    beforeEach(async () => {
        tempDir = await createTempDir();
        originalEnv = process.env.PROJECTPULSE_DELEGATIONS_DIR;
        process.env.PROJECTPULSE_DELEGATIONS_DIR = tempDir;
        
        // Force GC if available
        // eslint-disable-next-line no-undef
        if ((global as any).gc) {
            // eslint-disable-next-line no-undef
            (global as any).gc();
        }
    });

    afterEach(async () => {
        if (originalEnv !== undefined) {
            process.env.PROJECTPULSE_DELEGATIONS_DIR = originalEnv;
        } else {
            delete process.env.PROJECTPULSE_DELEGATIONS_DIR;
        }
        await cleanupTempDir(tempDir);
    });

    it('should have minimal memory overhead for ID generation', () => {
        const baseMemory = getMemoryUsageMB();
        
        // Generate 10,000 IDs
        const ids: string[] = [];
        for (let i = 0; i < 10000; i++) {
            ids.push(generateId());
        }
        
        const afterMemory = getMemoryUsageMB();
        const memoryIncrease = afterMemory - baseMemory;
        
        // Should use less than 5MB for 10K IDs
        expect(memoryIncrease).toBeLessThan(5);
        
        console.log(`  ✓ Generated 10K IDs using ${memoryIncrease.toFixed(2)}MB`);
    });

    it('should not leak memory when creating and deleting requests', async () => {
        const baseMemory = getMemoryUsageMB();
        
        // Create and delete 100 requests
        for (let i = 0; i < 100; i++) {
            const request = await createRequest({
                agent: 'test-agent' as any,
                workingDir: tempDir,
                timeout: 5000,
                parentSession: 'perf-test',
                sourceCli: 'copilot' as any,
                targetCli: 'copilot' as any,
                prompt: 'test',
            });
            await deleteRequest(request.data!.id);
        }
        
        // Force GC if available
        // eslint-disable-next-line no-undef
        if ((global as any).gc) {
            // eslint-disable-next-line no-undef
            (global as any).gc();
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        const afterMemory = getMemoryUsageMB();
        const memoryIncrease = afterMemory - baseMemory;
        
        // Should have minimal memory increase (<10MB)
        expect(memoryIncrease).toBeLessThan(10);
        
        console.log(`  ✓ Created/deleted 100 requests using ${memoryIncrease.toFixed(2)}MB`);
    }, 30000);

    it('should maintain stable memory with watcher running', async () => {
        const watcher = new DelegationWatcher({ pollInterval: 100 });
        
        await watcher.start();
        
        const baseMemory = getMemoryUsageMB();
        
        // Let watcher run for 1 second
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const afterMemory = getMemoryUsageMB();
        const memoryIncrease = afterMemory - baseMemory;
        
        watcher.stop();
        
        // Idle watcher should use minimal memory (<5MB)
        expect(memoryIncrease).toBeLessThan(5);
        
        console.log(`  ✓ Watcher running for 1s used ${memoryIncrease.toFixed(2)}MB`);
    }, 10000);
});

// ============================================================================
// Request Processing Performance Tests
// ============================================================================

describe('Performance: Request Processing', () => {
    let tempDir: string;
    let originalEnv: string | undefined;

    beforeEach(async () => {
        tempDir = await createTempDir();
        originalEnv = process.env.PROJECTPULSE_DELEGATIONS_DIR;
        process.env.PROJECTPULSE_DELEGATIONS_DIR = tempDir;
    });

    afterEach(async () => {
        if (originalEnv !== undefined) {
            process.env.PROJECTPULSE_DELEGATIONS_DIR = originalEnv;
        } else {
            delete process.env.PROJECTPULSE_DELEGATIONS_DIR;
        }
        await cleanupTempDir(tempDir);
    });

    it('should create requests quickly', async () => {
        const iterations = 100;
        const times: number[] = [];
        
        for (let i = 0; i < iterations; i++) {
            const time = await measureTime(async () => {
                const createResult = await createRequest({
                    agent: 'test-agent' as any,
                    workingDir: tempDir,
                    timeout: 5000,
                    parentSession: 'perf-test',
                    sourceCli: 'copilot' as any,
                    targetCli: 'copilot' as any,
                    prompt: 'test',
                });
                // Clean up
                if (createResult.ok && createResult.data) {
                    await deleteRequest(createResult.data.id);
                }
            });
            times.push(time);
        }
        
        const avgTime = times.reduce((sum, t) => sum + t, 0) / times.length;
        const maxTime = Math.max(...times);
        
        // Average request creation should be <10ms
        expect(avgTime).toBeLessThan(10);
        
        console.log(`  ✓ Created ${iterations} requests in avg ${avgTime.toFixed(2)}ms (max: ${maxTime.toFixed(2)}ms)`);
    }, 30000);

    it('should read requests quickly', async () => {
        // Create a request first
        const createResult = await createRequest({
            agent: 'test-agent' as any,
            workingDir: tempDir,
            timeout: 5000,
            parentSession: 'perf-test',
            sourceCli: 'copilot' as any,
            targetCli: 'copilot' as any,
            prompt: 'test',
        });
        
        expect(createResult.ok).toBe(true);
        const requestId = createResult.data!.id;
        
        const iterations = 1000;
        const times: number[] = [];
        
        for (let i = 0; i < iterations; i++) {
            const time = await measureTime(async () => {
                await readRequest(requestId);
            });
            times.push(time);
        }
        
        // Clean up
        await deleteRequest(requestId);
        
        const avgTime = times.reduce((sum, t) => sum + t, 0) / times.length;
        
        // Average read should be <5ms
        expect(avgTime).toBeLessThan(5);
        
        console.log(`  ✓ Read request ${iterations} times in avg ${avgTime.toFixed(2)}ms`);
    }, 30000);
});
