/* EdaBuilder's dev board (iteration 87, DESIGN 4.118): a local web page to browse, create, edit and delete the game's content
   in src/data/content/ (buildings, roads, milestones, relic sets), with every building's sprites and art status, checked by
   the game's own validateContent after every save. Edicts, events, quests and guilds are shown read-only from the code.
   Node's standard library only; the page is plain HTML and JS in tools/devboard/public/.

   Run:  npm run devboard                     then open http://127.0.0.1:8771
         npm run devboard -- --port 9000 --open

   Listens on 127.0.0.1 only; refuses other Host headers (DNS rebinding) and writes without JSON plus the X-Dev-Board
   header (so another web page can't post to it). One instance serves every session: check it answers before starting. */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BadRequest, Conflict, Content } from './content';
import { CODE_KINDS, KINDS } from './kinds';
import { hints, unions } from './schema';
import type { Json } from './jsonspan';
import { GhError, githubState, issueComment, issueWrite, milestoneWrite } from './github';
import { toClaude, toIssue } from './session';
import { balance, designIndex, designSection, nextSteps } from './tracker';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), opt = (k: string, d: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const ROOT = resolve(opt('--root', join(HERE, '../..')));
const PORT = Number(opt('--port', '8771'));
const SPRITES = join(tmpdir(), 'edabuilder-devboard-sprites');
const content = new Content(ROOT);

// ---------------- fresh-process runners (the game's code, read anew) ----------------

function runTs(script: string, argv: string[], marker: string, timeoutMs = 60000): Promise<Record<string, unknown>> {
  return new Promise((done) => {
    const p = spawn(process.execPath, ['--import', 'tsx', join(HERE, script), ...argv], { cwd: ROOT });
    let out = '', err = '';
    const timer = setTimeout(() => p.kill(), timeoutMs);
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', () => {
      clearTimeout(timer);
      const line = out.split('\n').find((l) => l.startsWith(marker + ' '));
      done(line ? JSON.parse(line.slice(marker.length + 1)) : { error: (err || out || `${script} printed nothing`).trim().split('\n').slice(0, 12).join('\n') });
    });
  });
}

/** A signature of files by path, mtime and size (folders walked). */
function sigOf(paths: string[]) {
  const h = createHash('sha1');
  const walk = (p: string) => {
    if (!existsSync(p)) return;
    const st = statSync(p);
    if (st.isDirectory()) { for (const f of readdirSync(p).sort()) walk(join(p, f)); return; }
    h.update(`${p}|${st.mtimeMs}|${st.size};`);
  };
  for (const p of paths) walk(join(ROOT, p));
  return h.digest('hex').slice(0, 16);
}
const artSig = () => sigOf(['src/render', 'src/data/content', 'public/art/sprites.json', 'art/sources.json']);

interface Validation { ok: boolean; checks: { name: string; errors: string[] }[]; at: number; sig: string; error?: string }
let validation: Validation | null = null, running: Promise<Validation> | null = null;
function validate(): Promise<Validation> {
  if (running) return running;
  const sig = content.signature();
  running = runTs('validate.ts', [], 'VALIDATE_JSON').then((r) => {
    validation = { ok: false, checks: [], ...r, at: Date.now(), sig } as Validation;
    running = null;
    return validation;
  });
  return running;
}

let art: { sig: string; data: Record<string, unknown> } | null = null, artRunning: Promise<unknown> | null = null;
function artStatus(): Promise<unknown> {
  const sig = artSig();
  if (art && art.sig === sig) return Promise.resolve(art.data);
  artRunning ??= runTs('art.ts', [SPRITES], 'ART_JSON').then((r) => { art = { sig, data: r }; artRunning = null; return r; });
  return artRunning;
}

/** Content still in code (kinds.ts CODE_KINDS): each entry's id, title and text, scanned from the TypeScript source. */
function codeEntries(name: string) {
  const k = CODE_KINDS[name], text = readFileSync(join(ROOT, k.file), 'utf8');
  const str = `(?:'((?:[^'\\\\]|\\\\.)*)'|"((?:[^"\\\\]|\\\\.)*)"|\`((?:[^\`\\\\]|\\\\.)*)\`)`;
  const field = (body: string, f: string) => { const m = new RegExp(`\\b${f}:\\s*${str}`).exec(body); return m ? (m[1] ?? m[2] ?? m[3]).replace(/\\(.)/g, '$1') : ''; };
  const starts = [...text.matchAll(new RegExp(`\\b${k.id}:\\s*'([a-z][A-Za-z0-9_]*)'`, 'g'))];
  return starts.map((m, i) => {
    const body = text.slice(m.index!, starts[i + 1]?.index ?? m.index! + 4000);
    return { id: m[1], title: field(body, k.title2), text: k.text.map((t) => field(body, t)).filter(Boolean), line: text.slice(0, m.index!).split('\n').length };
  }).filter((e) => e.title);
}

const send = (res: ServerResponse, code: number, body: unknown, type = 'application/json') => {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': `${type}${type.startsWith('image/') ? '' : '; charset=utf-8'}`, 'Cache-Control': 'no-store' });
  res.end(data);
};
const hostOk = (req: IncomingMessage) => ['127.0.0.1', 'localhost'].includes((req.headers.host ?? '').replace(/:\d+$/, ''));
class Forbidden extends Error {}

function body(req: IncomingMessage): Promise<Record<string, Json>> {
  if (req.headers['x-dev-board'] !== '1' || !(req.headers['content-type'] ?? '').startsWith('application/json'))
    return Promise.reject(new Forbidden());
  return new Promise((ok, fail) => {
    let s = '';
    req.on('data', (d) => { s += d; if (s.length > 2e6) req.destroy(); });
    req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch { fail(new BadRequest('bad JSON')); } });
  });
}

const STATIC: Record<string, string> = { '/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js', '/project.js': 'project.js', '/style.css': 'style.css' };
const TYPES: Record<string, string> = { html: 'text/html', js: 'text/javascript', css: 'text/css' };

/** A sprite by name: the imported PNG (public/art/sprites.json names its file; variants may share one) first, else the one
    drawn in code (rendered by art.ts). */
function sprite(name: string, prefer?: string | null): Buffer | null {
  if (!/^[A-Za-z0-9_]+$/.test(name)) return null;
  const drawn = join(SPRITES, `${name}.png`);
  if (prefer === 'drawn' && existsSync(drawn)) return readFileSync(drawn);
  let file: string | undefined;
  try { file = (JSON.parse(readFileSync(join(ROOT, 'public/art/sprites.json'), 'utf8')) as { sprites: Record<string, { file: string }> }).sprites[name]?.file; } catch { /* no manifest */ }
  const base = resolve(ROOT, 'public/art'), imp = file ? resolve(base, file) : '';
  if (imp && imp.startsWith(base + sep) && existsSync(imp)) return readFileSync(imp);
  return existsSync(drawn) ? readFileSync(drawn) : null;
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  if (!hostOk(req)) return send(res, 403, { error: 'bad host' });
  const url = new URL(req.url ?? '/', 'http://127.0.0.1'), path = url.pathname;
  if (req.method === 'GET') {
    const file = STATIC[path];
    if (file) return send(res, 200, readFileSync(join(HERE, 'public', file)), TYPES[file.split('.').pop()!]);
    const sm = /^\/sprite\/([A-Za-z0-9_]+)\.png$/.exec(path);
    if (sm) {
      const b = sprite(sm[1], url.searchParams.get('from'));
      return b ? send(res, 200, b, 'image/png') : send(res, 404, { error: 'no sprite' });
    }
    if (path === '/api/state') {
      const sig = content.signature(), asig = artSig();
      if (!validation || validation.sig !== sig) void validate();
      if (!art || art.sig !== asig) void artStatus();
      return send(res, 200, { sig: `${sig}.${asig}`, validation, validating: !!running, undo: content.undoList() });
    }
    if (path === '/api/content') {
      const kinds: Record<string, unknown> = {}, errors: string[] = [];
      for (const [name, k] of Object.entries(KINDS)) {
        const r = content.entries(name);
        kinds[name] = { ...k, entries: r.entries };
        errors.push(...r.errors);
      }
      const code: Record<string, unknown> = {};
      for (const [name, k] of Object.entries(CODE_KINDS)) {
        try { code[name] = { ...k, entries: codeEntries(name) }; } catch (e) { errors.push(`${k.file}: ${(e as Error).message}`); }
      }
      return send(res, 200, { sig: `${content.signature()}.${artSig()}`, kinds, code, errors, unions: unions(ROOT), hints: hints(ROOT), art: await artStatus() });
    }
    if (path === '/api/tracker') {
      const ns = nextSteps(readFileSync(join(ROOT, 'docs/NEXT_STEPS.md'), 'utf8'));
      const design = designIndex(readFileSync(join(ROOT, 'docs/DESIGN.md'), 'utf8')).map(({ id, title, iteration }) => ({ id, title, iteration }));
      return send(res, 200, { ...ns, design, balance: balance(ROOT) });
    }
    const dm = /^\/api\/design\/(4\.\d+)$/.exec(path);
    if (dm) {
      const text = designSection(readFileSync(join(ROOT, 'docs/DESIGN.md'), 'utf8'), dm[1]);
      return text ? send(res, 200, { id: dm[1], text }) : send(res, 404, { error: `no section ${dm[1]}` });
    }
    if (path === '/api/github') return send(res, 200, githubState(ROOT, url.searchParams.get('force') === '1'));
    if (path === '/api/refs') return send(res, 200, content.references(url.searchParams.get('kind') ?? '', url.searchParams.get('id') ?? ''));
    return send(res, 404, { error: 'not found' });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  const d = await body(req);
  const str = (k: string) => String(d[k] ?? ''), num = (k: string) => Number(d[k] ?? 0);
  const routes: Record<string, () => unknown> = {
    '/api/save': () => content.save(str('kind'), num('src'), str('key'), d.data, str('hash'), d.newKey ? str('newKey') : undefined),
    '/api/preview': () => content.preview(str('kind'), num('src'), str('key'), d.data, str('hash'), d.newKey ? str('newKey') : undefined),
    '/api/create': () => content.create(str('kind'), num('src'), d.data, d.key ? str('key') : undefined, d.like != null ? str('like') : undefined),
    '/api/delete': () => content.remove(str('kind'), num('src'), str('key'), str('hash')),
    '/api/undo': () => content.undo(num('i')),
    '/api/validate': () => null,
  };
  // the project side (iteration 88): GitHub and Send to Claude write nothing in the checkout and need no check after
  const project: Record<string, () => unknown> = {
    '/api/github/issue': () => issueWrite(ROOT, d as Record<string, unknown>),
    '/api/github/comment': () => issueComment(ROOT, num('number'), str('body'), !!d.close),
    '/api/github/milestone': () => milestoneWrite(ROOT, d as Record<string, unknown>),
    '/api/send': () => (str('to') === 'issue' ? toIssue(ROOT, str('title'), str('text')) : toClaude(ROOT, str('text'), str('id'))),
  };
  if (project[path]) {
    try { return send(res, 200, { ok: true, result: project[path]() }); }
    catch (e) { return send(res, e instanceof GhError ? 502 : 400, { error: (e as Error).message }); }
  }
  const fn = routes[path];
  if (!fn) return send(res, 404, { error: 'not found' });
  const result = fn();
  // a check already running when this write landed read the files before it: wait for it, then check again
  let v = path === '/api/preview' ? null : await validate();
  if (v && v.sig !== content.signature()) v = await validate();
  send(res, 200, { ok: true, result, validation: v });
}

const server = createServer((req, res) => {
  handle(req, res).catch((e: unknown) => {
    const code = e instanceof Forbidden ? 403 : e instanceof Conflict ? 409 : e instanceof BadRequest ? 400 : 500;
    const msg = e instanceof Forbidden ? 'Write refused (needs a JSON request from the dev board page).' : (e as Error).message;
    if (!res.headersSent) send(res, code, { error: msg });
  });
});

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.on('error', (e: NodeJS.ErrnoException) => {
    console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is taken: the dev board is probably running already (http://127.0.0.1:${PORT}).` : e.message);
    process.exit(1);
  });
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`EdaBuilder dev board on http://127.0.0.1:${PORT}  (content: ${join(ROOT, 'src/data/content')})  Ctrl+C stops it.`);
    void artStatus();
    if (args.includes('--open')) {
      const u = `http://127.0.0.1:${PORT}/`;
      const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', u]] : process.platform === 'darwin' ? ['open', [u]] : ['xdg-open', [u]];
      spawn(cmd[0] as string, cmd[1] as string[], { stdio: 'ignore', detached: true }).on('error', () => undefined).unref();
    }
  });
}

export { server, content, codeEntries };
