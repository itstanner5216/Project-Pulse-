/**
 * Tests for structured logger module.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Logger, initLogger, getLogger } from '../logger';

describe('Logger', () => {
    let testLogDir: string;
    let testLogPath: string;

    beforeEach(async () => {
        // Create temp log directory
        testLogDir = path.join(process.cwd(), 'test-logs-' + Date.now());
        testLogPath = path.join(testLogDir, 'test.log');
        await fs.mkdir(testLogDir, { recursive: true });
    });

    afterEach(async () => {
        // Clean up test logs
        try {
            await fs.rm(testLogDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    });

    describe('Log Levels', () => {
        it('should write logs at or above minimum level', async () => {
            const logger = new Logger({
                logPath: testLogPath,
                minLevel: 'INFO',
                format: 'text',
            });

            logger.debug('debug message');
            logger.info('info message');
            logger.warn('warn message');
            logger.error('error message');

            // Wait for async writes
            await new Promise(resolve => setTimeout(resolve, 100));

            const content = await fs.readFile(testLogPath, 'utf-8');
            expect(content).not.toContain('debug message');
            expect(content).toContain('info message');
            expect(content).toContain('warn message');
            expect(content).toContain('error message');
        });

        it('should respect DEBUG level', async () => {
            const logger = new Logger({
                logPath: testLogPath,
                minLevel: 'DEBUG',
                format: 'text',
            });

            logger.debug('debug message');

            await new Promise(resolve => setTimeout(resolve, 100));

            const content = await fs.readFile(testLogPath, 'utf-8');
            expect(content).toContain('debug message');
        });
    });

    describe('Text Format', () => {
        it('should format logs as text with timestamp and level', async () => {
            const logger = new Logger({
                logPath: testLogPath,
                format: 'text',
                minLevel: 'INFO',
            });

            logger.info('test message');

            await new Promise(resolve => setTimeout(resolve, 100));

            const content = await fs.readFile(testLogPath, 'utf-8');
            expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[INFO\] test message/);
        });

        it('should include delegation ID in text format', async () => {
            const logger = new Logger({
                logPath: testLogPath,
                format: 'text',
                minLevel: 'INFO',
            });

            logger.info('test message', 'delegation-123');

            await new Promise(resolve => setTimeout(resolve, 100));

            const content = await fs.readFile(testLogPath, 'utf-8');
            expect(content).toContain('[delegation-123]');
        });

        it('should include context in text format', async () => {
            const logger = new Logger({
                logPath: testLogPath,
                format: 'text',
                minLevel: 'INFO',
            });

            logger.info('test message', undefined, { key: 'value', num: 42 });

            await new Promise(resolve => setTimeout(resolve, 100));

            const content = await fs.readFile(testLogPath, 'utf-8');
            expect(content).toContain('{"key":"value","num":42}');
        });
    });

    describe('JSON Format', () => {
        it('should format logs as JSON', async () => {
            const logger = new Logger({
                logPath: testLogPath,
                format: 'json',
                minLevel: 'INFO',
            });

            logger.info('test message', 'delegation-123', { key: 'value' });

            await new Promise(resolve => setTimeout(resolve, 100));

            const content = await fs.readFile(testLogPath, 'utf-8');
            const logEntry = JSON.parse(content.trim());

            expect(logEntry.level).toBe('INFO');
            expect(logEntry.message).toBe('test message');
            expect(logEntry.delegationId).toBe('delegation-123');
            expect(logEntry.context).toEqual({ key: 'value' });
            expect(logEntry.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
        });

        it('should include error in JSON format', async () => {
            const logger = new Logger({
                logPath: testLogPath,
                format: 'json',
                minLevel: 'ERROR',
            });

            const error = new Error('test error');
            logger.error('operation failed', 'del-123', undefined, error);

            await new Promise(resolve => setTimeout(resolve, 100));

            const content = await fs.readFile(testLogPath, 'utf-8');
            const logEntry = JSON.parse(content.trim());

            expect(logEntry.error).toBeDefined();
            expect(logEntry.error.message).toBe('test error');
        });
    });

    describe('Delegation ID Tracking', () => {
        it('should include delegation ID in all log methods', async () => {
            const logger = new Logger({
                logPath: testLogPath,
                format: 'text',
                minLevel: 'DEBUG',
            });

            logger.debug('debug', 'id-1');
            logger.info('info', 'id-2');
            logger.warn('warn', 'id-3');
            logger.error('error', 'id-4');

            await new Promise(resolve => setTimeout(resolve, 100));

            const content = await fs.readFile(testLogPath, 'utf-8');
            expect(content).toContain('[id-1]');
            expect(content).toContain('[id-2]');
            expect(content).toContain('[id-3]');
            expect(content).toContain('[id-4]');
        });
    });

    describe('Log Rotation', () => {
        it('should rotate logs when max size exceeded', async () => {
            const logger = new Logger({
                logPath: testLogPath,
                format: 'text',
                minLevel: 'INFO',
                maxSize: 100, // Small size to trigger rotation
                maxFiles: 3,
            });

            // Write enough to trigger rotation
            for (let i = 0; i < 20; i++) {
                logger.info(`Message number ${i} with some padding text to increase size`);
            }

            // Wait for all writes and rotation
            await new Promise(resolve => setTimeout(resolve, 500));

            // Check that rotated files exist
            const files = await fs.readdir(testLogDir);
            const rotatedFiles = files.filter(f => f.includes('test.log.'));
            expect(rotatedFiles.length).toBeGreaterThan(0);
        });
    });

    describe('Singleton Logger', () => {
        it('should initialize and get singleton logger', () => {
            const logger = initLogger({
                logPath: testLogPath,
                minLevel: 'INFO',
            });

            const retrieved = getLogger();
            expect(retrieved).toBe(logger);
        });
    });

    describe('Timestamps', () => {
        it('should include ISO timestamps in all logs', async () => {
            const logger = new Logger({
                logPath: testLogPath,
                format: 'text',
                minLevel: 'INFO',
            });

            const before = new Date().toISOString();
            logger.info('test message');
            await new Promise(resolve => setTimeout(resolve, 100));
            const after = new Date().toISOString();

            const content = await fs.readFile(testLogPath, 'utf-8');
            
            // Extract timestamp from log
            const timestampMatch = content.match(/\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\]/);
            expect(timestampMatch).toBeTruthy();
            
            if (timestampMatch) {
                const timestamp = timestampMatch[1];
                expect(timestamp >= before).toBe(true);
                expect(timestamp <= after).toBe(true);
            }
        });
    });

    describe('Flush', () => {
        it('should flush all pending writes', async () => {
            const logger = new Logger({
                logPath: testLogPath,
                format: 'text',
                minLevel: 'INFO',
            });

            // Write multiple logs quickly
            logger.info('message 1');
            logger.info('message 2');
            logger.info('message 3');

            // Flush and verify all are written
            await logger.flush();

            const content = await fs.readFile(testLogPath, 'utf-8');
            expect(content).toContain('message 1');
            expect(content).toContain('message 2');
            expect(content).toContain('message 3');
        });

        it('should ensure logs are written before process exit', async () => {
            const logger = new Logger({
                logPath: testLogPath,
                format: 'text',
                minLevel: 'INFO',
            });

            logger.info('final message');
            
            // Simulate shutdown by flushing immediately
            await logger.flush();

            const content = await fs.readFile(testLogPath, 'utf-8');
            expect(content).toContain('final message');
        });
    });
});
