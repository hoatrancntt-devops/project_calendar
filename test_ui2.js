const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
  
  await page.goto('http://localhost:4141', { waitUntil: 'networkidle0' });
  
  // Set localStorage and reload directly
  await page.evaluate(() => {
    localStorage.setItem('isAuthenticated', 'true');
    localStorage.setItem('currentUser', JSON.stringify({
      email: 'admin@scts.com.vn',
      username: 'sctsadmin',
      name: 'SCTS Administrator',
      role: 'admin'
    }));
  });
  
  await page.goto('http://localhost:4141/dashboard', { waitUntil: 'networkidle0' });
  
  // See what is rendered
  const bodyHTML = await page.evaluate(() => document.body.innerHTML);
  console.log("Body length:", bodyHTML.length);
  
  // Read root element
  const rootHTML = await page.evaluate(() => {
    const root = document.getElementById('root');
    return root ? root.innerHTML : 'NO_ROOT';
  });
  console.log("Root length:", rootHTML.length);
  if (rootHTML.length < 100) {
      console.log("Root content:", rootHTML);
  }
  
  // Check if we can click the settings button
  try {
      await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const configBtn = btns.find(b => b.innerText.includes('Cấu hình'));
          if(configBtn) configBtn.click();
      });
      // wait a bit
      await new Promise(r => setTimeout(r, 1000));
      const rootHTMLAfter = await page.evaluate(() => document.getElementById('root').innerHTML);
      console.log("Root length after clicking Cấu hình:", rootHTMLAfter.length);
      if (rootHTMLAfter.length < 100) {
          console.log("Root content after:", rootHTMLAfter);
      }
  } catch(e) {
      console.log("Failed to click config btn", e);
  }
  
  await browser.close();
})();
