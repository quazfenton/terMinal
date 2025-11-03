/**
 * Diff Engine
 * 
 * Provides intelligent diff generation and application for seamless code editing
 * and content modification through AI-powered automation.
 */

const fs = require('fs').promises;
const path = require('path');
const { diffLines, diffWords, createPatch, applyPatch } = require('diff');
const crypto = require('crypto');

class DiffEngine {
  constructor(options = {}) {
    this.options = {
      backupEnabled: options.backupEnabled !== false,
      previewMode: options.previewMode !== false,
      maxFileSize: options.maxFileSize || 10 * 1024 * 1024, // 10MB
      ...options
    };
    
    this.diffHistory = [];
    this.backupDir = './backups';
  }

  /**
   * Apply intelligent diff to a file based on natural language description
   */
  async applyIntelligentDiff(params) {
    const { filePath, changes, preview = true, createBackup = true } = params;
    
    try {
      // Validate file exists and is readable
      await this.validateFile(filePath);
      
      // Read current file content
      const originalContent = await fs.readFile(filePath, 'utf8');
      
      // Create backup if enabled
      let backupPath = null;
      if (createBackup && this.options.backupEnabled) {
        backupPath = await this.createBackup(filePath, originalContent);
      }
      
      // Generate modified content based on changes description
      const modifiedContent = await this.generateModifiedContent(originalContent, changes, filePath);
      
      // Generate diff
      const diff = this.generateDiff(originalContent, modifiedContent, filePath);
      
      // If preview mode, return diff without applying
      if (preview) {
        return {
          success: true,
          preview: true,
          diff,
          backupPath,
          originalLength: originalContent.length,
          modifiedLength: modifiedContent.length,
          changes: this.analyzeDiff(diff)
        };
      }
      
      // Apply changes
      await fs.writeFile(filePath, modifiedContent, 'utf8');
      
      // Record in history
      this.diffHistory.push({
        filePath,
        timestamp: new Date().toISOString(),
        changes,
        backupPath,
        diff: diff.summary
      });
      
      return {
        success: true,
        applied: true,
        filePath,
        backupPath,
        diff,
        changes: this.analyzeDiff(diff)
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
        filePath
      };
    }
  }

  /**
   * Generate modified content based on change description
   */
  async generateModifiedContent(originalContent, changes, filePath) {
    const fileExtension = path.extname(filePath);
    const language = this.detectLanguage(fileExtension);
    
    // Parse changes description for specific operations
    const operations = this.parseChangeDescription(changes);
    
    let modifiedContent = originalContent;
    
    for (const operation of operations) {
      modifiedContent = await this.applyOperation(modifiedContent, operation, language);
    }
    
    return modifiedContent;
  }

  /**
   * Parse natural language change description into operations
   */
  parseChangeDescription(changes) {
    const operations = [];
    const lines = changes.split('\n').map(line => line.trim()).filter(line => line);
    
    for (const line of lines) {
      // Add function/method
      if (/add\s+(?:function|method|class)\s+(\w+)/i.test(line)) {
        const match = line.match(/add\s+(?:function|method|class)\s+(\w+)/i);
        operations.push({
          type: 'add_function',
          name: match[1],
          description: line
        });
      }
      
      // Replace/modify function
      else if (/(?:replace|modify|update)\s+(?:function|method)\s+(\w+)/i.test(line)) {
        const match = line.match(/(?:replace|modify|update)\s+(?:function|method)\s+(\w+)/i);
        operations.push({
          type: 'modify_function',
          name: match[1],
          description: line
        });
      }
      
      // Add import/require
      else if (/add\s+import\s+(.+)/i.test(line)) {
        const match = line.match(/add\s+import\s+(.+)/i);
        operations.push({
          type: 'add_import',
          import: match[1],
          description: line
        });
      }
      
      // Replace text/string
      else if (/replace\s+["'](.+?)["']\s+with\s+["'](.+?)["']/i.test(line)) {
        const match = line.match(/replace\s+["'](.+?)["']\s+with\s+["'](.+?)["']/i);
        operations.push({
          type: 'replace_text',
          from: match[1],
          to: match[2],
          description: line
        });
      }
      
      // Add line after/before
      else if (/add\s+line\s+["'](.+?)["']\s+(after|before)\s+line\s+(\d+)/i.test(line)) {
        const match = line.match(/add\s+line\s+["'](.+?)["']\s+(after|before)\s+line\s+(\d+)/i);
        operations.push({
          type: 'add_line',
          content: match[1],
          position: match[2],
          lineNumber: parseInt(match[3]),
          description: line
        });
      }
      
      // Delete line(s)
      else if (/delete\s+line(?:s)?\s+(\d+)(?:-(\d+))?/i.test(line)) {
        const match = line.match(/delete\s+line(?:s)?\s+(\d+)(?:-(\d+))?/i);
        operations.push({
          type: 'delete_lines',
          startLine: parseInt(match[1]),
          endLine: match[2] ? parseInt(match[2]) : parseInt(match[1]),
          description: line
        });
      }
      
      // Generic modification
      else {
        operations.push({
          type: 'generic_modification',
          description: line
        });
      }
    }
    
    return operations;
  }

  /**
   * Apply individual operation to content
   */
  async applyOperation(content, operation, language) {
    const lines = content.split('\n');
    
    switch (operation.type) {
      case 'add_function':
        return this.addFunction(content, operation, language);
        
      case 'modify_function':
        return this.modifyFunction(content, operation, language);
        
      case 'add_import':
        return this.addImport(content, operation, language);
        
      case 'replace_text':
        return content.replace(new RegExp(this.escapeRegex(operation.from), 'g'), operation.to);
        
      case 'add_line':
        if (operation.position === 'after') {
          lines.splice(operation.lineNumber, 0, operation.content);
        } else {
          lines.splice(operation.lineNumber - 1, 0, operation.content);
        }
        return lines.join('\n');
        
      case 'delete_lines':
        lines.splice(operation.startLine - 1, operation.endLine - operation.startLine + 1);
        return lines.join('\n');
        
      case 'generic_modification':
        return await this.applyGenericModification(content, operation, language);
        
      default:
        return content;
    }
  }

  /**
   * Add function to code based on language
   */
  addFunction(content, operation, language) {
    const functionTemplates = {
      javascript: `function ${operation.name}() {\n  // TODO: Implement ${operation.name}\n}`,
      python: `def ${operation.name}():\n    # TODO: Implement ${operation.name}\n    pass`,
      java: `public void ${operation.name}() {\n    // TODO: Implement ${operation.name}\n}`,
      cpp: `void ${operation.name}() {\n    // TODO: Implement ${operation.name}\n}`,
      default: `// Function: ${operation.name}\n// TODO: Implement ${operation.name}`
    };
    
    const template = functionTemplates[language] || functionTemplates.default;
    
    // Find appropriate insertion point (end of file or after last function)
    const lines = content.split('\n');
    const insertIndex = this.findFunctionInsertionPoint(lines, language);
    
    lines.splice(insertIndex, 0, '', template, '');
    return lines.join('\n');
  }

  /**
   * Modify existing function
   */
  modifyFunction(content, operation, language) {
    const lines = content.split('\n');
    const functionRange = this.findFunctionRange(lines, operation.name, language);
    
    if (!functionRange) {
      // Function not found, add it instead
      return this.addFunction(content, operation, language);
    }
    
    // Generate modified function based on description
    const modifiedFunction = this.generateModifiedFunction(
      lines.slice(functionRange.start, functionRange.end + 1).join('\n'),
      operation,
      language
    );
    
    // Replace function
    lines.splice(functionRange.start, functionRange.end - functionRange.start + 1, ...modifiedFunction.split('\n'));
    
    return lines.join('\n');
  }

  /**
   * Add import statement
   */
  addImport(content, operation, language) {
    const lines = content.split('\n');
    const importLine = this.generateImportStatement(operation.import, language);
    
    // Find insertion point for imports
    const insertIndex = this.findImportInsertionPoint(lines, language);
    
    lines.splice(insertIndex, 0, importLine);
    return lines.join('\n');
  }

  /**
   * Apply generic modification using AI assistance
   */
  async applyGenericModification(content, operation, language) {
    // This would integrate with AI service to understand and apply complex modifications
    // For now, return content unchanged
    console.log(`Generic modification requested: ${operation.description}`);
    return content;
  }

  /**
   * Generate diff between original and modified content
   */
  generateDiff(original, modified, filePath) {
    const lineDiff = diffLines(original, modified);
    const patch = createPatch(filePath, original, modified);
    
    const summary = {
      additions: 0,
      deletions: 0,
      modifications: 0
    };
    
    lineDiff.forEach(part => {
      if (part.added) {
        summary.additions += part.count || 0;
      } else if (part.removed) {
        summary.deletions += part.count || 0;
      }
    });
    
    summary.modifications = Math.min(summary.additions, summary.deletions);
    
    return {
      lineDiff,
      patch,
      summary,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Analyze diff for insights
   */
  analyzeDiff(diff) {
    const analysis = {
      totalChanges: diff.summary.additions + diff.summary.deletions,
      netChange: diff.summary.additions - diff.summary.deletions,
      changeRatio: diff.summary.modifications / Math.max(diff.summary.additions, diff.summary.deletions, 1),
      complexity: 'low'
    };
    
    if (analysis.totalChanges > 50) {
      analysis.complexity = 'high';
    } else if (analysis.totalChanges > 20) {
      analysis.complexity = 'medium';
    }
    
    return analysis;
  }

  /**
   * Create backup of file
   */
  async createBackup(filePath, content) {
    await fs.mkdir(this.backupDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = path.basename(filePath);
    const backupPath = path.join(this.backupDir, `${fileName}.${timestamp}.backup`);
    
    await fs.writeFile(backupPath, content, 'utf8');
    return backupPath;
  }

  /**
   * Validate file for diff operations
   */
  async validateFile(filePath) {
    try {
      const stats = await fs.stat(filePath);
      
      if (!stats.isFile()) {
        throw new Error(`Path is not a file: ${filePath}`);
      }
      
      if (stats.size > this.options.maxFileSize) {
        throw new Error(`File too large: ${stats.size} bytes (max: ${this.options.maxFileSize})`);
      }
      
      // Check if file is readable
      await fs.access(filePath, fs.constants.R_OK | fs.constants.W_OK);
      
    } catch (error) {
      throw new Error(`File validation failed: ${error.message}`);
    }
  }

  /**
   * Detect programming language from file extension
   */
  detectLanguage(extension) {
    const languageMap = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c',
      '.cs': 'csharp',
      '.php': 'php',
      '.rb': 'ruby',
      '.go': 'go',
      '.rs': 'rust',
      '.swift': 'swift',
      '.kt': 'kotlin'
    };
    
    return languageMap[extension.toLowerCase()] || 'text';
  }

  /**
   * Find appropriate insertion point for functions
   */
  findFunctionInsertionPoint(lines, language) {
    // Look for last function or class definition
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      
      if (language === 'javascript' && /^(function|class|\w+\s*[:=]\s*function)/.test(line)) {
        return i + 1;
      } else if (language === 'python' && /^(def|class)\s+/.test(line)) {
        return i + 1;
      } else if (language === 'java' && /^(public|private|protected).*\{$/.test(line)) {
        return i + 1;
      }
    }
    
    // Default to end of file
    return lines.length;
  }

  /**
   * Find function range in code
   */
  findFunctionRange(lines, functionName, language) {
    const patterns = {
      javascript: new RegExp(`^\\s*(function\\s+${functionName}|${functionName}\\s*[:=]\\s*function)`),
      python: new RegExp(`^\\s*def\\s+${functionName}\\s*\\(`),
      java: new RegExp(`^\\s*.*\\s+${functionName}\\s*\\(`),
      cpp: new RegExp(`^\\s*.*\\s+${functionName}\\s*\\(`)
    };
    
    const pattern = patterns[language] || patterns.javascript;
    
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        const start = i;
        const end = this.findFunctionEnd(lines, start, language);
        return { start, end };
      }
    }
    
    return null;
  }

  /**
   * Find end of function
   */
  findFunctionEnd(lines, start, language) {
    let braceCount = 0;
    let inFunction = false;
    
    for (let i = start; i < lines.length; i++) {
      const line = lines[i];
      
      if (language === 'python') {
        // Python uses indentation
        if (i > start && line.trim() && !line.startsWith(' ') && !line.startsWith('\t')) {
          return i - 1;
        }
      } else {
        // Brace-based languages
        const openBraces = (line.match(/\{/g) || []).length;
        const closeBraces = (line.match(/\}/g) || []).length;
        
        braceCount += openBraces - closeBraces;
        
        if (openBraces > 0) inFunction = true;
        
        if (inFunction && braceCount === 0) {
          return i;
        }
      }
    }
    
    return lines.length - 1;
  }

  /**
   * Find insertion point for imports
   */
  findImportInsertionPoint(lines, language) {
    const importPatterns = {
      javascript: /^(import|const|let|var).*require/,
      python: /^(import|from).*import/,
      java: /^import\s+/,
      cpp: /^#include\s+/
    };
    
    const pattern = importPatterns[language];
    if (!pattern) return 0;
    
    let lastImportIndex = -1;
    
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i].trim())) {
        lastImportIndex = i;
      } else if (lastImportIndex >= 0 && lines[i].trim()) {
        // Found first non-import, non-empty line
        break;
      }
    }
    
    return lastImportIndex >= 0 ? lastImportIndex + 1 : 0;
  }

  /**
   * Generate import statement for language
   */
  generateImportStatement(importSpec, language) {
    switch (language) {
      case 'javascript':
        return importSpec.includes('from') ? importSpec : `const ${importSpec} = require('${importSpec}');`;
      case 'python':
        return importSpec.startsWith('import') ? importSpec : `import ${importSpec}`;
      case 'java':
        return `import ${importSpec};`;
      case 'cpp':
        return `#include <${importSpec}>`;
      default:
        return importSpec;
    }
  }

  /**
   * Generate modified function (placeholder for AI integration)
   */
  generateModifiedFunction(originalFunction, operation, language) {
    // This would integrate with AI to generate modified function
    // For now, add a comment about the modification
    const lines = originalFunction.split('\n');
    lines.splice(1, 0, `  // Modified: ${operation.description}`);
    return lines.join('\n');
  }

  /**
   * Escape regex special characters
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Get diff history
   */
  getDiffHistory(limit = 10) {
    return this.diffHistory.slice(-limit);
  }

  /**
   * Restore from backup
   */
  async restoreFromBackup(backupPath, targetPath) {
    try {
      const backupContent = await fs.readFile(backupPath, 'utf8');
      await fs.writeFile(targetPath, backupContent, 'utf8');
      
      return {
        success: true,
        restoredFrom: backupPath,
        restoredTo: targetPath,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = DiffEngine;