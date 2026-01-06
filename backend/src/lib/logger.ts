/**
 * Logger Configuration
 * Pino-based logging with pretty printing for development
 */

import pino from 'pino';
import { config } from '../config/index.js';

const transport = config.server.isDev
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    }
  : undefined;

export const logger = pino({
  level: config.logging.level,
  transport,
});

// Create child loggers for different modules
export const createLogger = (module: string) => logger.child({ module });

// Convenience exports
export const logInfo = (message: string, data?: object) => logger.info(data, message);
export const logError = (message: string, error?: Error | object) => logger.error(error, message);
export const logWarn = (message: string, data?: object) => logger.warn(data, message);
export const logDebug = (message: string, data?: object) => logger.debug(data, message);



