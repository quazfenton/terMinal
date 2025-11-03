/**
 * Configuration Manager
 * 
 * Centralized configuration management with validation, environment support,
 * and hot reloading capabilities for the AI Terminal application.
 */

const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');

class ConfigManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.configDir = options.configDir || path.join(__dirname, '..');
    this.configFile = options.configFile || 'config.json';
    this.schemaFile = options.schemaFile || 'config.schema.json';
    this.environment = options.environment || process.env.NODE_ENV || 'development';
    
    this.config = {};
    this.schema = {};
    this.watchers = new Map();
    this.validators = new Map();
    this.transformers = new Map();
    
    this.isLoaded = false;
    this.isWatching = false;
    this.saveTimeout = null;
    
    this.setupDefaultValidators();
    this.setupDefaultTransformers();
  }

  /**
   * Initialize configuration manager
   */
  async initialize() {
    try {
      await this.loadSchema();
      await this.loadConfig();
      this.isLoaded = true;
      this.emit('initialized');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Load configuration schema
   */
  async loadSchema() {
    try {
      const schemaPath = path.join(this.configDir, this.schemaFile);
      const schemaContent = await fs.readFile(schemaPath, 'utf8');
      this.schema = JSON.parse(schemaContent);
    } catch (error) {
      console.warn('Schema file not found, using default schema');
      this.schema = this.getDefaultSchema();
    }
  }

  /**
   * Load configuration from file
   */
  async loadConfig() {
    const configPath = this.getConfigPath();
    
    try {
      const configContent = await fs.readFile(configPath, 'utf8');
      const rawConfig = JSON.parse(configContent);
      
      // Validate and transform configuration
      this.config = await this.processConfig(rawConfig);
      
      this.emit('loaded', this.config);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.warn('Configuration file not found, creating default configuration');
        this.config = this.getDefaultConfig();
        await this.saveConfig();
      } else {
        throw new Error(`Failed to load configuration: ${error.message}`);
      }
    }
  }

  /**
   * Save configuration to file
   */
  async saveConfig() {
    const configPath = this.getConfigPath();
    
    try {
      // Ensure config directory exists
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      
      // Save with pretty formatting
      const configContent = JSON.stringify(this.config, null, 2);
      await fs.writeFile(configPath, configContent, 'utf8');
      
      this.emit('saved', this.config);
    } catch (error) {
      this.emit('error', error);
      throw new Error(`Failed to save configuration: ${error.message}`);
    }
  }

  /**
   * Process raw configuration through validation and transformation
   */
  async processConfig(rawConfig) {
    // Apply environment-specific overrides
    const envConfig = this.applyEnvironmentOverrides(rawConfig);
    
    // Validate configuration
    const validationResult = this.validateConfig(envConfig);
    if (!validationResult.valid) {
      throw new Error(`Configuration validation failed: ${validationResult.errors.join(', ')}`);
    }
    
    // Transform configuration values
    const transformedConfig = await this.transformConfig(envConfig);
    
    // Apply defaults for missing values
    const finalConfig = this.applyDefaults(transformedConfig);
    
    return finalConfig;
  }

  /**
   * Get configuration value by path
   */
  get(keyPath, defaultValue = undefined) {
    if (!this.isLoaded) {
      throw new Error('Configuration not loaded. Call initialize() first.');
    }
    
    const keys = keyPath.split('.');
    let value = this.config;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return defaultValue;
      }
    }
    
    return value;
  }

  /**
   * Set configuration value by path
   */
  async set(keyPath, value, options = {}) {
    if (!this.isLoaded) {
      throw new Error('Configuration not loaded. Call initialize() first.');
    }
    
    const keys = keyPath.split('.');
    const lastKey = keys.pop();
    
    // Navigate to parent object
    let target = this.config;
    for (const key of keys) {
      if (!target[key] || typeof target[key] !== 'object') {
        target[key] = {};
      }
      target = target[key];
    }
    
    // Store old value for change detection
    const oldValue = target[lastKey];
    
    // Validate new value if validator exists
    const validator = this.validators.get(keyPath);
    if (validator) {
      const validationResult = validator(value, this.config);
      if (!validationResult.valid) {
        throw new Error(`Validation failed for ${keyPath}: ${validationResult.error}`);
      }
    }
    
    // Transform value if transformer exists
    const transformer = this.transformers.get(keyPath);
    if (transformer) {
      value = await transformer(value, this.config);
    }
    
    // Set new value
    target[lastKey] = value;
    
    // Emit change event
    this.emit('changed', {
      path: keyPath,
      oldValue,
      newValue: value,
      config: this.config
    });
    
    // Notify watchers
    this.notifyWatchers(keyPath, value, oldValue);
    
    // Auto-save if enabled
    if (options.autoSave !== false) {
      this.debouncedSave();
    }
  }

  /**
   * Watch for changes to a configuration path
   */
  watch(keyPath, callback) {
    if (!this.watchers.has(keyPath)) {
      this.watchers.set(keyPath, new Set());
    }
    
    this.watchers.get(keyPath).add(callback);
    
    // Return unwatch function
    return () => {
      const pathWatchers = this.watchers.get(keyPath);
      if (pathWatchers) {
        pathWatchers.delete(callback);
        if (pathWatchers.size === 0) {
          this.watchers.delete(keyPath);
        }
      }
    };
  }

  /**
   * Register a validator for a configuration path
   */
  addValidator(keyPath, validator) {
    this.validators.set(keyPath, validator);
  }

  /**
   * Register a transformer for a configuration path
   */
  addTransformer(keyPath, transformer) {
    this.transformers.set(keyPath, transformer);
  }

  /**
   * Start watching configuration file for changes
   */
  async startWatching() {
    if (this.isWatching) return;
    
    const configPath = this.getConfigPath();
    
    try {
      const { watch } = require('chokidar');
      this.fileWatcher = watch(configPath, {
        ignoreInitial: true,
        persistent: true
      });
      
      this.fileWatcher.on('change', async () => {
        try {
          await this.loadConfig();
          this.emit('reloaded', this.config);
        } catch (error) {
          this.emit('error', error);
        }
      });
      
      this.isWatching = true;
      this.emit('watching-started');
    } catch (error) {
      console.warn('File watching not available:', error.message);
    }
  }

  /**
   * Stop watching configuration file
   */
  stopWatching() {
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }
    
    this.isWatching = false;
    this.emit('watching-stopped');
  }

  /**
   * Reload configuration from file
   */
  async reload() {
    await this.loadConfig();
    this.emit('reloaded', this.config);
  }

  /**
   * Reset configuration to defaults
   */
  async reset() {
    this.config = this.getDefaultConfig();
    await this.saveConfig();
    this.emit('reset', this.config);
  }

  /**
   * Export configuration
   */
  export(format = 'json') {
    switch (format.toLowerCase()) {
      case 'json':
        return JSON.stringify(this.config, null, 2);
      
      case 'yaml':
        try {
          const yaml = require('yaml');
          return yaml.stringify(this.config);
        } catch (error) {
          throw new Error('YAML export requires yaml package');
        }
      
      case 'env':
        return this.configToEnvFormat(this.config);
      
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Import configuration
   */
  async import(data, format = 'json') {
    let importedConfig;
    
    switch (format.toLowerCase()) {
      case 'json':
        importedConfig = typeof data === 'string' ? JSON.parse(data) : data;
        break;
      
      case 'yaml':
        try {
          const yaml = require('yaml');
          importedConfig = yaml.parse(data);
        } catch (error) {
          throw new Error('YAML import requires yaml package');
        }
        break;
      
      default:
        throw new Error(`Unsupported import format: ${format}`);
    }
    
    // Validate imported configuration
    const validationResult = this.validateConfig(importedConfig);
    if (!validationResult.valid) {
      throw new Error(`Imported configuration is invalid: ${validationResult.errors.join(', ')}`);
    }
    
    // Merge with existing configuration
    this.config = this.mergeConfigs(this.config, importedConfig);
    
    await this.saveConfig();
    this.emit('imported', this.config);
  }

  // Private methods

  getConfigPath() {
    const envSuffix = this.environment !== 'development' ? `.${this.environment}` : '';
    const configName = this.configFile.replace('.json', `${envSuffix}.json`);
    return path.join(this.configDir, configName);
  }

  applyEnvironmentOverrides(config) {
    const envOverrides = {};
    
    // Look for environment variables with CONFIG_ prefix
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith('CONFIG_')) {
        const configKey = key.substring(7).toLowerCase().replace(/_/g, '.');
        this.setNestedValue(envOverrides, configKey, this.parseEnvValue(value));
      }
    }
    
    return this.mergeConfigs(config, envOverrides);
  }

  validateConfig(config) {
    const errors = [];
    
    // Validate against schema if available
    if (this.schema && this.schema.properties) {
      this.validateAgainstSchema(config, this.schema, '', errors);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  validateAgainstSchema(value, schema, path, errors) {
    if (schema.type) {
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== schema.type) {
        errors.push(`${path}: expected ${schema.type}, got ${actualType}`);
        return;
      }
    }
    
    if (schema.properties && typeof value === 'object') {
      for (const [key, subSchema] of Object.entries(schema.properties)) {
        const subPath = path ? `${path}.${key}` : key;
        if (value.hasOwnProperty(key)) {
          this.validateAgainstSchema(value[key], subSchema, subPath, errors);
        } else if (subSchema.required) {
          errors.push(`${subPath}: required property missing`);
        }
      }
    }
    
    if (schema.minimum !== undefined && typeof value === 'number' && value < schema.minimum) {
      errors.push(`${path}: value ${value} is below minimum ${schema.minimum}`);
    }
    
    if (schema.maximum !== undefined && typeof value === 'number' && value > schema.maximum) {
      errors.push(`${path}: value ${value} is above maximum ${schema.maximum}`);
    }
  }

  async transformConfig(config) {
    const transformed = JSON.parse(JSON.stringify(config)); // Deep clone
    
    for (const [keyPath, transformer] of this.transformers.entries()) {
      const value = this.getNestedValue(transformed, keyPath);
      if (value !== undefined) {
        const transformedValue = await transformer(value, transformed);
        this.setNestedValue(transformed, keyPath, transformedValue);
      }
    }
    
    return transformed;
  }

  applyDefaults(config) {
    const defaults = this.getDefaultConfig();
    return this.mergeConfigs(defaults, config);
  }

  notifyWatchers(keyPath, newValue, oldValue) {
    // Notify exact path watchers
    const exactWatchers = this.watchers.get(keyPath);
    if (exactWatchers) {
      for (const callback of exactWatchers) {
        try {
          callback(newValue, oldValue, keyPath);
        } catch (error) {
          console.error('Error in config watcher:', error);
        }
      }
    }
    
    // Notify parent path watchers
    const pathParts = keyPath.split('.');
    for (let i = pathParts.length - 1; i > 0; i--) {
      const parentPath = pathParts.slice(0, i).join('.');
      const parentWatchers = this.watchers.get(parentPath);
      if (parentWatchers) {
        const parentValue = this.get(parentPath);
        for (const callback of parentWatchers) {
          try {
            callback(parentValue, undefined, parentPath);
          } catch (error) {
            console.error('Error in config watcher:', error);
          }
        }
      }
    }
  }

  debouncedSave() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    
    this.saveTimeout = setTimeout(async () => {
      try {
        await this.saveConfig();
      } catch (error) {
        this.emit('error', error);
      }
    }, 1000);
  }

  setupDefaultValidators() {
    // AI configuration validators
    this.addValidator('ai.maxTokens', (value) => ({
      valid: typeof value === 'number' && value > 0 && value <= 4000,
      error: 'maxTokens must be a number between 1 and 4000'
    }));
    
    this.addValidator('ai.temperature', (value) => ({
      valid: typeof value === 'number' && value >= 0 && value <= 2,
      error: 'temperature must be a number between 0 and 2'
    }));
    
    // Security configuration validators
    this.addValidator('security.maxCommandLength', (value) => ({
      valid: typeof value === 'number' && value > 0,
      error: 'maxCommandLength must be a positive number'
    }));
    
    // Performance configuration validators
    this.addValidator('performance.maxHistoryLength', (value) => ({
      valid: typeof value === 'number' && value > 0 && value <= 10000,
      error: 'maxHistoryLength must be a number between 1 and 10000'
    }));
  }

  setupDefaultTransformers() {
    // Transform string numbers to actual numbers
    this.addTransformer('ai.maxTokens', (value) => 
      typeof value === 'string' ? parseInt(value, 10) : value
    );
    
    this.addTransformer('ai.temperature', (value) => 
      typeof value === 'string' ? parseFloat(value) : value
    );
  }

  getDefaultSchema() {
    return {
      type: 'object',
      properties: {
        ai: {
          type: 'object',
          properties: {
            provider: { type: 'string' },
            maxTokens: { type: 'number', minimum: 1, maximum: 4000 },
            temperature: { type: 'number', minimum: 0, maximum: 2 }
          }
        },
        security: {
          type: 'object',
          properties: {
            enableValidation: { type: 'boolean' },
            maxCommandLength: { type: 'number', minimum: 1 }
          }
        },
        performance: {
          type: 'object',
          properties: {
            maxHistoryLength: { type: 'number', minimum: 1, maximum: 10000 },
            cacheSize: { type: 'number', minimum: 1 }
          }
        }
      }
    };
  }

  getDefaultConfig() {
    return {
      ai: {
        provider: 'claude',
        maxTokens: 1024,
        temperature: 0.7,
        models: {
          claude: 'claude-3-sonnet-20240229',
          openai: 'gpt-4',
          gemini: 'gemini-1.5-flash'
        }
      },
      security: {
        enableValidation: true,
        strictMode: false,
        maxCommandLength: 1000,
        allowHidden: false,
        encryptSessionData: true
      },
      performance: {
        maxHistoryLength: 100,
        cacheSize: 100,
        memoryThreshold: 104857600, // 100MB
        checkInterval: 30000 // 30 seconds
      },
      ui: {
        theme: 'default',
        autoAcceptTimeout: 15,
        maxTerminalLines: 1000,
        enableSyntaxHighlighting: true
      },
      logging: {
        level: 'info',
        enableFileLogging: true,
        maxLogSize: 10485760, // 10MB
        maxLogFiles: 5
      }
    };
  }

  mergeConfigs(target, source) {
    const result = JSON.parse(JSON.stringify(target)); // Deep clone
    
    for (const [key, value] of Object.entries(source)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.mergeConfigs(result[key] || {}, value);
      } else {
        result[key] = value;
      }
    }
    
    return result;
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => 
      current && current[key] !== undefined ? current[key] : undefined, obj
    );
  }

  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    
    let current = obj;
    for (const key of keys) {
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }
    
    current[lastKey] = value;
  }

  parseEnvValue(value) {
    // Try to parse as JSON first
    try {
      return JSON.parse(value);
    } catch {
      // If not JSON, return as string
      return value;
    }
  }

  configToEnvFormat(config, prefix = 'CONFIG') {
    const lines = [];
    
    const flatten = (obj, currentPrefix) => {
      for (const [key, value] of Object.entries(obj)) {
        const envKey = `${currentPrefix}_${key.toUpperCase()}`;
        
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          flatten(value, envKey);
        } else {
          const envValue = typeof value === 'string' ? value : JSON.stringify(value);
          lines.push(`${envKey}=${envValue}`);
        }
      }
    };
    
    flatten(config, prefix);
    return lines.join('\n');
  }

  /**
   * Get configuration statistics
   */
  getStats() {
    return {
      isLoaded: this.isLoaded,
      isWatching: this.isWatching,
      environment: this.environment,
      configPath: this.getConfigPath(),
      watcherCount: Array.from(this.watchers.values()).reduce((sum, set) => sum + set.size, 0),
      validatorCount: this.validators.size,
      transformerCount: this.transformers.size,
      configSize: JSON.stringify(this.config).length
    };
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.stopWatching();
    this.watchers.clear();
    this.validators.clear();
    this.transformers.clear();
    
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    
    this.removeAllListeners();
  }
}

module.exports = ConfigManager;