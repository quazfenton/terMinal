/**
 * Advanced Features Integration Tests
 * Tests for AI enhancements, MCP, workflows, plugins, and remote execution
 */

const AIProviderManager = require('../../ai/AIProviderManager');
const PromptTemplateEngine = require('../../ai/PromptTemplateEngine');
const ResponseProcessor = require('../../ai/ResponseProcessor');
const MCPClient = require('../../mcp/MCPClient');
const WorkflowEngine = require('../../automation/WorkflowEngine');
const PluginSystem = require('../../plugins/PluginSystem');
const RemoteExecutor = require('../../remote/RemoteExecutor');

// Mock dependencies
jest.mock('child_process');
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    readdir: jest.fn()
  }
}));

describe('Advanced Features Integration', () => {
  let aiProviderManager;
  let promptEngine;
  let responseProcessor;
  let mcpClient;
  let workflowEngine;
  let pluginSystem;
  let remoteExecutor;

  beforeEach(() => {
    const mockSecureConfig = {
      validateApiKey: jest.fn(() => true),
      get: jest.fn(() => 'mock-key')
    };

    const mockCommandExecutor = {
      executeCommand: jest.fn(() => Promise.resolve({ success: true, output: 'test' }))
    };

    const mockSecurityValidator = {
      validateInput: jest.fn(() => ({ isValid: true, sanitized: 'test command' }))
    };

    aiProviderManager = new AIProviderManager(mockSecureConfig);
    promptEngine = new PromptTemplateEngine();
    responseProcessor = new ResponseProcessor();
    mcpClient = new MCPClient();
    workflowEngine = new WorkflowEngine(mockCommandExecutor, mcpClient);
    pluginSystem = new PluginSystem(mockSecurityValidator);
    remoteExecutor = new RemoteExecutor(mockSecurityValidator);
  });

  describe('AI Provider Management', () => {
    test('manages multiple providers with fallback', async () => {
      const mockProvider = {
        getApiKey: () => 'test-key',
        callAPI: jest.fn(() => Promise.resolve({ success: true }))
      };

      aiProviderManager.registerProvider('test', mockProvider);
      
      const provider = await aiProviderManager.getAvailableProvider('test');
      expect(provider).toBe(mockProvider);
    });

    test('falls back to healthy providers', async () => {
      const healthyProvider = {
        getApiKey: () => 'healthy-key',
        callAPI: jest.fn(() => Promise.resolve({ success: true }))
      };

      const unhealthyProvider = {
        getApiKey: () => null,
        callAPI: jest.fn(() => Promise.reject(new Error('Failed')))
      };

      aiProviderManager.registerProvider('healthy', healthyProvider);
      aiProviderManager.registerProvider('unhealthy', unhealthyProvider);
      aiProviderManager.fallbackOrder = ['unhealthy', 'healthy'];

      const provider = await aiProviderManager.getAvailableProvider();
      expect(provider).toBe(healthyProvider);
    });
  });

  describe('Prompt Template Engine', () => {
    test('builds context-aware prompts', async () => {
      const context = {
        currentDir: '/test',
        platform: 'linux'
      };

      const result = await promptEngine.buildPrompt('command_generation', 'list files', context);
      
      expect(result.systemPrompt).toContain('shell commands');
      expect(result.userPrompt).toContain('list files');
      expect(result.userPrompt).toContain('linux');
    });

    test('selects appropriate templates', () => {
      expect(promptEngine.selectTemplate('create a file', {})).toBe('file_operation');
      expect(promptEngine.selectTemplate('write code', { projectType: 'node' })).toBe('code_assistance');
      expect(promptEngine.selectTemplate('run command', {})).toBe('command_generation');
    });
  });

  describe('Response Processor', () => {
    test('processes AI responses with validation', async () => {
      const mockResponse = `
        \`\`\`json
        {
          "commandSequences": [
            {
              "rank": 1,
              "commands": ["ls -la"],
              "description": "List files"
            }
          ]
        }
        \`\`\`
      `;

      const result = await responseProcessor.process(mockResponse);
      
      expect(result.success).toBe(true);
      expect(result.data.commandSequences).toHaveLength(1);
      expect(result.data.commandSequences[0].commands).toEqual(['ls -la']);
    });

    test('filters dangerous commands', async () => {
      const dangerousResponse = {
        commandSequences: [
          {
            rank: 1,
            commands: ['rm -rf /'],
            description: 'Dangerous command'
          },
          {
            rank: 2,
            commands: ['ls -la'],
            description: 'Safe command'
          }
        ]
      };

      const result = await responseProcessor.process(dangerousResponse);
      
      expect(result.data.commandSequences).toHaveLength(1);
      expect(result.data.commandSequences[0].commands).toEqual(['ls -la']);
    });
  });

  describe('Workflow Engine', () => {
    test('creates and executes workflows', async () => {
      const workflow = workflowEngine.createWorkflow('test-workflow', {
        steps: [
          {
            type: 'command',
            command: 'echo "hello"'
          },
          {
            type: 'command',
            command: 'echo "world"'
          }
        ]
      });

      expect(workflow.name).toBe('test-workflow');
      expect(workflow.steps).toHaveLength(2);

      const execution = await workflowEngine.executeWorkflow('test-workflow');
      
      expect(execution.status).toBe('completed');
      expect(execution.results).toHaveLength(2);
    });

    test('handles conditional steps', async () => {
      workflowEngine.createWorkflow('conditional-workflow', {
        steps: [
          {
            type: 'condition',
            condition: { equals: ['$test', 'true'] },
            then: {
              type: 'command',
              command: 'echo "condition met"'
            }
          }
        ],
        variables: { test: 'true' }
      });

      const execution = await workflowEngine.executeWorkflow('conditional-workflow');
      
      expect(execution.status).toBe('completed');
      expect(execution.results[0].success).toBe(true);
    });
  });

  describe('Plugin System', () => {
    test('validates plugin security', () => {
      const safeCode = `
        class TestPlugin {
          getName() { return 'test'; }
          getCommands() { return []; }
        }
        module.exports = TestPlugin;
      `;

      const dangerousCode = `
        const fs = require('fs');
        class DangerousPlugin {
          getName() { return 'dangerous'; }
          getCommands() { return []; }
        }
        module.exports = DangerousPlugin;
      `;

      expect(pluginSystem.validatePluginCode(safeCode)).toBe(true);
      expect(pluginSystem.validatePluginCode(dangerousCode)).toBe(false);
    });

    test('creates secure sandbox for plugins', () => {
      const sandbox = pluginSystem.createSandbox('test-plugin');
      
      expect(sandbox.console).toBeDefined();
      expect(sandbox.require).toBeDefined();
      expect(sandbox.module).toBeDefined();
      
      // Should not have access to dangerous modules
      expect(() => sandbox.require('fs')).toThrow();
    });
  });

  describe('Integration Workflows', () => {
    test('AI to workflow execution pipeline', async () => {
      // Mock AI response
      const aiResponse = {
        commandSequences: [
          {
            rank: 1,
            commands: ['mkdir test-dir', 'cd test-dir', 'touch file.txt'],
            description: 'Create test structure'
          }
        ]
      };

      // Process AI response
      const processed = await responseProcessor.process(aiResponse);
      expect(processed.success).toBe(true);

      // Create workflow from AI response
      const commands = processed.data.commandSequences[0].commands;
      const workflowDef = {
        steps: commands.map(cmd => ({
          type: 'command',
          command: cmd
        }))
      };

      workflowEngine.createWorkflow('ai-generated', workflowDef);
      const execution = await workflowEngine.executeWorkflow('ai-generated');

      expect(execution.status).toBe('completed');
      expect(execution.results).toHaveLength(3);
    });

    test('MCP tool integration in workflows', async () => {
      // Mock MCP tool
      mcpClient.tools.set('test:file_read', {
        name: 'file_read',
        serverName: 'test'
      });

      // Create workflow with MCP step
      workflowEngine.createWorkflow('mcp-workflow', {
        steps: [
          {
            type: 'mcp_tool',
            tool: 'test:file_read',
            args: { path: '/test/file.txt' }
          }
        ]
      });

      // Mock MCP call
      mcpClient.callTool = jest.fn(() => Promise.resolve({ content: 'file content' }));

      const execution = await workflowEngine.executeWorkflow('mcp-workflow');
      
      expect(execution.status).toBe('completed');
      expect(mcpClient.callTool).toHaveBeenCalledWith('test:file_read', { path: '/test/file.txt' });
    });
  });

  describe('Error Handling and Recovery', () => {
    test('handles AI provider failures gracefully', async () => {
      const failingProvider = {
        getApiKey: () => 'test-key',
        callAPI: jest.fn(() => Promise.reject(new Error('API Error')))
      };

      aiProviderManager.registerProvider('failing', failingProvider);
      
      try {
        await aiProviderManager.callWithFallback('callAPI');
      } catch (error) {
        expect(error.message).toContain('failed');
      }
    });

    test('recovers from workflow step failures', async () => {
      const mockCommandExecutor = {
        executeCommand: jest.fn()
          .mockResolvedValueOnce({ success: false, error: 'Command failed' })
          .mockResolvedValueOnce({ success: true, output: 'Success' })
      };

      const engine = new WorkflowEngine(mockCommandExecutor, mcpClient);
      
      engine.createWorkflow('recovery-test', {
        steps: [
          {
            type: 'command',
            command: 'failing-command',
            onError: 'continue'
          },
          {
            type: 'command',
            command: 'success-command'
          }
        ]
      });

      const execution = await engine.executeWorkflow('recovery-test');
      
      expect(execution.status).toBe('completed');
      expect(execution.results).toHaveLength(2);
      expect(execution.results[0].success).toBe(false);
      expect(execution.results[1].success).toBe(true);
    });
  });
});
