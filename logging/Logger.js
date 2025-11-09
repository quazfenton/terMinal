/**
 * Production Logger
 * Structured logging with rotation and monitoring
 */

const fs = require('fs').promises;
const path = require('path');

class Logger {
  constructor(config = {}) {
    this.config = {
      level: config.level || 'info',
      logDir: config.logDir || path.join(__dirname, '..', 'logs'),
      maxFileSize: config.maxFileSize || 10 * 1024 * 1024,
      maxFiles: config.maxFiles || 5,
      ...config
    };
    
    this.levels = { error: 0, warn: 1, info: 2, debug: 3 };
    this.currentLevel = this.levels[this.config.level] || 2;
    this.logFile = path.join(this.config.logDir, 'app.log');
    
    this.initializeLogger();
  }

  async initializeLogger() {
    try {
      await fs.mkdir(this.config.logDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create log directory:', error);
    }
  }

  async log(level, message, meta = {}) {
    if (this.levels[level] > this.currentLevel) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message,
      pid: process.pid,
      ...meta
    };

    const logLine = JSON.stringify(logEntry) + '\n';
    
    // Console output for development
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[${logEntry.timestamp}] ${logEntry.level}: ${message}`);
    }

    try {
      await this.writeToFile(logLine);
    } catch (error) {
      console.error('Failed to write log:', error);
    }
  }

  async writeToFile(logLine) {
    await this.rotateIfNeeded();
    await fs.appendFile(this.logFile, logLine);
  }

  async rotateIfNeeded() {
    try {
      const stats = await fs.stat(this.logFile);
      if (stats.size > this.config.maxFileSize) {
        await this.rotateLog();
      }
    } catch (error) {
      // File doesn't exist yet
    }
  }

  async rotateLog() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rotatedFile = path.join(this.config.logDir, `app-${timestamp}.log`);
    
    try {
      await fs.rename(this.logFile, rotatedFile);
      await this.cleanupOldLogs();
    } catch (error) {
      console.error('Failed to rotate log:', error);
    }
  }

  async cleanupOldLogs() {
    try {
      const files = await fs.readdir(this.config.logDir);
      const logFiles = files
        .filter(f => f.startsWith('app-') && f.endsWith('.log'))
        .map(f => ({ name: f, path: path.join(this.config.logDir, f) }))
        .sort((a, b) => b.name.localeCompare(a.name));

      if (logFiles.length > this.config.maxFiles) {
        const filesToDelete = logFiles.slice(this.config.maxFiles);
        for (const file of filesToDelete) {
          await fs.unlink(file.path);
        }
      }
    } catch (error) {
      console.error('Failed to cleanup logs:', error);
    }
  }

  error(message, meta = {}) {
    return this.log('error', message, meta);
  }

  warn(message, meta = {}) {
    return this.log('warn', message, meta);
  }

  info(message, meta = {}) {
    return this.log('info', message, meta);
  }

  debug(message, meta = {}) {
    return this.log('debug', message, meta);
  }
}

module.exports = Logger;
