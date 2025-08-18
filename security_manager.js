class SecurityManager {
  constructor() {
    this.dangerousCommands = new Set([
      'rm', 'rmdir', 'del', 'format', 'fdisk', 'mkfs', 'dd',
      'chmod', 'chown', 'sudo', 'su', 'passwd', 'useradd', 'userdel'
    ]);
    
    this.dangerousPatterns = [
      /rm\s+-rf\s+[\/~]/, // Recursive delete from root or home
      />\s*\/dev\/sd/, // Writing to disk devices
      /chmod\s+777/, // Overly permissive permissions
      /curl\s+.*\|\s*sh/, // Pipe to shell (dangerous downloads)
      /wget\s+.*\|\s*sh/,
      /eval\s*\(/, // Code evaluation
      /exec\s*\(/,
      /system\s*\(/
    ];
    
    this.allowedDirectories = new Set([
      process.cwd(),
      require('os').homedir(),
      '/tmp'
    ]);
  }

  validateCommand(command, context = {}) {
    const validation = {
      isAllowed: true,
      riskLevel: 'low',
      warnings: [],
      suggestions: []
    };

    // Check for dangerous patterns
    for (const pattern of this.dangerousPatterns) {
      if (pattern.test(command)) {
        validation.isAllowed = false;
        validation.riskLevel = 'critical';
        validation.warnings.push(`Dangerous pattern detected: ${pattern.source}`);
      }
    }

    // Check command components
    const parts = command.split(/\s+/);
    const baseCommand = parts[0];

    if (this.dangerousCommands.has(baseCommand)) {
      validation.riskLevel = 'high';
      validation.warnings.push(`Potentially dangerous command: ${baseCommand}`);
      
      // Provide safer alternatives
      const alternatives = this.getSaferAlternatives(baseCommand, command);
      if (alternatives.length > 0) {
        validation.suggestions = alternatives;
      }
    }

    // Check file paths
    const paths = this.extractPaths(command);
    for (const path of paths) {
      if (!this.isPathAllowed(path)) {
        validation.isAllowed = false;
        validation.riskLevel = 'critical';
        validation.warnings.push(`Access to path not allowed: ${path}`);
      }
    }

    return validation;
  }

  getSaferAlternatives(command, fullCommand) {
    const alternatives = {
      'rm': [
        'mv [file] ~/.trash/ # Move to trash instead',
        'rm -i [file] # Interactive deletion',
        'find . -name "[pattern]" -delete # Targeted deletion'
      ],
      'chmod': [
        'chmod 644 [file] # Read/write for owner, read for others',
        'chmod 755 [file] # Executable for owner, read/execute for others'
      ],
      'sudo': [
        'Check if command can be run without sudo',
        'Use specific sudo permissions instead of full access'
      ]
    };

    return alternatives[command] || [];
  }

  extractPaths(command) {
    // Extract file paths from command
    const pathRegex = /(?:^|\s)((?:\/|\.\/|~\/)[^\s]*)/g;
    const paths = [];
    let match;
    
    while ((match = pathRegex.exec(command)) !== null) {
      paths.push(match[1]);
    }
    
    return paths;
  }

  isPathAllowed(path) {
    const resolvedPath = require('path').resolve(path);
    return Array.from(this.allowedDirectories).some(allowed => 
      resolvedPath.startsWith(allowed));
  }
}