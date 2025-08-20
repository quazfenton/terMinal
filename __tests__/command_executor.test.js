/**
 * Command Executor Tests
 * 
 * Tests for command execution, validation, and security features.
 */

const CommandExecutor = require('../command_executor');
const { testUtils } = require('./setup');

// Mock child_process
jest.mock('child_process', () => ({
  spawn: jest.fn(),
  exec: jest.fn()
}));

// Mock fs promises
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    access: jest.fn(),
    mkdir: jest.fn(),
    readdir: jest.fn(),
    stat: jest.fn()
  }
}));

const { spawn, exec } = require('child_process');
const fs = require('fs').promises;

describe('CommandExecutor', () => {
  let commandExecutor;
  let mockProcess;

  beforeEach(() => {
    commandExecutor = new CommandExecutor();
    
    // Mock process object
    mockProcess = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn(),
      kill: jest.fn()
    };
    
    spawn.mockReturnValue(mockProcess);
    exec.mockImplementation((cmd, callback) => {
      callback(null, 'mock output', '');
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('executeCommand', () => {
    test('should execute safe commands successfully', async () => {
      const command = 'ls -la';
      
      // Mock successful execution
      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      });
      
      mockProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback('file1.txt\nfile2.txt\n'), 5);
        }
      });

      const result = await commandExecutor.executeCommand(command);
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('file1.txt');
      expect(spawn).toHaveBeenCalledWith('ls', ['-la'], expect.any(Object));
    });

    test('should block dangerous commands', async () => {
      const dangerousCommand = 'rm -rf /';
      
      const result = await commandExecutor.executeCommand(dangerousCommand);
      
      expect(result.success).toBe(false);
      expect(result.output).toContain('Command blocked');
      expect(result.riskLevel).toBe('critical');
      expect(spawn).not.toHaveBeenCalled();
    });

    test('should handle command execution errors', async () => {
      const command = 'nonexistent-command';
      
      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('Command not found')), 10);
        }
      });

      const result = await commandExecutor.executeCommand(command);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Command not found');
    });

    test('should prevent concurrent execution', async () => {
      commandExecutor.isExecuting = true;
      
      const result = await commandExecutor.executeCommand('ls');
      
      expect(result.success).toBe(false);
      expect(result.output).toContain('Another command is already running');
    });

    test('should handle file creation commands with content', async () => {
      const command = 'nano test.txt';
      const fileContent = 'Hello, World!';
      
      fs.writeFile.mockResolvedValue();
      
      const result = await commandExecutor.executeCommand(command, { fileContent });
      
      expect(result.success).toBe(true);
      expect(result.editorUsed).toBe(true);
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('test.txt'),
        fileContent,
        'utf8'
      );
    });
  });

  describe('executeSequence', () => {
    test('should execute command sequence successfully', async () => {
      const commands = ['echo "hello"', 'echo "world"'];
      
      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      });
      
      mockProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback('output\n'), 5);
        }
      });

      const results = await commandExecutor.executeSequence(commands);
      
      expect(results).toHaveLength(2);
      expect(results.every(r => r.success)).toBe(true);
      expect(spawn).toHaveBeenCalledTimes(2);
    });

    test('should stop on error when stopOnError is true', async () => {
      const commands = ['echo "hello"', 'invalid-command', 'echo "world"'];
      
      let callCount = 0;
      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          callCount++;
          const exitCode = callCount === 2 ? 1 : 0; // Second command fails
          setTimeout(() => callback(exitCode), 10);
        }
      });

      const results = await commandExecutor.executeSequence(commands, { stopOnError: true });
      
      expect(results).toHaveLength(2); // Should stop after second command
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
    });

    test('should continue on error when stopOnError is false', async () => {
      const commands = ['echo "hello"', 'invalid-command', 'echo "world"'];
      
      let callCount = 0;
      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          callCount++;
          const exitCode = callCount === 2 ? 1 : 0; // Second command fails
          setTimeout(() => callback(exitCode), 10);
        }
      });

      const results = await commandExecutor.executeSequence(commands, { stopOnError: false });
      
      expect(results).toHaveLength(3); // Should execute all commands
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);
    });
  });

  describe('handleChangeDirectory', () => {
    test('should change directory successfully', async () => {
      const command = 'cd /tmp';
      
      fs.access.mockResolvedValue();
      
      const result = await commandExecutor.handleChangeDirectory(command);
      
      expect(result.success).toBe(true);
      expect(result.newDirectory).toBe('/tmp');
      expect(fs.access).toHaveBeenCalledWith('/tmp');
    });

    test('should handle non-existent directory', async () => {
      const command = 'cd /nonexistent';
      
      fs.access.mockRejectedValue(new Error('Directory not found'));
      
      const result = await commandExecutor.handleChangeDirectory(command);
      
      expect(result.success).toBe(false);
      expect(result.output).toContain('Failed to change directory');
    });

    test('should handle home directory shortcut', async () => {
      const command = 'cd ~';
      
      fs.access.mockResolvedValue();
      
      const result = await commandExecutor.handleChangeDirectory(command);
      
      expect(result.success).toBe(true);
      expect(result.newDirectory).toContain('/mock/home'); // From mock
    });
  });

  describe('handleTextEditor', () => {
    test('should create file with content', async () => {
      const filename = 'test.txt';
      const content = 'Hello, World!';
      
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
      
      const result = await commandExecutor.handleTextEditor(filename, content);
      
      expect(result.success).toBe(true);
      expect(result.editorUsed).toBe(true);
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining(filename),
        content,
        'utf8'
      );
    });

    test('should handle existing file without content', async () => {
      const filename = 'existing.txt';
      
      fs.access.mockResolvedValue(); // File exists
      
      const result = await commandExecutor.handleTextEditor(filename, '');
      
      expect(result.success).toBe(true);
      expect(result.fileExists).toBe(true);
      expect(fs.access).toHaveBeenCalledWith(expect.stringContaining(filename));
    });

    test('should create empty file if not exists', async () => {
      const filename = 'new.txt';
      
      fs.access.mockRejectedValue(new Error('File not found'));
      fs.writeFile.mockResolvedValue();
      
      const result = await commandExecutor.handleTextEditor(filename, '');
      
      expect(result.success).toBe(true);
      expect(result.fileExists).toBe(false);
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining(filename),
        '',
        'utf8'
      );
    });
  });

  describe('addToHistory', () => {
    test('should add command to history', () => {
      const command = 'ls -la';
      const initialLength = commandExecutor.commandHistory.length;
      
      commandExecutor.addToHistory(command);
      
      expect(commandExecutor.commandHistory).toHaveLength(initialLength + 1);
      expect(commandExecutor.commandHistory[commandExecutor.commandHistory.length - 1].command).toBe(command);
    });

    test('should not add duplicate commands', () => {
      const command = 'ls -la';
      
      commandExecutor.addToHistory(command);
      const lengthAfterFirst = commandExecutor.commandHistory.length;
      
      commandExecutor.addToHistory(command);
      
      expect(commandExecutor.commandHistory).toHaveLength(lengthAfterFirst);
    });

    test('should maintain max history length', () => {
      commandExecutor.maxHistoryLength = 3;
      
      // Add more commands than max length
      for (let i = 0; i < 5; i++) {
        commandExecutor.addToHistory(`command${i}`);
      }
      
      expect(commandExecutor.commandHistory).toHaveLength(3);
      expect(commandExecutor.commandHistory[0].command).toBe('command2');
      expect(commandExecutor.commandHistory[2].command).toBe('command4');
    });
  });

  describe('killCurrentProcess', () => {
    test('should kill running process', () => {
      commandExecutor.currentProcess = mockProcess;
      commandExecutor.isExecuting = true;
      
      const result = commandExecutor.killCurrentProcess();
      
      expect(result).toBe(true);
      expect(mockProcess.kill).toHaveBeenCalled();
      expect(commandExecutor.currentProcess).toBeNull();
      expect(commandExecutor.isExecuting).toBe(false);
    });

    test('should return false if no process running', () => {
      commandExecutor.currentProcess = null;
      
      const result = commandExecutor.killCurrentProcess();
      
      expect(result).toBe(false);
    });
  });

  describe('getCurrentDirectory', () => {
    test('should return current directory', () => {
      const testDir = '/test/directory';
      commandExecutor.currentDirectory = testDir;
      
      const result = commandExecutor.getCurrentDirectory();
      
      expect(result).toBe(testDir);
    });
  });

  describe('getHistory', () => {
    test('should return limited history', () => {
      // Add some commands to history
      for (let i = 0; i < 10; i++) {
        commandExecutor.addToHistory(`command${i}`);
      }
      
      const history = commandExecutor.getHistory(5);
      
      expect(history).toHaveLength(5);
      expect(history[4].command).toBe('command9'); // Most recent
    });

    test('should return all history if limit is larger', () => {
      commandExecutor.addToHistory('command1');
      commandExecutor.addToHistory('command2');
      
      const history = commandExecutor.getHistory(10);
      
      expect(history).toHaveLength(2);
    });
  });

  describe('clearHistory', () => {
    test('should clear command history', () => {
      commandExecutor.addToHistory('command1');
      commandExecutor.addToHistory('command2');
      
      commandExecutor.clearHistory();
      
      expect(commandExecutor.commandHistory).toHaveLength(0);
    });
  });
});