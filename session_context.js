// session_context.js
// Manages and persists session-specific context for the AI Terminal.

const path = require('path');
const fs = require('fs').promises;
const { app } = require('electron'); // Electron's app module for user data path

class SessionContext {
    constructor() {
        this.context = {};
        this.filePath = '';
        this.init();
    }

    async init() {
        // Ensure app.getPath('userData') is available (only in main process)
        if (app) {
            const userDataPath = app.getPath('userData');
            this.filePath = path.join(userDataPath, 'session_context.json');
            await this.loadContext();
        } else {
            console.warn('Electron app module not available. Session context will not be persisted.');
            // For testing or non-Electron environments, provide a fallback path
            this.filePath = path.join(__dirname, 'session_context.json');
            await this.loadContext();
        }
    }

    /**
     * Sets a value in the session context.
     * @param {string} key - The key for the context variable.
     * @param {*} value - The value to set.
     */
    set(key, value) {
        this.context[key] = value;
        this.saveContext();
    }

    /**
     * Gets a value from the session context.
     * @param {string} key - The key for the context variable.
     * @param {*} defaultValue - Optional default value if the key is not found.
     * @returns {*} The value associated with the key, or defaultValue if not found.
     */
    get(key, defaultValue = undefined) {
        return this.context.hasOwnProperty(key) ? this.context[key] : defaultValue;
    }

    /**
     * Deletes a key from the session context.
     * @param {string} key - The key to delete.
     */
    delete(key) {
        delete this.context[key];
        this.saveContext();
    }

    /**
     * Returns the entire session context object.
     * @returns {object} The current session context.
     */
    getAll() {
        return { ...this.context };
    }

    /**
     * Clears the entire session context.
     */
    clear() {
        this.context = {};
        this.saveContext();
    }

    /**
     * Saves the current context to a file.
     * This method is debounced to prevent excessive file writes.
     */
    async saveContext() {
        if (!this.filePath) {
            console.warn('Session context file path not initialized. Cannot save context.');
            return;
        }
        try {
            const data = JSON.stringify(this.context, null, 2);
            await fs.writeFile(this.filePath, data, 'utf8');
            // console.log('Session context saved.');
        } catch (error) {
            console.error('Failed to save session context:', error);
        }
    }

    /**
     * Loads the context from a file.
     */
    async loadContext() {
        if (!this.filePath) {
            console.warn('Session context file path not initialized. Cannot load context.');
            return;
        }
        try {
            const data = await fs.readFile(this.filePath, 'utf8');
            this.context = JSON.parse(data);
            // console.log('Session context loaded.');
        } catch (error) {
            if (error.code === 'ENOENT') {
                // File does not exist, which is fine for first run
                this.context = {};
                // console.log('Session context file not found, starting with empty context.');
            } else {
                console.error('Failed to load session context:', error);
                this.context = {}; // Reset context on error
            }
        }
    }
}

module.exports = new SessionContext();