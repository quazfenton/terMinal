/**
 * Authentication Manager
 * Simple session-based authentication for production
 */

const crypto = require('crypto');

class AuthManager {
  constructor(secureConfig) {
    this.secureConfig = secureConfig;
    this.sessions = new Map();
    this.users = new Map();
    this.sessionTimeout = 3600000; // 1 hour
    
    this.setupDefaultUser();
  }

  setupDefaultUser() {
    // Default admin user - should be changed in production
    const defaultPassword = this.secureConfig.get('ADMIN_PASSWORD', 'admin123');
    this.addUser('admin', defaultPassword, ['admin']);
  }

  addUser(username, password, roles = ['user']) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    
    this.users.set(username, {
      username,
      passwordHash: hash,
      salt,
      roles,
      created: Date.now()
    });
  }

  async authenticate(username, password) {
    const user = this.users.get(username);
    if (!user) return null;

    const hash = crypto.pbkdf2Sync(password, user.salt, 10000, 64, 'sha512').toString('hex');
    
    if (hash === user.passwordHash) {
      const sessionId = crypto.randomUUID();
      const session = {
        id: sessionId,
        username,
        roles: user.roles,
        created: Date.now(),
        lastAccess: Date.now()
      };
      
      this.sessions.set(sessionId, session);
      
      // Cleanup expired sessions
      this.cleanupSessions();
      
      return {
        sessionId,
        username,
        roles: user.roles
      };
    }
    
    return null;
  }

  validateSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const now = Date.now();
    if (now - session.lastAccess > this.sessionTimeout) {
      this.sessions.delete(sessionId);
      return null;
    }

    session.lastAccess = now;
    return {
      username: session.username,
      roles: session.roles
    };
  }

  hasPermission(sessionId, requiredRole) {
    const session = this.validateSession(sessionId);
    if (!session) return false;

    return session.roles.includes(requiredRole) || session.roles.includes('admin');
  }

  logout(sessionId) {
    return this.sessions.delete(sessionId);
  }

  cleanupSessions() {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastAccess > this.sessionTimeout) {
        this.sessions.delete(id);
      }
    }
  }

  getActiveSessions() {
    return Array.from(this.sessions.values()).map(s => ({
      id: s.id,
      username: s.username,
      created: s.created,
      lastAccess: s.lastAccess
    }));
  }
}

module.exports = AuthManager;
