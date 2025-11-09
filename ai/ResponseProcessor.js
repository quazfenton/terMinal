/**
 * Response Processor
 * Advanced AI response processing with validation and optimization
 */

class ResponseProcessor {
  constructor() {
    this.processors = [];
    this.validators = [];
    this.setupDefaultProcessors();
  }

  setupDefaultProcessors() {
    // JSON extraction processor
    this.addProcessor('json_extract', (response) => {
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1]);
        } catch (error) {
          console.warn('Failed to parse JSON from response');
        }
      }
      
      // Try to find JSON without code blocks
      try {
        const jsonStart = response.indexOf('{');
        const jsonEnd = response.lastIndexOf('}') + 1;
        if (jsonStart !== -1 && jsonEnd > jsonStart) {
          return JSON.parse(response.substring(jsonStart, jsonEnd));
        }
      } catch (error) {
        // Fallback to text processing
      }
      
      return null;
    });

    // Command validation processor
    this.addProcessor('command_validate', (data) => {
      if (!data || !data.commandSequences) return data;
      
      data.commandSequences = data.commandSequences.filter(seq => {
        return seq.commands && Array.isArray(seq.commands) && seq.commands.length > 0;
      });
      
      return data;
    });

    // Security filter processor
    this.addProcessor('security_filter', (data) => {
      if (!data || !data.commandSequences) return data;
      
      const dangerousPatterns = [/rm\s+-rf\s+\//, /format\s+/, /dd\s+if=/];
      
      data.commandSequences = data.commandSequences.filter(seq => {
        return !seq.commands.some(cmd => 
          dangerousPatterns.some(pattern => pattern.test(cmd))
        );
      });
      
      return data;
    });
  }

  addProcessor(name, processor) {
    this.processors.push({ name, processor });
  }

  addValidator(name, validator) {
    this.validators.push({ name, validator });
  }

  async process(rawResponse) {
    let processedData = rawResponse;

    // Run through processors
    for (const { name, processor } of this.processors) {
      try {
        const result = await processor(processedData);
        if (result !== undefined) {
          processedData = result;
        }
      } catch (error) {
        console.warn(`Processor '${name}' failed:`, error.message);
      }
    }

    // Run validators
    const validationResults = [];
    for (const { name, validator } of this.validators) {
      try {
        const isValid = await validator(processedData);
        validationResults.push({ name, isValid });
      } catch (error) {
        validationResults.push({ name, isValid: false, error: error.message });
      }
    }

    return {
      data: processedData,
      validation: validationResults,
      success: validationResults.every(v => v.isValid)
    };
  }

  optimizeCommands(commands) {
    // Remove duplicate commands
    const unique = [...new Set(commands)];
    
    // Combine related commands
    const optimized = [];
    let i = 0;
    
    while (i < unique.length) {
      const current = unique[i];
      
      // Check if next command can be combined
      if (i + 1 < unique.length) {
        const next = unique[i + 1];
        const combined = this.tryCombineCommands(current, next);
        
        if (combined) {
          optimized.push(combined);
          i += 2;
          continue;
        }
      }
      
      optimized.push(current);
      i++;
    }
    
    return optimized;
  }

  tryCombineCommands(cmd1, cmd2) {
    // Simple command combination logic
    if (cmd1.startsWith('cd ') && !cmd2.startsWith('cd ')) {
      return `${cmd1} && ${cmd2}`;
    }
    
    return null;
  }

  scoreResponse(data) {
    let score = 0;
    
    if (data && data.commandSequences) {
      score += data.commandSequences.length * 10;
      
      for (const seq of data.commandSequences) {
        if (seq.description) score += 5;
        if (seq.commands && seq.commands.length > 0) score += seq.commands.length * 2;
        if (seq.rank) score += (6 - seq.rank); // Higher rank = higher score
      }
    }
    
    return Math.min(score, 100);
  }
}

module.exports = ResponseProcessor;
