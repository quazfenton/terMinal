const sqlite3 = require('sqlite3');
const path = require('path');
const fs = require('fs').promises;
const Imap = require('node-imap');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');
const cron = require('node-cron');

class EmailAutomatorPlugin {
  constructor() {
    this.dbPath = path.join(__dirname, '..', 'email_automation.db');
    this.configPath = path.join(__dirname, '..', 'email_config.json');
    this.db = new sqlite3.Database(this.dbPath);
    this.config = {}; // Initialize as empty object
    this.cronJob = null;
    this.initDatabase();
    this.loadConfig(); // Load config asynchronously
  }

  initDatabase() {
    this.db.serialize(() => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS email_rules (
          id INTEGER PRIMARY KEY, rule_name TEXT UNIQUE, from_pattern TEXT, 
          subject_pattern TEXT, body_pattern TEXT, action TEXT, action_params TEXT, active BOOLEAN DEFAULT 1
        )
      `);
      this.db.run(`
        CREATE TABLE IF NOT EXISTS processed_emails (id INTEGER PRIMARY KEY, message_id TEXT UNIQUE, processed_date TEXT, rule_applied TEXT)
      `);
    });
  }

  async loadConfig() {
    try {
      const data = await fs.readFile(this.configPath, 'utf8');
      this.config = JSON.parse(data);
      console.log('Email config loaded.');
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.warn('Email config file not found. Please configure using `email config set` commands.');
      } else {
        console.error('Error loading email config:', error.message);
      }
      this.config = {}; // Ensure config is an object even if file is missing/corrupt
    }
  }

  async saveConfig() {
    try {
      await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
      console.log('Email config saved.');
    } catch (error) {
      console.error('Error saving email config:', error.message);
    }
  }

  getCommands() {
    return [
      { command: /^email config set (\S+) (.+)/, handler: this.setConfigValue.bind(this), description: 'Set email configuration (e.g., host, user, password).', args: ['key', 'value'] },
      { command: /^email config show$/ , handler: this.showConfig.bind(this), description: 'Show current email configuration.' },
      { command: /^email rule add (\S+) --from (.+) --subject (.+) --action (.+)(?: --params (.+))?$/, handler: this.addRule.bind(this), description: 'Add an email processing rule.', args: ['name', 'from_pattern', 'subject_pattern', 'action', 'action_params'] },
      { command: /^email rule remove (\S+)/, handler: this.removeRule.bind(this), description: 'Remove an email processing rule.', args: ['name'] },
      { command: /^email rules$/ , handler: this.listRules.bind(this), description: 'List all configured email rules.' },
      { command: /^email check$/ , handler: this.checkEmailsCommand.bind(this), description: 'Manually check emails and apply rules.' },
      { command: /^email start (\d+)$/, handler: this.startAutomation.bind(this), description: 'Start automated email checking every N minutes.', args: ['interval_minutes'] },
      { command: /^email stop$/, handler: this.stopAutomation.bind(this), description: 'Stop automated email checking.' },
    ];
  }

  async setConfigValue(match) {
    const [, key, value] = match;
    this.config[key] = value;
    await this.saveConfig();
    return { success: true, output: `Set email config: ${key} = ${value}.` };
  }

  async showConfig() {
    const configToShow = { ...this.config };
    if (configToShow.password) configToShow.password = '********'; // Mask password
    return { success: true, output: JSON.stringify(configToShow, null, 2) };
  }

  async addRule(match) {
    const [, name, from_pattern, subject_pattern, action, action_params] = match;
    try {
      await new Promise((resolve, reject) => {
        this.db.run('INSERT INTO email_rules (rule_name, from_pattern, subject_pattern, action, action_params) VALUES (?, ?, ?, ?, ?)',
          [name, from_pattern, subject_pattern, action, action_params],
          (err) => { if(err) reject(err); else resolve(); }
        );
      });
      return { success: true, output: `Rule "${name}" added.` };
    } catch (error) {
      return { success: false, output: `Failed to add rule: ${error.message}` };
    }
  }

  async removeRule(match) {
    const [, name] = match;
    const result = await new Promise((resolve, reject) => {
      this.db.run('DELETE FROM email_rules WHERE rule_name = ?', [name], function(err) {
        if(err) reject(err); else resolve(this.changes);
      });
    });
    return { success: result > 0, output: result > 0 ? `Rule "${name}" removed.` : `Rule "${name}" not found.` };
  }

  async listRules() {
    const rows = await new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM email_rules', (err, rows) => { if(err) reject(err); else resolve(rows); });
    });
    const output = rows.map(r => `[${r.active ? 'ON' : 'OFF'}] ${r.rule_name} (From: ${r.from_pattern}, Subject: ${r.subject_pattern}) -> ${r.action} (${r.action_params || ''})`).join('\n');
    return { success: true, output: output || 'No rules defined.' };
  }

  async checkEmailsCommand() {
    const result = await this.checkEmails();
    return { success: true, output: `Email check complete. ${result.processedCount} emails processed.` };
  }

  async startAutomation(match) {
    const [, interval] = match;
    if (this.cronJob) {
      this.cronJob.stop();
    }
    this.cronJob = cron.schedule(`*/${interval} * * * *`, () => this.checkEmails());
    return { success: true, output: `Email automation started. Checking every ${interval} minutes.` };
  }

  async stopAutomation() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      return { success: true, output: 'Email automation stopped.' };
    } else {
      return { success: false, output: 'Email automation is not running.' };
    }
  }

  // Core Email Processing Logic
  async checkEmails() {
    const config = this.config;
    if (!config.imapHost || !config.imapPort || !config.user || !config.password) {
      console.error('Email configuration incomplete. Cannot check emails.');
      return { processedCount: 0 };
    }

    let imap;
    let processedCount = 0;
    try {
      imap = new Imap({
        user: config.user,
        password: config.password,
        host: config.imapHost,
        port: parseInt(config.imapPort),
        tls: true,
        tlsOptions: { rejectUnauthorized: false } // Use with caution in production
      });

      await new Promise((resolve, reject) => {
        imap.once('ready', resolve);
        imap.once('error', reject);
        imap.connect();
      });

      const openBox = await new Promise((resolve, reject) => {
        imap.openBox('INBOX', false, (err, box) => {
          if (err) reject(err); else resolve(box);
        });
      });

      const searchCriteria = ['UNSEEN']; // Only process unread emails
      const fetchOptions = { bodies: [''], struct: true };

      const messages = await new Promise((resolve, reject) => {
        imap.search(searchCriteria, (err, results) => {
          if (err) reject(err); else resolve(results);
        });
      });

      if (!messages || messages.length === 0) {
        console.log('No new emails to process.');
        imap.end();
        return { processedCount: 0 };
      }

      const rules = await new Promise((resolve, reject) => {
        this.db.all('SELECT * FROM email_rules WHERE active = 1', (err, rows) => {
          if (err) reject(err); else resolve(rows);
        });
      });

      const f = imap.fetch(messages, fetchOptions);
      f.on('message', async (msg, seqno) => {
        const attributes = await new Promise(resolve => msg.once('attributes', resolve));
        const messageId = attributes.uid;

        const isProcessed = await new Promise((resolve, reject) => {
          this.db.get('SELECT id FROM processed_emails WHERE message_id = ?', [messageId], (err, row) => {
            if (err) reject(err); else resolve(!!row);
          });
        });

        if (isProcessed) {
          console.log(`Skipping already processed email UID: ${messageId}`);
          return;
        }

        const parsedEmail = await new Promise((resolve, reject) => {
          msg.on('body', (stream, info) => {
            simpleParser(stream, (err, mail) => {
              if (err) reject(err); else resolve(mail);
            });
          });
        });

        for (const rule of rules) {
          if (this.matchesRule(rule, parsedEmail)) {
            await this.applyRule(rule, parsedEmail, messageId, imap);
            await new Promise((resolve, reject) => {
              this.db.run('INSERT INTO processed_emails (message_id, processed_date, rule_applied) VALUES (?, ?, ?)',
                [messageId, new Date().toISOString(), rule.rule_name],
                (err) => { if(err) reject(err); else resolve(); }
              );
            });
            processedCount++;
            break; // Apply only the first matching rule
          }
        }
      });

      await new Promise(resolve => f.once('end', resolve));
      imap.end();
      return { processedCount };

    } catch (error) {
      console.error('Error during email check:', error.message);
      if (imap && imap.state !== 'disconnected') imap.end();
      return { processedCount: 0 };
    }
  }

  matchesRule(rule, email) {
    const fromMatch = rule.from_pattern ? new RegExp(rule.from_pattern, 'i').test(email.from.text) : true;
    const subjectMatch = rule.subject_pattern ? new RegExp(rule.subject_pattern, 'i').test(email.subject) : true;
    // For body, we check both text and html parts if available
    const bodyMatch = rule.body_pattern ? 
      (email.text ? new RegExp(rule.body_pattern, 'i').test(email.text) : false) ||
      (email.html ? new RegExp(rule.body_pattern, 'i').test(email.html) : false)
      : true;

    return fromMatch && subjectMatch && bodyMatch;
  }

  async applyRule(rule, email, messageId, imap) {
    console.log(`Applying rule "${rule.rule_name}" to email: ${email.subject}`);
    switch (rule.action) {
      case 'delete':
        imap.addFlags(messageId, ['\\Deleted'], (err) => {
          if (err) console.error('Failed to mark for deletion:', err);
          else imap.expunge((err) => { if (err) console.error('Failed to expunge:', err); });
        });
        break;
      case 'move':
        const targetFolder = rule.action_params || 'Processed';
        imap.move(messageId, targetFolder, (err) => {
          if (err) console.error(`Failed to move email to ${targetFolder}:`, err);
        });
        break;
      case 'forward':
        if (rule.action_params) {
          await this.sendEmail({
            from: this.config.user,
            to: rule.action_params,
            subject: `Fwd: ${email.subject}`,
            html: `---------- Forwarded message ----------<br>From: ${email.from.text}<br>Subject: ${email.subject}<br><br>${email.html || email.text}`
          });
        }
        break;
      case 'reply':
        if (email.replyTo && email.replyTo.text) {
          await this.sendEmail({
            from: this.config.user,
            to: email.replyTo.text,
            subject: `Re: ${email.subject}`,
            html: rule.action_params || 'This is an automated reply.'
          });
        } else if (email.from && email.from.text) {
             await this.sendEmail({
            from: this.config.user,
            to: email.from.text,
            subject: `Re: ${email.subject}`,
            html: rule.action_params || 'This is an automated reply.'
          });
        }
        break;
      default:
        console.warn(`Unknown action: ${rule.action}`);
    }
    // Mark as seen after processing
    imap.addFlags(messageId, ['\\Seen'], (err) => { if (err) console.error('Failed to mark as seen:', err); });
  }

  async sendEmail(mailOptions) {
    const config = this.config;
    if (!config.smtpHost || !config.smtpPort || !config.user || !config.password) {
      console.error('SMTP configuration incomplete. Cannot send email.');
      return;
    }
    let transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: parseInt(config.smtpPort),
      secure: parseInt(config.smtpPort) === 465, // true for 465, false for other ports
      auth: {
        user: config.user,
        pass: config.password,
      },
      tls: { rejectUnauthorized: false } // Use with caution
    });

    try {
      await transporter.sendMail(mailOptions);
      console.log(`Email sent to ${mailOptions.to}`);
    } catch (error) {
      console.error('Error sending email:', error.message);
    }
  }
}

module.exports = EmailAutomatorPlugin;