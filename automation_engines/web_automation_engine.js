/**
 * Web Automation Engine
 * 
 * Provides intelligent web scraping, content extraction, and browser automation
 * capabilities for the AI Terminal automation arsenal.
 */

const puppeteer = require('puppeteer');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');
const { URL } = require('url');

class WebAutomationEngine {
  constructor(options = {}) {
    this.options = {
      headless: options.headless !== false,
      timeout: options.timeout || 30000,
      viewport: options.viewport || { width: 1920, height: 1080 },
      userAgent: options.userAgent || 'AI-Terminal-WebBot/1.0',
      maxRetries: options.maxRetries || 3,
      ...options
    };
    
    this.browser = null;
    this.activeSessions = new Map();
    this.contentCache = new Map();
  }

  /**
   * Initialize browser instance
   */
  async initBrowser() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: this.options.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor'
        ]
      });
    }
    return this.browser;
  }

  /**
   * Scrape content from a web page with intelligent extraction
   */
  async scrapeContent(params) {
    const { url, selector, format = 'text', extractLinks = false, screenshot = false } = params;
    
    try {
      // Check cache first
      const cacheKey = `${url}-${selector}-${format}`;
      if (this.contentCache.has(cacheKey)) {
        return this.contentCache.get(cacheKey);
      }

      const browser = await this.initBrowser();
      const page = await browser.newPage();
      
      await page.setViewport(this.options.viewport);
      await page.setUserAgent(this.options.userAgent);
      
      // Navigate to page
      const response = await page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: this.options.timeout 
      });

      if (!response.ok()) {
        throw new Error(`HTTP ${response.status()}: ${response.statusText()}`);
      }

      let result = {
        url,
        timestamp: new Date().toISOString(),
        status: response.status()
      };

      // Extract content based on selector and format
      if (selector) {
        result.content = await this.extractBySelector(page, selector, format);
      } else {
        result.content = await this.extractIntelligentContent(page, format);
      }

      // Extract links if requested
      if (extractLinks) {
        result.links = await this.extractLinks(page, url);
      }

      // Take screenshot if requested
      if (screenshot) {
        const screenshotPath = `./screenshots/screenshot-${Date.now()}.png`;
        await fs.mkdir('./screenshots', { recursive: true });
        await page.screenshot({ path: screenshotPath, fullPage: true });
        result.screenshot = screenshotPath;
      }

      // Analyze page metadata
      result.metadata = await this.extractMetadata(page);

      await page.close();

      // Cache result
      this.contentCache.set(cacheKey, result);
      
      return result;

    } catch (error) {
      return {
        success: false,
        error: error.message,
        url
      };
    }
  }

  /**
   * Extract content by CSS selector
   */
  async extractBySelector(page, selector, format) {
    return await page.evaluate((sel, fmt) => {
      const elements = document.querySelectorAll(sel);
      const results = [];

      elements.forEach(el => {
        switch (fmt) {
          case 'text':
            results.push(el.textContent.trim());
            break;
          case 'html':
            results.push(el.outerHTML);
            break;
          case 'json':
            results.push({
              tag: el.tagName.toLowerCase(),
              text: el.textContent.trim(),
              attributes: Array.from(el.attributes).reduce((acc, attr) => {
                acc[attr.name] = attr.value;
                return acc;
              }, {})
            });
            break;
        }
      });

      return results.length === 1 ? results[0] : results;
    }, selector, format);
  }

  /**
   * Intelligent content extraction without specific selectors
   */
  async extractIntelligentContent(page, format) {
    return await page.evaluate((fmt) => {
      // Remove script and style elements
      const scripts = document.querySelectorAll('script, style, nav, footer, aside');
      scripts.forEach(el => el.remove());

      // Find main content area
      const contentSelectors = [
        'main',
        'article',
        '[role="main"]',
        '.content',
        '.main-content',
        '#content',
        '#main'
      ];

      let mainContent = null;
      for (const selector of contentSelectors) {
        mainContent = document.querySelector(selector);
        if (mainContent) break;
      }

      // Fallback to body if no main content found
      if (!mainContent) {
        mainContent = document.body;
      }

      switch (fmt) {
        case 'text':
          return mainContent.textContent.trim().replace(/\s+/g, ' ');
        case 'html':
          return mainContent.innerHTML;
        case 'json':
          return {
            title: document.title,
            headings: Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(h => ({
              level: parseInt(h.tagName.charAt(1)),
              text: h.textContent.trim()
            })),
            paragraphs: Array.from(mainContent.querySelectorAll('p')).map(p => p.textContent.trim()),
            lists: Array.from(mainContent.querySelectorAll('ul, ol')).map(list => ({
              type: list.tagName.toLowerCase(),
              items: Array.from(list.querySelectorAll('li')).map(li => li.textContent.trim())
            }))
          };
        default:
          return mainContent.textContent.trim();
      }
    }, format);
  }

  /**
   * Extract all links from page
   */
  async extractLinks(page, baseUrl) {
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href]')).map(a => ({
        text: a.textContent.trim(),
        href: a.href,
        title: a.title || null
      }));
    });

    // Filter and categorize links
    const base = new URL(baseUrl);
    return {
      internal: links.filter(link => {
        try {
          return new URL(link.href).hostname === base.hostname;
        } catch {
          return false;
        }
      }),
      external: links.filter(link => {
        try {
          return new URL(link.href).hostname !== base.hostname;
        } catch {
          return false;
        }
      }),
      total: links.length
    };
  }

  /**
   * Extract page metadata
   */
  async extractMetadata(page) {
    return await page.evaluate(() => {
      const getMetaContent = (name) => {
        const meta = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
        return meta ? meta.content : null;
      };

      return {
        title: document.title,
        description: getMetaContent('description'),
        keywords: getMetaContent('keywords'),
        author: getMetaContent('author'),
        ogTitle: getMetaContent('og:title'),
        ogDescription: getMetaContent('og:description'),
        ogImage: getMetaContent('og:image'),
        twitterCard: getMetaContent('twitter:card'),
        canonical: document.querySelector('link[rel="canonical"]')?.href,
        lang: document.documentElement.lang,
        charset: document.characterSet
      };
    });
  }

  /**
   * Perform automated interactions with web pages
   */
  async automateInteraction(params) {
    const { url, actions, waitForSelector, screenshot = false } = params;
    
    try {
      const browser = await this.initBrowser();
      const page = await browser.newPage();
      
      await page.setViewport(this.options.viewport);
      await page.goto(url, { waitUntil: 'networkidle2' });

      const results = [];

      for (const action of actions) {
        try {
          const actionResult = await this.executePageAction(page, action);
          results.push(actionResult);
          
          // Wait between actions
          if (action.delay) {
            await page.waitForTimeout(action.delay);
          }
        } catch (error) {
          results.push({
            action: action.type,
            success: false,
            error: error.message
          });
        }
      }

      // Wait for specific selector if provided
      if (waitForSelector) {
        await page.waitForSelector(waitForSelector, { timeout: this.options.timeout });
      }

      // Take screenshot if requested
      let screenshotPath = null;
      if (screenshot) {
        screenshotPath = `./screenshots/interaction-${Date.now()}.png`;
        await fs.mkdir('./screenshots', { recursive: true });
        await page.screenshot({ path: screenshotPath, fullPage: true });
      }

      await page.close();

      return {
        success: true,
        url,
        actions: results,
        screenshot: screenshotPath,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        url
      };
    }
  }

  /**
   * Execute individual page action
   */
  async executePageAction(page, action) {
    switch (action.type) {
      case 'click':
        await page.click(action.selector);
        return { action: 'click', selector: action.selector, success: true };

      case 'type':
        await page.type(action.selector, action.text);
        return { action: 'type', selector: action.selector, text: action.text, success: true };

      case 'select':
        await page.select(action.selector, action.value);
        return { action: 'select', selector: action.selector, value: action.value, success: true };

      case 'scroll':
        await page.evaluate((pixels) => {
          window.scrollBy(0, pixels);
        }, action.pixels || 500);
        return { action: 'scroll', pixels: action.pixels, success: true };

      case 'wait':
        await page.waitForTimeout(action.duration || 1000);
        return { action: 'wait', duration: action.duration, success: true };

      case 'evaluate':
        const result = await page.evaluate(action.script);
        return { action: 'evaluate', result, success: true };

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  /**
   * Monitor web page for changes
   */
  async monitorPage(params) {
    const { url, selector, interval = 30000, maxChecks = 10 } = params;
    
    const browser = await this.initBrowser();
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });

    const changes = [];
    let previousContent = null;
    let checkCount = 0;

    const monitor = setInterval(async () => {
      try {
        checkCount++;
        
        const currentContent = selector 
          ? await page.$eval(selector, el => el.textContent.trim())
          : await page.evaluate(() => document.body.textContent.trim());

        if (previousContent && currentContent !== previousContent) {
          changes.push({
            timestamp: new Date().toISOString(),
            previousContent: previousContent.substring(0, 200) + '...',
            currentContent: currentContent.substring(0, 200) + '...',
            changeDetected: true
          });
        }

        previousContent = currentContent;

        if (checkCount >= maxChecks) {
          clearInterval(monitor);
          await page.close();
        }

      } catch (error) {
        changes.push({
          timestamp: new Date().toISOString(),
          error: error.message
        });
      }
    }, interval);

    return new Promise((resolve) => {
      setTimeout(() => {
        clearInterval(monitor);
        page.close();
        resolve({
          url,
          totalChecks: checkCount,
          changesDetected: changes.length,
          changes
        });
      }, interval * maxChecks);
    });
  }

  /**
   * Batch process multiple URLs
   */
  async batchProcess(urls, operation, concurrency = 3) {
    const results = [];
    const chunks = [];
    
    // Split URLs into chunks for concurrent processing
    for (let i = 0; i < urls.length; i += concurrency) {
      chunks.push(urls.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
      const chunkPromises = chunk.map(async (url) => {
        try {
          return await operation(url);
        } catch (error) {
          return { url, error: error.message, success: false };
        }
      });

      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);
    }

    return {
      totalProcessed: urls.length,
      successful: results.filter(r => r.success !== false).length,
      failed: results.filter(r => r.success === false).length,
      results
    };
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    this.contentCache.clear();
    this.activeSessions.clear();
  }

  /**
   * Get engine statistics
   */
  getStats() {
    return {
      cacheSize: this.contentCache.size,
      activeSessions: this.activeSessions.size,
      browserActive: !!this.browser
    };
  }
}

module.exports = WebAutomationEngine;