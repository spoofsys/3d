const puppeteer = require('puppeteer-core');
const path = require('path');

(async () => {
  console.log('Launching headless Chrome...');
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-gl=angle',
      '--use-angle=swiftshader-webgl',
      '--enable-webgl',
      '--window-size=1440,900'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.error('BROWSER ERROR:', err));

  console.log('Navigating to http://localhost:8080/index.html ...');
  await page.goto('http://localhost:8080/index.html', { waitUntil: 'networkidle2', timeout: 30000 });

  // Wait for loading overlay to be hidden
  console.log('Waiting for loader overlay to disappear...');
  await page.waitForFunction(() => {
    const overlay = document.getElementById('loader-overlay');
    return overlay && overlay.classList.contains('hidden');
  }, { timeout: 30000 });

  console.log('Loader finished! Waiting 3 seconds for WebGL frame stabilization...');
  await new Promise(r => setTimeout(r, 3000));

  // 1. Capture 0% assembled body
  await page.screenshot({ path: 'screenshot_assembled_0pct.png' });
  console.log('Saved screenshot_assembled_0pct.png');

  // 2. Drag slider to 47%
  console.log('Moving slider to 47%...');
  await page.evaluate(() => {
    const slider = document.getElementById('explode-slider');
    slider.value = 47;
    slider.dispatchEvent(new Event('input'));
  });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: 'screenshot_separated_47pct.png' });
  console.log('Saved screenshot_separated_47pct.png');

  // 3. Drag slider to 100%
  console.log('Moving slider to 100% (Knolling grid)...');
  await page.evaluate(() => {
    const slider = document.getElementById('explode-slider');
    slider.value = 100;
    slider.dispatchEvent(new Event('input'));
  });
  await new Promise(r => setTimeout(r, 2500));
  await page.screenshot({ path: 'screenshot_knolled_100pct.png' });
  console.log('Saved screenshot_knolled_100pct.png');

  // 4. Click a part in the knolling matrix to verify piece inspection
  console.log('Clicking center of knolling matrix to test selection...');
  await page.mouse.click(720, 450);
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: 'screenshot_selected_part.png' });
  console.log('Saved screenshot_selected_part.png');

  await browser.close();
  console.log('Browser verification completed successfully!');
})();
