/**
 * Prompt Template Engine
 * Dynamic prompt generation with context awareness
 */

class PromptTemplateEngine {
  constructor() {
    this.templates = new Map();
    this.contextBuilders = new Map();
    this.setupDefaultTemplates();
  }

  setupDefaultTemplates() {
    this.templates.set('command_generation', {
      system: `You are an AI assistant that generates shell commands. Respond with JSON:
{
  "commandSequences": [
    {
      "rank": 1,
      "commands": ["command1", "command2"],
      "description": "What this does"
    }
  ]
}`,
      user: `{{context}}

Request: {{query}}

Generate appropriate shell commands for {{platform}}.`
    });

    this.templates.set('file_operation', {
      system: `You are a file operation specialist. Generate safe file commands only.`,
      user: `Current directory: {{currentDir}}
Files: {{fileList}}

Task: {{query}}`
    });

    this.templates.set('code_assistance', {
      system: `You are a coding assistant. Help with programming tasks.`,
      user: `Project type: {{projectType}}
Current file: {{currentFile}}

Request: {{query}}`
    });
  }

  registerTemplate(name, template) {
    this.templates.set(name, template);
  }

  registerContextBuilder(name, builder) {
    this.contextBuilders.set(name, builder);
  }

  async buildPrompt(templateName, query, context = {}) {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(`Template '${templateName}' not found`);
    }

    // Build enhanced context
    const enhancedContext = await this.buildContext(context);
    
    // Replace template variables
    const systemPrompt = this.replaceVariables(template.system, enhancedContext);
    const userPrompt = this.replaceVariables(template.user, { 
      ...enhancedContext, 
      query 
    });

    return { systemPrompt, userPrompt };
  }

  async buildContext(baseContext) {
    const context = { ...baseContext };

    // Add system context
    context.platform = process.platform;
    context.timestamp = new Date().toISOString();

    // Run context builders
    for (const [name, builder] of this.contextBuilders) {
      try {
        const builderResult = await builder(context);
        Object.assign(context, builderResult);
      } catch (error) {
        console.warn(`Context builder '${name}' failed:`, error.message);
      }
    }

    return context;
  }

  replaceVariables(template, context) {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return context[key] || match;
    });
  }

  selectTemplate(query, context) {
    // Simple template selection logic
    if (query.includes('file') || query.includes('directory')) {
      return 'file_operation';
    }
    
    if (context.projectType || query.includes('code') || query.includes('program')) {
      return 'code_assistance';
    }

    return 'command_generation';
  }
}

module.exports = PromptTemplateEngine;
