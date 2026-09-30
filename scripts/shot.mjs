// Playwright screenshot harness. Usage: node scripts/shot.mjs [scenario]
import { chromium } from 'playwright';
import fs from 'node:fs';

const scenario = process.argv[2] ?? 'town';
const url = process.env.URL ?? 'http://localhost:4173/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
await page.goto(url);
await page.waitForFunction(() => window.__game, null, { timeout: 20000 });
await page.evaluate(() => { window.__game.newGame(42, 'Thornwick'); document.getElementById('help').classList.add('hidden'); document.getElementById('title').classList.add('hidden'); });
await page.waitForTimeout(300);

async function shot(name) {
  await page.waitForTimeout(150);
  await page.screenshot({ path: `shots/${name}.png` });
  console.log('shot', name);
}

if (scenario === 'town' || scenario === 'night') {
  // build a town through the game's own action API
  await page.evaluate(async () => {
    const g = window.__game;
    const mod = await import('/src/sim/actions.ts').catch(() => null);
  });
  await page.evaluate(() => {
    const g = window.__game;
    const s = g.state;
    const A = window.__actions;
  });
}
await page.evaluate((scenario) => {
  const g = window.__game;
  const s = g.state;
  const { buildRoad, paintZone, placeBuilding, roadPath } = window.__wardlight.actions;
  const f = s.founding;
  const sx = f.x + 2, sy = f.y + 1;
  s.treasury = 200000;
  for (let k = 0; k < 4; k++) buildRoad(s, k === 1 ? 2 : 1, roadPath(sx - 14, sy + k * 5, sx + 14, sy + k * 5, false));
  for (let k = 0; k < 5; k++) buildRoad(s, 1, roadPath(sx - 14 + k * 7, sy, sx - 14 + k * 7, sy + 15, true));
  paintZone(s, 1, sx - 13, sy + 1, sx + 13, sy + 4);
  paintZone(s, 2, sx - 13, sy + 6, sx + 13, sy + 7);
  paintZone(s, 1, sx - 13, sy + 8, sx + 13, sy + 9);
  paintZone(s, 3, sx - 13, sy + 11, sx + 13, sy + 14);
  const place = (key, x, y) => { for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) { if (placeBuilding(s, key, x + dx, y + dy).ok) return; } };
  place('well', sx - 15, sy + 1); place('well', sx + 15, sy + 6); place('well', sx + 1, sy + 9);
  place('spire', sx + 4, sy + 1); place('spire', sx - 4, sy + 1); place('spire', sx - 3, sy + 6); place('spire', sx + 3, sy + 6); place('spire', sx + 3, sy + 11); place('spire', sx - 3, sy + 11);
  place('watchpost', sx, sy - 2); place('shrine', sx + 8, sy - 2);
  s.milestone = 4;
  place('boneyard', sx - 14, sy + 16); place('healer', sx + 14, sy + 16); place('garden', sx - 8, sy + 16); place('veshari', sx + 15, sy + 10); place('wardlantern', sx - 16, sy + 5); place('academy', sx - 17, sy + 10); place('square', sx + 15, sy - 1);
  s.milestone = 0;
  window.__wardlight.recomputeAll(s);
  g.renderer.invalidateAll();
}, scenario);
// run the sim
await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 900 * 25; i++) window.__wardlight.tick(g.state); window.__wardlight.recomputeAll(g.state); g.renderer.invalidateAll(); g.paused = true; });
await page.evaluate(() => { const g = window.__game; g.renderer.camera.centerOnTile(g.state.founding.x + 2, g.state.founding.y + 8); g.renderer.camera.setZoom(2); });
await shot(`${scenario}_day_z2`);
await page.evaluate(() => { window.__game.renderer.camera.setZoom(3); });
await shot(`${scenario}_day_z3`);
await page.evaluate(() => { window.__game.renderer.camera.setZoom(1); });
await shot(`${scenario}_day_z1`);
// night: advance ticks to night without simulating? set tick offset
await page.evaluate(() => { const g = window.__game; g.state.tick = Math.floor(g.state.tick / 900) * 900 + 630; g.renderer.camera.setZoom(2); });
await page.waitForTimeout(400);
await shot(`${scenario}_night_z2`);
await page.evaluate(() => { const g = window.__game; g.state.tick = Math.floor(g.state.tick / 900) * 900 + 440; g.view.overlay = 'mana'; g.ui.refreshViews(); });
await shot(`${scenario}_overlay_mana`);
await page.evaluate(() => { const g = window.__game; g.view.overlay = 'landvalue'; g.ui.refreshViews(); });
await shot(`${scenario}_overlay_lv`);
await page.evaluate(() => { const g = window.__game; g.view.overlay = null; g.ui.refreshViews(); g.tools.setTool({ kind: 'build', key: 'academy' }); g.view.hover = [g.state.founding.x + 6, g.state.founding.y + 20]; g.tools.updatePreview(); g.ui.toggleBudget(true); });
await shot(`${scenario}_ui_build`);
console.log('errors:', errors.slice(0, 10));
await browser.close();
