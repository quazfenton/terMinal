/**
 * Secure Sudo Handler
 * Handles sudo authentication through system dialogs, never plaintext passwords
 */

const { spawn } = require('child_process');
const SecureConfig = require('./SecureConfig');

class SecureSudoHandler {
  constructor() {
    this.secureConfig = new SecureConfig();
    this.securityConfig = this.secureConfig.getSecurityConfig();
    this.activeSessions = new Map();
    this.sessionTimeout = 300000; // 5 minutes
  }

  async requestSudoAccess(command, options = {}) {
    if (!this.securityConfig.allowSudo) {
      return {
        success: false,
        error: 'Sudo access is disabled by security policy',
        code: 'SUDO_DISABLED'
      };
    }

    // Use system authentication dialog
    try {
      const result = await this.systemSudoPrompt(command);
      
      if (result.success) {
        this.createSecureSession(result.sessionId);
      }
      
      return result;
    } catch (error) {
      return {
        success: false,
        error: 'System authentication failed',
        details: error.message
      };
    }
  }

  async systemSudoPrompt(command) {
    return new Promise((resolve) => {
      // Use pkexec or similar system authentication
      const authCommand = process.platform === 'darwin' 
        ? ['osascript', '-e', `do shell script "${command}" with administrator privileges`]
        : ['pkexec', 'sh', '-c', command];

      const child = spawn(authCommand[0], authCommand.slice(1), {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        resolve({
          success: code === 0,
          output: stdout,
          stderr: stderr,
          sessionId: code === 0 ? this.generateSessionId() : null
        });
      });

      child.on('error', (error) => {
        resolve({
          success: false,
          error: error.message
        });
      });
    });
  }

  createSecureSession(sessionId) {
    this.activeSessions.set(sessionId, {
      created: Date.now(),
      lastUsed: Date.now()
    });

    // Auto-expire session
    setTimeout(() => {
      this.activeSessions.delete(sessionId);
    }, this.sessionTimeout);
  }

  generateSessionId() {
    return require('crypto').randomBytes(16).toString('hex');
  }

  isValidSession(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return false;

    const now = Date.now();
    if (now - session.lastUsed > this.sessionTimeout) {
      this.activeSessions.delete(sessionId);
      return false;
    }

    session.lastUsed = now;
    return true;
  }

  revokeAllSessions() {
    this.activeSessions.clear();
  }
}

module.exports = SecureSudoHandler;
