/**
 * AI Terminal Renderer
 * 
 * Handles UI interactions and rendering for the AI Terminal application.
 */

// Global state
let currentDirectory = '';
let isProcessing = false;
let autoAcceptMode = false;
let biModalMode = false;
let commandSequences = [];
let autoAcceptTimer = null;
let autoAcceptCountdown = 15; // seconds
let backgroundImage = null;
let commandHistory = [];
let historyIndex = -1;

// DOM Elements
document.addEventListener('DOMContentLoaded', () => {
  // Initialize the application
  initializeApp();
});

/**
 * Initialize the application
 */
async function initializeApp() {
  // Get DOM elements
  const terminalArea = document.getElementById('terminalArea');
  const commandInput = document.getElementById('commandInput');
  const sendButton = document.getElementById('sendButton');
  const autoAcceptToggle = document.getElementById('autoAcceptToggle');
  const biModalToggle = document.getElementById('biModalToggle');
  const commandQueue = document.getElementById('commandQueue');
  const backgroundOverlay = document.getElementById('backgroundOverlay');
  const statusIndicator = document.getElementById('statusIndicator');
  const aiModelInfo = document.getElementById('aiModelInfo');
  const backgroundButton = document.getElementById('backgroundButton');
  const appearanceButton = document.getElementById('appearanceButton');
  const aiProviderSelect = document.getElementById('ai-provider-select');
  const modal = document.getElementById('appearanceModal');
  const closeButton = document.querySelector('.close-button');
  const themeSelect = document.getElementById('theme-select');
  const fontSelect = document.getElementById('font-select');
  
  // Load saved settings
  await loadAppearanceSettings(); // Await this as it fetches AI models
  
  // Get current directory
  currentDirectory = await window.electronAPI.getCurrentDirectory();
  addTerminalLine(`Current directory: ${currentDirectory}`, 'system');
  
  // Set up event listeners
  setupEventListeners();
  
  // Set up automation listeners
  setupAutomationListeners();
  
  // Focus the input
  commandInput.focus();
  
  // Display welcome message
  displayWelcomeMessage();
}

/**
 * Set up automation event listeners
 */
function setupAutomationListeners() {
  window.electronAPI.onAutomationUpdate((event, data) => {
    const { sequence, result } = data;
    updateAutomationStatus(sequence, result);
  });

  window.electronAPI.onAutomationNext((event, sequence) => {
    displayNextAutomationSequence(sequence);
  });
}

/**
 * Update UI with automation status
 * @param {Object} sequence - The automation sequence
 * @param {Array} result - Execution results
 */
function updateAutomationStatus(sequence, result) {
  const statusText = sequence.status === 'completed' 
    ? 'Automation completed successfully' 
    : `Automation failed: ${result.find(r => !r.success)?.error || 'Unknown error'}`;
  
  addTerminalLine(statusText, sequence.status === 'completed' ? 'system' : 'error');
  highlightExecutedSequence(sequence.id);
}

/**
 * Display the next automation sequence
 * @param {Object} sequence - The next sequence to display
 */
function displayNextAutomationSequence(sequence) {
  addTerminalLine(`Next automation task: ${sequence.description}`, 'system');
  renderCommandQueue([sequence]);
  startAutoAcceptCountdown(sequence.id);
}

/**
 * Display welcome message
 */
function displayWelcomeMessage() {
  const welcomeMessage = `
Welcome to AI Terminal!

This advanced terminal integrates with Claude AI to provide intelligent command suggestions and automation.
Type your request in natural language, and AI will generate ranked command sequences or automate tasks.

Tips:
- Toggle Auto-Accept to automatically execute top-ranked commands after 15 seconds
- Toggle Bi-Modal for complex tasks like file creation with content
- Start a command with ! to bypass AI and execute directly
- Press Ctrl+K to clear the terminal
- Press Esc to clear the input field
- Automation features include package installation, file creation, and code generation

Type your request below to get started...
`;
  
  addTerminalLine(welcomeMessage, 'system');
}

/**
 * Set up event listeners for UI elements
 */
function setupEventListeners() {
  // Send button click
  document.getElementById('sendButton').addEventListener('click', () => {
    processUserInput();
  });
  
  // Input keydown (Enter to send)
  document.getElementById('commandInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      processUserInput();
    } else if (event.key === 'Escape') {
      document.getElementById('commandInput').value = '';
    } else if (event.key === 'ArrowUp') {
      navigateHistory('up');
    } else if (event.key === 'ArrowDown') {
      navigateHistory('down');
    } else if (event.key === 'k' && (event.ctrlKey || event.metaKey)) {
      clearTerminal();
      event.preventDefault();
    }
  });
  
  // Auto-accept toggle
  document.getElementById('autoAcceptToggle').addEventListener('click', () => {
    autoAcceptMode = !autoAcceptMode;
    document.getElementById('autoAcceptToggle').classList.toggle('active', autoAcceptMode);
    
    // Cancel any existing timer
    if (!autoAcceptMode && autoAcceptTimer) {
      clearInterval(autoAcceptTimer);
      autoAcceptTimer = null;
      
      // Remove any countdown displays
      const countdowns = document.querySelectorAll('.auto-accept-timer');
      countdowns.forEach(el => el.remove());
    }
  });
  
  // Bi-modal toggle
  document.getElementById('biModalToggle').addEventListener('click', () => {
    biModalMode = !biModalMode;
    document.getElementById('biModalToggle').classList.toggle('active', biModalMode);
  });
  
  // Background button
  document.getElementById('backgroundButton').addEventListener('click', async () => {
    const imagePath = await window.electronAPI.selectBackgroundImage();
    if (imagePath) {
      setBackgroundImage(imagePath);
    }
  });

  // Appearance modal listeners
  appearanceButton.addEventListener('click', () => {
    modal.style.display = 'block';
  });

  closeButton.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  window.addEventListener('click', (event) => {
    if (event.target == modal) {
      modal.style.display = 'none';
    }
  });

  themeSelect.addEventListener('change', (event) => {
    applyTheme(event.target.value);
  });

  fontSelect.addEventListener('change', (event) => {
    document.body.style.fontFamily = event.target.value;
    localStorage.setItem('terminalFont', event.target.value);
  });

  aiProviderSelect.addEventListener('change', async (event) => {
    const selectedProvider = event.target.value;
    const result = await window.electronAPI.setAiModel(selectedProvider);
    if (result.success) {
      aiModelInfo.textContent = `${event.target.options[event.target.selectedIndex].text} Connected`;
      localStorage.setItem('aiProvider', selectedProvider);
    } else {
      addTerminalLine(`Failed to set AI model: ${result.error}`, 'error');
      // Revert selection if setting failed
      const currentModel = await window.electronAPI.getCurrentAiModel();
      event.target.value = currentModel;
      const currentModelText = providerSelect.options[providerSelect.selectedIndex].text;
      aiModelInfo.textContent = `${currentModelText} Connected`;
    }
  });
  
  // Command queue click delegation
  document.getElementById('commandQueue').addEventListener('click', (event) => {
    const commandItem = event.target.closest('.command-item');
    if (commandItem) {
      const sequenceId = commandItem.dataset.sequenceId;
      executeCommandSequence(sequenceId);
    }
  });
  
  // Clear button
  document.getElementById('clearButton').addEventListener('click', () => {
    clearTerminal();
  });
}

/**
 * Clear the terminal area
 */
function clearTerminal() {
  document.getElementById('terminalArea').innerHTML = '';
  addTerminalLine('Terminal cleared.', 'system');
}

/**
 * Navigate command history
 * @param {string} direction - Direction to navigate ('up' or 'down')
 */
function navigateHistory(direction) {
  if (commandHistory.length === 0) return;
  
  if (direction === 'up') {
    historyIndex = historyIndex < commandHistory.length - 1 ? historyIndex + 1 : historyIndex;
  } else {
    historyIndex = historyIndex > 0 ? historyIndex - 1 : -1;
  }
  
  if (historyIndex === -1) {
    document.getElementById('commandInput').value = '';
  } else {
    document.getElementById('commandInput').value = commandHistory[commandHistory.length - 1 - historyIndex];
  }
}

/**
 * Process user input from the command input field
 */
async function processUserInput() {
  const commandInput = document.getElementById('commandInput');
  const userInput = commandInput.value.trim();
  if (!userInput || isProcessing) return;
  
  // Add to history
  commandHistory.push(userInput);
  if (commandHistory.length > 100) {
    commandHistory = commandHistory.slice(-100);
  }
  historyIndex = -1;
  
  // Clear input
  commandInput.value = '';
  
  // Display user input in terminal
  addTerminalLine(userInput, 'user');
  
  // Check if it's a direct command (starts with !)
  if (userInput.startsWith('!')) {
    executeDirectCommand(userInput.substring(1));
    return;
  }
  
  // Process with automation engine
  await processWithAutomation(userInput);
}

/**
 * Execute a direct command (bypassing AI)
 * @param {string} command - The command to execute
 */
async function executeDirectCommand(command) {
  isProcessing = true;
  updateUIState();
  
  try {
    // Execute the command
    const result = await window.electronAPI.executeCommand(command);
    
    // Display result
    if (result.success) {
      addTerminalLine(result.output, 'output');
      if (result.stderr) {
        addTerminalLine(result.stderr, 'error');
      }
      
      // Check if directory changed
      if (command.startsWith('cd ')) {
        currentDirectory = await window.electronAPI.getCurrentDirectory();
      }
    } else {
      addTerminalLine(`Command failed: ${result.output || result.error || 'Unknown error'}`, 'error');
    }
  } catch (error) {
    addTerminalLine(`Execution Error: ${error.message}`, 'error');
  } finally {
    isProcessing = false;
    updateUIState();
  }
}

/**
 * Process user input with automation engine
 * @param {string} userInput - The user's input
 */
async function processWithAutomation(userInput) {
  isProcessing = true;
  updateUIState();
  
  // Show AI thinking indicator
  const thinkingIndicator = addThinkingIndicator();
  
  try {
    const selectedProvider = document.getElementById('ai-provider-select').value;
    // Send to automation engine
    const response = await window.electronAPI.processAIQuery(userInput, {
      biModalMode,
      includeDirectoryContext: true,
      modelName: selectedProvider
    });
    
    // Remove thinking indicator
    thinkingIndicator.remove();
    
    if (response.success) {
      // Update command sequences
      commandSequences = response.commandSequences || [];
      
      // Render command queue
      renderCommandQueue(commandSequences);
      
      // Auto-execute highest ranked command if auto-accept is enabled
      if (autoAcceptMode && commandSequences.length > 0) {
        startAutoAcceptCountdown(commandSequences[0].id);
      }
    } else {
      addTerminalLine(`Automation Error: ${response.error}`, 'error');
    }
  } catch (error) {
    addTerminalLine(`AI Processing Error: ${error.message}`, 'error');
  } finally {
    isProcessing = false;
    updateUIState();
  }
}

/**
 * Execute a command sequence by ID
 * @param {string} sequenceId - The ID of the sequence to execute
 */
async function executeCommandSequence(sequenceId) {
  // Cancel any auto-accept countdown
  if (autoAcceptTimer) {
    clearInterval(autoAcceptTimer);
    autoAcceptTimer = null;
    
    // Remove any countdown displays
    const countdowns = document.querySelectorAll('.auto-accept-timer');
    countdowns.forEach(el => el.remove());
  }
  
  // Find the sequence
  const sequence = commandSequences.find(seq => seq.id === sequenceId);
  if (!sequence) {
    addTerminalLine(`Error: Command sequence ${sequenceId} not found`, 'error');
    return;
  }
  
  isProcessing = true;
  updateUIState();
  
  try {
    // Execute each command in the sequence
    for (const cmd of sequence.commands) {
      const command = typeof cmd === 'string' ? cmd : cmd.command;
      
      // Skip empty commands
      if (!command || command.trim() === '') continue;
      
      // Display the command
      addTerminalLine(command, 'command');
      
      // Check if this is a file creation command and we have content
      const options = {};
      if (sequence.fileContent && 
          (command.startsWith('nano ') || 
           command.startsWith('vim ') || 
           command.startsWith('touch ') || 
           command.startsWith('echo ') && command.includes('>'))) {
        options.fileContent = sequence.fileContent;
      }
      
      // Execute the command
      const result = await window.electronAPI.executeCommand(command, options);
      
      // Display result
      if (result.success) {
        if (result.output) {
          addTerminalLine(result.output, 'output');
        }
        if (result.stderr) {
          addTerminalLine(result.stderr, 'error');
        }
        
        // Check if directory changed
        if (command.startsWith('cd ')) {
          currentDirectory = await window.electronAPI.getCurrentDirectory();
        }
      } else {
        addTerminalLine(result.output || result.error || 'Command failed', 'error');
        // Stop execution on error
        break;
      }
    }
    
    // Highlight the executed sequence
    highlightExecutedSequence(sequenceId);
  } catch (error) {
    addTerminalLine(`Error: ${error.message}`, 'error');
  } finally {
    isProcessing = false;
    updateUIState();
  }
}

/**
 * Start the auto-accept countdown for a command sequence
 * @param {string} sequenceId - The ID of the sequence to auto-execute
 */
function startAutoAcceptCountdown(sequenceId) {
  // Reset countdown
  autoAcceptCountdown = 15;
  
  // Find the command item
  const commandItem = document.querySelector(`.command-item[data-sequence-id="${sequenceId}"]`);
  if (!commandItem) return;
  
  // Add countdown display
  let countdownDisplay = document.createElement('div');
  countdownDisplay.className = 'auto-accept-timer';
  countdownDisplay.textContent = autoAcceptCountdown;
  commandItem.appendChild(countdownDisplay);
  
  // Start countdown
  autoAcceptTimer = setInterval(() => {
    autoAcceptCountdown--;
    
    // Update display
    countdownDisplay.textContent = autoAcceptCountdown;
    
    // Execute when countdown reaches 0
    if (autoAcceptCountdown <= 0) {
      clearInterval(autoAcceptTimer);
      autoAcceptTimer = null;
      executeCommandSequence(sequenceId);
    }
  }, 1000);
}

/**
 * Add a line to the terminal area
 * @param {string} text - The text to add
 * @param {string} type - The type of line (user, system, output, error, command)
 * @returns {HTMLElement} The added line element
 */
function addTerminalLine(text, type = 'output') {
  const terminalArea = document.getElementById('terminalArea');
  const line = document.createElement('div');
  line.className = `terminal-line fade-in`;
  
  const prompt = document.createElement('span');
  prompt.className = 'terminal-prompt';
  
  const content = document.createElement('span');
  content.className = 'terminal-content';
  
  // Set prompt based on type
  switch (type) {
    case 'user':
      prompt.textContent = '> ';
      content.textContent = text;
      break;
    case 'system':
      prompt.textContent = '# ';
      content.textContent = text;
      break;
    case 'command':
      prompt.textContent = '$ ';
      content.textContent = text;
      break;
    case 'error':
      prompt.textContent = '! ';
      content.className += ' terminal-error';
      content.textContent = text;
      break;
    default:
      prompt.textContent = '';
      content.textContent = text;
  }
  
  line.appendChild(prompt);
  line.appendChild(content);
  terminalArea.appendChild(line);
  
  // Scroll to bottom
  terminalArea.scrollTop = terminalArea.scrollHeight;
  
  return line;
}

/**
 * Add AI thinking indicator to the terminal
 * @returns {HTMLElement} The thinking indicator element
 */
function addThinkingIndicator() {
  const terminalArea = document.getElementById('terminalArea');
  const indicator = document.createElement('div');
  indicator.className = 'ai-thinking fade-in';
  
  const text = document.createElement('span');
  text.textContent = 'AI is thinking';
  
  const dots = document.createElement('div');
  dots.className = 'thinking-dots';
  
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('div');
    dot.className = 'thinking-dot';
    dots.appendChild(dot);
  }
  
  indicator.appendChild(text);
  indicator.appendChild(dots);
  terminalArea.appendChild(indicator);
  
  // Scroll to bottom
  terminalArea.scrollTop = terminalArea.scrollHeight;
  
  return indicator;
}

/**
 * Add model response to the terminal
 * @param {string} text - The response text
 */
function addModelResponse(text) {
  const terminalArea = document.getElementById('terminalArea');
  const response = document.createElement('div');
  response.className = 'model-response fade-in';
  
  const header = document.createElement('div');
  header.className = 'response-header';
  header.textContent = 'AI RESPONSE';
  
  const content = document.createElement('div');
  content.textContent = text;
  
  response.appendChild(header);
  response.appendChild(content);
  terminalArea.appendChild(response);
  
  // Scroll to bottom
  terminalArea.scrollTop = terminalArea.scrollHeight;
}

/**
 * Render the command queue with command sequences
 * @param {Array} sequences - The command sequences to render
 */
function renderCommandQueue(sequences) {
  const commandQueue = document.getElementById('commandQueue');
  
  // Clear existing items
  commandQueue.innerHTML = '';
  
  // Add title
  const title = document.createElement('div');
  title.className = 'queue-title';
  title.textContent = 'COMMAND QUEUE';
  commandQueue.appendChild(title);
  
  // Sort sequences by rank
  sequences.sort((a, b) => a.rank - b.rank);
  
  // Add command items
  sequences.forEach(sequence => {
    const item = document.createElement('div');
    item.className = 'command-item fade-in';
    item.dataset.sequenceId = sequence.id;
    
    // Add rank badge
    const rank = document.createElement('div');
    rank.className = 'command-rank';
    rank.textContent = `#${sequence.rank}`;
    item.appendChild(rank);
    
    // Add commands
    sequence.commands.forEach((cmd, index) => {
      const command = typeof cmd === 'string' ? cmd : cmd.command;
      
      const cmdText = document.createElement('div');
      cmdText.className = 'command-text';
      cmdText.textContent = command;
      item.appendChild(cmdText);
      
      // Add separator if not last command
      if (index < sequence.commands.length - 1) {
        const separator = document.createElement('div');
        separator.style.color = '#666';
        separator.style.fontSize = '10px';
        separator.style.margin = '2px 0';
        separator.textContent = '↓';
        item.appendChild(separator);
      }
    });
    
    // Add description
    if (sequence.description) {
      const description = document.createElement('div');
      description.className = 'command-description';
      description.textContent = sequence.description;
      item.appendChild(description);
    }
    
    // Add file content indicator if present
    if (sequence.fileContent) {
      const fileIndicator = document.createElement('div');
      fileIndicator.className = 'file-content-indicator';
      fileIndicator.textContent = 'Includes file content';
      fileIndicator.style.color = '#00ff88';
      fileIndicator.style.fontSize = '11px';
      fileIndicator.style.marginTop = '5px';
      item.appendChild(fileIndicator);
    }
    
    // Add automation status
    if (sequence.status) {
      const status = document.createElement('div');
      status.className = 'automation-status';
      status.textContent = `Status: ${sequence.status}`;
      status.style.color = sequence.status === 'completed' ? '#00ff88' : '#ff5555';
      item.appendChild(status);
    }
    
    commandQueue.appendChild(item);
  });
}

/**
 * Highlight a command sequence that was executed
 * @param {string} sequenceId - The ID of the executed sequence
 */
function highlightExecutedSequence(sequenceId) {
  // Remove highlight from all items
  const items = document.querySelectorAll('.command-item');
  items.forEach(item => {
    item.style.borderColor = '';
    item.style.backgroundColor = '';
  });
  
  // Add highlight to executed item
  const executedItem = document.querySelector(`.command-item[data-sequence-id="${sequenceId}"]`);
  if (executedItem) {
    executedItem.style.borderColor = '#00ff88';
    executedItem.style.backgroundColor = 'rgba(0, 255, 136, 0.1)';
  }
}

/**
 * Update UI state based on processing state
 */
async function updateUIState() {
  // Update send button
  const sendButton = document.getElementById('sendButton');
  sendButton.disabled = isProcessing;
  sendButton.textContent = isProcessing ? 'Processing...' : 'Send';
  
  // Update input
  const commandInput = document.getElementById('commandInput');
  commandInput.disabled = isProcessing;
  
  // Update status indicator
  const statusIndicator = document.getElementById('statusIndicator');
  statusIndicator.style.backgroundColor = isProcessing ? '#ffbd2e' : '#00ff88';
  
  // Update AI model info
  const aiModelInfo = document.getElementById('aiModelInfo');
  const currentModelName = await window.electronAPI.getCurrentAiModel();
  const providerSelect = document.getElementById('ai-provider-select');
  const selectedOption = Array.from(providerSelect.options).find(option => option.value === currentModelName);
  const modelText = selectedOption ? selectedOption.text : 'Unknown Model';
  aiModelInfo.textContent = isProcessing ? 'AI Processing...' : `${modelText} Connected`;
}

/**
 * Set a background image
 * @param {string} imagePath - Path to the image
 */
function setBackgroundImage(imagePath) {
  backgroundImage = imagePath;
  const backgroundOverlay = document.getElementById('backgroundOverlay');
  backgroundOverlay.style.backgroundImage = `url('${imagePath}')`;
  backgroundOverlay.classList.add('active');
  localStorage.setItem('backgroundImage', imagePath);
}

/**
 * Apply a theme to the application
 * @param {string} themeName - The name of the theme to apply
 */
function applyTheme(themeName) {
  const body = document.body;
  body.className = `theme-${themeName}`;
  localStorage.setItem('terminalTheme', themeName);
}

/**
 * Load appearance settings from localStorage
 */
async function loadAppearanceSettings() {
  const savedTheme = localStorage.getItem('terminalTheme');
  if (savedTheme) {
    applyTheme(savedTheme);
    document.getElementById('theme-select').value = savedTheme;
  }

  const savedFont = localStorage.getItem('terminalFont');
  if (savedFont) {
    document.body.style.fontFamily = savedFont;
    document.getElementById('font-select').value = savedFont;
  }

  const savedBackgroundImage = localStorage.getItem('backgroundImage');
  if (savedBackgroundImage) {
    setBackgroundImage(savedBackgroundImage);
  }

  const savedAiProvider = localStorage.getItem('aiProvider');
  const providerSelect = document.getElementById('ai-provider-select');
  
  // Populate AI provider dropdown
  const availableModels = await window.electronAPI.getAvailableAiModels();
  providerSelect.innerHTML = ''; // Clear existing options
  for (const displayName in availableModels) {
    const option = document.createElement('option');
    option.value = availableModels[displayName];
    option.textContent = displayName;
    providerSelect.appendChild(option);
  }

  if (savedAiProvider) {
    providerSelect.value = savedAiProvider;
  } else if (Object.keys(availableModels).length > 0) {
    // Set default if no saved provider but models are available
    providerSelect.value = Object.values(availableModels);
  }
  
  // Update AI model info display after populating and setting value
  const currentModelName = await window.electronAPI.getCurrentAiModel();
  const selectedOption = Array.from(providerSelect.options).find(option => option.value === currentModelName);
  const modelText = selectedOption ? selectedOption.text : 'Unknown Model';
  document.getElementById('aiModelInfo').textContent = `${modelText} Connected`;
}

// Export functions for preload script
window.terminalUI = {
  addTerminalLine,
  renderCommandQueue,
  executeCommandSequence,
  processWithAutomation,
  setBackgroundImage,
  updateUIState
};