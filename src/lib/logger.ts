/**
 * Structured Logger for Production
 * Provides JSON-formatted logs with log levels and metadata
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLogLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
const isProduction = process.env.NODE_ENV === 'production';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLogLevel];
}

function formatLog(level: LogLevel, message: string, meta?: Record<string, unknown>): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };
}

function output(entry: LogEntry): void {
  if (isProduction) {
    // JSON format for production (easier to parse by log aggregators)
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(entry));
  } else {
    // Human-readable format for development
    const { timestamp, level, message, ...meta } = entry;
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    // eslint-disable-next-line no-console
    console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`);
  }
}

function outputError(entry: LogEntry): void {
  if (isProduction) {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify(entry));
  } else {
    const { timestamp, level, message, ...meta } = entry;
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    // eslint-disable-next-line no-console
    console.error(`[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`);
  }
}

const logger = {
  debug(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog('debug')) {
      output(formatLog('debug', message, meta));
    }
  },

  info(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog('info')) {
      output(formatLog('info', message, meta));
    }
  },

  warn(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog('warn')) {
      output(formatLog('warn', message, meta));
    }
  },

  error(message: string, error?: unknown, meta?: Record<string, unknown>): void {
    if (shouldLog('error')) {
      const errorMeta: Record<string, unknown> = { ...meta };

      if (error instanceof Error) {
        errorMeta.errorName = error.name;
        errorMeta.errorMessage = error.message;
        if (!isProduction) {
          errorMeta.stack = error.stack;
        }
      } else if (error !== undefined) {
        errorMeta.error = String(error);
      }

      outputError(formatLog('error', message, errorMeta));
    }
  },

  /**
   * Log with socket context
   */
  socket(level: LogLevel, message: string, socketId: string, meta?: Record<string, unknown>): void {
    this[level](message, { socketId, ...meta });
  },

  /**
   * Log with session context
   */
  session(
    level: LogLevel,
    message: string,
    sessionId: string,
    meta?: Record<string, unknown>
  ): void {
    this[level](message, { sessionId, ...meta });
  },
};

export default logger;
