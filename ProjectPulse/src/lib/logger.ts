/**
 * Structured logging module for ProjectPulse daemon.
 * 
 * Features:
 * - Log levels: DEBUG, INFO, WARN, ERROR
 * - JSON and text output formats
 * - Delegation ID context tracking
 * - Automatic log rotation
 * - Timestamps on all entries
 */

import { promises as fs } from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    delegationId?: string;
    context?: Record<string, unknown>;
    error?: {
        message: string;
        stack?: string;
    };
}

export interface LoggerOptions {
    /** Log file path */
    logPath: string;
    /** Minimum log level to write (default: INFO) */
    minLevel?: LogLevel;
    /** Output format: 'json' or 'text' (default: text) */
    format?: 'json' | 'text';
    /** Maximum log file size in bytes before rotation (default: 10MB) */
    maxSize?: number;
    /** Maximum number of rotated log files to keep (default: 5) */
    maxFiles?: number;
}

// ============================================================================
// Logger Class
// ============================================================================

const LOG_LEVELS: Record<LogLevel, number> = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
};

export class Logger {
    private options: Required<LoggerOptions>;
    private writeQueue: Promise<void> = Promise.resolve();
    
    constructor(options: LoggerOptions) {
        this.options = {
            logPath: options.logPath,
            minLevel: options.minLevel ?? 'INFO',
            format: options.format ?? 'text',
            maxSize: options.maxSize ?? 10 * 1024 * 1024, // 10MB
            maxFiles: options.maxFiles ?? 5,
        };
    }
    
    /**
     * Log a debug message.
     */
    debug(message: string, delegationId?: string, context?: Record<string, unknown>): void {
        void this.log('DEBUG', message, delegationId, context);
    }
    
    /**
     * Log an info message.
     */
    info(message: string, delegationId?: string, context?: Record<string, unknown>): void {
        void this.log('INFO', message, delegationId, context);
    }
    
    /**
     * Log a warning message.
     */
    warn(message: string, delegationId?: string, context?: Record<string, unknown>): void {
        void this.log('WARN', message, delegationId, context);
    }
    
    /**
     * Log an error message.
     */
    error(message: string, delegationId?: string, error?: Error, context?: Record<string, unknown>): void {
        const errorInfo = error ? {
            message: error.message,
            stack: error.stack,
        } : undefined;
        
        void this.log('ERROR', message, delegationId, context, errorInfo);
    }
    
    /**
     * Internal log method.
     */
    private async log(
        level: LogLevel,
        message: string,
        delegationId?: string,
        context?: Record<string, unknown>,
        error?: { message: string; stack?: string }
    ): Promise<void> {
        // Check log level threshold
        if (LOG_LEVELS[level] < LOG_LEVELS[this.options.minLevel]) {
            return;
        }
        
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            delegationId,
            context,
            error,
        };
        
        // Queue writes to prevent concurrent file access
        this.writeQueue = this.writeQueue
            .then(async () => this.writeEntry(entry))
            .catch((err) => {
                // Fallback to console if file writing fails
                console.error('Logger write failed:', err.message);
                console.log(this.formatEntry(entry));
            });
    }
    
    /**
     * Write a log entry to the file.
     */
    private async writeEntry(entry: LogEntry): Promise<void> {
        // Check if rotation is needed
        await this.rotateIfNeeded();
        
        // Format and write entry
        const line = this.formatEntry(entry) + '\n';
        
        try {
            const logDir = path.dirname(this.options.logPath);
            await fs.mkdir(logDir, { recursive: true });
            await fs.appendFile(this.options.logPath, line);
        } catch (error) {
            // Fallback to console
            console.error('Failed to write log:', error);
            console.log(line.trim());
        }
    }
    
    /**
     * Format a log entry based on configured format.
     */
    private formatEntry(entry: LogEntry): string {
        if (this.options.format === 'json') {
            return JSON.stringify(entry);
        }
        
        // Text format: [timestamp] [LEVEL] [delegationId] message
        let formatted = `[${entry.timestamp}] [${entry.level}]`;
        
        if (entry.delegationId) {
            formatted += ` [${entry.delegationId}]`;
        }
        
        formatted += ` ${entry.message}`;
        
        if (entry.context && Object.keys(entry.context).length > 0) {
            formatted += ` | ${JSON.stringify(entry.context)}`;
        }
        
        if (entry.error) {
            formatted += ` | Error: ${entry.error.message}`;
            if (entry.error.stack) {
                formatted += `\n${entry.error.stack}`;
            }
        }
        
        return formatted;
    }
    
    /**
     * Rotate log file if it exceeds max size.
     */
    private async rotateIfNeeded(): Promise<void> {
        try {
            const stats = await fs.stat(this.options.logPath);
            
            if (stats.size >= this.options.maxSize) {
                await this.rotateLogs();
            }
        } catch (error) {
            // File doesn't exist yet, no rotation needed
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error;
            }
        }
    }
    
    /**
     * Rotate log files (daemon.log -> daemon.log.1 -> daemon.log.2 -> etc).
     */
    private async rotateLogs(): Promise<void> {
        const logDir = path.dirname(this.options.logPath);
        const logName = path.basename(this.options.logPath);
        
        // Delete oldest log file if it exists
        const oldestLog = path.join(logDir, `${logName}.${this.options.maxFiles}`);
        try {
            await fs.unlink(oldestLog);
        } catch {
            // File might not exist, ignore
        }
        
        // Rotate existing log files
        for (let i = this.options.maxFiles - 1; i >= 1; i--) {
            const oldPath = path.join(logDir, `${logName}.${i}`);
            const newPath = path.join(logDir, `${logName}.${i + 1}`);
            
            try {
                await fs.rename(oldPath, newPath);
            } catch {
                // File might not exist, continue
            }
        }
        
        // Rename current log to .1
        const currentLog = this.options.logPath;
        const rotatedLog = path.join(logDir, `${logName}.1`);
        
        try {
            await fs.rename(currentLog, rotatedLog);
        } catch {
            // File might not exist, ignore
        }
    }
    
    /**
     * Set the minimum log level.
     */
    setMinLevel(level: LogLevel): void {
        this.options.minLevel = level;
    }
    
    /**
     * Get current log file path.
     */
    getLogPath(): string {
        return this.options.logPath;
    }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultLogger: Logger | null = null;

/**
 * Initialize the default logger instance.
 */
export function initLogger(options: LoggerOptions): Logger {
    defaultLogger = new Logger(options);
    return defaultLogger;
}

/**
 * Get the default logger instance.
 * Throws if logger not initialized.
 */
export function getLogger(): Logger {
    if (!defaultLogger) {
        throw new Error('Logger not initialized. Call initLogger() first.');
    }
    return defaultLogger;
}
