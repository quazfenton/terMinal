/**
 * Enhanced AI Response Parser
 * 
 * Advanced parser that integrates with the automation arsenal to provide
 * seamless AI-to-execution translation with comprehensive command extraction,
 * tool invocation parsing, and intelligent fallback mechanisms.
 */

const AdvancedAutomationArsenal = require('./advanced_automation_arsenal');

class EnhancedAIResponseParser {
  constructor(options = {}) {
    this.options = {
      strictMode: options.strictMode || false,
      enableFallbacks: options.enableFallbacks !== false,
      maxCommandSequences: options.maxCommandSequences || 10,
      toolTimeout: options.toolTimeout || 30000,
      ...options
    };
    
    this.arsenal = new AdvancedAutomationArsenal();
    this.parsingStrategies = [
      this.parseStructuredJSON.bind(this),
      this.parseCodeBlocks.bind(this),
      this.parseToolInvocations.bind(this),
      this.parseNaturalLanguage.bind(this),
      this.parseFallback.bind(this)
    ];
    
    this.commandPatterns = this.initializeCommandPatterns();
    this.toolPatterns = this.initializeToolPatterns();
  }

  /**
   * Initialize command extraction patterns
   */
  initializeCommandPatterns() {
    return {
      // Shell commands
      shell: [
        /```(?:bash|shell|sh)\s*([\s\S]*?)\s*```/gi,
        /`([^`]+)`/g,
        /(?:run|execute|command):\s*([^\n]+)/gi
      ],
      
      // File operations
      fileOps: [
        /(?:create|write|save)\s+(?:file\s+)?([^\s]+)(?:\s+with\s+content)?:\s*([\s\S]*?)(?=\n\n|\n(?:[A-Z]|$)|$)/gi,
        /(?:edit|modify|update)\s+(?:file\s+)?([^\s]+):\s*([\s\S]*?)(?=\n\n|\n(?:[A-Z]|$)|$)/gi,
        /(?:delete|remove)\s+(?:file\s+)?([^\s]+)/gi
      ],
      
      // Tool invocations
      tools: [
        /(?:use|call|invoke)\s+tool\s+(\w+)\s*\((.*?)\)/gi,
        /(\w+)\s*\((.*?)\)\s*->\s*(.*)/gi,
        /@(\w+)\s*\((.*?)\)/gi
      ],
      
      // Web operations
      web: [
        /(?:scrape|fetch|download)\s+(?:from\s+)?(https?:\/\/[^\s]+)/gi,
        /(?:visit|navigate|goto)\s+(https?:\/\/[^\s]+)/gi,
        /(?:search|find)\s+on\s+(https?:\/\/[^\s]+)\s+for\s+(.+)/gi
      ],
      
      // System operations
      system: [
        /(?:monitor|watch|track)\s+(.+?)(?:\s+for\s+(\d+)\s*(?:seconds?|minutes?|hours?))?/gi,
        /(?:install|setup|configure)\s+(.+)/gi,
        /(?:start|stop|restart)\s+(.+)/gi
      ]
    };
  }

  /**
   * Initialize tool invocation patterns
   */
  initializeToolPatterns() {
    const availableTools = this.arsenal.getAvailableTools();
    const toolNames = Object.keys(availableTools);
    
    return {
      explicit: new RegExp(`(${toolNames.join('|')})\\s*\\(([^)]*)\\)`, 'gi'),
      implicit: new RegExp(`(?:use|call|invoke)\\s+(${toolNames.join('|')})(?:\\s+with\\s+(.+?))?(?=\\.|\\n|$)`, 'gi'),
      structured: /tool:\s*(\w+)\s*(?:params?|parameters?):\s*({.*?})/gi
    };
  }

  /**
   * Main parsing method - tries multiple strategies
   */
  async parseResponse(aiResponse, context = {}) {
    const parseResult = {
      success: false,
      commands: [],
      fileOperations: [],
      toolInvocations: [],
      explanation: '',
      confidence: 0,
      strategy: null,
      errors: []
    };

    // Try each parsing strategy in order
    for (const strategy of this.parsingStrategies) {
      try {
        const result = await strategy(aiResponse, context);
        
        if (result.success && result.confidence > parseResult.confidence) {
          Object.assign(parseResult, result);
          
          // If we have high confidence, stop trying other strategies
          if (result.confidence >= 0.8) {
            break;
          }
        }
      } catch (error) {
        parseResult.errors.push({
          strategy: strategy.name,
          error: error.message
        });
      }
    }

    // Post-process and validate results
    if (parseResult.success) {
      parseResult.commands = await this.validateAndEnhanceCommands(parseResult.commands);
      parseResult.fileOperations = this.validateFileOperations(parseResult.fileOperations);
      parseResult.toolInvocations = await this.validateToolInvocations(parseResult.toolInvocations);
    }

    return parseResult;
  }

  /**
   * Parse structured JSON responses
   */
  async parseStructuredJSON(aiResponse, context) {
    const jsonMatches = aiResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/g);
    
    if (!jsonMatches) {
      // Try to find JSON without code blocks
      const directJsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (!directJsonMatch) {
        return { success: false, confidence: 0 };
      }
      jsonMatches = [directJsonMatch[0]];
    }

    for (const jsonBlock of jsonMatches) {
      try {
        const cleanJson = jsonBlock.replace(/```(?:json)?\s*|\s*```/g, '');
        const parsed = JSON.parse(cleanJson);
        
        if (this.isValidCommandStructure(parsed)) {
          return {
            success: true,
            confidence: 0.9,
            strategy: 'structured_json',
            commands: parsed.commands || [],
            fileOperations: parsed.fileOperations || [],
            toolInvocations: parsed.toolInvocations || [],
            explanation: parsed.explanation || ''
          };
        }
      } catch (error) {
        continue; // Try next JSON block
      }
    }

    return { success: false, confidence: 0 };
  }

  /**
   * Parse code blocks for commands
   */
  async parseCodeBlocks(aiResponse, context) {
    const commands = [];
    const fileOperations = [];
    
    // Extract shell commands from code blocks
    const shellBlocks = aiResponse.match(/```(?:bash|shell|sh)\s*([\s\S]*?)\s*```/gi);
    if (shellBlocks) {
      for (const block of shellBlocks) {
        const cleanBlock = block.replace(/```(?:bash|shell|sh)?\s*|\s*```/gi, '');
        const commandLines = cleanBlock.split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#'));
        
        for (const cmd of commandLines) {
          commands.push({
            type: 'shell',
            command: cmd,
            description: `Execute shell command: ${cmd}`
          });
        }
      }
    }

    // Extract file operations from various patterns
    const fileCreatePattern = /(?:create|write)\s+file\s+([^\s]+)(?:\s+with\s+content)?:\s*([\s\S]*?)(?=\n\n|\n(?:[A-Z]|$)|$)/gi;
    let fileMatch;
    while ((fileMatch = fileCreatePattern.exec(aiResponse)) !== null) {
      fileOperations.push({
        action: 'create',
        path: fileMatch[1],
        content: fileMatch[2].trim(),
        mode: 'replace'
      });
    }

    const confidence = (commands.length + fileOperations.length) > 0 ? 0.7 : 0;
    
    return {
      success: confidence > 0,
      confidence,
      strategy: 'code_blocks',
      commands,
      fileOperations,
      toolInvocations: [],
      explanation: 'Extracted from code blocks and file operation patterns'
    };
  }

  /**
   * Parse explicit tool invocations
   */
  async parseToolInvocations(aiResponse, context) {
    const toolInvocations = [];
    const commands = [];
    
    // Parse explicit tool calls
    const explicitMatches = [...aiResponse.matchAll(this.toolPatterns.explicit)];
    for (const match of explicitMatches) {
      const toolName = match[1];
      const paramsStr = match[2];
      
      try {
        const params = this.parseToolParameters(paramsStr);
        toolInvocations.push({
          tool: toolName,
          parameters: params,
          description: `Invoke ${toolName} tool`
        });
      } catch (error) {
        // Invalid parameters, skip
      }
    }

    // Parse implicit tool usage
    const implicitMatches = [...aiResponse.matchAll(this.toolPatterns.implicit)];
    for (const match of implicitMatches) {
      const toolName = match[1];
      const contextStr = match[2] || '';
      
      const params = this.inferToolParameters(toolName, contextStr, context);
      toolInvocations.push({
        tool: toolName,
        parameters: params,
        description: `Use ${toolName} tool with inferred parameters`
      });
    }

    // Convert tool invocations to commands
    for (const invocation of toolInvocations) {
      commands.push({
        type: 'tool',
        tool: invocation.tool,
        parameters: invocation.parameters,
        description: invocation.description
      });
    }

    const confidence = toolInvocations.length > 0 ? 0.8 : 0;
    
    return {
      success: confidence > 0,
      confidence,
      strategy: 'tool_invocations',
      commands,
      fileOperations: [],
      toolInvocations,
      explanation: 'Extracted explicit and implicit tool invocations'
    };
  }

  /**
   * Parse natural language for command intent
   */
  async parseNaturalLanguage(aiResponse, context) {
    const commands = [];
    const fileOperations = [];
    const toolInvocations = [];
    
    // Web operations
    const webMatches = [...aiResponse.matchAll(this.commandPatterns.web[0])];
    for (const match of webMatches) {
      const url = match[1];
      const action = match[0].toLowerCase().includes('download') ? 'web_download' : 'web_scrape';
      
      toolInvocations.push({
        tool: action,
        parameters: { url },
        description: `${action} from ${url}`
      });
    }

    // File operations from natural language
    const sentences = aiResponse.split(/[.!?]+/).map(s => s.trim()).filter(s => s);
    for (const sentence of sentences) {
      if (/create.*file|write.*to.*file|save.*as/i.test(sentence)) {
        const fileMatch = sentence.match(/(?:create|write|save).*?(?:file\s+)?([^\s]+)/i);
        if (fileMatch) {
          fileOperations.push({
            action: 'create',
            path: fileMatch[1],
            content: this.extractContentFromSentence(sentence),
            mode: 'replace'
          });
        }
      }
      
      if (/install|setup|configure/i.test(sentence)) {
        const packageMatch = sentence.match(/(?:install|setup|configure)\s+([^\s]+)/i);
        if (packageMatch) {
          commands.push({
            type: 'shell',
            command: `npm install ${packageMatch[1]}`,
            description: `Install ${packageMatch[1]}`
          });
        }
      }
    }

    const totalOperations = commands.length + fileOperations.length + toolInvocations.length;
    const confidence = totalOperations > 0 ? 0.6 : 0;
    
    return {
      success: confidence > 0,
      confidence,
      strategy: 'natural_language',
      commands,
      fileOperations,
      toolInvocations,
      explanation: 'Extracted from natural language patterns'
    };
  }

  /**
   * Fallback parsing using heuristics
   */
  async parseFallback(aiResponse, context) {
    const commands = [];
    const fileOperations = [];
    
    // Look for any command-like patterns
    const lines = aiResponse.split('\n').map(line => line.trim()).filter(line => line);
    
    for (const line of lines) {
      // Skip explanatory text
      if (line.length > 100 || /^[A-Z][^.]*[.!?]$/.test(line)) {
        continue;
      }
      
      // Look for command-like patterns
      if (/^[a-z]+\s+/.test(line) && !line.includes(' the ') && !line.includes(' and ')) {
        commands.push({
          type: 'shell',
          command: line,
          description: `Potential command: ${line}`
        });
      }
    }

    // Look for file mentions
    const filePattern = /([^\s]+\.[a-z]{2,4})/gi;
    const fileMatches = [...aiResponse.matchAll(filePattern)];
    
    if (fileMatches.length > 0 && commands.length === 0) {
      // If we found files but no commands, suggest creating them
      for (const match of fileMatches.slice(0, 3)) { // Limit to 3 files
        fileOperations.push({
          action: 'create',
          path: match[1],
          content: `// TODO: Implement ${match[1]}`,
          mode: 'replace'
        });
      }
    }

    const confidence = (commands.length + fileOperations.length) > 0 ? 0.3 : 0;
    
    return {
      success: confidence > 0,
      confidence,
      strategy: 'fallback',
      commands,
      fileOperations,
      toolInvocations: [],
      explanation: 'Extracted using fallback heuristics'
    };
  }

  /**
   * Validate command structure
   */
  isValidCommandStructure(parsed) {
    return (
      typeof parsed === 'object' &&
      (Array.isArray(parsed.commands) || 
       Array.isArray(parsed.fileOperations) || 
       Array.isArray(parsed.toolInvocations))
    );
  }

  /**
   * Parse tool parameters from string
   */
  parseToolParameters(paramsStr) {
    if (!paramsStr.trim()) {
      return {};
    }
    
    try {
      // Try JSON parsing first
      return JSON.parse(`{${paramsStr}}`);
    } catch (error) {
      // Parse as key-value pairs
      const params = {};
      const pairs = paramsStr.split(',').map(p => p.trim());
      
      for (const pair of pairs) {
        const [key, ...valueParts] = pair.split(':');
        if (key && valueParts.length > 0) {
          const value = valueParts.join(':').trim().replace(/^["']|["']$/g, '');
          params[key.trim()] = value;
        }
      }
      
      return params;
    }
  }

  /**
   * Infer tool parameters from context
   */
  inferToolParameters(toolName, contextStr, globalContext) {
    const params = {};
    
    switch (toolName) {
      case 'web_scrape':
        const urlMatch = contextStr.match(/(https?:\/\/[^\s]+)/);
        if (urlMatch) {
          params.url = urlMatch[1];
        }
        break;
        
      case 'web_download':
        const downloadMatch = contextStr.match(/(https?:\/\/[^\s]+)/);
        if (downloadMatch) {
          params.url = downloadMatch[1];
        }
        break;
        
      case 'smart_diff':
        const fileMatch = contextStr.match(/([^\s]+\.[a-z]+)/i);
        if (fileMatch) {
          params.filePath = fileMatch[1];
          params.changes = contextStr;
        }
        break;
        
      case 'content_generate':
        const contentMatch = contextStr.match(/([^\s]+\.[a-z]+)/i);
        if (contentMatch) {
          params.filePath = contentMatch[1];
          params.context = contextStr;
          params.contentType = this.detectContentType(contentMatch[1]);
        }
        break;
    }
    
    return params;
  }

  /**
   * Extract content from sentence
   */
  extractContentFromSentence(sentence) {
    const contentMatch = sentence.match(/(?:with\s+content|containing)\s+["']([^"']+)["']/i);
    return contentMatch ? contentMatch[1] : '// TODO: Add content';
  }

  /**
   * Detect content type from file extension
   */
  detectContentType(filePath) {
    const ext = filePath.split('.').pop().toLowerCase();
    const typeMap = {
      'js': 'javascript',
      'py': 'python',
      'html': 'html',
      'css': 'css',
      'json': 'json',
      'md': 'markdown',
      'txt': 'text'
    };
    return typeMap[ext] || 'text';
  }

  /**
   * Validate and enhance commands
   */
  async validateAndEnhanceCommands(commands) {
    const validCommands = [];
    
    for (const command of commands) {
      // Basic validation
      if (!command.type || (!command.command && !command.tool)) {
        continue;
      }
      
      // Enhance command with additional metadata
      const enhancedCommand = {
        ...command,
        id: this.generateCommandId(),
        timestamp: new Date().toISOString(),
        validated: true
      };
      
      // Add safety checks for shell commands
      if (command.type === 'shell') {
        enhancedCommand.safe = this.isCommandSafe(command.command);
        if (!enhancedCommand.safe) {
          enhancedCommand.warning = 'Potentially dangerous command';
        }
      }
      
      validCommands.push(enhancedCommand);
    }
    
    return validCommands;
  }

  /**
   * Validate file operations
   */
  validateFileOperations(fileOperations) {
    return fileOperations.filter(op => {
      return op.action && op.path && 
             ['create', 'modify', 'delete'].includes(op.action);
    }).map(op => ({
      ...op,
      id: this.generateCommandId(),
      timestamp: new Date().toISOString(),
      validated: true
    }));
  }

  /**
   * Validate tool invocations
   */
  async validateToolInvocations(toolInvocations) {
    const availableTools = this.arsenal.getAvailableTools();
    
    return toolInvocations.filter(invocation => {
      return availableTools.hasOwnProperty(invocation.tool);
    }).map(invocation => ({
      ...invocation,
      id: this.generateCommandId(),
      timestamp: new Date().toISOString(),
      validated: true
    }));
  }

  /**
   * Check if command is safe to execute
   */
  isCommandSafe(command) {
    const dangerousPatterns = [
      /rm\s+-rf\s+\//,
      /sudo\s+rm/,
      />\s*\/dev\/sd/,
      /dd\s+if=/,
      /mkfs/,
      /fdisk/,
      /format/i
    ];
    
    return !dangerousPatterns.some(pattern => pattern.test(command));
  }

  /**
   * Generate unique command ID
   */
  generateCommandId() {
    return `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get parsing statistics
   */
  getStats() {
    return {
      availableStrategies: this.parsingStrategies.length,
      commandPatterns: Object.keys(this.commandPatterns).length,
      toolPatterns: Object.keys(this.toolPatterns).length,
      availableTools: Object.keys(this.arsenal.getAvailableTools()).length
    };
  }
}

module.exports = EnhancedAIResponseParser;