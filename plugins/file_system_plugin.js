/**
 * File System Plugin
 * 
 * Provides commands for interacting with the file system.
 */

const fs = require('fs').promises;
const path = require('path');

class FileSystemPlugin {
  constructor(commandExecutor) {
    this.commandExecutor = commandExecutor;
  }

  getName() {
    return 'FileSystem';
  }

  getCommands() {
    return [
      {
        name: 'readFile',
        pattern: /^read\s+(.+)$/,
        description: 'Read the contents of a file.',
        execute: this.readFile.bind(this)
      },
      {
        name: 'writeFile',
        pattern: /^write\s+(.+?)\s+((?:.|\s)+)$/,
        description: 'Write content to a file.',
        execute: this.writeFile.bind(this)
      }
    ];
  }

  async readFile(match) {
    const filePath = match[1];
    try {
      const fullPath = path.resolve(this.commandExecutor.getCurrentDirectory(), filePath);
      const content = await fs.readFile(fullPath, 'utf8');
      return { success: true, output: content };
    } catch (error) {
      return { success: false, output: `Error reading file: ${error.message}` };
    }
  }

  async writeFile(match) {
    const filePath = match[1];
    const content = match[2];
    try {
      const fullPath = path.resolve(this.commandExecutor.getCurrentDirectory(), filePath);
      await fs.writeFile(fullPath, content, 'utf8');
      return { success: true, output: `Successfully wrote to ${filePath}` };
    } catch (error) {
      return { success: false, output: `Error writing file: ${error.message}` };
    }
  }
}

module.exports = FileSystemPlugin;
