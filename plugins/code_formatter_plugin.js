/**
 * Code Formatter Plugin - Format code according to style guides
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const execAsync = promisify(exec);

class CodeFormatterPlugin {
  constructor() {
    this.supportedFormatters = ['prettier', 'black', 'clang-format'];
  }

  getName() { return "Code Formatter Plugin"; }

  getCommands() {
    return [
      {
        name: "format-file",
        description: "Format a specific file",
        pattern: /^format file (.+)$/i,
        execute: async (match) => {
          const filePath = match[1];
          return this.formatFile(filePath);
        }
      },
      {
        name: "format-directory",
        description: "Format all files in a directory",
        pattern: /^format directory (.+)$/i,
        execute: async (match) => {
          const dirPath = match[1];
          return this.formatDirectory(dirPath);
        }
      },
      {
        name: "format-check",
        description: "Check if files are formatted correctly without modifying them",
        pattern: /^format check(?: (.+))?$/i,
        execute: async (match) => {
          const target = match[1] || '.';
          return this.checkFormatting(target);
        }
      },
      {
        name: "format-formatters",
        description: "List supported code formatters",
        pattern: /^format formatters$/i,
        execute: async () => {
          return `Supported code formatters:
- Prettier (JavaScript, TypeScript, CSS, HTML, JSON, YAML)
- Black (Python)
- Clang Format (C, C++, Java, JavaScript, TypeScript)`;
        }
      },
      {
        name: "format-config",
        description: "Show or set formatter configuration",
        pattern: /^format config(?: (.+))?$/i,
        execute: async (match) => {
          const config = match[1];
          if (!config) {
            return this.showCurrentConfig();
          }
          return this.setConfig(config);
        }
      }
    ];
  }

  async formatFile(filePath) {
    try {
      await fs.access(filePath);
      const ext = path.extname(filePath);
      
      let command;
      switch (ext) {
        case '.js':
        case '.ts':
        case '.jsx':
        case '.tsx':
        case '.css':
        case '.html':
        case '.json':
        case '.yml':
        case '.yaml':
          command = `npx prettier --write ${filePath}`;
          break;
        case '.py':
          command = `black ${filePath}`;
          break;
        case '.c':
        case '.cpp':
        case '.h':
        case '.hpp':
          command = `clang-format -i ${filePath}`;
          break;
        default:
          return `Unsupported file type: ${ext}`;
      }
      
      const { stdout, stderr } = await execAsync(command);
      return `Formatted file: ${filePath}`;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return `File not found: ${filePath}`;
      }
      return `Error formatting file: ${error.message}`;
    }
  }

  async formatDirectory(dirPath) {
    try {
      const stats = await fs.stat(dirPath);
      if (!stats.isDirectory()) {
        return `${dirPath} is not a directory`;
      }
      
      // Count files that would be formatted
      const files = await this.getFilesInDirectory(dirPath);
      const supportedFiles = files.filter(file => {
        const ext = path.extname(file);
        return ['.js', '.ts', '.jsx', '.tsx', '.css', '.html', '.json', '.yml', '.yaml', '.py', '.c', '.cpp', '.h', '.hpp'].includes(ext);
      });
      
      if (supportedFiles.length === 0) {
        return `No formattable files found in ${dirPath}`;
      }
      
      // Try prettier first
      try {
        const jsFiles = supportedFiles.filter(file => 
          ['.js', '.ts', '.jsx', '.tsx', '.css', '.html', '.json', '.yml', '.yaml'].includes(path.extname(file))
        );
        
        if (jsFiles.length > 0) {
          const prettierCommand = `npx prettier --write ${jsFiles.join(' ')}`;
          await execAsync(prettierCommand);
        }
      } catch (error) {
        // Prettier might not be available, continue with other formatters
      }
      
      // Try black for Python files
      try {
        const pyFiles = supportedFiles.filter(file => path.extname(file) === '.py');
        if (pyFiles.length > 0) {
          const blackCommand = `black ${pyFiles.join(' ')}`;
          await execAsync(blackCommand);
        }
      } catch (error) {
        // Black might not be available, continue
      }
      
      // Try clang-format for C/C++ files
      try {
        const cFiles = supportedFiles.filter(file => 
          ['.c', '.cpp', '.h', '.hpp'].includes(path.extname(file))
        );
        
        for (const file of cFiles) {
          const clangCommand = `clang-format -i ${file}`;
          await execAsync(clangCommand);
        }
      } catch (error) {
        // Clang-format might not be available
      }
      
      return `Formatted ${supportedFiles.length} files in ${dirPath}`;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return `Directory not found: ${dirPath}`;
      }
      return `Error formatting directory: ${error.message}`;
    }
  }

  async checkFormatting(target) {
    try {
      let command;
      
      // If target is a file
      if (target.includes('.')) {
        const ext = path.extname(target);
        switch (ext) {
          case '.js':
          case '.ts':
          case '.jsx':
          case '.tsx':
          case '.css':
          case '.html':
          case '.json':
          case '.yml':
          case '.yaml':
            command = `npx prettier --check ${target}`;
            break;
          case '.py':
            command = `black --check ${target}`;
            break;
          case '.c':
          case '.cpp':
          case '.h':
          case '.hpp':
            command = `clang-format --dry-run --Werror ${target}`;
            break;
          default:
            return `Unsupported file type: ${ext}`;
        }
      } else {
        // If target is a directory
        command = `npx prettier --check "${target}/**/*.{js,ts,jsx,tsx,css,html,json,yml,yaml}" 2>/dev/null || echo "No Prettier issues"`;
        command += ` && black --check "${target}/**/*.py" 2>/dev/null || echo "No Black issues"`;
      }
      
      const { stdout, stderr } = await execAsync(command);
      const output = stdout + stderr;
      
      if (!output.trim()) {
        return "All files are formatted correctly";
      }
      
      return output;
    } catch (error) {
      const output = error.stdout + error.stderr;
      if (output) {
        return output;
      }
      return `Error checking formatting: ${error.message}`;
    }
  }

  async showCurrentConfig() {
    // Check for prettier config
    try {
      await fs.access('.prettierrc');
      const config = await fs.readFile('.prettierrc', 'utf8');
      return `Prettier config found:\n${config}`;
    } catch (error) {
      // Check for other config files
      try {
        await fs.access('pyproject.toml');
        const config = await fs.readFile('pyproject.toml', 'utf8');
        if (config.includes('[tool.black]')) {
          return `Black config found in pyproject.toml`;
        }
      } catch (error) {
        // Continue checking
      }
      
      try {
        await fs.access('.clang-format');
        const config = await fs.readFile('.clang-format', 'utf8');
        return `Clang Format config found:\n${config}`;
      } catch (error) {
        // Continue checking
      }
    }
    
    return "No formatter configuration found";
  }

  async setConfig(config) {
    // This would be a more complex implementation in a real plugin
    return `Setting formatter configuration is not implemented in this plugin. Please configure your formatters manually.`;
  }

  async getFilesInDirectory(dirPath) {
    const files = [];
    const items = await fs.readdir(dirPath);
    
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const stats = await fs.stat(itemPath);
      
      if (stats.isDirectory()) {
        // Skip node_modules and other common directories
        if (!['node_modules', '.git', '__pycache__'].includes(item)) {
          const subFiles = await this.getFilesInDirectory(itemPath);
          files.push(...subFiles);
        }
      } else {
        files.push(itemPath);
      }
    }
    
    return files;
  }

  initialize(terminal) {
    this.terminal = terminal;
  }
}

module.exports = CodeFormatterPlugin;