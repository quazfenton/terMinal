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
    this.autoAcceptInterval = 15000; // 15 seconds in milliseconds
    this.isAutoAcceptRunning = false;
    this.iterativeTaskQueue = [];
    this.learnedSequences = new Map();
  }

  /**
   * Initialize the automation engine with default rules
   */
  async initialize() {
    await this.loadDefaultRules();
    this.startAutoAcceptLoop();
  }

  /**
   * Load default automation rules
   */
  async loadDefaultRules() {
    const defaultRules = [
      {
        id: 'auto-install',
        pattern: /install\s+(npm|pip|apt|brew)\s+(\S+)/i,
        action: this.handlePackageInstall.bind(this),
        priority: 1
      },
      {
        id: 'file-creation',
        pattern: /(?:create|write|generate)\s+(?:file|document)\s+(\S+)/i,
        action: this.handleFileCreation.bind(this),
        priority: 2
      },
      {
        id: 'directory-navigation',
        pattern: /(?:go\s+to|navigate\s+to|cd)\s+(\S+)/i,
        action: this.handleNavigation.bind(this),
        priority: 3
      },
      {
        id: 'code-generation',
        pattern: /(?:write|generate)\s+(?:code|script)\s+(?:in\s+)?(\w+)\s+(?:for\s+)?(.+)/i,
        action: this.handleCodeGeneration.bind(this),
        priority: 4
      },
      // New Git automation rules
      {
        id: 'git-init',
        pattern: /(?:initialize|create)\s+git\s+repository/i,
        action: this.handleGitInit.bind(this),
        priority: 2
      },
      {
        id: 'git-add',
        pattern: /(?:add|stage)\s+files?\s+to\s+git/i,
        action: this.handleGitAdd.bind(this),
        priority: 3
      },
      {
        id: 'git-commit',
        pattern: /commit\s+changes?\s+(?:with\s+message\s+)?(["'])(.*?)\1/i,
        action: this.handleGitCommit.bind(this),
        priority: 4
      },
      {
        id: 'git-push',
        pattern: /push\s+(?:changes|commits)\s+to\s+remote/i,
        action: this.handleGitPush.bind(this),
        priority: 5
      }
    ];

    defaultRules.forEach(rule => this.automationRules.set(rule.id, rule));
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
    const message = match[2] || "Automated commit by AI Terminal";
    
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
      // Check for matching automation rule
      const ruleMatch = this.findMatchingRule(input);
      if (ruleMatch) {
        return await ruleMatch.action(input, ruleMatch);
      }
      
      // Check learned sequences
      for (const [key, sequence] of this.learnedSequences) {
        if (input.includes(key)) {
          return {
            success: true,
            commandSequences: [sequence],
            explanation: `Using learned sequence for "${key}"`
          };
        }
      }

      // Fallback to AI processing
      const aiResponse = await this.aiService.processQuery(input, {
        biModalMode: true,
        includeDirectoryContext: true
      });

      if (!aiResponse.success) {
        return {
          success: false,
          error: aiResponse.error
        };
      }

      const parsedResponse = await this.parseAutomationResponse(aiResponse.rawResponse);
      
      // Store successful sequences for future use
      if (parsedResponse.success && parsedResponse.commandSequences.length > 0) {
        const key = input.split(' ').slice(0, 3).join(' '); // Use first 3 words as key
        this.learnedSequences.set(key, parsedResponse.commandSequences[0]);
      }
      
      this.iterativeTaskQueue.push(...parsedResponse.commandSequences);
      return parsedResponse;
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Find matching automation rule
   * @param {string} input - User's input
   * @returns {Object|null} Matching rule or null
   */
  findMatchingRule(input) {
    for (const rule of this.automationRules.values()) {
      if (rule.pattern.test(input)) {
        return rule;
      }
    }
    return null;
  }

  /**
   * Parse AI response for automation
   * @param {string} rawResponse - Raw AI response
   * @returns {Object} Parsed automation response
   */
  async parseAutomationResponse(rawResponse) {
    const parser = new AIResponseParser();
    const parsed = parser.parseResponse(rawResponse, true);
    
    // Enhance sequences with automation metadata
    parsed.commandSequences = parsed.commandSequences.map((seq, index) => ({
      ...seq,
      automationId: `auto-${index}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      status: 'pending'
    }));

    return parsed;
  }

  /**
   * Handle package installation automation
   * @param {string} input - User input
   * @param {Object} rule - Matched rule
   * @returns {Object} Automation result
   */
  async handlePackageInstall(input, rule) {
    const match = input.match(rule.pattern);
    const packageManager = match[1].toLowerCase();
    const packageName = match[2];

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
    const filename = match[1];
    
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
    const targetDir = match[1];

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
    const language = match[1].toLowerCase();
    const description = match[2];
    
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
      const parsed = await this.parseAutomationResponse(aiResponse.rawResponse);
      return parsed.commandSequences[0]?.fileContent || defaultContent;
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
      const parsed = await this.parseAutomationResponse(aiResponse.rawResponse);
      return parsed.commandSequences[0]?.fileContent || this.getDefaultCode(language);
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
        const sequence = this.iterativeTaskQueue[0];
        const result = await this.commandExecutor.executeSequence(sequence.commands, {
          fileContent: sequence.fileContent,
          stopOnError: true
        });

        // Update sequence status
        sequence.status = result.every(r => r.success) ? 'completed' : 'failed';
        
        // Notify renderer process
        global.mainWindow.webContents.send('automation-update', {
          sequence,
          result
        });

        // Remove completed sequence
        this.iterativeTaskQueue.shift();

        // Trigger next iteration if needed
        if (this.iterativeTaskQueue.length > 0) {
          global.mainWindow.webContents.send('automation-next', this.iterativeTaskQueue[0]);
        }
      }
    }, this.autoAcceptInterval);
  }

  /**
   * Add custom automation rule
   * @param {Object} rule - Custom rule object
   */
  addAutomationRule(rule) {
    if (!rule.id || !rule.pattern || !rule.action) {
      throw new Error('Invalid rule format');
    }
    this.automationRules.set(rule.id, rule);
  }

  /**
   * Remove automation rule
   * @param {string} ruleId - Rule ID to remove
   */
  removeAutomationRule(ruleId) {
    this.automationRules.delete(ruleId);
  }
}

module.exports = AutomationEngine;