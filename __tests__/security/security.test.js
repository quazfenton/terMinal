/**
 * Security Implementation Tests
 * Tests for all security fixes and validations
 */

const InputValidator = require('../../security/InputValidator');
const SecureConfig = require('../../security/SecureConfig');
const SecurityAuditLogger = require('../../security/SecurityAuditLogger');

describe('Security Implementations', () => {
  let inputValidator;
  let secureConfig;
  let auditLogger;

  beforeEach(() => {
    inputValidator = new InputValidator();
    secureConfig = new SecureConfig();
    auditLogger = new SecurityAuditLogger();
  });

  describe('InputValidator', () => {
    test('blocks command injection attempts', () => {
      const maliciousCommands = [
        'ls; rm -rf /',
        'cat file | sh',
        'echo `whoami`',
        'ls && rm file',
        'ls || echo hack'
      ];

      maliciousCommands.forEach(cmd => {
        const result = inputValidator.validateInput(cmd);
        expect(result.isValid).toBe(false);
        expect(result.riskLevel).toMatch(/high|critical/);
      });
    });

    test('allows safe commands', () => {
      const safeCommands = [
        'ls -la',
        'pwd',
        'cat README.md',
        'git status',
        'npm install'
      ];

      safeCommands.forEach(cmd => {
        const result = inputValidator.validateInput(cmd);
        expect(result.isValid).toBe(true);
        expect(result.riskLevel).toBe('low');
      });
    });

    test('blocks dangerous system commands', () => {
      const dangerousCommands = [
        'sudo rm -rf /',
        'format C:',
        'dd if=/dev/zero of=/dev/sda',
        'shutdown now'
      ];

      dangerousCommands.forEach(cmd => {
        const result = inputValidator.validateInput(cmd);
        expect(result.blocked).toBe(true);
        expect(result.riskLevel).toBe('critical');
      });
    });

    test('creates sandboxed commands', () => {
      const command = 'ls -la';
      const sandboxed = inputValidator.createSandboxedCommand(command);
      expect(sandboxed).toContain('timeout');
      expect(sandboxed).toContain('nice');
    });
  });

  describe('SecureConfig', () => {
    test('validates API keys correctly', () => {
      expect(secureConfig.validateApiKey('sk-1234567890abcdef')).toBe(true);
      expect(secureConfig.validateApiKey('your_api_key_here')).toBe(false);
      expect(secureConfig.validateApiKey('')).toBe(false);
      expect(secureConfig.validateApiKey(null)).toBe(false);
    });

    test('encrypts and decrypts sensitive data', () => {
      const testData = 'sensitive-api-key-12345';
      const encrypted = secureConfig.encrypt(testData);
      const decrypted = secureConfig.decrypt(encrypted);
      
      expect(encrypted).not.toBe(testData);
      expect(decrypted).toBe(testData);
    });

    test('provides security configuration', () => {
      const config = secureConfig.getSecurityConfig();
      
      expect(config).toHaveProperty('sandboxMode');
      expect(config).toHaveProperty('allowSudo');
      expect(config).toHaveProperty('maxCommandLength');
      expect(config).toHaveProperty('restrictedPaths');
    });
  });

  describe('SecurityAuditLogger', () => {
    test('logs security events', async () => {
      const event = {
        type: 'TEST_EVENT',
        message: 'Test security event'
      };

      await auditLogger.logSecurityEvent(event);
      
      const recentEvents = await auditLogger.getRecentEvents(10);
      const testEvent = recentEvents.find(e => e.type === 'TEST_EVENT');
      
      expect(testEvent).toBeDefined();
      expect(testEvent.message).toBe('Test security event');
    });

    test('logs command execution events', async () => {
      const command = 'ls -la';
      const result = { success: true };
      const validation = { riskLevel: 'low', blocked: false, errors: [], warnings: [] };

      await auditLogger.logCommandExecution(command, result, validation);
      
      const events = await auditLogger.getRecentEvents(10, 'COMMAND_EXECUTION');
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('Integration Tests', () => {
    test('complete security validation flow', async () => {
      const testCommand = 'ls -la';
      
      // Validate input
      const validation = inputValidator.validateInput(testCommand);
      expect(validation.isValid).toBe(true);
      
      // Log the validation
      await auditLogger.logCommandExecution(testCommand, { success: true }, validation);
      
      // Verify logging
      const events = await auditLogger.getRecentEvents(5, 'COMMAND_EXECUTION');
      expect(events.length).toBeGreaterThan(0);
    });

    test('blocked command flow', async () => {
      const maliciousCommand = 'rm -rf /';
      
      // Validate input
      const validation = inputValidator.validateInput(maliciousCommand);
      expect(validation.isValid).toBe(false);
      expect(validation.blocked).toBe(true);
      
      // Log the security violation
      await auditLogger.logSecurityViolation('Dangerous command blocked', 'critical');
      
      // Verify logging
      const events = await auditLogger.getRecentEvents(5, 'SECURITY_VIOLATION');
      expect(events.length).toBeGreaterThan(0);
    });
  });
});
