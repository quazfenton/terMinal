/**
 * Remote Executor
 * Secure remote command execution via SSH
 */

const { spawn } = require('child_process');
const crypto = require('crypto');

class RemoteExecutor {
  constructor(securityValidator) {
    this.securityValidator = securityValidator;
    this.connections = new Map();
    this.sessions = new Map();
  }

  async createConnection(config) {
    const { name, host, port = 22, username, keyPath, password } = config;
    
    if (!name || !host || !username) {
      throw new Error('Missing required connection parameters');
    }

    const connectionId = crypto.randomUUID();
    const connection = {
      id: connectionId,
      name,
      host,
      port,
      username,
      keyPath,
      status: 'disconnected',
      lastUsed: null
    };

    // Test connection
    try {
      await this.testConnection(connection);
      connection.status = 'connected';
      this.connections.set(connectionId, connection);
      
      return connectionId;
    } catch (error) {
      throw new Error(`Failed to connect to ${host}: ${error.message}`);
    }
  }

  async testConnection(connection) {
    return new Promise((resolve, reject) => {
      const args = [
        '-o', 'ConnectTimeout=10',
        '-o', 'BatchMode=yes',
        '-p', connection.port.toString()
      ];

      if (connection.keyPath) {
        args.push('-i', connection.keyPath);
      }

      args.push(`${connection.username}@${connection.host}`, 'echo "test"');

      const ssh = spawn('ssh', args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      let error = '';

      ssh.stdout.on('data', (data) => {
        output += data.toString();
      });

      ssh.stderr.on('data', (data) => {
        error += data.toString();
      });

      ssh.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(error || `SSH connection failed with code ${code}`));
        }
      });

      ssh.on('error', (err) => {
        reject(err);
      });
    });
  }

  async executeRemoteCommand(connectionId, command, options = {}) {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }

    // Security validation
    const validation = this.securityValidator.validateInput(command);
    if (!validation.isValid) {
      throw new Error(`Command blocked: ${validation.errors.join(', ')}`);
    }

    // Update last used
    connection.lastUsed = Date.now();

    return new Promise((resolve, reject) => {
      const args = [
        '-o', 'ConnectTimeout=30',
        '-p', connection.port.toString()
      ];

      if (connection.keyPath) {
        args.push('-i', connection.keyPath);
      }

      if (options.tty) {
        args.push('-t');
      }

      args.push(`${connection.username}@${connection.host}`, command);

      const ssh = spawn('ssh', args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      ssh.stdout.on('data', (data) => {
        stdout += data.toString();
        if (options.onOutput) {
          options.onOutput('stdout', data.toString());
        }
      });

      ssh.stderr.on('data', (data) => {
        stderr += data.toString();
        if (options.onOutput) {
          options.onOutput('stderr', data.toString());
        }
      });

      ssh.on('close', (code) => {
        resolve({
          success: code === 0,
          exitCode: code,
          stdout,
          stderr,
          command,
          connection: connection.name
        });
      });

      ssh.on('error', (error) => {
        reject(new Error(`SSH execution failed: ${error.message}`));
      });

      // Set timeout
      const timeout = setTimeout(() => {
        ssh.kill();
        reject(new Error('Remote command timeout'));
      }, options.timeout || 60000);

      ssh.on('close', () => {
        clearTimeout(timeout);
      });
    });
  }

  async executeRemoteScript(connectionId, scriptContent, options = {}) {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }

    // Create temporary script file
    const scriptName = `tmp_script_${Date.now()}.sh`;
    const remotePath = `/tmp/${scriptName}`;

    try {
      // Upload script
      await this.uploadContent(connectionId, scriptContent, remotePath);
      
      // Make executable
      await this.executeRemoteCommand(connectionId, `chmod +x ${remotePath}`);
      
      // Execute script
      const result = await this.executeRemoteCommand(connectionId, remotePath, options);
      
      // Cleanup
      await this.executeRemoteCommand(connectionId, `rm -f ${remotePath}`);
      
      return result;
    } catch (error) {
      // Attempt cleanup on error
      try {
        await this.executeRemoteCommand(connectionId, `rm -f ${remotePath}`);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      
      throw error;
    }
  }

  async uploadContent(connectionId, content, remotePath) {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }

    return new Promise((resolve, reject) => {
      const args = [
        '-o', 'ConnectTimeout=30',
        '-p', connection.port.toString()
      ];

      if (connection.keyPath) {
        args.push('-i', connection.keyPath);
      }

      args.push(`${connection.username}@${connection.host}:${remotePath}`);

      const scp = spawn('ssh', [
        ...args.slice(0, -1),
        `${connection.username}@${connection.host}`,
        `cat > ${remotePath}`
      ], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      scp.stdin.write(content);
      scp.stdin.end();

      let stderr = '';

      scp.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      scp.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Upload failed: ${stderr}`));
        }
      });

      scp.on('error', (error) => {
        reject(error);
      });
    });
  }

  async closeConnection(connectionId) {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.status = 'disconnected';
      this.connections.delete(connectionId);
      return true;
    }
    return false;
  }

  getConnections() {
    return Array.from(this.connections.values()).map(conn => ({
      id: conn.id,
      name: conn.name,
      host: conn.host,
      username: conn.username,
      status: conn.status,
      lastUsed: conn.lastUsed
    }));
  }

  getConnection(connectionId) {
    const conn = this.connections.get(connectionId);
    if (!conn) return null;

    return {
      id: conn.id,
      name: conn.name,
      host: conn.host,
      username: conn.username,
      status: conn.status,
      lastUsed: conn.lastUsed
    };
  }
}

module.exports = RemoteExecutor;
