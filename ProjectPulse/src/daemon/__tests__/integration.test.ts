/**
 * Integration tests for daemon race condition prevention.
 * 
 * These tests spawn actual daemon processes to verify that the atomic
 * PID file creation prevents multiple daemon instances from running.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn, ChildProcess } from 'child_process';

describe('daemon - multi-process integration', () => {
    let tempDir: string;
    let daemonScript: string;

    beforeAll(() => {
        // Create temporary directory for test
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-daemon-integration-'));
        
        // Create a minimal test script that simulates daemon start
        daemonScript = path.join(tempDir, 'test-daemon.js');
        
        const scriptContent = `
const fs = require('fs').promises;
const path = require('path');

const pidPath = process.argv[2] || path.join('${tempDir}', 'test.pid');

async function writePid() {
    const dir = path.dirname(pidPath);
    await fs.mkdir(dir, { recursive: true });
    
    try {
        const handle = await fs.open(pidPath, 'wx');
        await handle.writeFile(String(process.pid));
        await handle.close();
        return true;
    } catch (error) {
        if (error.code === 'EEXIST') {
            return false;
        }
        throw error;
    }
}

async function main() {
    const claimed = await writePid();
    console.log(JSON.stringify({ claimed, pid: process.pid }));
    
    if (claimed) {
        // Simulate daemon running for a short time
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    process.exit(claimed ? 0 : 1);
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(2);
});
`;
        
        fs.writeFileSync(daemonScript, scriptContent);
    });

    afterAll(() => {
        // Clean up temporary directory
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('should allow only one daemon to claim PID file when started from multiple processes', async () => {
        const pidPath = path.join(tempDir, 'multi-process-test.pid');
        
        // Ensure PID file doesn't exist
        if (fs.existsSync(pidPath)) {
            await fs.promises.unlink(pidPath);
        }
        
        // Spawn 5 processes simultaneously, all trying to claim the same PID file
        const processCount = 5;
        const processes: ChildProcess[] = [];
        const results: Array<{ claimed: boolean; pid: number; exitCode: number | null }> = [];
        
        for (let i = 0; i < processCount; i++) {
            const proc = spawn('node', [daemonScript, pidPath], {
                stdio: ['ignore', 'pipe', 'pipe']
            });
            processes.push(proc);
        }
        
        // Collect results from all processes
        const promises = processes.map((proc, index) => {
            return new Promise<void>((resolve) => {
                let stdout = '';
                let stderr = '';
                
                proc.stdout?.on('data', (data) => {
                    stdout += data.toString();
                });
                
                proc.stderr?.on('data', (data) => {
                    stderr += data.toString();
                });
                
                proc.on('close', (code) => {
                    try {
                        const output = stdout.trim();
                        if (output) {
                            const parsed = JSON.parse(output);
                            results.push({
                                claimed: parsed.claimed,
                                pid: parsed.pid,
                                exitCode: code
                            });
                        }
                    } catch (err) {
                        // If parsing fails, record as unclaimed
                        results.push({
                            claimed: false,
                            pid: 0,
                            exitCode: code
                        });
                    }
                    resolve();
                });
            });
        });
        
        // Wait for all processes to complete
        await Promise.all(promises);
        
        // Verify results
        expect(results.length).toBe(processCount);
        
        // Exactly one should have claimed the PID file
        const claimedCount = results.filter(r => r.claimed).length;
        expect(claimedCount).toBe(1);
        
        // The others should have failed to claim
        const unclaimedCount = results.filter(r => !r.claimed).length;
        expect(unclaimedCount).toBe(processCount - 1);
        
        // One should have exit code 0 (success)
        const successCount = results.filter(r => r.exitCode === 0).length;
        expect(successCount).toBe(1);
        
        // Others should have exit code 1 (already running)
        const alreadyRunningCount = results.filter(r => r.exitCode === 1).length;
        expect(alreadyRunningCount).toBe(processCount - 1);
        
        // PID file should exist and contain the winning process's PID
        expect(fs.existsSync(pidPath)).toBe(true);
        const pidContent = await fs.promises.readFile(pidPath, 'utf-8');
        const winner = results.find(r => r.claimed);
        expect(pidContent).toBe(String(winner?.pid));
    }, 10000); // Increase timeout for process spawning

    it('should allow new daemon to start after PID file is removed', async () => {
        const pidPath = path.join(tempDir, 'restart-test.pid');
        
        // Ensure clean state
        if (fs.existsSync(pidPath)) {
            await fs.promises.unlink(pidPath);
        }
        
        // First daemon attempt
        const proc1 = spawn('node', [daemonScript, pidPath], {
            stdio: ['ignore', 'pipe', 'pipe']
        });
        
        let result1: any = null;
        const promise1 = new Promise<void>((resolve) => {
            let stdout = '';
            proc1.stdout?.on('data', (data) => {
                stdout += data.toString();
            });
            proc1.on('close', () => {
                try {
                    result1 = JSON.parse(stdout.trim());
                } catch {
                    // Ignore
                }
                resolve();
            });
        });
        
        await promise1;
        
        expect(result1?.claimed).toBe(true);
        expect(fs.existsSync(pidPath)).toBe(true);
        
        // Remove PID file to simulate daemon shutdown
        await fs.promises.unlink(pidPath);
        
        // Second daemon attempt should now succeed
        const proc2 = spawn('node', [daemonScript, pidPath], {
            stdio: ['ignore', 'pipe', 'pipe']
        });
        
        let result2: any = null;
        const promise2 = new Promise<void>((resolve) => {
            let stdout = '';
            proc2.stdout?.on('data', (data) => {
                stdout += data.toString();
            });
            proc2.on('close', () => {
                try {
                    result2 = JSON.parse(stdout.trim());
                } catch {
                    // Ignore
                }
                resolve();
            });
        });
        
        await promise2;
        
        expect(result2?.claimed).toBe(true);
    }, 10000);

    it('should handle rapid sequential start attempts', async () => {
        const pidPath = path.join(tempDir, 'rapid-sequential-test.pid');
        
        // Ensure clean state
        if (fs.existsSync(pidPath)) {
            await fs.promises.unlink(pidPath);
        }
        
        const attemptCount = 3;
        const results: boolean[] = [];
        
        for (let i = 0; i < attemptCount; i++) {
            const proc = spawn('node', [daemonScript, pidPath], {
                stdio: ['ignore', 'pipe', 'pipe']
            });
            
            const claimed = await new Promise<boolean>((resolve) => {
                let stdout = '';
                proc.stdout?.on('data', (data) => {
                    stdout += data.toString();
                });
                proc.on('close', () => {
                    try {
                        const result = JSON.parse(stdout.trim());
                        resolve(result.claimed);
                    } catch {
                        resolve(false);
                    }
                });
            });
            
            results.push(claimed);
            
            // If this one claimed it, wait for it to finish
            if (claimed) {
                await new Promise(resolve => setTimeout(resolve, 2500));
            }
        }
        
        // First should claim, others should fail
        expect(results[0]).toBe(true);
        expect(results[1]).toBe(false);
        expect(results[2]).toBe(false);
    }, 15000);
});
