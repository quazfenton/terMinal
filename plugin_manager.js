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

      for (const file of pluginFiles) {
        if (file.endsWith('.js')) {
          try {
            const pluginPath = path.join(this.pluginsDirectory, file);
            const PluginClass = require(pluginPath);
            const pluginInstance = new PluginClass(this.commandExecutor);
            
            if (typeof pluginInstance.getName === 'function' && typeof pluginInstance.getCommands === 'function') {
              const pluginName = pluginInstance.getName();
              this.plugins.set(pluginName, pluginInstance);
              console.log(`Loaded plugin: ${pluginName}`);
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
   * Find a plugin that can handle the given command
   * @param {string} command - The command to execute
   * @returns {Object|null} The plugin and matched command info, or null
   */
  findPluginForCommand(command) {
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
