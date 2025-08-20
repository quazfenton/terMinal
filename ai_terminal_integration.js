/**
 * AI Terminal Integration Layer
 * 
 * Integrates the advanced automation arsenal with the existing AI Terminal
 * architecture, providing seamless AI-to-execution translation and enhanced
 * command processing capabilities.
 */

const AdvancedAutomationArsenal = require('./advanced_automation_arsenal');
const EnhancedAIResponseParser = require('./enhanced_ai_response_parser');
const AIService = require('./ai_service');
const CommandExecutor = require('./command_executor');
const SessionContext = require('./session_context');

class AITerminalIntegration {
  constructor(options = {}) {
    this.options = {
      enableAdvancedParsing: options.enableAdvancedParsing !== false,
      enableToolIntegration: options.enableToolIntegration !== false,
      autoExecuteTools: options.autoExecuteTools || false,
      maxExecutionTime: options.maxExecutionTime || 300000, // 5 minutes
      ...options
    };
    
    // Initialize core components
    this.aiService = new AIService();
    this.commandExecutor = new CommandExecutor();
    this.arsenal = new AdvancedAutomationArsenal();
    this.enhancedParser = new EnhancedAIResponseParser();
    
    // Execution queue and state management
    this.executionQueue = [];
    this.activeExecutions = new Map();
    this.executionHistory = [];
    
    // Integration hooks
    this.hooks = {
      preExecution: [],
      postExecution: [],
      onError: [],
      onSuccess: []
    };
    
    this.initializeIntegration();
  }

  /**
   * Initialize integration between components
   */
  initializeIntegration() {
    // Enhance AI service with tool awareness
    this.enhanceAIService();
    
    // Extend command executor with tool support
    this.extendCommandExecutor();
    
    // Set up event listeners
    this.setupEventListeners();
    
    console.log('AI Terminal Integration initialized with advanced automation capabilities');
  }

  /**
   * Enhanced query processing with full automation arsenal
   */
  async processEnhancedQuery(query, context = {}) {
    const executionId = this.generateExecutionId();
    const startTime = Date.now();
    
    try {
      // Add execution to active tracking
      this.activeExecutions.set(executionId, {
        query,
        context,
        startTime,
        status: 'processing'
      });

      // Step 1: Enhanced AI processing with tool awareness
      const aiResponse = await this.processAIWithToolContext(query, context);
      
      if (!aiResponse.success) {
        throw new Error(`AI processing failed: ${aiResponse.error}`);
      }

      // Step 2: Enhanced parsing with multiple strategies
      const parseResult = await this.enhancedParser.parseResponse(aiResponse.rawResponse, context);
      
      if (!parseResult.success) {
        throw new Error('Failed to parse AI response into executable commands');
      }

      // Step 3: Execute parsed commands and tools
      const executionResult = await this.executeEnhancedCommands(parseResult, executionId);

      // Step 4: Post-process and format results
      const finalResult = await this.postProcessResults(executionResult, parseResult, context);

      // Update execution tracking
      this.activeExecutions.get(executionId).status = 'completed';
      this.activeExecutions.get(executionId).result = finalResult;

      // Add to history
      this.executionHistory.push({
        executionId,
        query,
        context,
        result: finalResult,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      });

      // Trigger success hooks
      await this.triggerHooks('onSuccess', { executionId, result: finalResult });

      return finalResult;

    } catch (error) {
      // Update execution tracking
      if (this.activeExecutions.has(executionId)) {
        this.activeExecutions.get(executionId).status = 'failed';
        this.activeExecutions.get(executionId).error = error.message;
      }

      // Trigger error hooks
      await this.triggerHooks('onError', { executionId, error });

      return {
        success: false,
        error: error.message,
        executionId,
        suggestions: this.generateErrorSuggestions(error, query)
      };
    } finally {
      // Clean up active execution after delay
      setTimeout(() => {
        this.activeExecutions.delete(executionId);
      }, 60000); // Keep for 1 minute for status queries
    }
  }

  /**
   * Process AI query with enhanced tool context
   */
  async processAIWithToolContext(query, context) {
    // Build enhanced context with available tools
    const toolContext = {
      ...context,
      availableTools: this.arsenal.getAvailableTools(),
      systemCapabilities: await this.getSystemCapabilities(),
      sessionHistory: SessionContext.get('recentCommands', []),
      currentDirectory: this.commandExecutor.getCurrentDirectory()
    };

    // Enhanced prompt with tool integration instructions
    const enhancedPrompt = this.buildToolAwarePrompt(query, toolContext);

    return await this.aiService.processQuery(enhancedPrompt, {
      biModalMode: true,
      includeDirectoryContext: true,
      toolIntegration: true
    });
  }

  /**
   * Build tool-aware prompt for AI
   */
  buildToolAwarePrompt(query, context) {
    const availableTools = Object.keys(context.availableTools).join(', ');
    
    return `You are an AI assistant with access to a comprehensive automation arsenal. 
Your task is to translate the user's request into executable commands and tool invocations.

AVAILABLE TOOLS: ${availableTools}

SYSTEM CONTEXT:
- Current Directory: ${context.currentDirectory}
- Platform: ${process.platform}
- Available Tools: ${availableTools}

RESPONSE REQUIREMENTS:
Respond with a JSON object containing:
{
  "commands": [
    {
      "type": "shell" | "tool" | "file_operation",
      "command": "shell_command" (for shell type),
      "tool": "tool_name" (for tool type),
      "parameters": { /* parameters object */ },
      "description": "What this command does"
    }
  ],
  "fileOperations": [
    {
      "action": "create" | "modify" | "delete",
      "path": "file_path",
      "content": "file_content",
      "mode": "replace" | "append" | "prepend"
    }
  ],
  "explanation": "Brief explanation of the approach"
}

TOOL USAGE GUIDELINES:
- Use web_scrape for extracting content from websites
- Use web_download for downloading files from URLs
- Use smart_diff for intelligent file modifications
- Use content_generate for creating new files with AI-generated content
- Use file_organize for organizing files and directories
- Use system_monitor for monitoring system resources
- Use process_automation for complex multi-step workflows

USER REQUEST: ${query}

Focus on providing practical, executable solutions using the available tools and commands.`;
  }

  /**
   * Execute enhanced commands with tool integration
   */
  async executeEnhancedCommands(parseResult, executionId) {
    const results = {
      success: true,
      executionId,
      commands: [],
      fileOperations: [],
      toolInvocations: [],
      outputs: [],
      errors: []
    };

    // Execute pre-execution hooks
    await this.triggerHooks('preExecution', { parseResult, executionId });

    try {
      // Execute shell commands
      if (parseResult.commands) {
        for (const command of parseResult.commands) {
          const commandResult = await this.executeCommand(command, executionId);
          results.commands.push(commandResult);
          
          if (!commandResult.success) {
            results.success = false;
            results.errors.push(commandResult.error);
          }
        }
      }

      // Execute file operations
      if (parseResult.fileOperations) {
        for (const fileOp of parseResult.fileOperations) {
          const fileResult = await this.executeFileOperation(fileOp, executionId);
          results.fileOperations.push(fileResult);
          
          if (!fileResult.success) {
            results.success = false;
            results.errors.push(fileResult.error);
          }
        }
      }

      // Execute tool invocations
      if (parseResult.toolInvocations) {
        for (const toolInvocation of parseResult.toolInvocations) {
          const toolResult = await this.executeToolInvocation(toolInvocation, executionId);
          results.toolInvocations.push(toolResult);
          
          if (!toolResult.success) {
            results.success = false;
            results.errors.push(toolResult.error);
          }
        }
      }

    } catch (error) {
      results.success = false;
      results.errors.push(error.message);
    }

    // Execute post-execution hooks
    await this.triggerHooks('postExecution', { results, executionId });

    return results;
  }

  /**
   * Execute individual command with enhanced capabilities
   */
  async executeCommand(command, executionId) {
    try {
      switch (command.type) {
        case 'shell':
          return await this.commandExecutor.executeCommand(command.command);
          
        case 'tool':
          return await this.arsenal.executeTool(command.tool, command.parameters);
          
        case 'file_operation':
          return await this.executeFileOperation(command.parameters, executionId);
          
        default:
          throw new Error(`Unknown command type: ${command.type}`);
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        command
      };
    }
  }

  /**
   * Execute file operation
   */
  async executeFileOperation(fileOp, executionId) {
    try {
      // Use content processor for intelligent file operations
      if (fileOp.action === 'create' && fileOp.content) {
        return await this.arsenal.contentProcessor.generateContent({
          filePath: fileOp.path,
          contentType: this.detectContentType(fileOp.path),
          context: fileOp.content,
          insertMode: fileOp.mode || 'replace'
        });
      } else {
        // Use basic file operations
        return await this.arsenal.executeFileOperation(fileOp);
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        fileOperation: fileOp
      };
    }
  }

  /**
   * Execute tool invocation
   */
  async executeToolInvocation(toolInvocation, executionId) {
    try {
      return await this.arsenal.executeTool(toolInvocation.tool, toolInvocation.parameters);
    } catch (error) {
      return {
        success: false,
        error: error.message,
        toolInvocation
      };
    }
  }

  /**
   * Post-process execution results
   */
  async postProcessResults(executionResult, parseResult, context) {
    const processedResult = {
      ...executionResult,
      summary: this.generateExecutionSummary(executionResult),
      recommendations: this.generateRecommendations(executionResult, context),
      nextSteps: this.suggestNextSteps(executionResult, parseResult),
      timestamp: new Date().toISOString()
    };

    // Update session context with results
    SessionContext.set('lastExecution', {
      result: processedResult,
      timestamp: new Date().toISOString()
    });

    return processedResult;
  }

  /**
   * Generate execution summary
   */
  generateExecutionSummary(executionResult) {
    const totalOperations = 
      executionResult.commands.length + 
      executionResult.fileOperations.length + 
      executionResult.toolInvocations.length;

    const successfulOperations = 
      executionResult.commands.filter(c => c.success).length +
      executionResult.fileOperations.filter(f => f.success).length +
      executionResult.toolInvocations.filter(t => t.success).length;

    return {
      totalOperations,
      successfulOperations,
      failedOperations: totalOperations - successfulOperations,
      successRate: totalOperations > 0 ? (successfulOperations / totalOperations) * 100 : 0,
      hasErrors: executionResult.errors.length > 0
    };
  }

  /**
   * Generate recommendations based on execution results
   */
  generateRecommendations(executionResult, context) {
    const recommendations = [];

    if (executionResult.errors.length > 0) {
      recommendations.push({
        type: 'error_resolution',
        message: 'Some operations failed. Review error messages and retry if needed.',
        priority: 'high'
      });
    }

    if (executionResult.fileOperations.length > 0) {
      recommendations.push({
        type: 'file_backup',
        message: 'Consider creating backups before making file modifications.',
        priority: 'medium'
      });
    }

    if (executionResult.toolInvocations.length > 0) {
      recommendations.push({
        type: 'tool_optimization',
        message: 'Review tool outputs for optimization opportunities.',
        priority: 'low'
      });
    }

    return recommendations;
  }

  /**
   * Suggest next steps
   */
  suggestNextSteps(executionResult, parseResult) {
    const suggestions = [];

    if (executionResult.success) {
      suggestions.push('Review the execution results and verify outputs');
      
      if (executionResult.fileOperations.length > 0) {
        suggestions.push('Check created/modified files for correctness');
      }
      
      if (executionResult.toolInvocations.length > 0) {
        suggestions.push('Review tool outputs and consider follow-up actions');
      }
    } else {
      suggestions.push('Review error messages and fix issues');
      suggestions.push('Consider breaking down complex operations into smaller steps');
    }

    return suggestions;
  }

  /**
   * Enhance AI service with tool awareness
   */
  enhanceAIService() {
    const originalProcessQuery = this.aiService.processQuery.bind(this.aiService);
    
    this.aiService.processQuery = async (query, options = {}) => {
      if (options.toolIntegration) {
        // Add tool context to the query
        const toolContext = {
          availableTools: this.arsenal.getAvailableTools(),
          recentExecutions: this.executionHistory.slice(-5)
        };
        
        options.toolContext = toolContext;
      }
      
      return await originalProcessQuery(query, options);
    };
  }

  /**
   * Extend command executor with tool support
   */
  extendCommandExecutor() {
    const originalExecuteCommand = this.commandExecutor.executeCommand.bind(this.commandExecutor);
    
    this.commandExecutor.executeCommand = async (command, options = {}) => {
      // Check if this is a tool invocation
      if (options.toolInvocation) {
        return await this.arsenal.executeTool(options.tool, options.parameters);
      }
      
      return await originalExecuteCommand(command, options);
    };
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Listen for session context changes
    // This would integrate with your existing event system
    
    // Listen for command executor events
    // This would integrate with your existing event system
  }

  /**
   * Get system capabilities
   */
  async getSystemCapabilities() {
    return {
      platform: process.platform,
      nodeVersion: process.version,
      availableCommands: await this.getAvailableCommands(),
      installedPackages: await this.getInstalledPackages(),
      systemResources: await this.getSystemResources()
    };
  }

  /**
   * Get available system commands
   */
  async getAvailableCommands() {
    const commonCommands = ['ls', 'cd', 'pwd', 'mkdir', 'touch', 'rm', 'cp', 'mv', 'grep', 'find'];
    const availableCommands = [];
    
    for (const cmd of commonCommands) {
      try {
        await this.commandExecutor.executeCommand(`which ${cmd}`);
        availableCommands.push(cmd);
      } catch (error) {
        // Command not available
      }
    }
    
    return availableCommands;
  }

  /**
   * Get installed packages
   */
  async getInstalledPackages() {
    try {
      const result = await this.commandExecutor.executeCommand('npm list -g --depth=0');
      return result.success ? result.output : 'Unable to determine installed packages';
    } catch (error) {
      return 'Unable to determine installed packages';
    }
  }

  /**
   * Get system resources
   */
  async getSystemResources() {
    const os = require('os');
    return {
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      cpuCount: os.cpus().length,
      loadAverage: os.loadavg(),
      uptime: os.uptime()
    };
  }

  /**
   * Add execution hook
   */
  addHook(type, handler) {
    if (this.hooks[type]) {
      this.hooks[type].push(handler);
    }
  }

  /**
   * Trigger hooks
   */
  async triggerHooks(type, data) {
    if (this.hooks[type]) {
      for (const handler of this.hooks[type]) {
        try {
          await handler(data);
        } catch (error) {
          console.error(`Hook execution failed (${type}):`, error);
        }
      }
    }
  }

  /**
   * Generate execution ID
   */
  generateExecutionId() {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Detect content type from file path
   */
  detectContentType(filePath) {
    const ext = filePath.split('.').pop().toLowerCase();
    const typeMap = {
      'js': 'javascript',
      'py': 'python',
      'html': 'html',
      'css': 'css',
      'json': 'json',
      'md': 'markdown'
    };
    return typeMap[ext] || 'text';
  }

  /**
   * Generate error suggestions
   */
  generateErrorSuggestions(error, query) {
    const suggestions = [];
    
    if (error.message.includes('Tool not found')) {
      suggestions.push('Check available tools with getAvailableTools()');
    }
    
    if (error.message.includes('Permission denied')) {
      suggestions.push('Check file permissions or run with appropriate privileges');
    }
    
    if (error.message.includes('Command not found')) {
      suggestions.push('Verify the command is installed and available in PATH');
    }
    
    return suggestions;
  }

  /**
   * Get integration statistics
   */
  getStats() {
    return {
      activeExecutions: this.activeExecutions.size,
      totalExecutions: this.executionHistory.length,
      availableTools: Object.keys(this.arsenal.getAvailableTools()).length,
      registeredHooks: Object.values(this.hooks).reduce((sum, hooks) => sum + hooks.length, 0),
      queuedExecutions: this.executionQueue.length
    };
  }

  /**
   * Get execution status
   */
  getExecutionStatus(executionId) {
    return this.activeExecutions.get(executionId) || null;
  }

  /**
   * Get execution history
   */
  getExecutionHistory(limit = 10) {
    return this.executionHistory.slice(-limit);
  }
}

module.exports = AITerminalIntegration;