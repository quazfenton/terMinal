/**
 * Workflow Engine
 * Advanced workflow automation with conditional logic and scheduling
 */

class WorkflowEngine {
  constructor(commandExecutor, mcpClient) {
    this.commandExecutor = commandExecutor;
    this.mcpClient = mcpClient;
    this.workflows = new Map();
    this.runningWorkflows = new Map();
    this.scheduledWorkflows = new Map();
  }

  createWorkflow(name, definition) {
    const workflow = {
      name,
      steps: definition.steps || [],
      conditions: definition.conditions || {},
      schedule: definition.schedule,
      variables: definition.variables || {},
      created: Date.now()
    };

    this.workflows.set(name, workflow);
    return workflow;
  }

  async executeWorkflow(name, context = {}) {
    const workflow = this.workflows.get(name);
    if (!workflow) {
      throw new Error(`Workflow '${name}' not found`);
    }

    const executionId = `${name}_${Date.now()}`;
    const execution = {
      id: executionId,
      workflow,
      context: { ...workflow.variables, ...context },
      currentStep: 0,
      status: 'running',
      results: [],
      startTime: Date.now()
    };

    this.runningWorkflows.set(executionId, execution);

    try {
      await this.runWorkflowSteps(execution);
      execution.status = 'completed';
    } catch (error) {
      execution.status = 'failed';
      execution.error = error.message;
      throw error;
    } finally {
      execution.endTime = Date.now();
      this.runningWorkflows.delete(executionId);
    }

    return execution;
  }

  async runWorkflowSteps(execution) {
    for (let i = 0; i < execution.workflow.steps.length; i++) {
      execution.currentStep = i;
      const step = execution.workflow.steps[i];
      
      // Check conditions
      if (step.condition && !this.evaluateCondition(step.condition, execution.context)) {
        continue;
      }

      const result = await this.executeStep(step, execution.context);
      execution.results.push(result);

      // Update context with step results
      if (step.outputVariable && result.success) {
        execution.context[step.outputVariable] = result.output;
      }

      // Handle step failure
      if (!result.success && step.onError !== 'continue') {
        throw new Error(`Step ${i + 1} failed: ${result.error}`);
      }
    }
  }

  async executeStep(step, context) {
    switch (step.type) {
      case 'command':
        return await this.executeCommandStep(step, context);
      case 'mcp_tool':
        return await this.executeMCPStep(step, context);
      case 'condition':
        return await this.executeConditionStep(step, context);
      case 'loop':
        return await this.executeLoopStep(step, context);
      case 'parallel':
        return await this.executeParallelStep(step, context);
      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  async executeCommandStep(step, context) {
    const command = this.interpolateVariables(step.command, context);
    
    try {
      const result = await this.commandExecutor.executeCommand(command);
      return {
        success: result.success,
        output: result.output,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async executeMCPStep(step, context) {
    try {
      const args = this.interpolateVariables(step.args || {}, context);
      const result = await this.mcpClient.callTool(step.tool, args);
      
      return {
        success: true,
        output: result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async executeConditionStep(step, context) {
    const conditionResult = this.evaluateCondition(step.condition, context);
    
    if (conditionResult && step.then) {
      return await this.executeStep(step.then, context);
    } else if (!conditionResult && step.else) {
      return await this.executeStep(step.else, context);
    }
    
    return { success: true, output: conditionResult };
  }

  async executeLoopStep(step, context) {
    const results = [];
    const items = this.resolveValue(step.items, context);
    
    if (!Array.isArray(items)) {
      throw new Error('Loop items must be an array');
    }

    for (const item of items) {
      const loopContext = { ...context, [step.itemVariable || 'item']: item };
      const result = await this.executeStep(step.body, loopContext);
      results.push(result);
      
      if (!result.success && step.onError === 'break') {
        break;
      }
    }
    
    return {
      success: results.every(r => r.success),
      output: results
    };
  }

  async executeParallelStep(step, context) {
    const promises = step.steps.map(parallelStep => 
      this.executeStep(parallelStep, context)
    );
    
    const results = await Promise.allSettled(promises);
    
    return {
      success: results.every(r => r.status === 'fulfilled' && r.value.success),
      output: results.map(r => r.status === 'fulfilled' ? r.value : { success: false, error: r.reason })
    };
  }

  evaluateCondition(condition, context) {
    // Simple condition evaluation
    if (typeof condition === 'string') {
      return this.resolveValue(condition, context);
    }
    
    if (condition.equals) {
      const left = this.resolveValue(condition.equals[0], context);
      const right = this.resolveValue(condition.equals[1], context);
      return left === right;
    }
    
    if (condition.exists) {
      return this.resolveValue(condition.exists, context) !== undefined;
    }
    
    return Boolean(condition);
  }

  interpolateVariables(template, context) {
    if (typeof template === 'string') {
      return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return context[key] || match;
      });
    }
    
    if (typeof template === 'object' && template !== null) {
      const result = {};
      for (const [key, value] of Object.entries(template)) {
        result[key] = this.interpolateVariables(value, context);
      }
      return result;
    }
    
    return template;
  }

  resolveValue(value, context) {
    if (typeof value === 'string' && value.startsWith('$')) {
      return context[value.substring(1)];
    }
    return value;
  }

  scheduleWorkflow(name, cronExpression) {
    // Simple scheduling - in production would use a proper cron library
    const workflow = this.workflows.get(name);
    if (!workflow) {
      throw new Error(`Workflow '${name}' not found`);
    }

    this.scheduledWorkflows.set(name, {
      workflow: name,
      cron: cronExpression,
      nextRun: this.calculateNextRun(cronExpression)
    });
  }

  calculateNextRun(cronExpression) {
    // Simplified - would use proper cron parsing in production
    return Date.now() + 60000; // 1 minute from now
  }

  getWorkflows() {
    return Array.from(this.workflows.values());
  }

  getRunningWorkflows() {
    return Array.from(this.runningWorkflows.values());
  }
}

module.exports = WorkflowEngine;
