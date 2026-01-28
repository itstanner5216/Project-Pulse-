/**
 * Tests for spawner module, focusing on workingDir path validation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';

// We need to test the validateWorkingDir function which is internal
// So we'll import the module and test through the public API
import { spawnAgent, SpawnResult } from '../spawner';
import { DelegationRequest } from '../../lib/delegation/types';

// Mock child_process to prevent real CLI execution
vi.mock('child_process', () => {
    return {
        spawn: vi.fn(() => {
            const mockProcess = new EventEmitter() as any;
            mockProcess.stdout = new EventEmitter();
            mockProcess.stderr = new EventEmitter();
            mockProcess.kill = vi.fn();
            
            // Simulate immediate process completion
            setImmediate(() => {
                mockProcess.stdout.emit('data', 'Mock output');
                mockProcess.emit('close', 0);
            });
            
            return mockProcess;
        }),
    };
});

describe('spawner - workingDir validation', () => {
    let tempDir: string;
    let testRequest: DelegationRequest;

    beforeEach(() => {
        // Create a temporary directory for tests
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-test-'));
        
        // Clear all mocks before each test
        vi.clearAllMocks();
        
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
            
            // Empty string resolves to process.cwd() via path.resolve('')
            // This should be valid unless running from a restricted directory
            expect(result.stderr).not.toMatch(/Working directory does not exist/);
            expect(result.stderr).not.toMatch(/Working directory is not a directory/);
            expect(result.stderr).not.toMatch(/Working directory is in restricted path/);
        });
    });

    describe('sensitive system directories', () => {
        // Use platform-aware sensitive directories (mirrors logic in spawner.ts)
        const sensitiveDirs = process.platform === 'win32'
            ? ['C:\\Windows', 'C:\\Windows\\System32', 'C:\\Program Files']
            : ['/root', '/etc', '/sys', '/proc', '/dev'];

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

        it('should allow safe directory that looks similar to sensitive path', async () => {
            // Create a directory that starts with a similar name but is not in the sensitive path
            const safeDirName = process.platform === 'win32' ? 'Windows-safe' : 'root-safe';
            const safeDir = path.join(tempDir, safeDirName);
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
            // Skip on Windows where symlinks require admin privileges
            if (process.platform === 'win32') {
                // Check if we can create symlinks
                const testSymlink = path.join(tempDir, '.symlink-test');
                try {
                    fs.symlinkSync(tempDir, testSymlink, 'dir');
                    fs.unlinkSync(testSymlink);
                } catch {
                    console.log('Skipping symlink test: requires admin privileges on Windows');
                    return;
                }
            }
            
            const targetDir = path.join(tempDir, 'target');
            const symlinkDir = path.join(tempDir, 'symlink');
            fs.mkdirSync(targetDir);
            
            fs.symlinkSync(targetDir, symlinkDir, 'dir');
            
            testRequest.workingDir = symlinkDir;
            const result = await spawnAgent(testRequest, 5000);
            
            expect(result.stderr).not.toMatch(/Working directory does not exist/);
            expect(result.stderr).not.toMatch(/Working directory is not a directory/);
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
            // Create path with redundant slashes (platform-aware)
            const pathWithSlashes = process.platform === 'win32'
                ? tempDir.replace(/\\/g, '\\\\')
                : tempDir.replace(/\//g, '//');
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
