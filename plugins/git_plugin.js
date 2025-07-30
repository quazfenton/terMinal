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
        execute: async () => "Initialized empty Git repository"
      },
      {
        name: "git-status",
        description: "Show repository status",
        pattern: /^git status$/i,
        execute: async () => "On branch main\nYour branch is up to date"
      }
    ];
  }
  
  initialize(terminal) {
    console.log("Git plugin initialized");
  }
}

module.exports = GitPlugin;