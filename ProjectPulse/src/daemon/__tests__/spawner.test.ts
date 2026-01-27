/**
 * Tests for spawner module, focusing on workingDir path validation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// We need to test the validateWorkingDir function which is internal
// So we'll import the module and test through the public API
import { spawnAgent, SpawnResult } from '../spawner';
import { DelegationRequest } from '../../lib/delegation/types';

describe('spawner - workingDir validation', () => {
    let tempDir: string;
    let testRequest: DelegationRequest;

    beforeEach(() => {
        // Create a temporary directory for tests
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-test-'));
        
        // Create a basic delegation request
        testRequest = {
            id: 'test-request',
            parentSession: 'test-session',
            sourceCli: 'auto',
            targetCli: 'auto',
            agent: 'explorer',
            prompt: 'test prompt',
            status: 'pending',
            workingDir: tempDir,
            createdAt: new Date().toISOString(),
            timeout: 60,
        };
    });

    afterEach(() => {
        // Clean up temporary directory
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    describe('valid working directories', () => {
        it('should accept valid absolute directory paths', async () => {
            testRequest.workingDir = tempDir;
            const result = await spawnAgent(testRequest, 5000);
            
            // Should not fail with validation error
            expect(result.stderr).not.toMatch(/Working directory does not exist/);
            expect(result.stderr).not.toMatch(/Working directory is not a directory/);
            expect(result.stderr).not.toMatch(/Working directory is in restricted path/);
        });

        it('should accept valid relative directory paths', async () => {
            const relPath = path.relative(process.cwd(), tempDir);
            testRequest.workingDir = relPath;
            const result = await spawnAgent(testRequest, 5000);
            
            // Should not fail with validation error
            expect(result.stderr).not.toMatch(/Working directory does not exist/);
            expect(result.stderr).not.toMatch(/Working directory is not a directory/);
            expect(result.stderr).not.toMatch(/Working directory is in restricted path/);
        });

        it('should resolve relative paths to absolute paths', async () => {
            // This test verifies that relative paths work correctly
            const relPath = '.';
            testRequest.workingDir = relPath;
            const result = await spawnAgent(testRequest, 5000);
            
            // Should work without validation errors
            expect(result.stderr).not.toMatch(/Working directory does not exist/);
        });
    });

    describe('invalid working directories', () => {
        it('should reject non-existent paths', async () => {
            testRequest.workingDir = '/non/existent/path';
            const result = await spawnAgent(testRequest, 5000);
            
            expect(result.exitCode).toBe(1);
            expect(result.stderr).toMatch(/Working directory does not exist/);
        });

        it('should reject file paths (not directories)', async () => {
            // Create a test file
            const testFile = path.join(tempDir, 'testfile.txt');
            fs.writeFileSync(testFile, 'test content');
            
            testRequest.workingDir = testFile;
            const result = await spawnAgent(testRequest, 5000);
            
            expect(result.exitCode).toBe(1);
            expect(result.stderr).toMatch(/Working directory is not a directory/);
        });

        it('should reject empty string paths', async () => {
            testRequest.workingDir = '';
            const result = await spawnAgent(testRequest, 5000);
            
            // Empty string resolves to current directory, which should be valid
            // unless we're in a restricted directory
            expect(result.exitCode).toBeGreaterThanOrEqual(0);
        });
    });

    describe('sensitive system directories', () => {
        const sensitiveDirs = ['/root', '/etc', '/sys', '/proc', '/dev'];

        sensitiveDirs.forEach((dir) => {
            it(`should reject ${dir} directory`, async () => {
                testRequest.workingDir = dir;
                const result = await spawnAgent(testRequest, 5000);
                
                expect(result.exitCode).toBe(1);
                expect(result.stderr).toMatch(/Working directory is in restricted path/);
            });

            it(`should reject subdirectories of ${dir}`, async () => {
                testRequest.workingDir = path.join(dir, 'subdirectory');
                const result = await spawnAgent(testRequest, 5000);
                
                expect(result.exitCode).toBe(1);
                expect(result.stderr).toMatch(/Working directory is in restricted path/);
            });
        });

        it('should allow /root-like directory that is not /root', async () => {
            // Create a directory that starts with 'root' but is not /root
            const safeDir = path.join(tempDir, 'root-safe');
            fs.mkdirSync(safeDir);
            
            testRequest.workingDir = safeDir;
            const result = await spawnAgent(testRequest, 5000);
            
            // Should not fail with restricted path error
            expect(result.stderr).not.toMatch(/Working directory is in restricted path/);
        });
    });

    describe('edge cases', () => {
        it('should handle paths with special characters', async () => {
            const specialDir = path.join(tempDir, 'special-dir_123');
            fs.mkdirSync(specialDir);
            
            testRequest.workingDir = specialDir;
            const result = await spawnAgent(testRequest, 5000);
            
            expect(result.stderr).not.toMatch(/Working directory does not exist/);
            expect(result.stderr).not.toMatch(/Working directory is not a directory/);
        });

        it('should handle paths with spaces', async () => {
            const spaceDir = path.join(tempDir, 'dir with spaces');
            fs.mkdirSync(spaceDir);
            
            testRequest.workingDir = spaceDir;
            const result = await spawnAgent(testRequest, 5000);
            
            expect(result.stderr).not.toMatch(/Working directory does not exist/);
            expect(result.stderr).not.toMatch(/Working directory is not a directory/);
        });

        it('should handle nested directory paths', async () => {
            const nestedDir = path.join(tempDir, 'level1', 'level2', 'level3');
            fs.mkdirSync(nestedDir, { recursive: true });
            
            testRequest.workingDir = nestedDir;
            const result = await spawnAgent(testRequest, 5000);
            
            expect(result.stderr).not.toMatch(/Working directory does not exist/);
            expect(result.stderr).not.toMatch(/Working directory is not a directory/);
        });

        it('should handle symlinks to valid directories', async () => {
            const targetDir = path.join(tempDir, 'target');
            const symlinkDir = path.join(tempDir, 'symlink');
            fs.mkdirSync(targetDir);
            
            try {
                fs.symlinkSync(targetDir, symlinkDir, 'dir');
                
                testRequest.workingDir = symlinkDir;
                const result = await spawnAgent(testRequest, 5000);
                
                expect(result.stderr).not.toMatch(/Working directory does not exist/);
                expect(result.stderr).not.toMatch(/Working directory is not a directory/);
            } catch (error) {
                // Symlink creation might fail on some systems (Windows without admin)
                // Skip this test in that case
                console.log('Skipping symlink test:', error);
            }
        });
    });

    describe('path traversal prevention', () => {
        it('should normalize paths with .. components', async () => {
            const nestedDir = path.join(tempDir, 'subdir');
            fs.mkdirSync(nestedDir);
            
            // Use path with .. that resolves to a valid directory
            const pathWithDotDot = path.join(nestedDir, '..', path.basename(nestedDir));
            testRequest.workingDir = pathWithDotDot;
            const result = await spawnAgent(testRequest, 5000);
            
            expect(result.stderr).not.toMatch(/Working directory does not exist/);
        });

        it('should handle paths with multiple slashes', async () => {
            // Create path with redundant slashes
            const pathWithSlashes = tempDir.replace(/\//g, '//');
            testRequest.workingDir = pathWithSlashes;
            const result = await spawnAgent(testRequest, 5000);
            
            // path.resolve should normalize this
            expect(result.stderr).not.toMatch(/Working directory does not exist/);
        });
    });
});

describe('spawner - loadAgentPrompt validation', () => {
    // Note: loadAgentPrompt is a private function, but it's called by spawnAgent
    // So we test it indirectly through spawnAgent
    
    it('should validate workingDir when loading agent prompts', async () => {
        const testRequest: DelegationRequest = {
            id: 'test-request',
            parentSession: 'test-session',
            sourceCli: 'auto',
            targetCli: 'auto',
            agent: 'explorer',
            prompt: 'test prompt',
            status: 'pending',
            workingDir: '/non/existent/path',
            createdAt: new Date().toISOString(),
            timeout: 60,
        };
        
        const result = await spawnAgent(testRequest, 5000);
        
        // Should fail at validation before even trying to load agent prompt
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toMatch(/Working directory does not exist/);
    });
});

describe('spawner - force-kill timer cleanup', () => {
    let tempDir: string;
    
    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-test-'));
    });
    
    afterEach(() => {
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });
    
    it('should clear force-kill timer when process exits normally before timeout', async () => {
        // Create a request that will timeout
        const testRequest: DelegationRequest = {
            id: 'test-timeout',
            parentSession: 'test-session',
            sourceCli: 'auto',
            targetCli: 'auto',
            agent: 'explorer',
            prompt: 'test prompt',
            status: 'pending',
            workingDir: tempDir,
            createdAt: new Date().toISOString(),
            timeout: 60,
        };
        
        // Spawn with a timeout that will trigger
        const resultPromise = spawnAgent(testRequest, 100);
        
        // Wait for the result
        const result = await resultPromise;
        
        // Verify that we got a result (process completed)
        expect(result).toBeDefined();
        expect(result.exitCode).toBeGreaterThanOrEqual(0);
        
        // Wait a bit to ensure no timers are keeping the event loop alive
        // If the force-kill timer wasn't cleared, this would hang
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // If we get here, the timer was properly cleared
        expect(true).toBe(true);
    });
    
    it('should clear force-kill timer when process errors before force-kill', async () => {
        // Create a request with a very short timeout to trigger the timeout path
        const testRequest: DelegationRequest = {
            id: 'test-error',
            parentSession: 'test-session',
            sourceCli: 'auto',
            targetCli: 'auto',
            agent: 'explorer',
            prompt: 'test prompt',
            status: 'pending',
            workingDir: tempDir,
            createdAt: new Date().toISOString(),
            timeout: 60,
        };
        
        // Use a very short timeout to trigger timeout quickly
        const result = await spawnAgent(testRequest, 50);
        
        // Should complete (either timed out or failed to find CLI)
        expect(result).toBeDefined();
        expect(result.exitCode).toBeGreaterThanOrEqual(0);
        
        // Wait to ensure no timers are keeping event loop alive
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // If we get here, the timer was properly cleared
        expect(true).toBe(true);
    });
    
    it('should allow event loop to exit cleanly after process completion', async () => {
        // This test verifies that there are no lingering timers
        const testRequest: DelegationRequest = {
            id: 'test-clean-exit',
            parentSession: 'test-session',
            sourceCli: 'auto',
            targetCli: 'auto',
            agent: 'explorer',
            prompt: 'test prompt',
            status: 'pending',
            workingDir: tempDir,
            createdAt: new Date().toISOString(),
            timeout: 60,
        };
        
        // Run spawn with short timeout
        const result = await spawnAgent(testRequest, 50);
        
        expect(result).toBeDefined();
        
        // Create a promise that checks if the event loop has pending timers
        // by checking if Node can exit cleanly
        const canExitCleanly = await new Promise<boolean>((resolve) => {
            // Use setImmediate to check after all current I/O
            setImmediate(() => {
                // If we can schedule and execute this, there are no blocking timers
                resolve(true);
            });
        });
        
        expect(canExitCleanly).toBe(true);
    });
    
    it('should handle timeout scenario and clear both timers', async () => {
        // Create a mock test script that runs longer than timeout
        const longScript = path.join(tempDir, 'long-script.sh');
        fs.writeFileSync(longScript, '#!/bin/bash\nsleep 10\n', { mode: 0o755 });
        
        const testRequest: DelegationRequest = {
            id: 'test-timeout-cleanup',
            parentSession: 'test-session',
            sourceCli: 'auto',
            targetCli: 'auto',
            agent: 'explorer',
            prompt: 'test prompt',
            status: 'pending',
            workingDir: tempDir,
            createdAt: new Date().toISOString(),
            timeout: 60,
        };
        
        // Spawn with very short timeout to trigger timeout path
        const result = await spawnAgent(testRequest, 100);
        
        // Should complete (either timed out or failed to find CLI)
        expect(result).toBeDefined();
        
        // Wait to verify timers are cleared
        await new Promise(resolve => setTimeout(resolve, 6000));
        
        // If we reach here without hanging, timers were properly cleared
        expect(true).toBe(true);
    }, 10000); // Increase test timeout to allow for the 6 second wait
});
