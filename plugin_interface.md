# Plugin Interface Specification

Plugins extend the functionality of the automation shell by adding new commands. Each plugin must implement the following interface:

## Plugin Class
- **Constructor**: Accepts a `commandExecutor` instance
- **getName()**: Returns the plugin name as a string
- **getCommands()**: Returns an array of command objects

## Command Object
- `name`: Unique command identifier
- `pattern`: Regular expression to match user input
- `description`: Short help text for the command
- `execute`: Async function that processes the command

## Execution Result
Commands return an object with:
- `success`: Boolean indicating success
- `output`: Result message or data

## Example Plugin
```javascript
class ExamplePlugin {
  constructor(commandExecutor) {
    this.commandExecutor = commandExecutor;
  }

  getName() {
    return 'Example';
  }

  getCommands() {
    return [{
      name: 'greet',
      pattern: /^greet\s+(.+)$/,
      description: 'Greets a user by name',
      execute: async (match) => {
        return { 
          success: true, 
          output: `Hello, ${match[1]}!` 
        };
      }
    }];
  }
}

module.exports = ExamplePlugin;