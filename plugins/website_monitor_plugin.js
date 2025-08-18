const cron = require('node-cron');
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const diff = require('diff');

class WebsiteMonitorPlugin {
  constructor(commandExecutor) {
    this.commandExecutor = commandExecutor;
    this.config = {
      storagePath: './website_snapshots',
      checkInterval: '*/15 * * * *', // Every 15 minutes
      notificationEmail: null,
      notificationSms: null,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    };
    this.activeMonitors = new Map();
  }

  getName() {
    return 'WebsiteMonitor';
  }

  getCommands() {
    return [
      {
        name: 'monitorWebsite',
        pattern: /^monitor-website\s+(https?:\/\/\S+)$/,
        description: 'Monitor a website for changes',
        execute: this.monitorWebsite.bind(this)
      },
      {
        name: 'listWebsiteMonitors',
        pattern: /^list-website-monitors$/,
        description: 'List active website monitors',
        execute: this.listWebsiteMonitors.bind(this)
      },
      {
        name: 'stopWebsiteMonitor',
        pattern: /^stop-website-monitor\s+(\d+)$/,
        description: 'Stop a website monitor by ID',
        execute: this.stopWebsiteMonitor.bind(this)
      },
      {
        name: 'setNotificationEmail',
        pattern: /^set-notification-email\s+(\S+@\S+\.\S+)$/,
        description: 'Set notification email address',
        execute: this.setNotificationEmail.bind(this)
      }
    ];
  }

  async monitorWebsite(match) {
    const url = match[1];
    try {
      const monitorId = Date.now();
      const job = cron.schedule(this.config.checkInterval, async () => {
        try {
          await this.checkWebsite(url, monitorId);
        } catch (error) {
          console.error(`Website monitor error for ${url}:`, error);
        }
      });
      
      this.activeMonitors.set(monitorId, { 
        url, 
        job,
        lastCheck: new Date(),
        lastHash: null
      });
      
      // Run initial check immediately
      await this.checkWebsite(url, monitorId);
      
      return { 
        success: true, 
        output: `Monitoring website: ${url}`,
        monitorId 
      };
    } catch (error) {
      return { success: false, output: `Website monitor setup failed: ${error.message}` };
    }
  }

  async checkWebsite(url, monitorId) {
    const content = await this.fetchPageContent(url);
    const contentHash = this.hashContent(content);
    const monitor = this.activeMonitors.get(monitorId);
    
    if (!monitor.lastHash) {
      // First run, just store the hash
      monitor.lastHash = contentHash;
      monitor.lastCheck = new Date();
      this.activeMonitors.set(monitorId, monitor);
      return;
    }
    
    if (monitor.lastHash !== contentHash) {
      // Changes detected
      const previousContent = await this.getStoredSnapshot(monitor.lastHash);
      const changes = this.detectChanges(previousContent, content);
      
      // Save new snapshot
      await this.saveSnapshot(url, content, contentHash);
      
      // Send notification
      await this.sendNotification(url, changes, monitor.lastHash, contentHash);
      
      // Update monitor state
      monitor.lastHash = contentHash;
      monitor.lastCheck = new Date();
      this.activeMonitors.set(monitorId, monitor);
    }
  }

  async fetchPageContent(url) {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    await page.setUserAgent(this.config.userAgent);
    
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      const content = await page.content();
      await browser.close();
      return content;
    } catch (error) {
      await browser.close();
      throw error;
    }
  }

  hashContent(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  async saveSnapshot(url, content, hash) {
    await fs.mkdir(this.config.storagePath, { recursive: true });
    const filename = `${new URL(url).hostname}_${hash.slice(0, 8)}.html`;
    const filePath = path.join(this.config.storagePath, filename);
    await fs.writeFile(filePath, content, 'utf8');
    return filePath;
  }

  async getStoredSnapshot(hash) {
    const files = await fs.readdir(this.config.storagePath);
    for (const file of files) {
      if (file.includes(hash.slice(0, 8))) {
        const filePath = path.join(this.config.storagePath, file);
        return await fs.readFile(filePath, 'utf8');
      }
    }
    return null;
  }

  detectChanges(oldContent, newContent) {
    const changes = diff.diffLines(oldContent, newContent);
    let added = 0;
    let removed = 0;
    
    changes.forEach(change => {
      if (change.added) added += change.count;
      if (change.removed) removed += change.count;
    });
    
    return {
      addedLines: added,
      removedLines: removed,
      diff: changes
    };
  }

  async sendNotification(url, changes, oldHash, newHash) {
    if (!this.config.notificationEmail) return;
    
    const subject = `Website Change Detected: ${url}`;
    const text = `
Website: ${url}
Changes detected at: ${new Date().toISOString()}

Summary:
- Added lines: ${changes.addedLines}
- Removed lines: ${changes.removedLines}

View changes:
- Previous: ${this.getSnapshotUrl(oldHash)}
- Current: ${this.getSnapshotUrl(newHash)}
`;
    
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'your-email@gmail.com', // Should be configured
        pass: 'your-app-password'
      }
    });
    
    const mailOptions = {
      from: 'your-email@gmail.com',
      to: this.config.notificationEmail,
      subject,
      text
    };
    
    try {
      await transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  }

  getSnapshotUrl(hash) {
    return `file://${path.resolve(this.config.storagePath)}/${new URL(url).hostname}_${hash.slice(0, 8)}.html`;
  }

  listWebsiteMonitors() {
    const monitors = [];
    for (const [id, monitor] of this.activeMonitors.entries()) {
      monitors.push({
        id,
        url: monitor.url,
        lastCheck: monitor.lastCheck,
        lastHash: monitor.lastHash
      });
    }
    return { 
      success: true, 
      output: `${monitors.length} active monitors`,
      monitors 
    };
  }

  stopWebsiteMonitor(match) {
    const monitorId = parseInt(match[1]);
    const monitor = this.activeMonitors.get(monitorId);
    if (monitor) {
      monitor.job.stop();
      this.activeMonitors.delete(monitorId);
      return { success: true, output: `Stopped monitor ${monitorId}` };
    }
    return { success: false, output: `Monitor ${monitorId} not found` };
  }

  setNotificationEmail(match) {
    const email = match[1];
    this.config.notificationEmail = email;
    return { 
      success: true, 
      output: `Notification email set to: ${email}` 
    };
  }
}

module.exports = WebsiteMonitorPlugin;