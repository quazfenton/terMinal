/**
 * Jest Test Setup
 * 
 * Global test configuration and utilities for the AI Terminal test suite.
 */

// Mock global objects for testing
global.console = {
  ...console,
  // Suppress console.log in tests unless explicitly needed
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
};

// Mock localStorage for browser environment tests
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn()
};

global.localStorage = localStorageMock;

// Mock sessionStorage
global.sessionStorage = localStorageMock;

// Mock window object for renderer tests
global.window = {
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  location: {
    href: 'http://localhost:3000'
  },
  navigator: {
    userAgent: 'Jest Test Environment'
  }
};

// Mock document object
global.document = {
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  getElementById: jest.fn(),
  createElement: jest.fn(() => ({
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    appendChild: jest.fn(),
    remove: jest.fn(),
    setAttribute: jest.fn(),
    getAttribute: jest.fn(),
    classList: {
      add: jest.fn(),
      remove: jest.fn(),
      toggle: jest.fn(),
      contains: jest.fn()
    },
    style: {},
    innerHTML: '',
    textContent: ''
  })),
  body: {
    appendChild: jest.fn(),
    removeChild: jest.fn()
  },
  querySelectorAll: jest.fn(() => []),
  querySelector: jest.fn()
};

// Mock process for Node.js environment
if (!global.process) {
  global.process = {
    cwd: jest.fn(() => '/test/directory'),
    env: {
      NODE_ENV: 'test'
    },
    platform: 'linux',
    memoryUsage: jest.fn(() => ({
      rss: 1000000,
      heapTotal: 2000000,
      heapUsed: 1500000,
      external: 500000
    })),
    on: jest.fn(),
    removeListener: jest.fn()
  };
}

// Mock session context
global.sessionContext = {
  get: jest.fn((key, defaultValue) => defaultValue),
  set: jest.fn(),
  delete: jest.fn(),
  clear: jest.fn(),
  getAll: jest.fn(() => ({}))
};

// Test utilities
global.testUtils = {
  // Create a mock command result
  createMockCommandResult: (success = true, output = 'test output') => ({
    success,
    output,
    stderr: success ? '' : 'test error',
    exitCode: success ? 0 : 1,
    executionTime: 100
  }),
  
  // Create a mock AI response
  createMockAIResponse: (commands = ['ls -la']) => ({
    success: true,
    commandSequences: [{
      id: 'test-seq-1',
      rank: 1,
      commands,
      description: 'Test command sequence',
      executionMode: 'sequential'
    }],
    explanation: 'Test AI response'
  }),
  
  // Create a mock error
  createMockError: (message = 'Test error', type = 'TestError') => {
    const error = new Error(message);
    error.name = type;
    return error;
  },
  
  // Wait for async operations
  waitFor: (ms = 100) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Create a mock file system structure
  createMockFS: () => ({
    '/test/directory': {
      'file1.txt': 'content1',
      'file2.js': 'console.log("test");',
      'subdir': {
        'file3.md': '# Test'
      }
    }
  })
};

// Custom matchers
expect.extend({
  toBeValidCommand(received) {
    const isValid = typeof received === 'string' && 
                   received.trim().length > 0 && 
                   !/[;&|`$()]/.test(received);
    
    return {
      message: () => `expected ${received} to be a valid command`,
      pass: isValid
    };
  },
  
  toHaveValidStructure(received, expectedKeys) {
    const hasAllKeys = expectedKeys.every(key => 
      received.hasOwnProperty(key)
    );
    
    return {
      message: () => `expected object to have keys: ${expectedKeys.join(', ')}`,
      pass: hasAllKeys
    };
  }
});

// Setup and teardown
beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
  
  // Reset global state
  if (global.sessionContext) {
    global.sessionContext.get.mockImplementation((key, defaultValue) => defaultValue);
  }
});

afterEach(() => {
  // Clean up any timers
  jest.clearAllTimers();
});

// Global error handler for tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Export test utilities for use in test files
module.exports = {
  testUtils: global.testUtils
};