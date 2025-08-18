const { spawn, exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class EnhancedCommandExecutor {
  constructor() {
    this.executionHistory = [];
    this.activeProcesses = new Map();
    this.sandboxMode = true;
    this.allowedDirectories = [process.cwd()];
    this.maxExecutionTime = 30000; // 30 seconds
  }

  async executeSequence(commands, options = {}) {
    const results = [];
    const { 
      stopOnError = true, 
      timeout = this.maxExecutionTime,
      requiresConfirmation = false,
      fileContent = null,
      executionMode = 'sequential'
    } = options;

    if (requiresConfirmation && !options.confirmed) {
      return { 
        success: false, 
        error: 'Command requires confirmation',
        requiresConfirmation: true,
        commands 
      };
    }

    try {
      if (executionMode === 'parallel') {
        return await this.executeParallel(commands, options);
      }

      for (let i = 0; i < commands.length; i++) {
        const command = commands[i];
        const result = await this.executeCommand(command, { 
          timeout, 
          fileContent: i === commands.length - 1 ? fileContent : null 
        });
        
        results.push(result);
        
        if (!result.success && stopOnError) {
          break;
        }
      }

      return { success: true, results };
    } catch (error) {
      return { success: false, error: error.message, results };
    }
  }

  async executeCommand(command, options = {}) {
    const startTime = Date.now();
    const { timeout = this.maxExecutionTime, fileContent = null } = options;

    try {
      // Security validation
      if (!this.validateCommand(command)) {
        throw new Error(`Command not allowed: ${command}`);
      }

      // Handle file content injection
      if (fileContent && this.isFileCreationCommand(command)) {
        return await this.handleFileCreation(command, fileContent);
      }

      // Handle special commands
      if (command.startsWith('cd ')) {
        return await this.handleDirectoryChange(command);
      }

      // Execute command with timeout
      const result = await this.executeWithTimeout(command, timeout);
      
      // Log execution
      this.logExecution(command, result, Date.now() - startTime);
      
      return result;
    } catch (error) {
      const errorResult = { 
        success: false, 
        error: error.message, 
        command,
        executionTime: Date.now() - startTime 
      };
      this.logExecution(command, errorResult, Date.now() - startTime);
      return errorResult;
    }
  }

  validateCommand(command) {
    // Blacklist dangerous commands
    const blacklist = [
      /rm\s+-rf\s+\//, /sudo\s+rm\s+-rf/, /format/, /mkfs/,
      /dd\s+if=.*of=\/dev/, />\s*\/dev\/sd/, /chmod\s+777\s+\//
    ];

    return !blacklist.some(pattern => pattern.test(command));
  }

  async executeWithTimeout(command, timeout) {
    return new Promise((resolve, reject) => {
      const process = exec(command, { 
        cwd: this.currentDirectory || process.cwd(),
        maxBuffer: 1024 * 1024 // 1MB buffer
      });

      const timeoutId = setTimeout(() => {
        process.kill('SIGTERM');
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        clearTimeout(timeoutId);
        resolve({
          success: code === 0,
          output: stdout,
          error: stderr,
          exitCode: code,
          command
        });
      });

      process.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  async handleFileCreation(command, content) {
    const match = command.match(/(?:nano|vim|code|touch)\s+(.+)/);
    if (!match) return { success: false, error: 'Invalid file creation command' };

    const filename = match[1].trim();
    const fullPath = path.resolve(this.currentDirectory || process.cwd(), filename);

    try {
      await fs.writeFile(fullPath, content, 'utf8');
      return {
        success: true,
        output: `File created: ${filename}`,
        command,
        filePath: fullPath
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create file: ${error.message}`,
        command
      };
    }
  }

  isFileCreationCommand(command) {
    return /^(nano|vim|code|touch)\s+/.test(command);
  }

  async handleDirectoryChange(command) {
    const match = command.match(/cd\s+(.+)/);
    if (!match) return { success: false, error: 'Invalid cd command' };

    const targetDir = match[1].trim();
    const fullPath = path.resolve(this.currentDirectory || process.cwd(), targetDir);

    try {
      await fs.access(fullPath);
      this.currentDirectory = fullPath;
      process.chdir(fullPath);
      return {
        success: true,
        output: `Changed directory to: ${fullPath}`,
        command,
        currentDirectory: fullPath
      };
    } catch (error) {
      return {
        success: false,
        error: `Directory not found: ${targetDir}`,
        command
      };
    }
  }

  logExecution(command, result, executionTime) {
    this.executionHistory.push({
      command,
      result,
      executionTime,
      timestamp: new Date().toISOString()
    });

    // Keep only last 100 executions
    if (this.executionHistory.length > 100) {
      this.executionHistory.shift();
    }
  }
}

module.exports = EnhancedCommandExecutor;