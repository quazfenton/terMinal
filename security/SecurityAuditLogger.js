/**
 * Security Audit Logger
 * Comprehensive security event logging and monitoring
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class SecurityAuditLogger {
  constructor() {
    this.logDir = path.join(__dirname, '..', 'logs', 'security');
    this.logFile = path.join(this.logDir, 'audit.log');
    this.maxLogSize = 10 * 1024 * 1024; // 10MB
    this.maxLogFiles = 5;
    this.initializeLogger();
  }

  async initializeLogger() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create security log directory:', error);
    }
  }

  async logSecurityEvent(event) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      eventId: crypto.randomUUID(),
      pid: process.pid,
      user: process.env.USER || 'unknown',
      ...event
    };

    const logLine = JSON.stringify(logEntry) + '\n';

    try {
      await this.writeToLog(logLine);
    } catch (error) {
      console.error('Failed to write security log:', error);
    }
  }

  async writeToLog(logLine) {
    // Check log rotation
    await this.rotateLogIfNeeded();
    
    await fs.appendFile(this.logFile, logLine);
  }

  async rotateLogIfNeeded() {
    try {
      const stats = await fs.stat(this.logFile);
      
      if (stats.size > this.maxLogSize) {
        await this.rotateLog();
      }
    } catch (error) {
      // Log file doesn't exist yet
    }
  }

  async rotateLog() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rotatedFile = path.join(this.logDir, `audit-${timestamp}.log`);
    
    try {
      await fs.rename(this.logFile, rotatedFile);
      await this.cleanupOldLogs();
    } catch (error) {
      console.error('Failed to rotate security log:', error);
    }
  }

  async cleanupOldLogs() {
    try {
      const files = await fs.readdir(this.logDir);
      const logFiles = files
        .filter(f => f.startsWith('audit-') && f.endsWith('.log'))
        .map(f => ({ name: f, path: path.join(this.logDir, f) }))
        .sort((a, b) => b.name.localeCompare(a.name));

      if (logFiles.length > this.maxLogFiles) {
        const filesToDelete = logFiles.slice(this.maxLogFiles);
        
        for (const file of filesToDelete) {
          await fs.unlink(file.path);
        }
      }
    } catch (error) {
      console.error('Failed to cleanup old logs:', error);
    }
  }

  // Specific event logging methods
  async logCommandExecution(command, result, validation) {
    await this.logSecurityEvent({
      type: 'COMMAND_EXECUTION',
      command: command.substring(0, 200), // Truncate for security
      success: result.success,
      riskLevel: validation.riskLevel,
      blocked: validation.blocked,
      errors: validation.errors,
      warnings: validation.warnings
    });
  }

  async logAuthenticationAttempt(type, success, details = {}) {
    await this.logSecurityEvent({
      type: 'AUTHENTICATION_ATTEMPT',
      authType: type,
      success,
      ...details
    });
  }

  async logApiKeyUsage(provider, success, error = null) {
    await this.logSecurityEvent({
      type: 'API_KEY_USAGE',
      provider,
      success,
      error: error ? error.substring(0, 100) : null
    });
  }

  async logSecurityViolation(violation, severity = 'medium') {
    await this.logSecurityEvent({
      type: 'SECURITY_VIOLATION',
      violation,
      severity,
      timestamp: new Date().toISOString()
    });
  }

  async logConfigurationChange(key, oldValue, newValue) {
    await this.logSecurityEvent({
      type: 'CONFIGURATION_CHANGE',
      configKey: key,
      oldValue: this.sanitizeValue(oldValue),
      newValue: this.sanitizeValue(newValue)
    });
  }

  sanitizeValue(value) {
    if (typeof value === 'string' && value.length > 50) {
      return value.substring(0, 50) + '...';
    }
    return value;
  }

  async getRecentEvents(limit = 100, type = null) {
    try {
      const content = await fs.readFile(this.logFile, 'utf8');
      const lines = content.trim().split('\n').slice(-limit);
      
      const events = lines
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(event => event && (!type || event.type === type));

      return events;
    } catch (error) {
      return [];
    }
  }
}

module.exports = SecurityAuditLogger;
