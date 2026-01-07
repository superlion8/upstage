/**
 * Logger Configuration
 * Wrapper around console for simple logging
 */

import { config } from '../config/index.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel = LOG_LEVELS[config.logging.level as LogLevel] || LOG_LEVELS.info;

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= currentLevel;
}

function formatMessage(module: string, message: string, data?: any): string {
  const timestamp = new Date().toISOString();
  let dataStr = '';

  if (data) {
    if (data instanceof Error) {
      dataStr = ` ${JSON.stringify({
        message: data.message,
        stack: data.stack,
        ...data
      })}`;
    } else if (typeof data === 'object') {
      // Handle nested Error objects
      const sanitizedData = JSON.parse(JSON.stringify(data, (key, value) => {
        if (value instanceof Error) {
          return {
            message: value.message,
            stack: value.stack,
            ...value
          };
        }
        return value;
      }));
      dataStr = ` ${JSON.stringify(sanitizedData)}`;
    } else {
      dataStr = ` ${String(data)}`;
    }
  }

  return `[${timestamp}] [${module}] ${message}${dataStr}`;
}

class Logger {
  private module: string;

  constructor(module: string = 'app') {
    this.module = module;
  }

  debug(message: string, data?: any) {
    if (shouldLog('debug')) {
      console.debug(formatMessage(this.module, message, data));
    }
  }

  info(message: string, data?: any) {
    if (shouldLog('info')) {
      console.info(formatMessage(this.module, message, data));
    }
  }

  warn(message: string, data?: any) {
    if (shouldLog('warn')) {
      console.warn(formatMessage(this.module, message, data));
    }
  }

  error(message: string, data?: any) {
    if (shouldLog('error')) {
      console.error(formatMessage(this.module, message, data));
    }
  }

  child({ module }: { module: string }): Logger {
    return new Logger(module);
  }
}

export const logger = new Logger();

// Create child loggers for different modules
export const createLogger = (module: string) => new Logger(module);

// Convenience exports
export const logInfo = (message: string, data?: object) => logger.info(message, data);
export const logError = (message: string, error?: Error | object) => logger.error(message, error);
export const logWarn = (message: string, data?: object) => logger.warn(message, data);
export const logDebug = (message: string, data?: object) => logger.debug(message, data);
