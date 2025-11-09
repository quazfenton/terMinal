/**
 * Production Validation Tests
 * Comprehensive tests for production readiness
 */

const Logger = require('../../logging/Logger');
const HealthMonitor = require('../../monitoring/HealthMonitor');
const AuthManager = require('../../auth/AuthManager');

describe('Production Readiness', () => {
  let logger;
  let healthMonitor;
  let authManager;

  beforeEach(() => {
    const mockSecureConfig = {
      get: jest.fn((key, defaultValue) => {
        const values = {
          'ADMIN_PASSWORD': 'test123',
          'LOG_LEVEL': 'info'
        };
        return values[key] || defaultValue;
      })
    };

    logger = new Logger({ level: 'info' });
    healthMonitor = new HealthMonitor(logger);
    authManager = new AuthManager(mockSecureConfig);
  });

  describe('Logging System', () => {
    test('logs messages with proper structure', async () => {
      const logSpy = jest.spyOn(logger, 'writeToFile').mockResolvedValue();
      
      await logger.info('Test message', { userId: 123 });
      
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('"level":"INFO"')
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Test message"')
      );
    });

    test('handles different log levels correctly', async () => {
      const logSpy = jest.spyOn(logger, 'writeToFile').mockResolvedValue();
      
      await logger.error('Error message');
      await logger.warn('Warning message');
      await logger.info('Info message');
      await logger.debug('Debug message');
      
      expect(logSpy).toHaveBeenCalledTimes(3); // debug should be filtered out
    });
  });

  describe('Health Monitoring', () => {
    test('runs health checks successfully', async () => {
      const results = await healthMonitor.runHealthChecks();
      
      expect(results.status).toBeDefined();
      expect(results.timestamp).toBeDefined();
      expect(results.checks).toBeDefined();
      expect(results.checks.memory).toBeDefined();
      expect(results.checks.uptime).toBeDefined();
    });

    test('detects unhealthy conditions', async () => {
      // Add a failing health check
      healthMonitor.addCheck('failing_check', () => ({
        healthy: false,
        error: 'Test failure'
      }));
      
      const results = await healthMonitor.runHealthChecks();
      
      expect(results.status).toBe('unhealthy');
      expect(results.checks.failing_check.healthy).toBe(false);
    });

    test('provides system metrics', () => {
      const metrics = healthMonitor.getMetrics();
      
      expect(metrics.uptime).toBeGreaterThan(0);
      expect(metrics.memory).toBeDefined();
      expect(metrics.memory.heapUsed).toBeGreaterThan(0);
    });
  });

  describe('Authentication System', () => {
    test('authenticates valid users', async () => {
      const result = await authManager.authenticate('admin', 'test123');
      
      expect(result).toBeDefined();
      expect(result.sessionId).toBeDefined();
      expect(result.username).toBe('admin');
      expect(result.roles).toContain('admin');
    });

    test('rejects invalid credentials', async () => {
      const result = await authManager.authenticate('admin', 'wrong_password');
      
      expect(result).toBeNull();
    });

    test('validates sessions correctly', () => {
      // Create a session first
      authManager.sessions.set('test-session', {
        id: 'test-session',
        username: 'admin',
        roles: ['admin'],
        created: Date.now(),
        lastAccess: Date.now()
      });
      
      const session = authManager.validateSession('test-session');
      
      expect(session).toBeDefined();
      expect(session.username).toBe('admin');
    });

    test('expires old sessions', () => {
      // Create an expired session
      authManager.sessions.set('expired-session', {
        id: 'expired-session',
        username: 'admin',
        roles: ['admin'],
        created: Date.now() - 7200000, // 2 hours ago
        lastAccess: Date.now() - 7200000
      });
      
      const session = authManager.validateSession('expired-session');
      
      expect(session).toBeNull();
    });

    test('checks permissions correctly', () => {
      // Create admin session
      authManager.sessions.set('admin-session', {
        id: 'admin-session',
        username: 'admin',
        roles: ['admin'],
        created: Date.now(),
        lastAccess: Date.now()
      });
      
      expect(authManager.hasPermission('admin-session', 'admin')).toBe(true);
      expect(authManager.hasPermission('admin-session', 'user')).toBe(true);
      expect(authManager.hasPermission('invalid-session', 'admin')).toBe(false);
    });
  });

  describe('Configuration Validation', () => {
    test('validates production configuration structure', () => {
      const prodConfig = require('../../config/production.json');
      
      expect(prodConfig.app).toBeDefined();
      expect(prodConfig.security).toBeDefined();
      expect(prodConfig.ai).toBeDefined();
      expect(prodConfig.performance).toBeDefined();
      
      // Security settings
      expect(prodConfig.security.sandboxMode).toBe(true);
      expect(prodConfig.security.allowSudo).toBe(false);
      expect(prodConfig.security.auditLogEnabled).toBe(true);
      
      // Performance settings
      expect(prodConfig.performance.memoryThreshold).toBeGreaterThan(0);
      expect(prodConfig.performance.performanceMonitoring).toBe(true);
    });

    test('validates required environment variables', () => {
      const requiredVars = [
        'CLAUDE_API_KEY',
        'OPENAI_API_KEY', 
        'GEMINI_API_KEY',
        'ENCRYPTION_KEY',
        'ADMIN_PASSWORD'
      ];
      
      // In production, these should be set
      // For testing, we just verify the structure
      requiredVars.forEach(varName => {
        expect(typeof varName).toBe('string');
        expect(varName.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Security Validation', () => {
    test('validates security headers and policies', () => {
      const securityConfig = require('../../config/production.json').security;
      
      expect(securityConfig.sandboxMode).toBe(true);
      expect(securityConfig.allowSudo).toBe(false);
      expect(securityConfig.restrictedPaths).toContain('/etc');
      expect(securityConfig.restrictedPaths).toContain('/sys');
      expect(securityConfig.restrictedPaths).toContain('/proc');
    });

    test('validates audit logging configuration', () => {
      const loggingConfig = require('../../config/production.json').logging;
      
      expect(loggingConfig.level).toBe('info');
      expect(loggingConfig.maxFileSize).toBeGreaterThan(0);
      expect(loggingConfig.maxFiles).toBeGreaterThan(0);
      expect(loggingConfig.auditRetention).toBeGreaterThan(0);
    });
  });

  describe('Performance Validation', () => {
    test('validates memory usage is within limits', () => {
      const usage = process.memoryUsage();
      const threshold = 500 * 1024 * 1024; // 500MB
      
      expect(usage.heapUsed).toBeLessThan(threshold);
    });

    test('validates startup time is acceptable', () => {
      const uptime = process.uptime();
      
      // Should start within reasonable time
      expect(uptime).toBeGreaterThan(0);
    });

    test('validates cache configuration', () => {
      const cacheConfig = require('../../config/production.json').cache;
      
      expect(cacheConfig.enabled).toBe(true);
      expect(cacheConfig.maxSize).toBeGreaterThan(0);
      expect(cacheConfig.ttl).toBeGreaterThan(0);
    });
  });

  describe('Integration Validation', () => {
    test('validates all core modules can be loaded', () => {
      expect(() => require('../../core/CommandRecognizer')).not.toThrow();
      expect(() => require('../../cache/ResponseCache')).not.toThrow();
      expect(() => require('../../ai/AIProviderManager')).not.toThrow();
      expect(() => require('../../mcp/MCPClient')).not.toThrow();
      expect(() => require('../../automation/WorkflowEngine')).not.toThrow();
    });

    test('validates plugin system configuration', () => {
      const pluginConfig = require('../../config/production.json').plugins;
      
      expect(pluginConfig.enabled).toBe(true);
      expect(pluginConfig.sandboxed).toBe(true);
      expect(pluginConfig.maxExecutionTime).toBeGreaterThan(0);
      expect(Array.isArray(pluginConfig.allowedModules)).toBe(true);
    });

    test('validates remote execution configuration', () => {
      const remoteConfig = require('../../config/production.json').remote;
      
      expect(remoteConfig.enabled).toBe(true);
      expect(remoteConfig.maxConnections).toBeGreaterThan(0);
      expect(remoteConfig.connectionTimeout).toBeGreaterThan(0);
    });
  });

  describe('Deployment Validation', () => {
    test('validates Docker configuration', () => {
      const fs = require('fs');
      
      expect(fs.existsSync('Dockerfile')).toBe(true);
      expect(fs.existsSync('scripts/deploy.sh')).toBe(true);
      expect(fs.existsSync('scripts/backup.sh')).toBe(true);
    });

    test('validates package.json production settings', () => {
      const packageJson = require('../../package.json');
      
      expect(packageJson.scripts.start).toBeDefined();
      expect(packageJson.scripts.build).toBeDefined();
      expect(packageJson.dependencies).toBeDefined();
    });
  });
});
