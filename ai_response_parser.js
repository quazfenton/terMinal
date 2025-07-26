/**
 * AI Response Parser
 * 
 * Parses AI responses into structured command sequences for execution.
 * Handles different response formats and extracts commands using various strategies.
 */

class AIResponseParser {
  constructor() {
    this.schemaVersion = '1.0';
    this.commandQueue = [];
    this.biModalMode = false;
  }

  /**
   * Parse the AI response into structured command sequences
   * @param {string} aiResponse - Raw response from the AI model
   * @param {boolean} biModalMode - Whether bi-modal mode is active
   * @returns {Object} Parsed response with command sequences and explanation
   */
  parseResponse(aiResponse, biModalMode = false) {
    this.biModalMode = biModalMode;
    this.commandQueue = [];

    try {
      // First try to extract JSON if it exists in the response
      const jsonMatch = this.extractJSON(aiResponse);
      
      if (jsonMatch) {
        return this.processStructuredResponse(jsonMatch);
      }
      
      // Fallback to heuristic parsing if JSON extraction fails
      return this.processUnstructuredResponse(aiResponse);
    } catch (error) {
      console.error('Error parsing AI response:', error);
      return {
        success: false,
        error: 'Failed to parse AI response',
        commandSequences: [],
        explanation: aiResponse
      };
    }
  }

  /**
   * Extract JSON from the AI response
   * @param {string} text - The AI response text
   * @returns {Object|null} Parsed JSON or null if extraction fails
   */
  extractJSON(text) {
    try {
      // Try to find JSON in code blocks
      const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
      const jsonMatch = text.match(jsonBlockRegex);
      
      if (jsonMatch && jsonMatch[1]) {
        return JSON.parse(jsonMatch[1]);
      }
      
      // Try to find JSON without code blocks (direct JSON response)
      const jsonRegex = /(\{[\s\S]*\})/;
      const directMatch = text.match(jsonRegex);
      
      if (directMatch && directMatch[1]) {
        return JSON.parse(directMatch[1]);
      }
      
      return null;
    } catch (error) {
      console.warn('JSON extraction failed:', error);
      return null;
    }
  }

  /**
   * Process a structured JSON response
   * @param {Object} parsedData - The parsed JSON data
   * @returns {Object} Processed command sequences and explanation
   */
  processStructuredResponse(parsedData) {
    // Check if the response follows our expected schema
    if (Array.isArray(parsedData.commandSequences) || Array.isArray(parsedData)) {
      const sequences = parsedData.commandSequences || parsedData;
      
      // Process each command sequence
      const processedSequences = sequences.map((sequence, index) => {
        if (Array.isArray(sequence)) {
          // If sequence is already an array of commands
          return {
            id: `seq-${index}`,
            rank: index + 1,
            commands: sequence.map(cmd => this.normalizeCommand(cmd)),
            description: `Command sequence ${index + 1}`
          };
        } else if (typeof sequence === 'object') {
          // If sequence is an object with commands array
          return {
            id: sequence.id || `seq-${index}`,
            rank: sequence.rank || index + 1,
            commands: Array.isArray(sequence.commands) 
              ? sequence.commands.map(cmd => this.normalizeCommand(cmd))
              : [this.normalizeCommand(sequence.commands || '')],
            description: sequence.description || `Command sequence ${index + 1}`,
            fileContent: sequence.fileContent || null
          };
        } else if (typeof sequence === 'string') {
          // If sequence is just a string command
          return {
            id: `seq-${index}`,
            rank: index + 1,
            commands: [this.normalizeCommand(sequence)],
            description: `Command ${index + 1}`
          };
        }
      }).filter(seq => seq && seq.commands.length > 0 && seq.commands[0].command);

      this.commandQueue = processedSequences;
      
      return {
        success: true,
        commandSequences: processedSequences,
        explanation: parsedData.explanation || ''
      };
    } else {
      // If the structure doesn't match our schema, try to extract commands
      return this.processUnstructuredResponse(JSON.stringify(parsedData));
    }
  }

  /**
   * Process an unstructured text response using heuristics to extract commands
   * @param {string} text - The unstructured AI response text
   * @returns {Object} Extracted command sequences and explanation
   */
  processUnstructuredResponse(text) {
    // Extract command blocks (commands in backticks, code blocks, or numbered lists)
    const commandBlocks = [];
    let explanation = text;
    
    // Extract code blocks with bash/shell/command highlighting
    const codeBlockRegex = /```(?:bash|shell|sh|command)?\s*([\s\S]*?)\s*```/g;
    let codeMatch;
    while ((codeMatch = codeBlockRegex.exec(text)) !== null) {
      const commands = codeMatch[1].split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#') && !line.startsWith('//'));
      
      if (commands.length > 0) {
        commandBlocks.push(commands);
        // Remove the code block from explanation
        explanation = explanation.replace(codeMatch[0], '');
      }
    }
    
    // Extract inline commands (in backticks)
    const inlineCommandRegex = /`([^`]+)`/g;
    const inlineCommands = [];
    let inlineMatch;
    while ((inlineMatch = inlineCommandRegex.exec(text)) !== null) {
      const cmd = inlineMatch[1].trim();
      if (cmd && !cmd.includes('\n')) {
        inlineCommands.push(cmd);
        // Remove the inline command from explanation
        explanation = explanation.replace(inlineMatch[0], '');
      }
    }
    
    if (inlineCommands.length > 0) {
      commandBlocks.push(inlineCommands);
    }
    
    // Extract numbered lists that look like commands
    const numberedListRegex = /(?:^|\n)\s*(\d+)[.)\]]\s*([^\n]+)/g;
    const numberedCommands = [];
    let numberedMatch;
    while ((numberedMatch = numberedListRegex.exec(text)) !== null) {
      const cmd = numberedMatch[2].trim();
      // Check if it looks like a command (no periods at end, contains typical command chars)
      if (cmd && !cmd.endsWith('.') && /[\/\-\w\s]+/.test(cmd)) {
        numberedCommands.push(cmd);
      }
    }
    
    if (numberedCommands.length > 0) {
      commandBlocks.push(numberedCommands);
    }
    
    // If in bi-modal mode, look for task descriptions
    if (this.biModalMode && commandBlocks.length === 0) {
      // Extract potential tasks (sentences that look like instructions)
      const taskRegex = /(?:^|\n)(?!```)[^.!?]+(?:create|write|generate|install|configure|setup|build|run|execute|open|save|delete|move|copy)[^.!?]+[.!?]/gi;
      let taskMatch;
      const tasks = [];
      
      while ((taskMatch = taskRegex.exec(text)) !== null) {
        tasks.push(taskMatch[0].trim());
      }
      
      if (tasks.length > 0) {
        // Convert tasks to command sequences
        tasks.forEach((task, index) => {
          commandBlocks.push([this.taskToCommand(task)]);
        });
      }
    }
    
    // Extract file content if in bi-modal mode
    const fileContents = {};
    if (this.biModalMode) {
      // Look for file content sections
      const fileContentRegex = /File content for ([^:]+):\s*```(?:\w+)?\s*([\s\S]*?)\s*```/g;
      let fileMatch;
      
      while ((fileMatch = fileContentRegex.exec(text)) !== null) {
        const filename = fileMatch[1].trim();
        const content = fileMatch[2];
        fileContents[filename] = content;
      }
    }
    
    // Format the extracted commands into our schema
    const commandSequences = commandBlocks.map((commands, index) => {
      // Check if any command in this block is for file creation
      const fileCommand = commands.find(cmd => 
        /^(?:nano|vim|vi|emacs|code|touch|echo\s+.+>\s*|cat\s*>\s*)\s+(\S+)/.test(cmd)
      );
      
      let fileContent = null;
      let filename = null;
      
      if (fileCommand) {
        const match = fileCommand.match(/(?:nano|vim|vi|emacs|code|touch|echo\s+.+>\s*|cat\s*>\s*)\s+(\S+)/);
        if (match && match[1]) {
          filename = match[1].replace(/['"]/g, '');
          fileContent = fileContents[filename] || null;
        }
      }
      
      return {
        id: `seq-${index}`,
        rank: index + 1,
        commands: commands.map(cmd => this.normalizeCommand(cmd)),
        description: `Command sequence ${index + 1}`,
        fileContent: fileContent
      };
    });
    
    this.commandQueue = commandSequences;
    
    return {
      success: commandSequences.length > 0,
      commandSequences,
      explanation: explanation.trim()
    };
  }

  /**
   * Convert a task description to a command
   * @param {string} task - The task description
   * @returns {string} A command that might accomplish the task
   */
  taskToCommand(task) {
    task = task.toLowerCase();
    
    // Simple mapping of common tasks to commands
    if (/create|write|generate.+file|document|text/.test(task)) {
      const fileMatch = task.match(/(?:create|write|generate)\s+(?:a|an)?\s+(?:new)?\s+(\w+(?:\.\w+)?)/i);
      return fileMatch ? `nano ${fileMatch[1]}` : 'nano new_file.txt';
    } else if (/install|download/.test(task)) {
      const packageMatch = task.match(/install\s+(\w+)/i);
      return packageMatch ? `npm install ${packageMatch[1]}` : 'npm install';
    } else if (/build|compile/.test(task)) {
      return 'npm run build';
    } else if (/run|execute|start/.test(task)) {
      return 'npm start';
    } else if (/open/.test(task)) {
      const fileMatch = task.match(/open\s+(\w+\.\w+)/i);
      return fileMatch ? `open ${fileMatch[1]}` : 'ls';
    } else if (/list|show|display/.test(task)) {
      if (/directory|folder|files/.test(task)) {
        return 'ls -la';
      }
    } else if (/search|find/.test(task)) {
      const searchMatch = task.match(/(?:search|find)\s+(?:for)?\s+(\w+)/i);
      return searchMatch ? `find . -name "*${searchMatch[1]}*"` : 'find . -type f | grep -i "search-term"';
    } else if (/create\s+directory|folder|mkdir/.test(task)) {
      const dirMatch = task.match(/(?:create\s+directory|folder|mkdir)\s+(\w+)/i);
      return dirMatch ? `mkdir -p ${dirMatch[1]}` : 'mkdir new-directory';
    }
    
    // Default to echo for unknown tasks
    return `echo "Executing task: ${task.replace(/"/g, '\\"')}"`;
  }

  /**
   * Normalize a command string
   * @param {string|Object} command - The command to normalize
   * @returns {Object} Normalized command object
   */
  normalizeCommand(command) {
    if (typeof command === 'string') {
      return {
        command: command.trim(),
        description: '',
        isTask: this.biModalMode && this.looksLikeTask(command)
      };
    } else if (typeof command === 'object') {
      return {
        command: (command.command || command.cmd || '').trim(),
        description: command.description || '',
        isTask: this.biModalMode && this.looksLikeTask(command.command || command.cmd || '')
      };
    }
    return { command: '', description: '', isTask: false };
  }

  /**
   * Check if a command string looks like a task description rather than a shell command
   * @param {string} command - The command to check
   * @returns {boolean} True if it looks like a task description
   */
  looksLikeTask(command) {
    // If it contains spaces and doesn't start with common command prefixes
    return command.length > 20 && 
           command.includes(' ') && 
           !/^(npm|node|git|ls|cd|mkdir|touch|rm|cp|mv|echo|cat|grep|find|curl|wget|sudo|apt|yum|brew)/i.test(command);
  }

  /**
   * Get the next command sequence from the queue
   * @returns {Object|null} The next command sequence or null if queue is empty
   */
  getNextSequence() {
    if (this.commandQueue.length === 0) return null;
    
    // Sort by rank if not already sorted
    this.commandQueue.sort((a, b) => a.rank - b.rank);
    
    // Return the highest ranked sequence
    return this.commandQueue[0];
  }

  /**
   * Select a specific command sequence by ID
   * @param {string} sequenceId - The ID of the sequence to select
   * @returns {Object|null} The selected sequence or null if not found
   */
  selectSequence(sequenceId) {
    return this.commandQueue.find(seq => seq.id === sequenceId) || null;
  }

  /**
   * Process a special command that requires custom handling
   * @param {string} command - The command to process
   * @returns {Object} Processing instructions
   */
  processSpecialCommand(command) {
    // Check for text editor commands
    if (/^(nano|vim|vi|emacs|code)\s+/.test(command)) {
      const match = command.match(/^(nano|vim|vi|emacs|code)\s+(\S+)/);
      if (match) {
        return {
          type: 'editor',
          editor: match[1],
          filename: match[2],
          needsContent: true
        };
      }
    }
    
    // Check for file creation with content
    if (/^(echo|printf)\s+['"](.+)['"]\s*>\s*(\S+)/.test(command)) {
      const match = command.match(/^(echo|printf)\s+['"](.+)['"]\s*>\s*(\S+)/);
      if (match) {
        return {
          type: 'file-write',
          content: match[2],
          filename: match[3]
        };
      }
    }
    
    // Regular command
    return {
      type: 'regular',
      command
    };
  }
}

module.exports = AIResponseParser;