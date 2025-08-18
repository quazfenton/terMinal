/**
 * Documentation Generator Plugin
 * Creates documentation templates for code files based on their structure
 */

const fs = require('fs').promises;
const path = require('path');

class DocumentationPlugin {
  constructor() {
    this.supportedExtensions = ['.js', '.ts', '.py', '.java', '.cpp', '.c', '.cs'];
  }

  getName() { return "Documentation Generator Plugin"; }

  getCommands() {
    return [
      {
        name: "doc-generate",
        description: "Generate documentation template for a code file",
        pattern: /^doc generate (.+)$/i,
        execute: async (match) => {
          const filePath = match[1];
          return this.generateDocumentation(filePath);
        }
      },
      {
        name: "doc-generate-all",
        description: "Generate documentation templates for all code files in a directory",
        pattern: /^doc generate-all (.+)$/i,
        execute: async (match) => {
          const dirPath = match[1];
          return this.generateDocumentationForDirectory(dirPath);
        }
      },
      {
        name: "doc-formats",
        description: "List supported documentation formats",
        pattern: /^doc formats$/i,
        execute: async () => {
          return `Supported documentation formats:
- JavaScript/TypeScript: JSDoc
- Python: Docstrings (Google style)
- Java: JavaDoc
- C++/C: Doxygen
- C#: XML Documentation`;
        }
      }
    ];
  }

  async generateDocumentation(filePath) {
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
      
      // Generate documentation based on file extension
      let documentation = '';
      switch (ext) {
        case '.js':
        case '.ts':
          documentation = this.generateJSDoc(content, filePath);
          break;
        case '.py':
          documentation = this.generatePythonDoc(content, filePath);
          break;
        case '.java':
          documentation = this.generateJavaDoc(content, filePath);
          break;
        case '.cpp':
        case '.c':
          documentation = this.generateDoxygen(content, filePath);
          break;
        case '.cs':
          documentation = this.generateCSharpDoc(content, filePath);
          break;
        default:
          return `Unsupported file type: ${ext}`;
      }
      
      // Save documentation to file
      const docFileName = `${path.basename(filePath, ext)}.docs${ext}`;
      const docFilePath = path.join(path.dirname(filePath), docFileName);
      await fs.writeFile(docFilePath, documentation, 'utf8');
      
      return `Documentation generated and saved to ${docFilePath}`;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return `File not found: ${filePath}`;
      }
      return `Error generating documentation: ${error.message}`;
    }
  }

  async generateDocumentationForDirectory(dirPath) {
    try {
      // Check if directory exists
      const stats = await fs.stat(dirPath);
      if (!stats.isDirectory()) {
        return `${dirPath} is not a directory`;
      }
      
      // Read all files in directory
      const files = await fs.readdir(dirPath);
      let processedCount = 0;
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const ext = path.extname(filePath);
        
        // Only process supported file types
        if (this.supportedExtensions.includes(ext)) {
          await this.generateDocumentation(filePath);
          processedCount++;
        }
      }
      
      return `Generated documentation for ${processedCount} files in ${dirPath}`;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return `Directory not found: ${dirPath}`;
      }
      return `Error processing directory: ${error.message}`;
    }
  }

  generateJSDoc(content, filePath) {
    const lines = content.split('\n');
    const fileName = path.basename(filePath);
    let docContent = `/**\n * ${fileName}\n *\n`;
    
    // Extract functions and classes
    const functions = this.extractJSFunctions(content);
    const classes = this.extractJSClasses(content);
    
    // Add class documentation
    for (const cls of classes) {
      docContent += ` * @class ${cls.name}\n`;
      docContent += ` * @description \n`;
      docContent += ` */\n\n`;
    }
    
    // Add function documentation
    for (const func of functions) {
      docContent += `/**\n`;
      docContent += ` * ${func.name}\n`;
      docContent += ` *\n`;
      docContent += ` * @param {type} parameterName - description\n`.repeat(func.params.length);
      docContent += ` * @returns {type} description\n`;
      docContent += ` */\n`;
    }
    
    return docContent + content;
  }

  generatePythonDoc(content, filePath) {
    const lines = content.split('\n');
    const fileName = path.basename(filePath);
    let docContent = `"""\n${fileName}\n\n"""\n\n`;
    
    // Extract functions and classes
    const functions = this.extractPythonFunctions(content);
    const classes = this.extractPythonClasses(content);
    
    // Add class documentation
    for (const cls of classes) {
      docContent += `class ${cls.name}:\n`;
      docContent += `    """\n`;
      docContent += `    \n`;
      docContent += `    Attributes:\n`;
      docContent += `        None\n`;
      docContent += `    """\n\n`;
    }
    
    // Add function documentation
    for (const func of functions) {
      docContent += `def ${func.name}():\n`;
      docContent += `    """\n`;
      docContent += `    \n`;
      docContent += `    Args:\n`;
      docContent += `        None\n`.repeat(func.params.length);
      docContent += `    \n`;
      docContent += `    Returns:\n`;
      docContent += `        None: \n`;
      docContent += `    """\n`;
    }
    
    return docContent + content;
  }

  generateJavaDoc(content, filePath) {
    const lines = content.split('\n');
    const fileName = path.basename(filePath);
    let docContent = `/**\n * ${fileName}\n *\n`;
    docContent += ` */\n\n`;
    
    // Extract functions and classes
    const functions = this.extractJavaFunctions(content);
    const classes = this.extractJavaClasses(content);
    
    // Add class documentation
    for (const cls of classes) {
      docContent += `/**\n`;
      docContent += ` * \n`;
      docContent += ` */\n`;
      docContent += `public class ${cls.name} {\n\n`;
    }
    
    // Add function documentation
    for (const func of functions) {
      docContent += `    /**\n`;
      docContent += `     * \n`;
      docContent += `     *\n`;
      docContent += `     * @param parameterName description\n`.repeat(func.params.length);
      docContent += `     * @return description\n`;
      docContent += `     */\n`;
    }
    
    return docContent + content;
  }

  generateDoxygen(content, filePath) {
    const lines = content.split('\n');
    const fileName = path.basename(filePath);
    let docContent = `/**\n * @file ${fileName}\n *\n`;
    docContent += ` */\n\n`;
    
    // Extract functions
    const functions = this.extractCppFunctions(content);
    
    // Add function documentation
    for (const func of functions) {
      docContent += `/**\n`;
      docContent += ` * \\brief \n`;
      docContent += ` *\n`;
      docContent += ` * \\param parameterName description\n`.repeat(func.params.length);
      docContent += ` * \\return description\n`;
      docContent += ` */\n`;
    }
    
    return docContent + content;
  }

  generateCSharpDoc(content, filePath) {
    const lines = content.split('\n');
    const fileName = path.basename(filePath);
    let docContent = `/// <summary>\n/// ${fileName}\n///\n`;
    docContent += `/// </summary>\n\n`;
    
    // Extract functions and classes
    const functions = this.extractCSharpFunctions(content);
    const classes = this.extractCSharpClasses(content);
    
    // Add class documentation
    for (const cls of classes) {
      docContent += `/// <summary>\n`;
      docContent += `/// \n`;
      docContent += `/// </summary>\n`;
    }
    
    // Add function documentation
    for (const func of functions) {
      docContent += `/// <summary>\n`;
      docContent += `/// \n`;
      docContent += `/// </summary>\n`;
      docContent += `/// <param name="parameterName">description</param>\n`.repeat(func.params.length);
      docContent += `/// <returns>description</returns>\n`;
    }
    
    return docContent + content;
  }

  // Helper functions to extract code elements
  extractJSFunctions(content) {
    // Simple regex to match function declarations (this is a basic implementation)
    const functionRegex = /function\s+(\w+)\s*\(([^)]*)\)/g;
    const arrowFunctionRegex = /(\w+)\s*=\s*\(([^)]*)\)\s*=>/g;
    const functions = [];
    
    let match;
    while ((match = functionRegex.exec(content)) !== null) {
      const params = match[2].split(',').filter(p => p.trim()).map(p => p.trim());
      functions.push({ name: match[1], params });
    }
    
    while ((match = arrowFunctionRegex.exec(content)) !== null) {
      const params = match[2].split(',').filter(p => p.trim()).map(p => p.trim());
      functions.push({ name: match[1], params });
    }
    
    return functions;
  }

  extractJSClasses(content) {
    const classRegex = /class\s+(\w+)/g;
    const classes = [];
    
    let match;
    while ((match = classRegex.exec(content)) !== null) {
      classes.push({ name: match[1] });
    }
    
    return classes;
  }

  extractPythonFunctions(content) {
    const functionRegex = /def\s+(\w+)\s*\(([^)]*)\):/g;
    const functions = [];
    
    let match;
    while ((match = functionRegex.exec(content)) !== null) {
      const params = match[2].split(',').filter(p => p.trim() && !p.includes('=')) // Skip defaults for simplicity
        .map(p => p.trim().split(':')[0]); // Remove type hints
      functions.push({ name: match[1], params });
    }
    
    return functions;
  }

  extractPythonClasses(content) {
    const classRegex = /class\s+(\w+)\s*(?:\([^)]*\))?:/g; // Match class declarations with or without parent classes
    const classes = [];
    
    let match;
    while ((match = classRegex.exec(content)) !== null) {
      classes.push({ name: match[1] });
    }
    
    return classes;
  }

  extractJavaFunctions(content) {
    const methodRegex = /(public|private|protected)\s+([\w<>[\]]+)\s+(\w+)\s*\(([^)]*)\)/g;
    const functions = [];
    
    let match;
    while ((match = methodRegex.exec(content)) !== null) {
      const params = match[4].split(',').filter(p => p.trim())
        .map(p => p.trim().split(/\s+/).pop()); // Get parameter names
      functions.push({ name: match[3], params });
    }
    
    return functions;
  }

  extractJavaClasses(content) {
    const classRegex = /(public\s+)?class\s+(\w+)/g;
    const classes = [];
    
    let match;
    while ((match = classRegex.exec(content)) !== null) {
      classes.push({ name: match[2] });
    }
    
    return classes;
  }

  extractCppFunctions(content) {
    // This will match functions with various return types and parameter lists
    const functionRegex = /(\w[\w\s*]+)\s+(\w+)\s*\(([^)]*)\)/g;
    const functions = [];
    
    let match;
    while ((match = functionRegex.exec(content)) !== null) {
      const params = match[3].split(',').filter(p => p.trim() && !p.trim().endsWith(';')) // Filter out declarations
        .map(p => p.trim().split(/\s+/).pop()); // Get parameter names
      functions.push({ name: match[2], params });
    }
    
    return functions;
  }

  extractCSharpFunctions(content) {
    const methodRegex = /(public|private|protected)\s+([\w<>[\]]+)\s+(\w+)\s*\(([^)]*)\)/g;
    const functions = [];
    
    let match;
    while ((match = methodRegex.exec(content)) !== null) {
      const params = match[4].split(',').filter(p => p.trim())
        .map(p => p.trim().split(/\s+/).pop()); // Get parameter names
      functions.push({ name: match[3], params });
    }
    
    return functions;
  }

  extractCSharpClasses(content) {
    const classRegex = /(public\s+)?class\s+(\w+)/g;
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

module.exports = DocumentationPlugin;