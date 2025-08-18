/**
 * Test Runner Plugin - Execute tests and provide results
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const execAsync = promisify(exec);

class TestRunnerPlugin {
  constructor() {
    this.supportedFrameworks = ['jest', 'mocha', 'pytest'];
  }

  getName() { return "Test Runner Plugin"; }

  getCommands() {
    return [
      {
        name: "test-run",
        description: "Run all tests in the project",
        pattern: /^test run(?:\s+(.+))?$/i,
        execute: async (match) => {
          const framework = match[1] || await this.detectFramework();
          return this.runTests(framework);
        }
      },
      {
        name: "test-watch",
        description: "Run tests in watch mode",
        pattern: /^test watch(?:\s+(.+))?$/i,
        execute: async (match) => {
          const framework = match[1] || await this.detectFramework();
          return this.runTestsWatch(framework);
        }
      },
      {
        name: "test-file",
        description: "Run tests for a specific file",
        pattern: /^test file (.+)$/i,
        execute: async (match) => {
          const filePath = match[1];
          const framework = await this.detectFramework();
          return this.runTestsForFile(filePath, framework);
        }
      },
      {
        name: "test-coverage",
        description: "Run tests with coverage report",
        pattern: /^test coverage(?:\s+(.+))?$/i,
        execute: async (match) => {
          const framework = match[1] || await this.detectFramework();
          return this.runTestsWithCoverage(framework);
        }
      },
      {
        name: "test-frameworks",
        description: "List supported testing frameworks",
        pattern: /^test frameworks$/i,
        execute: async () => {
          return `Supported testing frameworks:
- Jest (JavaScript/TypeScript)
- Mocha (JavaScript/TypeScript)
- PyTest (Python)`;
        }
      }
    ];
  }

  async detectFramework() {
    // Check for package.json (npm-based projects)
    try {
      await fs.access('package.json');
      const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));
      
      // Check for Jest
      if (packageJson.devDependencies && packageJson.devDependencies.jest) {
        return 'jest';
      }
      
      // Check for Mocha
      if (packageJson.devDependencies && packageJson.devDependencies.mocha) {
        return 'mocha';
      }
      
      // Default to Jest if it's a JS/TS project and no specific framework is found
      return 'jest';
    } catch (error) {
      // Not an npm project, check for Python
      try {
        await fs.access('requirements.txt');
        return 'pytest';
      } catch (error) {
        // If we can't detect a framework, default to jest
        return 'jest';
      }
    }
  }

  async runTests(framework) {
    try {
      let command;
      switch (framework) {
        case 'jest':
          command = 'npx jest';
          break;
        case 'mocha':
          command = 'npx mocha';
          break;
        case 'pytest':
          command = 'pytest';
          break;
        default:
          return `Unsupported framework: ${framework}. Use "test frameworks" to see supported frameworks.`;
      }
      
      const { stdout, stderr } = await execAsync(command);
      const output = stdout + stderr;
      
      // Parse test results
      const summary = this.parseTestResults(output, framework);
      return summary;
    } catch (error) {
      // Tests might fail, but we still want to show the output
      const output = error.stdout + error.stderr;
      const summary = this.parseTestResults(output, framework);
      return summary || `Error running tests: ${error.message}`;
    }
  }

  async runTestsWatch(framework) {
    try {
      let command;
      switch (framework) {
        case 'jest':
          command = 'npx jest --watch';
          break;
        case 'mocha':
          command = 'npx mocha --watch';
          break;
        case 'pytest':
          command = 'pytest --watch'; // Note: pytest-watch would need to be installed
          break;
        default:
          return `Unsupported framework: ${framework}`;
      }
      
      const { stdout, stderr } = await execAsync(command);
      return `${stdout}${stderr}\n\nWatch mode started. Use Ctrl+C to stop.`;
      
    } catch (error) {
      return `Error starting watch mode: ${error.message}`;
    }
  }

  async runTestsForFile(filePath, framework) {
    try {
      await fs.access(filePath);
      
      let command;
      switch (framework) {
        case 'jest':
          command = `npx jest ${filePath}`;
          break;
        case 'mocha':
          command = `npx mocha ${filePath}`;
          break;
        case 'pytest':
          command = `pytest ${filePath}`;
          break;
        default:
          return `Unsupported framework: ${framework}`;
      }
      
      const { stdout, stderr } = await execAsync(command);
      const output = stdout + stderr;
      
      // Parse test results
      const summary = this.parseTestResults(output, framework);
      return summary;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return `File not found: ${filePath}`;
      }
      
      // Tests might fail, but we still want to show the output
      const output = error.stdout + error.stderr;
      const summary = this.parseTestResults(output, framework);
      return summary || `Error running tests for file: ${error.message}`;
    }
  }

  async runTestsWithCoverage(framework) {
    try {
      let command;
      switch (framework) {
        case 'jest':
          command = 'npx jest --coverage';
          break;
        case 'mocha':
          command = 'npx mocha --require nyc/register'; // nyc is used for coverage with mocha
          break;
        case 'pytest':
          command = 'pytest --cov=./'; // pytest-cov needed
          break;
        default:
          return `Unsupported framework: ${framework}`;
      }
      
      const { stdout, stderr } = await execAsync(command);
      const output = stdout + stderr;
      
      // Parse test results
      const summary = this.parseTestResults(output, framework);
      return summary;
    } catch (error) {
      // Tests might fail, but we still want to show the output
      const output = error.stdout + error.stderr;
      const summary = this.parseTestResults(output, framework);
      return summary || `Error running tests with coverage: ${error.message}`;
    }
  }

  parseTestResults(output, framework) {
    if (!output) return null;
    
    switch (framework) {
      case 'jest':
        // Look for Jest summary line
        const jestSummary = output.match(/Test Suites:.*\nTests:.*\nSnapshots:.*\nTime:.*\nRan all test suites/);
        if (jestSummary) {
          const summaryLines = output.split('\n').filter(line => 
            line.startsWith('Test Suites:') || 
            line.startsWith('Tests:') || 
            line.startsWith('Snapshots:') || 
            line.startsWith('Time:')
          );
          return summaryLines.join('\n');
        }
        break;
        
      case 'mocha':
        // Look for Mocha summary line
        const mochaSummary = output.match(/(\d+ passing|\d+ failing|\d+ pending)(.*\n)*(\d+ passing|\d+ failing|\d+ pending)/);
        if (mochaSummary) {
          const passing = output.match(/(\d+) passing/);
          const failing = output.match(/(\d+) failing/);
          const pending = output.match(/(\d+) pending/);
          
          let summary = '';
          if (passing) summary += `${passing[1]} tests passing\n`;
          if (failing) summary += `${failing[1]} tests failing\n`;
          if (pending) summary += `${pending[1]} tests pending\n`;
          
          return summary;
        }
        break;
        
      case 'pytest':
        // Look for PyTest summary line
        const pytestSummary = output.match(/={2,}.*={2,}\n.*\d+ passed.*\n={2,}/);
        if (pytestSummary) {
          const lines = output.split('\n');
          const summaryStartIndex = lines.findIndex(line => line.includes('== short test summary info =='));
          const summaryEndIndex = lines.findIndex(line => line.match(/={2,}.* \d+ passed.*={2,}/));
          
          if (summaryStartIndex !== -1 && summaryEndIndex !== -1) {
            return lines.slice(summaryStartIndex, summaryEndIndex + 1).join('\n');
          }
        }
        break;
    }
    
    return null;
  }

  initialize(terminal) {
    this.terminal = terminal;
  }
}

module.exports = TestRunnerPlugin;