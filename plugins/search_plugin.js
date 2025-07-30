/**
 * Search Plugin - Fast file content search
 */
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class SearchPlugin {
  getName() { return "Search Plugin"; }
  
  getCommands() {
    return [
      {
        name: "content-search",
        description: "Search files by content",
        pattern: /^search content (.+)$/i,
        execute: async (match) => {
          const query = match[1];
          const command = `grep -rnw '.' -e '${query}'`;
          const { stdout } = await execAsync(command);
          return stdout;
        }
      },
      {
        name: "file-search",
        description: "Search files by name",
        pattern: /^search file (.+)$/i,
        execute: async (match) => {
          const pattern = match[1];
          const command = `find . -name "*${pattern}*"`;
          const { stdout } = await execAsync(command);
          return stdout;
        }
      },
      {
        name: "smart-search",
        description: "Intelligent context-aware search",
        pattern: /^smart search (.+)$/i,
        execute: async (match, terminal) => {
          const query = match[1];
          
          // First try content search
          const contentResults = await terminal.executeCommand(`search content ${query}`);
          if (contentResults.output) return contentResults.output;
          
          // Then try file search
          const fileResults = await terminal.executeCommand(`search file ${query}`);
          if (fileResults.output) return fileResults.output;
          
          return "No results found";
        }
      }
    ];
  }
  
  initialize(terminal) {
    this.terminal = terminal;
  }
}

module.exports = SearchPlugin;