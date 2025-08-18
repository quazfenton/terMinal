const fs = require('fs').promises;
const path = require('path');

class PluginManager {
  constructor(commandExecutor) {
    this.commandExecutor = commandExecutor;
    this.pluginsDirectory = path.join(__dirname, 'plugins');
    this.commandRegistry = []; // A simple array to hold all command objects
  }

  /**
   * Load all plugins from the plugins directory.
   */
  async loadPlugins() {
    try {
      const pluginFiles = await fs.readdir(this.pluginsDirectory);
      
      for (const file of pluginFiles) {
        if (file.endsWith('.js')) {
          try {
            const pluginPath = path.join(this.pluginsDirectory, file);
            const PluginClass = require(pluginPath);
            const pluginInstance = new PluginClass(this.commandExecutor);
            
            if (typeof pluginInstance.getCommands === 'function') {
              const commands = pluginInstance.getCommands();
              commands.forEach(cmd => {
                // Store the regex, handler, and the plugin instance itself
                this.commandRegistry.push({ ...cmd, plugin: pluginInstance });
              });
              console.log(`Loaded plugin: ${file} with ${commands.length} commands`);
            } else {
                console.warn(`Plugin ${file} does not have a getCommands method.`);
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
   * Find a command handler for the given input string.
   * @param {string} input - The user's input string.
   * @returns {Object|null} The matched command info, or null.
   */
  findCommandHandler(input) {
    for (const cmd of this.commandRegistry) {
      const match = input.match(cmd.command); // cmd.command is the regex
      if (match) {
        return {
          handler: cmd.handler, // The function to execute
          match: match,         // The result of the regex match
          plugin: cmd.plugin    // The plugin instance
        };
      }
    }
    return null;
  }

  /**
   * Execute a plugin command.
   * @param {Object} commandInfo - The command info from findCommandHandler.
   * @returns {Promise<Object>} The result of the plugin execution.
   */
  async executePluginCommand(commandInfo) {
    const { handler, match, plugin } = commandInfo;
    try {
      // The handler is already bound to the plugin instance
      return await handler(match);
    } catch (error) {
      console.error(`Error executing plugin command:`, error);
      return {
        success: false,
        output: `Plugin error: ${error.message}`,
      };
    }
  }
}

module.exports = PluginManager;