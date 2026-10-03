// Iteration 66 (keyboard focus): the game worked from the keyboard. Tab from the page start through a sensible order (the skip
// link, the top bar, the toolbar's two roving stops, the quick buttons, the Ledger, the panels, the map); Space on a focused button
// presses it and does not pause; the arrows on the toolbar's tabs move between them and not the camera; a dialog opened by Enter takes
// focus, keeps Tab inside and gives it back on Escape; a tale lands on its first choice; F6 cycles the regions; V toggles the Info
// views; the map, focused, still pans by the arrows. Screenshots of the focus ring at each place; no errors.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game && window.__wardlight && window.__wardlight.atlas);
await page.waitForTimeout(700);
const where = () => page.evaluate(() => {
  const a = document.activeElement;
  if (!a || a === document.body) return 'body';
  const region = ['topbar', 'toolbar', 'tasks', 'info', 'views', 'minimap', 'budget', 'event', 'title', 'menu'].find((id) => document.getElementById(id)?.contains(a)) ?? (a.id === 'game' ? 'map' : '?');
  const label = a.getAttribute('aria-label') || a.textContent?.trim().slice(0, 24) || a.id || a.tagName;
  return `${region}:${label}`;
});
const out = {};
out.titleFocus = await where(); // the title screen is a dialog: focus starts inside it
await page.evaluate(() => {
  const g = window.__game;
  g.newGame(66, 'Keywick', 'valley', 'vellish');
  g.state.lessonsSeen = ['districts'];
  document.getElementById('help')?.classList.add('hidden');
  document.getElementById('title')?.classList.add('hidden');
  g.paused = true;
  g.ui.refresh();
  document.activeElement?.blur?.();
});
await page.waitForTimeout(300);
// Tab from the page start
const order = [];
for (let k = 0; k < 40; k++) { await page.keyboard.press('Tab'); order.push(await where()); }
out.viewsStillHidden = await page.evaluate(() => document.getElementById('views').classList.contains('hidden'));
console.log('tab order:', order.join(' → '));
// the screenshot of the skip link and the first top-bar button come from a fresh Tab
for (let k = 0; k < 40 && !(await where()).includes('Skip'); k++) await page.keyboard.press('Tab');
out.skipLink = await where();
await page.screenshot({ path: 'shots/iter66_focus_skiplink.png', clip: { x: 0, y: 0, width: 520, height: 120 } });
// Space on a focused speed button presses it and does not toggle the pause
await page.evaluate(() => { window.__game.paused = true; });
await page.focus('#sp-1');
await page.keyboard.press('Space');
out.spaceOnButton = await page.evaluate(() => ({ paused: window.__game.paused, speed: window.__game.speed }));
await page.focus('#btn-budget');
await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab'); // focus-visible by keyboard
await page.screenshot({ path: 'shots/iter66_focus_topbar.png', clip: { x: 560, y: 0, width: 720, height: 60 } });
// the toolbar's tabs: the arrows move between them and open each, the camera stays
await page.focus('#toolbar .tabs button.active');
const cam0 = await page.evaluate(() => [window.__game.renderer.camera.cx, window.__game.renderer.camera.cy]);
const tab0 = await where();
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(200);
const tab1 = await where();
const cam1 = await page.evaluate(() => [window.__game.renderer.camera.cx, window.__game.renderer.camera.cy]);
out.tabs = { from: tab0, to: tab1, category: await page.evaluate(() => document.querySelector('#toolbar .tabs button.active')?.textContent), cameraMoved: cam0.join() !== cam1.join() };
await page.screenshot({ path: 'shots/iter66_focus_tab.png', clip: { x: 0, y: 40, width: 300, height: 220 } });
// into the items: Tab, then the arrows, then Enter picks the tool
await page.keyboard.press('Tab');
const item0 = await where();
await page.keyboard.press('ArrowRight');
const item1 = await where();
await page.keyboard.press('Enter');
await page.waitForTimeout(150);
out.items = { first: item0, next: item1, afterEnter: await where(), tool: await page.evaluate(() => JSON.stringify(window.__game.tools.tool)) };
await page.screenshot({ path: 'shots/iter66_focus_item.png', clip: { x: 0, y: 40, width: 300, height: 220 } });
// the Budget by Enter: focus inside, Tab kept inside, Escape back to the button
await page.focus('#btn-budget');
await page.keyboard.press('Enter');
await page.waitForTimeout(250);
const inBudget = await where();
let stayed = true;
for (let k = 0; k < 30; k++) { await page.keyboard.press('Tab'); if (!(await where()).startsWith('budget')) stayed = false; }
await page.screenshot({ path: 'shots/iter66_focus_dialog.png' });
await page.keyboard.press('Escape');
await page.waitForTimeout(250);
out.budget = { opened: inBudget, tabStayedInside: stayed, afterEscape: await where(), closed: await page.evaluate(() => document.getElementById('budget').classList.contains('hidden')) };
// a tale lands on its first choice
await page.evaluate(() => {
  const s = window.__game.state, e = window.__wardlight.ALL_EVENTS.find((x) => x.id === 'caravan') ?? window.__wardlight.ALL_EVENTS[0];
  s.pendingEvent = { id: e.id, title: e.title, text: e.text, choices: e.choices.map((c) => ({ label: c.label, desc: typeof c.desc === 'function' ? c.desc(s) : c.desc })) };
  window.__game.ui.refresh();
});
await page.waitForTimeout(300);
out.tale = await where();
await page.screenshot({ path: 'shots/iter66_focus_tale.png' });
await page.evaluate(() => { const s = window.__game.state; window.__wardlight.resolveEvent(s, 0); window.__game.ui.refresh(); });
await page.waitForTimeout(200);
// F6 through the regions
await page.evaluate(() => document.activeElement?.blur?.());
const regions = [];
for (let k = 0; k < 8; k++) { await page.keyboard.press('F6'); regions.push((await where()).split(':')[0]); }
out.f6 = regions.join(' → ');
// the map: focused, the arrows pan and V toggles the Info views; on a button the arrows do not pan
await page.focus('#game');
const c0 = await page.evaluate(() => window.__game.renderer.camera.cx);
await page.keyboard.down('ArrowRight'); await page.waitForTimeout(300); await page.keyboard.up('ArrowRight');
const c1 = await page.evaluate(() => window.__game.renderer.camera.cx);
await page.keyboard.press('v');
out.map = { panned: c0 !== c1, viewsShown: await page.evaluate(() => !document.getElementById('views').classList.contains('hidden')) };
await page.keyboard.press('v');
await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
await page.screenshot({ path: 'shots/iter66_focus_map.png' });
await page.focus('#btn-budget');
const b0 = await page.evaluate(() => window.__game.renderer.camera.cx);
await page.keyboard.down('ArrowRight'); await page.waitForTimeout(300); await page.keyboard.up('ArrowRight');
out.arrowsOnButtonPan = (await page.evaluate(() => window.__game.renderer.camera.cx)) !== b0;
console.log(JSON.stringify(out, null, 1));
console.log('errors', errors.length ? errors : 'none');
await browser.close();
