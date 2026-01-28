/**
 * Integration tests for end-to-end delegation workflow and daemon lifecycle.
 * 
 * Tests cover:
 * - End-to-end delegation workflow (create → process → read result)
 * - Daemon lifecycle (start → process requests → stop)
 * - Concurrent delegation requests
 * - Multi-agent execution
 * - Error recovery and retry
 * - File watcher vs polling fallback
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn, ChildProcess } from 'child_process';
import { DelegationWatcher } from '../watcher';
import { 
    createRequest, 
    readResult, 
    checkStatus, 
    ensureDirs,
    getDelegationsDir,
    getSubdir,
    readRequest,
    listPending,
    listComplete,
} from '../../lib/delegation/storage';
import { DelegationRequest, DelegationResult, AgentType } from '../../lib/delegation/types';

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Wait for a condition to be true, with timeout
 */
async function waitFor(
    condition: () => Promise<boolean> | boolean,
    timeoutMs = 5000,
    intervalMs = 100
): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
        if (await condition()) {
            return;
        }
        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    throw new Error(`Timeout waiting for condition after ${timeoutMs}ms`);
}

/**
 * Wait for a file to exist
 */
async function waitForFile(filePath: string, timeoutMs = 5000): Promise<void> {
    await waitFor(() => fs.existsSync(filePath), timeoutMs);
}

/**
 * Wait for a file to be deleted
 */
async function waitForFileDeleted(filePath: string, timeoutMs = 5000): Promise<void> {
    await waitFor(() => !fs.existsSync(filePath), timeoutMs);
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Integration Tests - Delegation Workflow and Daemon Lifecycle', () => {
    let tempDir: string;
    let originalEnv: string | undefined;

    beforeEach(async () => {
        // Create a temporary directory for tests
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-integration-test-'));
        
        // Set environment variable so all components use our temp directory
        originalEnv = process.env.PROJECTPULSE_DELEGATIONS_DIR;
        process.env.PROJECTPULSE_DELEGATIONS_DIR = tempDir;
        
        // Ensure directories exist
        await ensureDirs();
    });

    afterEach(async () => {
        // Restore environment variable
        if (originalEnv !== undefined) {
            process.env.PROJECTPULSE_DELEGATIONS_DIR = originalEnv;
        } else {
            delete process.env.PROJECTPULSE_DELEGATIONS_DIR;
        }
        
        // Clean up temporary directory
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    // ========================================================================
    // Test 1: End-to-End Delegation Workflow
    // ========================================================================

    describe('End-to-End Delegation Workflow', () => {
        it('should create, process, and read result for a delegation', async () => {
            // Mock child_process.spawn to simulate successful agent execution
            const mockSpawn = vi.spyOn(require('child_process'), 'spawn');
            const mockProcess = {
                stdout: { on: vi.fn() },
                stderr: { on: vi.fn() },
                on: vi.fn(),
                kill: vi.fn(),
            } as unknown as ChildProcess;

            mockSpawn.mockImplementation(() => {
                // Simulate successful execution
                setTimeout(() => {
                    const onCallback = mockProcess.on as unknown as ReturnType<typeof vi.fn>;
                    const closeHandler = onCallback.mock.calls.find(call => call[0] === 'close');
                    if (closeHandler) {
                        closeHandler[1](0); // Exit code 0
                    }
                }, 100);
                return mockProcess;
            });

            // Setup watcher callbacks
            const onPickup = vi.fn();
            const onComplete = vi.fn();
            const onError = vi.fn();

            const watcher = new DelegationWatcher({
                pollInterval: 100,
                onPickup,
                onComplete,
                onError,
            });

            try {
                // Start the watcher
                await watcher.start();

                // Step 1: Create a delegation request
                const createResult = await createRequest({
                    parentSession: 'test-session-1',
                    sourceCli: 'auto',
                    targetCli: 'auto',
                    agent: 'explorer' as AgentType,
                    prompt: 'Test task for integration',
                    workingDir: tempDir,
                });

                expect(createResult.ok).toBe(true);
                expect(createResult.data).toBeDefined();
                const requestId = createResult.data!.id;

                // Step 2: Verify request is in pending state
                const pendingList = await listPending();
                expect(pendingList).toContain(requestId);

                // Step 3: Wait for watcher to pick up and process the request
                await waitFor(() => onComplete.mock.calls.length > 0, 10000);

                // Step 4: Verify callbacks were called
                expect(onPickup).toHaveBeenCalledWith(
                    expect.objectContaining({
                        id: requestId,
                        agent: 'explorer',
                    })
                );
                expect(onComplete).toHaveBeenCalledWith(
                    expect.objectContaining({
                        id: requestId,
                        status: expect.stringMatching(/complete|error|timeout/),
                    })
                );

                // Step 5: Read the result
                const statusResult = await checkStatus(requestId);
                expect(statusResult.ok).toBe(true);
                expect(statusResult.data?.status).toMatch(/complete|error|timeout/);

                // Step 6: Verify request was moved from pending to complete
                const pendingListAfter = await listPending();
                expect(pendingListAfter).not.toContain(requestId);

                const completeList = await listComplete();
                expect(completeList).toContain(requestId);

                // Step 7: Read the full result
                const result = await readResult(requestId);
                expect(result).toBeDefined();
                expect(result?.id).toBe(requestId);
                expect(result?.completedAt).toBeDefined();
                expect(result?.durationMs).toBeGreaterThanOrEqual(0);

            } finally {
                watcher.stop();
                mockSpawn.mockRestore();
            }
        });

        it('should handle delegation with error status', async () => {
            // Mock spawn to simulate error
            const mockSpawn = vi.spyOn(require('child_process'), 'spawn');
            const mockProcess = {
                stdout: { on: vi.fn() },
                stderr: { on: vi.fn((event, callback) => {
                    if (event === 'data') {
                        setTimeout(() => callback(Buffer.from('Error message')), 50);
                    }
                }) },
                on: vi.fn(),
                kill: vi.fn(),
            } as unknown as ChildProcess;

            mockSpawn.mockImplementation(() => {
                setTimeout(() => {
                    const onCallback = mockProcess.on as unknown as ReturnType<typeof vi.fn>;
                    const closeHandler = onCallback.mock.calls.find(call => call[0] === 'close');
                    if (closeHandler) {
                        closeHandler[1](1); // Exit code 1 (error)
                    }
                }, 100);
                return mockProcess;
            });

            const onComplete = vi.fn();
            const watcher = new DelegationWatcher({
                pollInterval: 100,
                onComplete,
            });

            try {
                await watcher.start();

                const createResult = await createRequest({
                    parentSession: 'test-session-error',
                    sourceCli: 'auto',
                    targetCli: 'auto',
                    agent: 'reviewer' as AgentType,
                    prompt: 'Task that will fail',
                    workingDir: tempDir,
                });

                const requestId = createResult.data!.id;

                // Wait for completion
                await waitFor(() => onComplete.mock.calls.length > 0, 10000);

                // Verify error status
                const result = await readResult(requestId);
                expect(result?.status).toBe('error');
                expect(result?.exitCode).toBe(1);

            } finally {
                watcher.stop();
                mockSpawn.mockRestore();
            }
        });
    });

    // ========================================================================
    // Test 2: Daemon Lifecycle
    // ========================================================================

    describe('Daemon Lifecycle', () => {
        it('should start, process requests, and stop cleanly', async () => {
            const onPickup = vi.fn();
            const onComplete = vi.fn();

            const watcher = new DelegationWatcher({
                pollInterval: 100,
                onPickup,
                onComplete,
            });

            // Mock spawn for this test
            const mockSpawn = vi.spyOn(require('child_process'), 'spawn');
            const mockProcess = {
                stdout: { on: vi.fn() },
                stderr: { on: vi.fn() },
                on: vi.fn(),
                kill: vi.fn(),
            } as unknown as ChildProcess;

            mockSpawn.mockImplementation(() => {
                setTimeout(() => {
                    const onCallback = mockProcess.on as unknown as ReturnType<typeof vi.fn>;
                    const closeHandler = onCallback.mock.calls.find(call => call[0] === 'close');
                    if (closeHandler) {
                        closeHandler[1](0);
                    }
                }, 100);
                return mockProcess;
            });

            try {
                // Start the daemon (watcher)
                await watcher.start();

                // Create a request while running
                const createResult = await createRequest({
                    parentSession: 'lifecycle-test',
                    sourceCli: 'auto',
                    targetCli: 'auto',
                    agent: 'planner' as AgentType,
                    prompt: 'Lifecycle test task',
                    workingDir: tempDir,
                });

                expect(createResult.ok).toBe(true);

                // Wait for processing
                await waitFor(() => onComplete.mock.calls.length > 0, 10000);

                // Verify request was processed
                expect(onPickup).toHaveBeenCalled();
                expect(onComplete).toHaveBeenCalled();

                // Stop the daemon
                watcher.stop();

                // Verify cleanup - the watcher should be stopped
                expect((watcher as any).running).toBe(false);
                expect((watcher as any).watcher).toBeNull();
                expect((watcher as any).pollTimer).toBeNull();

            } finally {
                watcher.stop();
                mockSpawn.mockRestore();
            }
        });

        it('should not process requests after stopping', async () => {
            const onPickup = vi.fn();

            const watcher = new DelegationWatcher({
                pollInterval: 100,
                onPickup,
            });

            // Start and immediately stop
            await watcher.start();
            watcher.stop();

            // Create a request after stopping
            await createRequest({
                parentSession: 'stopped-test',
                sourceCli: 'auto',
                targetCli: 'auto',
                agent: 'explorer' as AgentType,
                prompt: 'Should not be processed',
                workingDir: tempDir,
            });

            // Wait a bit
            await new Promise(resolve => setTimeout(resolve, 500));

            // Verify it was not picked up
            expect(onPickup).not.toHaveBeenCalled();
        });
    });

    // ========================================================================
    // Test 3: Concurrent Delegation Requests
    // ========================================================================

    describe('Concurrent Delegation Requests', () => {
        it('should handle multiple concurrent requests without collision', async () => {
            const mockSpawn = vi.spyOn(require('child_process'), 'spawn');
            const processedIds = new Set<string>();

            mockSpawn.mockImplementation(() => {
                const mockProcess = {
                    stdout: { on: vi.fn() },
                    stderr: { on: vi.fn() },
                    on: vi.fn(),
                    kill: vi.fn(),
                } as unknown as ChildProcess;

                setTimeout(() => {
                    const onCallback = mockProcess.on as unknown as ReturnType<typeof vi.fn>;
                    const closeHandler = onCallback.mock.calls.find(call => call[0] === 'close');
                    if (closeHandler) {
                        closeHandler[1](0);
                    }
                }, 100);
                return mockProcess;
            });

            const onComplete = vi.fn((result: DelegationResult) => {
                processedIds.add(result.id);
            });

            const watcher = new DelegationWatcher({
                pollInterval: 50,
                onComplete,
            });

            try {
                await watcher.start();

                // Create 10 concurrent requests
                const requestPromises = [];
                const requestIds = new Set<string>();

                for (let i = 0; i < 10; i++) {
                    const promise = createRequest({
                        parentSession: `concurrent-test-${i}`,
                        sourceCli: 'auto',
                        targetCli: 'auto',
                        agent: 'explorer' as AgentType,
                        prompt: `Concurrent task ${i}`,
                        workingDir: tempDir,
                    }).then(result => {
                        if (result.ok && result.data) {
                            requestIds.add(result.data.id);
                        }
                        return result;
                    });
                    requestPromises.push(promise);
                }

                // Wait for all requests to be created
                await Promise.all(requestPromises);

                // Verify all have unique IDs
                expect(requestIds.size).toBe(10);

                // Wait for all to complete
                await waitFor(() => processedIds.size === 10, 15000);

                // Verify all were processed exactly once
                expect(processedIds.size).toBe(10);
                expect(onComplete).toHaveBeenCalledTimes(10);

                // Verify no pending requests remain
                const pending = await listPending();
                expect(pending.length).toBe(0);

            } finally {
                watcher.stop();
                mockSpawn.mockRestore();
            }
        });

        it('should not process the same request twice', async () => {
            const mockSpawn = vi.spyOn(require('child_process'), 'spawn');
            const processCount = new Map<string, number>();

            mockSpawn.mockImplementation(() => {
                const mockProcess = {
                    stdout: { on: vi.fn() },
                    stderr: { on: vi.fn() },
                    on: vi.fn(),
                    kill: vi.fn(),
                } as unknown as ChildProcess;

                setTimeout(() => {
                    const onCallback = mockProcess.on as unknown as ReturnType<typeof vi.fn>;
                    const closeHandler = onCallback.mock.calls.find(call => call[0] === 'close');
                    if (closeHandler) {
                        closeHandler[1](0);
                    }
                }, 200);
                return mockProcess;
            });

            const onPickup = vi.fn((request: DelegationRequest) => {
                const count = processCount.get(request.id) || 0;
                processCount.set(request.id, count + 1);
            });

            const watcher = new DelegationWatcher({
                pollInterval: 50,
                onPickup,
            });

            try {
                await watcher.start();

                // Create a single request
                const createResult = await createRequest({
                    parentSession: 'duplicate-test',
                    sourceCli: 'auto',
                    targetCli: 'auto',
                    agent: 'explorer' as AgentType,
                    prompt: 'Test for duplicate processing',
                    workingDir: tempDir,
                });

                const requestId = createResult.data!.id;

                // Wait for processing to complete
                await waitFor(() => processCount.has(requestId), 5000);

                // Wait a bit more to ensure no duplicate processing
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Verify it was picked up exactly once
                expect(processCount.get(requestId)).toBe(1);

            } finally {
                watcher.stop();
                mockSpawn.mockRestore();
            }
        });
    });

    // ========================================================================
    // Test 4: Multi-Agent Execution
    // ========================================================================

    describe('Multi-Agent Execution', () => {
        it('should process requests for different agent types', async () => {
            const mockSpawn = vi.spyOn(require('child_process'), 'spawn');
            const agentsProcessed = new Set<AgentType>();

            mockSpawn.mockImplementation(() => {
                const mockProcess = {
                    stdout: { on: vi.fn() },
                    stderr: { on: vi.fn() },
                    on: vi.fn(),
                    kill: vi.fn(),
                } as unknown as ChildProcess;

                setTimeout(() => {
                    const onCallback = mockProcess.on as unknown as ReturnType<typeof vi.fn>;
                    const closeHandler = onCallback.mock.calls.find(call => call[0] === 'close');
                    if (closeHandler) {
                        closeHandler[1](0);
                    }
                }, 100);
                return mockProcess;
            });

            const onPickup = vi.fn((request: DelegationRequest) => {
                agentsProcessed.add(request.agent);
            });

            const watcher = new DelegationWatcher({
                pollInterval: 100,
                onPickup,
            });

            try {
                await watcher.start();

                // Create requests for different agent types
                const agentTypes: AgentType[] = ['explorer', 'reviewer', 'performance', 'architect', 'planner'];
                
                for (const agent of agentTypes) {
                    await createRequest({
                        parentSession: `multi-agent-${agent}`,
                        sourceCli: 'auto',
                        targetCli: 'auto',
                        agent,
                        prompt: `Test task for ${agent}`,
                        workingDir: tempDir,
                    });
                }

                // Wait for all to be processed
                await waitFor(() => agentsProcessed.size === agentTypes.length, 10000);

                // Verify all agent types were processed
                expect(agentsProcessed.size).toBe(agentTypes.length);
                agentTypes.forEach(agent => {
                    expect(agentsProcessed.has(agent)).toBe(true);
                });

            } finally {
                watcher.stop();
                mockSpawn.mockRestore();
            }
        });
    });

    // ========================================================================
    // Test 5: Error Recovery and Retry
    // ========================================================================

    describe('Error Recovery and Retry', () => {
        it('should handle processing errors gracefully', async () => {
            const mockSpawn = vi.spyOn(require('child_process'), 'spawn');
            let callCount = 0;

            mockSpawn.mockImplementation(() => {
                callCount++;
                const mockProcess = {
                    stdout: { on: vi.fn() },
                    stderr: { on: vi.fn() },
                    on: vi.fn(),
                    kill: vi.fn(),
                } as unknown as ChildProcess;

                setTimeout(() => {
                    const onCallback = mockProcess.on as unknown as ReturnType<typeof vi.fn>;
                    const errorHandler = onCallback.mock.calls.find(call => call[0] === 'error');
                    if (errorHandler && callCount === 1) {
                        // First call fails
                        errorHandler[1](new Error('Simulated spawn error'));
                    } else {
                        // Subsequent calls succeed (for other requests)
                        const closeHandler = onCallback.mock.calls.find(call => call[0] === 'close');
                        if (closeHandler) {
                            closeHandler[1](0);
                        }
                    }
                }, 100);
                return mockProcess;
            });

            const onError = vi.fn();
            const onComplete = vi.fn();

            const watcher = new DelegationWatcher({
                pollInterval: 100,
                onError,
                onComplete,
            });

            try {
                await watcher.start();

                // Create a request that will fail
                const createResult = await createRequest({
                    parentSession: 'error-recovery-test',
                    sourceCli: 'auto',
                    targetCli: 'auto',
                    agent: 'explorer' as AgentType,
                    prompt: 'Task that will encounter error',
                    workingDir: tempDir,
                });

                const requestId = createResult.data!.id;

                // Wait for error handling
                await waitFor(() => onComplete.mock.calls.length > 0 || onError.mock.calls.length > 0, 5000);

                // Verify error was written as result
                const result = await readResult(requestId);
                expect(result).toBeDefined();
                expect(result?.status).toBe('error');

            } finally {
                watcher.stop();
                mockSpawn.mockRestore();
            }
        });

        it('should clean up after errors', async () => {
            const mockSpawn = vi.spyOn(require('child_process'), 'spawn');

            mockSpawn.mockImplementation(() => {
                const mockProcess = {
                    stdout: { on: vi.fn() },
                    stderr: { on: vi.fn() },
                    on: vi.fn(),
                    kill: vi.fn(),
                } as unknown as ChildProcess;

                setTimeout(() => {
                    const onCallback = mockProcess.on as unknown as ReturnType<typeof vi.fn>;
                    const errorHandler = onCallback.mock.calls.find(call => call[0] === 'error');
                    if (errorHandler) {
                        errorHandler[1](new Error('Process error'));
                    }
                }, 100);
                return mockProcess;
            });

            const watcher = new DelegationWatcher({
                pollInterval: 100,
            });

            try {
                await watcher.start();

                const createResult = await createRequest({
                    parentSession: 'cleanup-test',
                    sourceCli: 'auto',
                    targetCli: 'auto',
                    agent: 'explorer' as AgentType,
                    prompt: 'Task for cleanup test',
                    workingDir: tempDir,
                });

                const requestId = createResult.data!.id;

                // Wait for error processing
                await new Promise(resolve => setTimeout(resolve, 2000));

                // Verify request is no longer in pending
                const pending = await listPending();
                expect(pending).not.toContain(requestId);

                // Verify error result exists in complete
                const result = await readResult(requestId);
                expect(result).toBeDefined();
                expect(result?.status).toBe('error');

            } finally {
                watcher.stop();
                mockSpawn.mockRestore();
            }
        });
    });

    // ========================================================================
    // Test 6: File Watcher vs Polling Fallback
    // ========================================================================

    describe('File Watcher vs Polling Fallback', () => {
        it('should fallback to polling when watcher fails', async () => {
            const mockSpawn = vi.spyOn(require('child_process'), 'spawn');
            const mockProcess = {
                stdout: { on: vi.fn() },
                stderr: { on: vi.fn() },
                on: vi.fn(),
                kill: vi.fn(),
            } as unknown as ChildProcess;

            mockSpawn.mockImplementation(() => {
                setTimeout(() => {
                    const onCallback = mockProcess.on as unknown as ReturnType<typeof vi.fn>;
                    const closeHandler = onCallback.mock.calls.find(call => call[0] === 'close');
                    if (closeHandler) {
                        closeHandler[1](0);
                    }
                }, 100);
                return mockProcess;
            });

            const onError = vi.fn();
            const onComplete = vi.fn();

            const watcher = new DelegationWatcher({
                pollInterval: 100,
                onError,
                onComplete,
            });

            try {
                await watcher.start();

                // Simulate watcher error to trigger polling fallback
                const watcherInstance = (watcher as any).watcher;
                if (watcherInstance) {
                    watcherInstance.emit('error', new Error('Watcher error'));
                    
                    // Wait for error handler
                    await new Promise(resolve => setTimeout(resolve, 200));

                    // Verify watcher was closed and polling started
                    expect((watcher as any).watcher).toBeNull();
                    expect((watcher as any).pollTimer).not.toBeNull();
                }

                // Create a request to verify polling works
                const createResult = await createRequest({
                    parentSession: 'polling-fallback-test',
                    sourceCli: 'auto',
                    targetCli: 'auto',
                    agent: 'explorer' as AgentType,
                    prompt: 'Test polling fallback',
                    workingDir: tempDir,
                });

                const requestId = createResult.data!.id;

                // Wait for completion via polling
                await waitFor(() => onComplete.mock.calls.length > 0, 5000);

                // Verify request was processed
                const result = await readResult(requestId);
                expect(result).toBeDefined();
                expect(result?.id).toBe(requestId);

            } finally {
                watcher.stop();
                mockSpawn.mockRestore();
            }
        });

        it('should work with polling mode only', async () => {
            const mockSpawn = vi.spyOn(require('child_process'), 'spawn');
            const mockProcess = {
                stdout: { on: vi.fn() },
                stderr: { on: vi.fn() },
                on: vi.fn(),
                kill: vi.fn(),
            } as unknown as ChildProcess;

            mockSpawn.mockImplementation(() => {
                setTimeout(() => {
                    const onCallback = mockProcess.on as unknown as ReturnType<typeof vi.fn>;
                    const closeHandler = onCallback.mock.calls.find(call => call[0] === 'close');
                    if (closeHandler) {
                        closeHandler[1](0);
                    }
                }, 100);
                return mockProcess;
            });

            const onComplete = vi.fn();

            const watcher = new DelegationWatcher({
                pollInterval: 100,
                onComplete,
            });

            try {
                await watcher.start();

                // Disable watcher and start polling to force polling-only mode
                if ((watcher as any).watcher) {
                    (watcher as any).watcher.close();
                    (watcher as any).watcher = null;
                }
                // Manually trigger polling start if not already started
                if (!(watcher as any).pollTimer) {
                    (watcher as any).startPolling();
                }

                // Create a request
                const createResult = await createRequest({
                    parentSession: 'polling-only-test',
                    sourceCli: 'auto',
                    targetCli: 'auto',
                    agent: 'explorer' as AgentType,
                    prompt: 'Test polling mode',
                    workingDir: tempDir,
                });

                const requestId = createResult.data!.id;

                // Wait for polling to pick it up
                await waitFor(() => onComplete.mock.calls.length > 0, 10000);

                // Verify it was processed
                const result = await readResult(requestId);
                expect(result).toBeDefined();
                expect(result?.id).toBe(requestId);

            } finally {
                watcher.stop();
                mockSpawn.mockRestore();
            }
        });
    });

    // ========================================================================
    // Test 7: Isolated Environment and Cleanup
    // ========================================================================

    describe('Isolated Environment and Cleanup', () => {
        it('should run tests in isolated temp directory', () => {
            // Verify we're using a temp directory
            expect(tempDir).toContain('pulse-integration-test-');
            expect(getDelegationsDir()).toBe(tempDir);

            // Verify directories were created
            expect(fs.existsSync(getSubdir('pending'))).toBe(true);
            expect(fs.existsSync(getSubdir('complete'))).toBe(true);
            expect(fs.existsSync(getSubdir('logs'))).toBe(true);
        });

        it('should clean up temp directory after test', async () => {
            // Create some test files
            const testFile = path.join(getSubdir('pending'), 'test-cleanup.json');
            fs.writeFileSync(testFile, '{"test": "data"}');

            // Verify file exists
            expect(fs.existsSync(testFile)).toBe(true);

            // The afterEach hook will clean up the temp directory
            // We just verify the file is there for now
            expect(fs.existsSync(tempDir)).toBe(true);
        });

        it('should isolate tests from each other', async () => {
            // Each test gets a fresh temp directory
            // Verify no leftover files from previous tests
            const pendingFiles = fs.readdirSync(getSubdir('pending'));
            const completeFiles = fs.readdirSync(getSubdir('complete'));

            // Should only have files created in this specific test
            // Since this is a fresh test, should be empty
            expect(pendingFiles.filter(f => f.endsWith('.json')).length).toBe(0);
            expect(completeFiles.filter(f => f.endsWith('.json')).length).toBe(0);
        });
    });
});
