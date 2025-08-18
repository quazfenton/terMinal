const os = require('os');
const fs = require('fs').promises;
const path = require('path');
const cron = require('node-cron');
const nodemailer = require('nodemailer');

class SystemMonitorPlugin {
  constructor(commandExecutor) {
    this.commandExecutor = commandExecutor;
    this.config = {
      storagePath: './system_monitor',
      checkInterval: '*/1 * * * *', // Every minute
      notificationEmail: null,
      thresholds: {
        cpu: 90,    // CPU usage %
        memory: 90, // Memory usage %
        disk: 90    // Disk usage %
      }
    };
    this.activeMonitors = new Map();
    this.history = [];
  }

  getName() {
    return 'SystemMonitor';
  }

  getCommands() {
    return [
      {
        name: 'startMonitor',
        pattern: /^start-monitor$/,
        description: 'Start system resource monitoring',
        execute: this.startMonitor.bind(this)
      },
      {
        name: 'stopMonitor',
        pattern: /^stop-monitor$/,
        description: 'Stop system resource monitoring',
        execute: this.stopMonitor.bind(this)
      },
      {
        name: 'setMonitorEmail',
        pattern: /^set-monitor-email\s+(\S+@\S+\.\S+)$/,
        description: 'Set notification email for system alerts',
        execute: this.setMonitorEmail.bind(this)
      },
      {
        name: 'setThreshold',
        pattern: /^set-threshold\s+(\w+)\s+(\d+)$/,
        description: 'Set threshold for CPU, memory or disk usage',
        execute: this.setThreshold.bind(this)
      },
      {
        name: 'getStats',
        pattern: /^get-stats$/,
        description: 'Get current system statistics',
        execute: this.getStats.bind(this)
      },
      {
        name: 'getHistory',
        pattern: /^get-history\s+(\d+)?$/,
        description: 'Get monitoring history (optional: number of entries)',
        execute: this.getHistory.bind(this)
      }
    ];
  }

  async startMonitor() {
    if (this.activeMonitors.size > 0) {
      return { success: false, output: 'Monitor is already running' };
    }

    const monitorId = Date.now();
    const job = cron.schedule(this.config.checkInterval, async () => {
      try {
        await this.checkSystem();
      } catch (error) {
        console.error('System monitor error:', error);
      }
    });
    
    this.activeMonitors.set(monitorId, { 
      job,
      startTime: new Date()
    });
    
    return { 
      success: true, 
      output: 'System monitoring started',
      monitorId 
    };
  }

  stopMonitor() {
    if (this.activeMonitors.size === 0) {
      return { success: false, output: 'No active monitors' };
    }
    
    for (const [id, monitor] of this.activeMonitors.entries()) {
      monitor.job.stop();
      this.activeMonitors.delete(id);
    }
    
    return { success: true, output: 'System monitoring stopped' };
  }

  async checkSystem() {
    const stats = await this.getSystemStats();
    this.history.push({ timestamp: new Date(), ...stats });
    
    // Check thresholds
    let alerts = [];
    
    if (stats.cpuUsage > this.config.thresholds.cpu) {
      alerts.push(`CPU usage exceeded threshold: ${stats.cpuUsage}% > ${this.config.thresholds.cpu}%`);
    }
    
    if (stats.memoryUsage > this.config.thresholds.memory) {
      alerts.push(`Memory usage exceeded threshold: ${stats.memoryUsage}% > ${this.config.thresholds.memory}%`);
    }
    
    if (stats.diskUsage > this.config.thresholds.disk) {
      alerts.push(`Disk usage exceeded threshold: ${stats.diskUsage}% > ${this.config.thresholds.disk}%`);
    }
    
    if (alerts.length > 0) {
      await this.sendNotification(alerts.join('\n'));
    }
    
    // Save to history file
    await this.saveHistory();
  }

  async getSystemStats() {
    // CPU usage (average over 1 second)
    const startUsage = process.cpuUsage();
    await new Promise(resolve => setTimeout(resolve, 1000));
    const endUsage = process.cpuUsage(startUsage);
    
    const cpuUsage = (endUsage.user + endUsage.system) / 10000; // Convert to percentage
    
    // Memory usage
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memoryUsage = 100 - Math.round((freeMem / totalMem) * 100);
    
    // Disk usage
    const diskStats = await this.getDiskUsage();
    
    return {
      cpuUsage: Math.round(cpuUsage),
      memoryUsage,
      diskUsage: diskStats.usage,
      diskFree: diskStats.free,
      diskTotal: diskStats.total
    };
  }

  async getDiskUsage() {
    try {
      const stats = await fs.statfs('/');
      const total = stats.blocks * stats.bsize;
      const free = stats.bfree * stats.bsize;
      const used = total - free;
      const usage = Math.round((used / total) * 100);
      
      return {
        total,
        free,
        used,
        usage
      };
    } catch (error) {
      console.error('Error getting disk usage:', error);
      return {
        total: 0,
        free: 0,
        used: 0,
        usage: 0
      };
    }
  }

  async sendNotification(message) {
    if (!this.config.notificationEmail) return;
    
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'your-email@gmail.com',
        pass: 'your-app-password'
      }
    });
    
    const mailOptions = {
      from: 'your-email@gmail.com',
      to: this.config.notificationEmail,
      subject: 'System Alert',
      text: message
    };
    
    try {
      await transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  }

  setMonitorEmail(match) {
    const email = match[1];
    this.config.notificationEmail = email;
    return { 
      success: true, 
      output: `Notification email set to: ${email}` 
    };
  }

  setThreshold(match) {
    const resource = match[1].toLowerCase();
    const value = parseInt(match[2]);
    
    if (['cpu', 'memory', 'disk'].includes(resource)) {
      this.config.thresholds[resource] = value;
      return { 
        success: true, 
        output: `Set ${resource} threshold to ${value}%` 
      };
    }
    
    return { success: false, output: `Invalid resource: ${resource}` };
  }

  async getStats() {
    const stats = await this.getSystemStats();
    return {
      success: true,
      output: `CPU: ${stats.cpuUsage}%, Memory: ${stats.memoryUsage}%, Disk: ${stats.diskUsage}%`,
      stats
    };
  }

  async getHistory(match) {
    const limit = match[1] ? parseInt(match[1]) : 10;
    const entries = this.history.slice(-limit);
    
    return {
      success: true,
      output: `Showing last ${entries.length} entries`,
      history: entries
    };
  }

  async saveHistory() {
    await fs.mkdir(this.config.storagePath, { recursive: true });
    const filePath = path.join(this.config.storagePath, 'history.json');
    await fs.writeFile(filePath, JSON.stringify(this.history, null, 2), 'utf8');
  }

  async loadHistory() {
    try {
      const filePath = path.join(this.config.storagePath, 'history.json');
      const data = await fs.readFile(filePath, 'utf8');
      this.history = JSON.parse(data);
    } catch (error) {
      // File doesn't exist or invalid
    }
  }
}

module.exports = SystemMonitorPlugin;