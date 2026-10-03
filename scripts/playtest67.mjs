// Iteration 67 (replays): a charter played through the real UI (roads and zones dragged with the mouse, a Well from the toolbar, a
// bulldoze drag and Ctrl+Z, the Budget's tax slider, an edict's checkbox, tales answered by clicking, the speed buttons), then
// Menu → Export replay; scripts/replay.ts on the downloaded file must say MATCH; the same file through title → Watch a replay, run with
// Skip to end, must end on the match toast. Screenshots of the REPLAY badge and the end toast; no errors.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 760 }, acceptDownloads: true });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game && window.__wardlight && window.__wardlight.atlas);
await page.waitForTimeout(500);
// a new charter from the title screen
await page.fill('#t-seed', '67');
await page.click('#t-new');
await page.waitForTimeout(300);
await page.evaluate(() => document.getElementById('help')?.classList.add('hidden'));
const g = (fn, arg) => page.evaluate(fn, arg);
const f = await g(() => window.__game.state.founding);
const tileToScreen = (x, y) => g(([x, y]) => { const cam = window.__game.renderer.camera; const wx = (x - y) * 16, wy = (x + y) * 8 + 8; return [(wx - cam.left) * cam.zoom, (wy - cam.top) * cam.zoom]; }, [x, y]);
await g(([x, y]) => { const c = window.__game.renderer.camera; c.centerOnTile(x, y); c.setZoom(2); }, [f.x + 2, f.y + 5]);
const drag = async (a, b) => {
  const [ax, ay] = await tileToScreen(a[0], a[1]);
  const [bx, by] = await tileToScreen(b[0], b[1]);
  await page.mouse.move(ax, ay); await page.mouse.down(); await page.mouse.move(bx, by, { steps: 8 }); await page.mouse.up();
  await page.waitForTimeout(120);
};
const clickTile = async (x, y) => { const [ax, ay] = await tileToScreen(x, y); await page.mouse.click(ax, ay); await page.waitForTimeout(120); };
const pick = async (tab, item) => { await page.click(`#toolbar .tabs button:has-text("${tab}")`); await page.click(`#toolbar .items button:has-text("${item}")`); };
// tales are answered by clicking their first choice; a lesson card is closed by its button
let tales = 0;
const answer = async () => {
  for (let k = 0; k < 6; k++) {
    if (await page.isVisible('#event .choices button')) { await page.click('#event .choices button >> nth=0'); tales++; await page.waitForTimeout(120); continue; }
    if (await page.isVisible('#event button')) { await page.click('#event button >> nth=0'); await page.waitForTimeout(120); continue; }
    if (await page.isVisible('#lesson-close')) { await page.click('#lesson-close'); await page.waitForTimeout(80); continue; }
    break;
  }
};
/** Runs the game until the day, at a speed: 1 and 3 by the top bar's buttons; higher ones only to save wall time (the frame cap holds). */
const runTo = async (day, speed) => {
  if (speed <= 3) await page.click(`#sp-${speed}`); else await g((v) => { window.__game.paused = false; window.__game.speed = v; }, speed);
  for (let k = 0; k < 2000; k++) {
    await answer();
    if ((await g(() => window.__game.state.day)) >= day) break;
    await page.waitForTimeout(150);
  }
  await page.click('#sp-0');
  await answer();
  console.log('  day', await g(() => window.__game.state.day));
};
await page.click('#sp-0');
// the main street and a side street, dragged
await pick('Roads', 'Dirt Track');
await drag([f.x - 6, f.y + 3], [f.x + 10, f.y + 3]);
await runTo(1, 3);
await drag([f.x + 4, f.y + 3], [f.x + 4, f.y + 12]);
await pick('Zones', 'Hearth');
await drag([f.x - 5, f.y + 4], [f.x + 3, f.y + 5]);
await runTo(2, 1);
await pick('Zones', 'Market');
await drag([f.x + 5, f.y + 6], [f.x + 6, f.y + 10]);
await pick('Water', 'Well');
await clickTile(f.x + 1, f.y + 1);
await pick('Ley', 'Ley Spire');
await clickTile(f.x - 2, f.y + 2);
await runTo(4, 3);
// a bulldoze drag along the street's west end, then Ctrl+Z
await page.focus('#game');
await page.keyboard.press('b');
await drag([f.x - 6, f.y + 3], [f.x - 4, f.y + 3]);
const afterBulldoze = await g(([x, y]) => window.__game.state.road[y * window.__game.state.w + x], [f.x - 6, f.y + 3]);
await page.keyboard.press('Escape');
await page.focus('#game');
await page.keyboard.press('Control+z');
await page.waitForTimeout(150);
const afterUndo = await g(([x, y]) => window.__game.state.road[y * window.__game.state.w + x], [f.x - 6, f.y + 3]);
await runTo(6, 60);
// the Budget's Hearth tithe slider, by the keyboard
await page.click('#btn-budget');
await page.waitForTimeout(200);
await page.focus('#budget input[data-zone="hearth"]');
await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
const tax = await g(() => window.__game.state.taxRates.hearth);
await page.keyboard.press('Escape'); // a dialog closes on Escape from any of its controls
await page.waitForTimeout(150);
const escapeClosed = await page.isHidden('#budget');
if (!escapeClosed) await page.click('#b-close');
await runTo(10, 60);
// an edict by its checkbox
await page.click('#btn-edicts');
await page.waitForTimeout(200);
const edict = await page.$('#edicts input[type=checkbox]:not([disabled])');
let edictKey = null;
if (edict) { edictKey = await edict.getAttribute('data-key'); await edict.click(); }
await page.waitForTimeout(150);
await page.click('#e-close');
await runTo(16, 60);
// more homes, then the rest at mixed speeds
await pick('Zones', 'Hearth');
await drag([f.x + 5, f.y + 4], [f.x + 9, f.y + 5]);
await runTo(18, 3);
await pick('Roads', 'Dirt Track');
await drag([f.x - 2, f.y + 3], [f.x - 2, f.y + 10]);
await runTo(30, 60);
await page.screenshot({ path: 'shots/iter67_played.png' });
const live = await g(() => { const s = window.__game.state; return { spires: s.buildings.filter((b) => b && b.kind === 'spire').length, day: s.day, tick: s.tick, pop: s.population, treasury: Math.round(s.treasury), commands: window.__game.runner.log.length, ops: [...new Set(window.__game.runner.log.map((c) => c.op))].join(',') }; });
console.log('played:', JSON.stringify({ ...live, tales, afterBulldoze, afterUndo, tax, edictKey, escapeClosed }));
// Menu → Export replay
await page.click('#btn-menu');
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#m-replay')]);
const file = 'shots/iter67.wardlight-replay.json';
await dl.saveAs(file);
console.log('exported:', dl.suggestedFilename());
if (await page.isVisible('#menu')) await page.click('#m-close');
// the headless verifier
let verifier = '';
let verifierOk = false;
try { verifier = execFileSync('npx', ['tsx', 'scripts/replay.ts', file], { encoding: 'utf8' }); verifierOk = /MATCH/.test(verifier); } catch (e) { verifier = String(e.stdout ?? e); }
console.log('replay.ts:', verifier.trim().split('\n').slice(-3).join(' | '));
// the same file through the title screen
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game && window.__wardlight && window.__wardlight.atlas);
await page.waitForTimeout(400);
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#t-replay')]);
await chooser.setFiles(file);
await page.waitForFunction(() => !!window.__game.replay);
await page.evaluate(() => document.getElementById('help')?.classList.add('hidden'));
await page.click('#sp-3');
await page.waitForTimeout(4000);
const badge = await page.isVisible('#tb-replay');
// the player's hands are off: a road dragged during the replay changes nothing
const roads0 = await g(() => window.__game.state.road.reduce((a, r) => a + (r ? 1 : 0), 0));
await pick('Roads', 'Dirt Track');
const f2 = await g(() => window.__game.state.founding);
await page.click('#sp-0');
await drag([f2.x - 8, f2.y - 4], [f2.x + 8, f2.y - 4]);
const roads1 = await g(() => window.__game.state.road.reduce((a, r) => a + (r ? 1 : 0), 0));
await page.keyboard.press('Escape');
await page.screenshot({ path: 'shots/iter67_replay_badge.png' });
await page.screenshot({ path: 'shots/iter67_replay_badge_bar.png', clip: { x: 0, y: 0, width: 1280, height: 60 } });
await page.click('#tb-skip');
await page.waitForFunction(() => !!window.__game.replayEnded, null, { timeout: 300_000 });
await page.waitForTimeout(300);
const ended = await g(() => ({ ...window.__game.replayEnded, day: window.__game.state.day, toast: document.querySelector('#toast')?.textContent?.replace(/\s+/g, ' ').trim() }));
console.log('replay in the browser:', JSON.stringify(ended));
await page.screenshot({ path: 'shots/iter67_replay_end.png' });
const pass = escapeClosed && live.spires > 0 && live.pop >= 10 && live.day >= 30 && live.commands > 10 && afterBulldoze === 0 && afterUndo > 0 && tax !== 10 && verifierOk && badge && roads1 === roads0 && ended.ok && /matches its recording/.test(ended.toast ?? '') && errors.length === 0;
console.log(pass ? 'PASS' : 'FAIL', 'errors', errors);
await browser.close();
process.exitCode = pass ? 0 : 1;
