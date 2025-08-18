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
const AutomationEngine = require('./automation_engine');
const NoteManager = require('./note_manager');
const PluginManager = require('./plugin_manager');
const SessionContext = require('./session_context');
const WorkflowOrchestrator = require('./workflow_orchestrator');

// Initialize services
const aiService = new AIService();
const responseParser = new AIResponseParser();
const commandExecutor = new CommandExecutor();
const noteManager = new NoteManager();
const pluginManager = new PluginManager(commandExecutor);
const automationEngine = new AutomationEngine(aiService, commandExecutor);
const sessionContext = SessionContext;
const workflowOrchestrator = new WorkflowOrchestrator();

// Load plugins
pluginManager.loadPlugins();

// Initialize automation engine to register plugin commands
automationEngine.initialize();

// Add services to global context for renderer access
global.noteManager = noteManager;
global.sessionContext = sessionContext;
global.workflowOrchestrator = workflowOrchestrator;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    frame: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false
    },
    show: false,
    backgroundColor: '#1a1a1a'
  });

  mainWindow.loadFile('renderer.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.disableHardwareAcceleration();
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

// Enhanced IPC Handlers for Command Execution
ipcMain.handle('execute-command', async (event, command, options = {}) => {
  try {
    // Validate and sanitize command
    if (!command || typeof command !== 'string') {
      throw new Error('Invalid command provided');
    }

    // Add session context
    const context = {
      ...options,
      sessionId: sessionContext.getCurrentSessionId(),
      timestamp: Date.now(),
      workingDirectory: commandExecutor.getCurrentDirectory()
    };

    const result = await commandExecutor.execute(command, context);
    
    // Update session context with result
    sessionContext.addCommandResult(command, result);
    
    return result;
  } catch (error) {
    console.error('Command execution error:', error);
    return {
      success: false,
      error: error.message,
      output: '',
      stderr: error.message
    };
  }
});

ipcMain.handle('execute-sequence', async (event, commands, options = {}) => {
  try {
    if (!Array.isArray(commands)) {
      throw new Error('Commands must be an array');
    }

    const results = [];
    let shouldContinue = true;

    for (const command of commands) {
      if (!shouldContinue) break;

      const result = await commandExecutor.execute(command, options);
      results.push(result);

      if (!result.success && options.stopOnError !== false) {
        shouldContinue = false;
      }
    }

    return {
      success: results.every(r => r.success),
      results,
      completedCommands: results.length
    };
  } catch (error) {
    console.error('Sequence execution error:', error);
    return {
      success: false,
      error: error.message,
      results: []
    };
  }
});

// Directory Management
ipcMain.handle('get-current-directory', async () => {
  try {
    return {
      success: true,
      directory: commandExecutor.getCurrentDirectory()
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('change-directory', async (event, newPath) => {
  try {
    const result = await commandExecutor.changeDirectory(newPath);
    return result;
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

// Enhanced AI Processing
ipcMain.handle('process-ai-query', async (event, query, options = {}) => {
  try {
    // Check if this is a direct command that doesn't need AI
    if (commandExecutor.isDirectCommand(query)) {
      const result = await commandExecutor.execute(query, options);
      return {
        success: true,
        isDirect: true,
        result
      };
    }

    // Add context to the query
    const enhancedOptions = {
      ...options,
      currentDirectory: commandExecutor.getCurrentDirectory(),
      sessionContext: sessionContext.getRecentContext(),
      systemInfo: await getSystemInfo()
    };

    const response = await automationEngine.processQuery(query, enhancedOptions);
    return response;
  } catch (error) {
    console.error('AI query processing error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('parse-ai-response', async (event, response, biModalMode = false) => {
  try {
    const parsed = await responseParser.parse(response, { biModalMode });
    return {
      success: true,
      parsed
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

// Command History Management
ipcMain.handle('get-command-history', async (event, limit = 10) => {
  try {
    const history = sessionContext.getCommandHistory(limit);
    return {
      success: true,
      history
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('clear-command-history', async () => {
  try {
    sessionContext.clearHistory();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

// Special Operations
ipcMain.handle('handle-special-command', async (event, command, options = {}) => {
  try {
    // Handle special commands like file operations, system commands, etc.
    const result = await commandExecutor.handleSpecialCommand(command, options);
    return result;
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

// AI Model Management
ipcMain.handle('get-available-ai-models', async () => {
  try {
    const models = aiService.getAvailableModels();
    return {
      success: true,
      models
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('set-ai-model', async (event, modelName) => {
  try {
    const result = await aiService.setModel(modelName);
    return result;
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('get-current-ai-model', async () => {
  try {
    const model = aiService.getCurrentModel();
    return {
      success: true,
      model
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

// System Information
ipcMain.handle('get-system-info', async () => {
  return await getSystemInfo();
});

async function getSystemInfo() {
  try {
    return {
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      hostname: os.hostname(),
      userInfo: os.userInfo(),
      cpus: os.cpus().length,
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      uptime: os.uptime(),
      nodeVersion: process.version,
      electronVersion: process.versions.electron
    };
  } catch (error) {
    return {
      error: error.message
    };
  }
}

// Process Management
ipcMain.handle('kill-current-process', async () => {
  try {
    const result = await commandExecutor.killCurrentProcess();
    return result;
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

// File System Operations
ipcMain.handle('get-file-system-info', async () => {
  try {
    const currentDir = commandExecutor.getCurrentDirectory();
    const files = await fs.readdir(currentDir, { withFileTypes: true });
    
    const fileInfo = await Promise.all(
      files.map(async (file) => {
        try {
          const fullPath = path.join(currentDir, file.name);
          const stats = await fs.stat(fullPath);
          return {
            name: file.name,
            isDirectory: file.isDirectory(),
            isFile: file.isFile(),
            size: stats.size,
            modified: stats.mtime,
            permissions: stats.mode
          };
        } catch (error) {
          return {
            name: file.name,
            error: error.message
          };
        }
      })
    );

    return {
      success: true,
      currentDirectory: currentDir,
      files: fileInfo
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

// UI Operations
ipcMain.handle('select-background-image', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Background Image',
      filters: [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }
      ],
      properties: ['openFile']
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return {
        success: true,
        imagePath: result.filePaths[0]
      };
    }

    return {
      success: false,
      canceled: true
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('minimize-window', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.handle('maximize-window', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('close-window', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

// Plugin Management
ipcMain.handle('get-available-plugins', async () => {
  try {
    const plugins = pluginManager.getAvailablePlugins();
    return {
      success: true,
      plugins
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('enable-plugin', async (event, pluginName) => {
  try {
    const result = await pluginManager.enablePlugin(pluginName);
    return result;
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('disable-plugin', async (event, pluginName) => {
  try {
    const result = await pluginManager.disablePlugin(pluginName);
    return result;
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});
