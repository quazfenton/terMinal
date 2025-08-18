/**
 * Automation Engine
 * 
 * Orchestrates advanced automation features for the AI Terminal, including
 * natural language to command sequence automation, file system navigation,
 * automated coding/writing, and rule-based script execution.
 */

const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const util = require('util');
const execPromise = util.promisify(exec);

class AutomationEngine {
  constructor(aiService, commandExecutor) {
    this.aiService = aiService;
    this.commandExecutor = commandExecutor;
    this.automationRules = new Map();
    this.rulesDirectory = path.join(__dirname, 'rules');
    this.autoAcceptInterval = 15000;
    this.isAutoAcceptRunning = false;
    this.iterativeTaskQueue = [];
    this.learnedSequences = new Map();
    this.pluginCommands = {};
  }

  async initialize() {
    await this.loadAutomationRules();
    this.registerPluginCommands();
    this.startAutoAcceptLoop();
  }

  async loadAutomationRules() {
    try {
      await fs.mkdir(this.rulesDirectory, { recursive: true });
      const ruleFiles = await fs.readdir(this.rulesDirectory);

      for (const file of ruleFiles) {
        if (file.endsWith('.js')) {
          try {
            const ruleModule = require(path.join(this.rulesDirectory, file));
            if (ruleModule.id && ruleModule.pattern && ruleModule.action) {
              this.automationRules.set(ruleModule.id, ruleModule);
            }
          } catch (error) {
            console.error(`Failed to load automation rule ${file}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Error loading automation rules:', error);
    }
  }

  /**
   * Handle git repository initialization
   */
  async handleGitInit() {
    return {
      success: true,
      commandSequences: [{
        id: `git-init`,
        rank: 1,
        commands: ["git init"],
        description: "Initialize a new Git repository"
      }]
    };
  }

  /**
   * Handle git add command
   */
  async handleGitAdd() {
    return {
      success: true,
      commandSequences: [{
        id: `git-add`,
        rank: 1,
        commands: ["git add ."],
        description: "Stage all changes for commit"
      }]
    };
  }

  /**
   * Handle git commit command
   */
  async handleGitCommit(input, rule) {
    const match = input.match(rule.pattern);
    const message = match && match ? match : "Automated commit by AI Terminal";
    
    return {
      success: true,
      commandSequences: [{
        id: `git-commit`,
        rank: 1,
        commands: [`git commit -m "${message}"`],
        description: `Commit changes with message: ${message}`
      }]
    };
  }

  /**
   * Handle git push command
   */
  async handleGitPush() {
    return {
      success: true,
      commandSequences: [{
        id: `git-push`,
        rank: 1,
        commands: ["git push"],
        description: "Push commits to remote repository"
      }]
    };
  }

  /**
   * Process natural language input for automation
   * @param {string} input - User's natural language input
   * @returns {Promise<Object>} Automation result
   */
  async processAutomationRequest(input) {
    try {
      // First check if input matches any plugin command patterns
      const pluginMatch = this.matchPluginCommand(input);
      if (pluginMatch) {
        return {
          success: true,
          commandSequences: [
            {
              id: `plugin-${Date.now()}`,
              rank: 1,
              commands: [input],
              description: `Execute plugin command: ${pluginMatch.name}`,
              pluginCommand: true
            }
          ]
        };
      }

      // Then check automation rules
      const ruleMatch = this.findMatchingRule(input);
      if (ruleMatch) {
        try {
          return await ruleMatch.action(input, ruleMatch, this);
        } catch (error) {
          return { success: false, error: `Rule action failed: ${error.message}` };
        }
      }

      // Then check common commands
      if (this.isCommonCommand(input)) {
        return {
          success: true,
          commandSequences: [
            {
              id: `common-${input}`,
              rank: 1,
              commands: [input],
              description: `Execute common command: ${input}`,
            },
          ],
        };
      }

      // Then check learned sequences
      const learnedSequence = this.getLearnedSequence(input);
      if (learnedSequence) {
        return {
          success: true,
          commandSequences: [learnedSequence],
          explanation: `Using learned sequence for "${input}"`,
        };
      }

      // Finally, use AI for complex requests
      const aiResponse = await this.aiService.processQuery(input, {
        biModalMode: true,
        includeDirectoryContext: true,
      });

      if (!aiResponse.success) {
        return { success: false, error: aiResponse.error };
      }

      const parsedResponse = await this.aiService.responseParser.parseResponse(
        aiResponse.rawResponse,
        true
      );

      parsedResponse.commandSequences = parsedResponse.commandSequences.map(
        (seq, index) => ({
          ...seq,
          automationId: `auto-${index}-${Date.now()}`,
          timestamp: new Date().toISOString(),
          status: 'pending',
        })
      );

      if (parsedResponse.success && parsedResponse.commandSequences.length > 0) {
        this.learnSequence(input, parsedResponse.commandSequences);
      }

      this.iterativeTaskQueue.push(...parsedResponse.commandSequences);
      return parsedResponse;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Find matching automation rule
   * @param {string} input - User's input
   * @returns {Object|null} Matching rule or null
   */
  registerPluginCommands() {
    const pluginManager = this.commandExecutor.pluginManager;
    for (const plugin of pluginManager.plugins.values()) {
      const commands = plugin.getCommands();
      for (const cmd of commands) {
        this.pluginCommands[cmd.name] = cmd.pattern;
      }
    }
  }

  matchPluginCommand(input) {
    for (const [name, pattern] of Object.entries(this.pluginCommands)) {
      if (pattern.test(input)) {
        return { name, pattern };
      }
    }
    return null;
  }

  findMatchingRule(input) {
    for (const rule of this.automationRules.values()) {
      if (rule.pattern.test(input)) {
        return rule;
      }
    }
    return null;
  }

  isCommonCommand(input) {
    const commonCommands = [
      'ls', 'cd', 'pwd', 'mkdir', 'touch', 'rm', 'cp', 'mv', 'echo', 'cat', 'grep', 'find', 'man', 'ps', 'kill', 'top', 'df', 'du', 'chmod', 'chown', 'ssh', 'scp', 'ftp', 'wget', 'curl', 'ping', 'netstat', 'ifconfig', 'ip', 'route', 'uname', 'history', 'clear', 'exit'
    ];
    const command = input.split(' '); // Get the first word as the command
    return commonCommands.includes(command);
  }

  /**
   * Handle package installation automation
   * @param {string} input - User input
   * @param {Object} rule - Matched rule
   * @returns {Object} Automation result
   */
  async handlePackageInstall(input, rule) {
    const match = input.match(rule.pattern);
    const packageManager = match && match ? match.toLowerCase() : '';
    const packageName = match && match ? match : '';

    const commands = {
      npm: `npm install ${packageName}`,
      pip: `pip install ${packageName}`,
      apt: `sudo apt-get install -y ${packageName}`,
      brew: `brew install ${packageName}`
    };

    const command = commands[packageManager] || `npm install ${packageName}`;
    
    return {
      success: true,
      commandSequences: [{
        id: `install-${packageName}`,
        rank: 1,
        commands: [command],
        description: `Install ${packageName} using ${packageManager}`
      }]
    };
  }

  /**
   * Handle file creation automation
   * @param {string} input - User input
   * @param {Object} rule - Matched rule
   * @returns {Object} Automation result
   */
  async handleFileCreation(input, rule) {
    const match = input.match(rule.pattern);
    const filename = match && match ? match : '';
    
    // Generate AI-powered file content based on filename extension
    const extension = path.extname(filename).toLowerCase();
    const content = await this.generateFileContent(filename, extension);

    return {
      success: true,
      commandSequences: [{
        id: `create-${filename}`,
        rank: 1,
        commands: [`touch ${filename}`],
        description: `Create file ${filename}`,
        fileContent: content
      }]
    };
  }

  /**
   * Handle directory navigation automation
   * @param {string} input - User input
   * @param {Object} rule - Matched rule
   * @returns {Object} Automation result
   */
  async handleNavigation(input, rule) {
    const match = input.match(rule.pattern);
    const targetDir = match && match ? match : '';

    return {
      success: true,
      commandSequences: [{
        id: `nav-${targetDir}`,
        rank: 1,
        commands: [`cd ${targetDir}`],
        description: `Navigate to ${targetDir}`
      }]
    };
  }

  /**
   * Handle code generation automation
   * @param {string} input - User input
   * @param {Object} rule - Matched rule
   * @returns {Object} Automation result
   */
  async handleCodeGeneration(input, rule) {
    const match = input.match(rule.pattern);
    const language = match && match ? match.toLowerCase() : '';
    const description = match && match ? match : '';
    
    const filename = `script-${Date.now()}.${this.getLanguageExtension(language)}`;
    const content = await this.generateCodeContent(language, description);

    return {
      success: true,
      commandSequences: [{
        id: `code-${filename}`,
        rank: 1,
        commands: [`touch ${filename}`],
        description: `Generate ${language} code for ${description}`,
        fileContent: content
      }]
    };
  }

  /**
   * Generate file content based on extension
   * @param {string} filename - File name
   * @param {string} extension - File extension
   * @returns {Promise<string>} Generated content
   */
  async generateFileContent(filename, extension) {
    const templates = {
      '.js': '// JavaScript template\nmodule.exports = {};\n',
      '.py': '# Python template\nif __name__ == "__main__":\n    pass\n',
      '.txt': 'Generated text file\n',
      '.md': '# Generated Markdown\n\nContent placeholder\n',
      '.json': '{\n  "generated": true\n}\n'
    };

    const defaultContent = templates[extension] || '';
    
    // Request AI-generated content
    const aiResponse = await this.aiService.processQuery(
      `Generate content for a ${extension} file named ${filename}`,
      { biModalMode: true }
    );

    if (aiResponse.success) {
      const parsed = await this.aiService.responseParser.parseResponse(aiResponse.rawResponse, true);
      return parsed.commandSequences?.fileContent || defaultContent;
    }
    
    return defaultContent;
  }

  /**
   * Generate code content for specific language
   * @param {string} language - Programming language
   * @param {string} description - Code description
   * @returns {Promise<string>} Generated code
   */
  async generateCodeContent(language, description) {
    const aiResponse = await this.aiService.processQuery(
      `Generate ${language} code for: ${description}`,
      { biModalMode: true }
    );

    if (aiResponse.success) {
      const parsed = await this.aiService.responseParser.parseResponse(aiResponse.rawResponse, true);
      return parsed.commandSequences?.fileContent || this.getDefaultCode(language);
    }
    
    return this.getDefaultCode(language);
  }

  /**
   * Get default code template for a language
   * @param {string} language - Programming language
   * @returns {string} Default code template
   */
  getDefaultCode(language) {
    const templates = {
      javascript: '// JavaScript template\nfunction main() {\n  console.log("Hello, World!");\n}\n',
      python: '# Python template\ndef main():\n    print("Hello, World!")\n\nif __name__ == "__main__":\n    main()\n',
      bash: '#!/bin/bash\necho "Hello, World!"\n',
      ruby: '# Ruby template\nputs "Hello, World!"\n'
    };
    
    return templates[language.toLowerCase()] || '// Code template\n';
  }

  /**
   * Get file extension for a language
   * @param {string} language - Programming language
   * @returns {string} File extension
   */
  getLanguageExtension(language) {
    const extensions = {
      javascript: 'js',
      python: 'py',
      bash: 'sh',
      ruby: 'rb'
    };
    
    return extensions[language.toLowerCase()] || 'txt';
  }

  /**
   * Start the auto-accept loop for automated command execution
   */
  startAutoAcceptLoop() {
    if (this.isAutoAcceptRunning) return;

    this.isAutoAcceptRunning = true;
    
    setInterval(async () => {
      if (this.iterativeTaskQueue.length > 0 && global.autoAcceptMode) {
        const sequence = this.iterativeTaskQueue[0]; // Get the first sequence
        
        // Execute the sequence
        const result = await this.commandExecutor.executeSequence(sequence.commands, {
          fileContent: sequence.fileContent,
          stopOnError: true
        });

        // Update sequence status
        sequence.status = result.every(r => r.success) ? 'completed' : 'failed';
        
        // Notify renderer process
        if (global.mainWindow) {
          global.mainWindow.webContents.send('automation-update', {
            sequence,
            result
          });
        }

        // Remove completed sequence
        this.iterativeTaskQueue.shift();

        // Trigger next iteration if needed
        if (this.iterativeTaskQueue.length > 0 && global.mainWindow) {
          global.mainWindow.webContents.send('automation-next', this.iterativeTaskQueue[0]); // Pass the next sequence
        }
      }
    }, this.autoAcceptInterval);
  }

  learnSequence(input, sequence) {
    const projectType = this.commandExecutor.projectType || 'general';
    const key = `${projectType}:${input}`;
    this.learnedSequences.set(key, sequence);
  }

  getLearnedSequence(input) {
    const projectType = this.commandExecutor.projectType || 'general';
    const key = `${projectType}:${input}`;
    return this.learnedSequences.get(key);
  }

  async addAutomationRule(rule) {
    if (!rule.id || !rule.pattern || !rule.action) {
      throw new Error('Invalid rule format');
    }
    this.automationRules.set(rule.id, rule);
    const rulePath = path.join(this.rulesDirectory, `${rule.id}.js`);
    const content = `module.exports = ${JSON.stringify(rule, null, 2)};`;
    await fs.writeFile(rulePath, content);
  }

  async removeAutomationRule(ruleId) {
    this.automationRules.delete(ruleId);
    const rulePath = path.join(this.rulesDirectory, `${ruleId}.js`);
    try {
      await fs.unlink(rulePath);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  }
}

module.exports = AutomationEngine;
