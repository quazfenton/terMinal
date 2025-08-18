/**
 * Performance Profiler Plugin - Run performance profiling on code
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const execAsync = promisify(exec);

class PerformanceProfilerPlugin {
  constructor() {
    this.supportedLanguages = ['javascript', 'python'];
  }

  getName() { return "Performance Profiler Plugin"; }

  getCommands() {
    return [
      {
        name: "profile-run",
        description: "Run performance profiling on a script",
        pattern: /^profile run (.+)$/i,
        execute: async (command) => {
          const scriptPath = command.match(/^profile run (.+)$/i)[1];
          return this.runProfile(scriptPath);
        }
      },
      {
        name: "profile-analyze",
        description: "Analyze performance profile data",
        pattern: /^profile analyze (.+)$/i,
        execute: async (command) => {
          const scriptPath = command.match(/^profile analyze (.+)$/i)[1];
          return this.analyzeProfile(scriptPath);
        }
      },
      {
        name: "profile-languages",
        description: "List supported languages",
        pattern: /^profile languages$/i,
        execute: async () => {
          return `Supported languages:
- JavaScript (.js files) - Uses node --prof for profiling
- Python (.py files) - Uses cProfile for profiling`;
        }
      },
      {
        name: "profile-help",
        description: "Show help information for the Performance Profiler plugin",
        pattern: /^profile help$/i,
        execute: async () => {
          return `Performance Profiler Plugin Commands:
- profile run [script] : Run performance profiling on a script and generate profile data
- profile analyze [script] : Analyze performance profile data for a script
- profile languages : List supported languages
- profile help : Show this help information

For JavaScript files:
  - Generates v8.log file with profiling information
  - Uses node --prof flag for profiling
  - For analysis, uses node --prof-process flag

For Python files:
  - Generates [script].profile file with profiling information
  - Uses cProfile for profiling
  - For analysis, processes the profile data with pstats`;
        }
      }
    ];
  }

  async detectLanguage(scriptPath) {
    try {
      const ext = path.extname(scriptPath).toLowerCase();
      switch (ext) {
        case '.js':
          return 'javascript';
        case '.py':
          return 'python';
        default:
          return null;
      }
    } catch (error) {
      return null;
    }
  }

  async runProfile(scriptPath) {
    // Check if file exists
    try {
      await fs.access(scriptPath);
    } catch (error) {
      return `File not found: ${scriptPath}`;
    }
    
    const language = await this.detectLanguage(scriptPath);
    if (!language) {
      return `Unsupported language for script: ${scriptPath}. Supported languages are JavaScript and Python.`;
    }
    
    try {
      switch (language) {
        case 'javascript':
          // Run node with profiling enabled
          const { stdout: jsProfile } = await execAsync(`node --prof ${scriptPath}`);
          return `JavaScript profile completed. Generated v8.log file.\n${jsProfile || 'Script executed successfully.'}`;
          
        case 'python':
          // Run Python script with cProfile
          const profileFile = `${scriptPath}.profile`;
          const { stdout: pyProfile } = await execAsync(`python -m cProfile -o ${profileFile} ${scriptPath}`);
          return `Python profile completed. Generated ${profileFile} file.\n${pyProfile || 'Script executed successfully.'}`;
          
        default:
          return `Unsupported language: ${language}`;
      }
    } catch (error) {
      return `Error running profile: ${error.message}`;
    }
  }

  async analyzeProfile(scriptPath) {
    const language = await this.detectLanguage(scriptPath);
    if (!language) {
      return `Unsupported language for script: ${scriptPath}. Supported languages are JavaScript and Python.`;
    }
    
    try {
      switch (language) {
        case 'javascript':
          // Process the v8.log file
          try {
            const { stdout: jsAnalysis } = await execAsync('node --prof-process v8.log');
            return `JavaScript profile analysis:\n${jsAnalysis}`;
          } catch (error) {
            if (error.message.includes('v8.log')) {
              return "No v8.log file found. Run 'profile run [script]' first to generate profile data.";
            }
            throw error;
          }
          
        case 'python':
          // Process the .profile file
          const profileFile = `${scriptPath}.profile`;
          try {
            await fs.access(profileFile);
          } catch (error) {
            return `No profile file found for ${scriptPath}. Run 'profile run [script]' first to generate profile data.`;
          }
          
          // Generate a simple analysis using pstats
          const analysisScript = `
import pstats
from pstats import SortKey
import sys

try:
    stats = pstats.Stats('${profileFile}')
    stats.sort_stats(SortKey.CUMULATIVE)
    stats.print_stats(10)  # Top 10 functions
    print("\\n---\\n")
    stats.sort_stats(SortKey.TIME)
    stats.print_stats(10)  # Top 10 functions by time
except Exception as e:
    print(f"Error analyzing profile: {e}")
`;
          
          const { stdout: pyAnalysis } = await execAsync(`python -c "${analysisScript.replace(/"/g, '\\"')}"`);
          return `Python profile analysis:\n${pyAnalysis}`;
          
        default:
          return `Unsupported language: ${language}`;
      }
    } catch (error) {
      return `Error analyzing profile: ${error.message}`;
    }
  }

  initialize(terminal) {
    this.terminal = terminal;
  }
}

module.exports = PerformanceProfilerPlugin;