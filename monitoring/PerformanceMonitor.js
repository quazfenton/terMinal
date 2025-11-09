/**
 * Performance Monitor
 * Tracks performance metrics and bottlenecks
 */

class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.timers = new Map();
    this.thresholds = {
      commandExecution: 5000,
      aiResponse: 10000,
      uiRender: 100
    };
  }

  startTimer(operation) {
    const id = `${operation}_${Date.now()}_${Math.random()}`;
    this.timers.set(id, {
      operation,
      startTime: process.hrtime.bigint(),
      startMemory: process.memoryUsage()
    });
    return id;
  }

  endTimer(id) {
    const timer = this.timers.get(id);
    if (!timer) return null;

    const endTime = process.hrtime.bigint();
    const endMemory = process.memoryUsage();
    const duration = Number(endTime - timer.startTime) / 1000000; // Convert to ms

    const metric = {
      operation: timer.operation,
      duration,
      memoryDelta: endMemory.heapUsed - timer.startMemory.heapUsed,
      timestamp: Date.now()
    };

    this.recordMetric(timer.operation, metric);
    this.timers.delete(id);

    return metric;
  }

  recordMetric(operation, metric) {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }

    const operationMetrics = this.metrics.get(operation);
    operationMetrics.push(metric);

    // Keep only last 100 metrics per operation
    if (operationMetrics.length > 100) {
      operationMetrics.shift();
    }

    // Check thresholds
    if (this.thresholds[operation] && metric.duration > this.thresholds[operation]) {
      console.warn(`Performance warning: ${operation} took ${metric.duration}ms (threshold: ${this.thresholds[operation]}ms)`);
    }
  }

  getMetrics(operation) {
    return this.metrics.get(operation) || [];
  }

  getAverageMetrics(operation) {
    const metrics = this.getMetrics(operation);
    if (metrics.length === 0) return null;

    const total = metrics.reduce((sum, m) => sum + m.duration, 0);
    const avgMemory = metrics.reduce((sum, m) => sum + m.memoryDelta, 0) / metrics.length;

    return {
      operation,
      count: metrics.length,
      averageDuration: total / metrics.length,
      averageMemoryDelta: avgMemory,
      minDuration: Math.min(...metrics.map(m => m.duration)),
      maxDuration: Math.max(...metrics.map(m => m.duration))
    };
  }

  getAllMetrics() {
    const result = {};
    for (const operation of this.metrics.keys()) {
      result[operation] = this.getAverageMetrics(operation);
    }
    return result;
  }

  clearMetrics(operation = null) {
    if (operation) {
      this.metrics.delete(operation);
    } else {
      this.metrics.clear();
    }
  }
}

module.exports = PerformanceMonitor;
