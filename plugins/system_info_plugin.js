/**
 * System Info Plugin
 * 
 * Provides commands for retrieving system information.
 */

const os = require('os');

class SystemInfoPlugin {
  constructor(commandExecutor) {
    this.commandExecutor = commandExecutor;
  }

  getName() {
    return 'SystemInfo';
  }

  getCommands() {
    return [
      {
        name: 'getSystemInfo',
        pattern: /^sys-info$/,
        description: 'Get system information.',
        execute: this.getSystemInfo.bind(this)
      }
    ];
  }

  async getSystemInfo() {
    try {
      const sysInfo = {
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        cpus: os.cpus().length,
        totalMemory: `${(os.totalmem() / 1e9).toFixed(2)} GB`,
        freeMemory: `${(os.freemem() / 1e9).toFixed(2)} GB`,
      };
      const output = Object.entries(sysInfo)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
      return { success: true, output };
    } catch (error) {
      return { success: false, output: `Error getting system info: ${error.message}` };
    }
  }
}

module.exports = SystemInfoPlugin;
