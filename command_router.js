class CommandRouter {
  constructor(aiService, commandExecutor) {
    this.aiService = aiService;
    this.commandExecutor = commandExecutor;
    this.commandCache = new Map();
    this.commonCommands = new Set([
      'ls', 'cd', 'pwd', 'mkdir', 'touch', 'rm', 'cp', 'mv', 'echo', 'cat',
      'grep', 'find', 'man', 'ps', 'kill', 'top', 'df', 'du', 'chmod', 'chown',
      'ssh', 'scp', 'wget', 'curl', 'ping', 'git', 'npm', 'pip', 'node', 'python'
    ]);
    this.patterns = this.initializePatterns();
  }

  initializePatterns() {
    return [
      { pattern: /^(ls|dir)(\s+.*)?$/i, handler: 'handleDirectCommand' },
      { pattern: /^cd\s+(.+)$/i, handler: 'handleDirectCommand' },
      { pattern: /^git\s+(status|log|diff|branch)$/i, handler: 'handleDirectCommand' },
      { pattern: /^npm\s+(install|start|test|build)\s*(.*)$/i, handler: 'handleDirectCommand' },
      { pattern: /^(create|make|generate)\s+(.+)$/i, handler: 'handleAICommand' },
      { pattern: /^(find|search|locate)\s+(.+)$/i, handler: 'handleSearchCommand' },
      { pattern: /^(edit|modify|update)\s+(.+)$/i, handler: 'handleEditCommand' },
      { pattern: /^(install|download)\s+(.+)$/i, handler: 'handleInstallCommand' }
    ];
  }

  async routeCommand(input) {
    const trimmedInput = input.trim();
    
    // Check cache first
    if (this.commandCache.has(trimmedInput)) {
      return this.commandCache.get(trimmedInput);
    }

    // Direct command recognition
    const firstWord = trimmedInput.split(' ')[0].toLowerCase();
    if (this.commonCommands.has(firstWord)) {
      return this.handleDirectCommand(trimmedInput);
    }

    // Pattern matching
    for (const { pattern, handler } of this.patterns) {
      if (pattern.test(trimmedInput)) {
        const result = await this[handler](trimmedInput);
        this.commandCache.set(trimmedInput, result);
        return result;
      }
    }

    // Fallback to AI
    return this.handleAICommand(trimmedInput);
  }

  handleDirectCommand(command) {
    return {
      success: true,
      commandSequences: [{
        rank: 1,
        commands: [command],
        description: `Execute: ${command}`,
        executionMode: 'sequential',
        requiresConfirmation: this.isDangerous(command)
      }],
      source: 'direct'
    };
  }

  isDangerous(command) {
    const dangerousPatterns = [
      /rm\s+-rf/, /sudo\s+rm/, /format/, /mkfs/, /dd\s+if=/, 
      />\s*\/dev\//, /chmod\s+777/, /chown\s+.*root/
    ];
    return dangerousPatterns.some(pattern => pattern.test(command));
  }

  async handleAICommand(input) {
    return this.aiService.processQuery(input, { 
      biModalMode: true,
      includeContext: true 
    });
  }
}