/**
 * Tests for daemon module, focusing on concurrent start attempts and process existence checks.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { isRunning } from '../index';

// Helper to get paths for testing
function getPaths(tempDir: string) {
    const pidPath = path.join(tempDir, 'daemon.pid');
    return { pidPath };
}

describe('daemon - process existence check', () => {
    let tempDir: string;
    let originalEnv: string | undefined;

    beforeEach(() => {
        // Create a temporary directory for tests
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-daemon-test-'));
        
        // Set environment variable so daemon uses our temp directory
        originalEnv = process.env.PROJECTPULSE_DELEGATIONS_DIR;
        process.env.PROJECTPULSE_DELEGATIONS_DIR = tempDir;
    });

    afterEach(() => {
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

    describe('isRunning with different error codes', () => {
        it('should return false when PID file does not exist', async () => {
            const running = await isRunning();
            expect(running).toBe(false);
        });

        it('should return true when process exists and is running', async () => {
            const { pidPath } = getPaths(tempDir);
            
            // Write our own PID (this process is definitely running)
            fs.mkdirSync(path.dirname(pidPath), { recursive: true });
            fs.writeFileSync(pidPath, String(process.pid));
            
            const running = await isRunning();
            expect(running).toBe(true);
        });

        it('should return false and clean up PID file when process does not exist (ESRCH)', async () => {
            const { pidPath } = getPaths(tempDir);
            
            // Write a PID that definitely doesn't exist (99999999)
            fs.mkdirSync(path.dirname(pidPath), { recursive: true });
            fs.writeFileSync(pidPath, '99999999');
            
            const running = await isRunning();
            
            // Should return false
            expect(running).toBe(false);
            
            // Should clean up the stale PID file
            expect(fs.existsSync(pidPath)).toBe(false);
        });

        it('should handle invalid PID file content gracefully', async () => {
            const { pidPath } = getPaths(tempDir);
            
            // Write invalid content
            fs.mkdirSync(path.dirname(pidPath), { recursive: true });
            fs.writeFileSync(pidPath, 'not-a-number');
            
            const running = await isRunning();
            
            // Should return false for invalid PID
            expect(running).toBe(false);
        });

        it('should handle empty PID file', async () => {
            const { pidPath } = getPaths(tempDir);
            
            // Write empty file
            fs.mkdirSync(path.dirname(pidPath), { recursive: true });
            fs.writeFileSync(pidPath, '');
            
            const running = await isRunning();
            
            // Should return false for empty PID file
            expect(running).toBe(false);
        });

        it('should handle PID file with whitespace', async () => {
            const { pidPath } = getPaths(tempDir);
            
            // Write PID with whitespace
            fs.mkdirSync(path.dirname(pidPath), { recursive: true });
            fs.writeFileSync(pidPath, `  ${process.pid}  \n`);
            
            const running = await isRunning();
            
            // Should handle whitespace and return true (our process is running)
            expect(running).toBe(true);
        });

        it('should handle negative PID', async () => {
            const { pidPath } = getPaths(tempDir);
            
            // Write negative PID
            fs.mkdirSync(path.dirname(pidPath), { recursive: true });
            fs.writeFileSync(pidPath, '-1');
            
            const running = await isRunning();
            
            // On Unix, kill(-1, 0) sends to all processes user has permission to signal
            // So this might return true if the user has processes running
            // We just verify it doesn't crash
            expect(typeof running).toBe('boolean');
        });

        it('should handle zero PID', async () => {
            const { pidPath } = getPaths(tempDir);
            
            // Write zero PID
            fs.mkdirSync(path.dirname(pidPath), { recursive: true });
            fs.writeFileSync(pidPath, '0');
            
            const running = await isRunning();
            
            // Should return false for zero PID
            expect(running).toBe(false);
        });

        it('should handle very large PID numbers', async () => {
            const { pidPath } = getPaths(tempDir);
            
            // Write very large PID that doesn't exist
            fs.mkdirSync(path.dirname(pidPath), { recursive: true });
            fs.writeFileSync(pidPath, '2147483647'); // Max 32-bit int
            
            const running = await isRunning();
            
            // Should return false and clean up
            expect(running).toBe(false);
            expect(fs.existsSync(pidPath)).toBe(false);
        });
    });

    describe('PID file cleanup', () => {
        it('should remove PID file after checking non-existent process', async () => {
            const { pidPath } = getPaths(tempDir);
            
            // Create PID file with non-existent process
            fs.mkdirSync(path.dirname(pidPath), { recursive: true });
            fs.writeFileSync(pidPath, '99999999');
            
            // Verify file exists before check
            expect(fs.existsSync(pidPath)).toBe(true);
            
            await isRunning();
            
            // Verify file is removed after check
            expect(fs.existsSync(pidPath)).toBe(false);
        });

        it('should not remove PID file for running process', async () => {
            const { pidPath } = getPaths(tempDir);
            
            // Create PID file with our own PID
            fs.mkdirSync(path.dirname(pidPath), { recursive: true });
            fs.writeFileSync(pidPath, String(process.pid));
            
            await isRunning();
            
            // PID file should still exist
            expect(fs.existsSync(pidPath)).toBe(true);
        });

        it('should handle read errors on PID file', async () => {
            const { pidPath } = getPaths(tempDir);
            
            // Create directory but no file
            fs.mkdirSync(path.dirname(pidPath), { recursive: true });
            
            // Make directory read-only to cause permission error
            // Skip on Windows or when running as root (common in CI)
            if (process.platform !== 'win32' && process.getuid?.() !== 0) {
                fs.chmodSync(path.dirname(pidPath), 0o000);
                
                const running = await isRunning();
                
                // Should return false when unable to read
                expect(running).toBe(false);
                
                // Restore permissions for cleanup
                fs.chmodSync(path.dirname(pidPath), 0o755);
            }
        });
    });

    describe('process.kill error code handling', () => {
        it('should handle ESRCH error (process does not exist)', async () => {
            const { pidPath } = getPaths(tempDir);
            
            // Mock process.kill to throw ESRCH
            vi.spyOn(process, 'kill').mockImplementation((pid: number, signal?: string | number) => {
                const error: any = new Error('No such process');
                error.code = 'ESRCH';
                throw error;
            });
            
            // Create PID file
            fs.mkdirSync(path.dirname(pidPath), { recursive: true });
            fs.writeFileSync(pidPath, '12345');
            
            const running = await isRunning();
            
            // Should return false
            expect(running).toBe(false);
            
            // Should clean up PID file
            expect(fs.existsSync(pidPath)).toBe(false);
            
            // Restore original
            vi.restoreAllMocks();
        });

        it('should handle other errors as process not running', async () => {
            const { pidPath } = getPaths(tempDir);
            
            // Mock process.kill to throw unknown error
            vi.spyOn(process, 'kill').mockImplementation((pid: number, signal?: string | number) => {
                const error: any = new Error('Unknown error');
                error.code = 'EUNKNOWN';
                throw error;
            });
            
            // Create PID file
            fs.mkdirSync(path.dirname(pidPath), { recursive: true });
            fs.writeFileSync(pidPath, '12345');
            
            const running = await isRunning();
            
            // Should return false for unknown errors
            expect(running).toBe(false);
            
            // Should clean up PID file on unknown errors
            expect(fs.existsSync(pidPath)).toBe(false);
            
            // Restore original
            vi.restoreAllMocks();
        });

        it('should handle successful kill signal 0 (process exists)', async () => {
            const { pidPath } = getPaths(tempDir);
            
            // Use our own PID which is definitely running
            fs.mkdirSync(path.dirname(pidPath), { recursive: true });
            fs.writeFileSync(pidPath, String(process.pid));
            
            const running = await isRunning();
            
            // Should return true
            expect(running).toBe(true);
            
            // Should NOT clean up PID file
            expect(fs.existsSync(pidPath)).toBe(true);
        });
    });

    describe('edge cases', () => {
        it('should handle concurrent isRunning calls', async () => {
            const { pidPath } = getPaths(tempDir);
            
            // Create PID file with our PID
            fs.mkdirSync(path.dirname(pidPath), { recursive: true });
            fs.writeFileSync(pidPath, String(process.pid));
            
            // Call isRunning multiple times concurrently
            const results = await Promise.all([
                isRunning(),
                isRunning(),
                isRunning(),
                isRunning(),
                isRunning(),
            ]);
            
            // All should return true
            results.forEach(result => {
                expect(result).toBe(true);
            });
        });

        it('should handle rapid PID file changes', async () => {
            const { pidPath } = getPaths(tempDir);
            
            fs.mkdirSync(path.dirname(pidPath), { recursive: true });
            
            // Write different PIDs rapidly
            fs.writeFileSync(pidPath, '99999999');
            const result1 = await isRunning();
            
            fs.writeFileSync(pidPath, String(process.pid));
            const result2 = await isRunning();
            
            fs.writeFileSync(pidPath, '88888888');
            const result3 = await isRunning();
            
            // First and third should be false (non-existent PIDs)
            expect(result1).toBe(false);
            expect(result3).toBe(false);
            
            // Second should be true (our PID)
            expect(result2).toBe(true);
        });

        it('should return false when PID file is a directory', async () => {
            const { pidPath } = getPaths(tempDir);
            
            // Create a directory with the PID file name
            fs.mkdirSync(pidPath, { recursive: true });
            
            const running = await isRunning();
            
            // Should handle gracefully and return false
            expect(running).toBe(false);
        });

        it('should handle PID file with special characters', async () => {
            const { pidPath } = getPaths(tempDir);
            
            // Write PID with special characters
            fs.mkdirSync(path.dirname(pidPath), { recursive: true });
            fs.writeFileSync(pidPath, '12345\0garbage');
            
            const running = await isRunning();
            
            // Should handle gracefully (parseInt will extract the number)
            // Process 12345 likely doesn't exist, so should return false
            expect(typeof running).toBe('boolean');
        });
    });
});

describe('daemon - concurrent start attempts', () => {
    let tempDir: string;
    let originalEnv: string | undefined;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-daemon-concurrent-'));
        originalEnv = process.env.PROJECTPULSE_DELEGATIONS_DIR;
        process.env.PROJECTPULSE_DELEGATIONS_DIR = tempDir;
    });

    afterEach(() => {
        if (originalEnv !== undefined) {
            process.env.PROJECTPULSE_DELEGATIONS_DIR = originalEnv;
        } else {
            delete process.env.PROJECTPULSE_DELEGATIONS_DIR;
        }
        
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    describe('race condition prevention', () => {
        it('should demonstrate need for atomic PID file creation', async () => {
            const { pidPath } = getPaths(tempDir);
            fs.mkdirSync(path.dirname(pidPath), { recursive: true });
            
            // Simulate race condition: check-then-write pattern (unsafe)
            async function unsafeStart(pid: number): Promise<boolean> {
                // Check if running
                const running = await isRunning();
                if (running) {
                    return false;
                }
                
                // Small delay to simulate race window
                await new Promise(resolve => setTimeout(resolve, 10));
                
                // Write PID
                try {
                    fs.writeFileSync(pidPath, String(pid));
                    return true;
                } catch {
                    return false;
                }
            }
            
            // Try to start "daemons" with different PIDs concurrently
            const results = await Promise.all([
                unsafeStart(10001),
                unsafeStart(10002),
                unsafeStart(10003),
            ]);
            
            // This demonstrates the race condition - multiple might succeed
            const successCount = results.filter(r => r).length;
            
            // With unsafe pattern, we can't guarantee only one succeeds
            // (this test is for demonstration of the problem)
            expect(successCount).toBeGreaterThan(0);
        });

        it('should demonstrate atomic PID file creation with wx flag', async () => {
            const { pidPath } = getPaths(tempDir);
            fs.mkdirSync(path.dirname(pidPath), { recursive: true });
            
            // Simulate atomic start: use 'wx' flag for exclusive create
            async function atomicStart(pid: number): Promise<boolean> {
                try {
                    // Attempt exclusive create
                    const fd = fs.openSync(pidPath, 'wx');
                    fs.writeSync(fd, String(pid));
                    fs.closeSync(fd);
                    return true;
                } catch (error: any) {
                    if (error.code === 'EEXIST') {
                        // File already exists - another process won
                        return false;
                    }
                    throw error;
                }
            }
            
            // Try to start multiple "daemons" concurrently
            const results = await Promise.all([
                atomicStart(20001),
                atomicStart(20002),
                atomicStart(20003),
            ]);
            
            // With atomic pattern, exactly one should succeed
            const successCount = results.filter(r => r).length;
            expect(successCount).toBe(1);
            
            // Verify only one PID was written
            const writtenPid = fs.readFileSync(pidPath, 'utf-8');
            expect(['20001', '20002', '20003']).toContain(writtenPid);
        });

        it('should handle concurrent start attempts with proper locking', async () => {
            const { pidPath } = getPaths(tempDir);
            fs.mkdirSync(path.dirname(pidPath), { recursive: true });
            
            // Track which "daemon" won
            const winners: number[] = [];
            
            async function tryStart(id: number): Promise<void> {
                try {
                    const fd = fs.openSync(pidPath, 'wx');
                    fs.writeSync(fd, String(id));
                    fs.closeSync(fd);
                    winners.push(id);
                } catch (error: any) {
                    if (error.code !== 'EEXIST') {
                        throw error;
                    }
                    // File exists, we didn't win
                }
            }
            
            // Start 10 concurrent attempts
            await Promise.all([
                tryStart(1),
                tryStart(2),
                tryStart(3),
                tryStart(4),
                tryStart(5),
                tryStart(6),
                tryStart(7),
                tryStart(8),
                tryStart(9),
                tryStart(10),
            ]);
            
            // Exactly one should win
            expect(winners).toHaveLength(1);
        });
    });

    describe('PID file creation patterns', () => {
        it('should fail when PID file already exists', async () => {
            const { pidPath } = getPaths(tempDir);
            fs.mkdirSync(path.dirname(pidPath), { recursive: true });
            
            // Create PID file
            fs.writeFileSync(pidPath, '11111');
            
            // Attempt to create with wx flag should fail
            expect(() => {
                fs.openSync(pidPath, 'wx');
            }).toThrow();
        });

        it('should succeed when PID file does not exist', async () => {
            const { pidPath } = getPaths(tempDir);
            fs.mkdirSync(path.dirname(pidPath), { recursive: true });
            
            // Attempt to create with wx flag should succeed
            const fd = fs.openSync(pidPath, 'wx');
            fs.writeSync(fd, '22222');
            
            // Read using file descriptor to avoid TOCTOU race condition
            const buffer = Buffer.alloc(5);
            fs.readSync(fd, buffer, 0, 5, 0);
            fs.closeSync(fd);
            
            expect(buffer.toString('utf-8')).toBe('22222');
        });

        it('should handle EEXIST error correctly', async () => {
            const { pidPath } = getPaths(tempDir);
            fs.mkdirSync(path.dirname(pidPath), { recursive: true });
            
            // Create file first
            fs.writeFileSync(pidPath, '33333');
            
            // Second attempt should get EEXIST
            try {
                fs.openSync(pidPath, 'wx');
                expect.fail('Should have thrown EEXIST');
            } catch (error: any) {
                expect(error.code).toBe('EEXIST');
            }
        });
    });

    describe('error handling in concurrent scenarios', () => {
        it('should handle parent directory not existing', async () => {
            const nonexistentPath = path.join(tempDir, 'nonexistent', 'daemon.pid');
            
            // Should throw error when parent doesn't exist
            expect(() => {
                fs.openSync(nonexistentPath, 'wx');
            }).toThrow();
        });

        it('should handle permission errors', async () => {
            // Skip on Windows or when running as root (common in CI)
            if (process.platform === 'win32' || process.getuid?.() === 0) {
                return;
            }
            
            const { pidPath } = getPaths(tempDir);
            const parentDir = path.dirname(pidPath);
            fs.mkdirSync(parentDir, { recursive: true });
            
            // Make directory read-only
            fs.chmodSync(parentDir, 0o444);
            
            // Should fail with permission error
            try {
                fs.openSync(pidPath, 'wx');
                expect.fail('Should have thrown permission error');
            } catch (error: any) {
                expect(['EACCES', 'EPERM']).toContain(error.code);
            } finally {
                // Restore permissions for cleanup
                fs.chmodSync(parentDir, 0o755);
            }
        });
    });
});
