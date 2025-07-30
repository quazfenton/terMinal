/**
 * Docker Plugin - Manages Docker containers
 */
class DockerPlugin {
  getName() { return "Docker Plugin"; }
  
  getCommands() {
    return [
      {
        name: "docker-ps",
        description: "List containers",
        pattern: /^docker ps$/i,
        execute: async () => "CONTAINER ID   IMAGE     STATUS"
      },
      {
        name: "docker-run",
        description: "Run a container",
        pattern: /^docker run (\S+)$/i,
        execute: async (match) => `Started container from ${match[1]}`
      }
    ];
  }
  
  initialize(terminal) {
    console.log("Docker plugin initialized");
  }
}

module.exports = DockerPlugin;