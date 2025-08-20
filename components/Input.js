/**
 * Input Component
 * 
 * Manages command input with advanced features like auto-completion,
 * history navigation, syntax highlighting, and input validation.
 */

class Input {
  constructor(inputId, submitCallback) {
    this.element = document.getElementById(inputId);
    if (!this.element) {
      throw new Error(`Input element not found: ${inputId}`);
    }
    
    this.submitCallback = submitCallback;
    this.history = [];
    this.historyIndex = -1;
    this.maxHistoryLength = 100;
    this.isProcessing = false;
    this.suggestions = [];
    this.currentSuggestionIndex = -1;
    
    this.initializeInput();
    this.setupEventListeners();
    this.loadHistory();
  }

  initializeInput() {
    this.element.setAttribute('autocomplete', 'off');
    this.element.setAttribute('spellcheck', 'false');
    this.element.setAttribute('role', 'combobox');
    this.element.setAttribute('aria-expanded', 'false');
    this.element.setAttribute('aria-autocomplete', 'list');
    
    // Create suggestion container
    this.createSuggestionContainer();
    
    // Create input wrapper for additional features
    this.wrapInput();
  }

  wrapInput() {
    const wrapper = document.createElement('div');
    wrapper.className = 'input-wrapper';
    
    // Insert wrapper before input
    this.element.parentNode.insertBefore(wrapper, this.element);
    
    // Move input into wrapper
    wrapper.appendChild(this.element);
    
    // Add input enhancements
    this.addInputEnhancements(wrapper);
    
    this.wrapper = wrapper;
  }

  addInputEnhancements(wrapper) {
    // Add syntax highlighting overlay
    const overlay = document.createElement('div');
    overlay.className = 'input-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    wrapper.appendChild(overlay);
    this.overlay = overlay;
    
    // Add input status indicator
    const status = document.createElement('div');
    status.className = 'input-status';
    wrapper.appendChild(status);
    this.statusIndicator = status;
    
    // Add character counter
    const counter = document.createElement('div');
    counter.className = 'input-counter';
    wrapper.appendChild(counter);
    this.counter = counter;
  }

  createSuggestionContainer() {
    const container = document.createElement('div');
    container.className = 'suggestion-container';
    container.setAttribute('role', 'listbox');
    container.setAttribute('aria-label', 'Command suggestions');
    container.style.display = 'none';
    
    // Insert after input
    this.element.parentNode.insertBefore(container, this.element.nextSibling);
    this.suggestionContainer = container;
  }

  setupEventListeners() {
    // Input events
    this.element.addEventListener('input', (event) => {
      this.handleInput(event);
    });
    
    this.element.addEventListener('keydown', (event) => {
      this.handleKeyDown(event);
    });
    
    this.element.addEventListener('focus', () => {
      this.handleFocus();
    });
    
    this.element.addEventListener('blur', () => {
      this.handleBlur();
    });
    
    // Paste event for special handling
    this.element.addEventListener('paste', (event) => {
      this.handlePaste(event);
    });
    
    // Suggestion container events
    this.suggestionContainer.addEventListener('click', (event) => {
      this.handleSuggestionClick(event);
    });
    
    // Global events
    document.addEventListener('click', (event) => {
      if (!this.wrapper.contains(event.target)) {
        this.hideSuggestions();
      }
    });
  }

  handleInput(event) {
    const value = this.element.value;
    
    // Update syntax highlighting
    this.updateSyntaxHighlighting(value);
    
    // Update character counter
    this.updateCounter(value);
    
    // Update status
    this.updateStatus(value);
    
    // Generate suggestions
    this.generateSuggestions(value);
    
    // Validate input
    this.validateInput(value);
  }

  handleKeyDown(event) {
    const { key, ctrlKey, metaKey, shiftKey } = event;
    
    // Handle special key combinations
    if (ctrlKey || metaKey) {
      switch (key) {
        case 'Enter':
          this.submitWithOptions({ force: true });
          event.preventDefault();
          return;
          
        case 'k':
          this.clear();
          event.preventDefault();
          return;
          
        case 'l':
          this.clearHistory();
          event.preventDefault();
          return;
      }
    }
    
    // Handle navigation and submission
    switch (key) {
      case 'Enter':
        if (this.currentSuggestionIndex >= 0) {
          this.applySuggestion(this.suggestions[this.currentSuggestionIndex]);
        } else {
          this.submit();
        }
        event.preventDefault();
        break;
        
      case 'ArrowUp':
        if (this.suggestions.length > 0) {
          this.navigateSuggestions(-1);
        } else {
          this.navigateHistory('up');
        }
        event.preventDefault();
        break;
        
      case 'ArrowDown':
        if (this.suggestions.length > 0) {
          this.navigateSuggestions(1);
        } else {
          this.navigateHistory('down');
        }
        event.preventDefault();
        break;
        
      case 'Tab':
        if (this.suggestions.length > 0) {
          this.applySuggestion(this.suggestions[0]);
          event.preventDefault();
        }
        break;
        
      case 'Escape':
        if (this.suggestions.length > 0) {
          this.hideSuggestions();
        } else {
          this.clear();
        }
        event.preventDefault();
        break;
    }
  }

  handleFocus() {
    this.wrapper.classList.add('focused');
    
    // Show suggestions if input has content
    if (this.element.value.trim()) {
      this.generateSuggestions(this.element.value);
    }
  }

  handleBlur() {
    this.wrapper.classList.remove('focused');
    
    // Hide suggestions after a delay to allow for clicks
    setTimeout(() => {
      this.hideSuggestions();
    }, 200);
  }

  handlePaste(event) {
    // Handle multi-line paste
    const paste = (event.clipboardData || window.clipboardData).getData('text');
    
    if (paste.includes('\n')) {
      event.preventDefault();
      
      // Split into lines and process each
      const lines = paste.split('\n').filter(line => line.trim());
      
      if (lines.length > 1) {
        this.handleMultiLineInput(lines);
      } else {
        this.element.value = lines[0] || '';
        this.handleInput({ target: this.element });
      }
    }
  }

  handleSuggestionClick(event) {
    const suggestionElement = event.target.closest('.suggestion-item');
    if (suggestionElement) {
      const index = parseInt(suggestionElement.getAttribute('data-index'));
      this.applySuggestion(this.suggestions[index]);
    }
  }

  handleMultiLineInput(lines) {
    // Show confirmation dialog for multi-line input
    const confirmed = confirm(`Execute ${lines.length} commands?\n\n${lines.slice(0, 3).join('\n')}${lines.length > 3 ? '\n...' : ''}`);
    
    if (confirmed && typeof this.submitCallback === 'function') {
      this.submitCallback(lines);
    }
  }

  updateSyntaxHighlighting(value) {
    if (!this.overlay) return;
    
    // Simple syntax highlighting for common patterns
    let highlighted = this.escapeHtml(value);
    
    // Highlight commands
    highlighted = highlighted.replace(/^(\w+)/, '<span class="command">$1</span>');
    
    // Highlight flags
    highlighted = highlighted.replace(/(--?\w+)/g, '<span class="flag">$1</span>');
    
    // Highlight strings
    highlighted = highlighted.replace(/(['"`])(.*?)\1/g, '<span class="string">$1$2$1</span>');
    
    // Highlight file paths
    highlighted = highlighted.replace(/([./~]\S*)/g, '<span class="path">$1</span>');
    
    this.overlay.innerHTML = highlighted;
  }

  updateCounter(value) {
    if (!this.counter) return;
    
    const length = value.length;
    const maxLength = 500; // Reasonable limit for commands
    
    this.counter.textContent = `${length}/${maxLength}`;
    this.counter.classList.toggle('warning', length > maxLength * 0.8);
    this.counter.classList.toggle('error', length > maxLength);
  }

  updateStatus(value) {
    if (!this.statusIndicator) return;
    
    let status = '';
    let className = '';
    
    if (this.isProcessing) {
      status = 'Processing...';
      className = 'processing';
    } else if (value.startsWith('!')) {
      status = 'Direct command';
      className = 'direct';
    } else if (this.isValidCommand(value)) {
      status = 'Valid command';
      className = 'valid';
    } else if (value.trim()) {
      status = 'Natural language';
      className = 'natural';
    }
    
    this.statusIndicator.textContent = status;
    this.statusIndicator.className = `input-status ${className}`;
  }

  generateSuggestions(value) {
    if (!value.trim()) {
      this.hideSuggestions();
      return;
    }
    
    const suggestions = [];
    
    // Command suggestions
    const commands = this.getCommandSuggestions(value);
    suggestions.push(...commands);
    
    // History suggestions
    const history = this.getHistorySuggestions(value);
    suggestions.push(...history);
    
    // Template suggestions
    const templates = this.getTemplateSuggestions(value);
    suggestions.push(...templates);
    
    this.suggestions = suggestions.slice(0, 10); // Limit to 10 suggestions
    this.renderSuggestions();
  }

  getCommandSuggestions(value) {
    const commonCommands = [
      'ls -la', 'cd ', 'pwd', 'mkdir ', 'touch ', 'rm ', 'cp ', 'mv ',
      'git status', 'git add .', 'git commit -m ""', 'git push', 'git pull',
      'npm install ', 'npm start', 'npm test', 'npm run build',
      'python ', 'node ', 'code .', 'vim ', 'nano '
    ];
    
    return commonCommands
      .filter(cmd => cmd.toLowerCase().includes(value.toLowerCase()))
      .map(cmd => ({
        type: 'command',
        text: cmd,
        description: 'Common command',
        icon: '⚡'
      }));
  }

  getHistorySuggestions(value) {
    return this.history
      .filter(item => item.toLowerCase().includes(value.toLowerCase()))
      .slice(0, 5)
      .map(item => ({
        type: 'history',
        text: item,
        description: 'From history',
        icon: '🕒'
      }));
  }

  getTemplateSuggestions(value) {
    const templates = [
      {
        trigger: 'create file',
        text: 'create a new file called ',
        description: 'File creation template'
      },
      {
        trigger: 'install',
        text: 'install package ',
        description: 'Package installation template'
      },
      {
        trigger: 'search',
        text: 'search for ',
        description: 'Search template'
      },
      {
        trigger: 'git setup',
        text: 'setup git repository with initial commit',
        description: 'Git setup template'
      }
    ];
    
    return templates
      .filter(template => template.trigger.includes(value.toLowerCase()))
      .map(template => ({
        type: 'template',
        text: template.text,
        description: template.description,
        icon: '📝'
      }));
  }

  renderSuggestions() {
    if (this.suggestions.length === 0) {
      this.hideSuggestions();
      return;
    }
    
    this.suggestionContainer.innerHTML = '';
    this.currentSuggestionIndex = -1;
    
    this.suggestions.forEach((suggestion, index) => {
      const element = document.createElement('div');
      element.className = 'suggestion-item';
      element.setAttribute('data-index', index);
      element.setAttribute('role', 'option');
      
      element.innerHTML = `
        <span class="suggestion-icon">${suggestion.icon}</span>
        <div class="suggestion-content">
          <div class="suggestion-text">${this.escapeHtml(suggestion.text)}</div>
          <div class="suggestion-description">${this.escapeHtml(suggestion.description)}</div>
        </div>
        <span class="suggestion-type">${suggestion.type}</span>
      `;
      
      this.suggestionContainer.appendChild(element);
    });
    
    this.showSuggestions();
  }

  showSuggestions() {
    this.suggestionContainer.style.display = 'block';
    this.element.setAttribute('aria-expanded', 'true');
  }

  hideSuggestions() {
    this.suggestionContainer.style.display = 'none';
    this.element.setAttribute('aria-expanded', 'false');
    this.currentSuggestionIndex = -1;
  }

  navigateSuggestions(direction) {
    if (this.suggestions.length === 0) return;
    
    // Clear previous selection
    if (this.currentSuggestionIndex >= 0) {
      const prevElement = this.suggestionContainer.children[this.currentSuggestionIndex];
      if (prevElement) {
        prevElement.classList.remove('selected');
      }
    }
    
    // Update index
    this.currentSuggestionIndex += direction;
    
    if (this.currentSuggestionIndex < 0) {
      this.currentSuggestionIndex = this.suggestions.length - 1;
    } else if (this.currentSuggestionIndex >= this.suggestions.length) {
      this.currentSuggestionIndex = 0;
    }
    
    // Select new item
    const newElement = this.suggestionContainer.children[this.currentSuggestionIndex];
    if (newElement) {
      newElement.classList.add('selected');
      newElement.scrollIntoView({ block: 'nearest' });
    }
  }

  applySuggestion(suggestion) {
    if (!suggestion) return;
    
    this.element.value = suggestion.text;
    this.element.focus();
    
    // Position cursor at end or at placeholder
    const cursorPos = suggestion.text.includes(' ') ? suggestion.text.length : suggestion.text.length;
    this.element.setSelectionRange(cursorPos, cursorPos);
    
    this.hideSuggestions();
    this.handleInput({ target: this.element });
  }

  navigateHistory(direction) {
    if (this.history.length === 0) return;
    
    if (direction === 'up') {
      this.historyIndex = Math.min(this.historyIndex + 1, this.history.length - 1);
    } else {
      this.historyIndex = Math.max(this.historyIndex - 1, -1);
    }
    
    if (this.historyIndex === -1) {
      this.element.value = '';
    } else {
      this.element.value = this.history[this.history.length - 1 - this.historyIndex];
    }
    
    this.handleInput({ target: this.element });
  }

  validateInput(value) {
    const validation = this.getInputValidation(value);
    
    // Update input styling
    this.element.classList.toggle('invalid', !validation.valid);
    this.element.classList.toggle('warning', validation.warning);
    
    // Update validation message
    this.showValidationMessage(validation);
  }

  getInputValidation(value) {
    if (!value.trim()) {
      return { valid: true };
    }
    
    // Check for dangerous patterns
    const dangerousPatterns = [
      /rm\s+-rf\s+\//,
      /sudo\s+rm/,
      />\s*\/dev\//,
      /format/i,
      /mkfs/
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(value)) {
        return {
          valid: false,
          message: 'Potentially dangerous command detected',
          type: 'error'
        };
      }
    }
    
    // Check for common mistakes
    if (value.includes('cd ') && value.includes('&&')) {
      return {
        valid: true,
        warning: true,
        message: 'Consider using separate commands for directory changes',
        type: 'warning'
      };
    }
    
    return { valid: true };
  }

  showValidationMessage(validation) {
    // Remove existing validation message
    const existing = this.wrapper.querySelector('.validation-message');
    if (existing) {
      existing.remove();
    }
    
    if (validation.message) {
      const message = document.createElement('div');
      message.className = `validation-message ${validation.type}`;
      message.textContent = validation.message;
      this.wrapper.appendChild(message);
      
      // Auto-hide after delay
      setTimeout(() => {
        if (message.parentNode) {
          message.remove();
        }
      }, 5000);
    }
  }

  submit() {
    const value = this.element.value.trim();
    
    if (!value || this.isProcessing) return;
    
    // Validate before submission
    const validation = this.getInputValidation(value);
    if (!validation.valid) {
      this.showValidationMessage(validation);
      return;
    }
    
    // Add to history
    this.addToHistory(value);
    
    // Clear input
    this.clear();
    
    // Call submit callback
    if (typeof this.submitCallback === 'function') {
      this.submitCallback(value);
    }
  }

  submitWithOptions(options = {}) {
    const value = this.element.value.trim();
    
    if (!value) return;
    
    if (options.force || this.getInputValidation(value).valid) {
      this.addToHistory(value);
      this.clear();
      
      if (typeof this.submitCallback === 'function') {
        this.submitCallback(value, options);
      }
    }
  }

  addToHistory(command) {
    // Don't add duplicates or empty commands
    if (!command || this.history[this.history.length - 1] === command) {
      return;
    }
    
    this.history.push(command);
    
    // Maintain max history length
    if (this.history.length > this.maxHistoryLength) {
      this.history.shift();
    }
    
    this.historyIndex = -1;
    this.saveHistory();
  }

  clear() {
    this.element.value = '';
    this.historyIndex = -1;
    this.hideSuggestions();
    
    if (this.overlay) {
      this.overlay.innerHTML = '';
    }
    
    this.updateCounter('');
    this.updateStatus('');
    
    // Remove validation messages
    const validationMessage = this.wrapper.querySelector('.validation-message');
    if (validationMessage) {
      validationMessage.remove();
    }
  }

  clearHistory() {
    this.history = [];
    this.historyIndex = -1;
    this.saveHistory();
  }

  setProcessing(processing) {
    this.isProcessing = processing;
    this.element.disabled = processing;
    this.wrapper.classList.toggle('processing', processing);
    
    this.updateStatus(this.element.value);
  }

  focus() {
    this.element.focus();
  }

  getValue() {
    return this.element.value;
  }

  setValue(value) {
    this.element.value = value;
    this.handleInput({ target: this.element });
  }

  isValidCommand(value) {
    // Simple check for valid command structure
    const commandPattern = /^[a-zA-Z][a-zA-Z0-9_-]*(\s+.*)?$/;
    return commandPattern.test(value.trim());
  }

  saveHistory() {
    try {
      localStorage.setItem('ai-terminal-history', JSON.stringify(this.history));
    } catch (error) {
      console.warn('Failed to save command history:', error);
    }
  }

  loadHistory() {
    try {
      const saved = localStorage.getItem('ai-terminal-history');
      if (saved) {
        this.history = JSON.parse(saved);
      }
    } catch (error) {
      console.warn('Failed to load command history:', error);
      this.history = [];
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  getStats() {
    return {
      historyLength: this.history.length,
      currentValue: this.element.value,
      isProcessing: this.isProcessing,
      hasSuggestions: this.suggestions.length > 0,
      selectedSuggestion: this.currentSuggestionIndex
    };
  }

  destroy() {
    // Remove event listeners
    this.element.removeEventListener('input', this.handleInput);
    this.element.removeEventListener('keydown', this.handleKeyDown);
    this.element.removeEventListener('focus', this.handleFocus);
    this.element.removeEventListener('blur', this.handleBlur);
    this.element.removeEventListener('paste', this.handlePaste);
    
    // Clean up DOM
    if (this.suggestionContainer) {
      this.suggestionContainer.remove();
    }
    
    if (this.wrapper && this.wrapper !== this.element.parentNode) {
      this.wrapper.parentNode.insertBefore(this.element, this.wrapper);
      this.wrapper.remove();
    }
    
    // Clear references
    this.submitCallback = null;
    this.history = null;
    this.suggestions = null;
  }
}

// Export for both CommonJS and ES6 modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Input;
} else if (typeof window !== 'undefined') {
  window.Input = Input;
}