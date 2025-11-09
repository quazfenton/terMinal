/**
 * MCP Client
 * Model Context Protocol client for external tool integration
 */

const { spawn } = require('child_process');
const EventEmitter = require('events');

class MCPClient extends EventEmitter {
  constructor() {
    super();
    this.servers = new Map();
    this.tools = new Map();
    this.connections = new Map();
  }

  async connectToServer(serverConfig) {
    const { name, command, args = [], env = {} } = serverConfig;
    
    try {
      const process = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...env }
      });

      const connection = {
        process,
        name,
        status: 'connecting',
        tools: new Map()
      };

      this.connections.set(name, connection);
      
      // Setup communication
      this.setupCommunication(connection);
      
      // Initialize handshake
      await this.initializeConnection(connection);
      
      connection.status = 'connected';
      this.emit('serverConnected', name);
      
      return connection;
    } catch (error) {
      this.emit('serverError', name, error);
      throw error;
    }
  }

  setupCommunication(connection) {
    let buffer = '';
    
    connection.process.stdout.on('data', (data) => {
      buffer += data.toString();
      
      // Process complete JSON messages
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        
        if (line.trim()) {
          this.handleMessage(connection, line);
        }
      }
    });

    connection.process.stderr.on('data', (data) => {
      console.warn(`MCP Server ${connection.name} stderr:`, data.toString());
    });

    connection.process.on('close', (code) => {
      connection.status = 'disconnected';
      this.emit('serverDisconnected', connection.name, code);
    });
  }

  async initializeConnection(connection) {
    // Send initialization message
    const initMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {}
        },
        clientInfo: {
          name: 'ai-terminal',
          version: '1.0.0'
        }
      }
    };

    await this.sendMessage(connection, initMessage);
  }

  async sendMessage(connection, message) {
    return new Promise((resolve, reject) => {
      const messageStr = JSON.stringify(message) + '\n';
      
      connection.process.stdin.write(messageStr, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  handleMessage(connection, messageStr) {
    try {
      const message = JSON.parse(messageStr);
      
      if (message.method === 'tools/list') {
        this.handleToolsList(connection, message);
      } else if (message.method === 'notifications/tools/list_changed') {
        this.refreshTools(connection);
      }
      
      this.emit('message', connection.name, message);
    } catch (error) {
      console.error('Failed to parse MCP message:', error);
    }
  }

  async handleToolsList(connection, message) {
    if (message.result && message.result.tools) {
      for (const tool of message.result.tools) {
        connection.tools.set(tool.name, tool);
        this.tools.set(`${connection.name}:${tool.name}`, {
          ...tool,
          serverName: connection.name
        });
      }
    }
  }

  async callTool(toolName, args = {}) {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool '${toolName}' not found`);
    }

    const connection = this.connections.get(tool.serverName);
    if (!connection || connection.status !== 'connected') {
      throw new Error(`Server '${tool.serverName}' not connected`);
    }

    const message = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: tool.name,
        arguments: args
      }
    };

    await this.sendMessage(connection, message);
    
    // Return promise that resolves when response is received
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Tool call timeout'));
      }, 30000);

      const handler = (serverName, response) => {
        if (serverName === tool.serverName && response.id === message.id) {
          clearTimeout(timeout);
          this.removeListener('message', handler);
          
          if (response.error) {
            reject(new Error(response.error.message));
          } else {
            resolve(response.result);
          }
        }
      };

      this.on('message', handler);
    });
  }

  getAvailableTools() {
    return Array.from(this.tools.values());
  }

  async disconnectServer(serverName) {
    const connection = this.connections.get(serverName);
    if (connection && connection.process) {
      connection.process.kill();
      this.connections.delete(serverName);
      
      // Remove tools from this server
      for (const [toolName, tool] of this.tools) {
        if (tool.serverName === serverName) {
          this.tools.delete(toolName);
        }
      }
    }
  }

  async disconnectAll() {
    for (const serverName of this.connections.keys()) {
      await this.disconnectServer(serverName);
    }
  }
}

module.exports = MCPClient;
