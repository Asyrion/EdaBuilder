import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message, e.stack?.split('\n').slice(0,4).join('\n')));
page.on('console', (m) => console.log('CONSOLE', m.type(), m.text()));
await page.goto('http://localhost:4173/');
await page.waitForTimeout(4000);
console.log('game?', await page.evaluate(() => !!window.__game));
await browser.close();
