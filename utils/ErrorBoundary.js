/**
 * Error Boundary and Error Handling Utilities
 * 
 * Provides comprehensive error handling, reporting, and recovery mechanisms
 * for the AI Terminal application.
 */

class ErrorBoundary {
  constructor() {
    this.errors = [];
    this.maxErrors = 100;
    this.errorHandlers = new Map();
    this.recoveryStrategies = new Map();
    this.isRecovering = false;
    
    this.setupGlobalErrorHandlers();
    this.setupRecoveryStrategies();
  }

  setupGlobalErrorHandlers() {
    // Unhandled promise rejections
    if (typeof window !== 'undefined') {
      window.addEventListener('unhandledrejection', (event) => {
        this.handleError(event.reason, {
          type: 'unhandledRejection',
          promise: event.promise
        });
      });

      // Global error handler
      window.addEventListener('error', (event) => {
        this.handleError(event.error, {
          type: 'globalError',
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno
        });
      });
    } else {
      // Node.js environment
      process.on('uncaughtException', (error) => {
        this.handleError(error, {
          type: 'uncaughtException'
        });
      });

      process.on('unhandledRejection', (reason, promise) => {
        this.handleError(reason, {
          type: 'unhandledRejection',
          promise
        });
      });
    }
  }

  setupRecoveryStrategies() {
    this.recoveryStrategies.set('CommandExecutionError', async (error, context) => {
      console.log('Attempting command execution recovery...');
      return { recovered: true, fallback: 'direct execution' };
    });

    this.recoveryStrategies.set('AIServiceError', async (error, context) => {
      console.log('Attempting AI service recovery...');
      return { recovered: true, fallback: 'cached response' };
    });
  }

  handleError(error, context = {}) {
    const errorInfo = {
      message: error.message || String(error),
      stack: error.stack,
      timestamp: new Date().toISOString(),
      context,
      severity: this.determineSeverity(error, context)
    };

    this.errors.push(errorInfo);
    
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }

    // Emit error event
    this.emit('error', errorInfo);

    // Attempt recovery
    this.attemptRecovery(error, context);

    return errorInfo;
  }

  determineSeverity(error, context) {
    if (context.type === 'uncaughtException') return 'critical';
    if (error.name === 'SecurityError') return 'high';
    if (error.name === 'ValidationError') return 'medium';
    return 'low';
  }

  async attemptRecovery(error, context) {
    if (this.isRecovering) return;

    const strategy = this.recoveryStrategies.get(error.name);
    if (strategy) {
      this.isRecovering = true;
      try {
        await strategy(error, context);
      } catch (recoveryError) {
        console.error('Recovery failed:', recoveryError);
      } finally {
        this.isRecovering = false;
      }
    }
  }

  wrapMethod(obj, methodName, context = {}) {
    const originalMethod = obj[methodName];
    
    obj[methodName] = async (...args) => {
      try {
        return await originalMethod.apply(obj, args);
      } catch (error) {
        this.handleError(error, { ...context, method: methodName });
        throw error;
      }
    };
  }

  emit(event, data) {
    const handlers = this.errorHandlers.get(event) || [];
    handlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error('Error handler failed:', error);
      }
    });
  }

  onError(handler) {
    if (!this.errorHandlers.has('error')) {
      this.errorHandlers.set('error', []);
    }
    this.errorHandlers.get('error').push(handler);
  }

  getRecentErrors(limit = 10) {
    return this.errors.slice(-limit);
  }

  clearErrors() {
    this.errors = [];
  }
}

class MemoryManager {
  constructor() {
    this.threshold = 200 * 1024 * 1024; // 200MB
    this.cleanupCallbacks = [];
    this.isMonitoring = false;
  }

  startMonitoring() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    this.monitorInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, 30000); // Check every 30 seconds
  }

  stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.isMonitoring = false;
    }
  }

  checkMemoryUsage() {
    const usage = process.memoryUsage();
    
    if (usage.heapUsed > this.threshold) {
      console.warn(`Memory usage high: ${Math.round(usage.heapUsed / 1024 / 1024)}MB`);
      this.triggerCleanup();
    }
  }

  triggerCleanup() {
    this.cleanupCallbacks.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('Cleanup callback failed:', error);
      }
    });

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }

  registerCleanup(callback) {
    this.cleanupCallbacks.push(callback);
  }

  setThreshold(threshold) {
    this.threshold = threshold;
  }

  getMemoryStats() {
    const usage = process.memoryUsage();
    return {
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
      external: Math.round(usage.external / 1024 / 1024),
      rss: Math.round(usage.rss / 1024 / 1024),
      threshold: Math.round(this.threshold / 1024 / 1024)
    };
  }
}

module.exports = { ErrorBoundary, MemoryManager };
        });
      });
    }
  }

  setupRecoveryStrategies() {
    // AI Service recovery
    this.recoveryStrategies.set('AIService', {
      maxRetries: 3,
      backoffDelay: 1000,
      strategy: async (error, context) => {
        console.log('Attempting AI service recovery...');
        
        // Try to reinitialize AI service
        if (context.aiService) {
          try {
            await context.aiService.clearContext();
            return { recovered: true, message: 'AI service context cleared' };
          } catch (recoveryError) {
            return { recovered: false, error: recoveryError };
          }
        }
        
        return { recovered: false, error: 'No AI service context available' };
      }
    });

    // Command Executor recovery
    this.recoveryStrategies.set('CommandExecutor', {
      maxRetries: 2,
      backoffDelay: 500,
      strategy: async (error, context) => {
        console.log('Attempting command executor recovery...');
        
        if (context.commandExecutor) {
          try {
            // Kill any running processes
            context.commandExecutor.killCurrentProcess();
            
            // Reset execution state
            context.commandExecutor.isExecuting = false;
            
            return { recovered: true, message: 'Command executor reset' };
          } catch (recoveryError) {
            return { recovered: false, error: recoveryError };
          }
        }
        
        return { recovered: false, error: 'No command executor context available' };
      }
    });

    // Memory recovery
    this.recoveryStrategies.set('Memory', {
      maxRetries: 1,
      backoffDelay: 0,
      strategy: async (error, context) => {
        console.log('Attempting memory recovery...');
        
        try {
          // Clear command history if too large
          if (global.sessionContext) {
            const history = global.sessionContext.get('commandHistory', []);
            if (history.length > 500) {
              global.sessionContext.set('commandHistory', history.slice(-100));
            }
          }
          
          // Force garbage collection if available
          if (typeof global !== 'undefined' && global.gc) {
            global.gc();
          }
          
          return { recovered: true, message: 'Memory cleanup completed' };
        } catch (recoveryError) {
          return { recovered: false, error: recoveryError };
        }
      }
    });
  }

  /**
   * Handle an error with context and recovery attempts
   */
  async handleError(error, context = {}) {
    const errorInfo = this.createErrorInfo(error, context);
    
    // Add to error log
    this.addError(errorInfo);
    
    // Log error
    console.error('Error handled by ErrorBoundary:', errorInfo);
    
    // Attempt recovery if not already recovering
    if (!this.isRecovering) {
      await this.attemptRecovery(errorInfo, context);
    }
    
    // Notify error handlers
    this.notifyErrorHandlers(errorInfo);
    
    return errorInfo;
  }

  createErrorInfo(error, context) {
    return {
      id: this.generateErrorId(),
      timestamp: new Date().toISOString(),
      message: error?.message || String(error),
      stack: error?.stack,
      name: error?.name,
      type: context.type || 'unknown',
      context: {
        ...context,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Node.js',
        url: typeof window !== 'undefined' ? window.location.href : 'N/A',
        memoryUsage: this.getMemoryUsage()
      },
      severity: this.determineSeverity(error, context),
      recoverable: this.isRecoverable(error, context)
    };
  }

  addError(errorInfo) {
    this.errors.push(errorInfo);
    
    // Maintain max errors limit
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }
  }

  async attemptRecovery(errorInfo, context) {
    if (!errorInfo.recoverable) {
      return { recovered: false, reason: 'Error marked as non-recoverable' };
    }

    this.isRecovering = true;
    
    try {
      // Determine recovery strategy based on error context
      const strategyName = this.determineRecoveryStrategy(errorInfo);
      const strategy = this.recoveryStrategies.get(strategyName);
      
      if (!strategy) {
        return { recovered: false, reason: 'No recovery strategy available' };
      }

      // Attempt recovery with retries
      let attempts = 0;
      while (attempts < strategy.maxRetries) {
        try {
          const result = await strategy.strategy(errorInfo, context);
          
          if (result.recovered) {
            console.log(`Recovery successful for ${strategyName}:`, result.message);
            return result;
          }
          
          attempts++;
          if (attempts < strategy.maxRetries) {
            await this.delay(strategy.backoffDelay * attempts);
          }
        } catch (recoveryError) {
          console.error(`Recovery attempt ${attempts + 1} failed:`, recoveryError);
          attempts++;
        }
      }
      
      return { recovered: false, reason: 'All recovery attempts failed' };
    } finally {
      this.isRecovering = false;
    }
  }

  determineRecoveryStrategy(errorInfo) {
    const { message, stack, context } = errorInfo;
    
    // AI service errors
    if (message.includes('AI') || message.includes('API') || context.type === 'aiService') {
      return 'AIService';
    }
    
    // Command execution errors
    if (message.includes('command') || message.includes('execution') || context.type === 'commandExecutor') {
      return 'CommandExecutor';
    }
    
    // Memory errors
    if (message.includes('memory') || message.includes('heap') || context.type === 'memory') {
      return 'Memory';
    }
    
    return 'Generic';
  }

  determineSeverity(error, context) {
    const message = error?.message?.toLowerCase() || '';
    
    // Critical errors
    if (message.includes('security') || 
        message.includes('unauthorized') ||
        context.type === 'security') {
      return 'critical';
    }
    
    // High severity
    if (message.includes('crash') ||
        message.includes('fatal') ||
        context.type === 'uncaughtException') {
      return 'high';
    }
    
    // Medium severity
    if (message.includes('timeout') ||
        message.includes('network') ||
        context.type === 'unhandledRejection') {
      return 'medium';
    }
    
    return 'low';
  }

  isRecoverable(error, context) {
    const message = error?.message?.toLowerCase() || '';
    
    // Non-recoverable errors
    if (message.includes('security') ||
        message.includes('permission denied') ||
        context.type === 'security') {
      return false;
    }
    
    return true;
  }

  /**
   * Register an error handler
   */
  onError(handler) {
    const id = this.generateErrorId();
    this.errorHandlers.set(id, handler);
    return id;
  }

  /**
   * Unregister an error handler
   */
  offError(handlerId) {
    return this.errorHandlers.delete(handlerId);
  }

  notifyErrorHandlers(errorInfo) {
    for (const handler of this.errorHandlers.values()) {
      try {
        handler(errorInfo);
      } catch (handlerError) {
        console.error('Error in error handler:', handlerError);
      }
    }
  }

  /**
   * Wrap a function with error boundary
   */
  wrap(fn, context = {}) {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        await this.handleError(error, { ...context, function: fn.name });
        throw error; // Re-throw after handling
      }
    };
  }

  /**
   * Wrap a class method with error boundary
   */
  wrapMethod(obj, methodName, context = {}) {
    const originalMethod = obj[methodName];
    
    obj[methodName] = this.wrap(originalMethod.bind(obj), {
      ...context,
      class: obj.constructor.name,
      method: methodName
    });
  }

  /**
   * Create a safe version of a function that won't throw
   */
  safe(fn, defaultValue = null) {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        await this.handleError(error, { function: fn.name, safe: true });
        return defaultValue;
      }
    };
  }

  getMemoryUsage() {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage();
    }
    
    if (typeof performance !== 'undefined' && performance.memory) {
      return {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit
      };
    }
    
    return null;
  }

  generateErrorId() {
    return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get error statistics
   */
  getStats() {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const recentErrors = this.errors.filter(e => 
      now - new Date(e.timestamp).getTime() < oneHour
    );

    return {
      totalErrors: this.errors.length,
      recentErrors: recentErrors.length,
      errorsByType: this.groupBy(this.errors, 'type'),
      errorsBySeverity: this.groupBy(this.errors, 'severity'),
      recoveryStrategies: this.recoveryStrategies.size,
      errorHandlers: this.errorHandlers.size,
      isRecovering: this.isRecovering
    };
  }

  groupBy(array, key) {
    return array.reduce((groups, item) => {
      const group = item[key] || 'unknown';
      groups[group] = (groups[group] || 0) + 1;
      return groups;
    }, {});
  }

  /**
   * Clear error history
   */
  clearErrors() {
    this.errors = [];
  }

  /**
   * Export errors for analysis
   */
  exportErrors(format = 'json') {
    switch (format) {
      case 'csv':
        return this.errorsToCSV();
      case 'json':
      default:
        return JSON.stringify(this.errors, null, 2);
    }
  }

  errorsToCSV() {
    if (this.errors.length === 0) return '';
    
    const headers = ['timestamp', 'type', 'severity', 'message', 'recoverable'];
    const rows = this.errors.map(error => [
      error.timestamp,
      error.type,
      error.severity,
      error.message.replace(/"/g, '""'), // Escape quotes
      error.recoverable
    ]);
    
    return [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
  }
}

// Memory Manager for proactive memory management
class MemoryManager {
  constructor() {
    this.memoryThreshold = 100 * 1024 * 1024; // 100MB
    this.checkInterval = 30000; // 30 seconds
    this.cleanupCallbacks = new Set();
    this.isMonitoring = false;
  }

  startMonitoring() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    this.monitoringInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, this.checkInterval);
  }

  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
  }

  checkMemoryUsage() {
    const usage = this.getMemoryUsage();
    
    if (usage && usage.used > this.memoryThreshold) {
      console.warn('Memory threshold exceeded, triggering cleanup');
      this.triggerCleanup();
    }
  }

  getMemoryUsage() {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      return {
        used: usage.heapUsed,
        total: usage.heapTotal,
        external: usage.external
      };
    }
    
    if (typeof performance !== 'undefined' && performance.memory) {
      return {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit
      };
    }
    
    return null;
  }

  triggerCleanup() {
    // Call all registered cleanup callbacks
    for (const callback of this.cleanupCallbacks) {
      try {
        callback();
      } catch (error) {
        console.error('Error in cleanup callback:', error);
      }
    }
    
    // Force garbage collection if available
    if (typeof global !== 'undefined' && global.gc) {
      global.gc();
    }
  }

  registerCleanup(callback) {
    this.cleanupCallbacks.add(callback);
    return () => this.cleanupCallbacks.delete(callback);
  }

  setThreshold(bytes) {
    this.memoryThreshold = bytes;
  }

  setCheckInterval(ms) {
    this.checkInterval = ms;
    
    if (this.isMonitoring) {
      this.stopMonitoring();
      this.startMonitoring();
    }
  }
}

// Export for both CommonJS and ES6 modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ErrorBoundary, MemoryManager };
} else if (typeof window !== 'undefined') {
  window.ErrorBoundary = ErrorBoundary;
  window.MemoryManager = MemoryManager;
}