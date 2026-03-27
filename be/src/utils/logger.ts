// ===================================================================
// Simple Logger Utility
// ===================================================================
// Provides colour-coded console logging with timestamps.
// Replace with a proper logger (e.g. pino, winston) in production.
// ===================================================================

/**
 * Log levels supported by the logger.
 */
type LogLevel = 'info' | 'warn' | 'error' | 'debug';

/**
 * ANSI colour codes for terminal output.
 */
const colours: Record<LogLevel, string> = {
  info: '\x1b[36m',  // cyan
  warn: '\x1b[33m',  // yellow
  error: '\x1b[31m', // red
  debug: '\x1b[35m', // magenta
};

const reset = '\x1b[0m';

/**
 * Format and print a log message to the console.
 */
function log(level: LogLevel, message: string, ...args: unknown[]): void {
  const timestamp = new Date().toISOString();
  const colour = colours[level];
  const prefix = `${colour}[${level.toUpperCase()}]${reset} ${timestamp} —`;

  // eslint-disable-next-line no-console
  console[level === 'debug' ? 'log' : level](prefix, message, ...args);
}

export const logger = {
  info: (msg: string, ...args: unknown[]) => log('info', msg, ...args),
  warn: (msg: string, ...args: unknown[]) => log('warn', msg, ...args),
  error: (msg: string, ...args: unknown[]) => log('error', msg, ...args),
  debug: (msg: string, ...args: unknown[]) => log('debug', msg, ...args),
};

export default logger;
