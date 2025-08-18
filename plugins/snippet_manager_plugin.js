/**
 * Code Snippet Manager Plugin - Save, retrieve and manage code snippets
 */

const fs = require('fs').promises;
const path = require('path');

class SnippetManagerPlugin {
  constructor() {
    this.snippetsDir = './snippets';
  }

  getName() { return "Code Snippet Manager Plugin"; }

  getCommands() {
    return [
      {
        name: "snippet-save",
        description: "Save a code snippet",
        pattern: /^snippet save (.+?)(?:\s+(.+))?$/i,
        execute: async (command) => {
          const matches = command.match(/^snippet save (.+?)(?:\s+(.+))?$/i);
          const snippetName = matches[1];
          const filePath = matches[2];
          
          if (filePath) {
            return this.saveSnippetFromFile(snippetName, filePath);
          } else {
            return "Please provide a file path to save as snippet";
          }
        }
      },
      {
        name: "snippet-list",
        description: "List all saved code snippets",
        pattern: /^snippet list$/i,
        execute: async () => {
          return this.listSnippets();
        }
      },
      {
        name: "snippet-get",
        description: "Retrieve a code snippet",
        pattern: /^snippet get (.+)$/i,
        execute: async (command) => {
          const snippetName = command.match(/^snippet get (.+)$/i)[1];
          return this.getSnippet(snippetName);
        }
      },
      {
        name: "snippet-delete",
        description: "Delete a code snippet",
        pattern: /^snippet delete (.+)$/i,
        execute: async (command) => {
          const snippetName = command.match(/^snippet delete (.+)$/i)[1];
          return this.deleteSnippet(snippetName);
        }
      },
      {
        name: "snippet-help",
        description: "Show help information for the Code Snippet Manager plugin",
        pattern: /^snippet help$/i,
        execute: async () => {
          return `Code Snippet Manager Plugin Commands:
- snippet save [name] [file] : Save a code snippet from a file
- snippet list : List all saved code snippets
- snippet get [name] : Retrieve a code snippet by name
- snippet delete [name] : Delete a code snippet by name
- snippet help : Show this help information

Examples:
- snippet save my-function ./src/utils.js
- snippet list
- snippet get my-function
- snippet delete my-function`;
        }
      }
    ];
  }

  async ensureSnippetsDir() {
    try {
      await fs.access(this.snippetsDir);
    } catch (error) {
      // Create snippets directory if it doesn't exist
      await fs.mkdir(this.snippetsDir, { recursive: true });
    }
  }

  async saveSnippetFromFile(snippetName, filePath) {
    await this.ensureSnippetsDir();
    
    try {
      // Read the file content
      const content = await fs.readFile(filePath, 'utf8');
      
      // Save as snippet
      const snippetPath = path.join(this.snippetsDir, `${snippetName}.snippet`);
      await fs.writeFile(snippetPath, content);
      
      return `Snippet "${snippetName}" saved from ${filePath}`;
    } catch (error) {
      return `Error saving snippet: ${error.message}`;
    }
  }

  async listSnippets() {
    await this.ensureSnippetsDir();
    
    try {
      const files = await fs.readdir(this.snippetsDir);
      const snippets = files.filter(file => file.endsWith('.snippet')).map(file => file.replace('.snippet', ''));
      
      if (snippets.length === 0) {
        return "No snippets saved.";
      }
      
      return `Saved snippets:\n${snippets.map(s => `- ${s}`).join('\n')}`;
    } catch (error) {
      return `Error listing snippets: ${error.message}`;
    }
  }

  async getSnippet(snippetName) {
    await this.ensureSnippetsDir();
    
    try {
      const snippetPath = path.join(this.snippetsDir, `${snippetName}.snippet`);
      const content = await fs.readFile(snippetPath, 'utf8');
      return content;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return `Snippet "${snippetName}" not found.`;
      }
      return `Error retrieving snippet: ${error.message}`;
    }
  }

  async deleteSnippet(snippetName) {
    await this.ensureSnippetsDir();
    
    try {
      const snippetPath = path.join(this.snippetsDir, `${snippetName}.snippet`);
      await fs.unlink(snippetPath);
      return `Snippet "${snippetName}" deleted.`;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return `Snippet "${snippetName}" not found.`;
      }
      return `Error deleting snippet: ${error.message}`;
    }
  }

  initialize(terminal) {
    this.terminal = terminal;
  }
}

module.exports = SnippetManagerPlugin;