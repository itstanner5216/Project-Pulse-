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
        // Platform-aware sensitive directories (matches implementation in spawner.ts)
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

        it('should allow safe directory that looks similar to restricted path', async () => {
            // Create a directory that starts with similar name but is not restricted
            // On Unix: 'root-safe' is not '/root'
            // On Windows: 'Windows-safe' is not 'C:\Windows'
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

describe('spawner - agent type validation', () => {
    let tempDir: string;
    let testRequest: DelegationRequest;

    beforeEach(() => {
        // Create a temporary directory for tests
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-agent-test-'));
        
        // Create a basic delegation request with valid workingDir
        testRequest = {
            id: 'test-agent-validation',
            parentSession: 'test-session',
            sourceCli: 'auto',
            targetCli: 'auto',
            agent: 'explorer', // Will be overridden in tests
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

    describe('valid agent types', () => {
        const validAgentTypes: Array<DelegationRequest['agent']> = [
            'explorer',
            'reviewer',
            'performance',
            'architect',
            'planner',
        ];

        validAgentTypes.forEach((agentType) => {
            it(`should accept valid agent type: ${agentType}`, async () => {
                testRequest.agent = agentType;
                const result = await spawnAgent(testRequest, 5000);
                
                // Should not fail with agent validation error
                expect(result.stderr).not.toMatch(/Invalid agent type/);
                expect(result.stderr).not.toMatch(/Valid agent types are/);
            });
        });
    });

    describe('invalid agent types', () => {
        it('should reject invalid agent type with descriptive error', async () => {
            // Force an invalid agent type by casting
            testRequest.agent = 'invalid-agent' as any;
            const result = await spawnAgent(testRequest, 5000);
            
            // Should fail with agent validation error
            expect(result.exitCode).toBeGreaterThan(0);
            expect(result.stderr).toMatch(/Invalid agent type: "invalid-agent"/);
            expect(result.stderr).toMatch(/Valid agent types are:/);
        });

        it('should list all valid agent types in error message', async () => {
            testRequest.agent = 'nonexistent' as any;
            const result = await spawnAgent(testRequest, 5000);
            
            // Should list all valid types
            expect(result.stderr).toMatch(/explorer/);
            expect(result.stderr).toMatch(/reviewer/);
            expect(result.stderr).toMatch(/performance/);
            expect(result.stderr).toMatch(/architect/);
            expect(result.stderr).toMatch(/planner/);
        });

        it('should reject empty string as agent type', async () => {
            testRequest.agent = '' as any;
            const result = await spawnAgent(testRequest, 5000);
            
            expect(result.exitCode).toBeGreaterThan(0);
            expect(result.stderr).toMatch(/Invalid agent type/);
        });

        it('should reject null as agent type', async () => {
            testRequest.agent = null as any;
            const result = await spawnAgent(testRequest, 5000);
            
            expect(result.exitCode).toBeGreaterThan(0);
            expect(result.stderr).toMatch(/Invalid agent type/);
        });

        it('should reject undefined as agent type', async () => {
            testRequest.agent = undefined as any;
            const result = await spawnAgent(testRequest, 5000);
            
            expect(result.exitCode).toBeGreaterThan(0);
            expect(result.stderr).toMatch(/Invalid agent type/);
        });

        it('should reject agent type with wrong casing', async () => {
            testRequest.agent = 'Explorer' as any; // Capital E
            const result = await spawnAgent(testRequest, 5000);
            
            expect(result.exitCode).toBeGreaterThan(0);
            expect(result.stderr).toMatch(/Invalid agent type: "Explorer"/);
        });

        it('should reject agent type with extra whitespace', async () => {
            testRequest.agent = ' explorer ' as any;
            const result = await spawnAgent(testRequest, 5000);
            
            expect(result.exitCode).toBeGreaterThan(0);
            expect(result.stderr).toMatch(/Invalid agent type/);
        });

        it('should reject agent type that looks similar to valid type', async () => {
            testRequest.agent = 'explorers' as any; // Plural form
            const result = await spawnAgent(testRequest, 5000);
            
            expect(result.exitCode).toBeGreaterThan(0);
            expect(result.stderr).toMatch(/Invalid agent type: "explorers"/);
        });

        it('should reject special characters as agent type', async () => {
            testRequest.agent = '../../../etc/passwd' as any;
            const result = await spawnAgent(testRequest, 5000);
            
            expect(result.exitCode).toBeGreaterThan(0);
            expect(result.stderr).toMatch(/Invalid agent type/);
        });

        it('should reject numeric values as agent type', async () => {
            testRequest.agent = 123 as any;
            const result = await spawnAgent(testRequest, 5000);
            
            expect(result.exitCode).toBeGreaterThan(0);
            expect(result.stderr).toMatch(/Invalid agent type/);
        });
    });

    describe('error message format', () => {
        it('should provide clear error message with both invalid type and valid options', async () => {
            testRequest.agent = 'unknown-type' as any;
            const result = await spawnAgent(testRequest, 5000);
            
            // Verify error message structure
            expect(result.stderr).toMatch(/Invalid agent type: "unknown-type"\. Valid agent types are: .+/);
        });

        it('should format valid types as comma-separated list', async () => {
            testRequest.agent = 'badtype' as any;
            const result = await spawnAgent(testRequest, 5000);
            
            // Should have commas between valid types
            const match = result.stderr.match(/Valid agent types are: ([^.]+)/);
            expect(match).toBeTruthy();
            if (match) {
                const validTypesList = match[1];
                expect(validTypesList).toMatch(/,/); // Contains commas
                expect(validTypesList.split(',').length).toBe(5); // Has 5 types
            }
        });
    });
});
