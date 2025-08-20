/**
 * CommandQueue Component
 * 
 * Manages the display and interaction of AI-generated command sequences
 * with proper state management and user interaction handling.
 */

class CommandQueue {
  constructor(containerId, executeCallback) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error(`CommandQueue container not found: ${containerId}`);
    }
    
    this.executeCallback = executeCallback;
    this.sequences = [];
    this.selectedSequenceId = null;
    this.isProcessing = false;
    this.autoAcceptTimer = null;
    this.autoAcceptCountdown = 15;
    
    this.initializeContainer();
    this.setupEventListeners();
  }

  initializeContainer() {
    this.container.innerHTML = '';
    this.container.className = 'command-queue-container';
    this.container.setAttribute('role', 'list');
    this.container.setAttribute('aria-label', 'Command queue');
    
    // Add header
    const header = document.createElement('div');
    header.className = 'queue-header';
    header.innerHTML = `
      <h3 class="queue-title">COMMAND QUEUE</h3>
      <div class="queue-controls">
        <button class="btn-clear-queue" title="Clear all commands">Clear</button>
        <button class="btn-refresh-queue" title="Refresh queue">Refresh</button>
      </div>
    `;
    
    this.container.appendChild(header);
    
    // Add content area
    const content = document.createElement('div');
    content.className = 'queue-content';
    content.id = 'queueContent';
    this.container.appendChild(content);
    
    this.contentArea = content;
  }

  setupEventListeners() {
    // Event delegation for command items
    this.contentArea.addEventListener('click', (event) => {
      this.handleItemClick(event);
    });
    
    // Keyboard navigation
    this.contentArea.addEventListener('keydown', (event) => {
      this.handleKeyNavigation(event);
    });
    
    // Queue controls
    const clearBtn = this.container.querySelector('.btn-clear-queue');
    const refreshBtn = this.container.querySelector('.btn-refresh-queue');
    
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clear());
    }
    
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.refresh());
    }
  }

  /**
   * Render command sequences in the queue
   * @param {Array} sequences - Array of command sequence objects
   */
  render(sequences) {
    if (!Array.isArray(sequences)) {
      console.error('CommandQueue.render: sequences must be an array');
      return;
    }

    this.sequences = sequences.map(seq => ({
      ...seq,
      id: seq.id || this.generateSequenceId(),
      timestamp: seq.timestamp || new Date().toISOString(),
      status: seq.status || 'pending'
    }));

    this.renderSequences();
    this.updateQueueStats();
  }

  /**
   * Render all sequences
   */
  renderSequences() {
    // Clear existing content
    this.contentArea.innerHTML = '';
    
    if (this.sequences.length === 0) {
      this.renderEmptyState();
      return;
    }

    // Sort sequences by rank
    const sortedSequences = [...this.sequences].sort((a, b) => 
      (a.rank || 999) - (b.rank || 999)
    );

    // Create document fragment for better performance
    const fragment = document.createDocumentFragment();
    
    sortedSequences.forEach((sequence, index) => {
      const sequenceElement = this.createSequenceElement(sequence, index);
      fragment.appendChild(sequenceElement);
    });
    
    this.contentArea.appendChild(fragment);
    
    // Focus first item if none selected
    if (!this.selectedSequenceId && sortedSequences.length > 0) {
      this.selectSequence(sortedSequences[0].id);
    }
  }

  /**
   * Create DOM element for a command sequence
   */
  createSequenceElement(sequence, index) {
    const element = document.createElement('div');
    element.className = `command-item ${sequence.status}`;
    element.setAttribute('data-sequence-id', sequence.id);
    element.setAttribute('role', 'listitem');
    element.setAttribute('tabindex', '0');
    element.setAttribute('aria-label', `Command sequence ${index + 1}: ${sequence.description}`);
    
    // Rank badge
    const rankBadge = document.createElement('div');
    rankBadge.className = 'command-rank';
    rankBadge.textContent = sequence.rank || index + 1;
    
    // Main content
    const content = document.createElement('div');
    content.className = 'command-content';
    
    // Commands preview
    const commandsPreview = this.createCommandsPreview(sequence.commands);
    
    // Description
    const description = document.createElement('div');
    description.className = 'command-description';
    description.textContent = sequence.description || 'No description available';
    
    // Metadata
    const metadata = this.createMetadata(sequence);
    
    // Actions
    const actions = this.createActions(sequence);
    
    content.appendChild(commandsPreview);
    content.appendChild(description);
    content.appendChild(metadata);
    content.appendChild(actions);
    
    element.appendChild(rankBadge);
    element.appendChild(content);
    
    // Add status indicators
    this.addStatusIndicators(element, sequence);
    
    return element;
  }

  /**
   * Create commands preview
   */
  createCommandsPreview(commands) {
    const preview = document.createElement('div');
    preview.className = 'commands-preview';
    
    if (!Array.isArray(commands) || commands.length === 0) {
      preview.textContent = 'No commands';
      return preview;
    }
    
    // Show first command and count if more
    const firstCommand = typeof commands[0] === 'string' ? commands[0] : commands[0].command;
    const commandText = document.createElement('code');
    commandText.className = 'command-text';
    commandText.textContent = this.truncateText(firstCommand, 60);
    
    preview.appendChild(commandText);
    
    if (commands.length > 1) {
      const moreIndicator = document.createElement('span');
      moreIndicator.className = 'more-commands';
      moreIndicator.textContent = ` +${commands.length - 1} more`;
      preview.appendChild(moreIndicator);
    }
    
    return preview;
  }

  /**
   * Create metadata section
   */
  createMetadata(sequence) {
    const metadata = document.createElement('div');
    metadata.className = 'command-metadata';
    
    const items = [];
    
    // Execution mode
    if (sequence.executionMode) {
      items.push(`Mode: ${sequence.executionMode}`);
    }
    
    // File content indicator
    if (sequence.fileContent) {
      items.push('📄 Has file content');
    }
    
    // Confidence score
    if (sequence.confidence !== undefined) {
      const confidence = Math.round(sequence.confidence * 100);
      items.push(`Confidence: ${confidence}%`);
    }
    
    // Timestamp
    if (sequence.timestamp) {
      const time = new Date(sequence.timestamp).toLocaleTimeString();
      items.push(`Created: ${time}`);
    }
    
    metadata.textContent = items.join(' • ');
    return metadata;
  }

  /**
   * Create action buttons
   */
  createActions(sequence) {
    const actions = document.createElement('div');
    actions.className = 'command-actions';
    
    // Execute button
    const executeBtn = document.createElement('button');
    executeBtn.className = 'btn-execute';
    executeBtn.textContent = 'Execute';
    executeBtn.setAttribute('data-action', 'execute');
    executeBtn.disabled = this.isProcessing || sequence.status === 'executing';
    
    // View details button
    const detailsBtn = document.createElement('button');
    detailsBtn.className = 'btn-details';
    detailsBtn.textContent = 'Details';
    detailsBtn.setAttribute('data-action', 'details');
    
    // Copy button
    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn-copy';
    copyBtn.textContent = 'Copy';
    copyBtn.setAttribute('data-action', 'copy');
    copyBtn.title = 'Copy commands to clipboard';
    
    actions.appendChild(executeBtn);
    actions.appendChild(detailsBtn);
    actions.appendChild(copyBtn);
    
    return actions;
  }

  /**
   * Add status indicators to sequence element
   */
  addStatusIndicators(element, sequence) {
    // Status badge
    const statusBadge = document.createElement('div');
    statusBadge.className = `status-badge status-${sequence.status}`;
    statusBadge.textContent = sequence.status.toUpperCase();
    element.appendChild(statusBadge);
    
    // Auto-accept countdown
    if (sequence.autoAcceptCountdown) {
      const countdown = document.createElement('div');
      countdown.className = 'auto-accept-timer';
      countdown.textContent = sequence.autoAcceptCountdown;
      element.appendChild(countdown);
    }
    
    // Warning indicators
    if (sequence.requiresConfirmation) {
      const warning = document.createElement('div');
      warning.className = 'warning-indicator';
      warning.textContent = '⚠️';
      warning.title = 'Requires confirmation';
      element.appendChild(warning);
    }
  }

  /**
   * Handle item click events
   */
  handleItemClick(event) {
    const item = event.target.closest('.command-item');
    const action = event.target.getAttribute('data-action');
    
    if (!item) return;
    
    const sequenceId = item.getAttribute('data-sequence-id');
    
    if (action) {
      event.stopPropagation();
      this.handleAction(action, sequenceId);
    } else {
      // Select item or execute if already selected
      if (this.selectedSequenceId === sequenceId) {
        this.executeSequence(sequenceId);
      } else {
        this.selectSequence(sequenceId);
      }
    }
  }

  /**
   * Handle action button clicks
   */
  handleAction(action, sequenceId) {
    const sequence = this.sequences.find(s => s.id === sequenceId);
    if (!sequence) return;
    
    switch (action) {
      case 'execute':
        this.executeSequence(sequenceId);
        break;
        
      case 'details':
        this.showDetails(sequence);
        break;
        
      case 'copy':
        this.copyToClipboard(sequence);
        break;
    }
  }

  /**
   * Handle keyboard navigation
   */
  handleKeyNavigation(event) {
    const items = Array.from(this.contentArea.querySelectorAll('.command-item'));
    const currentIndex = items.findIndex(item => 
      item.getAttribute('data-sequence-id') === this.selectedSequenceId
    );
    
    let newIndex = currentIndex;
    
    switch (event.key) {
      case 'ArrowUp':
        newIndex = Math.max(0, currentIndex - 1);
        event.preventDefault();
        break;
        
      case 'ArrowDown':
        newIndex = Math.min(items.length - 1, currentIndex + 1);
        event.preventDefault();
        break;
        
      case 'Enter':
      case ' ':
        if (this.selectedSequenceId) {
          this.executeSequence(this.selectedSequenceId);
        }
        event.preventDefault();
        break;
        
      case 'Escape':
        this.clearSelection();
        event.preventDefault();
        break;
    }
    
    if (newIndex !== currentIndex && items[newIndex]) {
      const sequenceId = items[newIndex].getAttribute('data-sequence-id');
      this.selectSequence(sequenceId);
    }
  }

  /**
   * Select a sequence
   */
  selectSequence(sequenceId) {
    // Clear previous selection
    this.contentArea.querySelectorAll('.command-item.selected')
      .forEach(item => item.classList.remove('selected'));
    
    // Select new item
    const item = this.contentArea.querySelector(`[data-sequence-id="${sequenceId}"]`);
    if (item) {
      item.classList.add('selected');
      item.focus();
      this.selectedSequenceId = sequenceId;
      
      // Scroll into view if needed
      item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  /**
   * Clear selection
   */
  clearSelection() {
    this.contentArea.querySelectorAll('.command-item.selected')
      .forEach(item => item.classList.remove('selected'));
    this.selectedSequenceId = null;
  }

  /**
   * Execute a sequence
   */
  async executeSequence(sequenceId) {
    if (this.isProcessing) return;
    
    const sequence = this.sequences.find(s => s.id === sequenceId);
    if (!sequence) return;
    
    // Update status
    this.updateSequenceStatus(sequenceId, 'executing');
    this.isProcessing = true;
    
    try {
      // Call the execute callback
      if (typeof this.executeCallback === 'function') {
        await this.executeCallback(sequenceId);
      }
      
      this.updateSequenceStatus(sequenceId, 'completed');
    } catch (error) {
      console.error('Execution error:', error);
      this.updateSequenceStatus(sequenceId, 'failed');
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Update sequence status
   */
  updateSequenceStatus(sequenceId, status) {
    const sequence = this.sequences.find(s => s.id === sequenceId);
    if (sequence) {
      sequence.status = status;
      
      const item = this.contentArea.querySelector(`[data-sequence-id="${sequenceId}"]`);
      if (item) {
        item.className = `command-item ${status}`;
        
        // Update status badge
        const statusBadge = item.querySelector('.status-badge');
        if (statusBadge) {
          statusBadge.className = `status-badge status-${status}`;
          statusBadge.textContent = status.toUpperCase();
        }
        
        // Update execute button
        const executeBtn = item.querySelector('.btn-execute');
        if (executeBtn) {
          executeBtn.disabled = status === 'executing' || this.isProcessing;
        }
      }
    }
  }

  /**
   * Show sequence details in modal
   */
  showDetails(sequence) {
    const modal = this.createDetailsModal(sequence);
    document.body.appendChild(modal);
    
    // Focus management
    const closeBtn = modal.querySelector('.modal-close');
    if (closeBtn) {
      closeBtn.focus();
    }
  }

  /**
   * Create details modal
   */
  createDetailsModal(sequence) {
    const modal = document.createElement('div');
    modal.className = 'modal sequence-details-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-labelledby', 'modal-title');
    
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2 id="modal-title">Command Sequence Details</h2>
          <button class="modal-close" aria-label="Close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="detail-section">
            <h3>Description</h3>
            <p>${this.escapeHtml(sequence.description || 'No description')}</p>
          </div>
          
          <div class="detail-section">
            <h3>Commands (${sequence.commands?.length || 0})</h3>
            <div class="commands-list">
              ${this.renderCommandsList(sequence.commands)}
            </div>
          </div>
          
          ${sequence.fileContent ? `
            <div class="detail-section">
              <h3>File Content</h3>
              <pre class="file-content">${this.escapeHtml(sequence.fileContent)}</pre>
            </div>
          ` : ''}
          
          <div class="detail-section">
            <h3>Metadata</h3>
            <dl class="metadata-list">
              <dt>Rank:</dt><dd>${sequence.rank || 'N/A'}</dd>
              <dt>Status:</dt><dd>${sequence.status}</dd>
              <dt>Execution Mode:</dt><dd>${sequence.executionMode || 'sequential'}</dd>
              <dt>Created:</dt><dd>${new Date(sequence.timestamp).toLocaleString()}</dd>
              ${sequence.confidence ? `<dt>Confidence:</dt><dd>${Math.round(sequence.confidence * 100)}%</dd>` : ''}
            </dl>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" data-action="execute">Execute</button>
          <button class="btn btn-secondary" data-action="copy">Copy Commands</button>
          <button class="btn btn-secondary modal-close">Close</button>
        </div>
      </div>
    `;
    
    // Event listeners
    modal.addEventListener('click', (event) => {
      if (event.target === modal || event.target.classList.contains('modal-close')) {
        this.closeModal(modal);
      } else if (event.target.getAttribute('data-action') === 'execute') {
        this.closeModal(modal);
        this.executeSequence(sequence.id);
      } else if (event.target.getAttribute('data-action') === 'copy') {
        this.copyToClipboard(sequence);
      }
    });
    
    // Keyboard handling
    modal.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.closeModal(modal);
      }
    });
    
    return modal;
  }

  /**
   * Render commands list for details modal
   */
  renderCommandsList(commands) {
    if (!Array.isArray(commands) || commands.length === 0) {
      return '<p class="no-commands">No commands</p>';
    }
    
    return commands.map((cmd, index) => {
      const command = typeof cmd === 'string' ? cmd : cmd.command;
      return `
        <div class="command-item-detail">
          <span class="command-index">${index + 1}.</span>
          <code class="command-code">${this.escapeHtml(command)}</code>
        </div>
      `;
    }).join('');
  }

  /**
   * Close modal
   */
  closeModal(modal) {
    modal.remove();
    
    // Return focus to queue
    if (this.selectedSequenceId) {
      const selectedItem = this.contentArea.querySelector(`[data-sequence-id="${this.selectedSequenceId}"]`);
      if (selectedItem) {
        selectedItem.focus();
      }
    }
  }

  /**
   * Copy sequence to clipboard
   */
  async copyToClipboard(sequence) {
    if (!sequence.commands || sequence.commands.length === 0) {
      return;
    }
    
    const commands = sequence.commands.map(cmd => 
      typeof cmd === 'string' ? cmd : cmd.command
    ).join('\n');
    
    try {
      await navigator.clipboard.writeText(commands);
      this.showToast('Commands copied to clipboard');
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      this.showToast('Failed to copy commands', 'error');
    }
  }

  /**
   * Show toast notification
   */
  showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // Animate in
    setTimeout(() => toast.classList.add('show'), 100);
    
    // Remove after delay
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  /**
   * Start auto-accept countdown
   */
  startAutoAcceptCountdown(sequenceId, duration = 15) {
    this.stopAutoAcceptCountdown(); // Clear any existing countdown
    
    const sequence = this.sequences.find(s => s.id === sequenceId);
    if (!sequence) return;
    
    let countdown = duration;
    sequence.autoAcceptCountdown = countdown;
    
    this.autoAcceptTimer = setInterval(() => {
      countdown--;
      sequence.autoAcceptCountdown = countdown;
      
      // Update UI
      const item = this.contentArea.querySelector(`[data-sequence-id="${sequenceId}"]`);
      if (item) {
        let timer = item.querySelector('.auto-accept-timer');
        if (!timer) {
          timer = document.createElement('div');
          timer.className = 'auto-accept-timer';
          item.appendChild(timer);
        }
        timer.textContent = countdown;
      }
      
      if (countdown <= 0) {
        this.stopAutoAcceptCountdown();
        this.executeSequence(sequenceId);
      }
    }, 1000);
  }

  /**
   * Stop auto-accept countdown
   */
  stopAutoAcceptCountdown() {
    if (this.autoAcceptTimer) {
      clearInterval(this.autoAcceptTimer);
      this.autoAcceptTimer = null;
    }
    
    // Remove countdown displays
    this.contentArea.querySelectorAll('.auto-accept-timer').forEach(timer => {
      timer.remove();
    });
    
    // Clear countdown from sequences
    this.sequences.forEach(seq => {
      delete seq.autoAcceptCountdown;
    });
  }

  /**
   * Render empty state
   */
  renderEmptyState() {
    this.contentArea.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🤖</div>
        <h3>No Commands Available</h3>
        <p>Enter a request to generate AI-powered command sequences</p>
      </div>
    `;
  }

  /**
   * Update queue statistics
   */
  updateQueueStats() {
    const header = this.container.querySelector('.queue-header');
    if (!header) return;
    
    let statsElement = header.querySelector('.queue-stats');
    if (!statsElement) {
      statsElement = document.createElement('div');
      statsElement.className = 'queue-stats';
      header.appendChild(statsElement);
    }
    
    const stats = {
      total: this.sequences.length,
      pending: this.sequences.filter(s => s.status === 'pending').length,
      completed: this.sequences.filter(s => s.status === 'completed').length,
      failed: this.sequences.filter(s => s.status === 'failed').length
    };
    
    statsElement.textContent = `${stats.total} sequences (${stats.pending} pending)`;
  }

  /**
   * Clear all sequences
   */
  clear() {
    this.stopAutoAcceptCountdown();
    this.sequences = [];
    this.selectedSequenceId = null;
    this.renderSequences();
    this.updateQueueStats();
  }

  /**
   * Refresh queue display
   */
  refresh() {
    this.renderSequences();
    this.updateQueueStats();
  }

  /**
   * Utility functions
   */
  generateSequenceId() {
    return `seq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      totalSequences: this.sequences.length,
      selectedSequence: this.selectedSequenceId,
      isProcessing: this.isProcessing,
      hasAutoAccept: !!this.autoAcceptTimer,
      statusCounts: this.sequences.reduce((counts, seq) => {
        counts[seq.status] = (counts[seq.status] || 0) + 1;
        return counts;
      }, {})
    };
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.stopAutoAcceptCountdown();
    this.sequences = [];
    this.selectedSequenceId = null;
    this.executeCallback = null;
    
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

// Export for both CommonJS and ES6 modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CommandQueue;
} else if (typeof window !== 'undefined') {
  window.CommandQueue = CommandQueue;
}