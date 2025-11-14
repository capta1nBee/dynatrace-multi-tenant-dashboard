/**
 * Logger utility with timestamp and configurable log level from .env
 * LOG_LEVEL environment variable options: DEBUG, INFO, ERROR, WARN
 * - DEBUG: Shows all logs (default for development)
 * - INFO: Shows only info, error, and warn logs (for production)
 * - ERROR: Shows only error and warn logs
 * - WARN: Shows only warn logs
 */

require('dotenv').config();

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  ERROR: 2,
  WARN: 3,
};

// Get log level from .env, default to DEBUG if not specified or in production
const getLogLevel = () => {
  const envLogLevel = process.env.LOG_LEVEL?.toUpperCase() || 'DEBUG';
  const logLevel = LOG_LEVELS[envLogLevel] !== undefined ? LOG_LEVELS[envLogLevel] : LOG_LEVELS.DEBUG;
  return logLevel;
};

const currentLogLevel = getLogLevel();

const getTimestamp = () => {
  const now = new Date();
  return now.toISOString().replace('T', ' ').substring(0, 19);
};

const logger = {
  info: (tag, message) => {
    // INFO level shows info, error, and warn logs
    if (currentLogLevel <= LOG_LEVELS.INFO) {
      console.log(`[${getTimestamp()}] [${tag}] ${message}`);
    }
  },

  debug: (tag, message) => {
    // DEBUG level shows all logs
    if (currentLogLevel <= LOG_LEVELS.DEBUG) {
      console.log(`[${getTimestamp()}] [${tag}] [DEBUG] ${message}`);
    }
  },

  error: (tag, message, error = null) => {
    // ERROR level shows error and warn logs
    if (currentLogLevel <= LOG_LEVELS.ERROR) {
      console.error(`[${getTimestamp()}] [${tag}] ERROR: ${message}`);
      if (error) {
        console.error(`[${getTimestamp()}] [${tag}] Stack:`, error.stack || error.message);
      }
    }
  },

  warn: (tag, message) => {
    // WARN level shows only warn logs
    if (currentLogLevel <= LOG_LEVELS.WARN) {
      console.warn(`[${getTimestamp()}] [${tag}] WARN: ${message}`);
    }
  }
};

module.exports = logger;
