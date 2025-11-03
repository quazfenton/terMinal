const fs = require('fs').promises;
const path = require('path');

class PluginManager {
  constructor(commandExecutor) {
    this.commandExecutor = commandExecutor;
    this.pluginsDirectory = path.join(__dirname, 'plugins');
    this.commandRegistry = []; // A simple array to hold all command objects
    this.plugins = new Map(); // Store plugins by name
    this.enabledPlugins = new Set(); // Track enabled plugins
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
            
            if (typeof pluginInstance.getCommands === 'function' && typeof pluginInstance.getName === 'function') {
              const pluginName = pluginInstance.getName();
              const commands = pluginInstance.getCommands();
              
              // Store the plugin instance
              this.plugins.set(pluginName, pluginInstance);
              this.enabledPlugins.add(pluginName);
              
              commands.forEach(cmd => {
                // Store the command with the plugin instance
                this.commandRegistry.push({ ...cmd, plugin: pluginInstance });
              });
              console.log(`Loaded plugin: ${file} with ${commands.length} commands`);
            } else {
                console.warn(`Plugin ${file} does not have required methods (getName, getCommands).`);
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
   * Find a plugin command for the given input string.
   * @param {string} input - The user's input string.
   * @returns {Object|null} The matched command info, or null.
   */
  findPluginForCommand(input) {
    for (const cmd of this.commandRegistry) {
      if (cmd.pattern) { // Use pattern instead of command
        const match = input.match(cmd.pattern);
        if (match) {
          return {
            command: cmd,           // The command object with execute function
            match: match,           // The result of the regex match
            plugin: cmd.plugin      // The plugin instance
          };
        }
      }
    }
    return null;
  }

  /**
   * Execute a plugin command.
   * @param {Object} commandInfo - The command info from findPluginForCommand.
   * @returns {Promise<Object>} The result of the plugin execution.
   */
  async executePluginCommand(commandInfo) {
    const { command, match, plugin } = commandInfo;
    try {
      // Call the execute function instead of handler
      return await command.execute(match);
    } catch (error) {
      console.error(`Error executing plugin command:`, error);
      return {
        success: false,
        output: `Plugin error: ${error.message}`,
      };
    }
  }
  
  /**
   * Get available plugins
   */
  getAvailablePlugins() {
    const plugins = [];
    for (const [name, plugin] of this.plugins) {
      plugins.push({
        name: name,
        enabled: this.enabledPlugins.has(name),
        commands: plugin.getCommands().map(cmd => ({
          name: cmd.name || 'unnamed',
          description: cmd.description || 'No description'
        }))
      });
    }
    return plugins;
  }
  
  /**
   * Enable a plugin
   */
  enablePlugin(pluginName) {
    if (this.plugins.has(pluginName)) {
      this.enabledPlugins.add(pluginName);
      return { success: true, message: `Plugin ${pluginName} enabled` };
    }
    return { success: false, message: `Plugin ${pluginName} not found` };
  }
  
  /**
   * Disable a plugin
   */
  disablePlugin(pluginName) {
    if (this.enabledPlugins.has(pluginName)) {
      this.enabledPlugins.delete(pluginName);
      return { success: true, message: `Plugin ${pluginName} disabled` };
    }
    return { success: false, message: `Plugin ${pluginName} not found or already disabled` };
  }
}

module.exports = PluginManager;