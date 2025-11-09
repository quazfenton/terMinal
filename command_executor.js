/**
 * Command Executor
 * 
 * Handles the execution of command sequences and special commands
 * with proper error handling and state management.
 */

const { spawn, exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const util = require('util');
const execPromise = util.promisify(exec);

const PluginManager = require('./plugin_manager');
const InputValidator = require('./security/InputValidator');
const CommandRecognizer = require('./core/CommandRecognizer');

class CommandExecutor {
  constructor() {
    this.pluginManager = new PluginManager(this);
    this.pluginManager.loadPlugins();
    this.inputValidator = new InputValidator();
    this.commandRecognizer = new CommandRecognizer();
    this.currentProcess = null;
    this.isExecuting = false;
    this.commandHistory = global.sessionContext ? global.sessionContext.get('commandHistory', []) : [];
    this.maxHistoryLength = 100;
    this.currentDirectory = global.sessionContext ? global.sessionContext.get('currentDirectory', process.cwd()) : process.cwd();
    this.specialHandlers = {
      'nano': this.handleTextEditor.bind(this),
      'vim': this.handleTextEditor.bind(this),
      'vi': this.handleTextEditor.bind(this),
      'emacs': this.handleTextEditor.bind(this),
      'code': this.handleTextEditor.bind(this)
    };
    this.executionTimeouts = new Map();
    this.maxExecutionTime = 30000;
  }

  /**
   * Check if command can be executed directly without AI
   */
  isDirectCommand(input) {
    return this.commandRecognizer.isDirectCommand(input);
  }

  /**
   * Execute command directly without AI processing
   */
  async executeDirectly(command, options = {}) {
    // Still validate for security
    const validation = this.inputValidator.validateInput(command, options);
    
    if (!validation.isValid) {
      return {
        success: false,
        output: `Command blocked: ${validation.errors.join(', ')}`,
        riskLevel: validation.riskLevel,
        isDirect: true
      };
    }

    const result = await this.executeCommand(validation.sanitized, { 
      ...options, 
      skipAI: true 
    });
    
    result.isDirect = true;
    return result;
  }

  /**
   * Execute a single command
   * @param {string} command - The command to execute
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} Execution result
   */
  async executeCommand(command, options = {}) {
    if (this.isExecuting && !options.ignoreExecutingFlag) {
      return { success: false, output: 'Another command is already running' };
    }

    // Enhanced security validation
    const validation = this.inputValidator.validateInput(command, {
      strictMode: options.strictMode || false,
      allowHidden: options.allowHidden || false
    });

    // Log security event
    await this.inputValidator.logSecurityEvent(command, validation, 'execute');

    if (!validation.isValid) {
      return {
        success: false,
        output: `Command blocked: ${validation.errors.join(', ')}`,
        suggestions: validation.suggestions,
        riskLevel: validation.riskLevel,
        blocked: validation.blocked
      };
    }

    // Show warnings if any
    if (validation.warnings.length > 0) {
      console.warn('Command warnings:', validation.warnings);
    }

    // Use sanitized and sandboxed command
    command = this.inputValidator.createSandboxedCommand(validation.sanitized);

    try {
      this.isExecuting = true;

      const pluginInfo = this.pluginManager.findPluginForCommand(command);
      if (pluginInfo && typeof pluginInfo.command.execute === 'function') {
        return await this.pluginManager.executePluginCommand(pluginInfo);
      }

      if (command.startsWith('cd ')) {
        return await this.handleChangeDirectory(command);
      }

      if (command.startsWith('sudo ')) {
        return await this.handleSudo(command, options);
      }

      const specialCommand = this.checkForSpecialCommand(command);
      if (specialCommand) {
        return await this.handleSpecialCommand(specialCommand, options);
      }

      const result = await this.executeShellCommand(command);
      result.output = this.formatOutput(result.output, options);
      return result;
    } catch (error) {
      console.error('Error executing command:', error);
      return {
        success: false,
        output: `Error: ${error.message}`,
      };
    } finally {
      this.isExecuting = false;
      this.addToHistory(command);
    }
  }

  /**
   * Execute a sequence of commands
   * @param {Array} commands - Array of command strings or command objects
   * @param {Object} options - Execution options
   * @returns {Promise<Array>} Array of execution results
   */
  async executeSequence(commands, options = {}) {
    const results = [];
    
    for (const cmd of commands) {
      // If this is an object with a command property, extract it
      const commandStr = typeof cmd === 'string' ? cmd : cmd.command;
      
      // Skip empty commands
      if (!commandStr || commandStr.trim() === '') continue;
      
      // Execute the command
      const result = await this.executeCommand(commandStr, {
        ...options,
        ignoreExecutingFlag: true // Allow commands in sequence to execute even if isExecuting is true
      });
      
      results.push({
        command: commandStr,
        ...result
      });
      
      // Stop execution if a command fails and stopOnError is true
      if (options.stopOnError && !result.success) {
        break;
      }
    }
    
    return results;
  }

  /**
   * Execute a shell command securely
   * @param {string} command - The shell command to execute
   * @returns {Promise<Object>} Execution result
   */
  executeShellCommand(command) {
    return new Promise((resolve) => {
      // Parse command safely - never use shell: true
      const parts = this.parseCommand(command);
      const cmd = parts.command;
      const args = parts.args;
      const options = parts.options;
      
      // Set execution timeout
      const timeout = setTimeout(() => {
        if (child && !child.killed) {
          child.kill('SIGTERM');
          resolve({
            success: false,
            output: '',
            stderr: 'Command timed out',
            error: 'Command execution timeout'
          });
        }
      }, this.inputValidator.securityConfig.commandTimeout);

      const child = spawn(cmd, args, {
        cwd: this.currentDirectory,
        shell: false,  // NEVER use shell: true
        stdio: ['pipe', 'pipe', 'pipe'],
        env: this.createSecureEnvironment(),
        ...options
      });
      
      this.currentProcess = child;
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('close', (code) => {
        clearTimeout(timeout);
        this.currentProcess = null;
        
        resolve({
          success: code === 0,
          output: stdout,
          stderr: stderr,
          exitCode: code,
          error: code !== 0 ? `Process exited with code ${code}` : null
        });
      });
      
      child.on('error', (error) => {
        clearTimeout(timeout);
        this.currentProcess = null;
        
        resolve({
          success: false,
          output: '',
          stderr: error.message,
          error: error.message
        });
      });
    });
  }

  /**
   * Parse command into safe components
   */
  parseCommand(command) {
    // Remove sandbox prefix if present
    const cleanCommand = command.replace(/^(timeout|nice|ionice)\s+[^\s]+\s*/g, '');
    
    // Split command safely
    const parts = cleanCommand.trim().split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);
    
    return {
      command: cmd,
      args: args,
      options: {
        detached: false,
        windowsHide: true
      }
    };
  }

  /**
   * Create secure environment for command execution
   */
  createSecureEnvironment() {
    const secureEnv = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      USER: process.env.USER,
      LANG: process.env.LANG || 'en_US.UTF-8',
      TERM: 'xterm-256color'
    };

    // Remove potentially dangerous environment variables
    delete secureEnv.LD_PRELOAD;
    delete secureEnv.LD_LIBRARY_PATH;
    delete secureEnv.DYLD_INSERT_LIBRARIES;
    
    return secureEnv;
  }

  isDangerous(command) {
    const dangerousPatterns = [
      /^sudo\s+rm\s+-rf\s+\//,      // Dangerous rm -rf with sudo
      /^rm\s+-rf\s+\//,              // Dangerous rm -rf
      />\s*\/dev\/sd/,               // Overwriting device files
      /.*>&\s*\/dev\/null\s*\|\s*rm.*/, // Redirect output to rm command
      /.*\|\s*rm\s+-rf.*/,           // Piping to dangerous commands
      /.*&&\s*rm\s+-rf.*/,           // Chaining dangerous commands
      /.*;\s*rm\s+-rf.*/,            // Semicolon separation for dangerous commands
      /\/\.\.\//,                    // Path traversal attempts
      /.*\$\(.+\).*/,                // Command substitution attempts
      /.*`.*`/,                      // Backtick command execution
      /.*\{\s*\/.*\s*\}.*/,          // Globbing attacks
    ];
    
    // Also check for dangerous file paths
    if (command.includes('../../') || command.includes('../../../')) {
      return true;
    }
    
    return dangerousPatterns.some(pattern => pattern.test(command));
  }

  async handleSudo(command, options) {
    // Secure sudo handling - never accept plaintext passwords
    return {
      success: false,
      output: 'Sudo commands require system authentication dialog',
      requiresSystemAuth: true,
      error: 'Use system sudo authentication instead of plaintext passwords'
    };
  }

  /**
   * Execute command with real-time output (REMOVED for security)
   * This method has been disabled due to security vulnerabilities
   */
  executeShellCommandWithStreaming(command, outputCallback) {
    return Promise.resolve({
      success: false,
      output: 'Streaming execution disabled for security',
      error: 'Use standard execution method instead'
    });
  }

  formatOutput(output, options) {
    let formattedOutput = output;
    if (options.trim) {
      formattedOutput = formattedOutput.trim();
    }
    if (options.json) {
      try {
        return JSON.parse(formattedOutput);
      } catch (error) {
        // Ignore if not valid JSON
      }
    }
    return formattedOutput;
  }

  /**
   * Execute a shell command with real-time output streaming
   * @param {string} command - The shell command to execute
   * @param {Function} outputCallback - Callback for real-time output
   * @returns {Promise<Object>} Execution result
   */
  executeShellCommandWithStreaming(command, outputCallback) {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      
      const childProcess = spawn('sh', ['-c', command], {
        cwd: this.currentDirectory,
        shell: true
      });
      
      this.currentProcess = childProcess;
      
      childProcess.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        if (outputCallback) outputCallback('stdout', output);
      });
      
      childProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        if (outputCallback) outputCallback('stderr', output);
      });
      
      childProcess.on('close', (code) => {
        this.currentProcess = null;
        
        if (code === 0) {
          resolve({ 
            success: true, 
            output: stdout, 
            stderr: stderr 
          });
        } else {
          resolve({ 
            success: false, 
            output: stdout, 
            stderr: stderr,
            error: `Process exited with code ${code}` 
          });
        }
      });
      
      childProcess.on('error', (error) => {
        this.currentProcess = null;
        resolve({ 
          success: false, 
          output: stdout, 
          stderr: stderr,
          error: error.message 
        });
      });
    });
  }

  /**
   * Handle the 'cd' command to change directories
   * @param {string} command - The cd command
   * @returns {Promise<Object>} Execution result
   */
  async handleChangeDirectory(command) {
    try {
      // Extract the target directory
      const targetDir = command.substring(3).trim();
      let newDir;
      
      // Handle special cases
      if (targetDir === '~') {
        newDir = os.homedir();
      } else if (targetDir.startsWith('~')) {
        newDir = path.join(os.homedir(), targetDir.substring(1));
      } else if (path.isAbsolute(targetDir)) {
        newDir = targetDir;
      } else {
        newDir = path.join(this.currentDirectory, targetDir);
      }
      
      // Check if directory exists
      await fs.access(newDir);
      
      // Update current directory
      this.currentDirectory = newDir;
      process.chdir(newDir);
      
      // Update session context with the new directory
      global.sessionContext.set('currentDirectory', newDir);

      return {
        success: true,
        output: `Changed directory to: ${newDir}`,
        newDirectory: newDir
      };
    } catch (error) {
      return { 
        success: false, 
        output: `Failed to change directory: ${error.message}` 
      };
    }
  }

  /**
   * Check if a command needs special handling
   * @param {string} command - The command to check
   * @returns {Object|null} Special command info or null
   */
  checkForSpecialCommand(command) {
    // Check for text editors
    for (const editor of Object.keys(this.specialHandlers)) {
      if (command.startsWith(`${editor} `)) {
        const parts = command.split(' ');
        return {
          type: 'editor',
          editor,
          filename: parts[1],
          args: parts.slice(2)
        };
      }
    }
    
    // Check for file creation with redirection
    if (/echo\s+(['"]).*\1\s*>\s*\S+/.test(command) || 
        /printf\s+(['"]).*\1\s*>\s*\S+/.test(command)) {
      return {
        type: 'redirect',
        command
      };
    }
    
    // Check for touch command (file creation)
    if (/^touch\s+\S+/.test(command)) {
      const parts = command.split(' ');
      return {
        type: 'touch',
        filename: parts[1],
        command
      };
    }
    
    return null;
  }

  /**
   * Handle special commands that need custom processing
   * @param {Object} specialCommand - Special command info
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} Execution result
   */
  async handleSpecialCommand(specialCommand, options) {
    if (specialCommand.type === 'editor') {
      return await this.specialHandlers[specialCommand.editor](
        specialCommand.filename,
        options.fileContent || '',
        specialCommand.args
      );
    } else if (specialCommand.type === 'redirect') {
      // For redirection, just execute normally
      return await this.executeShellCommand(specialCommand.command);
    } else if (specialCommand.type === 'touch') {
      // For touch, create the file and optionally add content
      if (options.fileContent) {
        return await this.handleTextEditor(specialCommand.filename, options.fileContent);
      } else {
        return await this.executeShellCommand(specialCommand.command);
      }
    }
    
    return {
      success: false,
      output: `Unknown special command type: ${specialCommand.type}`
    };
  }

  /**
   * Handle text editor commands by creating/editing files directly
   * @param {string} filename - The file to edit
   * @param {string} content - The content to write
   * @param {Array} args - Additional arguments
   * @returns {Promise<Object>} Execution result
   */
  async handleTextEditor(filename, content, args = []) {
    try {
      const filePath = path.isAbsolute(filename) 
        ? filename 
        : path.join(this.currentDirectory, filename);
      
      // Create directory if it doesn't exist
      const directory = path.dirname(filePath);
      try {
        await fs.mkdir(directory, { recursive: true });
      } catch (error) {
        console.warn(`Could not create directory ${directory}:`, error);
      }
      
      // If content is provided, write it to the file
      if (content) {
        await fs.writeFile(filePath, content, 'utf8');
        return {
          success: true,
          output: `File ${filename} created/updated with provided content.`,
          editorUsed: true,
          filePath
        };
      } else {
        // Check if file exists
        try {
          await fs.access(filePath);
          return {
            success: true,
            output: `File ${filename} exists. Opening in editor is simulated.`,
            editorUsed: true,
            filePath,
            fileExists: true
          };
        } catch (error) {
          // File doesn't exist, create empty file
          await fs.writeFile(filePath, '', 'utf8');
          return {
            success: true,
            output: `Created empty file ${filename}. Opening in editor is simulated.`,
            editorUsed: true,
            filePath,
            fileExists: false
          };
        }
      }
    } catch (error) {
      return {
        success: false,
        output: `Error handling text editor command: ${error.message}`,
        editorUsed: true
      };
    }
  }

  /**
   * Add a command to the history
   * @param {string} command - The command to add
   */
  addToHistory(command) {
    const historyEntry = {
      command,
      timestamp: new Date().toISOString(),
      directory: this.currentDirectory
    };
    this.commandHistory.push(historyEntry);
    
    // Trim history if it exceeds max length
    if (this.commandHistory.length > this.maxHistoryLength) {
      this.commandHistory = this.commandHistory.slice(-this.maxHistoryLength);
    }
    // Persist history to session context
    global.sessionContext.set('commandHistory', this.commandHistory);
  }

  /**
   * Get the current working directory
   * @returns {string} Current directory
   */
  getCurrentDirectory() {
    return this.currentDirectory;
  }

  /**
   * Get command history
   * @param {number} limit - Maximum number of history items to return
   * @returns {Array} Command history
   */
  getHistory(limit = 10) {
    return this.commandHistory.slice(-limit);
  }

  /**
   * Clear command history
   */
  clearHistory() {
    this.commandHistory = [];
    global.sessionContext.set('commandHistory', []);
  }

  /**
   * Check if a command is a direct shell command that doesn't need AI processing
   * @param {string} command - The command to check
   * @returns {boolean} True if the command can be executed directly
   */
  isDirectCommand(command) {
    const directCommands = [
      'ls', 'pwd', 'cd', 'mkdir', 'touch', 'rm', 'cp', 'mv', 'echo', 'cat', 'grep', 
      'find', 'ps', 'kill', 'top', 'df', 'du', 'history', 'clear', 'exit', 'whoami',
      'date', 'time', 'man', 'which', 'whereis', 'head', 'tail', 'sort', 'uniq', 'wc',
      'chmod', 'chown', 'ln', 'alias', 'unalias', 'jobs', 'fg', 'bg', 'htop', 'free',
      'ifconfig', 'netstat', 'ping', 'wget', 'curl', 'scp', 'ssh', 'rsync', 'tar',
      'zip', 'unzip', 'gzip', 'gunzip', 'bzip2', 'ps', 'kill', 'killall'
    ];
    
    // Split the command to get the first part
    const commandParts = command.trim().split(/\s+/);
    if (commandParts.length === 0) return false;
    
    const baseCommand = commandParts[0];
    
    // Check if it's a direct command
    if (directCommands.includes(baseCommand)) {
      return true;
    }
    
    // Check for some common patterns that should be direct
    if (baseCommand.startsWith('./') || baseCommand.includes('/') || 
        baseCommand.startsWith('~') || baseCommand.startsWith('../') || 
        baseCommand.startsWith('./')) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Kill the current process if one is running
   * @returns {boolean} True if a process was killed, false otherwise
   */
  killCurrentProcess() {
    if (this.currentProcess) {
      this.currentProcess.kill();
      this.currentProcess = null;
      this.isExecuting = false;
      return true;
    }
    return false;
  }

  /**
   * Get information about the file system at the current directory
   * @returns {Promise<Object>} File system information
   */
  async getFileSystemInfo() {
    try {
      // Get directory listing
      const { stdout: lsOutput } = await execPromise('ls -la', { cwd: this.currentDirectory });
      
      // Get disk usage
      const { stdout: duOutput } = await execPromise('du -sh .', { cwd: this.currentDirectory });
      
      // Get file types
      const { stdout: findOutput } = await execPromise('find . -maxdepth 1 -type f | wc -l', { cwd: this.currentDirectory });
      const { stdout: dirOutput } = await execPromise('find . -maxdepth 1 -type d | wc -l', { cwd: this.currentDirectory });
      
      return {
        success: true,
        listing: lsOutput,
        diskUsage: duOutput.trim(),
        fileCount: parseInt(findOutput.trim()),
        directoryCount: parseInt(dirOutput.trim()) - 1 // Subtract 1 for current directory
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = CommandExecutor;
