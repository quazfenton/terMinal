/**
 * AI Provider Manager
 * Manages multiple AI providers with fallback and load balancing
 */

class AIProviderManager {
  constructor(secureConfig) {
    this.secureConfig = secureConfig;
    this.providers = new Map();
    this.fallbackOrder = ['claude', 'openai', 'gemini'];
    this.healthStatus = new Map();
    this.lastHealthCheck = new Map();
    this.healthCheckInterval = 300000; // 5 minutes
  }

  registerProvider(name, provider) {
    this.providers.set(name, provider);
    this.healthStatus.set(name, 'unknown');
  }

  async getAvailableProvider(preferredProvider = null) {
    // Try preferred provider first
    if (preferredProvider && await this.isProviderHealthy(preferredProvider)) {
      return this.providers.get(preferredProvider);
    }

    // Try fallback order
    for (const providerName of this.fallbackOrder) {
      if (await this.isProviderHealthy(providerName)) {
        return this.providers.get(providerName);
      }
    }

    throw new Error('No healthy AI providers available');
  }

  async isProviderHealthy(providerName) {
    const provider = this.providers.get(providerName);
    if (!provider) return false;

    const lastCheck = this.lastHealthCheck.get(providerName) || 0;
    const now = Date.now();

    // Use cached status if recent
    if (now - lastCheck < this.healthCheckInterval) {
      return this.healthStatus.get(providerName) === 'healthy';
    }

    // Perform health check
    try {
      const apiKey = provider.getApiKey();
      if (!apiKey || !this.secureConfig.validateApiKey(apiKey)) {
        this.healthStatus.set(providerName, 'unhealthy');
        return false;
      }

      // Simple health check - could be enhanced with actual API ping
      this.healthStatus.set(providerName, 'healthy');
      this.lastHealthCheck.set(providerName, now);
      return true;
    } catch (error) {
      this.healthStatus.set(providerName, 'unhealthy');
      this.lastHealthCheck.set(providerName, now);
      return false;
    }
  }

  async callWithFallback(method, ...args) {
    let lastError;

    for (const providerName of this.fallbackOrder) {
      try {
        const provider = await this.getAvailableProvider(providerName);
        if (provider && typeof provider[method] === 'function') {
          return await provider[method](...args);
        }
      } catch (error) {
        lastError = error;
        console.warn(`Provider ${providerName} failed:`, error.message);
      }
    }

    throw lastError || new Error('All providers failed');
  }

  getProviderStatus() {
    const status = {};
    for (const [name, health] of this.healthStatus) {
      status[name] = {
        health,
        lastCheck: this.lastHealthCheck.get(name),
        available: this.providers.has(name)
      };
    }
    return status;
  }
}

module.exports = AIProviderManager;
