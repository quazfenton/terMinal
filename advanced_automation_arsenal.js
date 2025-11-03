#!/usr/bin/env node
/**
 * Advanced Automation Arsenal for AI Terminal
 * 
 * This module provides a comprehensive backend toolkit for seamless AI-to-execution
 * translation, enabling the AI to perform complex computer automation tasks through
 * a rich set of pre-built tools and intelligent command routing.
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync, spawn, exec } = require('child_process');
const puppeteer = require('puppeteer');
const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');
const os = require('os');
const util = require('util');
const execAsync = util.promisify(exec);

// Import existing AI Terminal components
const AIService = require('./ai_service');
const CommandExecutor = require('./command_executor');
const SessionContext = require('./session_context');

/**
 * Advanced Automation Arsenal - Main orchestrator for AI-powered computer automation
 */
class AdvancedAutomationArsenal {
  constructor(options = {}) {
    this.options = {
      headless: options.headless !== false,
      timeout: options.timeout || 30000,
      maxConcurrency: options.maxConcurrency || 5,
      cacheEnabled: options.cacheEnabled !== false,
      ...options
    };
    
    // Initialize core components
    this.webAutomation = new WebAutomationEngine(this.options);
    this.fileIntelligence = new FileSystemIntelligence(this.options);
    this.networkTools = new NetworkToolkit(this.options);
    this.systemTools = new SystemToolkit(this.options);
    this.contentProcessor = new ContentProcessor(this.options);
    this.diffEngine = new DiffEngine(this.options);
    
    // Command cache for performance
    this.commandCache = new Map();
    this.executionHistory = [];
    
    // Initialize MCP-style tool registry
    this.toolRegistry = new Map();
    this.registerCoreTools();
  }

  /**
   * Register core automation tools with the AI Terminal
   */
  registerCoreTools() {
    // Web automation tools
    this.registerTool('web_scrape', {
      description: 'Extract content from web pages with intelligent parsing',
      schema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to scrape' },
          selector: { type: 'string', description: 'CSS selector for content extraction' },
          format: { type: 'string', enum: ['text', 'html', 'json'], default: 'text' }
        },
        required: ['url']
      },
      handler: this.webAutomation.scrapeContent.bind(this.webAutomation)
    });

    this.registerTool('web_download', {
      description: 'Download files from web URLs with progress tracking',
      schema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to download' },
          outputPath: { type: 'string', description: 'Local path to save file' },
          overwrite: { type: 'boolean', default: false }
        },
        required: ['url']
      },
      handler: this.networkTools.downloadFile.bind(this.networkTools)
    });

    // File system tools
    this.registerTool('smart_diff', {
      description: 'Generate intelligent diffs and apply patches to files',
      schema: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Path to file to modify' },
          changes: { type: 'string', description: 'Description of changes to make' },
          preview: { type: 'boolean', default: true }
        },
        required: ['filePath', 'changes']
      },
      handler: this.diffEngine.applyIntelligentDiff.bind(this.diffEngine)
    });

    this.registerTool('file_organize', {
      description: 'Intelligently organize files based on content and patterns',
      schema: {
        type: 'object',
        properties: {
          sourcePath: { type: 'string', description: 'Directory to organize' },
          strategy: { type: 'string', enum: ['type', 'date', 'content', 'smart'], default: 'smart' },
          dryRun: { type: 'boolean', default: true }
        },
        required: ['sourcePath']
      },
      handler: this.fileIntelligence.organizeFiles.bind(this.fileIntelligence)
    });

    // Content processing tools
    this.registerTool('content_generate', {
      description: 'Generate and insert content into files with AI assistance',
      schema: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'File to create or modify' },
          contentType: { type: 'string', description: 'Type of content to generate' },
          context: { type: 'string', description: 'Context or requirements for content' },
          insertMode: { type: 'string', enum: ['replace', 'append', 'prepend', 'insert'], default: 'replace' }
        },
        required: ['filePath', 'contentType', 'context']
      },
      handler: this.contentProcessor.generateContent.bind(this.contentProcessor)
    });

    // System automation tools
    this.registerTool('system_monitor', {
      description: 'Monitor system resources and processes',
      schema: {
        type: 'object',
        properties: {
          duration: { type: 'number', description: 'Monitoring duration in seconds', default: 60 },
          metrics: { type: 'array', items: { type: 'string' }, default: ['cpu', 'memory', 'disk'] }
        }
      },
      handler: this.systemTools.monitorSystem.bind(this.systemTools)
    });

    this.registerTool('process_automation', {
      description: 'Automate complex multi-step processes',
      schema: {
        type: 'object',
        properties: {
          workflow: { type: 'string', description: 'Workflow description or name' },
          parameters: { type: 'object', description: 'Workflow parameters' },
          async: { type: 'boolean', default: false }
        },
        required: ['workflow']
      },
      handler: this.executeWorkflow.bind(this)
    });
  }

  /**
   * Register a new tool with the arsenal
   */
  registerTool(name, definition) {
    this.toolRegistry.set(name, {
      name,
      ...definition,
      registeredAt: new Date().toISOString()
    });
  }

  /**
   * Process AI query and translate to executable commands
   */
  async processAIQuery(query, context = {}) {
    try {
      // Enhanced prompt engineering for command extraction
      const enhancedPrompt = this.buildEnhancedPrompt(query, context);
      
      // Check cache first
      const cacheKey = this.generateCacheKey(query, context);
      if (this.commandCache.has(cacheKey)) {
        return this.commandCache.get(cacheKey);
      }

      // Parse query for tool invocations and command sequences
      const parsedQuery = await this.parseQueryForTools(enhancedPrompt);
      
      // Execute the parsed commands
      const result = await this.executeCommandSequence(parsedQuery);
      
      // Cache successful results
      if (result.success) {
        this.commandCache.set(cacheKey, result);
      }
      
      // Store in execution history
      this.executionHistory.push({
        query,
        context,
        result,
        timestamp: new Date().toISOString()
      });
      
      return result;
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
        suggestions: this.generateErrorSuggestions(error, query)
      };
    }
  }

  /**
   * Build enhanced prompt with tool awareness and command schema
   */
  buildEnhancedPrompt(query, context) {
    const availableTools = Array.from(this.toolRegistry.keys()).join(', ');
    const systemInfo = {
      platform: os.platform(),
      cwd: process.cwd(),
      availableTools
    };

    return `
You are an AI assistant with access to a comprehensive automation arsenal. Your task is to translate natural language requests into executable command sequences.

AVAILABLE TOOLS: ${availableTools}

SYSTEM CONTEXT:
- Platform: ${systemInfo.platform}
- Current Directory: ${systemInfo.cwd}
- Session Context: ${JSON.stringify(context)}

RESPONSE FORMAT:
You must respond with a JSON object containing:
{
  "commands": [
    {
      "type": "tool" | "shell" | "file_operation",
      "tool": "tool_name" (if type is "tool"),
      "command": "shell_command" (if type is "shell"),
      "parameters": { /* tool parameters or file operation details */ },
      "description": "Human readable description of what this command does"
    }
  ],
  "explanation": "Brief explanation of the approach",
  "fileOperations": [
    {
      "action": "create" | "modify" | "delete",
      "path": "file_path",
      "content": "file_content" (for create/modify),
      "mode": "replace" | "append" | "prepend" | "insert_at_line"
    }
  ]
}

QUERY: ${query}

Focus on:
1. Breaking down complex tasks into atomic operations
2. Using appropriate tools for web scraping, file manipulation, content generation
3. Providing clear, executable command sequences
4. Including file operations for content creation/modification
5. Ensuring commands are safe and reversible where possible
`;
  }

  /**
   * Parse AI response for tool invocations and commands
   */
  async parseQueryForTools(prompt) {
    // This would integrate with your existing AI service
    const aiService = new AIService();
    const response = await aiService.processQuery(prompt, { 
      biModalMode: true,
      includeDirectoryContext: true 
    });

    if (!response.success) {
      throw new Error(`AI processing failed: ${response.error}`);
    }

    // Parse the structured response
    let parsedResponse;
    try {
      // Extract JSON from AI response
      const jsonMatch = response.rawResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[1]);
      } else {
        // Fallback parsing
        parsedResponse = this.fallbackParsing(response.rawResponse);
      }
    } catch (error) {
      throw new Error(`Failed to parse AI response: ${error.message}`);
    }

    return parsedResponse;
  }

  /**
   * Execute a sequence of commands and tool invocations
   */
  async executeCommandSequence(parsedQuery) {
    const results = {
      success: true,
      commands: [],
      fileOperations: [],
      outputs: [],
      errors: []
    };

    try {
      // Execute commands
      if (parsedQuery.commands) {
        for (const command of parsedQuery.commands) {
          const commandResult = await this.executeCommand(command);
          results.commands.push(commandResult);
          
          if (!commandResult.success) {
            results.success = false;
            results.errors.push(commandResult.error);
          }
        }
      }

      // Execute file operations
      if (parsedQuery.fileOperations) {
        for (const fileOp of parsedQuery.fileOperations) {
          const fileResult = await this.executeFileOperation(fileOp);
          results.fileOperations.push(fileResult);
          
          if (!fileResult.success) {
            results.success = false;
            results.errors.push(fileResult.error);
          }
        }
      }

      results.explanation = parsedQuery.explanation;
      
    } catch (error) {
      results.success = false;
      results.errors.push(error.message);
    }

    return results;
  }

  /**
   * Execute individual command (tool, shell, or file operation)
   */
  async executeCommand(command) {
    try {
      switch (command.type) {
        case 'tool':
          return await this.executeTool(command.tool, command.parameters);
          
        case 'shell':
          return await this.executeShellCommand(command.command);
          
        case 'file_operation':
          return await this.executeFileOperation(command.parameters);
          
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
   * Execute a registered tool
   */
  async executeTool(toolName, parameters) {
    const tool = this.toolRegistry.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    // Validate parameters against schema
    if (tool.schema) {
      const validation = this.validateParameters(parameters, tool.schema);
      if (!validation.valid) {
        throw new Error(`Invalid parameters: ${validation.errors.join(', ')}`);
      }
    }

    // Execute tool handler
    const result = await tool.handler(parameters);
    
    return {
      success: true,
      tool: toolName,
      parameters,
      result,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Execute shell command with enhanced safety
   */
  async executeShellCommand(command) {
    // Use existing command executor with safety checks
    const commandExecutor = new CommandExecutor();
    const result = await commandExecutor.executeCommand(command);
    
    return {
      success: result.success,
      command,
      output: result.output,
      error: result.error,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Execute file operations (create, modify, delete)
   */
  async executeFileOperation(operation) {
    try {
      switch (operation.action) {
        case 'create':
          await fs.writeFile(operation.path, operation.content || '');
          break;
          
        case 'modify':
          if (operation.mode === 'append') {
            await fs.appendFile(operation.path, operation.content);
          } else if (operation.mode === 'prepend') {
            const existing = await fs.readFile(operation.path, 'utf8').catch(() => '');
            await fs.writeFile(operation.path, operation.content + existing);
          } else {
            await fs.writeFile(operation.path, operation.content);
          }
          break;
          
        case 'delete':
          await fs.unlink(operation.path);
          break;
          
        default:
          throw new Error(`Unknown file operation: ${operation.action}`);
      }
      
      return {
        success: true,
        operation,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      return {
        success: false,
        operation,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Execute complex workflows
   */
  async executeWorkflow(parameters) {
    const { workflow, parameters: workflowParams, async: isAsync } = parameters;
    
    // Define common workflows
    const workflows = {
      'web_research': async (params) => {
        const results = [];
        for (const url of params.urls || []) {
          const content = await this.webAutomation.scrapeContent({ url });
          results.push({ url, content });
        }
        return results;
      },
      
      'file_backup': async (params) => {
        const backupPath = `${params.sourcePath}.backup.${Date.now()}`;
        await fs.copyFile(params.sourcePath, backupPath);
        return { backupPath };
      },
      
      'project_setup': async (params) => {
        const projectPath = params.projectName;
        await fs.mkdir(projectPath, { recursive: true });
        await fs.mkdir(path.join(projectPath, 'src'), { recursive: true });
        await fs.writeFile(path.join(projectPath, 'README.md'), `# ${params.projectName}\n\nProject description`);
        return { projectPath };
      }
    };
    
    const workflowHandler = workflows[workflow];
    if (!workflowHandler) {
      throw new Error(`Unknown workflow: ${workflow}`);
    }
    
    if (isAsync) {
      // Execute asynchronously
      setImmediate(() => workflowHandler(workflowParams));
      return { status: 'started', async: true };
    } else {
      const result = await workflowHandler(workflowParams);
      return { status: 'completed', result };
    }
  }

  /**
   * Generate cache key for query caching
   */
  generateCacheKey(query, context) {
    const combined = JSON.stringify({ query, context });
    return crypto.createHash('md5').update(combined).digest('hex');
  }

  /**
   * Validate parameters against JSON schema
   */
  validateParameters(parameters, schema) {
    // Simple validation - in production, use a proper JSON schema validator
    const errors = [];
    
    if (schema.required) {
      for (const required of schema.required) {
        if (!(required in parameters)) {
          errors.push(`Missing required parameter: ${required}`);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Fallback parsing for non-JSON AI responses
   */
  fallbackParsing(response) {
    // Extract commands using heuristics
    const commands = [];
    const fileOperations = [];
    
    // Look for common command patterns
    const commandPatterns = [
      /(?:run|execute|call)\s+(\w+)\s*\((.*?)\)/gi,
      /(?:create|write|save)\s+file\s+([^\s]+)\s+with\s+content:\s*(.*)/gi,
      /(?:download|fetch)\s+from\s+(https?:\/\/[^\s]+)/gi
    ];
    
    for (const pattern of commandPatterns) {
      let match;
      while ((match = pattern.exec(response)) !== null) {
        if (pattern.source.includes('file')) {
          fileOperations.push({
            action: 'create',
            path: match[1],
            content: match[2],
            mode: 'replace'
          });
        } else if (pattern.source.includes('download')) {
          commands.push({
            type: 'tool',
            tool: 'web_download',
            parameters: { url: match[1] },
            description: `Download from ${match[1]}`
          });
        }
      }
    }
    
    return {
      commands,
      fileOperations,
      explanation: 'Parsed using fallback heuristics'
    };
  }

  /**
   * Generate error suggestions
   */
  generateErrorSuggestions(error, query) {
    const suggestions = [];
    
    if (error.message.includes('Tool not found')) {
      suggestions.push('Check available tools with: list_tools()');
    }
    
    if (error.message.includes('Invalid parameters')) {
      suggestions.push('Review tool schema and provide required parameters');
    }
    
    if (error.message.includes('Permission denied')) {
      suggestions.push('Check file permissions or run with appropriate privileges');
    }
    
    return suggestions;
  }

  /**
   * Get available tools and their schemas
   */
  getAvailableTools() {
    const tools = {};
    for (const [name, tool] of this.toolRegistry.entries()) {
      tools[name] = {
        description: tool.description,
        schema: tool.schema,
        registeredAt: tool.registeredAt
      };
    }
    return tools;
  }

  /**
   * Get execution statistics
   */
  getExecutionStats() {
    return {
      totalExecutions: this.executionHistory.length,
      cacheHits: this.commandCache.size,
      availableTools: this.toolRegistry.size,
      recentExecutions: this.executionHistory.slice(-10)
    };
  }
}

module.exports = AdvancedAutomationArsenal;