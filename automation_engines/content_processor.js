/**
 * Content Processor
 * 
 * Handles intelligent content generation, processing, and manipulation
 * for various file types and content formats.
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class ContentProcessor {
  constructor(options = {}) {
    this.options = {
      maxContentLength: options.maxContentLength || 100000,
      templateDir: options.templateDir || './templates',
      cacheEnabled: options.cacheEnabled !== false,
      ...options
    };
    
    this.contentCache = new Map();
    this.templates = new Map();
    this.processors = new Map();
    
    this.initializeProcessors();
  }

  /**
   * Initialize content processors for different file types
   */
  initializeProcessors() {
    // Code file processors
    this.processors.set('javascript', new JavaScriptProcessor());
    this.processors.set('python', new PythonProcessor());
    this.processors.set('html', new HTMLProcessor());
    this.processors.set('css', new CSSProcessor());
    this.processors.set('json', new JSONProcessor());
    this.processors.set('markdown', new MarkdownProcessor());
    this.processors.set('yaml', new YAMLProcessor());
    this.processors.set('xml', new XMLProcessor());
    
    // Document processors
    this.processors.set('text', new TextProcessor());
    this.processors.set('csv', new CSVProcessor());
    
    // Configuration processors
    this.processors.set('config', new ConfigProcessor());
  }

  /**
   * Generate content for a file based on context and requirements
   */
  async generateContent(params) {
    const { filePath, contentType, context, insertMode = 'replace', template = null } = params;
    
    try {
      // Determine content type from file extension if not provided
      const detectedType = contentType || this.detectContentType(filePath);
      
      // Get appropriate processor
      const processor = this.processors.get(detectedType) || this.processors.get('text');
      
      // Generate content using processor
      const generatedContent = await processor.generateContent(context, {
        filePath,
        template,
        insertMode
      });
      
      // Apply content to file based on insert mode
      const result = await this.applyContent(filePath, generatedContent, insertMode);
      
      return {
        success: true,
        filePath,
        contentType: detectedType,
        insertMode,
        generatedLength: generatedContent.length,
        result
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
   * Process existing content with transformations
   */
  async processContent(params) {
    const { filePath, transformations, outputPath = null } = params;
    
    try {
      // Read existing content
      const originalContent = await fs.readFile(filePath, 'utf8');
      const contentType = this.detectContentType(filePath);
      const processor = this.processors.get(contentType) || this.processors.get('text');
      
      // Apply transformations
      let processedContent = originalContent;
      for (const transformation of transformations) {
        processedContent = await processor.transform(processedContent, transformation);
      }
      
      // Write to output path or original file
      const targetPath = outputPath || filePath;
      await fs.writeFile(targetPath, processedContent, 'utf8');
      
      return {
        success: true,
        originalPath: filePath,
        outputPath: targetPath,
        transformations: transformations.length,
        originalLength: originalContent.length,
        processedLength: processedContent.length
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
   * Extract and analyze content from files
   */
  async analyzeContent(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const contentType = this.detectContentType(filePath);
      const processor = this.processors.get(contentType) || this.processors.get('text');
      
      const analysis = await processor.analyze(content);
      
      return {
        success: true,
        filePath,
        contentType,
        analysis,
        timestamp: new Date().toISOString()
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
   * Apply content to file with specified insert mode
   */
  async applyContent(filePath, content, insertMode) {
    try {
      let existingContent = '';
      
      // Read existing content if file exists
      try {
        existingContent = await fs.readFile(filePath, 'utf8');
      } catch (error) {
        // File doesn't exist, will be created
      }
      
      let finalContent;
      
      switch (insertMode) {
        case 'replace':
          finalContent = content;
          break;
          
        case 'append':
          finalContent = existingContent + (existingContent ? '\n' : '') + content;
          break;
          
        case 'prepend':
          finalContent = content + (existingContent ? '\n' : '') + existingContent;
          break;
          
        case 'insert':
          // Insert at specific line (requires line number in content)
          const lines = existingContent.split('\n');
          const insertLines = content.split('\n');
          // Default to middle of file
          const insertIndex = Math.floor(lines.length / 2);
          lines.splice(insertIndex, 0, ...insertLines);
          finalContent = lines.join('\n');
          break;
          
        default:
          finalContent = content;
      }
      
      // Ensure directory exists
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      
      // Write content
      await fs.writeFile(filePath, finalContent, 'utf8');
      
      return {
        success: true,
        bytesWritten: finalContent.length,
        mode: insertMode
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Detect content type from file path
   */
  detectContentType(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    
    const typeMap = {
      '.js': 'javascript',
      '.ts': 'javascript',
      '.jsx': 'javascript',
      '.tsx': 'javascript',
      '.py': 'python',
      '.html': 'html',
      '.htm': 'html',
      '.css': 'css',
      '.scss': 'css',
      '.sass': 'css',
      '.json': 'json',
      '.md': 'markdown',
      '.markdown': 'markdown',
      '.yml': 'yaml',
      '.yaml': 'yaml',
      '.xml': 'xml',
      '.txt': 'text',
      '.csv': 'csv',
      '.conf': 'config',
      '.config': 'config',
      '.ini': 'config'
    };
    
    return typeMap[extension] || 'text';
  }

  /**
   * Load and cache templates
   */
  async loadTemplate(templateName) {
    if (this.templates.has(templateName)) {
      return this.templates.get(templateName);
    }
    
    try {
      const templatePath = path.join(this.options.templateDir, `${templateName}.template`);
      const templateContent = await fs.readFile(templatePath, 'utf8');
      
      this.templates.set(templateName, templateContent);
      return templateContent;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get processor statistics
   */
  getStats() {
    return {
      availableProcessors: Array.from(this.processors.keys()),
      cacheSize: this.contentCache.size,
      templatesLoaded: this.templates.size
    };
  }
}

/**
 * Base Content Processor
 */
class BaseProcessor {
  async generateContent(context, options = {}) {
    throw new Error('generateContent must be implemented by subclass');
  }
  
  async transform(content, transformation) {
    throw new Error('transform must be implemented by subclass');
  }
  
  async analyze(content) {
    return {
      length: content.length,
      lines: content.split('\n').length,
      words: content.split(/\s+/).length,
      characters: content.length
    };
  }
}

/**
 * JavaScript Content Processor
 */
class JavaScriptProcessor extends BaseProcessor {
  async generateContent(context, options = {}) {
    const { filePath } = options;
    const fileName = path.basename(filePath, path.extname(filePath));
    
    // Generate based on context
    if (context.includes('function') || context.includes('method')) {
      return this.generateFunction(context, fileName);
    } else if (context.includes('class')) {
      return this.generateClass(context, fileName);
    } else if (context.includes('module') || context.includes('export')) {
      return this.generateModule(context, fileName);
    } else {
      return this.generateScript(context, fileName);
    }
  }
  
  generateFunction(context, fileName) {
    const functionName = this.extractFunctionName(context) || fileName;
    return `/**
 * ${context}
 */
function ${functionName}() {
  // TODO: Implement ${functionName}
  throw new Error('Not implemented');
}

module.exports = ${functionName};`;
  }
  
  generateClass(context, fileName) {
    const className = this.extractClassName(context) || this.capitalize(fileName);
    return `/**
 * ${context}
 */
class ${className} {
  constructor() {
    // TODO: Initialize ${className}
  }
  
  // TODO: Add methods
}

module.exports = ${className};`;
  }
  
  generateModule(context, fileName) {
    return `/**
 * ${fileName} - ${context}
 */

// TODO: Implement module functionality

module.exports = {
  // TODO: Export functions and classes
};`;
  }
  
  generateScript(context, fileName) {
    return `#!/usr/bin/env node
/**
 * ${fileName} - ${context}
 */

// TODO: Implement script functionality

if (require.main === module) {
  // TODO: Add main execution logic
  console.log('${fileName} executed');
}`;
  }
  
  async transform(content, transformation) {
    switch (transformation.type) {
      case 'add_jsdoc':
        return this.addJSDoc(content);
      case 'modernize':
        return this.modernizeJS(content);
      case 'minify':
        return this.minifyJS(content);
      default:
        return content;
    }
  }
  
  async analyze(content) {
    const baseAnalysis = await super.analyze(content);
    
    return {
      ...baseAnalysis,
      functions: (content.match(/function\s+\w+/g) || []).length,
      classes: (content.match(/class\s+\w+/g) || []).length,
      imports: (content.match(/(?:import|require)/g) || []).length,
      exports: (content.match(/(?:export|module\.exports)/g) || []).length,
      comments: (content.match(/\/\*[\s\S]*?\*\/|\/\/.*$/gm) || []).length
    };
  }
  
  extractFunctionName(context) {
    const match = context.match(/function\s+(\w+)/i);
    return match ? match[1] : null;
  }
  
  extractClassName(context) {
    const match = context.match(/class\s+(\w+)/i);
    return match ? match[1] : null;
  }
  
  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
  
  addJSDoc(content) {
    // Add JSDoc comments to functions
    return content.replace(/function\s+(\w+)\s*\([^)]*\)\s*{/g, (match, funcName) => {
      return `/**
 * ${funcName} function
 * @returns {*} TODO: Add return type
 */
${match}`;
    });
  }
  
  modernizeJS(content) {
    // Convert var to const/let, function to arrow functions, etc.
    return content
      .replace(/var\s+(\w+)\s*=/g, 'const $1 =')
      .replace(/function\s*\(/g, '(')
      .replace(/\)\s*{/g, ') => {');
  }
  
  minifyJS(content) {
    // Basic minification
    return content
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
      .replace(/\/\/.*$/gm, '') // Remove line comments
      .replace(/\s+/g, ' ') // Collapse whitespace
      .trim();
  }
}

/**
 * Python Content Processor
 */
class PythonProcessor extends BaseProcessor {
  async generateContent(context, options = {}) {
    const { filePath } = options;
    const fileName = path.basename(filePath, path.extname(filePath));
    
    if (context.includes('class')) {
      return this.generateClass(context, fileName);
    } else if (context.includes('function') || context.includes('def')) {
      return this.generateFunction(context, fileName);
    } else {
      return this.generateScript(context, fileName);
    }
  }
  
  generateClass(context, fileName) {
    const className = this.extractClassName(context) || this.capitalize(fileName);
    return `"""
${context}
"""


class ${className}:
    """${className} class implementation."""
    
    def __init__(self):
        """Initialize ${className}."""
        # TODO: Initialize class attributes
        pass
    
    # TODO: Add methods


if __name__ == "__main__":
    # TODO: Add test code
    instance = ${className}()
    print(f"${className} created: {instance}")`;
  }
  
  generateFunction(context, fileName) {
    const functionName = this.extractFunctionName(context) || fileName;
    return `"""
${context}
"""


def ${functionName}():
    """${functionName} function implementation."""
    # TODO: Implement ${functionName}
    raise NotImplementedError("${functionName} not implemented")


if __name__ == "__main__":
    # TODO: Add test code
    result = ${functionName}()
    print(f"Result: {result}")`;
  }
  
  generateScript(context, fileName) {
    return `#!/usr/bin/env python3
"""
${fileName} - ${context}
"""

import sys
import os


def main():
    """Main function."""
    # TODO: Implement main functionality
    print(f"${fileName} executed")


if __name__ == "__main__":
    main()`;
  }
  
  async analyze(content) {
    const baseAnalysis = await super.analyze(content);
    
    return {
      ...baseAnalysis,
      functions: (content.match(/def\s+\w+/g) || []).length,
      classes: (content.match(/class\s+\w+/g) || []).length,
      imports: (content.match(/(?:import|from)\s+\w+/g) || []).length,
      docstrings: (content.match(/"""[\s\S]*?"""/g) || []).length
    };
  }
  
  extractClassName(context) {
    const match = context.match(/class\s+(\w+)/i);
    return match ? match[1] : null;
  }
  
  extractFunctionName(context) {
    const match = context.match(/(?:def\s+)?(\w+)/i);
    return match ? match[1] : null;
  }
  
  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

/**
 * HTML Content Processor
 */
class HTMLProcessor extends BaseProcessor {
  async generateContent(context, options = {}) {
    const { filePath } = options;
    const fileName = path.basename(filePath, path.extname(filePath));
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.capitalize(fileName)}</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>${this.capitalize(fileName)}</h1>
        <p>${context}</p>
        <!-- TODO: Add content -->
    </div>
    
    <script>
        // TODO: Add JavaScript functionality
        console.log('${fileName} loaded');
    </script>
</body>
</html>`;
  }
  
  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

/**
 * Markdown Content Processor
 */
class MarkdownProcessor extends BaseProcessor {
  async generateContent(context, options = {}) {
    const { filePath } = options;
    const fileName = path.basename(filePath, path.extname(filePath));
    
    return `# ${this.capitalize(fileName)}

${context}

## Overview

TODO: Add overview

## Features

- TODO: List features

## Usage

\`\`\`bash
# TODO: Add usage examples
\`\`\`

## Installation

\`\`\`bash
# TODO: Add installation instructions
\`\`\`

## Contributing

TODO: Add contributing guidelines

## License

TODO: Add license information`;
  }
  
  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

/**
 * JSON Content Processor
 */
class JSONProcessor extends BaseProcessor {
  async generateContent(context, options = {}) {
    if (context.includes('package')) {
      return this.generatePackageJson(context);
    } else if (context.includes('config')) {
      return this.generateConfig(context);
    } else {
      return this.generateGenericJson(context);
    }
  }
  
  generatePackageJson(context) {
    return `{
  "name": "project-name",
  "version": "1.0.0",
  "description": "${context}",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "test": "echo \\"Error: no test specified\\" && exit 1"
  },
  "keywords": [],
  "author": "",
  "license": "MIT",
  "dependencies": {},
  "devDependencies": {}
}`;
  }
  
  generateConfig(context) {
    return `{
  "name": "configuration",
  "description": "${context}",
  "version": "1.0.0",
  "settings": {
    "debug": false,
    "timeout": 30000,
    "retries": 3
  },
  "features": {
    "enabled": []
  }
}`;
  }
  
  generateGenericJson(context) {
    return `{
  "description": "${context}",
  "timestamp": "${new Date().toISOString()}",
  "data": {}
}`;
  }
}

/**
 * Text Content Processor
 */
class TextProcessor extends BaseProcessor {
  async generateContent(context, options = {}) {
    return `${context}

Generated on: ${new Date().toISOString()}

TODO: Add content based on requirements.`;
  }
}

/**
 * CSS Content Processor
 */
class CSSProcessor extends BaseProcessor {
  async generateContent(context, options = {}) {
    return `/* ${context} */

/* Reset and base styles */
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: Arial, sans-serif;
    line-height: 1.6;
    color: #333;
}

/* TODO: Add specific styles */

.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
}

/* Responsive design */
@media (max-width: 768px) {
    .container {
        padding: 10px;
    }
}`;
  }
}

/**
 * YAML Content Processor
 */
class YAMLProcessor extends BaseProcessor {
  async generateContent(context, options = {}) {
    return `# ${context}
# Generated on: ${new Date().toISOString()}

name: configuration
version: 1.0.0
description: ${context}

settings:
  debug: false
  timeout: 30000
  retries: 3

features:
  enabled: []

# TODO: Add configuration options`;
  }
}

/**
 * XML Content Processor
 */
class XMLProcessor extends BaseProcessor {
  async generateContent(context, options = {}) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!-- ${context} -->
<root>
    <metadata>
        <description>${context}</description>
        <timestamp>${new Date().toISOString()}</timestamp>
    </metadata>
    <data>
        <!-- TODO: Add XML content -->
    </data>
</root>`;
  }
}

/**
 * CSV Content Processor
 */
class CSVProcessor extends BaseProcessor {
  async generateContent(context, options = {}) {
    return `# ${context}
# Generated on: ${new Date().toISOString()}
id,name,value,timestamp
1,sample,example,${new Date().toISOString()}
# TODO: Add CSV data`;
  }
}

/**
 * Configuration Content Processor
 */
class ConfigProcessor extends BaseProcessor {
  async generateContent(context, options = {}) {
    return `# ${context}
# Generated on: ${new Date().toISOString()}

[general]
debug = false
timeout = 30000
retries = 3

[features]
enabled = 

# TODO: Add configuration sections`;
  }
}

module.exports = ContentProcessor;