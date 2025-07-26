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

class CommandExecutor {
  constructor() {
    this.currentProcess = null;
    this.isExecuting = false;
    this.commandHistory = [];
    this.maxHistoryLength = 100;
    this.currentDirectory = process.cwd();
    this.specialHandlers = {
      'nano': this.handleTextEditor.bind(this),
      'vim': this.handleTextEditor.bind(this),
      'vi': this.handleTextEditor.bind(this),
      'emacs': this.handleTextEditor.bind(this),
      'code': this.handleTextEditor.bind(this)
    };
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

    try {
      this.isExecuting = true;
      
      // Check for built-in commands
      if (command.startsWith('cd ')) {
        return await this.handleChangeDirectory(command);
      }
      
      // Check for special commands that need custom handling
      const specialCommand = this.checkForSpecialCommand(command);
      if (specialCommand) {
        return await this.handleSpecialCommand(specialCommand, options);
      }
      
      // Execute regular shell command
      return await this.executeShellCommand(command);
    } catch (error) {
      console.error('Error executing command:', error);
      return { 
        success: false, 
        output: `Error: ${error.message}` 
      };
    } finally {
      this.isExecuting = false;
      
      // Add to history if successful
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
   * Execute a shell command
   * @param {string} command - The shell command to execute
   * @returns {Promise<Object>} Execution result
   */
  executeShellCommand(command) {
    return new Promise((resolve) => {
      exec(command, { cwd: this.currentDirectory }, (error, stdout, stderr) => {
        if (error) {
          resolve({ 
            success: false, 
            output: stdout || '', 
            error: error.message,
            stderr: stderr || '' 
          });
        } else {
          resolve({ 
            success: true, 
            output: stdout || '', 
            stderr: stderr || '' 
          });
        }
      });
    });
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
    this.commandHistory.push({
      command,
      timestamp: new Date().toISOString(),
      directory: this.currentDirectory
    });
    
    // Trim history if it exceeds max length
    if (this.commandHistory.length > this.maxHistoryLength) {
      this.commandHistory = this.commandHistory.slice(-this.maxHistoryLength);
    }
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