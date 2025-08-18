const { spawn, exec } = require('child_process');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');

class ToolOrchestrator extends EventEmitter {
  constructor() {
    super();
    this.tools = new Map();
    this.toolChains = new Map();
    this.executionQueue = [];
    this.retryConfig = {
      maxRetries: 3,
      backoffMultiplier: 2,
      initialDelay: 1000
    };
    this.initializeTools();
  }

  async initializeTools() {
    // Register built-in tools
    await this.registerBuiltInTools();
    
    // Discover and register external tools
    await this.discoverExternalTools();
    
    // Load custom tool definitions
    await this.loadCustomTools();
  }

  async registerBuiltInTools() {
    // File System Operations
    this.registerTool('fs_read', {
      description: 'Read file contents with encoding detection',
      parameters: { path: 'string', encoding: 'string?' },
      execute: async ({ path, encoding = 'utf8' }) => {
        const content = await fs.readFile(path, encoding);
        return { success: true, content, size: content.length };
      },
      timeout: 5000,
      retryable: true
    });

    this.registerTool('fs_write', {
      description: 'Write content to file with backup',
      parameters: { path: 'string', content: 'string', backup: 'boolean?' },
      execute: async ({ path, content, backup = true }) => {
        if (backup && await this.fileExists(path)) {
          await fs.copyFile(path, `${path}.backup.${Date.now()}`);
        }
        await fs.writeFile(path, content, 'utf8');
        return { success: true, path, size: content.length };
      },
      timeout: 10000,
      retryable: true
    });

    // Git Operations with Enhanced Error Handling
    this.registerTool('git_status', {
      description: 'Get git repository status with parsing',
      execute: async () => {
        const result = await this.executeCommand('git status --porcelain');
        const files = result.stdout.split('\n')
          .filter(line => line.trim())
          .map(line => ({
            status: line.substring(0, 2),
            file: line.substring(3)
          }));
        return { success: true, files, hasChanges: files.length > 0 };
      },
      timeout: 5000,
      retryable: true
    });

    this.registerTool('git_commit_smart', {
      description: 'Smart git commit with auto-generated messages',
      parameters: { message: 'string?', autoGenerate: 'boolean?' },
      execute: async ({ message, autoGenerate = false }) => {
        if (autoGenerate || !message) {
          const diff = await this.executeCommand('git diff --cached --stat');
          message = await this.generateCommitMessage(diff.stdout);
        }
        
        const result = await this.executeCommand(`git commit -m "${message}"`);
        return { 
          success: result.code === 0, 
          message, 
          output: result.stdout 
        };
      },
      timeout: 15000,
      retryable: false
    });

    // Package Management with Multi-Manager Support
    this.registerTool('package_install', {
      description: 'Install packages with auto-detection of package manager',
      parameters: { packages: 'string[]', manager: 'string?', dev: 'boolean?' },
      execute: async ({ packages, manager, dev = false }) => {
        if (!manager) {
          manager = await this.detectPackageManager();
        }
        
        const commands = {
          npm: `npm install ${dev ? '--save-dev' : ''} ${packages.join(' ')}`,
          yarn: `yarn add ${dev ? '--dev' : ''} ${packages.join(' ')}`,
          pip: `pip install ${packages.join(' ')}`,
          brew: `brew install ${packages.join(' ')}`,
          apt: `sudo apt-get install -y ${packages.join(' ')}`
        };

        const command = commands[manager];
        if (!command) {
          throw new Error(`Unsupported package manager: ${manager}`);
        }

        const result = await this.executeCommand(command);
        return { 
          success: result.code === 0, 
          manager, 
          packages, 
          output: result.stdout 
        };
      },
      timeout: 120000, // 2 minutes for package installation
      retryable: true
    });

    // Web Scraping & API Tools
    this.registerTool('web_fetch', {
      description: 'Fetch web content with parsing options',
      parameters: { 
        url: 'string', 
        selector: 'string?', 
        format: 'string?',
        headers: 'object?'
      },
      execute: async ({ url, selector, format = 'text', headers = {} }) => {
        const response = await axios.get(url, { 
          headers: { 'User-Agent': 'AI-Terminal/1.0', ...headers },
          timeout: 30000
        });
        
        let content = response.data;
        
        if (selector && format === 'html') {
          const cheerio = require('cheerio');
          const $ = cheerio.load(content);
          content = $(selector).text();
        }
        
        return { 
          success: true, 
          content, 
          status: response.status,
          contentType: response.headers['content-type']
        };
      },
      timeout: 30000,
      retryable: true
    });

    // Code Analysis Tools
    this.registerTool('code_analyze', {
      description: 'Analyze code files for complexity, issues, and metrics',
      parameters: { path: 'string', language: 'string?', deep: 'boolean?' },
      execute: async ({ path, language, deep = false }) => {
        const content = await fs.readFile(path, 'utf8');
        const analysis = {
          lines: content.split('\n').length,
          characters: content.length,
          functions: (content.match(/function\s+\w+/g) || []).length,
          classes: (content.match(/class\s+\w+/g) || []).length,
          imports: (content.match(/(?:import|require)\s*\(/g) || []).length
        };

        if (deep) {
          // Run external tools like ESLint, Pylint, etc.
          const lintResult = await this.runLinter(path, language);
          analysis.linting = lintResult;
        }

        return { success: true, analysis, path };
      },
      timeout: 15000,
      retryable: true
    });

    // Database Operations
    this.registerTool('db_query', {
      description: 'Execute database queries with connection pooling',
      parameters: { 
        query: 'string', 
        database: 'string?', 
        type: 'string?',
        params: 'array?'
      },
      execute: async ({ query, database = 'default', type = 'sqlite', params = [] }) => {
        const connection = await this.getDatabaseConnection(database, type);
        const result = await connection.query(query, params);
        return { 
          success: true, 
          rows: result.rows || result,
          rowCount: result.rowCount || result.length
        };
      },
      timeout: 30000,
      retryable: true
    });

    // System Monitoring
    this.registerTool('system_monitor', {
      description: 'Get comprehensive system metrics',
      execute: async () => {
        const [cpu, memory, disk, network] = await Promise.all([
          this.getCPUUsage(),
          this.getMemoryUsage(),
          this.getDiskUsage(),
          this.getNetworkStats()
        ]);
        
        return { 
          success: true, 
          metrics: { cpu, memory, disk, network },
          timestamp: new Date().toISOString()
        };
      },
      timeout: 10000,
      retryable: true
    });
  }

  async discoverExternalTools() {
    // Discover installed CLI tools
    const commonTools = [
      'docker', 'kubectl', 'terraform', 'ansible', 'aws', 'gcloud',
      'jq', 'curl', 'wget', 'rsync', 'ssh', 'scp', 'ffmpeg',
      'imagemagick', 'pandoc', 'gh', 'code', 'vim', 'emacs'
    ];

    for (const tool of commonTools) {
      try {
        await this.executeCommand(`which ${tool}`);
        await this.registerExternalTool(tool);
      } catch (error) {
        // Tool not available, skip
      }
    }
  }

  async registerExternalTool(toolName) {
    const toolConfigs = {
      docker: {
        description: 'Docker container management',
        subcommands: {
          'ps': { description: 'List containers', timeout: 5000 },
          'build': { description: 'Build image', timeout: 300000 },
          'run': { description: 'Run container', timeout: 60000 },
          'exec': { description: 'Execute in container', timeout: 30000 }
        }
      },
      
      kubectl: {
        description: 'Kubernetes cluster management',
        subcommands: {
          'get': { description: 'Get resources', timeout: 10000 },
          'apply': { description: 'Apply configuration', timeout: 60000 },
          'delete': { description: 'Delete resources', timeout: 30000 },
          'logs': { description: 'Get logs', timeout: 15000 }
        }
      },

      jq: {
        description: 'JSON processing',
        execute: async ({ input, filter }) => {
          const result = await this.executeCommand(`echo '${JSON.stringify(input)}' | jq '${filter}'`);
          return { success: true, output: result.stdout };
        },
        timeout: 5000,
        retryable: true
      }
    };

    if (toolConfigs[toolName]) {
      this.registerTool(toolName, toolConfigs[toolName]);
    }
  }

  async loadCustomTools() {
    // Load custom tool definitions from a specific directory
    const customToolsDir = path.join(__dirname, 'custom_tools');
    try {
      const files = await fs.readdir(customToolsDir);
      for (const file of files) {
        if (file.endsWith('.js')) {
          const toolDefinition = require(path.join(customToolsDir, file));
          this.registerTool(toolDefinition.name, toolDefinition);
        }
      }
    } catch (error) {
      console.error('Failed to load custom tools:', error);
    }
  }

  registerTool(name, definition) {
    this.tools.set(name, definition);
  }

  async executeCommand(command) {
    return new Promise((resolve, reject) => {
      const child = exec(command, (error, stdout, stderr) => {
        if (error) {
          reject({ code: error.code, stdout, stderr });
        } else {
          resolve({ code: 0, stdout, stderr });
        }
      });
    });
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  async generateCommitMessage(diff) {
    // Placeholder for commit message generation logic
    return `Auto-commit: Changes detected\n${diff}`;
  }

  async detectPackageManager() {
    // Placeholder for package manager detection logic
    return 'npm';
  }

  async runLinter(filePath, language) {
    // Placeholder for linter execution logic
    return { issues: [], warnings: [] };
  }

  async getDatabaseConnection(database, type) {
    // Placeholder for database connection logic
    return { query: async () => ({ rows: [], rowCount: 0 }) };
  }

  async getCPUUsage() {
    // Placeholder for CPU usage retrieval logic
    return { usage: 0 };
  }

  async getMemoryUsage() {
    // Placeholder for memory usage retrieval logic
    return { usage: 0 };
  }

  async getDiskUsage() {
    // Placeholder for disk usage retrieval logic
    return { usage: 0 };
  }

  async getNetworkStats() {
    // Placeholder for network stats retrieval logic
    return { stats: {} };
  }
}