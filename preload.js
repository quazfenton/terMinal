/**
 * AI Terminal Preload Script
 * 
 * Establishes secure bridge between renderer and main processes.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Command execution
  executeCommand: (command, options) => ipcRenderer.invoke('execute-command', command, options),
  executeSequence: (commands, options) => ipcRenderer.invoke('execute-sequence', commands, options),
  
  // Directory management
  getCurrentDirectory: () => ipcRenderer.invoke('get-current-directory'),
  changeDirectory: (path) => ipcRenderer.invoke('change-directory', path),
  
  // File operations
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
  
  // AI processing
  processAIQuery: (query, options) => ipcRenderer.invoke('process-ai-query', query, options),
  parseAIResponse: (response, biModalMode) => ipcRenderer.invoke('parse-ai-response', response, biModalMode),
  
  // UI operations
  selectBackgroundImage: () => ipcRenderer.invoke('select-background-image'),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  
  // Command history
  getCommandHistory: (limit) => ipcRenderer.invoke('get-command-history', limit),
  clearCommandHistory: () => ipcRenderer.invoke('clear-command-history'),
  
  // Special operations
  handleSpecialCommand: (command, options) => ipcRenderer.invoke('handle-special-command', command, options),
  
  // System information
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  
  // Process management
  killCurrentProcess: () => ipcRenderer.invoke('kill-current-process'),
  
  // File system operations
  getFileSystemInfo: () => ipcRenderer.invoke('get-file-system-info'),
  
  // Automation channels
  onAutomationUpdate: (callback) => ipcRenderer.on('automation-update', callback),
  onAutomationNext: (callback) => ipcRenderer.on('automation-next', callback)
});