import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.evaluate(() => { window.__game.newGame(21, 'Cue'); document.getElementById('help').classList.add('hidden'); document.getElementById('title').classList.add('hidden'); });
await page.mouse.click(700, 500);
await page.waitForTimeout(500);
console.log(await page.evaluate(() => {
  const g = window.__game, s = g.state, W = window.__wardlight;
  const calls = window.__cues = []; const orig = g.audio.cue.bind(g.audio); g.audio.cue = (k, pan, vol) => { calls.push(`${k}@${pan.toFixed(2)}/${vol.toFixed(2)}`); orig(k, pan, vol); };
  s.wyrm.state = 'awake'; W.wyrm.refuse(s);
  s.storms.push({ x: s.founding.x + 3, y: s.founding.y + 3, until: s.day + 4, vx: 0, vy: 0 });
  for (let i = 0; i < 5; i++) W.tick(s);
  g.renderer.camera.centerOnTile(s.founding.x, s.founding.y);
  return `ctx=${g.audio.ctx && g.audio.ctx.state} cues so far: ${calls.join(' ')}`;
}));
await page.waitForTimeout(1500);
console.log('cues after the loop ran:', await page.evaluate(() => window.__cues.join(' ')));
// direct voice smoke test: every cue kind plays without throwing
console.log(await page.evaluate(() => { const g = window.__game; const kinds = ['howl', 'roar', 'growl', 'horn', 'bell', 'song', 'storm', 'stomp', 'rain']; const out = []; for (const k of kinds) { try { g.audio.cue(k, 0.3, 0.8); out.push(`${k}:ok`); } catch (e) { out.push(`${k}:${e.message}`); } } return out.join(' '); }));
console.log('errors', errors);
await browser.close();
