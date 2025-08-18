const axios = require('axios');
const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');
const nodemailer = require('nodemailer');

class CryptoTrackerPlugin {
  constructor(commandExecutor) {
    this.commandExecutor = commandExecutor;
    this.config = {
      apiUrl: 'https://api.coingecko.com/api/v3',
      storagePath: './crypto_data',
      alertInterval: '*/5 * * * *', // Every 5 minutes
      notificationEmail: null,
      portfolio: {}
    };
    this.activeTrackers = new Map();
  }

  getName() {
    return 'CryptoTracker';
  }

  getCommands() {
    return [
      {
        name: 'trackCrypto',
        pattern: /^track-crypto\s+(\w+)\s+([\d.]+)\s*([<>]?)\s*([\d.]*)$/,
        description: 'Track cryptocurrency price with optional alert threshold',
        execute: this.trackCrypto.bind(this)
      },
      {
        name: 'listTrackers',
        pattern: /^list-trackers$/,
        description: 'List active cryptocurrency trackers',
        execute: this.listTrackers.bind(this)
      },
      {
        name: 'stopTracker',
        pattern: /^stop-tracker\s+(\d+)$/,
        description: 'Stop a tracker by ID',
        execute: this.stopTracker.bind(this)
      },
      {
        name: 'setCryptoEmail',
        pattern: /^set-crypto-email\s+(\S+@\S+\.\S+)$/,
        description: 'Set notification email for crypto alerts',
        execute: this.setCryptoEmail.bind(this)
      },
      {
        name: 'addToPortfolio',
        pattern: /^add-to-portfolio\s+(\w+)\s+([\d.]+)\s+([\d.]+)$/,
        description: 'Add cryptocurrency to portfolio',
        execute: this.addToPortfolio.bind(this)
      },
      {
        name: 'portfolioValue',
        pattern: /^portfolio-value$/,
        description: 'Calculate current portfolio value',
        execute: this.portfolioValue.bind(this)
      }
    ];
  }

  async trackCrypto(match) {
    const coinId = match[1].toLowerCase();
    const currentPrice = parseFloat(match[2]);
    const operator = match[3];
    const threshold = match[4] ? parseFloat(match[4]) : null;

    try {
      // Verify coin exists
      const coinData = await this.getCoinData(coinId);
      if (!coinData) {
        return { success: false, output: `Unknown cryptocurrency: ${coinId}` };
      }

      const trackerId = Date.now();
      const job = cron.schedule(this.config.alertInterval, async () => {
        try {
          await this.checkPrice(coinId, trackerId, operator, threshold);
        } catch (error) {
          console.error(`Crypto tracker error for ${coinId}:`, error);
        }
      });
      
      this.activeTrackers.set(trackerId, { 
        coinId,
        currentPrice,
        operator,
        threshold,
        job,
        lastCheck: new Date()
      });
      
      return { 
        success: true, 
        output: `Tracking ${coinId} at $${currentPrice}${operator}${threshold ? threshold : ''}`,
        trackerId 
      };
    } catch (error) {
      return { success: false, output: `Tracker setup failed: ${error.message}` };
    }
  }

  async checkPrice(coinId, trackerId, operator, threshold) {
    const currentPrice = await this.getCurrentPrice(coinId);
    const tracker = this.activeTrackers.get(trackerId);
    
    if (!tracker) return;
    
    let alert = false;
    let message = '';
    
    if (operator === '>' && currentPrice > threshold) {
      alert = true;
      message = `${coinId} price $${currentPrice} is above $${threshold}`;
    } else if (operator === '<' && currentPrice < threshold) {
      alert = true;
      message = `${coinId} price $${currentPrice} is below $${threshold}`;
    } else if (!operator && Math.abs(currentPrice - tracker.currentPrice) > tracker.currentPrice * 0.05) {
      alert = true;
      message = `${coinId} price changed more than 5%: $${currentPrice}`;
    }
    
    if (alert) {
      await this.sendNotification(message);
      tracker.currentPrice = currentPrice;
      tracker.lastCheck = new Date();
      this.activeTrackers.set(trackerId, tracker);
    }
  }

  async getCurrentPrice(coinId) {
    try {
      const response = await axios.get(`${this.config.apiUrl}/simple/price?ids=${coinId}&vs_currencies=usd`);
      return response.data[coinId].usd;
    } catch (error) {
      throw new Error(`Failed to get price for ${coinId}: ${error.message}`);
    }
  }

  async getCoinData(coinId) {
    try {
      const response = await axios.get(`${this.config.apiUrl}/coins/${coinId}`);
      return {
        id: response.data.id,
        name: response.data.name,
        symbol: response.data.symbol
      };
    } catch (error) {
      return null;
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
      subject: 'Crypto Price Alert',
      text: message
    };
    
    try {
      await transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  }

  listTrackers() {
    const trackers = [];
    for (const [id, tracker] of this.activeTrackers.entries()) {
      trackers.push({
        id,
        coinId: tracker.coinId,
        currentPrice: tracker.currentPrice,
        operator: tracker.operator,
        threshold: tracker.threshold,
        lastCheck: tracker.lastCheck
      });
    }
    return { 
      success: true, 
      output: `${trackers.length} active trackers`,
      trackers 
    };
  }

  stopTracker(match) {
    const trackerId = parseInt(match[1]);
    const tracker = this.activeTrackers.get(trackerId);
    if (tracker) {
      tracker.job.stop();
      this.activeTrackers.delete(trackerId);
      return { success: true, output: `Stopped tracker ${trackerId}` };
    }
    return { success: false, output: `Tracker ${trackerId} not found` };
  }

  setCryptoEmail(match) {
    const email = match[1];
    this.config.notificationEmail = email;
    return { 
      success: true, 
      output: `Notification email set to: ${email}` 
    };
  }

  addToPortfolio(match) {
    const coinId = match[1].toLowerCase();
    const amount = parseFloat(match[2]);
    const buyPrice = parseFloat(match[3]);
    
    if (!this.config.portfolio[coinId]) {
      this.config.portfolio[coinId] = [];
    }
    
    this.config.portfolio[coinId].push({
      amount,
      buyPrice,
      buyDate: new Date().toISOString()
    });
    
    return { 
      success: true, 
      output: `Added ${amount} ${coinId} at $${buyPrice} to portfolio` 
    };
  }

  async portfolioValue() {
    let totalValue = 0;
    let currentValues = {};
    
    for (const coinId of Object.keys(this.config.portfolio)) {
      try {
        const currentPrice = await this.getCurrentPrice(coinId);
        currentValues[coinId] = currentPrice;
        
        const coinHoldings = this.config.portfolio[coinId];
        const coinValue = coinHoldings.reduce((sum, holding) => {
          return sum + (holding.amount * currentPrice);
        }, 0);
        
        totalValue += coinValue;
      } catch (error) {
        console.error(`Error getting price for ${coinId}:`, error);
      }
    }
    
    return {
      success: true,
      output: `Portfolio value: $${totalValue.toFixed(2)}`,
      totalValue,
      currentValues
    };
  }

  async savePortfolio() {
    await fs.mkdir(this.config.storagePath, { recursive: true });
    const filePath = path.join(this.config.storagePath, 'portfolio.json');
    await fs.writeFile(filePath, JSON.stringify(this.config.portfolio, null, 2), 'utf8');
  }

  async loadPortfolio() {
    try {
      const filePath = path.join(this.config.storagePath, 'portfolio.json');
      const data = await fs.readFile(filePath, 'utf8');
      this.config.portfolio = JSON.parse(data);
    } catch (error) {
      // File doesn't exist or invalid
    }
  }
}

module.exports = CryptoTrackerPlugin;