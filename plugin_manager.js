/**
 * Plugin Manager
 * 
 * Handles loading, registering, and executing plugins for the AI Terminal.
 */

const fs = require('fs').promises;
const path = require('path');

class PluginManager {
  constructor(commandExecutor) {
    this.plugins = new Map();
    this.commandExecutor = commandExecutor;
    this.pluginsDirectory = path.join(__dirname, 'plugins');
  }

  /**
   * Load all plugins from the plugins directory
   */
  async loadPlugins() {
    try {
      await fs.mkdir(this.pluginsDirectory, { recursive: true });
      const pluginFiles = await fs.readdir(this.pluginsDirectory);

      // Initialize command registry
      this.commandRegistry = new Map();
      
      for (const file of pluginFiles) {
        if (file.endsWith('.js')) {
          try {
            const pluginPath = path.join(this.pluginsDirectory, file);
            const PluginClass = require(pluginPath);
            const pluginInstance = new PluginClass();
            
            if (typeof pluginInstance.getName === 'function' &&
                typeof pluginInstance.getCommands === 'function') {
              const pluginName = pluginInstance.getName();
              
              // Initialize plugin with terminal context
              if (typeof pluginInstance.initialize === 'function') {
                pluginInstance.initialize(this.commandExecutor);
              }
              
              this.plugins.set(pluginName, pluginInstance);
              console.log(`Loaded plugin: ${pluginName} with ${pluginInstance.getCommands().length} commands`);
              
              // Register plugin commands
              const commands = pluginInstance.getCommands();
              commands.forEach(cmd => {
                this.commandRegistry.set(cmd.name, cmd);
              });
            }
          } catch (error) {
            console.error(`Failed to load plugin ${file}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Error loading plugins:', error);
    }
  }

  /**
   * Find a command handler for the given command
   * @param {string} command - The command to execute
   * @returns {Object|null} The matched command info, or null
   */
  findCommandHandler(command) {
    // First try direct command name match
    const commandName = command.split(' ')[0];
    if (this.commandRegistry.has(commandName)) {
      const cmd = this.commandRegistry.get(commandName);
      const match = command.match(cmd.pattern);
      if (match) {
        return {
          command: cmd,
          match
        };
      }
    }
    
    // Then try pattern matching across all plugins
    for (const [pluginName, plugin] of this.plugins.entries()) {
      const commands = plugin.getCommands();
      for (const cmd of commands) {
        const match = command.match(cmd.pattern);
        if (match) {
          return {
            plugin,
            command: cmd,
            match
          };
        }
      }
    }
    return null;
  }

  /**
   * Execute a plugin command
   * @param {Object} pluginInfo - The plugin and command info from findPluginForCommand
   * @returns {Promise<Object>} The result of the plugin execution
   */
  async executePluginCommand(pluginInfo) {
    const { plugin, command, match } = pluginInfo;
    try {
      return await command.execute(match);
    } catch (error) {
      console.error(`Error executing plugin command '${command.name}':`, error);
      return {
        success: false,
        output: `Plugin error: ${error.message}`
      };
    }
  }
}

module.exports = PluginManager;
