/**
 * Code Complexity Analysis Plugin
 * Analyzes code files and provides complexity metrics and refactoring suggestions
 */

const fs = require('fs').promises;
const path = require('path');

class ComplexityPlugin {
  constructor() {
    this.supportedExtensions = ['.js', '.ts', '.py', '.java'];
  }

  getName() { return "Code Complexity Analysis Plugin"; }

  getCommands() {
    return [
      {
        name: "complexity-analyze",
        description: "Analyze complexity of a code file",
        pattern: /^complexity analyze (.+)$/i,
        execute: async (match) => {
          const filePath = match[1];
          return this.analyzeComplexity(filePath);
        }
      },
      {
        name: "complexity-report",
        description: "Generate a detailed complexity report for a directory",
        pattern: /^complexity report (.+)$/i,
        execute: async (match) => {
          const dirPath = match[1];
          return this.generateComplexityReport(dirPath);
        }
      },
      {
        name: "complexity-thresholds",
        description: "Show complexity thresholds for code quality",
        pattern: /^complexity thresholds$/i,
        execute: async () => {
          return `Code Complexity Quality Thresholds:
- Cyclomatic Complexity:
  * Good: <= 5
  * Moderate: 6-10
  * Complex: 11-20
  * Very Complex: > 20
- Lines of Code per Function:
  * Good: <= 20
  * Moderate: 21-50
  * Complex: > 50
- Lines of Code per File:
  * Good: <= 200
  * Moderate: 201-500
  * Complex: > 500`;
        }
      }
    ];
  }

  async analyzeComplexity(filePath) {
    try {
      // Check if file exists
      await fs.access(filePath);
      
      // Check if file extension is supported
      const ext = path.extname(filePath);
      if (!this.supportedExtensions.includes(ext)) {
        return `Unsupported file type: ${ext}. Supported extensions: ${this.supportedExtensions.join(', ')}`;
      }
      
      // Read file content
      const content = await fs.readFile(filePath, 'utf8');
      
      // Analyze complexity based on file extension
      const analysis = this.analyzeFileComplexity(content, ext, filePath);
      
      // Format the output
      let output = `Complexity Analysis for ${filePath}:\n`;
      output += `=====================================\n`;
      output += `Lines of Code: ${analysis.linesOfCode}\n`;
      output += `Number of Functions: ${analysis.functionCount}\n`;
      output += `Number of Classes: ${analysis.classCount}\n`;
      
      if (analysis.functions.length > 0) {
        output += `\nFunction Complexity:\n`;
        for (const func of analysis.functions) {
          output += `- ${func.name}: Cyclomatic Complexity = ${func.cyclomaticComplexity}, Lines = ${func.lines}\n`;
        }
      }
      
      // Provide suggestions if complexity is high
      const suggestions = this.getRefactoringSuggestions(analysis);
      if (suggestions.length > 0) {
        output += `\nRefactoring Suggestions:\n`;
        output += suggestions.join('\n');
      }
      
      return output;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return `File not found: ${filePath}`;
      }
      return `Error analyzing complexity: ${error.message}`;
    }
  }

  async generateComplexityReport(dirPath) {
    try {
      // Check if directory exists
      const stats = await fs.stat(dirPath);
      if (!stats.isDirectory()) {
        return `${dirPath} is not a directory`;
      }
      
      // Initialize report data
      const report = {
        totalFiles: 0,
        totalLinesOfCode: 0,
        totalFunctions: 0,
        totalClasses: 0,
        complexFunctions: [],
        largeFiles: []
      };
      
      // Read all files in directory
      const files = await fs.readdir(dirPath);
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const ext = path.extname(filePath);
        
        // Only process supported file types
        if (this.supportedExtensions.includes(ext)) {
          // Read file content
          const content = await fs.readFile(filePath, 'utf8');
          
          // Analyze complexity
          const analysis = this.analyzeFileComplexity(content, ext, filePath);
          
          // Update report
          report.totalFiles++;
          report.totalLinesOfCode += analysis.linesOfCode;
          report.totalFunctions += analysis.functionCount;
          report.totalClasses += analysis.classCount;
          
          // Track complex functions
          for (const func of analysis.functions) {
            if (func.cyclomaticComplexity > 10) {
              report.complexFunctions.push({
                file: filePath,
                function: func.name,
                complexity: func.cyclomaticComplexity
              });
            }
            
            if (func.lines > 50) {
              report.largeFiles.push({
                file: filePath,
                lines: func.lines
              });
            }
          }
        }
      }
      
      // Format the report
      let output = `Code Complexity Report for ${dirPath}\n`;
      output += `===================================\n`;
      output += `Total Files Analyzed: ${report.totalFiles}\n`;
      output += `Total Lines of Code: ${report.totalLinesOfCode}\n`;
      output += `Total Functions: ${report.totalFunctions}\n`;
      output += `Total Classes: ${report.totalClasses}\n`;
      
      if (report.complexFunctions.length > 0) {
        output += `\nHigh Complexity Functions (Cyclomatic Complexity > 10):\n`;
        for (const func of report.complexFunctions) {
          output += `- ${func.file}::${func.function} (Complexity: ${func.complexity})\n`;
        }
      }
      
      if (report.largeFiles.length > 0) {
        output += `\nLarge Files (Lines > 50):\n`;
        for (const file of report.largeFiles) {
          output += `- ${file.file} (${file.lines} lines)\n`;
        }
      }
      
      return output;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return `Directory not found: ${dirPath}`;
      }
      return `Error generating complexity report: ${error.message}`;
    }
  }

  analyzeFileComplexity(content, ext, filePath) {
    const lines = content.split('\n');
    
    // Initialize analysis data
    const analysis = {
      linesOfCode: lines.length,
      functionCount: 0,
      classCount: 0,
      functions: [],
      fileName: path.basename(filePath)
    };
    
    // Analyze based on file extension
    switch (ext) {
      case '.js':
      case '.ts':
        this.analyzeJSComplexity(content, analysis);
        break;
      case '.py':
        this.analyzePythonComplexity(content, analysis);
        break;
      case '.java':
        this.analyzeJavaComplexity(content, analysis);
        break;
    }
    
    return analysis;
  }

  analyzeJSComplexity(content, analysis) {
    // Extract functions
    const functions = this.extractJSFunctions(content);
    analysis.functionCount = functions.length;
    analysis.functions = functions.map(func => ({
      name: func.name,
      cyclomaticComplexity: this.calculateCyclomaticComplexity(func.body),
      lines: func.body.split('\n').length
    }));
    
    // Extract classes
    const classes = this.extractJSClasses(content);
    analysis.classCount = classes.length;
  }

  analyzePythonComplexity(content, analysis) {
    // Extract functions
    const functions = this.extractPythonFunctions(content);
    analysis.functionCount = functions.length;
    analysis.functions = functions.map(func => ({
      name: func.name,
      cyclomaticComplexity: this.calculateCyclomaticComplexity(func.body),
      lines: func.body.split('\n').length
    }));
    
    // Extract classes
    const classes = this.extractPythonClasses(content);
    analysis.classCount = classes.length;
  }

  analyzeJavaComplexity(content, analysis) {
    // Extract functions
    const functions = this.extractJavaFunctions(content);
    analysis.functionCount = functions.length;
    analysis.functions = functions.map(func => ({
      name: func.name,
      cyclomaticComplexity: this.calculateCyclomaticComplexity(func.body),
      lines: func.body.split('\n').length
    }));
    
    // Extract classes
    const classes = this.extractJavaClasses(content);
    analysis.classCount = classes.length;
  }

  calculateCyclomaticComplexity(code) {
    if (!code) return 0;
    
    // Count decision points (if, else if, for, while, case, catch, &&, ||, ?:)
    const decisionPoints = code.match(/(\bif\b|\belse\b|\bfor\b|\bwhile\b|\bswitch\b|\bcase\b|\bcatch\b|\?|&&|\|\|)/g);
    
    // Base complexity is 1, plus 1 for each decision point
    return 1 + (decisionPoints ? decisionPoints.length : 0);
  }

  getRefactoringSuggestions(analysis) {
    const suggestions = [];
    
    // Check for large file
    if (analysis.linesOfCode > 500) {
      suggestions.push('- File is very large (>500 lines). Consider breaking it into smaller modules.');
    }
    
    // Check for functions with high complexity
    for (const func of analysis.functions) {
      if (func.cyclomaticComplexity > 20) {
        suggestions.push(`- Function "${func.name}" has very high cyclomatic complexity (${func.cyclomaticComplexity}). Consider breaking it into smaller functions.`);
      } else if (func.cyclomaticComplexity > 10) {
        suggestions.push(`- Function "${func.name}" has high cyclomatic complexity (${func.cyclomaticComplexity}). Consider simplifying the logic.`);
      }
      
      // Check for large functions
      if (func.lines > 50) {
        suggestions.push(`- Function "${func.name}" is very large (${func.lines} lines). Consider breaking it into smaller functions.`);
      }
    }
    
    return suggestions;
  }

  // Helper functions to extract code elements
  extractJSFunctions(content) {
    // This is a simplified regex approach - a full parser would be more accurate
    const functionRegex = /function\s+(\w+)\s*\([^)]*\)\s*{([^}]*)}/g;
    const arrowFunctionRegex = /(\w+)\s*=\s*\([^)]*\)\s*=>\s*{([^}]*)}/g;
    const functions = [];
    
    let match;
    while ((match = functionRegex.exec(content)) !== null) {
      functions.push({ name: match[1], body: match[2] });
    }
    
    while ((match = arrowFunctionRegex.exec(content)) !== null) {
      functions.push({ name: match[1], body: match[2] });
    }
    
    return functions;
  }

  extractJSClasses(content) {
    const classRegex = /class\s+(\w+)(?:\s+extends\s+\w+)?\s*{[^}]*}/g;
    const classes = [];
    
    let match;
    while ((match = classRegex.exec(content)) !== null) {
      classes.push({ name: match[1] });
    }
    
    return classes;
  }

  extractPythonFunctions(content) {
    // Python function extraction is more complex due to indentation
    // This is a simplified approach that might not work for all cases
    const functionRegex = /def\s+(\w+)\s*\([^)]*\):\s*((?:\n\s+.*\n?)*)/g;
    const functions = [];
    
    let match;
    while ((match = functionRegex.exec(content)) !== null) {
      functions.push({ name: match[1], body: match[2] });
    }
    
    return functions;
  }

  extractPythonClasses(content) {
    const classRegex = /class\s+(\w+)\s*(?:\([^)]*\))?:\s*((?:\n\s+.*\n?)*)/g;
    const classes = [];
    
    let match;
    while ((match = classRegex.exec(content)) !== null) {
      classes.push({ name: match[1], body: match[2] });
    }
    
    return classes;
  }

  extractJavaFunctions(content) {
    // Java method extraction (simplified)
    const methodRegex = /(public|private|protected)\s+[\w<>]+\s+(\w+)\s*\([^)]*\)\s*{([^}]*)}/g;
    const functions = [];
    
    let match;
    while ((match = methodRegex.exec(content)) !== null) {
      functions.push({ name: match[2], body: match[3] });
    }
    
    return functions;
  }

  extractJavaClasses(content) {
    // Java class extraction (simplified)
    const classRegex = /(public\s+)?class\s+(\w+)\s*{[^}]*}/g;
    const classes = [];
    
    let match;
    while ((match = classRegex.exec(content)) !== null) {
      classes.push({ name: match[2] });
    }
    
    return classes;
  }

  initialize(terminal) {
    this.terminal = terminal;
  }
}

module.exports = ComplexityPlugin;