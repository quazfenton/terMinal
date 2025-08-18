/**
 * File Watcher Plugin - Monitor file changes and trigger actions
 */

const fs = require('fs');
const chokidar = require('chokidar');
const path = require('path');

class FileWatcherPlugin {
  constructor() {
    this.watchers = new Map();
    this.actions = new Map();
  }

  getName() { return "File Watcher Plugin"; }

  getCommands() {
    return [
      {
        name: "watch-start",
        description: "Start watching a directory or file for changes",
        pattern: /^watch start (.+?)(?:\s+(.+))?$/i,
        execute: async (command) => {
          const matches = command.match(/^watch start (.+?)(?:\s+(.+))?$/i);
          const targetPath = matches[1];
          const actionName = matches[2] || 'default';
          
          return this.startWatching(targetPath, actionName);
        }
      },
      {
        name: "watch-stop",
        description: "Stop watching a directory or file",
        pattern: /^watch stop (.+)$/i,
        execute: async (command) => {
          const targetPath = command.match(/^watch stop (.+)$/i)[1];
          return this.stopWatching(targetPath);
        }
      },
      {
        name: "watch-list",
        description: "List all active watchers",
        pattern: /^watch list$/i,
        execute: async () => {
          if (this.watchers.size === 0) {
            return "No active watchers.";
          }
          
          let result = "Active watchers:\n";
          for (const [targetPath, watcher] of this.watchers.entries()) {
            const actionNames = this.actions.has(targetPath) ? 
              Array.from(this.actions.get(targetPath).keys()).join(', ') : 
              'none';
            result += `- ${targetPath} (actions: ${actionNames})\n`;
          }
          return result;
        }
      },
      {
        name: "watch-add-action",
        description: "Add an action to execute when a file changes",
        pattern: /^watch action add (.+?) (.+?) (.+)$/i,
        execute: async (command) => {
          const matches = command.match(/^watch action add (.+?) (.+?) (.+)$/i);
          const targetPath = matches[1];
          const actionName = matches[2];
          const actionCommand = matches[3];
          
          return this.addAction(targetPath, actionName, actionCommand);
        }
      },
      {
        name: "watch-remove-action",
        description: "Remove an action from a watcher",
        pattern: /^watch action remove (.+?) (.+)$/i,
        execute: async (command) => {
          const matches = command.match(/^watch action remove (.+?) (.+)$/i);
          const targetPath = matches[1];
          const actionName = matches[2];
          
          return this.removeAction(targetPath, actionName);
        }
      },
      {
        name: "watch-help",
        description: "Show help information for the File Watcher plugin",
        pattern: /^watch help$/i,
        execute: async () => {
          return `File Watcher Plugin Commands:
- watch start [path] [action] : Start watching a directory or file for changes
- watch stop [path] : Stop watching a directory or file
- watch list : List all active watchers
- watch action add [path] [action] [command] : Add an action to execute when a file changes
- watch action remove [path] [action] : Remove an action from a watcher
- watch help : Show this help information

Examples:
- watch start ./src
- watch start ./src build
- watch action add ./src build "npm run build"
- watch action add ./src test "npm test"
- watch list
- watch stop ./src`;
        }
      }
    ];
  }

  async startWatching(targetPath, actionName) {
    // Check if already watching this path
    if (this.watchers.has(targetPath)) {
      return `Already watching ${targetPath}`;
    }
    
    // Check if path exists
    try {
      await fs.promises.access(targetPath);
    } catch (error) {
      return `Path not found: ${targetPath}`;
    }
    
    const watcher = chokidar.watch(targetPath, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true
    });
    
    watcher
      .on('change', (filePath) => {
        console.log(`File ${filePath} has changed`);
        this.executeActions(targetPath, 'change', filePath);
      })
      .on('add', (filePath) => {
        console.log(`File ${filePath} has been added`);
        this.executeActions(targetPath, 'add', filePath);
      })
      .on('unlink', (filePath) => {
        console.log(`File ${filePath} has been removed`);
        this.executeActions(targetPath, 'unlink', filePath);
      });
    
    this.watchers.set(targetPath, watcher);
    return `Started watching ${targetPath}`;
  }

  async stopWatching(targetPath) {
    if (!this.watchers.has(targetPath)) {
      return `Not watching ${targetPath}`;
    }
    
    const watcher = this.watchers.get(targetPath);
    await watcher.close();
    this.watchers.delete(targetPath);
    this.actions.delete(targetPath);
    
    return `Stopped watching ${targetPath}`;
  }

  addAction(targetPath, actionName, actionCommand) {
    if (!this.actions.has(targetPath)) {
      this.actions.set(targetPath, new Map());
    }
    
    this.actions.get(targetPath).set(actionName, actionCommand);
    return `Added action ${actionName} for ${targetPath}`;
  }

  removeAction(targetPath, actionName) {
    if (!this.actions.has(targetPath)) {
      return `No actions defined for ${targetPath}`;
    }
    
    if (!this.actions.get(targetPath).has(actionName)) {
      return `Action ${actionName} not found for ${targetPath}`;
    }
    
    this.actions.get(targetPath).delete(actionName);
    return `Removed action ${actionName} for ${targetPath}`;
  }

  async executeActions(targetPath, eventType, filePath) {
    if (!this.actions.has(targetPath)) {
      return;
    }
    
    const actions = this.actions.get(targetPath);
    for (const [actionName, actionCommand] of actions.entries()) {
      try {
        // Execute the action command
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        
        const { stdout, stderr } = await execAsync(actionCommand);
        const result = stdout || stderr || 'Command executed successfully with no output';
        console.log(`Action ${actionName} result: ${result}`);
        
        // If the terminal is available, output the result
        if (this.terminal) {
          this.terminal.writeln(`[Watcher] ${targetPath} -> ${actionName}: ${result}`);
        }
      } catch (error) {
        console.error(`Error executing action ${actionName}: ${error.message}`);
        if (this.terminal) {
          this.terminal.writeln(`[Watcher] ${targetPath} -> ${actionName}: Error - ${error.message}`);
        }
      }
    }
  }

  initialize(terminal) {
    this.terminal = terminal;
  }
  
  // Cleanup watchers when plugin is unloaded
  destroy() {
    for (const [targetPath, watcher] of this.watchers.entries()) {
      watcher.close();
    }
    this.watchers.clear();
    this.actions.clear();
  }
}

module.exports = FileWatcherPlugin;