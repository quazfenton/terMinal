

const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const axios = require('axios');
const sqlite3 = require('sqlite3');
const Parser = require('rss-parser');
const path = require('path');
const fs = require('fs').promises;

class ArticleScraperPlugin {
  constructor(config = {}) {
    this.dbPath = path.join(__dirname, '..', 'articles.db');
    this.db = new sqlite3.Database(this.dbPath);
    this.rssParser = new Parser();
    this.initDatabase();
    this.categories = new Map(); // For article categorization
  }

  initDatabase() {
    this.db.serialize(() => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS articles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          url TEXT UNIQUE,
          title TEXT,
          content TEXT,
          author TEXT,
          published_date TEXT,
          scraped_date TEXT,
          source_domain TEXT
        )
      `);
      this.db.run(`
        CREATE TABLE IF NOT EXISTS feeds (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          feed_url TEXT UNIQUE,
          title TEXT,
          last_checked TEXT
        )
      `);
    });
  }

  getCommands() {
    return [
      {
        command: /^scrape article (https?:\/\/\S+)/,
        handler: this.scrapeArticleCommand.bind(this),
        description: 'Scrapes and saves a single article from a URL.',
        args: ['url']
      },
      {
        command: /^add feed (https?:\/\/\S+)/,
        handler: this.addFeedCommand.bind(this),
        description: 'Adds an RSS feed to monitor for new articles.',
        args: ['feed_url']
      },
      {
        command: /^check feeds$/,
        handler: this.checkFeedsCommand.bind(this),
        description: 'Checks all registered RSS feeds for new articles.'
      },
      {
        command: /^list articles$/,
        handler: this.listArticlesCommand.bind(this),
        description: 'Lists all scraped articles from the database.'
      },
      {
        command: /^summarize article (\d+)$/,
        handler: this.summarizeArticleCommand.bind(this),
        description: 'Provides a summary of an article by ID.',
        args: ['articleId']
      },
      {
        command: /^categorize article (\d+) as (.+)$/,
        handler: this.categorizeArticleCommand.bind(this),
        description: 'Adds a category/tag to an article.',
        args: ['articleId', 'category']
      },
      {
        command: /^export articles to (.+)$/,
        handler: this.exportArticlesCommand.bind(this),
        description: 'Exports articles to a file in JSON or CSV format.',
        args: ['filePath']
      },
      {
        command: /^search articles (.+)$/,
        handler: this.searchArticlesCommand.bind(this),
        description: 'Searches articles by content or title.',
        args: ['searchTerm']
     }
   ];
 }

  async scrapeArticleCommand(match) {
    const [, url] = match;
    try {
      const article = await this.scrapeArticle(url);
      if (article) {
        if (article.isNew) {
          return { success: true, output: `Article "${article.title}" scraped and saved.` };
        } else {
          return { success: true, output: `Article "${article.title}" already exists in the database.` };
        }
      } else {
        return { success: false, output: 'Could not scrape the article.' };
      }
    } catch (error) {
      console.error('Scrape command error:', error);
      return { success: false, output: `Failed to scrape article: ${error.message}` };
    }
  }

  async addFeedCommand(match) {
    const [, feedUrl] = match;
    try {
      const feed = await this.rssParser.parseURL(feedUrl);
      const title = feed.title || 'Untitled Feed';
      
      return new Promise((resolve, reject) => {
        this.db.run('INSERT OR IGNORE INTO feeds (feed_url, title, last_checked) VALUES (?, ?, ?)', 
        [feedUrl, title, new Date().toISOString()], (err) => {
          if (err) {
            reject(err);
          } else {
            resolve({ success: true, output: `Feed "${title}" added successfully.` });
          }
        });
      });
    } catch (error) {
      return { success: false, output: `Failed to add feed: ${error.message}` };
    }
  }

  async checkFeedsCommand() {
    const feeds = await new Promise((resolve, reject) => {
      this.db.all('SELECT feed_url FROM feeds', (err, rows) => {
        if (err) reject(err); else resolve(rows);
      });
    });

    if (feeds.length === 0) {
      return { success: true, output: 'No feeds to check. Add one with `add feed <url>`' };
    }

    let newArticlesCount = 0;
    for (const row of feeds) {
      try {
        const feed = await this.rssParser.parseURL(row.feed_url);
        for (const item of feed.items) {
          const article = await this.scrapeArticle(item.link);
          if (article && article.isNew) {
            newArticlesCount++;
          }
        }
        this.db.run('UPDATE feeds SET last_checked = ? WHERE feed_url = ?', [new Date().toISOString(), row.feed_url]);
      } catch (error) {
        console.error(`Failed to check feed ${row.feed_url}:`, error);
      }
    }
    return { success: true, output: `Feed check complete. Found ${newArticlesCount} new articles.` };
  }

  async listArticlesCommand() {
    const articles = await new Promise((resolve, reject) => {
      this.db.all('SELECT id, title, source_domain, published_date FROM articles ORDER BY scraped_date DESC LIMIT 20', (err, rows) => {
        if (err) reject(err); else resolve(rows);
      });
    });

    if (articles.length === 0) {
      return { success: true, output: 'No articles found in the database.' };
    }

    const output = articles.map(a => 
      `[${a.id}] ${a.title} (${a.source_domain}) - ${a.published_date || 'N/A'}`
    ).join('\n');
    return { success: true, output };
  }

  async scrapeArticle(url) {
    try {
      const existing = await new Promise((resolve, reject) => {
        this.db.get('SELECT id, title FROM articles WHERE url = ?', [url], (err, row) => {
          if (err) reject(err); else resolve(row);
        });
      });

      if (existing) {
        return { ...existing, isNew: false };
      }

      const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const dom = new JSDOM(response.data, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (!article || !article.content) {
        return null;
      }

      const articleData = {
        url,
        title: article.title,
        content: article.textContent, // Store clean text content
        author: article.byline,
        published_date: article.publishedTime ? new Date(article.publishedTime).toISOString() : null,
        scraped_date: new Date().toISOString(),
        source_domain: new URL(url).hostname
      };

      const result = await new Promise((resolve, reject) => {
        this.db.run(
          `INSERT INTO articles (url, title, content, author, published_date, scraped_date, source_domain)
           VALUES (?, ?, ?, ?, ?, ?, ?)`, 
          Object.values(articleData),
          function(err) { // Note: not an arrow function to preserve `this`
            if (err) reject(err); else resolve({ id: this.lastID, ...articleData, isNew: true });
          }
        );
      });

      return result;
    } catch (error) {
      console.error(`Failed to scrape article at ${url}:`, error.message);
      // Don't re-throw, just return null so bulk operations can continue
      return null; 
    }
  }

  async summarizeArticleCommand(match) {
    const [, articleId] = match;
    try {
      const article = await new Promise((resolve, reject) => {
        this.db.get('SELECT * FROM articles WHERE id = ?', [articleId], (err, row) => {
          if (err) reject(err); else resolve(row);
        });
      });
      
      if (!article) {
        return { success: false, output: `Article with ID ${articleId} not found.` };
      }
      
      // Simple summarization - in a real implementation, you might use a more sophisticated algorithm
      // or even an AI service to generate summaries
      const summary = this.generateSummary(article.content);
      
      return { success: true, output: `Summary of "${article.title}":\n${summary}` };
    } catch (error) {
      console.error('Summarize command error:', error);
      return { success: false, output: `Failed to summarize article: ${error.message}` };
    }
  }

  generateSummary(content) {
    // Simple first sentence extraction as summary
    if (!content) return 'No content available';
    
    // Extract first paragraph or first few sentences
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length === 0) return 'No content available';
    
    // Return first 2-3 sentences as summary
    return sentences.slice(0, 3).join('. ') + '.';
  }

  async categorizeArticleCommand(match) {
    const [, articleId, category] = match;
    try {
      // Check if article exists
      const article = await new Promise((resolve, reject) => {
        this.db.get('SELECT id FROM articles WHERE id = ?', [articleId], (err, row) => {
          if (err) reject(err); else resolve(row);
        });
      });
      
      if (!article) {
        return { success: false, output: `Article with ID ${articleId} not found.` };
      }
      
      // Create categories table if it doesn't exist
      this.db.run(`
        CREATE TABLE IF NOT EXISTS article_categories (
          article_id INTEGER,
          category TEXT,
          FOREIGN KEY(article_id) REFERENCES articles(id)
        )
      `);
      
      // Add category to article
      await new Promise((resolve, reject) => {
        this.db.run('INSERT OR IGNORE INTO article_categories (article_id, category) VALUES (?, ?)',
        [articleId, category], (err) => {
          if (err) reject(err); else resolve();
        });
      });
      
      // Store category in memory for quick access
      if (!this.categories.has(articleId)) {
        this.categories.set(articleId, new Set());
      }
      this.categories.get(articleId).add(category);
      
      return { success: true, output: `Article ${articleId} categorized as "${category}".` };
    } catch (error) {
      console.error('Categorize command error:', error);
      return { success: false, output: `Failed to categorize article: ${error.message}` };
    }
  }

  async exportArticlesCommand(match) {
    const [, filePath] = match;
    try {
      const articles = await new Promise((resolve, reject) => {
        this.db.all('SELECT * FROM articles ORDER BY scraped_date DESC', (err, rows) => {
          if (err) reject(err); else resolve(rows);
        });
      });
      
      if (articles.length === 0) {
        return { success: true, output: 'No articles to export.' };
      }
      
      // Determine export format based on file extension
      const ext = path.extname(filePath).toLowerCase();
      let exportData;
      
      if (ext === '.json') {
        exportData = JSON.stringify(articles, null, 2);
      } else if (ext === '.csv') {
        // Convert to CSV format
        const headers = Object.keys(articles[0]).join(',');
        const rows = articles.map(article =>
          Object.values(article).map(value =>
            `"${String(value).replace(/"/g, '""')}"` // Escape quotes in CSV values
          ).join(',')
        );
        exportData = [headers, ...rows].join('\n');
      } else {
        return { success: false, output: 'Unsupported export format. Use .json or .csv file extension.' };
      }
      
      await fs.writeFile(filePath, exportData, 'utf8');
      return { success: true, output: `Exported ${articles.length} articles to ${filePath}` };
    } catch (error) {
      console.error('Export command error:', error);
      return { success: false, output: `Failed to export articles: ${error.message}` };
    }
  }

  async searchArticlesCommand(match) {
    const [, searchTerm] = match;
    try {
      const articles = await new Promise((resolve, reject) => {
        // Search in both title and content fields
        this.db.all(
          `SELECT id, title, source_domain, published_date
           FROM articles
           WHERE title LIKE ? OR content LIKE ?
           ORDER BY scraped_date DESC LIMIT 20`,
          [`%${searchTerm}%`, `%${searchTerm}%`],
          (err, rows) => {
            if (err) reject(err); else resolve(rows);
          }
        );
      });
      
      if (articles.length === 0) {
        return { success: true, output: `No articles found matching "${searchTerm}".` };
      }
      
      const output = articles.map(a =>
        `[${a.id}] ${a.title} (${a.source_domain}) - ${a.published_date || 'N/A'}`
      ).join('\n');
      
      return { success: true, output };
    } catch (error) {
      console.error('Search command error:', error);
      return { success: false, output: `Failed to search articles: ${error.message}` };
    }
  }
}

module.exports = ArticleScraperPlugin;
