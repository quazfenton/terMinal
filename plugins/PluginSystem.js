/**
 * Enhanced Plugin System
 * Secure plugin management with lifecycle and sandboxing
 */

const fs = require('fs').promises;
const path = require('path');
const vm = require('vm');

class PluginSystem {
  constructor(securityValidator) {
    this.securityValidator = securityValidator;
    this.plugins = new Map();
    this.sandboxes = new Map();
    this.pluginStates = new Map();
    this.pluginConfigs = new Map();
  }

  async loadPlugin(pluginPath, config = {}) {
    try {
      const pluginName = path.basename(pluginPath, '.js');
      const pluginCode = await fs.readFile(pluginPath, 'utf8');
      
      // Security validation
      if (!this.validatePluginCode(pluginCode)) {
        throw new Error(`Plugin '${pluginName}' failed security validation`);
      }

      // Create secure sandbox
      const sandbox = this.createSandbox(pluginName);
      
      // Execute plugin in sandbox
      const script = new vm.Script(pluginCode, { filename: pluginPath });
      script.runInContext(sandbox);
      
      // Get plugin class
      const PluginClass = sandbox.module.exports;
      if (typeof PluginClass !== 'function') {
        throw new Error(`Plugin '${pluginName}' must export a class`);
      }

      // Initialize plugin
      const pluginInstance = new PluginClass(config);
      
      // Validate plugin interface
      this.validatePluginInterface(pluginInstance);
      
      // Store plugin
      this.plugins.set(pluginName, pluginInstance);
      this.sandboxes.set(pluginName, sandbox);
      this.pluginStates.set(pluginName, 'loaded');
      this.pluginConfigs.set(pluginName, config);
      
      // Initialize plugin
      if (typeof pluginInstance.initialize === 'function') {
        await pluginInstance.initialize();
        this.pluginStates.set(pluginName, 'initialized');
      }

      return pluginInstance;
    } catch (error) {
      throw new Error(`Failed to load plugin: ${error.message}`);
    }
  }

  createSandbox(pluginName) {
    const sandbox = {
      console: {
        log: (...args) => console.log(`[Plugin:${pluginName}]`, ...args),
        warn: (...args) => console.warn(`[Plugin:${pluginName}]`, ...args),
        error: (...args) => console.error(`[Plugin:${pluginName}]`, ...args)
      },
      require: this.createSecureRequire(pluginName),
      module: { exports: {} },
      exports: {},
      Buffer,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      process: {
        env: { NODE_ENV: process.env.NODE_ENV },
        platform: process.platform,
        version: process.version
      }
    };

    // Link exports
    sandbox.exports = sandbox.module.exports;
    
    return vm.createContext(sandbox);
  }

  createSecureRequire(pluginName) {
    const allowedModules = new Set([
      'path', 'crypto', 'util', 'events', 'stream'
    ]);

    return (moduleName) => {
      if (allowedModules.has(moduleName)) {
        return require(moduleName);
      }
      
      throw new Error(`Module '${moduleName}' not allowed in plugin '${pluginName}'`);
    };
  }

  validatePluginCode(code) {
    // Basic security checks
    const dangerousPatterns = [
      /require\s*\(\s*['"]fs['"]/, // File system access
      /require\s*\(\s*['"]child_process['"]/, // Process execution
      /require\s*\(\s*['"]net['"]/, // Network access
      /eval\s*\(/, // Code evaluation
      /Function\s*\(/, // Dynamic function creation
      /process\.exit/, // Process termination
      /global\./, // Global object access
    ];

    return !dangerousPatterns.some(pattern => pattern.test(code));
  }

  validatePluginInterface(plugin) {
    const requiredMethods = ['getName', 'getCommands'];
    
    for (const method of requiredMethods) {
      if (typeof plugin[method] !== 'function') {
        throw new Error(`Plugin must implement '${method}' method`);
      }
    }

    // Validate commands
    const commands = plugin.getCommands();
    if (!Array.isArray(commands)) {
      throw new Error('Plugin getCommands() must return an array');
    }

    for (const command of commands) {
      if (!command.name || !command.execute) {
        throw new Error('Plugin commands must have name and execute properties');
      }
    }
  }

  async executePluginCommand(pluginName, commandName, args = {}) {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      throw new Error(`Plugin '${pluginName}' not found`);
    }

    const state = this.pluginStates.get(pluginName);
    if (state !== 'initialized') {
      throw new Error(`Plugin '${pluginName}' not initialized`);
    }

    const commands = plugin.getCommands();
    const command = commands.find(cmd => cmd.name === commandName);
    
    if (!command) {
      throw new Error(`Command '${commandName}' not found in plugin '${pluginName}'`);
    }

    try {
      // Execute with timeout
      const timeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Plugin command timeout')), 30000);
      });

      const execution = Promise.resolve(command.execute(args));
      const result = await Promise.race([execution, timeout]);
      
      return {
        success: true,
        result,
        plugin: pluginName,
        command: commandName
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        plugin: pluginName,
        command: commandName
      };
    }
  }

  async unloadPlugin(pluginName) {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) return false;

    try {
      // Cleanup plugin
      if (typeof plugin.cleanup === 'function') {
        await plugin.cleanup();
      }

      // Remove from maps
      this.plugins.delete(pluginName);
      this.sandboxes.delete(pluginName);
      this.pluginStates.delete(pluginName);
      this.pluginConfigs.delete(pluginName);

      return true;
    } catch (error) {
      console.error(`Error unloading plugin '${pluginName}':`, error);
      return false;
    }
  }

  getPluginInfo(pluginName) {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) return null;

    return {
      name: pluginName,
      state: this.pluginStates.get(pluginName),
      config: this.pluginConfigs.get(pluginName),
      commands: plugin.getCommands().map(cmd => ({
        name: cmd.name,
        description: cmd.description
      }))
    };
  }

  getAllPlugins() {
    return Array.from(this.plugins.keys()).map(name => this.getPluginInfo(name));
  }

  async reloadPlugin(pluginName) {
    const config = this.pluginConfigs.get(pluginName);
    await this.unloadPlugin(pluginName);
    
    // Reload would need the original path - simplified for now
    return true;
  }
}

module.exports = PluginSystem;
