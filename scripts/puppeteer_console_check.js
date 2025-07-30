const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  // Capture console messages
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error(`CONSOLE ERROR: ${msg.text()}`);
    }
  });

  try {
    await page.goto('http://localhost:3000');
    // Wait for a short time to capture any initial errors
    await page.waitForTimeout(2000);
  } catch (error) {
    console.error(`Page navigation error: ${error}`);
  } finally {
    await browser.close();
  }
})();