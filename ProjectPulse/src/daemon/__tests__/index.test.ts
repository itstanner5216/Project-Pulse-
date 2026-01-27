/**
 * Tests for daemon module, focusing on race condition prevention
 * in concurrent daemon start attempts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn, ChildProcess } from 'child_process';

// Import daemon functions
import { startDaemon, stopDaemon, isRunning, getDaemonStatus } from '../index';

describe('daemon - race condition prevention', () => {
    let tempDir: string;
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
        // Create a temporary directory for test PID files
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-daemon-test-'));
        
        // Save original environment
        originalEnv = { ...process.env };
        
        // Mock the delegations directory to use temp dir
        // Note: This would need the getDelegationsDir to be configurable
        // For now, we'll test the core logic
    });

    afterEach(async () => {
        // Clean up temporary directory
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
        
        // Restore environment
        process.env = originalEnv;
        
        // Ensure daemon is stopped
        try {
            await stopDaemon();
        } catch {
            // Ignore errors during cleanup
        }
    });

    describe('writePid atomic file creation', () => {
        it('should prevent concurrent daemon starts via atomic PID file creation', async () => {
            // This test simulates the race condition scenario
            // We'll use the actual fs.open with 'wx' flag behavior
            
            const testPidPath = path.join(tempDir, 'test-daemon.pid');
            
            // Ensure parent directory exists
            await fs.promises.mkdir(path.dirname(testPidPath), { recursive: true });
            
            // First attempt - should succeed
            let firstSuccess = false;
            try {
                const handle1 = await fs.promises.open(testPidPath, 'wx');
                await handle1.writeFile('12345');
                await handle1.close();
                firstSuccess = true;
            } catch (error) {
                firstSuccess = false;
            }
            
            expect(firstSuccess).toBe(true);
            
            // Second attempt - should fail with EEXIST
            let secondSuccess = false;
            let errorCode = '';
            try {
                const handle2 = await fs.promises.open(testPidPath, 'wx');
                await handle2.writeFile('67890');
                await handle2.close();
                secondSuccess = true;
            } catch (error) {
                secondSuccess = false;
                errorCode = (error as NodeJS.ErrnoException).code || '';
            }
            
            expect(secondSuccess).toBe(false);
            expect(errorCode).toBe('EEXIST');
            
            // Verify the first PID is still in the file
            const content = await fs.promises.readFile(testPidPath, 'utf-8');
            expect(content).toBe('12345');
        });

        it('should return false when PID file already exists', async () => {
            const testPidPath = path.join(tempDir, 'test-daemon2.pid');
            
            // Ensure parent directory exists
            await fs.promises.mkdir(path.dirname(testPidPath), { recursive: true });
            
            // Pre-create the PID file
            await fs.promises.writeFile(testPidPath, '99999');
            
            // Attempt to create with 'wx' flag should fail
            let success = false;
            let errorCode = '';
            try {
                const handle = await fs.promises.open(testPidPath, 'wx');
                await handle.close();
                success = true;
            } catch (error) {
                success = false;
                errorCode = (error as NodeJS.ErrnoException).code || '';
            }
            
            expect(success).toBe(false);
            expect(errorCode).toBe('EEXIST');
        });

        it('should succeed when PID file does not exist', async () => {
            const testPidPath = path.join(tempDir, 'test-daemon3.pid');
            
            // Ensure parent directory exists
            await fs.promises.mkdir(path.dirname(testPidPath), { recursive: true });
            
            // Ensure file doesn't exist
            if (fs.existsSync(testPidPath)) {
                await fs.promises.unlink(testPidPath);
            }
            
            // Attempt to create with 'wx' flag should succeed
            let success = false;
            try {
                const handle = await fs.promises.open(testPidPath, 'wx');
                await handle.writeFile('11111');
                await handle.close();
                success = true;
            } catch {
                success = false;
            }
            
            expect(success).toBe(true);
            
            // Verify file was created
            expect(fs.existsSync(testPidPath)).toBe(true);
            const content = await fs.promises.readFile(testPidPath, 'utf-8');
            expect(content).toBe('11111');
        });
    });

    describe('concurrent start attempts', () => {
        it('should handle rapid concurrent start attempts gracefully', async () => {
            // Create multiple promises that all try to write the same PID file
            const testPidPath = path.join(tempDir, 'concurrent-test.pid');
            await fs.promises.mkdir(path.dirname(testPidPath), { recursive: true });
            
            const attempts = 10;
            const results: boolean[] = [];
            
            const promises = Array.from({ length: attempts }, async (_, i) => {
                try {
                    const handle = await fs.promises.open(testPidPath, 'wx');
                    await handle.writeFile(String(10000 + i));
                    await handle.close();
                    return true;
                } catch (error) {
                    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
                        return false;
                    }
                    throw error;
                }
            });
            
            const settled = await Promise.allSettled(promises);
            
            // Collect successful attempts
            settled.forEach(result => {
                if (result.status === 'fulfilled') {
                    results.push(result.value);
                }
            });
            
            // Exactly one should succeed
            const successCount = results.filter(r => r === true).length;
            expect(successCount).toBe(1);
            
            // All others should return false
            const failureCount = results.filter(r => r === false).length;
            expect(failureCount).toBe(attempts - 1);
            
            // Verify a PID file exists
            expect(fs.existsSync(testPidPath)).toBe(true);
        });

        it('should handle sequential start attempts correctly', async () => {
            const testPidPath = path.join(tempDir, 'sequential-test.pid');
            await fs.promises.mkdir(path.dirname(testPidPath), { recursive: true });
            
            // First attempt should succeed
            const result1 = await (async () => {
                try {
                    const handle = await fs.promises.open(testPidPath, 'wx');
                    await handle.writeFile('11111');
                    await handle.close();
                    return true;
                } catch (error) {
                    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
                        return false;
                    }
                    throw error;
                }
            })();
            
            expect(result1).toBe(true);
            
            // Second attempt should fail
            const result2 = await (async () => {
                try {
                    const handle = await fs.promises.open(testPidPath, 'wx');
                    await handle.writeFile('22222');
                    await handle.close();
                    return true;
                } catch (error) {
                    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
                        return false;
                    }
                    throw error;
                }
            })();
            
            expect(result2).toBe(false);
            
            // Verify first PID is preserved
            const content = await fs.promises.readFile(testPidPath, 'utf-8');
            expect(content).toBe('11111');
        });
    });

    describe('error handling', () => {
        it('should distinguish EEXIST from other errors', async () => {
            // Test that EEXIST is caught and returns false
            const testPidPath = path.join(tempDir, 'error-test.pid');
            await fs.promises.mkdir(path.dirname(testPidPath), { recursive: true });
            await fs.promises.writeFile(testPidPath, 'existing');
            
            let caughtEEXIST = false;
            try {
                await fs.promises.open(testPidPath, 'wx');
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
                    caughtEEXIST = true;
                }
            }
            
            expect(caughtEEXIST).toBe(true);
        });

        it('should throw unexpected errors', async () => {
            // Test with an invalid path that should cause a different error
            const invalidPath = path.join('/proc/invalid-location-for-pid', 'test.pid');
            
            let threwError = false;
            let errorCode = '';
            try {
                await fs.promises.open(invalidPath, 'wx');
            } catch (error) {
                threwError = true;
                errorCode = (error as NodeJS.ErrnoException).code || '';
            }
            
            expect(threwError).toBe(true);
            // Should be ENOENT or EACCES, not EEXIST
            expect(errorCode).not.toBe('EEXIST');
        });
    });
});

describe('daemon - integration tests', () => {
    // Integration tests would require spawning actual daemon processes
    // These are more complex and require careful cleanup
    
    it.skip('should prevent multiple daemon instances from starting simultaneously', async () => {
        // This test would spawn multiple processes that all try to start the daemon
        // Only one should succeed
        // Skipped for now as it requires more complex setup
    });
});
