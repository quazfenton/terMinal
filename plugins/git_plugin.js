/**
 * Git Plugin - Git operations and repository analysis
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class GitPlugin {
  getName() { return "Git Plugin"; }

  getCommands() {
    return [
      {
        name: "git-status",
        description: "Show git repository status",
        pattern: /^git status$/i,
        execute: async () => {
          try {
            const { stdout } = await execAsync('git status --porcelain');
            if (!stdout.trim()) {
              return "Working directory is clean";
            }
            return `Modified files:\n${stdout}`;
          } catch (error) {
            return `Error: ${error.message}`;
          }
        }
      },
      {
        name: "git-branch",
        description: "Show current git branch or switch to a branch",
        pattern: /^git branch(?:\s+(.+))?$/i,
        execute: async (match) => {
          const branchName = match[1];
          
          if (!branchName) {
            // Show current branch
            try {
              const { stdout } = await execAsync('git branch --show-current');
              return `Current branch: ${stdout.trim()}`;
            } catch (error) {
              return `Error: ${error.message}`;
            }
          } else {
            // Switch to branch
            try {
              await execAsync(`git checkout ${branchName}`);
              return `Switched to branch: ${branchName}`;
            } catch (error) {
              return `Error switching to branch: ${error.message}`;
            }
          }
        }
      },
      {
        name: "git-commit-analysis",
        description: "Analyze recent commits for code changes",
        pattern: /^git commit-analysis(?:\s+(\d+))?$/i,
        execute: async (match) => {
          const count = match[1] || 5;
          try {
            const { stdout } = await execAsync(`git log --oneline -${count}`);
            return `Last ${count} commits:\n${stdout}`;
          } catch (error) {
            return `Error: ${error.message}`;
          }
        }
      },
      {
        name: "git-create-branch",
        description: "Create and switch to a new git branch",
        pattern: /^git create-branch (.+)$/i,
        execute: async (match) => {
          const branchName = match[1];
          try {
            await execAsync(`git checkout -b ${branchName}`);
            return `Created and switched to new branch: ${branchName}`;
          } catch (error) {
            return `Error creating branch: ${error.message}`;
          }
        }
      },
      {
        name: "git-stash",
        description: "Stash current changes",
        pattern: /^git stash$/i,
        execute: async () => {
          try {
            const { stdout } = await execAsync('git stash');
            return stdout.trim() || 'Changes stashed successfully';
          } catch (error) {
            return `Error stashing changes: ${error.message}`;
          }
        }
      },
      {
        name: "git-unstash",
        description: "Apply stashed changes",
        pattern: /^git unstash$/i,
        execute: async () => {
          try {
            const { stdout } = await execAsync('git stash pop');
            return stdout.trim() || 'Stashed changes applied successfully';
          } catch (error) {
            return `Error applying stashed changes: ${error.message}`;
          }
        }
      }
    ];
  }

  initialize(terminal) {
    this.terminal = terminal;
  }
}

module.exports = GitPlugin;