/**
 * Workflow Orchestrator
 * 
 * Manages complex, multi-step workflows for the AI Terminal, including
 * conditional execution, rollback mechanisms, and user-defined scripts.
 */

const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');

class WorkflowOrchestrator extends EventEmitter {
  constructor(automationEngine, commandExecutor) {
    super();
    this.automationEngine = automationEngine;
    this.commandExecutor = commandExecutor;
    this.workflows = new Map();
    this.activeWorkflow = null;
    this.workflowDir = path.join(__dirname, 'workflows');
    this.userPreferences = new Map();
  }

  /**
   * Initialize the workflow orchestrator
   */
  async initialize() {
    await fs.mkdir(this.workflowDir, { recursive: true });
    await this.loadWorkflows();
    await this.loadUserPreferences();
  }

  /**
   * Load predefined and user-defined workflows
   */
  async loadWorkflows() {
    const defaultWorkflows = [
      {
        id: 'project-setup',
        name: 'Setup New Project',
        steps: [
          { id: 'create-dir', command: 'mkdir -p {{projectName}}/src', condition: 'always' },
          { id: 'init-git', command: 'cd {{projectName}} && git init', condition: 'git-installed' },
          { id: 'create-readme', command: 'touch README.md', condition: 'always', fileContent: '# {{projectName}}\n\nProject description' }
        ],
        parameters: ['projectName']
      },
      {
        id: 'deploy-app',
        name: 'Deploy Application',
        steps: [
          { id: 'build', command: 'npm run build', condition: 'package.json-exists' },
          { id: 'deploy', command: 'rsync -avz ./dist/ user@server:/var/www/app', condition: 'build-success' }
        ],
        parameters: ['server', 'user']
      }
    ];

    defaultWorkflows.forEach(wf => this.workflows.set(wf.id, wf));

    // Load user-defined workflows
    const files = await fs.readdir(this.workflowDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await fs.readFile(path.join(this.workflowDir, file), 'utf8');
        const workflow = JSON.parse(content);
        this.workflows.set(workflow.id, workflow);
      }
    }
  }

  /**
   * Load user preferences for workflow execution
   */
  async loadUserPreferences() {
    try {
      const prefPath = path.join(this.workflowDir, 'preferences.json');
      const content = await fs.readFile(prefPath, 'utf8');
      const prefs = JSON.parse(content);
      Object.entries(prefs).forEach(([key, value]) => this.userPreferences.set(key, value));
    } catch (error) {
      // Preferences file doesn't exist yet
    }
  }

  /**
   * Save user preferences
   */
  async saveUserPreferences() {
    const prefPath = path.join(this.workflowDir, 'preferences.json');
    const prefs = Object.fromEntries(this.userPreferences);
    await fs.writeFile(prefPath, JSON.stringify(prefs, null, 2));
  }

  /**
   * Execute a workflow by ID
   * @param {string} workflowId - Workflow ID
   * @param {Object} parameters - Workflow parameters
   * @returns {Promise<Object>} Execution result
   */
  async executeWorkflow(workflowId, parameters = {}) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      return { success: false, error: `Workflow ${workflowId} not found` };
    }

    this.activeWorkflow = { id: workflowId, steps: [], rollback: [] };
    const results = [];

    try {
      for (const step of workflow.steps) {
        if (await this.shouldExecuteStep(step, results)) {
          const command = this.substituteParameters(step.command, { ...parameters, ...this.userPreferences });
          const options = step.fileContent ? { fileContent: this.substituteParameters(step.fileContent, parameters) } : {};
          
          const result = await this.commandExecutor.executeCommand(command, options);
          results.push({ stepId: step.id, ...result });

          // Store rollback command if applicable
          if (this.canRollback(step)) {
            this.activeWorkflow.rollback.push(this.generateRollbackCommand(step, command));
          }

          if (!result.success && step.critical) {
            await this.executeRollback();
            return { success: false, results, error: `Step ${step.id} failed` };
          }

          this.emit('step-completed', { stepId: step.id, result });
        }
      }

      this.activeWorkflow = null;
      this.updateUserPreferences(parameters);
      return { success: true, results };
    } catch (error) {
      await this.executeRollback();
      return { success: false, results, error: error.message };
    }
  }

  /**
   * Check if a step should be executed based on conditions
   * @param {Object} step - Workflow step
   * @param {Array} results - Previous step results
   * @returns {Promise<boolean>} Whether to execute the step
   */
  async shouldExecuteStep(step, results) {
    const conditions = {
      'always': () => true,
      'git-installed': async () => {
        try {
          await this.commandExecutor.executeCommand('git --version');
          return true;
        } catch {
          return false;
        }
      },
      'package.json-exists': async () => {
        try {
          await fs.access(path.join(this.commandExecutor.getCurrentDirectory(), 'package.json'));
          return true;
        } catch {
          return false;
        }
      },
      'build-success': () => results.length > 0 && results[results.length - 1].success
    };

    return conditions[step.condition]?.() || false;
  }

  /**
   * Substitute parameters in a command or content string
   * @param {string} template - Template string
   * @param {Object} parameters - Parameters to substitute
   * @returns {string} Substituted string
   */
  substituteParameters(template, parameters) {
    return template.replace(/{{(\w+)}}/g, (_, key) => parameters[key] || '');
  }

  /**
   * Check if a step can be rolled back
   * @param {Object} step - Workflow step
   * @returns {boolean} Whether rollback is possible
   */
  canRollback(step) {
    return step.command.startsWith('mkdir') || step.command.startsWith('touch') || step.command.includes('git init');
  }

  /**
   * Generate rollback command for a step
   * @param {Object} step - Workflow step
   * @param {string} originalCommand - Original command
   * @returns {string} Rollback command
   */
  generateRollbackCommand(step, originalCommand) {
    if (step.command.startsWith('mkdir')) {
      return `rm -rf ${originalCommand.split(' ').slice(-1)[0]}`;
    } else if (step.command.startsWith('touch')) {
      return `rm ${originalCommand.split(' ').slice(-1)[0]}`;
    } else if (step.command.includes('git init')) {
      return 'rm -rf .git';
    }
    return '';
  }

  /**
   * Execute rollback commands
   */
  async executeRollback() {
    if (!this.activeWorkflow) return;

    for (const rollbackCmd of this.activeWorkflow.rollback.reverse()) {
      if (rollbackCmd) {
        await this.commandExecutor.executeCommand(rollbackCmd);
      }
    }
    this.activeWorkflow = null;
  }

  /**
   * Update user preferences based on workflow execution
   * @param {Object} parameters - Workflow parameters
   */
  updateUserPreferences(parameters) {
    Object.entries(parameters).forEach(([key, value]) => {
      const prefKey = `workflow.${this.activeWorkflow?.id}.${key}`;
      const count = (this.userPreferences.get(prefKey)?.count || 0) + 1;
      this.userPreferences.set(prefKey, { value, count });
    });
    this.saveUserPreferences();
  }

  /**
   * Create a new user-defined workflow
   * @param {Object} workflow - Workflow definition
   */
  async createWorkflow(workflow) {
    if (!workflow.id || !workflow.steps) {
      throw new Error('Invalid workflow format');
    }
    this.workflows.set(workflow.id, workflow);
    await fs.writeFile(
      path.join(this.workflowDir, `${workflow.id}.json`),
      JSON.stringify(workflow, null, 2)
    );
  }

  /**
   * Get available workflows
   * @returns {Array} List of workflows
   */
  getWorkflows() {
    return Array.from(this.workflows.values());
  }
}

module.exports = WorkflowOrchestrator;