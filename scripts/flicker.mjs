// Measures frame-to-frame pixel change at night with the sim paused (only render-time animation runs).
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.evaluate(() => { window.__game.newGame(42, 'Thornwick'); document.getElementById('help').classList.add('hidden'); document.getElementById('title').classList.add('hidden'); });
await page.evaluate(() => { const g = window.__game, W = window.__wardlight; const bot = new W.Bot(g.state); for (let d = 0; d < 40; d++) { for (let i = 0; i < 900; i++) W.tick(g.state); bot.step(); } W.recomputeAll(g.state); g.renderer.invalidateAll(); g.paused = true; g.state.tick = Math.floor(g.state.tick / 900) * 900 + 640; g.renderer.camera.centerOnTile(g.state.founding.x + 2, g.state.founding.y + 6); g.renderer.camera.setZoom(2); document.getElementById('ui').style.display = 'none'; });
await page.waitForTimeout(1500);
const res = await page.evaluate(() => new Promise((resolve) => {
  const c = document.getElementById('game');
  const off = document.createElement('canvas'); off.width = c.width; off.height = c.height;
  const octx = off.getContext('2d');
  let prev = null; const changes = []; let n = 0;
  function f() {
    octx.drawImage(c, 0, 0);
    const d = octx.getImageData(0, 0, off.width, off.height).data;
    if (prev) { let big = 0; for (let i = 0; i < d.length; i += 4) { const dl = Math.abs(d[i] - prev[i]) + Math.abs(d[i + 1] - prev[i + 1]) + Math.abs(d[i + 2] - prev[i + 2]); if (dl > 60) big++; } changes.push(big); }
    prev = d;
    if (++n < 12) requestAnimationFrame(f); else resolve({ particles: window.__game.renderer.particles.list.length, changes });
  }
  requestAnimationFrame(f);
}));
console.log('particles', res.particles, 'pixels changed >60 per frame:', res.changes.join(' '));
await browser.close();
