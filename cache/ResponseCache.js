/**
 * Response Cache
 * LRU cache for AI responses and command results
 */

const crypto = require('crypto');

class ResponseCache {
  constructor(maxSize = 100, ttl = 3600000) { // 1 hour TTL
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.cache = new Map();
    this.accessOrder = new Map();
  }

  generateKey(input, context = {}) {
    const data = JSON.stringify({ input, context });
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  set(input, response, context = {}) {
    const key = this.generateKey(input, context);
    const now = Date.now();
    
    // Remove oldest if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictOldest();
    }

    this.cache.set(key, {
      response,
      timestamp: now,
      accessCount: 1
    });
    
    this.accessOrder.set(key, now);
  }

  get(input, context = {}) {
    const key = this.generateKey(input, context);
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    
    // Check TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      return null;
    }

    // Update access
    entry.accessCount++;
    this.accessOrder.set(key, Date.now());
    
    return entry.response;
  }

  evictOldest() {
    let oldestKey = null;
    let oldestTime = Date.now();
    
    for (const [key, time] of this.accessOrder) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.accessOrder.delete(oldestKey);
    }
  }

  clear() {
    this.cache.clear();
    this.accessOrder.clear();
  }

  size() {
    return this.cache.size;
  }

  getStats() {
    const entries = Array.from(this.cache.values());
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      totalAccess: entries.reduce((sum, entry) => sum + entry.accessCount, 0),
      avgAccess: entries.length > 0 ? entries.reduce((sum, entry) => sum + entry.accessCount, 0) / entries.length : 0
    };
  }
}

module.exports = ResponseCache;
