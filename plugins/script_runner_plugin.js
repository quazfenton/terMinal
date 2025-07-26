/**
 * Script Runner Plugin
 * 
 * Executes custom scripts.
 */

const { spawn } = require('child_process');
const path = require('path');

class ScriptRunnerPlugin {
  constructor(commandExecutor) {
    this.commandExecutor = commandExecutor;
  }

  getName() {
    return 'ScriptRunner';
  }

  getCommands() {
    return [
      {
        name: 'runScript',
        pattern: /^run-script\s+(.+)$/,
        description: 'Execute a custom script.',
        execute: this.runScript.bind(this)
      }
    ];
  }

  runScript(match) {
    const scriptPath = match[1];
    const fullPath = path.resolve(this.commandExecutor.getCurrentDirectory(), scriptPath);

    return new Promise((resolve) => {
      const process = spawn(fullPath, [], {
        cwd: this.commandExecutor.getCurrentDirectory(),
        shell: true
      });

      let output = '';
      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.stderr.on('data', (data) => {
        output += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, output });
        } else {
          resolve({ success: false, output: `Script exited with code ${code}\n${output}` });
        }
      });

      process.on('error', (err) => {
        resolve({ success: false, output: `Failed to run script: ${err.message}` });
      });
    });
  }
}

module.exports = ScriptRunnerPlugin;
