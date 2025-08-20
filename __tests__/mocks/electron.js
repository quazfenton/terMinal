/**
 * Electron Mock for Testing
 * 
 * Provides mock implementations of Electron APIs for unit testing.
 */

const EventEmitter = require('events');

// Mock BrowserWindow
class MockBrowserWindow extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = options;
    this.isDestroyed = false;
    this.webContents = new MockWebContents();
  }

  loadFile(filePath) {
    return Promise.resolve();
  }

  show() {
    this.emit('show');
  }

  hide() {
    this.emit('hide');
  }

  close() {
    this.emit('close');
    this.isDestroyed = true;
  }

  minimize() {
    this.emit('minimize');
  }

  maximize() {
    this.emit('maximize');
  }

  unmaximize() {
    this.emit('unmaximize');
  }

  isMaximized() {
    return false;
  }

  focus() {
    this.emit('focus');
  }

  static getAllWindows() {
    return [];
  }
}

// Mock WebContents
class MockWebContents extends EventEmitter {
  constructor() {
    super();
  }

  send(channel, ...args) {
    this.emit('ipc-message', { channel, args });
  }

  openDevTools() {
    // Mock implementation
  }
}

// Mock App
class MockApp extends EventEmitter {
  constructor() {
    super();
    this.isReady = false;
  }

  whenReady() {
    return new Promise((resolve) => {
      if (this.isReady) {
        resolve();
      } else {
        this.once('ready', resolve);
      }
    });
  }

  quit() {
    this.emit('before-quit');
    this.emit('will-quit');
    this.emit('quit');
  }

  getPath(name) {
    const paths = {
      userData: '/mock/user/data',
      appData: '/mock/app/data',
      temp: '/mock/temp',
      home: '/mock/home',
      documents: '/mock/documents',
      downloads: '/mock/downloads'
    };
    return paths[name] || '/mock/path';
  }

  disableHardwareAcceleration() {
    // Mock implementation
  }
}

// Mock IpcMain
class MockIpcMain extends EventEmitter {
  handle(channel, handler) {
    this.on(`handle-${channel}`, handler);
  }

  handleOnce(channel, handler) {
    this.once(`handle-${channel}`, handler);
  }

  removeHandler(channel) {
    this.removeAllListeners(`handle-${channel}`);
  }

  // Simulate IPC call for testing
  async invoke(channel, ...args) {
    const handlers = this.listeners(`handle-${channel}`);
    if (handlers.length > 0) {
      return await handlers[0]({ sender: {} }, ...args);
    }
    throw new Error(`No handler registered for channel: ${channel}`);
  }
}

// Mock IpcRenderer
class MockIpcRenderer extends EventEmitter {
  invoke(channel, ...args) {
    return Promise.resolve({ success: true, data: 'mock-response' });
  }

  send(channel, ...args) {
    this.emit('send', { channel, args });
  }

  sendSync(channel, ...args) {
    return { success: true, data: 'mock-sync-response' };
  }
}

// Mock Dialog
const mockDialog = {
  showOpenDialog: jest.fn(() => Promise.resolve({
    canceled: false,
    filePaths: ['/mock/selected/file.txt']
  })),
  
  showSaveDialog: jest.fn(() => Promise.resolve({
    canceled: false,
    filePath: '/mock/save/path.txt'
  })),
  
  showMessageBox: jest.fn(() => Promise.resolve({
    response: 0,
    checkboxChecked: false
  })),
  
  showErrorBox: jest.fn()
};

// Create instances
const app = new MockApp();
const ipcMain = new MockIpcMain();
const ipcRenderer = new MockIpcRenderer();

// Mock contextBridge
const mockContextBridge = {
  exposeInMainWorld: jest.fn((apiKey, api) => {
    global.window = global.window || {};
    global.window[apiKey] = api;
  })
};

// Export the mock
module.exports = {
  app,
  BrowserWindow: MockBrowserWindow,
  ipcMain,
  ipcRenderer,
  dialog: mockDialog,
  contextBridge: mockContextBridge,
  
  // Additional utilities for testing
  __mockUtils: {
    triggerAppReady: () => {
      app.isReady = true;
      app.emit('ready');
    },
    
    createMockWindow: (options) => new MockBrowserWindow(options),
    
    simulateIpcCall: async (channel, ...args) => {
      return await ipcMain.invoke(channel, ...args);
    },
    
    getRegisteredHandlers: () => {
      return ipcMain.eventNames()
        .filter(name => name.startsWith('handle-'))
        .map(name => name.replace('handle-', ''));
    }
  }
};