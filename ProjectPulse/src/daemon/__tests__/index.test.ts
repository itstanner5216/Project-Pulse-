/**
 * Tests for daemon index module, focusing on process existence check.
 */

import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock the storage module before importing anything else
vi.mock('../../lib/delegation/storage', () => ({
    getDelegationsDir: vi.fn(),
}));

// Import after mocking
import { isRunning } from '../index';
import { getDelegationsDir } from '../../lib/delegation/storage';

describe('daemon - process existence check', () => {
    let tempDir: string;
    let pidFilePath: string;
    let originalKill: typeof process.kill;
    const TEST_PID = 99999; // Use a PID that's unlikely to exist

    beforeEach(() => {
        // Save the original process.kill before each test
        originalKill = process.kill;
        
        // Create a temporary directory for the delegations folder
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-daemon-test-'));
        pidFilePath = path.join(tempDir, 'daemon.pid');
        
        // Set the mock to return our temp directory
        (getDelegationsDir as Mock).mockReturnValue(tempDir);
    });

    afterEach(() => {
        // Always restore process.kill, even if test fails
        process.kill = originalKill;
        
        // Clean up temporary directory
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
        vi.clearAllMocks();
    });

    describe('isRunning() with different error codes', () => {
        it('should return false when no PID file exists', async () => {
            // Ensure no PID file exists
            if (fs.existsSync(pidFilePath)) {
                fs.unlinkSync(pidFilePath);
            }

            const result = await isRunning();
            expect(result).toBe(false);
        });

        it('should return true when process exists and is accessible', async () => {
            // Write our own process PID (which definitely exists)
            fs.writeFileSync(pidFilePath, String(process.pid));

            const result = await isRunning();
            expect(result).toBe(true);
            
            // PID file should still exist
            expect(fs.existsSync(pidFilePath)).toBe(true);
        });

        it('should handle ESRCH error (process does not exist)', async () => {
            // Write a PID that doesn't exist
            fs.writeFileSync(pidFilePath, String(TEST_PID));

            // Mock process.kill to throw ESRCH error
            process.kill = vi.fn((pid: number, signal?: string | number) => {
                if (pid === TEST_PID) {
                    const err = new Error('No such process') as NodeJS.ErrnoException;
                    err.code = 'ESRCH';
                    throw err;
                }
                return originalKill(pid, signal);
            });

            const result = await isRunning();
            
            // Should return false
            expect(result).toBe(false);
            
            // PID file should be removed
            expect(fs.existsSync(pidFilePath)).toBe(false);
        });

        it('should handle EPERM error (process exists but permission denied)', async () => {
            // Write a PID
            fs.writeFileSync(pidFilePath, String(TEST_PID));

            // Mock process.kill to throw EPERM error
            process.kill = vi.fn((pid: number, signal?: string | number) => {
                if (pid === TEST_PID) {
                    const err = new Error('Operation not permitted') as NodeJS.ErrnoException;
                    err.code = 'EPERM';
                    throw err;
                }
                return originalKill(pid, signal);
            });

            const result = await isRunning();
            
            // Should return true (process exists, just can't signal it)
            expect(result).toBe(true);
            
            // PID file should NOT be removed
            expect(fs.existsSync(pidFilePath)).toBe(true);
        });

        it('should handle other unexpected errors', async () => {
            // Write a PID
            fs.writeFileSync(pidFilePath, String(TEST_PID));

            // Mock process.kill to throw an unexpected error
            process.kill = vi.fn((pid: number, signal?: string | number) => {
                if (pid === TEST_PID) {
                    const err = new Error('Some unexpected error') as NodeJS.ErrnoException;
                    err.code = 'EUNKNOWN';
                    throw err;
                }
                return originalKill(pid, signal);
            });

            const result = await isRunning();
            
            // Should return false (safe default)
            expect(result).toBe(false);
            
            // PID file should be removed for safety
            expect(fs.existsSync(pidFilePath)).toBe(false);
        });

        it('should handle error without code property', async () => {
            // Write a PID
            fs.writeFileSync(pidFilePath, String(TEST_PID));

            // Mock process.kill to throw a generic error without code
            process.kill = vi.fn((pid: number, signal?: string | number) => {
                if (pid === TEST_PID) {
                    throw new Error('Generic error without code');
                }
                return originalKill(pid, signal);
            });

            const result = await isRunning();
            
            // Should return false (safe default)
            expect(result).toBe(false);
            
            // PID file should be removed for safety
            expect(fs.existsSync(pidFilePath)).toBe(false);
        });
    });

    describe('multi-user scenarios', () => {
        it('should correctly identify daemon running as different user (EPERM)', async () => {
            // Simulate a daemon running as a different user (e.g., root)
            fs.writeFileSync(pidFilePath, String(1)); // PID 1 usually exists as init/systemd

            // Mock process.kill to simulate EPERM (common when checking root processes)
            process.kill = vi.fn((pid: number, signal?: string | number) => {
                if (pid === 1) {
                    const err = new Error('Operation not permitted') as NodeJS.ErrnoException;
                    err.code = 'EPERM';
                    throw err;
                }
                return originalKill(pid, signal);
            });

            const result = await isRunning();
            
            // Should return true - daemon is running, just as different user
            expect(result).toBe(true);
            
            // PID file should remain intact
            expect(fs.existsSync(pidFilePath)).toBe(true);
            expect(fs.readFileSync(pidFilePath, 'utf-8')).toBe('1');
        });

        it('should clean up stale PID file from crashed process (ESRCH)', async () => {
            // Simulate a stale PID file from a crashed daemon
            fs.writeFileSync(pidFilePath, String(TEST_PID));

            // Mock process.kill to simulate ESRCH (process doesn't exist)
            process.kill = vi.fn((pid: number, signal?: string | number) => {
                if (pid === TEST_PID) {
                    const err = new Error('No such process') as NodeJS.ErrnoException;
                    err.code = 'ESRCH';
                    throw err;
                }
                return originalKill(pid, signal);
            });

            const result = await isRunning();
            
            // Should return false - process doesn't exist
            expect(result).toBe(false);
            
            // Stale PID file should be cleaned up
            expect(fs.existsSync(pidFilePath)).toBe(false);
        });
    });
});
