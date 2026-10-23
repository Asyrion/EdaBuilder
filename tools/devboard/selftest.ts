/* The dev board's self-test (no network, no browser, nothing written to the repository: edits run on a copy in the temp
   folder). Every entry of every kind loads; a one-number edit changes exactly one line and putting the value back restores
   the file byte for byte; a duplicate and its delete leave the file as it was; a used id can't be deleted; a stale hash
   is refused; undo restores; the HTTP guards refuse foreign hosts, writes without the board's header and paths out of
   data/. Iteration 88 adds the project side (the parsers, Send to Claude against fakes); iteration 89 the art side: the
   text kinds (edited and restored, never created or deleted), prompts (new, edited, undone), Refine with Claude against a
   fake `claude -p`, a painting saved and refused, the importer run on a one-painting copy and its lock, the text check.
   Prints DEV BOARD SELFTEST OK or the failures. Run: npm run devboard:selftest (iteration 87, DESIGN 4.118). */
import { chmodSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { BadRequest, Conflict, Content, hashOf } from './content';
import { CODE_KINDS, KINDS } from './kinds';
import type { Json } from './jsonspan';
import { unions } from './schema';
import { codeEntries, server } from './server';
import { toClaude, toIssue } from './session';
import { jobOf, parseRefined, startRefine } from './prompts';
import { Busy, importState, islands, paintingPath, runImport, savePainting } from './pipelines';
import { checkAllText, checkText } from './textCheck';
import { generate, roundState, roundsOf, roundFile, whoami } from './tripo';
import { exportStep, traceStep } from '../../scripts/aseprite';
import { createServer as httpServer } from 'node:http';
import { encodePng } from '../../scripts/lib/png.mjs';
import { balance, designIndex, designSection, nextSteps, resetLog } from './tracker';

const REPO = resolve(import.meta.dirname, '../..');
const fails: string[] = [];
const check = (ok: unknown, what: string) => { if (!ok) fails.push(what); };
const throws = (fn: () => unknown, cls: new (...a: never[]) => Error, what: string) => {
  try { fn(); fails.push(`${what}: no error`); } catch (e) { check(e instanceof cls, `${what}: ${(e as Error).message}`); }
};

const tmp = mkdtempSync(join(tmpdir(), 'devboard-selftest-'));
cpSync(join(REPO, 'src'), join(tmp, 'src'), { recursive: true });   // src/data/content and the code the reference scan reads
cpSync(join(REPO, 'art/sources.json'), join(tmp, 'art/sources.json'));   // the art sources kind (iteration 89)
const c = new Content(tmp);

/** The path to the first number in a value, if any. */
function firstNumber(v: Json, path: (string | number)[] = []): (string | number)[] | null {
  if (typeof v === 'number') return path;
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) { const p = firstNumber(v[i], [...path, i]); if (p) return p; } return null; }
  if (v && typeof v === 'object') { for (const [k, x] of Object.entries(v)) { const p = firstNumber(x, [...path, k]); if (p) return p; } }
  return null;
}
function bump(v: Json, path: (string | number)[]): Json {
  const out = JSON.parse(JSON.stringify(v));
  if (!path.length) return (v as number) + 1;
  let o = out;
  for (const p of path.slice(0, -1)) o = o[p];
  o[path[path.length - 1]] += 1;
  return out;
}

let edits = 0;
for (const name of Object.keys(KINDS)) {
  const { entries, errors } = c.entries(name);
  check(!errors.length, `${name} loads: ${errors.join('; ')}`);
  check(entries.length > 0, `${name} has entries`);
  for (const e of entries) {
    const file = KINDS[name].sources[e.src].file, before = readFileSync(join(tmp, file), 'utf8');
    const p = firstNumber(e.data);
    if (!p) continue;
    const changed = bump(e.data, p);
    c.save(name, e.src, e.key, changed, e.hash);
    const mid = readFileSync(join(tmp, file), 'utf8');
    const a = before.split('\n'), b = mid.split('\n');
    check(a.length === b.length && a.filter((l, i) => l !== b[i]).length === 1, `${name} ${e.key}: a one-number edit changes one line`);
    c.save(name, e.src, e.key, e.data, hashOf(changed));
    check(readFileSync(join(tmp, file), 'utf8') === before, `${name} ${e.key}: putting the value back restores the file`);
    edits++;
  }
}

// the text kinds (iteration 89): a text edit changes one line and putting it back restores the file
for (const [name, k] of Object.entries(KINDS).filter(([, k]) => k.textOnly)) {
  const e = c.entries(name).entries[0], file = join(tmp, k.sources[0].file), before = readFileSync(file, 'utf8');
  const field = Object.keys(e.data as object).find((f) => typeof (e.data as Record<string, Json>)[f] === 'string')!;
  const changed = { ...(e.data as object), [field]: 'Changed on the board.' };
  c.save(name, 0, e.key, changed, e.hash);
  const a = before.split('\n'), b = readFileSync(file, 'utf8').split('\n');
  check(a.length === b.length && a.filter((l, i) => l !== b[i]).length === 1, `${name}: a text edit changes one line`);
  check(checkText(name, JSON.parse(readFileSync(file, 'utf8')), readFileSync(join(tmp, KINDS[name].textOnly!), 'utf8')).length === 0, `${name}: the edited text still checks`);
  c.save(name, 0, e.key, e.data, hashOf(changed));
  check(readFileSync(file, 'utf8') === before, `${name}: putting the text back restores the file`);
  throws(() => c.create(name, 0, e.data, 'selftestNew'), Conflict, `${name}: text only, a new entry is refused`);
  throws(() => c.remove(name, 0, e.key, e.hash), Conflict, `${name}: text only, a delete is refused`);
  throws(() => c.save(name, 0, e.key, e.data, e.hash, 'selftestRenamed'), Conflict, `${name}: text only, a rename is refused`);
}
{
  check(checkAllText(REPO).length === 0, 'text: every text the code reads is there, and every text is read');
  // the tales and the guilds are parked (scope reset phase 1c): the edicts' text stands in
  const ev = JSON.parse(readFileSync(join(REPO, 'src/data/content/text/edicts.json'), 'utf8')), src = readFileSync(join(REPO, 'src/sim/edicts.ts'), 'utf8');
  const first = Object.keys(ev)[0];
  const missing = { ...ev }; delete missing[first];
  check(checkText('edicts', missing, src).some((x) => x.includes(`${first}.name`) && x.includes('would not load')), 'text: an entry the code reads, gone, is reported');
  check(checkText('edicts', { ...ev, selftestStray: { name: 'x' } }, src).some((x) => x.includes('selftestStray.name') && x.includes('nothing')), 'text: an entry nothing reads is reported');
}

// prompts (iteration 89): a new file, an edit, a stale write refused, undo of the edit and of the new file
{
  const f = 'art/prompts/b_selftest.json', abs = join(tmp, f);
  c.writeFile(f, null, '{"sprite":"b_selftest","brief":"a"}\n', 'prompt b_selftest');
  check(existsSync(abs), 'prompts: a new prompt file is written');
  throws(() => c.writeFile(f, null, '{}', 'x'), Conflict, 'prompts: a write over a file changed since is refused');
  c.writeFile(f, '{"sprite":"b_selftest","brief":"a"}\n', '{"sprite":"b_selftest","brief":"b"}\n', 'prompt b_selftest');
  c.undo(c.undoList()[0].i);
  check(readFileSync(abs, 'utf8').includes('"a"'), 'prompts: undo restores the edit');
  c.undo(c.undoList()[0].i);
  check(!existsSync(abs), 'prompts: undo of a new prompt removes it');
  throws(() => c.writeFile('docs/x.json', null, '{}', 'x'), BadRequest, 'prompts: a path outside src/data/content and art/ is refused');
  check(parseRefined('PROMPT:\nA tower.\nNOTE:\nTaller.').prompt === 'A tower.' && parseRefined('just text').prompt === 'just text', 'prompts: the refined answer is parsed');
}

// paintings (iteration 89): saved under eda-lore's inspirations/, PNG only, never over another, nothing outside. The
// eda-lore checkout is the scratch folder here (EDA_LORE, scripts/lib/lore.mjs), the painting a drawn 160×120 well
process.env.EDA_LORE = tmp;
{
  const well = new Uint8ClampedArray(160 * 120 * 4).fill(255);
  for (let y = 20; y < 100; y++) for (let x = 20; x < 140; x++) { const o = (y * 160 + x) * 4; well[o] = 90; well[o + 1] = 70; well[o + 2] = 60; }
  const png = Buffer.from(encodePng({ w: 160, h: 120, data: well }));
  const a = savePainting(tmp, 'selftest', 'My Well.png', png.toString('base64')), b = savePainting(tmp, 'selftest', 'My Well.png', png.toString('base64'));
  check(a === 'inspirations/selftest/my_well.png' && b === 'inspirations/selftest/my_well_2.png', 'paintings: saved by a clean name, never over another');
  throws(() => savePainting(tmp, 'selftest', 'x.png', Buffer.from('not a png').toString('base64')), Error, 'paintings: only PNG');
  throws(() => savePainting(tmp, '../src', 'x.png', png.toString('base64')), Error, 'paintings: a folder outside inspirations/ is refused');
  throws(() => paintingPath(tmp, 'inspirations/../src/x.png'), Error, 'paintings: a path outside inspirations/ is refused');
}

// duplicate and delete
for (const [name, k] of Object.entries(KINDS).filter(([, k]) => !k.textOnly)) {
  const e = c.entries(name).entries[0], file = k.sources[e.src].file, before = readFileSync(join(tmp, file), 'utf8');
  const data = JSON.parse(JSON.stringify(e.data));
  const id = 'selftestCopy';
  if (k.idKey) data[k.idKey] = id;
  const r = c.create(name, e.src, data, k.shape === 'map' ? id : undefined, e.key);
  const made = c.entries(name).entries.find(x => x.key === r.key && x.src === e.src)!;
  check(made && JSON.stringify(made.data) === JSON.stringify(data), `${name}: a duplicate holds what was sent`);
  JSON.parse(readFileSync(join(tmp, file), 'utf8'));
  c.remove(name, e.src, r.key, made.hash);
  check(readFileSync(join(tmp, file), 'utf8') === before, `${name}: duplicate then delete leaves the file as it was`);
}

// guards
throws(() => c.remove('buildings', 0, 'well', c.entries('buildings').entries.find(e => e.key === 'well')!.hash), Conflict, 'a building a milestone unlocks can not be deleted');
throws(() => c.save('buildings', 0, 'well', {}, 'stale'), Conflict, 'a stale hash is refused');
throws(() => c.abs('../package.json'), BadRequest, 'a path out of data/ is refused');
throws(() => c.create('buildings', 0, { key: 'well' }), BadRequest, 'an id that exists is refused');
throws(() => c.create('buildings', 0, { key: 'bad id!' }), BadRequest, 'a malformed id is refused');
{
  const file = join(tmp, 'src/data/content/roads.json'), e = c.entries('roads').entries[0], before = readFileSync(file, 'utf8');
  c.save('roads', 0, e.key, { ...(e.data as object), cost: 999 }, e.hash);
  const u = c.undoList()[0];
  c.undo(u.i);
  check(readFileSync(file, 'utf8') === before, 'undo restores the file');
}
check((unions(REPO).BuildingCategory ?? []).includes('wonder') && (unions(REPO).FactionId ?? []).includes('vellish'), 'the string unions are read from src/');
for (const name of Object.keys(CODE_KINDS)) check(codeEntries(name).length > 0, `the ${name} in code are found`);
const tmpArt = tmp;   // removed after the importer's run below

// the project side (iteration 88): the parsers over the real docs and cache, and Send to Claude against fakes
{
  const ns = nextSteps(readFileSync(join(REPO, 'docs/NEXT_STEPS.md'), 'utf8'));
  check(ns.open.length >= 3 && ns.open.every((o, i) => o.n === i + 1 && o.title), 'NEXT_STEPS: the open list is read in order, each with a title');
  const done = resetLog(readFileSync(join(REPO, 'docs/RESET_LOG.md'), 'utf8'));
  check(done.length >= 6 && done[done.length - 1].label === 'Phase 0' && done[0].n > done[done.length - 1].n && done.every((d) => d.bullets.length), 'RESET_LOG: every "## Phase" is read, newest first, with its bullets');
  const fixture = '## Prioritized ideas for the next iteration\n\n1. **First** one\n   more\n2. **Second DESIGN §2** two\n\n## Done in iteration 3 (x)\n\n- a\n  b\n';
  const f = nextSteps(fixture);
  check(f.open.length === 2 && f.open[0].text === 'one more' && f.open[1].design[0] === '§2' && f.done[0].bullets[0] === 'a b', 'NEXT_STEPS: the fixture parses');
  const g = resetLog('# Log\n\n## Phase 0: safeguards (2026-10-21)\n\n- a\n  b\n  - deeper\n\n## Phase 1a: the peoples (2026-10-21)\n\n- c, after DESIGN §3\n');
  check(g.length === 2 && g[0].label === 'Phase 1a' && g[0].design[0] === '§3' && g[1].title === 'safeguards' && g[1].bullets.length === 1 && g[1].bullets[0] === 'a b', 'RESET_LOG: the fixture parses');
  const design = readFileSync(join(REPO, 'docs/DESIGN.md'), 'utf8'), di = designIndex(design);
  const nums = di.map((h) => Number(h.id)), headings = (design.match(/^## \d+\./gm) ?? []).length;
  check(nums.length === headings && headings >= 5 && new Set(nums).size === nums.length && nums[0] === 1, 'DESIGN: every "## N." section is indexed once (in the file\'s own order)');
  check((designSection(design, '2') ?? '').includes('core loop') && !(designSection(design, '2') ?? '').includes('## 3.'), 'DESIGN: a section is read whole, and only it');
  const b = balance(REPO);
  check(b.files.length > 0 && b.files.every((x) => Object.keys(x.stats).length > 0) && b.files.some((x) => 'vellish' in x.stats), 'balance: every cache file read (a bar still running writes a partial one), one with the Vellish (scope reset: one people)');

  const bin = mkdtempSync(join(tmpdir(), 'devboard-fakes-')), log = join(bin, 'log');
  const script = (name: string, body: string) => { writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`); chmodSync(join(bin, name), 0o755); };
  script('gh', `echo "gh $*" >> ${log}; cat >> ${log}; case "$*" in *labels/dev-board*) echo '{}';; *issues*POST*) echo '{"number":999,"html_url":"https://example.invalid/issues/999"}';; *) echo '[]';; esac`);
  script('claude', `echo "claude $*" >> ${log}`);
  script('term', `echo "term $*" >> ${log}`);
  script('open', `echo "open $*" >> ${log}`);
  const env = { PATH: process.env.PATH, L: process.env.DEVBOARD_FAKE_LINK, O: process.env.DEVBOARD_FAKE_OPEN, T: process.env.DEVBOARD_TERMINAL };
  process.env.PATH = bin + ':' + process.env.PATH;
  process.env.DEVBOARD_TERMINAL = join(bin, 'term'); process.env.DEVBOARD_FAKE_OPEN = join(bin, 'open');
  const wait = () => { const t = Date.now() + 1500; while (Date.now() < t && !existsSync(log)) { /* the detached fake writes soon */ } };
  try {
    process.env.DEVBOARD_FAKE_LINK = '0';
    const r1 = toClaude(REPO, 'Plan the next item.', 'next');
    wait();
    check(r1.how === 'terminal' && !!r1.file && readFileSync(r1.file, 'utf8') === 'Plan the next item.', 'send: without the link, a terminal with the task (and its copy in a file)');
    process.env.DEVBOARD_FAKE_LINK = '1';
    const r2 = toClaude(REPO, 'x'.repeat(6000), 'long');
    check(r2.how === 'link' && !!r2.file, 'send: with the link, a long task goes to a file and the link points at it');
    const r3 = toIssue(REPO, 'A title', 'A task');
    check(r3.number === 999, 'send: a GitHub issue through gh');
    const t = Date.now() + 2000; while (Date.now() < t && !/open claude-cli/.test(existsSync(log) ? readFileSync(log, 'utf8') : '')) { /* wait for the fakes */ }
    const L = readFileSync(log, 'utf8');
    check(/term .*claude Plan the next item\./.test(L), 'send: the terminal runs claude with the task');
    check(/open claude-cli:\/\/open\?cwd=.*&q=EdaBuilder%20task%20from%20the%20dev%20board/.test(L), 'send: the link opens this checkout with the pointer');
    check(/"labels":\["dev-board"\]/.test(L), 'send: the issue carries the dev-board label');
    for (const f of [r1.file!, r2.file!]) rmSync(f, { force: true });
  } finally {
    process.env.PATH = env.PATH;
    for (const [k, v] of [['DEVBOARD_FAKE_LINK', env.L], ['DEVBOARD_FAKE_OPEN', env.O], ['DEVBOARD_TERMINAL', env.T]] as const) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    rmSync(bin, { recursive: true, force: true });
  }
}

// HTTP guards (the server on a free port; nothing here writes)
const call = (port: number, method: string, path: string, headers: Record<string, string>, body?: string) => new Promise<number>(ok => {
  const r = request({ host: '127.0.0.1', port, method, path, headers }, res => { res.resume(); ok(res.statusCode ?? 0); });
  r.on('error', () => ok(0));
  r.end(body);
});
server.listen(0, '127.0.0.1', async () => {
  const port = (server.address() as { port: number }).port, h = { Host: `127.0.0.1:${port}` };
  check(await call(port, 'GET', '/', h) === 200, 'the page is served');
  check(await call(port, 'GET', '/api/state', { Host: 'evil.example' }) === 403, 'a foreign Host is refused');
  check(await call(port, 'POST', '/api/delete', { ...h, 'Content-Type': 'application/json' }, '{}') === 403, 'a write without X-Dev-Board is refused');
  check(await call(port, 'POST', '/api/delete', { ...h, 'X-Dev-Board': '1', 'Content-Type': 'text/plain' }, '{}') === 403, 'a write that is not JSON is refused');
  check(await call(port, 'GET', '/../package.json', h) === 404, 'no files outside the page');
  for (const p of ['/api/send', '/api/github/issue', '/api/github/comment', '/api/github/milestone', '/api/prompt/save', '/api/refine', '/api/upload', '/api/pipeline/import', '/api/pipeline/handoff'])
    check(await call(port, 'POST', p, { ...h, 'Content-Type': 'application/json' }, '{}') === 403, `${p} without X-Dev-Board is refused`);
  check(await call(port, 'GET', '/api/tracker', h) === 200 && await call(port, 'GET', '/api/design/2', h) === 200, 'the tracker and a DESIGN section are served');
  check(await call(port, 'GET', '/api/pipelines', h) === 200 && await call(port, 'GET', '/api/prompt/b_spire', h) === 200 && await call(port, 'GET', '/api/prompts', h) === 200, 'the pipelines and a prompt are served');
  check(await call(port, 'GET', '/painting?src=../package.json', h) === 400, 'no painting outside inspirations/');
  for (const p of ['/api/tripo/generate', '/api/aseprite/run'])
    check(await call(port, 'POST', p, { ...h, 'Content-Type': 'application/json' }, '{}') === 403, `${p} without X-Dev-Board is refused`);
  check(await call(port, 'GET', '/aseprite/../x.png', h) !== 200, 'no file outside art/aseprite');
  check(await call(port, 'GET', '/tripo/../../package.json', h) >= 400 && await call(port, 'GET', '/api/aseprite?sprite=../x', h) === 400, 'no Tripo or Aseprite file outside art/');
  server.close();
  await artRuns();
  await pipelineRuns();
  if (fails.length) { console.log('DEV BOARD SELFTEST FAIL\n' + fails.slice(0, 40).join('\n')); process.exitCode = 1; }
  else console.log(`DEV BOARD SELFTEST OK (${edits} entries edited and restored, ${Object.keys(KINDS).length} kinds)`);
});

/** The art side's child processes (iteration 89): Refine with Claude against a fake `claude -p`, and the importer on a copy
    holding one painting and one entry, with its lock. */
async function artRuns() {
  const until = async (ok: () => boolean, ms: number) => { const t = Date.now() + ms; while (!ok() && Date.now() < t) await new Promise((r) => setTimeout(r, 100)); };
  const bin = mkdtempSync(join(tmpdir(), 'devboard-fakes-'));
  writeFileSync(join(bin, 'claude'), `#!/bin/sh\ncat > ${join(bin, 'stdin')}\necho "claude $*" > ${join(bin, 'args')}\nprintf 'PROMPT:\\nA refined tower.\\nNOTE:\\nMade it taller.\\n'\n`);
  chmodSync(join(bin, 'claude'), 0o755);
  const path = process.env.PATH;
  process.env.PATH = bin + ':' + path;
  try {
    const job = startRefine(REPO, 'b_spire', 'Refine this: a spire.');
    await until(() => jobOf(job.id)!.state !== 'running', 10000);
    const j = jobOf(job.id)!;
    check(j.state === 'done' && j.prompt === 'A refined tower.' && j.note === 'Made it taller.', `refine: claude -p answers and is parsed (${j.state} ${j.error ?? ''})`);
    check(readFileSync(join(bin, 'stdin'), 'utf8') === 'Refine this: a spire.' && /claude -p --output-format text/.test(readFileSync(join(bin, 'args'), 'utf8')), 'refine: the task goes on stdin, never in the arguments');
  } finally { process.env.PATH = path; rmSync(bin, { recursive: true, force: true }); }

  // the importer on a copy: one painting, one entry
  const root = tmpArt;
  cpSync(join(REPO, 'scripts/importSprites.mjs'), join(root, 'scripts/importSprites.mjs'));
  cpSync(join(REPO, 'scripts/lib'), join(root, 'scripts/lib'), { recursive: true });
  cpSync(join(REPO, 'art/palette.json'), join(root, 'art/palette.json')); // the importer snaps to the master palette (phase 3-2)
  const src = 'inspirations/selftest/my_well.png';
  writeFileSync(join(root, 'art/sources.json'), JSON.stringify({ sprites: [{ name: 'b_selftestwell', src, island: 0, w: 1, h: 1, targetHeight: 16, anchor: 'centre', shift: { x: 0, y: 6 } }] }, null, 1));
  const isl = islands(root, src);
  check(isl.length > 0 && isl[0].w > 100, 'importer: the sheet\'s islands are listed');
  const run = runImport(root);
  throws(() => runImport(root), Busy, 'importer: one run at a time');
  await until(() => run.state !== 'running', 120000);
  const manifest = existsSync(join(root, 'public/art/sprites.json')) ? JSON.parse(readFileSync(join(root, 'public/art/sprites.json'), 'utf8')) : { sprites: {} };
  check(run.state === 'done' && !!manifest.sprites.b_selftestwell && importState() === run, `importer: the run writes the sprite into the manifest (${run.state}: ${run.log.slice(-2).join(' ')})`);
  rmSync(root, { recursive: true, force: true });
}

/** The Tripo and Aseprite pipelines (iteration 91): a round against a fake `tripo` (a task id, a poll that runs and then
    succeeds, the images served from a local server), and trace and export against a fake Aseprite, on scratch names. */
async function pipelineRuns() {
  const until = async (ok: () => boolean, ms: number) => { const t = Date.now() + ms; while (!ok() && Date.now() < t) await new Promise((r) => setTimeout(r, 50)); };
  const png = encodePng({ w: 8, h: 8, data: new Uint8ClampedArray(8 * 8 * 4).fill(255) });
  const files = mkdtempSync(join(tmpdir(), 'devboard-tripo-'));
  const srv = httpServer((q, r) => { r.writeHead(200, { 'Content-Type': 'image/png' }); r.end(png); });
  await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', () => ok()));
  const port = (srv.address() as { port: number }).port, bin = join(files, 'tripo'), count = join(files, 'polls'), args = join(files, 'args');
  writeFileSync(bin, `#!/bin/sh
echo "$@" >> ${args}
case "$1 $2" in
  "auth whoami") echo "Logged in as test@example.invalid";;
  "image get") n=$(cat ${count} 2>/dev/null || echo 0); n=$((n+1)); echo $n > ${count}
    if [ $n -lt 2 ]; then echo '{"status":"running"}'; else echo '{"data":{"status":"success","urls":["http://127.0.0.1:${port}/1.png","http://127.0.0.1:${port}/2.png","http://127.0.0.1:${port}/3.png","http://127.0.0.1:${port}/4.png"]}}'; fi;;
  image*) echo "Task created: task-12345678"; echo "Error: no image URLs in result";;
esac
`);
  chmodSync(bin, 0o755);
  const env = { T: process.env.TRIPO, P: process.env.DEVBOARD_TRIPO_POLL_MS, A: process.env.ASEPRITE };
  process.env.TRIPO = bin; process.env.DEVBOARD_TRIPO_POLL_MS = '50';
  const root = mkdtempSync(join(tmpdir(), 'devboard-round-'));
  try {
    const who = await whoami();
    check(who.ok && who.installed && /test@example/.test(who.text), `tripo: whoami reads the login (${who.text})`);
    const prompt = 'Isometric pixel-art sprite of a quarry; one subject on plain white.';
    throws(() => generate(root, '../x', prompt), Error, 'tripo: a bad sprite name is refused');
    throws(() => generate(root, 'b_quarry', 'x'.repeat(1001)), Error, 'tripo: a prompt over 1000 characters is refused');
    const r = generate(root, 'b_quarry', prompt);
    throws(() => generate(root, 'b_quarry', prompt), Error, 'tripo: one round at a time');
    await until(() => r.state !== 'running', 15000);
    check(r.state === 'done' && r.task === 'task-12345678' && r.files.length === 4 && roundState('b_quarry') === r, `tripo: the round reads the task id past the CLI's bug, polls and downloads four (${r.state} ${r.error ?? ''} ${r.files.length})`);
    const rounds = roundsOf(root, 'b_quarry');
    check(rounds.length === 1 && rounds[0].round === 1 && rounds[0].files[0] === 'b_quarry/round1/A_r1_1.png' && readFileSync(roundFile(root, rounds[0].files[0])).equals(png), 'tripo: the round is kept in art/tripo/<sprite>/round1/');
    const sent = readFileSync(args, 'utf8');
    check(sent.includes(`image ${prompt} -m gemini_3.1_flash_image_preview -n 4 --scale 1:1`) && sent.includes('image get task-12345678 --output-format json'), 'tripo: Nano Banana 2, four, 1:1; then polled by task id');
    throws(() => roundFile(root, '../../package.json'), Error, 'tripo: no file outside art/tripo/');

    // Aseprite: the fake builds the .aseprite (a marker) and exports the trace's pixels
    const ase = join(files, 'aseprite');
    writeFileSync(ase, `#!/bin/sh
out=""; save=""; src=""
while [ $# -gt 0 ]; do case "$1" in
  --script-param) case "$2" in out=*) out="\${2#out=}";; esac; shift 2;;
  --save-as) save="$2"; shift 2;;
  -b|--script) [ "$1" = "--script" ] && shift; shift;;
  *.aseprite) src="$1"; shift;;
  *) shift;;
esac; done
[ -n "$out" ] && echo fake-aseprite > "$out"
[ -n "$save" ] && cp "\${src%.aseprite}.trace.png" "$save"
exit 0
`);
    chmodSync(ase, 0o755);
    process.env.ASEPRITE = ase;
    const drawn = join(files, 'drawn.png'), name = 'selftestAseprite';
    const img = new Uint8ClampedArray(6 * 6 * 4);
    for (let y = 1; y < 5; y++) for (let x = 1; x < 5; x++) img.set([180, 90, 40, 255], (y * 6 + x) * 4);
    writeFileSync(drawn, encodePng({ w: 6, h: 6, data: img }));
    try {
      const t = await traceStep(name, { from: drawn });
      check(existsSync(join(REPO, t.ase)) && existsSync(join(REPO, t.png)) && existsSync(join(REPO, t.preview)) && t.w === 6, 'aseprite: trace writes the .aseprite, the trace and its 8x preview');
      let refused = false;
      try { await traceStep(name, { from: drawn }); } catch { refused = true; }
      check(refused, 'aseprite: an .aseprite is never traced over without --force');
      const ex = exportStep(name);
      check(existsSync(join(REPO, ex.out)) && existsSync(join(REPO, ex.out8)) && ex.w === 6, 'aseprite: export writes the PNG and the 8x preview');
    } finally {
      for (const f of [`${name}.aseprite`, `${name}.trace.lua`, `${name}.trace.png`, `${name}.trace_8x.png`, `export/${name}.png`, `export/${name}_8x.png`]) rmSync(join(REPO, 'art/aseprite', f), { force: true });
    }
  } finally {
    for (const [k, v] of [['TRIPO', env.T], ['DEVBOARD_TRIPO_POLL_MS', env.P], ['ASEPRITE', env.A]] as const) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    srv.close();
    rmSync(files, { recursive: true, force: true }); rmSync(root, { recursive: true, force: true });
  }
}
