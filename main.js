/**
 * AI Terminal Main Process
 * 
 * Main Electron process that handles IPC communication and system-level operations.
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

// Import our custom modules
const AIService = require('./ai_service');
const AIResponseParser = require('./ai_response_parser');
const CommandExecutor = require('./command_executor');

// Initialize services
const aiService = new AIService({
  apiKey: process.env.CLAUDE_API_KEY || 'dummy-key-for-development',
  modelName: 'claude-3-sonnet-20240229'
});
const responseParser = new AIResponseParser();
const commandExecutor = new CommandExecutor();

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    titleBarStyle: 'hiddenInset',
    frame: false,
    backgroundColor: '#0a0a0a',
    show: false
  });

  mainWindow.loadFile('renderer.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  // Open DevTools in development mode
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers for Command Execution
ipcMain.handle('execute-command', async (event, command, options = {}) => {
  return await commandExecutor.executeCommand(command, options);
});

ipcMain.handle('execute-sequence', async (event, commands, options = {}) => {
  return await commandExecutor.executeSequence(commands, options);
});

// IPC Handlers for Directory Management
ipcMain.handle('get-current-directory', async () => {
  return commandExecutor.getCurrentDirectory();
});

ipcMain.handle('change-directory', async (event, newPath) => {
  return await commandExecutor.executeCommand(`cd ${newPath}`);
});

// IPC Handlers for File Operations
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('write-file', async (event, filePath, content) => {
  try {
    // Create directory if it doesn't exist
    const directory = path.dirname(filePath);
    await fs.mkdir(directory, { recursive: true });
    
    // Write the file
    await fs.writeFile(filePath, content, 'utf8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC Handlers for AI Processing
ipcMain.handle('process-ai-query', async (event, query, options = {}) => {
  try {
    return await aiService.processQuery(query, options);
  } catch (error) {
    console.error('Error processing AI query:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to process query with AI' 
    };
  }
});

ipcMain.handle('parse-ai-response', async (event, response, biModalMode = false) => {
  try {
    return responseParser.parseResponse(response, biModalMode);
  } catch (error) {
    console.error('Error parsing AI response:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to parse AI response',
      commandSequences: [],
      explanation: response
    };
  }
});

// IPC Handlers for Command History
ipcMain.handle('get-command-history', async (event, limit = 10) => {
  return commandExecutor.getHistory(limit);
});

ipcMain.handle('clear-command-history', async () => {
  commandExecutor.clearHistory();
  return { success: true };
});

// IPC Handlers for Special Operations
ipcMain.handle('handle-special-command', async (event, command, options = {}) => {
  const specialCommand = commandExecutor.checkForSpecialCommand(command);
  if (specialCommand) {
    return await commandExecutor.handleSpecialCommand(specialCommand, options);
  }
  return { success: false, output: 'Not a special command' };
});

// IPC Handlers for System Information
ipcMain.handle('get-system-info', async () => {
  try {
    return {
      platform: os.platform(),
      release: os.release(),
      type: os.type(),
      arch: os.arch(),
      cpus: os.cpus(),
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      hostname: os.hostname(),
      userInfo: os.userInfo(),
      homedir: os.homedir()
    };
  } catch (error) {
    console.error('Error getting system info:', error);
    return { error: error.message };
  }
});

// IPC Handlers for Process Management
ipcMain.handle('kill-current-process', async () => {
  const killed = commandExecutor.killCurrentProcess();
  return { success: killed };
});

// IPC Handlers for File System Operations
ipcMain.handle('get-file-system-info', async () => {
  return await commandExecutor.getFileSystemInfo();
});

// IPC Handlers for UI Operations
ipcMain.handle('select-background-image', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }
    ]
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('minimize-window', () => {
  mainWindow.minimize();
});

ipcMain.handle('maximize-window', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.handle('close-window', () => {
  mainWindow.close();
});