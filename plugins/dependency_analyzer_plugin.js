/**
 * Dependency Analyzer Plugin - Analyze project dependencies for vulnerabilities and outdated packages
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const execAsync = promisify(exec);

class DependencyAnalyzerPlugin {
  constructor() {
    this.supportedProjectTypes = ['npm', 'python'];
  }

  getName() { return "Dependency Analyzer Plugin"; }

  getCommands() {
    return [
      {
        name: "deps-check",
        description: "Check for outdated or vulnerable dependencies",
        pattern: /^deps check$/i,
        execute: async () => {
          const projectType = await this.detectProjectType();
          if (!projectType) {
            return "No supported project found. This plugin works with npm (package.json) or Python (requirements.txt) projects.";
          }
          
          let result = '';
          result += await this.checkOutdatedDependencies(projectType);
          result += '\n\n';
          result += await this.checkVulnerableDependencies(projectType);
          
          return result;
        }
      },
      {
        name: "deps-outdated",
        description: "Check for outdated dependencies",
        pattern: /^deps outdated$/i,
        execute: async () => {
          const projectType = await this.detectProjectType();
          if (!projectType) {
            return "No supported project found. This plugin works with npm (package.json) or Python (requirements.txt) projects.";
          }
          
          return this.checkOutdatedDependencies(projectType);
        }
      },
      {
        name: "deps-vulnerabilities",
        description: "Check for vulnerable dependencies",
        pattern: /^deps vulnerabilities$/i,
        execute: async () => {
          const projectType = await this.detectProjectType();
          if (!projectType) {
            return "No supported project found. This plugin works with npm (package.json) or Python (requirements.txt) projects.";
          }
          
          return this.checkVulnerableDependencies(projectType);
        }
      },
      {
        name: "deps-update",
        description: "Update all dependencies to their latest versions",
        pattern: /^deps update$/i,
        execute: async () => {
          const projectType = await this.detectProjectType();
          if (!projectType) {
            return "No supported project found. This plugin works with npm (package.json) or Python (requirements.txt) projects.";
          }
          
          return this.updateDependencies(projectType);
        }
      },
      {
        name: "deps-project-types",
        description: "List supported project types",
        pattern: /^deps project-types$/i,
        execute: async () => {
          return `Supported project types:
- npm (package.json)
- Python (requirements.txt, pyproject.toml)`;
        }
      }
    ];
  }

  async detectProjectType() {
    // Check for npm project
    try {
      await fs.access('package.json');
      return 'npm';
    } catch (error) {
      // Continue checking
    }
    
    // Check for Python project
    try {
      await fs.access('requirements.txt');
      return 'python';
    } catch (error) {
      // Continue checking
    }
    
    // Check for pyproject.toml (Python)
    try {
      await fs.access('pyproject.toml');
      return 'python';
    } catch (error) {
      // Continue checking
    }
    
    return null;
  }

  async checkOutdatedDependencies(projectType) {
    try {
      switch (projectType) {
        case 'npm':
          const { stdout: npmOutdated } = await execAsync('npm outdated --long');
          if (!npmOutdated.trim()) {
            return "All npm dependencies are up to date";
          }
          return `Outdated npm dependencies:\n${npmOutdated}`;
          
        case 'python':
          // For Python projects, we'll use pip list --outdated
          const { stdout: pipOutdated } = await execAsync('pip list --outdated');
          if (!pipOutdated.trim() || pipOutdated.includes('Package')) {
            const lines = pipOutdated.split('\n').filter(line => line.trim() && !line.startsWith('Package'));
            if (lines.length === 0) {
              return "All Python dependencies are up to date";
            }
            return `Outdated Python dependencies:\n${lines.join('\n')}`;
          }
          return `Outdated Python dependencies:\n${pipOutdated}`;
          
        default:
          return `Unsupported project type: ${projectType}`;
      }
    } catch (error) {
      return `Error checking outdated dependencies: ${error.message}`;
    }
  }

  async checkVulnerableDependencies(projectType) {
    try {
      switch (projectType) {
        case 'npm':
          // For npm projects, we'll use npm audit
          const { stdout: npmAudit } = await execAsync('npm audit --audit-level=moderate');
          if (npmAudit.includes('found 0 vulnerabilities')) {
            return "No vulnerabilities found in npm dependencies";
          }
          return `Vulnerabilities in npm dependencies:\n${npmAudit}`;
          
        case 'python':
          // For Python projects, we'll use pip-audit if available
          try {
            const { stdout: pipAudit } = await execAsync('pip-audit');
            if (!pipAudit.trim()) {
              return "No vulnerabilities found in Python dependencies";
            }
            return `Vulnerabilities in Python dependencies:\n${pipAudit}`;
          } catch (error) {
            // pip-audit might not be installed
            return "Vulnerability checking for Python dependencies requires pip-audit. Install it with: pip install pip-audit";
          }
          
        default:
          return `Unsupported project type: ${projectType}`;
      }
    } catch (error) {
      return `Error checking vulnerable dependencies: ${error.message}`;
    }
  }

  async updateDependencies(projectType) {
    try {
      switch (projectType) {
        case 'npm':
          const { stdout: npmUpdate } = await execAsync('npm update');
          return `npm dependencies updated:\n${npmUpdate || 'No updates available'}`;
          
        case 'python':
          // For Python projects, we'll try to update packages in requirements.txt
          try {
            await fs.access('requirements.txt');
            const { stdout: pipUpgrade } = await execAsync('pip list --outdated --format=freeze | grep -v \'^\\-e\' | cut -d = -f 1 | xargs -n1 pip install -U');
            return `Python dependencies updated:\n${pipUpgrade || 'No updates available'}`;
          } catch (error) {
            return "requirements.txt not found. Cannot update Python dependencies automatically.";
          }
          
        default:
          return `Unsupported project type: ${projectType}`;
      }
    } catch (error) {
      return `Error updating dependencies: ${error.message}`;
    }
  }

  initialize(terminal) {
    this.terminal = terminal;
  }
}

module.exports = DependencyAnalyzerPlugin;