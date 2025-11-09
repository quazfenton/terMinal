/**
 * State Manager
 * Centralized state management with reactive updates
 */

class StateManager {
  constructor() {
    this.state = {};
    this.listeners = new Map();
    this.middleware = [];
  }

  getState() {
    return { ...this.state };
  }

  setState(updates) {
    const prevState = { ...this.state };
    
    // Apply middleware
    let processedUpdates = updates;
    for (const middleware of this.middleware) {
      processedUpdates = middleware(processedUpdates, prevState);
    }

    // Update state
    this.state = { ...this.state, ...processedUpdates };
    
    // Notify listeners
    this.notifyListeners(prevState, this.state, processedUpdates);
  }

  subscribe(key, listener) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key).add(listener);
    
    return () => {
      const keyListeners = this.listeners.get(key);
      if (keyListeners) {
        keyListeners.delete(listener);
      }
    };
  }

  notifyListeners(prevState, newState, updates) {
    for (const [key, listeners] of this.listeners) {
      if (key in updates) {
        for (const listener of listeners) {
          listener(newState[key], prevState[key], newState);
        }
      }
    }
  }

  addMiddleware(middleware) {
    this.middleware.push(middleware);
  }

  get(key, defaultValue = null) {
    return this.state[key] ?? defaultValue;
  }

  set(key, value) {
    this.setState({ [key]: value });
  }
}

module.exports = StateManager;
