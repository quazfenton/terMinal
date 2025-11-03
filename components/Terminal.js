/**
 * Terminal Component
 * 
 * Manages terminal display, logging, and output formatting with proper
 * memory management and performance optimization.
 */

class Terminal {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error(`Terminal container not found: ${containerId}`);
    }
    
    this.lines = [];
    this.maxLines = 1000;
    this.isAutoScrollEnabled = true;
    this.searchIndex = new Map(); // For fast searching
    this.renderQueue = [];
    this.isRendering = false;
    
    this.initializeContainer();
    this.setupEventListeners();
  }

  initializeContainer() {
    this.container.innerHTML = '';
    this.container.className = 'terminal-container';
    this.container.setAttribute('role', 'log');
    this.container.setAttribute('aria-live', 'polite');
    this.container.setAttribute('aria-label', 'Terminal output');
  }

  setupEventListeners() {
    // Handle scroll events for auto-scroll management
    this.container.addEventListener('scroll', () => {
      const { scrollTop, scrollHeight, clientHeight } = this.container;
      this.isAutoScrollEnabled = scrollTop + clientHeight >= scrollHeight - 10;
    });

    // Handle resize events
    window.addEventListener('resize', this.debounce(() => {
      this.scrollToBottom();
    }, 250));
  }

  /**
   * Add a log entry to the terminal
   * @param {string} text - The text to display
   * @param {string} type - The type of log entry (user, system, output, error, command)
   * @param {Object} options - Additional options
   */
  addLog(text, type = 'output', options = {}) {
    if (!text && text !== '') return;

    const line = {
      id: this.generateLineId(),
      text: String(text),
      type: type || 'output',
      timestamp: new Date().toISOString(),
      metadata: options.metadata || {},
      searchable: options.searchable !== false
    };

    // Add to lines array
    this.lines.push(line);
    
    // Maintain max lines limit
    if (this.lines.length > this.maxLines) {
      const removedLine = this.lines.shift();
      this.removeLineFromDOM(removedLine.id);
      this.searchIndex.delete(removedLine.id);
    }

    // Add to search index if searchable
    if (line.searchable) {
      this.searchIndex.set(line.id, line.text.toLowerCase());
    }

    // Queue for rendering
    this.queueRender(line);

    return line.id;
  }

  /**
   * Queue a line for rendering (batched for performance)
   */
  queueRender(line) {
    this.renderQueue.push(line);
    
    if (!this.isRendering) {
      this.isRendering = true;
      requestAnimationFrame(() => {
        this.processRenderQueue();
        this.isRendering = false;
      });
    }
  }

  /**
   * Process the render queue
   */
  processRenderQueue() {
    const fragment = document.createDocumentFragment();
    
    while (this.renderQueue.length > 0) {
      const line = this.renderQueue.shift();
      const lineElement = this.createLineElement(line);
      fragment.appendChild(lineElement);
    }
    
    this.container.appendChild(fragment);
    
    if (this.isAutoScrollEnabled) {
      this.scrollToBottom();
    }
  }

  /**
   * Create a DOM element for a terminal line
   */
  createLineElement(line) {
    const lineElement = document.createElement('div');
    lineElement.className = `terminal-line terminal-${line.type}`;
    lineElement.setAttribute('data-line-id', line.id);
    lineElement.setAttribute('data-timestamp', line.timestamp);
    
    const promptElement = document.createElement('span');
    promptElement.className = 'terminal-prompt';
    promptElement.textContent = this.getPromptForType(line.type);
    
    const contentElement = document.createElement('span');
    contentElement.className = 'terminal-content';
    
    // Handle different content types
    if (line.type === 'error') {
      contentElement.innerHTML = this.formatError(line.text);
    } else if (line.type === 'command') {
      contentElement.innerHTML = this.formatCommand(line.text);
    } else {
      contentElement.textContent = line.text;
    }
    
    lineElement.appendChild(promptElement);
    lineElement.appendChild(contentElement);
    
    // Add timestamp tooltip
    lineElement.title = new Date(line.timestamp).toLocaleString();
    
    return lineElement;
  }

  /**
   * Get prompt symbol for different line types
   */
  getPromptForType(type) {
    const prompts = {
      user: '$',
      system: '#',
      error: '✗',
      output: '>',
      command: '$',
      success: '✓',
      warning: '⚠',
      info: 'ℹ'
    };
    return prompts[type] || '>';
  }

  /**
   * Format error messages with syntax highlighting
   */
  formatError(text) {
    const errorPatterns = [
      { pattern: /Error:/gi, class: 'error-keyword' },
      { pattern: /Warning:/gi, class: 'warning-keyword' },
      { pattern: /Failed:/gi, class: 'error-keyword' },
      { pattern: /\b\d+\b/g, class: 'error-number' },
      { pattern: /['"`][^'"`]*['"`]/g, class: 'error-string' }
    ];
    
    let formatted = this.escapeHtml(text);
    
    errorPatterns.forEach(({ pattern, class: className }) => {
      formatted = formatted.replace(pattern, `<span class="${className}">$&</span>`);
    });
    
    return formatted;
  }

  /**
   * Format command text with syntax highlighting
   */
  formatCommand(text) {
    const commandPatterns = [
      { pattern: /^(\w+)/, class: 'command-name' },
      { pattern: /--?\w+/g, class: 'command-flag' },
      { pattern: /['"`][^'"`]*['"`]/g, class: 'command-string' },
      { pattern: /\b\d+\b/g, class: 'command-number' }
    ];
    
    let formatted = this.escapeHtml(text);
    
    commandPatterns.forEach(({ pattern, class: className }) => {
      formatted = formatted.replace(pattern, `<span class="${className}">$&</span>`);
    });
    
    return formatted;
  }

  /**
   * Clear all terminal content
   */
  clear() {
    this.lines = [];
    this.searchIndex.clear();
    this.renderQueue = [];
    this.container.innerHTML = '';
    
    // Add clear indicator
    this.addLog('Terminal cleared', 'system', { searchable: false });
  }

  /**
   * Search terminal content
   */
  search(query, options = {}) {
    const { caseSensitive = false, regex = false } = options;
    const results = [];
    
    const searchTerm = caseSensitive ? query : query.toLowerCase();
    
    for (const [lineId, content] of this.searchIndex.entries()) {
      const searchContent = caseSensitive ? content : content.toLowerCase();
      
      let match = false;
      if (regex) {
        try {
          const regexPattern = new RegExp(query, caseSensitive ? 'g' : 'gi');
          match = regexPattern.test(searchContent);
        } catch (e) {
          // Invalid regex, fall back to string search
          match = searchContent.includes(searchTerm);
        }
      } else {
        match = searchContent.includes(searchTerm);
      }
      
      if (match) {
        const line = this.lines.find(l => l.id === lineId);
        if (line) {
          results.push({
            lineId,
            line,
            element: this.container.querySelector(`[data-line-id="${lineId}"]`)
          });
        }
      }
    }
    
    return results;
  }

  /**
   * Highlight search results
   */
  highlightSearchResults(results, query) {
    // Clear previous highlights
    this.clearHighlights();
    
    results.forEach(({ element }) => {
      if (element) {
        element.classList.add('search-highlight');
        
        // Highlight the actual text
        const contentElement = element.querySelector('.terminal-content');
        if (contentElement) {
          const highlighted = this.highlightText(contentElement.textContent, query);
          contentElement.innerHTML = highlighted;
        }
      }
    });
  }

  /**
   * Clear search highlights
   */
  clearHighlights() {
    const highlighted = this.container.querySelectorAll('.search-highlight');
    highlighted.forEach(element => {
      element.classList.remove('search-highlight');
      const contentElement = element.querySelector('.terminal-content');
      if (contentElement) {
        contentElement.textContent = contentElement.textContent; // Remove HTML
      }
    });
  }

  /**
   * Highlight text matches
   */
  highlightText(text, query) {
    const regex = new RegExp(`(${this.escapeRegex(query)})`, 'gi');
    return this.escapeHtml(text).replace(regex, '<mark>$1</mark>');
  }

  /**
   * Export terminal content
   */
  export(format = 'text') {
    switch (format) {
      case 'json':
        return JSON.stringify(this.lines, null, 2);
      
      case 'html':
        return this.container.innerHTML;
      
      case 'text':
      default:
        return this.lines.map(line => 
          `[${new Date(line.timestamp).toLocaleString()}] ${this.getPromptForType(line.type)} ${line.text}`
        ).join('\n');
    }
  }

  /**
   * Scroll to bottom of terminal
   */
  scrollToBottom() {
    this.container.scrollTop = this.container.scrollHeight;
  }

  /**
   * Scroll to a specific line
   */
  scrollToLine(lineId) {
    const element = this.container.querySelector(`[data-line-id="${lineId}"]`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('highlight-line');
      setTimeout(() => element.classList.remove('highlight-line'), 2000);
    }
  }

  /**
   * Remove a line from DOM
   */
  removeLineFromDOM(lineId) {
    const element = this.container.querySelector(`[data-line-id="${lineId}"]`);
    if (element) {
      element.remove();
    }
  }

  /**
   * Generate unique line ID
   */
  generateLineId() {
    return `line_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Escape regex special characters
   */
  escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Debounce utility function
   */
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * Get terminal statistics
   */
  getStats() {
    return {
      totalLines: this.lines.length,
      maxLines: this.maxLines,
      searchableLines: this.searchIndex.size,
      memoryUsage: this.estimateMemoryUsage(),
      isAutoScrollEnabled: this.isAutoScrollEnabled
    };
  }

  /**
   * Estimate memory usage
   */
  estimateMemoryUsage() {
    const avgLineSize = this.lines.reduce((sum, line) => 
      sum + line.text.length + JSON.stringify(line.metadata).length, 0) / this.lines.length || 0;
    
    return {
      estimatedBytes: Math.round(this.lines.length * avgLineSize * 2), // Rough estimate
      lines: this.lines.length,
      averageLineSize: Math.round(avgLineSize)
    };
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.clear();
    this.container.removeEventListener('scroll', this.scrollHandler);
    window.removeEventListener('resize', this.resizeHandler);
    this.container = null;
    this.lines = null;
    this.searchIndex = null;
    this.renderQueue = null;
  }
}

// Export for both CommonJS and ES6 modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Terminal;
} else if (typeof window !== 'undefined') {
  window.Terminal = Terminal;
}