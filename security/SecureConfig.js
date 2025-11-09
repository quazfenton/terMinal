/**
 * Secure Configuration Manager
 * Handles encrypted storage and rotation of sensitive configuration
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class SecureConfig {
  constructor() {
    this.configPath = path.join(__dirname, '..', '.env');
    this.encryptionKey = process.env.ENCRYPTION_KEY || this.generateKey();
    this.config = new Map();
    this.sensitiveKeys = new Set(['CLAUDE_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY']);
  }

  generateKey() {
    return crypto.randomBytes(32).toString('hex');
  }

  encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  decrypt(encryptedText) {
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  async loadConfig() {
    try {
      const content = await fs.readFile(this.configPath, 'utf8');
      const lines = content.split('\n');
      
      for (const line of lines) {
        if (line.trim() && !line.startsWith('#')) {
          const [key, value] = line.split('=');
          if (key && value) {
            this.config.set(key.trim(), value.trim());
          }
        }
      }
    } catch (error) {
      console.warn('Config file not found, using environment variables');
    }
  }

  get(key, defaultValue = null) {
    const value = this.config.get(key) || process.env[key] || defaultValue;
    
    // Decrypt sensitive values
    if (this.sensitiveKeys.has(key) && value && value.includes(':')) {
      try {
        return this.decrypt(value);
      } catch (error) {
        return value; // Return as-is if decryption fails
      }
    }
    
    return value;
  }

  async rotateApiKey(provider) {
    const keyName = `${provider.toUpperCase()}_API_KEY`;
    const newKey = await this.requestNewApiKey(provider);
    
    if (newKey) {
      const encrypted = this.encrypt(newKey);
      this.config.set(keyName, encrypted);
      await this.saveConfig();
      return true;
    }
    
    return false;
  }

  async requestNewApiKey(provider) {
    // Placeholder for API key rotation logic
    // In production, this would integrate with provider APIs
    console.log(`API key rotation requested for ${provider}`);
    return null;
  }

  async saveConfig() {
    const lines = ['# AI Terminal Configuration (Auto-generated)'];
    
    for (const [key, value] of this.config) {
      lines.push(`${key}=${value}`);
    }
    
    await fs.writeFile(this.configPath, lines.join('\n'));
  }

  validateApiKey(key) {
    return key && key.length > 10 && !key.includes('your_') && !key.includes('_here');
  }

  getSecurityConfig() {
    return {
      sandboxMode: this.get('SANDBOX_MODE', 'true') === 'true',
      allowSudo: this.get('ALLOW_SUDO', 'false') === 'true',
      allowNetworkCommands: this.get('ALLOW_NETWORK_COMMANDS', 'false') === 'true',
      allowFileSystemWrite: this.get('ALLOW_FILE_SYSTEM_WRITE', 'true') === 'true',
      restrictedPaths: this.get('RESTRICTED_PATHS', '/etc,/sys,/proc').split(','),
      maxCommandLength: parseInt(this.get('MAX_COMMAND_LENGTH', '1000')),
      commandTimeout: parseInt(this.get('COMMAND_TIMEOUT', '30000'))
    };
  }
}

module.exports = SecureConfig;
