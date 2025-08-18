

const yahooFinance = require('yahoo-finance2');
const sqlite3 = require('sqlite3');
const path = require('path');

class StockTrackerPlugin {
  constructor(config = {}) {
    this.dbPath = path.join(__dirname, '..', 'stocks.db');
    this.db = new sqlite3.Database(this.dbPath);
    this.initDatabase();
  }

  initDatabase() {
    this.db.serialize(() => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS stock_data (
          id INTEGER PRIMARY KEY,
          symbol TEXT NOT NULL,
          date TEXT NOT NULL,
          open REAL, high REAL, low REAL, close REAL, volume INTEGER,
          UNIQUE(symbol, date)
        )
      `);
      this.db.run(`
        CREATE TABLE IF NOT EXISTS watchlist (
          id INTEGER PRIMARY KEY,
          symbol TEXT UNIQUE NOT NULL,
          company_name TEXT,
          sector TEXT,
          added_date TEXT
        )
      `);
    });
  }

  getCommands() {
    return [
      {
        command: /^stock add (\w+)/,
        handler: this.addToWatchlistCommand.bind(this),
        description: 'Adds a stock symbol to your watchlist.',
        args: ['symbol']
      },
      {
        command: /^stock remove (\w+)/,
        handler: this.removeFromWatchlistCommand.bind(this),
        description: 'Removes a stock symbol from your watchlist.',
        args: ['symbol']
      },
      {
        command: /^stock watchlist$/,
        handler: this.showWatchlistCommand.bind(this),
        description: 'Shows all stocks on your watchlist.'
      },
      {
        command: /^stock update$/,
        handler: this.updateWatchlistDataCommand.bind(this),
        description: 'Updates historical data for all stocks on your watchlist.'
      },
      {
        command: /^stock quote (\w+)/,
        handler: this.getQuoteCommand.bind(this),
        description: 'Gets the latest quote for a stock symbol.',
        args: ['symbol']
      },
      {
        command: /^stock indicators (\w+)/,
        handler: this.getIndicatorsCommand.bind(this),
        description: 'Calculates and shows technical indicators for a stock.',
        args: ['symbol']
      }
    ];
  }

  async addToWatchlistCommand(match) {
    const [, symbol] = match;
    try {
      const quote = await yahooFinance.quote(symbol);
      await new Promise((resolve, reject) => {
        this.db.run('INSERT OR IGNORE INTO watchlist (symbol, company_name, sector, added_date) VALUES (?, ?, ?, ?)',
          [symbol.toUpperCase(), quote.longName, quote.sector, new Date().toISOString()],
          (err) => { if (err) reject(err); else resolve(); }
        );
      });
      return { success: true, output: `Added ${quote.longName} (${symbol.toUpperCase()}) to watchlist.` };
    } catch (error) {
      return { success: false, output: `Could not add ${symbol}: ${error.message}` };
    }
  }

  async removeFromWatchlistCommand(match) {
    const [, symbol] = match;
    const result = await new Promise((resolve, reject) => {
      this.db.run('DELETE FROM watchlist WHERE symbol = ?', [symbol.toUpperCase()], function(err) {
        if (err) reject(err); else resolve(this.changes);
      });
    });
    if (result > 0) {
      return { success: true, output: `Removed ${symbol.toUpperCase()} from watchlist.` };
    } else {
      return { success: false, output: `${symbol.toUpperCase()} not found in watchlist.` };
    }
  }

  async showWatchlistCommand() {
    const rows = await new Promise((resolve, reject) => {
      this.db.all('SELECT symbol, company_name, sector FROM watchlist ORDER BY symbol', (err, rows) => {
        if (err) reject(err); else resolve(rows);
      });
    });
    if (rows.length === 0) return { success: true, output: 'Watchlist is empty.' };
    const output = rows.map(r => `${r.symbol.padEnd(8)} ${r.company_name} (${r.sector || 'N/A'})`).join('\n');
    return { success: true, output };
  }

  async updateWatchlistDataCommand() {
    const rows = await new Promise((resolve, reject) => {
      this.db.all('SELECT symbol FROM watchlist', (err, rows) => { if (err) reject(err); else resolve(rows); });
    });
    if (rows.length === 0) return { success: true, output: 'Watchlist is empty. Nothing to update.' };

    let updatedCount = 0;
    for (const row of rows) {
      try {
        const history = await yahooFinance.historical(row.symbol, { period1: '2020-01-01' });
        this.db.serialize(() => {
          const stmt = this.db.prepare('INSERT OR REPLACE INTO stock_data (symbol, date, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?)');
          for (const item of history) {
            stmt.run(row.symbol, item.date.toISOString().split('T')[0], item.open, item.high, item.low, item.close, item.volume);
          }
          stmt.finalize();
        });
        updatedCount++;
      } catch (error) {
        console.error(`Failed to update data for ${row.symbol}: ${error.message}`);
      }
    }
    return { success: true, output: `Updated historical data for ${updatedCount}/${rows.length} stocks.` };
  }

  async getQuoteCommand(match) {
    const [, symbol] = match;
    try {
      const quote = await yahooFinance.quote(symbol);
      const output = [
        `Quote for ${quote.longName} (${quote.symbol})`,
        `Price: ${quote.regularMarketPrice} (${quote.regularMarketChange.toFixed(2)} / ${quote.regularMarketChangePercent.toFixed(2)}%)`,
        `Range: ${quote.regularMarketDayLow} - ${quote.regularMarketDayHigh}`,
        `Volume: ${quote.regularMarketVolume.toLocaleString()}`
      ].join('\n');
      return { success: true, output };
    } catch (error) {
      return { success: false, output: `Could not get quote for ${symbol}: ${error.message}` };
    }
  }

  async getIndicatorsCommand(match) {
    const [, symbol] = match;
    const data = await new Promise((resolve, reject) => {
      this.db.all('SELECT date, close FROM stock_data WHERE symbol = ? ORDER BY date DESC LIMIT 50', [symbol.toUpperCase()], (err, rows) => {
        if (err) reject(err); else resolve(rows.reverse());
      });
    });

    if (data.length < 50) {
      return { success: false, output: `Not enough historical data for ${symbol}. Run \`stock update\` first.` };
    }

    const closes = data.map(d => d.close);
    const sma20 = this.calculateSMA(closes, 20).pop().toFixed(2);
    const sma50 = this.calculateSMA(closes, 50).pop().toFixed(2);
    const rsi = this.calculateRSI(closes).pop().toFixed(2);

    const output = [
      `Technical Indicators for ${symbol.toUpperCase()}`,
      `SMA 20: ${sma20}`,
      `SMA 50: ${sma50}`,
      `RSI 14: ${rsi}`
    ].join('\n');

    return { success: true, output };
  }

  calculateSMA(data, period) {
    let result = [];
    for (let i = period - 1; i < data.length; i++) {
      const slice = data.slice(i - period + 1, i + 1);
      const sum = slice.reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
    return result;
  }

  calculateRSI(data, period = 14) {
    let gains = 0;
    let losses = 0;
    let rsi = [];

    for (let i = 1; i < data.length; i++) {
      const diff = data[i] - data[i-1];
      if (diff > 0) gains += diff; else losses -= diff;

      if (i > period) {
        const prevDiff = data[i-period] - data[i-period-1];
        if (prevDiff > 0) gains -= prevDiff; else losses += prevDiff;
      }
      
      if (i >= period) {
        const avgGain = gains / period;
        const avgLoss = losses / period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsi.push(100 - (100 / (1 + rs)));
      }
    }
    return rsi;
  }
}

module.exports = StockTrackerPlugin;
