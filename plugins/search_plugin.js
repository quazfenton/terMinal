/**
 * Search Plugin - Fast file content search with advanced features
 */
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class SearchPlugin {
  constructor() {
    this.searchHistory = [];
  }
  
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
          this.addToSearchHistory(`content: ${query}`);
          return stdout;
        }
      },
      {
        name: "content-search-regex",
        description: "Search files by content using regex",
        pattern: /^search content-regex (.+)$/i,
        execute: async (match) => {
          const regex = match[1];
          const command = `grep -rnw '.' -E '${regex}'`;
          const { stdout } = await execAsync(command);
          this.addToSearchHistory(`content-regex: ${regex}`);
          return stdout;
        }
      },
      {
        name: "content-search-insensitive",
        description: "Search files by content (case insensitive)",
        pattern: /^search content-i (.+)$/i,
        execute: async (match) => {
          const query = match[1];
          const command = `grep -rnwi '.' -e '${query}'`;
          const { stdout } = await execAsync(command);
          this.addToSearchHistory(`content-i: ${query}`);
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
          this.addToSearchHistory(`file: ${pattern}`);
          return stdout;
        }
      },
      {
        name: "file-search-type",
        description: "Search files by name and type extension",
        pattern: /^search file (.+) type=(\S+)$/i,
        execute: async (match) => {
          const pattern = match[1];
          const type = match[2];
          const command = `find . -name "*${pattern}*.${
type}"`;
          const { stdout } = await execAsync(command);
          this.addToSearchHistory(`file: ${pattern} type: ${type}`);
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
          
          this.addToSearchHistory(`smart: ${query}`);
          return "No results found";
        }
      },
      {
        name: "search-history",
        description: "Show search history",
        pattern: /^search history$/i,
        execute: async () => {
          if (this.searchHistory.length === 0) {
            return "Search history is empty";
          }
          
          return this.searchHistory.map((search, index) =>
            `${index + 1}. ${search}`
          ).join('\n');
        }
      },
      {
        name: "search-stats",
        description: "Show search statistics",
        pattern: /^search stats$/i,
        execute: async () => {
          if (this.searchHistory.length === 0) {
            return "No searches performed yet";
          }
          
          const contentSearches = this.searchHistory.filter(s => s.startsWith('content:')).length;
          const regexSearches = this.searchHistory.filter(s => s.startsWith('content-regex:')).length;
          const fileSearches = this.searchHistory.filter(s => s.startsWith('file:')).length;
          const smartSearches = this.searchHistory.filter(s => s.startsWith('smart:')).length;
          
          return `Search Statistics:
Total searches: ${this.searchHistory.length}
Content searches: ${contentSearches}
Regex searches: ${regexSearches}
File searches: ${fileSearches}
Smart searches: ${smartSearches}`;
        }
      }
    ];
  }
  
  addToSearchHistory(query) {
    this.searchHistory.push(query);
    // Keep only the last 20 searches
    if (this.searchHistory.length > 20) {
      this.searchHistory.shift();
    }
  }
  
  initialize(terminal) {
    this.terminal = terminal;
  }
}

module.exports = SearchPlugin;