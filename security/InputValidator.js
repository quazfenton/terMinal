/**
 * Input Validator
 * 
 * Comprehensive input validation and sanitization for security hardening.
 * Prevents command injection, path traversal, and other security vulnerabilities.
 */

class InputValidator {
  constructor() {
    this.dangerousPatterns = [
      // Command injection patterns
      /[;&|`$(){}[\]]/,
      /\$\([^)]*\)/,
      /`[^`]*`/,
      /\|\s*sh\s*$/,
      /\|\s*bash\s*$/,
      /\|\s*zsh\s*$/,
      
      // Dangerous commands
      /^sudo\s+rm\s+-rf\s+\//,
      /^rm\s+-rf\s+\//,
      /^format\s/i,
      /^mkfs\s/,
      /^dd\s+if=.*of=\/dev/,
      />\s*\/dev\/sd/,
      /chmod\s+777\s+\//,
      /chown\s+.*root/,
      
      // Network and system access
      /curl\s+.*\|\s*sh/,
      /wget\s+.*\|\s*sh/,
      /nc\s+-l/,
      /netcat\s+-l/,
      
      // Code execution
      /eval\s*\(/,
      /exec\s*\(/,
      /system\s*\(/,
      /popen\s*\(/,
      
      // File system manipulation
      /\/etc\/passwd/,
      /\/etc\/shadow/,
      /\/proc\/self/,
      /\/dev\/null/,
      
      // Environment manipulation
      /export\s+PATH=/,
      /unset\s+PATH/,
      /alias\s+/
    ];
    
    this.pathTraversalPatterns = [
      /\.\.\//,
      /\.\.\\/, 
      /%2e%2e%2f/i,
      /%2e%2e%5c/i,
      /\.\.%2f/i,
      /\.\.%5c/i
    ];
    
    this.allowedCommands = new Set([
      'ls', 'dir', 'pwd', 'whoami', 'date', 'uptime', 'echo', 'cat', 'head', 'tail',
      'grep', 'find', 'wc', 'sort', 'uniq', 'cut', 'awk', 'sed',
      'git', 'npm', 'node', 'python', 'python3', 'pip', 'pip3',
      'cd', 'mkdir', 'touch', 'cp', 'mv', 'ln',
      'ps', 'top', 'htop', 'df', 'du', 'free', 'uname'
    ]);
    
    this.maxCommandLength = 1000;
    this.maxPathLength = 260;
  }

  /**
   * Validate and sanitize user input
   * @param {string} input - Raw user input
   * @param {Object} options - Validation options
   * @returns {Object} Validation result
   */
  validateInput(input, options = {}) {
    const result = {
      isValid: true,
      sanitized: input,
      warnings: [],
      errors: [],
      riskLevel: 'low',
      suggestions: []
    };

    if (!input || typeof input !== 'string') {
      result.isValid = false;
      result.errors.push('Input must be a non-empty string');
      return result;
    }

    // Basic sanitization
    result.sanitized = this.basicSanitize(input);

    // Length validation
    if (result.sanitized.length > this.maxCommandLength) {
      result.isValid = false;
      result.errors.push(`Command too long (max ${this.maxCommandLength} characters)`);
      return result;
    }

    // Check for dangerous patterns
    const dangerousCheck = this.checkDangerousPatterns(result.sanitized);
    if (!dangerousCheck.safe) {
      result.isValid = false;
      result.riskLevel = 'critical';
      result.errors.push(...dangerousCheck.errors);
      result.suggestions.push(...dangerousCheck.suggestions);
    }

    // Check for path traversal
    const pathCheck = this.checkPathTraversal(result.sanitized);
    if (!pathCheck.safe) {
      result.isValid = false;
      result.riskLevel = 'high';
      result.errors.push(...pathCheck.errors);
    }

    // Command validation
    const commandCheck = this.validateCommand(result.sanitized, options);
    if (!commandCheck.allowed) {
      if (options.strictMode) {
        result.isValid = false;
        result.errors.push(...commandCheck.errors);
      } else {
        result.warnings.push(...commandCheck.warnings);
        result.riskLevel = 'medium';
      }
    }

    // File path validation
    const pathValidation = this.validatePaths(result.sanitized, options);
    if (!pathValidation.safe) {
      result.warnings.push(...pathValidation.warnings);
      if (pathValidation.critical) {
        result.isValid = false;
        result.errors.push(...pathValidation.errors);
      }
    }

    return result;
  }

  /**
   * Basic input sanitization
   */
  basicSanitize(input) {
    return input
      .trim()
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\0/g, '') // Remove null bytes
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); // Remove control characters
  }

  /**
   * Check for dangerous command patterns
   */
  checkDangerousPatterns(input) {
    const result = {
      safe: true,
      errors: [],
      suggestions: []
    };

    for (const pattern of this.dangerousPatterns) {
      if (pattern.test(input)) {
        result.safe = false;
        result.errors.push(`Dangerous pattern detected: ${pattern.source}`);
        
        // Provide safer alternatives
        const alternatives = this.getSaferAlternatives(input, pattern);
        if (alternatives.length > 0) {
          result.suggestions.push(...alternatives);
        }
      }
    }

    return result;
  }

  /**
   * Check for path traversal attempts
   */
  checkPathTraversal(input) {
    const result = {
      safe: true,
      errors: []
    };

    for (const pattern of this.pathTraversalPatterns) {
      if (pattern.test(input)) {
        result.safe = false;
        result.errors.push('Path traversal attempt detected');
        break;
      }
    }

    return result;
  }

  /**
   * Validate command against allowed list
   */
  validateCommand(input, options = {}) {
    const result = {
      allowed: true,
      errors: [],
      warnings: []
    };

    // Extract base command
    const parts = input.split(/\s+/);
    const baseCommand = parts[0];

    if (!this.allowedCommands.has(baseCommand)) {
      result.allowed = false;
      
      if (options.strictMode) {
        result.errors.push(`Command not in allowed list: ${baseCommand}`);
      } else {
        result.warnings.push(`Unrecognized command: ${baseCommand}`);
      }

      // Suggest similar commands
      const suggestions = this.findSimilarCommands(baseCommand);
      if (suggestions.length > 0) {
        result.warnings.push(`Did you mean: ${suggestions.join(', ')}?`);
      }
    }

    return result;
  }

  /**
   * Validate file paths in command
   */
  validatePaths(input, options = {}) {
    const result = {
      safe: true,
      critical: false,
      warnings: [],
      errors: []
    };

    // Extract potential file paths
    const paths = this.extractPaths(input);
    
    for (const path of paths) {
      if (path.length > this.maxPathLength) {
        result.safe = false;
        result.warnings.push(`Path too long: ${path.substring(0, 50)}...`);
      }

      // Check for system paths
      if (this.isSystemPath(path)) {
        result.safe = false;
        result.critical = true;
        result.errors.push(`Access to system path not allowed: ${path}`);
      }

      // Check for hidden files/directories
      if (this.isHiddenPath(path) && !options.allowHidden) {
        result.warnings.push(`Access to hidden path: ${path}`);
      }
    }

    return result;
  }

  /**
   * Extract file paths from command
   */
  extractPaths(input) {
    const pathRegex = /(?:^|\s)((?:\/|\.\/|~\/|[a-zA-Z]:\\)[^\s]*)/g;
    const paths = [];
    let match;

    while ((match = pathRegex.exec(input)) !== null) {
      paths.push(match[1]);
    }

    return paths;
  }

  /**
   * Check if path is a system path
   */
  isSystemPath(path) {
    const systemPaths = [
      '/etc/', '/bin/', '/sbin/', '/usr/bin/', '/usr/sbin/',
      '/boot/', '/dev/', '/proc/', '/sys/', '/root/',
      'C:\\Windows\\', 'C:\\Program Files\\', 'C:\\System32\\'
    ];

    return systemPaths.some(sysPath => path.startsWith(sysPath));
  }

  /**
   * Check if path is hidden
   */
  isHiddenPath(path) {
    return path.includes('/.') || path.includes('\\.') || path.startsWith('.');
  }

  /**
   * Get safer alternatives for dangerous patterns
   */
  getSaferAlternatives(input, pattern) {
    const alternatives = [];

    if (pattern.source.includes('rm.*-rf')) {
      alternatives.push('Use "mv file ~/.trash/" to move to trash instead');
      alternatives.push('Use "rm -i" for interactive deletion');
    }

    if (pattern.source.includes('chmod.*777')) {
      alternatives.push('Use "chmod 644" for files or "chmod 755" for directories');
    }

    if (pattern.source.includes('curl.*sh') || pattern.source.includes('wget.*sh')) {
      alternatives.push('Download the script first and review it before execution');
      alternatives.push('Use package managers like npm, pip, or apt instead');
    }

    return alternatives;
  }

  /**
   * Find similar commands using Levenshtein distance
   */
  findSimilarCommands(command) {
    const suggestions = [];
    const maxDistance = 2;

    for (const allowedCmd of this.allowedCommands) {
      const distance = this.levenshteinDistance(command, allowedCmd);
      if (distance <= maxDistance) {
        suggestions.push(allowedCmd);
      }
    }

    return suggestions.slice(0, 3); // Return top 3 suggestions
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Sanitize file path
   */
  sanitizePath(path) {
    if (!path || typeof path !== 'string') {
      return '';
    }

    return path
      .replace(/\.\.\//g, '') // Remove path traversal
      .replace(/\.\.\\/g, '')
      .replace(/[<>:"|?*]/g, '') // Remove invalid filename characters
      .replace(/\0/g, '') // Remove null bytes
      .trim();
  }

  /**
   * Validate file name
   */
  validateFileName(fileName) {
    const result = {
      isValid: true,
      errors: []
    };

    if (!fileName || typeof fileName !== 'string') {
      result.isValid = false;
      result.errors.push('File name must be a non-empty string');
      return result;
    }

    // Check length
    if (fileName.length > 255) {
      result.isValid = false;
      result.errors.push('File name too long (max 255 characters)');
    }

    // Check for invalid characters
    const invalidChars = /[<>:"|?*\0]/;
    if (invalidChars.test(fileName)) {
      result.isValid = false;
      result.errors.push('File name contains invalid characters');
    }

    // Check for reserved names (Windows)
    const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
    if (reservedNames.test(fileName)) {
      result.isValid = false;
      result.errors.push('File name is reserved');
    }

    return result;
  }

  /**
   * Escape shell arguments
   */
  escapeShellArg(arg) {
    if (!arg || typeof arg !== 'string') {
      return '';
    }

    // If argument contains special characters, wrap in single quotes
    if (/[^a-zA-Z0-9._/-]/.test(arg)) {
      return "'" + arg.replace(/'/g, "'\"'\"'") + "'";
    }

    return arg;
  }

  /**
   * Validate URL
   */
  validateUrl(url) {
    const result = {
      isValid: true,
      errors: []
    };

    try {
      const urlObj = new URL(url);
      
      // Only allow HTTP and HTTPS
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        result.isValid = false;
        result.errors.push('Only HTTP and HTTPS URLs are allowed');
      }

      // Block localhost and private IPs
      const hostname = urlObj.hostname;
      if (this.isPrivateIP(hostname) || hostname === 'localhost') {
        result.isValid = false;
        result.errors.push('Access to private networks not allowed');
      }

    } catch (error) {
      result.isValid = false;
      result.errors.push('Invalid URL format');
    }

    return result;
  }

  /**
   * Check if hostname is a private IP
   */
  isPrivateIP(hostname) {
    const privateRanges = [
      /^127\./, // Loopback
      /^10\./, // Private Class A
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private Class B
      /^192\.168\./, // Private Class C
      /^169\.254\./, // Link-local
      /^::1$/, // IPv6 loopback
      /^fc00:/, // IPv6 private
      /^fe80:/ // IPv6 link-local
    ];

    return privateRanges.some(range => range.test(hostname));
  }

  /**
   * Get validation statistics
   */
  getStats() {
    return {
      dangerousPatterns: this.dangerousPatterns.length,
      pathTraversalPatterns: this.pathTraversalPatterns.length,
      allowedCommands: this.allowedCommands.size,
      maxCommandLength: this.maxCommandLength,
      maxPathLength: this.maxPathLength
    };
  }
}

// Export for both CommonJS and ES6 modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = InputValidator;
} else if (typeof window !== 'undefined') {
  window.InputValidator = InputValidator;
}