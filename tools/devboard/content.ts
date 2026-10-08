/* The dev board's content layer: reads every kind in kinds.ts from src/data/content/, and saves, creates and deletes entries by
   rewriting only their span of the file (jsonspan.ts). Guards: an entry is saved only if it is still what the page loaded
   (its hash), an id is deleted only when nothing uses it (data or code), every write keeps a backup outside the repository
   for undo, and files are replaced atomically. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { KINDS, type KindDef } from './kinds';
import { compact, entrySep, nodeAt, parse, patch, styleOf, type Json, type Node } from './jsonspan';

export class Conflict extends Error {}
export class BadRequest extends Error {}

export const ID_RE = /^[A-Za-z][A-Za-z0-9_]*$/;
const BACKUPS = join(tmpdir(), 'edabuilder-devboard-backups');
export const DATA = 'src/data/content';
export const hashOf = (v: Json) => createHash('sha1').update(JSON.stringify(v)).digest('hex').slice(0, 16);

export interface Entry { kind: string; src: number; key: string; id: string | null; label: string; hash: string; data: Json; n: number }
interface Located { text: string; root: Node; col: Node; index: number; start: number; end: number; node: Node; keyStart?: number }

export class Content {
  private undoStack: { id: number; file: string; before: string; after: string; what: string; at: number }[] = [];
  private undoNext = 1;   // undo entries keep their id, so a list the page drew earlier still names the right one
  constructor(readonly root: string) {}

  abs(file: string) {
    const p = resolve(this.root, file), data = resolve(this.root, DATA);
    if (!p.startsWith(data + sep)) throw new BadRequest(`refused path ${file}`);
    return p;
  }
  read(file: string) { return readFileSync(this.abs(file), 'utf8'); }
  kind(name: string): KindDef {
    const k = KINDS[name];
    if (!k) throw new BadRequest(`no kind ${name}`);
    return k;
  }

  /** Content files under src/data/content/, for the signature and the reference scan. */
  dataFiles(dir = DATA): string[] {
    const out: string[] = [];
    for (const f of readdirSync(join(this.root, dir))) {
      const rel = `${dir}/${f}`, st = statSync(join(this.root, rel));
      if (st.isDirectory()) out.push(...this.dataFiles(rel));
      else if (f.endsWith('.json')) out.push(rel);
    }
    return out.sort();
  }
  signature() {
    const h = createHash('sha1');
    for (const f of this.dataFiles()) { const st = statSync(join(this.root, f)); h.update(`${f}|${st.mtimeMs}|${st.size};`); }
    return h.digest('hex').slice(0, 16);
  }

  // ---------------- reading ----------------

  private collection(kind: KindDef, src: number, text?: string) {
    const s = kind.sources[src];
    if (!s) throw new BadRequest(`no source ${src}`);
    const t = text ?? this.read(s.file), root = parse(t), col = nodeAt(root, s.path ?? []);
    if (kind.shape === 'list' && col.kind !== 'arr') throw new Error(`${s.file}: expected a list`);
    if (kind.shape === 'map' && col.kind !== 'obj') throw new Error(`${s.file}: expected an object`);
    return { text: t, root, col };
  }

  entries(name: string): { entries: Entry[]; errors: string[] } {
    const kind = this.kind(name), entries: Entry[] = [], errors: string[] = [];
    kind.sources.forEach((s, src) => {
      try {
        const { col } = this.collection(kind, src);
        const list = kind.shape === 'map'
          ? col.members!.filter(m => !kind.skip?.includes(m.key)).map(m => ({ key: m.key, node: m.node }))
          : col.items!.map((node, i) => ({ key: kind.idKey ? String((node.value as Record<string, Json>)?.[kind.idKey] ?? i) : String(i), node }));
        list.forEach(({ key, node }, i) => {
          const id = kind.shape === 'map' ? key : kind.idKey ? key : null;
          entries.push({ kind: name, src, key, id, n: i + 1, hash: hashOf(node.value), data: node.value, label: labelOf(kind, node.value, key, i) });
        });
      } catch (e) { errors.push(`${s.file}: ${(e as Error).message}`); }
    });
    return { entries, errors };
  }

  private locate(kind: KindDef, src: number, key: string, text?: string): Located {
    const { text: t, root, col } = this.collection(kind, src, text);
    if (kind.shape === 'map') {
      const index = col.members!.findIndex(m => m.key === key);
      if (index < 0) throw new Conflict(`"${key}" is no longer in ${kind.sources[src].file} (deleted or renamed elsewhere). Reload.`);
      const m = col.members![index];
      return { text: t, root, col, index, start: m.keyStart, end: m.node.end, node: m.node, keyStart: m.keyStart };
    }
    const index = kind.idKey ? col.items!.findIndex(n => String((n.value as Record<string, Json>)?.[kind.idKey!]) === key) : Number(key);
    const node = col.items![index];
    if (!node) throw new Conflict(`entry ${key} is no longer in ${kind.sources[src].file}. Reload.`);
    return { text: t, root, col, index, start: node.start, end: node.end, node };
  }

  // ---------------- writing ----------------

  private write(file: string, before: string, after: string, what: string) {
    JSON.parse(after); // never write a file the game can't read
    const p = this.abs(file);
    mkdirSync(BACKUPS, { recursive: true });
    writeFileSync(join(BACKUPS, `${file.replace(/[\\/]/g, '_')}.${Date.now()}.bak`), before);
    const tmp = `${p}.devboard.tmp`;
    writeFileSync(tmp, after);
    renameSync(tmp, p);
    this.undoStack.push({ id: this.undoNext++, file, before, after, what, at: Date.now() });
    if (this.undoStack.length > 30) this.undoStack.shift();
  }

  /** The new file text for a save, without writing it (for the diff preview too). */
  private saved(name: string, src: number, key: string, data: Json, hash: string, newKey?: string) {
    const kind = this.kind(name), at = this.locate(kind, src, key);
    if (hashOf(at.node.value) !== hash) throw new Conflict(`"${key}" changed in the file since you opened it (another session or a hand edit). Reload and try again.`);
    const st = styleOf(at.text);
    let body = patch(at.text, at.node, data, st), start = at.node.start;
    if (kind.shape === 'map' && newKey && newKey !== key) {
      this.checkNewId(name, newKey);
      this.refuseIfUsed(name, key, 'rename');
      body = JSON.stringify(newKey) + at.text.slice(at.keyStart! + JSON.stringify(key).length, at.node.start) + body;
      start = at.keyStart!;
    }
    if (kind.shape === 'list' && kind.idKey) {
      const nid = String((data as Record<string, Json>)[kind.idKey] ?? '');
      if (nid !== key) { this.checkNewId(name, nid); this.refuseIfUsed(name, key, 'rename'); }
    }
    return { file: kind.sources[src].file, before: at.text, after: at.text.slice(0, start) + body + at.text.slice(at.end) };
  }

  save(name: string, src: number, key: string, data: Json, hash: string, newKey?: string) {
    const s = this.saved(name, src, key, data, hash, newKey);
    if (s.after !== s.before) this.write(s.file, s.before, s.after, `edit ${name} ${newKey ?? key}`);
    return { changed: s.after !== s.before };
  }

  preview(name: string, src: number, key: string, data: Json, hash: string, newKey?: string) {
    const s = this.saved(name, src, key, data, hash, newKey);
    return { diff: diffLines(s.before, s.after, s.file) };
  }

  /** A new entry, laid out like `like` (the entry it was duplicated from) or the collection's last entry. */
  create(name: string, src: number, data: Json, key?: string, like?: string) {
    const kind = this.kind(name), { text, col } = this.collection(kind, src), st = styleOf(text);
    let id = key ?? '';
    if (kind.shape === 'list' && kind.idKey) id = String((data as Record<string, Json>)?.[kind.idKey] ?? '');
    if (kind.shape === 'map' || kind.idKey) this.checkNewId(name, id);
    const nodes = kind.shape === 'map' ? col.members!.map(m => m.node) : col.items!;
    const starts = kind.shape === 'map' ? col.members!.map(m => m.keyStart) : nodes.map(n => n.start);
    const base = like != null ? this.locate(kind, src, like, text).node : nodes[nodes.length - 1];
    const body = base ? patch(text, base, data, st) : compact(data, st);
    let entry = body;
    if (kind.shape === 'map') {
      const m = col.members!.find(x => x.node === base);
      entry = JSON.stringify(id) + (m ? text.slice(m.keyStart + JSON.stringify(m.key).length, m.node.start) : ': ') + body;
    }
    let after: string;
    if (!nodes.length) after = text.slice(0, col.start + 1) + entry + text.slice(col.end - 1);
    else {
      const last = nodes[nodes.length - 1];
      after = text.slice(0, last.end) + entrySep(text, starts, nodes.map(n => n.end), col) + entry + text.slice(last.end);
    }
    this.write(kind.sources[src].file, text, after, `create ${name} ${id || '#' + (nodes.length + 1)}`);
    return { key: kind.shape === 'map' || kind.idKey ? id : String(nodes.length) };
  }

  remove(name: string, src: number, key: string, hash: string) {
    const kind = this.kind(name), at = this.locate(kind, src, key);
    if (hashOf(at.node.value) !== hash) throw new Conflict(`"${key}" changed in the file since you opened it. Reload and try again.`);
    if (kind.shape === 'map' || kind.idKey) this.refuseIfUsed(name, key, 'delete');
    const starts = kind.shape === 'map' ? at.col.members!.map(m => m.keyStart) : at.col.items!.map(n => n.start);
    const ends = kind.shape === 'map' ? at.col.members!.map(m => m.node.end) : at.col.items!.map(n => n.end);
    const i = at.index, t = at.text;
    let after: string;
    if (starts.length === 1) after = t.slice(0, at.col.start + 1) + t.slice(at.col.end - 1);
    else if (i < starts.length - 1) after = t.slice(0, starts[i]) + t.slice(starts[i + 1]);
    else after = t.slice(0, ends[i - 1]) + t.slice(ends[i]);
    this.write(kind.sources[src].file, t, after, `delete ${name} ${key}`);
    return { deleted: key };
  }

  undoList() { return this.undoStack.map((u) => ({ i: u.id, file: u.file, what: u.what, at: u.at })).reverse(); }
  undo(id: number) {
    const i = this.undoStack.findIndex((u) => u.id === id), u = this.undoStack[i];
    if (!u) throw new BadRequest('nothing to undo there');
    const now = this.read(u.file);
    if (now !== u.after) throw new Conflict(`${u.file} changed after that save, so it can't be undone safely.`);
    this.undoStack.splice(i, 1);
    const p = this.abs(u.file), tmp = `${p}.devboard.tmp`;
    writeFileSync(tmp, u.before);
    renameSync(tmp, p);
    return { undone: u.what };
  }

  // ---------------- ids and references ----------------

  private checkNewId(name: string, id: string) {
    if (!ID_RE.test(id)) throw new BadRequest(`"${id}" is not a valid id (a letter, then letters, digits or _).`);
    if (this.entries(name).entries.some(e => e.id === id)) throw new BadRequest(`${KINDS[name].title}: "${id}" exists already.`);
  }

  private refuseIfUsed(name: string, id: string, what: string) {
    const r = this.references(name, id);
    if (r.data.length || r.code.length)
      throw new Conflict(`Can't ${what} "${id}": it is still used by ${[...r.data.map(x => x.where), ...r.code.map(x => x.file)].slice(0, 8).join(', ')}${r.data.length + r.code.length > 8 ? ' …' : ''}. Remove those uses first.`);
  }

  /** Where an id is used: in data (string values and object keys equal to it, outside the entry itself) and in code
      (the id as a quoted string in src/, the content files aside). */
  references(name: string, id: string) {
    const kind = this.kind(name), data: { where: string; kind?: string; key?: string; src?: number }[] = [];
    const own = kind.sources.map(s => ({ file: s.file, path: s.path ?? [] }));
    for (const file of this.dataFiles()) {
      let v: Json;
      try { v = JSON.parse(this.read(file)); } catch { continue; }
      const self = (x: Json, path: string[]) => own.some(o => o.file === file && path.length === o.path.length + 1
        && o.path.every((p, k) => p === path[k]) && entryKeyAt(kind, x, path[path.length - 1]) === id);
      const walk = (x: Json, path: string[]) => {
        if (typeof x === 'string') { if (x === id) data.push(hit(file, path)); return; }
        if (Array.isArray(x)) { x.forEach((y, k) => { if (!self(y, [...path, String(k)])) walk(y, [...path, String(k)]); }); return; }
        if (x && typeof x === 'object') for (const [k, y] of Object.entries(x)) {
          if (self(y, [...path, k])) continue; // the entry itself
          if (k === id) data.push(hit(file, [...path, k]));
          walk(y, [...path, k]);
        }
      };
      walk(v, []);
    }
    const code: { file: string; count: number }[] = [];
    const quoted = new RegExp(`['"\`]${id}['"\`]`, 'g');
    for (const file of walkTs(join(this.root, 'src'))) {
      const n = (readFileSync(file, 'utf8').match(quoted) ?? []).length;
      if (n) code.push({ file: relative(this.root, file).split(sep).join('/'), count: n });
    }
    return { data: dedupe(data), code };
  }
}

function entryKeyAt(kind: KindDef, x: Json, last: string) {
  if (kind.shape === 'map') return last;
  return kind.idKey && x && typeof x === 'object' && !Array.isArray(x) ? String(x[kind.idKey]) : null;
}

/** A data path as the entry it falls in (kind and key) where one holds it. */
function hit(file: string, path: string[]) {
  for (const [name, k] of Object.entries(KINDS)) {
    for (let src = 0; src < k.sources.length; src++) {
      const s = k.sources[src], p = s.path ?? [];
      if (s.file !== file || path.length <= p.length || !p.every((x, i) => x === path[i])) continue;
      const key = path[p.length];
      if (k.skip?.includes(key)) continue;
      return { where: `${k.title} › ${key}${path.length > p.length + 1 ? ' › ' + path.slice(p.length + 1).join('.') : ''}`, kind: name, key, src };
    }
  }
  return { where: `${file} › ${path.join('.')}` };
}
function dedupe<T extends { where: string }>(xs: T[]) { const seen = new Set<string>(); return xs.filter(x => !seen.has(x.where) && seen.add(x.where)); }

function walkTs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap(d =>
    d.isDirectory() ? walkTs(join(dir, d.name)) : d.name.endsWith('.ts') ? [join(dir, d.name)] : []);
}

function labelOf(kind: KindDef, v: Json, key: string, i: number) {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  if (kind.labelKey && typeof o[kind.labelKey] === 'string') return o[kind.labelKey] as string;
  if (kind.labelFmt) return kind.labelFmt.replace(/\{(\w+)\}/g, (_, f: string) => f === 'n' ? String(i + 1)
    : Array.isArray(o[f]) ? (o[f] as Json[]).join(' + ') : String(o[f] ?? ''));
  return key;
}

/** A unified diff of two texts (whole lines, three lines of context). */
export function diffLines(a: string, b: string, file: string): string {
  const A = a.split('\n'), B = b.split('\n');
  let s = 0;
  while (s < A.length && s < B.length && A[s] === B[s]) s++;
  let ea = A.length - 1, eb = B.length - 1;
  while (ea >= s && eb >= s && A[ea] === B[eb]) { ea--; eb--; }
  if (s > ea && s > eb) return '';
  const from = Math.max(0, s - 3), toA = Math.min(A.length - 1, ea + 3), toB = Math.min(B.length - 1, eb + 3);
  const out = [`--- ${file}`, `+++ ${file}`, `@@ -${from + 1},${toA - from + 1} +${from + 1},${toB - from + 1} @@`];
  for (let k = from; k < s; k++) out.push(' ' + A[k]);
  for (let k = s; k <= ea; k++) out.push('-' + A[k]);
  for (let k = s; k <= eb; k++) out.push('+' + B[k]);
  for (let k = ea + 1; k <= toA; k++) out.push(' ' + A[k]);
  return out.join('\n');
}
