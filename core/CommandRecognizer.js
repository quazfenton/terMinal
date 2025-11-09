/**
 * Command Recognizer
 * Identifies direct shell commands to bypass AI processing
 */

class CommandRecognizer {
  constructor() {
    this.directCommands = new Set([
      'ls', 'dir', 'pwd', 'cd', 'cat', 'head', 'tail', 'grep', 'find', 'locate',
      'echo', 'printf', 'date', 'whoami', 'id', 'ps', 'top', 'htop', 'df', 'du',
      'mkdir', 'rmdir', 'touch', 'cp', 'mv', 'rm', 'chmod', 'chown', 'ln',
      'git', 'npm', 'yarn', 'node', 'python', 'python3', 'pip', 'pip3',
      'java', 'javac', 'gcc', 'make', 'cmake', 'cargo', 'go',
      'vim', 'nano', 'emacs', 'code', 'subl'
    ]);

    this.commandPatterns = [
      /^[a-zA-Z_][a-zA-Z0-9_-]*(\s+.*)?$/,  // Basic command pattern
      /^\.\/[a-zA-Z0-9_.-]+(\s+.*)?$/,      // Local executable
      /^\/[a-zA-Z0-9_/.-]+(\s+.*)?$/        // Absolute path
    ];

    this.aiTriggerWords = new Set([
      'create', 'generate', 'write', 'make', 'build', 'setup', 'install',
      'configure', 'explain', 'help', 'how', 'what', 'why', 'show me',
      'can you', 'please', 'i need', 'i want'
    ]);
  }

  isDirectCommand(input) {
    if (!input || typeof input !== 'string') return false;

    const trimmed = input.trim().toLowerCase();
    const firstWord = trimmed.split(/\s+/)[0];

    // Check if it's a known direct command
    if (this.directCommands.has(firstWord)) {
      return !this.containsAiTriggers(trimmed);
    }

    // Check command patterns
    return this.commandPatterns.some(pattern => pattern.test(input.trim()));
  }

  containsAiTriggers(input) {
    return Array.from(this.aiTriggerWords).some(trigger => 
      input.includes(trigger)
    );
  }

  needsAiProcessing(input) {
    if (this.isDirectCommand(input)) return false;
    
    // Complex queries need AI
    if (input.length > 100) return true;
    if (this.containsAiTriggers(input)) return true;
    if (input.includes('?')) return true;
    
    return false;
  }

  getCommandType(input) {
    if (this.isDirectCommand(input)) return 'direct';
    if (this.needsAiProcessing(input)) return 'ai';
    return 'unknown';
  }

  extractCommand(input) {
    const trimmed = input.trim();
    const parts = trimmed.split(/\s+/);
    
    return {
      command: parts[0],
      args: parts.slice(1),
      fullCommand: trimmed
    };
  }
}

module.exports = CommandRecognizer;
