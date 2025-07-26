/**
 * AI Service
 * 
 * Handles communication with the AI model and constructs prompts
 * with the appropriate schema and constraints.
 */

const axios = require('axios');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const fs = require('fs').promises;
const path = require('path');

class AIService {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.CLAUDE_API_KEY;
    this.modelName = config.modelName || 'claude-3-sonnet-20240229';
    this.apiEndpoint = config.apiEndpoint || 'https://api.anthropic.com/v1/messages';
    this.maxTokens = config.maxTokens || 1024;
    this.temperature = config.temperature || 0.7;
    this.systemPrompt = this.buildSystemPrompt();
    this.biModalSystemPrompt = this.buildBiModalSystemPrompt();
    this.conversationContext = [];
    this.maxContextLength = 10; // Number of exchanges to keep in context
  }

  /**
   * Build the system prompt with schema definition and constraints
   * @returns {string} The system prompt
   */
  buildSystemPrompt() {
    return `You are an AI assistant integrated into a terminal application called AI Terminal. Your primary role is to analyze user requests and generate precise command sequences to accomplish tasks.

RESPONSE FORMAT REQUIREMENTS:
You MUST respond with a JSON object containing:
1. "commandSequences": An array of command sequence objects, each containing:
   - "rank": A number indicating priority (1 is highest)
   - "commands": An array of command strings to be executed in sequence
   - "description": A brief explanation of what this sequence accomplishes

2. "explanation": Optional text explaining your reasoning or providing context

Example response format:
\`\`\`json
{
  "commandSequences": [
    {
      "rank": 1,
      "commands": ["mkdir -p project/src", "cd project/src", "touch index.js"],
      "description": "Create project structure with main file"
    },
    {
      "rank": 2,
      "commands": ["npm init -y", "npm install express"],
      "description": "Initialize Node project with Express"
    }
  ],
  "explanation": "These commands will set up a basic Express project structure."
}
\`\`\`

IMPORTANT CONSTRAINTS:
1. Focus on generating practical, executable commands
2. Prioritize command sequences by effectiveness (rank 1 = best approach)
3. Keep commands simple and focused on the specific task
4. Consider the current directory context and OS environment
5. For complex tasks, break them down into logical command sequences
6. Avoid unnecessary explanations in the command sequences
7. Include only valid shell commands that would work in a terminal

Your goal is to be concise and precise, focusing on actionable commands rather than explanations.`;
  }

  /**
   * Build a prompt for bi-modal operation (complex tasks)
   * @returns {string} The bi-modal system prompt
   */
  buildBiModalSystemPrompt() {
    return `You are an AI assistant integrated into a terminal application called AI Terminal. Your primary role is to analyze user requests and generate precise command sequences to accomplish tasks.

BI-MODAL MODE ACTIVATED:
You are now operating in bi-modal mode, which allows for handling more complex tasks:

RESPONSE FORMAT REQUIREMENTS:
You MUST respond with a JSON object containing:
1. "commandSequences": An array of command sequence objects, each containing:
   - "rank": A number indicating priority (1 is highest)
   - "commands": An array of command strings to be executed in sequence
   - "description": A brief explanation of what this sequence accomplishes
   - "fileContent": (Optional) Content to be written to a file if the command creates or edits a file

2. "explanation": Optional text explaining your reasoning or providing context

Example response format for file creation:
\`\`\`json
{
  "commandSequences": [
    {
      "rank": 1,
      "commands": ["nano new_file.js"],
      "description": "Create a new JavaScript file",
      "fileContent": "// This is the content for new_file.js\\nconsole.log('Hello world');"
    }
  ],
  "explanation": "This will create a simple JavaScript file that prints 'Hello world'."
}
\`\`\`

IMPORTANT CONSTRAINTS:
1. You can include longer task descriptions in your command sequences
2. You can suggest file content creation and multi-step workflows
3. You can recommend more complex operations that might require user interaction
4. For file creation or editing tasks, include the content in the fileContent field
5. Consider the current directory context and OS environment
6. Break complex tasks into logical command sequences
7. Include only valid shell commands that would work in a terminal

The system will handle opening the appropriate editor and inserting the content.`;
  }

  /**
   * Get system information to provide context to the AI
   * @returns {Promise<Object>} System information
   */
  async getSystemInfo() {
    try {
      const platform = os.platform();
      const release = os.release();
      const type = os.type();
      
      let shellInfo = 'unknown';
      try {
        const { stdout } = await execAsync('echo $SHELL');
        shellInfo = stdout.trim();
      } catch (error) {
        console.warn('Could not determine shell:', error);
      }
      
      let currentDir = 'unknown';
      try {
        const { stdout } = await execAsync('pwd');
        currentDir = stdout.trim();
      } catch (error) {
        console.warn('Could not determine current directory:', error);
      }
      
      return {
        platform,
        release,
        type,
        shell: shellInfo,
        currentDirectory: currentDir
      };
    } catch (error) {
      console.error('Error getting system info:', error);
      return {
        platform: os.platform(),
        type: os.type()
      };
    }
  }

  /**
   * Add context about the current directory contents
   * @param {string} currentDir - The current directory path
   * @returns {Promise<string>} Directory context information
   */
  async getDirectoryContext(currentDir) {
    try {
      // Get directory listing
      const { stdout: lsOutput } = await execAsync('ls -la', { cwd: currentDir });
      
      // Get information about common configuration files
      let configFiles = '';
      const commonConfigFiles = [
        'package.json', 'requirements.txt', 'Gemfile', 'Cargo.toml', 
        'build.gradle', 'pom.xml', 'Makefile', 'CMakeLists.txt',
        '.gitignore', 'Dockerfile', 'docker-compose.yml'
      ];
      
      for (const file of commonConfigFiles) {
        try {
          const filePath = path.join(currentDir, file);
          await fs.access(filePath);
          
          // If file exists, add its content (limited to avoid huge contexts)
          const content = await fs.readFile(filePath, 'utf8');
          const truncatedContent = content.length > 500 
            ? content.substring(0, 500) + '... (truncated)'
            : content;
          
          configFiles += `\n\nContent of ${file}:\n${truncatedContent}`;
        } catch (error) {
          // File doesn't exist, skip
        }
      }
      
      return `Current directory contents:\n${lsOutput}${configFiles}`;
    } catch (error) {
      console.warn('Could not get directory contents:', error);
      return '';
    }
  }

  /**
   * Process a user query and get AI-generated command sequences
   * @param {string} userQuery - The user's natural language query
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} The AI response with command sequences
   */
  async processQuery(userQuery, options = {}) {
    try {
      const systemInfo = await this.getSystemInfo();
      const dirContext = options.includeDirectoryContext 
        ? await this.getDirectoryContext(systemInfo.currentDirectory)
        : '';
      
      // Update conversation context
      this.updateConversationContext(userQuery);
      
      // Select the appropriate system prompt based on mode
      const systemPrompt = options.biModalMode 
        ? this.biModalSystemPrompt 
        : this.systemPrompt;
      
      // Build the user message with context
      const userMessage = `
${userQuery}

CURRENT CONTEXT:
- OS: ${systemInfo.type} (${systemInfo.platform} ${systemInfo.release})
- Shell: ${systemInfo.shell}
- Current Directory: ${systemInfo.currentDirectory}
${dirContext ? `\n${dirContext}` : ''}

Remember to respond with properly formatted JSON containing command sequences as specified.`;

      // Make the API request
      const response = await this.callAI(systemPrompt, userMessage);

      // Extract and store the assistant's response
      const assistantResponse = response.content;
      this.updateConversationContext(assistantResponse, 'assistant');
      
      return {
        success: true,
        rawResponse: assistantResponse,
        systemInfo
      };
    } catch (error) {
      console.error('Error processing query with AI:', error);
      return {
        success: false,
        error: error.message || 'Failed to communicate with AI service',
        rawResponse: null
      };
    }
  }

  /**
   * Call the AI API with the given prompts
   * @param {string} systemPrompt - The system prompt
   * @param {string} userMessage - The user message
   * @returns {Promise<Object>} The AI response
   */
  async callAI(systemPrompt, userMessage) {
    try {
      // This is a placeholder for the actual API call
      // In a real implementation, you would use the appropriate API client
      
      const response = await axios.post(
        this.apiEndpoint,
        {
          model: this.modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            ...this.conversationContext.map(item => ({ role: item.role, content: item.content })),
            { role: 'user', content: userMessage }
          ],
          max_tokens: this.maxTokens,
          temperature: this.temperature
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01'
          }
        }
      );

      // Extract the content from the response
      return {
        content: response.data.content[0].text
      };
    } catch (error) {
      console.error('Error calling AI API:', error);
      
      // For development/testing, return a mock response if API call fails
      return {
        content: this.getMockResponse(userMessage)
      };
    }
  }

  /**
   * Get a mock response for testing when API is unavailable
   * @param {string} userMessage - The user message
   * @returns {string} A mock response
   */
  getMockResponse(userMessage) {
    // Simple mock responses for common queries
    if (/list|show|display|ls/.test(userMessage.toLowerCase())) {
      return `\`\`\`json
{
  "commandSequences": [
    {
      "rank": 1,
      "commands": ["ls -la"],
      "description": "List all files including hidden ones with details"
    },
    {
      "rank": 2,
      "commands": ["find . -type f | sort"],
      "description": "Find all files recursively and sort them"
    }
  ],
  "explanation": "These commands will show you the contents of the current directory with different levels of detail."
}
\`\`\``;
    } else if (/create|new|make/.test(userMessage.toLowerCase())) {
      return `\`\`\`json
{
  "commandSequences": [
    {
      "rank": 1,
      "commands": ["mkdir -p new-project/src", "cd new-project", "touch README.md"],
      "description": "Create a new project directory with source folder and README"
    }
  ],
  "explanation": "This will set up a basic project structure with a README file.",
  "fileContent": "# New Project\\n\\nThis is a new project created with AI Terminal."
}
\`\`\``;
    } else if (/install|download|package/.test(userMessage.toLowerCase())) {
      return `\`\`\`json
{
  "commandSequences": [
    {
      "rank": 1,
      "commands": ["npm init -y", "npm install express"],
      "description": "Initialize a Node.js project and install Express"
    },
    {
      "rank": 2,
      "commands": ["npm install --save-dev nodemon"],
      "description": "Install Nodemon as a development dependency"
    }
  ],
  "explanation": "These commands will set up a basic Node.js project with Express and Nodemon for development."
}
\`\`\``;
    } else {
      // Default mock response
      return `\`\`\`json
{
  "commandSequences": [
    {
      "rank": 1,
      "commands": ["echo 'Hello from AI Terminal'"],
      "description": "Display a greeting message"
    }
  ],
  "explanation": "I've provided a simple command to demonstrate the AI Terminal functionality. You can ask for more specific commands if needed."
}
\`\`\``;
    }
  }

  /**
   * Update the conversation context with a new message
   * @param {string} content - The message content
   * @param {string} role - The role (user or assistant)
   */
  updateConversationContext(content, role = 'user') {
    // Add the new message
    this.conversationContext.push({ role, content });
    
    // Trim context if it exceeds the maximum length
    if (this.conversationContext.length > this.maxContextLength * 2) { // *2 because we count pairs
      // Remove oldest pairs (user + assistant) to maintain context window
      this.conversationContext = this.conversationContext.slice(-this.maxContextLength * 2);
    }
  }

  /**
   * Clear the conversation context
   */
  clearContext() {
    this.conversationContext = [];
  }
}

module.exports = AIService;