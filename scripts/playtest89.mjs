// Iteration 89 (the dev board, part 3, DESIGN 4.120). Two parts:
//  BOARD: the board on http://127.0.0.1:8771, started with a fake `claude` first on PATH (FAKES=<dir>): a building's Art
//   panel (brief, redraft, Refine with Claude, saved and reopened), the paintings importer (a painting dropped, an island
//   picked, the entry added, the import run, the sprite on the card, marked checked), the Tripo hand-off's task, the text
//   tabs (text only), an edict's text edited on the board read by the game's code, then undone.
//   Leaves art/, public/art/ and inspirations/board/ changed: revert with
//   git checkout art public/art && rm -rf inspirations/board art/prompts/b_quarry.json
//  GAME (GAME=1): the Edicts panel of this build (port 4173) against main's (4174) for every people: the same text.
//   shots/iter89_{prompt,refined,sheet,imported,handoff,arttab,text,edicts}.png
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium' });
const errors = [], out = {};
const watch = (page, tag) => { page.on('pageerror', (e) => errors.push(`${tag}: ${e}`)); page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(`${tag} console: ${m.text()}`); }); };

if (process.env.BOARD !== '0') {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  watch(page, 'board');
  const shot = (k) => page.screenshot({ path: `shots/iter89_${k}.png`, fullPage: true });
  page.on('dialog', (d) => d.accept());
  await page.goto('http://127.0.0.1:8771/');
  await page.waitForSelector('[data-tab=buildings]');
  await page.click('[data-tab=buildings]');
  await page.fill('#q', 'quarry'); await page.waitForTimeout(400);
  await page.click('[data-art^="b_quarry|"]');
  await page.waitForSelector('#ab');
  await page.fill('#ab', 'A Grimmen quarry cut into a grey hill: a stepped pit, a timber crane, blocks on a sledge.');
  await page.click('[data-art-redraft]');
  await page.waitForFunction(() => /stepped pit/.test(document.querySelector('#ad').textContent));
  out.draftHasRules = await page.$eval('#ad', (e) => /white background/.test(e.textContent) && /right-hand face/.test(e.textContent));
  await shot('prompt');
  await page.click('[data-art-refine]');
  await page.waitForFunction(() => /Claude's note/.test(document.querySelector('#anote')?.textContent ?? ''), null, { timeout: 30000 });
  out.refined = await page.inputValue('#ar');
  await shot('refined');
  await page.click('[data-close]');
  out.promptFile = existsSync('art/prompts/b_quarry.json') && JSON.parse(readFileSync('art/prompts/b_quarry.json', 'utf8')).refined === out.refined;
  await page.click('[data-art^="b_quarry|"]');
  await page.waitForSelector('#ar');
  out.reopened = (await page.inputValue('#ar')) === out.refined;

  // the paintings importer
  mkdirSync('/tmp/claude-0/pt89', { recursive: true });
  copyFileSync('inspirations/wells/image_0(1).png', '/tmp/claude-0/pt89/Test Quarry.png');
  await page.fill('#afolder', 'board');
  await page.setInputFiles('#afile', '/tmp/claude-0/pt89/Test Quarry.png');
  await page.waitForSelector('#asheet .box[data-art-island="0"]', { timeout: 30000 });
  out.uploaded = existsSync('inspirations/board/test_quarry.png');
  await page.click('#asheet .box[data-art-island="0"]');
  out.islandPicked = (await page.inputValue('#ei')) === '0';
  await page.fill('#et', '40');
  await shot('sheet');
  await page.click('[data-art-entry]');
  await page.waitForFunction(() => !document.querySelector('[data-art-import]')?.disabled, null, { timeout: 15000 });
  out.entry = JSON.parse(readFileSync('art/sources.json', 'utf8')).sprites.some((e) => e.name === 'b_quarry' && e.src === 'inspirations/board/test_quarry.png' && e.island === 0 && e.targetHeight === 40);
  await page.click('[data-art-import]');
  await page.waitForFunction(() => /import #\d+/.test(document.querySelector('#arun')?.textContent ?? '') && !/running/.test(document.querySelector('#arun .chip')?.textContent ?? 'running'), null, { timeout: 300000 });
  out.importState = await page.textContent('#arun .chip');
  out.inManifest = !!JSON.parse(readFileSync('public/art/sprites.json', 'utf8')).sprites.b_quarry;
  await page.waitForTimeout(1500);
  await shot('imported');
  await page.click('[data-art-checked]');
  await page.waitForTimeout(2500);
  out.checked = JSON.parse(readFileSync('art/sources.json', 'utf8')).sprites.some((e) => e.name === 'b_quarry' && e.checked === true);

  // a hand-off
  await page.selectOption('#ap', 'tripo');
  await page.click('[data-art-handoff="tripo"]');
  await page.waitForSelector('#sx');
  const task = await page.inputValue('#sx');
  out.handoff = /Tripo Studio pipeline/.test(task) && /not written into EdaBuilder's docs yet/.test(task) && task.includes(out.refined.slice(0, 30));
  await shot('handoff');
  await page.click('[data-close]');

  // the Art & pipelines tab
  await page.fill('#q', '');
  await page.click('[data-tab=art]');
  await page.waitForSelector('[data-art="b_quarry|quarry"]');
  out.artTabPipelines = await page.locator('#main h3', { hasText: 'Aseprite' }).count();
  await shot('arttab');

  // the text kinds: text only, edited on the board and read by the game's code, then undone
  await page.click('[data-tab=edicts]');
  await page.waitForSelector('[data-edit]');
  out.textOnly = (await page.locator('#main [data-dup]').count()) === 0 && await page.isHidden('#new');
  await page.click('[data-edit="0|bounty"]');
  await page.waitForSelector('#modal [data-path]');
  out.textEditorNoDelete = (await page.locator('#modal [data-delete]').count()) === 0;
  const nameField = page.locator('#modal [data-path=\'["name"]\']');
  await nameField.fill("Hunters' Bounty (board test)");
  await page.click('[data-save]');
  await page.waitForTimeout(3000);
  out.gameReads = execFileSync('npx', ['tsx', '-e', "import('./src/sim/edicts.ts').then(m => console.log(m.EDICT_BY_KEY.bounty.name))"], { encoding: 'utf8' }).trim();
  await shot('text');
  await page.click('#undo summary');
  await page.click('#undolist [data-undo]');
  await page.waitForTimeout(2500);
  out.undone = !readFileSync('src/data/content/text/edicts.json', 'utf8').includes('board test') && execFileSync('git', ['status', '--short', 'src/data/content/text']).toString() === '';
  await page.close();
}

if (process.env.GAME === '1') {
  out.edicts = {};
  for (const people of ['vellish', 'grimmen', 'veshari', 'tallowkin']) {
    const text = {};
    for (const port of [4173, 4174]) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
      watch(page, `game ${port}`);
      await page.goto(`http://localhost:${port}/`, { timeout: 8000 });
      await page.waitForFunction(() => window.__game && window.__wardlight && window.__wardlight.atlas);
      text[port] = await page.evaluate((people) => {
        const g = window.__game;
        g.newGame(42, 'Eelwick', 'valley', people);
        for (const id of ['help', 'title']) document.getElementById(id)?.classList.add('hidden');
        g.paused = true; g.state.milestone = 8; g.state.treasury = 9999999; g.ui.refresh();
        g.ui.toggleEdicts(true);
        return g.ui.el.edicts.innerText;
      }, people);
      if (port === 4173 && people === 'vellish') await page.screenshot({ path: 'shots/iter89_edicts.png' });
      await page.close();
    }
    out.edicts[people] = text[4173] === text[4174] ? `same (${text[4173].length} chars)` : 'DIFFERENT';
  }
}
out.errors = errors;
console.log(JSON.stringify(out, null, 1));
await browser.close();
