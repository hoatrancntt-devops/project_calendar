const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  // Capture console messages
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
  
  await page.goto('http://localhost:4141', { waitUntil: 'networkidle0' });
  
  // Type username and password
  await page.type('input[placeholder="sctsadmin hoặc truly@company.com"]', 'sctsadmin');
  await page.type('input[type="password"]', 'A@q1w2e3r4t5!');
  
  // Click login button
  await page.click('button[type="submit"]');
  
  // Wait for navigation
  await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {});
  
  // Check the URL
  console.log("Current URL:", page.url());
  
  // Print HTML content if body is empty or to inspect DOM
  const bodyHTML = await page.evaluate(() => document.body.innerHTML);
  console.log("Body HTML Length:", bodyHTML.length);
  
  // If it's the dashboard, click "Cấu hình"
  if (page.url().includes('dashboard')) {
      const texts = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('button')).map(b => b.innerText);
      });
      console.log("Buttons on page:", texts);
  }
  
  await browser.close();
})();
