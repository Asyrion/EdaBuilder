// Iteration 51: the zone levels from the paintings, one look for every people, halls that grow, glimwood and Gloam trees.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = []; const warns = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); if (/missing sprite|failed to load/.test(m.text())) warns.push(m.text()); });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
async function town(faction) {
  await page.fill('#t-seed', '42');
  if (faction) await page.evaluate((f) => { const sel = document.querySelector('#t-faction, select[name=faction]'); if (sel) { sel.value = f; sel.dispatchEvent(new Event('change')); } }, faction);
  await page.click('#t-new'); await page.waitForTimeout(300);
  await page.evaluate(() => { document.getElementById('help').classList.add('hidden'); window.__game.paused = true; });
  return page.evaluate(() => { const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding; s.milestone = 7; s.treasury = 90000; s.sectors.fill(1); s.lessonsSeen = ['districts'];
    for (let y = f.y - 10; y <= f.y + 12; y++) for (let x = f.x - 18; x <= f.x + 18; x++) { const i = y * s.w + x; if (s.terrain[i] !== 7) s.terrain[i] = 3; }
    w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 16, f.y + 2, f.x + 16, f.y + 2, false));
    w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 16, f.y + 6, f.x + 16, f.y + 6, false));
    const put = (k, x, y, lvl) => { const b = w.place(s, k, x, y, lvl); b.state = 'ok'; b.work = 0; b.lit = true; b.variant = (x + y) % 4; return b; };
    let x = f.x - 14;
    for (const lvl of [1, 2, 3]) for (let v = 0; v < 2; v++) put('hearth', x++, f.y + 1, lvl);
    x = f.x - 14; for (const lvl of [1, 2, 3]) for (let v = 0; v < 2; v++) put('craft', x++, f.y + 3, lvl);
    x = f.x - 14; for (const lvl of [2, 3]) for (let v = 0; v < 3; v++) put('market', x++, f.y + 5, lvl);
    x = f.x - 6; for (const lvl of [1, 2, 3]) for (let v = 0; v < 2; v++) put('arcane', x++, f.y + 5, lvl);
    put('guildhall', f.x + 2, f.y - 2); put('temple', f.x + 6, f.y - 4);
    for (let y = f.y + 8; y <= f.y + 12; y++) for (let xx = f.x - 16; xx <= f.x - 4; xx++) s.terrain[y * s.w + xx] = 5;
    for (let y = f.y + 8; y <= f.y + 12; y++) for (let xx = f.x + 6; xx <= f.x + 16; xx++) { s.terrain[y * s.w + xx] = 5; s.gloam[y * s.w + xx] = 1; }
    w.recomputeAll(s); g.renderer.invalidateAll(); g.select(null); g.ui.refresh();
    g.renderer.camera.centerOnTile(f.x - 4, f.y + 4); g.renderer.camera.setZoom(2); s.tick = 180;
    const names = ['hearth_l2_v0', 'craft_l1_v3', 'craft_l3_v2', 'arcane_l2_v1', 'market_l3_v3', 'glimwood_3', 'gloamtree_3'];
    return { faction: s.faction, missing: names.filter((n) => !w.atlas.has(n)), imported: w.atlas.imported.has('hearth_l2_v0'), glim: w.atlas.countVariants('glimwood_'), gloam: w.atlas.countVariants('gloamtree_'), hall: w.atlas.has('b_guildhall_s2') && w.atlas.has('b_temple_s1') };
  });
}
const v = await town(null);
console.log('vellish:', JSON.stringify(v));
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/iter51_zones_day.png' });
await page.evaluate(() => { const g = window.__game; g.state.tick = 630; g.renderer.invalidateAll(); });
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/iter51_zones_night.png' });
await page.evaluate(() => { const g = window.__game, s = g.state; s.tick = 180; s.milestone = 1; g.renderer.invalidateAll(); g.ui.refresh(); });
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/iter51_halls_hamlet.png', clip: { x: 700, y: 100, width: 700, height: 500 } });
const pass = v.missing.length === 0 && v.imported && v.glim >= 4 && v.gloam >= 4 && v.hall && warns.length === 0 && errors.length === 0;
console.log(pass ? 'PASS' : 'FAIL', 'errors', errors, 'warns', warns.slice(0, 5));
await browser.close();
