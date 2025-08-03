/**
 * Git Plugin - Adds Git version control commands
 */
class GitPlugin {
  getName() { return "Git Plugin"; }
  
  getCommands() {
    return [
      {
        name: "git-init",
        description: "Initialize Git repository",
        pattern: /^git init$/i,
        execute: async () => this.commandExecutor.executeShellCommand('git init')
      },
      {
        name: "git-status",
        description: "Show repository status",
        pattern: /^git status$/i,
        execute: async () => this.commandExecutor.executeShellCommand('git status')
      },
      {
        name: "git-add",
        description: "Add files to staging area",
        pattern: /^git add\s+(.+)$/i,
        execute: async (match) => this.commandExecutor.executeShellCommand(`git add ${match[1]}`)
      },
      {
        name: "git-commit",
        description: "Commit changes",
        pattern: /^git commit -m\s+["'](.+)["']$/i,
        execute: async (match) => this.commandExecutor.executeShellCommand(`git commit -m "${match[1]}"`)
      },
      {
        name: "git-push",
        description: "Push changes to remote",
        pattern: /^git push$/i,
        execute: async () => this.commandExecutor.executeShellCommand('git push')
      },
      {
        name: "git-pull",
        description: "Pull changes from remote",
        pattern: /^git pull$/i,
        execute: async () => this.commandExecutor.executeShellCommand('git pull')
      }
    ];
  }
  
  initialize(commandExecutor) {
    this.commandExecutor = commandExecutor;
    console.log("Git plugin initialized");
  }
}

module.exports = GitPlugin;