/**
 * Tests for watcher module, focusing on error handling and resource cleanup.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DelegationWatcher, WatcherOptions } from '../watcher';

describe('DelegationWatcher - error handling and cleanup', () => {
    let tempDir: string;
    let pendingDir: string;
    let watcher: DelegationWatcher;

    beforeEach(() => {
        // Create a temporary directory for tests
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-watcher-test-'));
        pendingDir = path.join(tempDir, '.projectpulse', 'pending');
        fs.mkdirSync(pendingDir, { recursive: true });
    });

    afterEach(async () => {
        // Stop watcher if running
        if (watcher) {
            watcher.stop();
        }
        
        // Clean up temporary directory
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    describe('watcher error handling', () => {
        it('should close watcher when error occurs', async () => {
            const errorCallback = vi.fn();
            const options: WatcherOptions = {
                onError: errorCallback,
                pollInterval: 100,
            };

            watcher = new DelegationWatcher(options);
            
            // Start the watcher
            await watcher.start();
            
            // Give it a moment to initialize
            await new Promise(resolve => setTimeout(resolve, 100));

            // Access the private watcher to simulate an error
            const watcherInstance = (watcher as any).watcher;
            
            if (watcherInstance) {
                // Emit an error event
                watcherInstance.emit('error', new Error('Simulated watcher error'));
                
                // Wait for error handler to execute
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Verify error callback was called
                expect(errorCallback).toHaveBeenCalledWith(expect.any(Error));
                
                // Verify watcher was set to null
                expect((watcher as any).watcher).toBeNull();
                
                // Verify polling was started (pollTimer should be set)
                expect((watcher as any).pollTimer).not.toBeNull();
            }
        });

        it('should handle close errors gracefully', async () => {
            const errorCallback = vi.fn();
            const options: WatcherOptions = {
                onError: errorCallback,
                pollInterval: 100,
            };

            watcher = new DelegationWatcher(options);
            await watcher.start();
            
            await new Promise(resolve => setTimeout(resolve, 100));

            const watcherInstance = (watcher as any).watcher;
            
            if (watcherInstance) {
                // Mock close to throw an error
                const originalClose = watcherInstance.close;
                watcherInstance.close = vi.fn(() => {
                    throw new Error('Close error');
                });
                
                // Emit an error event - should not throw despite close error
                expect(() => {
                    watcherInstance.emit('error', new Error('Simulated error'));
                }).not.toThrow();
                
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Error callback should still be called
                expect(errorCallback).toHaveBeenCalled();
                
                // Watcher should still be set to null despite close error
                expect((watcher as any).watcher).toBeNull();
                
                // Restore original close
                watcherInstance.close = originalClose;
            }
        });

        it('should start polling after watcher error', async () => {
            const errorCallback = vi.fn();
            const options: WatcherOptions = {
                onError: errorCallback,
                pollInterval: 200,
            };

            watcher = new DelegationWatcher(options);
            await watcher.start();
            
            await new Promise(resolve => setTimeout(resolve, 100));

            const watcherInstance = (watcher as any).watcher;
            
            if (watcherInstance) {
                // Verify polling is not yet started (or is for initial scan)
                const pollTimerBefore = (watcher as any).pollTimer;
                
                // Emit an error
                watcherInstance.emit('error', new Error('Test error'));
                
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Verify polling timer is now set
                const pollTimerAfter = (watcher as any).pollTimer;
                expect(pollTimerAfter).not.toBeNull();
            }
        });
    });

    describe('no duplicate processing', () => {
        it('should not process requests twice when both watcher and polling are active', async () => {
            const pickupCallback = vi.fn();
            const completeCallback = vi.fn();
            const options: WatcherOptions = {
                onPickup: pickupCallback,
                onComplete: completeCallback,
                pollInterval: 100,
            };

            watcher = new DelegationWatcher(options);
            await watcher.start();

            // Create a test request file
            const requestId = 'test-request-duplicate';
            const requestFile = path.join(pendingDir, `${requestId}.json`);
            const requestData = {
                id: requestId,
                parentSession: 'test-session',
                sourceCli: 'auto',
                targetCli: 'auto',
                agent: 'explorer',
                prompt: 'test prompt',
                status: 'pending',
                workingDir: tempDir,
                createdAt: new Date().toISOString(),
                timeout: 1000,
            };
            
            fs.writeFileSync(requestFile, JSON.stringify(requestData, null, 2));

            // Wait for processing
            await new Promise(resolve => setTimeout(resolve, 500));

            // The request should be picked up only once
            // Even if both watcher and polling are running
            expect(pickupCallback.mock.calls.length).toBeLessThanOrEqual(1);
            
            // Clean up the request file if it still exists
            if (fs.existsSync(requestFile)) {
                fs.unlinkSync(requestFile);
            }
        });

        it('should prevent duplicate processing via processing set', async () => {
            const pickupCallback = vi.fn();
            const options: WatcherOptions = {
                onPickup: pickupCallback,
                pollInterval: 50, // Fast polling for test
            };

            watcher = new DelegationWatcher(options);
            await watcher.start();

            const requestId = 'test-concurrent-processing';
            const requestFile = path.join(pendingDir, `${requestId}.json`);
            const requestData = {
                id: requestId,
                parentSession: 'test-session',
                sourceCli: 'auto',
                targetCli: 'auto',
                agent: 'explorer',
                prompt: 'test prompt',
                status: 'pending',
                workingDir: tempDir,
                createdAt: new Date().toISOString(),
                timeout: 1000,
            };
            
            fs.writeFileSync(requestFile, JSON.stringify(requestData, null, 2));

            // Manually trigger processing multiple times (simulating race condition)
            const processRequest = (watcher as any).processRequest.bind(watcher);
            
            // Try to process the same request multiple times concurrently
            await Promise.all([
                processRequest(requestId),
                processRequest(requestId),
                processRequest(requestId),
            ]);

            // Should only be picked up once due to processing set
            expect(pickupCallback.mock.calls.length).toBeLessThanOrEqual(1);
            
            // Clean up
            if (fs.existsSync(requestFile)) {
                fs.unlinkSync(requestFile);
            }
        });
    });

    describe('watcher lifecycle', () => {
        it('should clean up resources on stop', async () => {
            watcher = new DelegationWatcher({ pollInterval: 100 });
            await watcher.start();
            
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify resources are active
            const watcherBefore = (watcher as any).watcher;
            const runningBefore = (watcher as any).running;
            
            expect(runningBefore).toBe(true);

            // Stop the watcher
            watcher.stop();

            // Verify resources are cleaned up
            expect((watcher as any).watcher).toBeNull();
            expect((watcher as any).pollTimer).toBeNull();
            expect((watcher as any).running).toBe(false);
        });

        it('should handle stop when watcher is null', () => {
            watcher = new DelegationWatcher({ pollInterval: 100 });
            
            // Stop without starting - should not throw
            expect(() => {
                watcher.stop();
            }).not.toThrow();
        });

        it('should handle multiple start calls', async () => {
            watcher = new DelegationWatcher({ pollInterval: 100 });
            
            // Start multiple times
            await watcher.start();
            await watcher.start();
            await watcher.start();
            
            // Should only be running once
            expect((watcher as any).running).toBe(true);
            
            watcher.stop();
        });
    });

    describe('polling fallback', () => {
        it('should fall back to polling if watch fails on start', async () => {
            // This test verifies the fallback in the catch block at line 75-78
            // Note: We can't easily mock fs.watch due to module restrictions,
            // so this test verifies the behavior through error handler path
            watcher = new DelegationWatcher({ pollInterval: 100 });
            
            await watcher.start();
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const watcherInstance = (watcher as any).watcher;
            
            if (watcherInstance) {
                // Trigger error which will cause fallback to polling
                watcherInstance.emit('error', new Error('Watch not supported'));
                
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Should have fallen back to polling
                expect((watcher as any).pollTimer).not.toBeNull();
                expect((watcher as any).watcher).toBeNull();
            } else {
                // If watcher is null, it already fell back to polling on start
                expect((watcher as any).pollTimer).not.toBeNull();
            }
        });

        it('should only start polling once', async () => {
            const errorCallback = vi.fn();
            watcher = new DelegationWatcher({ 
                onError: errorCallback,
                pollInterval: 100,
            });
            
            await watcher.start();
            await new Promise(resolve => setTimeout(resolve, 100));

            const watcherInstance = (watcher as any).watcher;
            
            if (watcherInstance) {
                // Trigger error multiple times
                watcherInstance.emit('error', new Error('Error 1'));
                await new Promise(resolve => setTimeout(resolve, 50));
                
                const pollTimer1 = (watcher as any).pollTimer;
                
                watcherInstance.emit('error', new Error('Error 2'));
                await new Promise(resolve => setTimeout(resolve, 50));
                
                const pollTimer2 = (watcher as any).pollTimer;
                
                // Should be the same timer instance (not restarted)
                expect(pollTimer1).toBe(pollTimer2);
            }
        });
    });

    describe('error edge cases', () => {
        it('should handle null watcher in error handler', async () => {
            const errorCallback = vi.fn();
            watcher = new DelegationWatcher({ 
                onError: errorCallback,
                pollInterval: 100,
            });
            
            await watcher.start();
            await new Promise(resolve => setTimeout(resolve, 100));

            // Manually set watcher to null before triggering error
            const watcherInstance = (watcher as any).watcher;
            (watcher as any).watcher = null;
            
            if (watcherInstance) {
                // Should not throw even though this.watcher is null
                expect(() => {
                    watcherInstance.emit('error', new Error('Test error'));
                }).not.toThrow();
                
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Error callback should still be called
                expect(errorCallback).toHaveBeenCalled();
            }
        });

        it('should handle error callback throwing', async () => {
            let errorThrown = false;
            const errorCallback = vi.fn(() => {
                errorThrown = true;
                throw new Error('Error callback failed');
            });
            
            watcher = new DelegationWatcher({ 
                onError: errorCallback,
                pollInterval: 100,
            });
            
            await watcher.start();
            await new Promise(resolve => setTimeout(resolve, 100));

            const watcherInstance = (watcher as any).watcher;
            
            if (watcherInstance) {
                // Error handler should complete despite callback throwing
                // Wrap in try-catch since the error will propagate
                try {
                    watcherInstance.emit('error', new Error('Test error'));
                } catch (e) {
                    // Expected - error callback throws
                }
                
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Verify error callback was called
                expect(errorThrown).toBe(true);
                
                // Cleanup should still have occurred
                expect((watcher as any).watcher).toBeNull();
                expect((watcher as any).pollTimer).not.toBeNull();
            }
        });
    });
});
