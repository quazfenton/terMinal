class SmartCommandRouter {
  constructor(aiService, commandExecutor) {
    this.aiService = aiService;
    this.commandExecutor = commandExecutor;
    this.commandCache = new LRUCache({ max: 1000, ttl: 1000 * 60 * 30 }); // 30min TTL
    this.patternCache = new Map();
    this.requestQueue = new Map(); // Prevent duplicate requests
    this.initializePatterns();
  }

  initializePatterns() {
    this.patterns = [
      // Direct shell commands (no AI needed)
      { 
        pattern: /^(ls|dir|pwd|whoami|date|uptime)(\s+.*)?$/i, 
        handler: 'executeDirectly',
        confidence: 1.0 
      },
      
      // Navigation commands
      { 
        pattern: /^cd\s+(.+)$/i, 
        handler: 'handleNavigation',
        confidence: 0.95 
      },
      
      // Git operations
      { 
        pattern: /^git\s+(status|log|diff|branch|add|commit|push|pull)(\s+.*)?$/i, 
        handler: 'handleGitCommand',
        confidence: 0.9 
      },
      
      // Package management
      { 
        pattern: /^(npm|yarn|pip|brew|apt)\s+(install|uninstall|update|list)(\s+.*)?$/i, 
        handler: 'handlePackageManager',
        confidence: 0.85 
      },
      
      // File operations with AI enhancement
      { 
        pattern: /^(create|make|generate|write)\s+(.+)$/i, 
        handler: 'handleFileCreation',
        confidence: 0.8 
      },
      
      // Search operations
      { 
        pattern: /^(find|search|locate|grep)\s+(.+)$/i, 
        handler: 'handleSearch',
        confidence: 0.75 
      },
      
      // Complex operations (require AI)
      { 
        pattern: /^(setup|configure|deploy|optimize|analyze)\s+(.+)$/i, 
        handler: 'handleComplexOperation',
        confidence: 0.6 
      }
    ];
  }

  async routeCommand(input, context = {}) {
    const normalizedInput = input.trim().toLowerCase();
    
    // Check for duplicate requests
    if (this.requestQueue.has(normalizedInput)) {
      return this.requestQueue.get(normalizedInput);
    }

    // Create promise for this request
    const requestPromise = this._processCommand(input, context);
    this.requestQueue.set(normalizedInput, requestPromise);
    
    try {
      const result = await requestPromise;
      return result;
    } finally {
      // Clean up after 5 seconds
      setTimeout(() => this.requestQueue.delete(normalizedInput), 5000);
    }
  }

  async _processCommand(input, context) {
    const cacheKey = this._generateCacheKey(input, context);
    
    // Check cache first
    if (this.commandCache.has(cacheKey)) {
      return { ...this.commandCache.get(cacheKey), source: 'cache' };
    }

    // Pattern matching with confidence scoring
    const matches = this.patterns
      .map(pattern => ({
        ...pattern,
        match: pattern.pattern.exec(input),
        score: this._calculateConfidence(input, pattern)
      }))
      .filter(p => p.match)
      .sort((a, b) => b.score - a.score);

    if (matches.length > 0) {
      const bestMatch = matches[0];
      const result = await this[bestMatch.handler](input, bestMatch.match, context);
      
      // Cache successful results
      if (result.success) {
        this.commandCache.set(cacheKey, result);
      }
      
      return { ...result, confidence: bestMatch.score, source: 'pattern' };
    }

    // Fallback to AI with context
    return await this.handleAICommand(input, context);
  }

  _calculateConfidence(input, pattern) {
    let score = pattern.confidence;
    
    // Boost score for exact matches
    if (pattern.pattern.test(input)) {
      score += 0.1;
    }
    
    // Reduce score for complex inputs
    if (input.split(' ').length > 5) {
      score -= 0.1;
    }
    
    return Math.min(1.0, Math.max(0.0, score));
  }

  async executeDirectly(input) {
    return {
      success: true,
      commandSequences: [{
        rank: 1,
        commands: [input],
        description: `Execute: ${input}`,
        executionMode: 'direct',
        confidence: 1.0
      }],
      explanation: 'Direct shell command execution',
      source: 'direct'
    };
  }

  async handleGitCommand(input, match, context) {
    const gitCommand = match[1].toLowerCase();
    const args = match[2] || '';
    
    const gitHandlers = {
      status: () => ({ commands: ['git status'], description: 'Show git status' }),
      add: () => ({ commands: ['git add .'], description: 'Stage all changes' }),
      commit: () => {
        const message = args.trim() || 'Auto-commit via AI Terminal';
        return { 
          commands: [`git commit -m "${message}"`], 
          description: `Commit with message: ${message}` 
        };
      },
      push: () => ({ commands: ['git push'], description: 'Push to remote repository' }),
      pull: () => ({ commands: ['git pull'], description: 'Pull from remote repository' })
    };

    const handler = gitHandlers[gitCommand];
    if (handler) {
      const { commands, description } = handler();
      return {
        success: true,
        commandSequences: [{
          rank: 1,
          commands,
          description,
          executionMode: 'sequential'
        }],
        source: 'git-handler'
      };
    }

    // Fallback to AI for complex git operations
    return this.handleAICommand(input, context);
  }
}