/**
 * Health Monitor
 * System health monitoring and alerting
 */

class HealthMonitor {
  constructor(logger) {
    this.logger = logger;
    this.checks = new Map();
    this.status = 'healthy';
    this.lastCheck = null;
    this.metrics = {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage()
    };
    
    this.setupDefaultChecks();
    this.startMonitoring();
  }

  setupDefaultChecks() {
    this.addCheck('memory', () => {
      const usage = process.memoryUsage();
      const threshold = 500 * 1024 * 1024; // 500MB
      return {
        healthy: usage.heapUsed < threshold,
        value: usage.heapUsed,
        threshold,
        unit: 'bytes'
      };
    });

    this.addCheck('uptime', () => {
      const uptime = process.uptime();
      return {
        healthy: true,
        value: uptime,
        unit: 'seconds'
      };
    });

    this.addCheck('event_loop', () => {
      const start = process.hrtime.bigint();
      return new Promise(resolve => {
        setImmediate(() => {
          const lag = Number(process.hrtime.bigint() - start) / 1000000;
          resolve({
            healthy: lag < 100,
            value: lag,
            threshold: 100,
            unit: 'ms'
          });
        });
      });
    });
  }

  addCheck(name, checkFunction) {
    this.checks.set(name, checkFunction);
  }

  async runHealthChecks() {
    const results = {};
    let overallHealthy = true;

    for (const [name, check] of this.checks) {
      try {
        const result = await check();
        results[name] = {
          ...result,
          timestamp: Date.now()
        };
        
        if (!result.healthy) {
          overallHealthy = false;
          this.logger.warn(`Health check failed: ${name}`, result);
        }
      } catch (error) {
        results[name] = {
          healthy: false,
          error: error.message,
          timestamp: Date.now()
        };
        overallHealthy = false;
        this.logger.error(`Health check error: ${name}`, { error: error.message });
      }
    }

    this.status = overallHealthy ? 'healthy' : 'unhealthy';
    this.lastCheck = Date.now();
    
    return {
      status: this.status,
      timestamp: this.lastCheck,
      checks: results
    };
  }

  startMonitoring() {
    // Run health checks every 30 seconds
    setInterval(async () => {
      await this.runHealthChecks();
      this.updateMetrics();
    }, 30000);

    // Initial check
    this.runHealthChecks();
  }

  updateMetrics() {
    this.metrics = {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(this.metrics.cpu)
    };
  }

  getStatus() {
    return {
      status: this.status,
      lastCheck: this.lastCheck,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      pid: process.pid
    };
  }

  getMetrics() {
    return {
      ...this.metrics,
      timestamp: Date.now()
    };
  }

  isHealthy() {
    return this.status === 'healthy';
  }
}

module.exports = HealthMonitor;
