/** Iteration 90 (hotfix): the slow first load. The imported sprites ship packed in a few sheets (`npm run art` writes them),
 *  and the atlas loads the sheets at once instead of a thousand single files one after another. The sheets hold every
 *  sprite pixel for pixel; a sheet that fails, or a manifest without sheets, falls back to the single files, 24 at a time,
 *  and either way the atlas ends up with the same rects. */
import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { decodePng } from '../scripts/lib/png.mjs';
import { packSheets } from '../scripts/lib/sprite.mjs';
import { SpriteAtlas, type ImportManifest } from '../src/render/atlas';

const manifest = JSON.parse(readFileSync('public/art/sprites.json', 'utf8')) as ImportManifest;
const entries = Object.entries(manifest.sprites);
const sheets = manifest.sheets ?? [];
type Img = { w: number; h: number; data: Uint8ClampedArray };
const decoded = new Map<string, Img>();
const png = (file: string): Img => { if (!decoded.has(file)) decoded.set(file, decodePng(readFileSync(`public/art/${file}`)) as Img); return decoded.get(file)!; };

/** The rect of `sheet` at (x, y), w × h, equals `img` in every byte. */
function same(sheet: Img, x: number, y: number, img: Img): boolean {
  for (let r = 0; r < img.h; r++) {
    const a = sheet.data.subarray(((y + r) * sheet.w + x) * 4, ((y + r) * sheet.w + x + img.w) * 4);
    const b = img.data.subarray(r * img.w * 4, (r + 1) * img.w * 4);
    for (let k = 0; k < b.length; k++) if (a[k] !== b[k]) return false;
  }
  return true;
}

describe('The sprite sheets', () => {
  it('the manifest lists one to four sheets, each at most 2048 × 2048, named by its content\'s hash', () => {
    expect(sheets.length).toBeGreaterThanOrEqual(1);
    expect(sheets.length).toBeLessThanOrEqual(4);
    for (const s of sheets) {
      expect(existsSync(`public/art/${s.file}`)).toBe(true);
      const img = png(s.file);
      expect([img.w, img.h]).toEqual([s.w, s.h]);
      expect(s.w).toBeLessThanOrEqual(2048);
      expect(s.h).toBeLessThanOrEqual(2048);
      expect(s.hash).toBe(createHash('sha256').update(readFileSync(`public/art/${s.file}`)).digest('hex').slice(0, 12));
      expect(s.file).toBe(`sheets/sheet_${sheets.indexOf(s)}.${s.hash}.png`); // the name carries the hash: no host can serve an old sheet under it
    }
  });

  it('every sprite and glow sits inside its sheet and matches its own PNG pixel for pixel', () => {
    let glows = 0;
    for (const [name, e] of entries) {
      expect(e.sheet, name).toBeTypeOf('number');
      const sheet = png(sheets[e.sheet!].file);
      const body = png(e.file);
      expect([body.w, body.h], name).toEqual([e.w, e.h]);
      expect(e.sx! >= 0 && e.sy! >= 0 && e.sx! + e.w <= sheet.w && e.sy! + e.h <= sheet.h, name).toBe(true);
      expect(same(sheet, e.sx!, e.sy!, body), name).toBe(true);
      if (!e.glow) continue;
      glows++;
      const gs = png(sheets[e.gsheet!].file);
      const glow = png(e.glow);
      expect([glow.w, glow.h], name).toEqual([e.gw, e.gh]);
      expect(e.gx! >= 0 && e.gy! >= 0 && e.gx! + glow.w <= gs.w && e.gy! + glow.h <= gs.h, name).toBe(true);
      expect(same(gs, e.gx!, e.gy!, glow), name).toBe(true);
    }
    expect(entries.length).toBeGreaterThan(550); // 834 before the scope reset parked the other peoples' looks (659 after, 589 after phase 1c-1)
    expect(glows).toBeGreaterThan(100);
  });

  it('entries that share a file (aliases, hop frames) share one place in the sheet', () => {
    const at = new Map<string, string>();
    for (const [, e] of entries) {
      const here = `${e.sheet}:${e.sx}:${e.sy}`;
      if (at.has(e.file)) expect(here).toBe(at.get(e.file));
      else at.set(e.file, here);
    }
    const places = new Set(at.values());
    expect(places.size).toBe(at.size); // no two files packed on top of each other
  });

  it('packSheets keeps items apart, starts a new sheet when one is full, and refuses an item larger than a sheet', () => {
    const items = Array.from({ length: 40 }, (_, i) => ({ w: 30 + (i % 7) * 9, h: 20 + (i % 5) * 11 }));
    const { pos, sheets: out } = packSheets(items, 200, 150);
    expect(out.length).toBeGreaterThan(1);
    for (let i = 0; i < items.length; i++) {
      const a = { ...pos[i], ...items[i] };
      expect(a.x + a.w <= 200 && a.y + a.h <= out[a.sheet].h && out[a.sheet].h <= 150).toBe(true);
      for (let j = i + 1; j < items.length; j++) {
        const b = { ...pos[j], ...items[j] };
        const overlap = a.sheet === b.sheet && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap).toBe(false);
      }
    }
    expect(() => packSheets([{ w: 300, h: 10 }], 200, 150)).toThrow();
  });
});

// A stand-in for the browser: fetch serves the manifest, Image "loads" a file after a tick (or fails), a canvas records draws.
type Draw = { src: string; sx: number; sy: number; w: number; h: number; dx: number; dy: number };
const g = globalThis as Record<string, unknown>;
const saved = { fetch: g.fetch, Image: g.Image, document: g.document };
afterEach(() => Object.assign(g, saved));

function browser(serve: ImportManifest, fail: (url: string) => boolean) {
  const requested: string[] = [];
  let inFlight = 0;
  let peak = 0;
  const draws: Draw[] = [];
  g.fetch = async () => ({ ok: true, json: async () => serve });
  g.Image = class {
    onload: () => void = () => {};
    onerror: () => void = () => {};
    width = 0;
    height = 0;
    url = '';
    set src(url: string) {
      this.url = url;
      requested.push(url);
      peak = Math.max(peak, ++inFlight);
      setTimeout(() => {
        inFlight--;
        const file = url.replace(/^\/?art\//, '').replace(/\?v=\w+$/, '');
        if (fail(url) || !existsSync(`public/art/${file}`)) { this.onerror(); return; }
        const size = png(file); // the file's own size, so the atlas's size check meets what a browser would decode
        this.width = size.w;
        this.height = size.h;
        this.onload();
      }, 0);
    }
  };
  g.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        imageSmoothingEnabled: true,
        drawImage: (src: { url?: string }, sx: number, sy: number, w?: number, h?: number, dx?: number, dy?: number) => {
          if (w === undefined) return; // the old atlas drawn under the new
          draws.push({ src: src.url ?? '', sx, sy, w, h: h!, dx: dx!, dy: dy! });
        },
      }),
    }),
  };
  return { requested, draws, peak: () => peak };
}

const DRAWN = { x: 1, y: 2, w: 3, h: 4, ax: 1, ay: 3 }; // a drawn sprite of every imported name, under the merge

async function merge(serve: ImportManifest, fail: (url: string) => boolean = () => false) {
  const b = browser(serve, fail);
  const atlas = new SpriteAtlas();
  atlas.image = { width: 1024, height: 400 } as unknown as HTMLCanvasElement;
  for (const [name] of entries) atlas.sprites[name] = { ...DRAWN };
  const progress: [number, number][] = [];
  const n = await atlas.mergeOverrides('/', (done, total) => progress.push([done, total]));
  return { ...b, atlas, n, progress };
}

describe('The atlas loads the sheets', () => {
  it('with sheets it asks for the sheets only, by hash, and cuts every sprite from them', async () => {
    const r = await merge(manifest);
    expect(r.requested).toEqual(sheets.map((s) => `/art/${s.file}`));
    expect(r.n).toBe(entries.length);
    expect(r.progress).toEqual([[entries.length, entries.length]]); // the sheets' sprites all at once
    const at = new Map(r.draws.map((d) => [`${d.dx},${d.dy}`, d]));
    const url = (n: number) => `/art/${sheets[n].file}`;
    for (const [name, e] of entries) {
      const rect = r.atlas.sprites[name];
      expect(at.get(`${rect.x},${rect.y}`), name).toEqual({ src: url(e.sheet!), sx: e.sx, sy: e.sy, w: e.w, h: e.h, dx: rect.x, dy: rect.y });
      expect(!!rect.glow, name).toBe(!!e.glow);
      if (e.glow) expect(at.get(`${rect.glow!.x},${rect.glow!.y}`), name).toEqual({ src: url(e.gsheet!), sx: e.gx, sy: e.gy, w: e.gw, h: e.gh, dx: rect.glow!.x, dy: rect.glow!.y });
      expect(r.atlas.imported.has(name)).toBe(true);
    }
    expect(r.draws.length).toBe(entries.length + entries.filter(([, e]) => e.glow).length);
  });

  it('a failed sheet, or a manifest without sheets, loads the single files 24 at a time into the same rects', async () => {
    const fromSheets = await merge(manifest);
    const failed = await merge(manifest, (url) => url.includes('sheets/'));
    const old = await merge({ sprites: manifest.sprites });
    for (const r of [failed, old]) {
      expect(r.n).toBe(entries.length);
      expect(r.atlas.sprites).toEqual(fromSheets.atlas.sprites);
      expect(r.peak()).toBeLessThanOrEqual(24);
      expect(r.peak()).toBeGreaterThan(1);
      expect(r.progress.at(-1)).toEqual([entries.length, entries.length]);
      for (let k = 1; k < r.progress.length; k++) expect(r.progress[k][0]).toBeGreaterThanOrEqual(r.progress[k - 1][0]); // never back
      expect(new Set(r.progress.map((p) => p[1])).size).toBe(1);
      const [name, e] = entries.find(([, x]) => x.glow)!;
      const rect = r.atlas.sprites[name];
      const v = r === failed ? `?v=${sheets[e.sheet!].hash}` : ''; // a single file is asked for with its sheet's hash, when it has one
      expect(r.draws.find((x) => x.dx === rect.glow!.x && x.dy === rect.glow!.y)).toMatchObject({ src: `/art/${e.glow}${v}`, sx: 0, sy: 0 });
      expect(r.draws.find((x) => x.dx === rect.x && x.dy === rect.y)).toMatchObject({ src: `/art/${e.file}${v}`, sx: 0, sy: 0 });
    }
  });

  it('a sheet of the wrong size is refused like a failed one', async () => {
    const fromSheets = await merge(manifest);
    const r = await merge({ ...manifest, sheets: sheets.map((s) => ({ ...s, h: s.h + 1 })) });
    expect(r.n).toBe(entries.length);
    expect(r.atlas.sprites).toEqual(fromSheets.atlas.sprites);
    expect(r.draws.every((d) => d.src.startsWith('/art/sprites/'))).toBe(true);
  });

  it('an entry whose glow sheet fails loads body and glow as single files; the others are still cut from their sheet', async () => {
    const fromSheets = await merge(manifest);
    const two: ImportManifest = {
      sheets: [...sheets, { file: 'sheets/missing.png', w: 2048, h: 10, hash: 'f00' }],
      sprites: Object.fromEntries(entries.map(([name, e]) => [name, e.glow ? { ...e, gsheet: 1 } : e])),
    };
    const r = await merge(two);
    expect(r.n).toBe(entries.length);
    expect(r.atlas.sprites).toEqual(fromSheets.atlas.sprites);
    const at = new Map(r.draws.map((d) => [`${d.dx},${d.dy}`, d]));
    for (const [name, e] of entries) {
      const rect = r.atlas.sprites[name];
      const body = at.get(`${rect.x},${rect.y}`)!;
      if (e.glow) {
        expect(body.src, name).toBe(`/art/${e.file}?v=${sheets[e.sheet!].hash}`);
        expect(at.get(`${rect.glow!.x},${rect.glow!.y}`)!.src, name).toBe(`/art/${e.glow}?v=f00`); // the glow's own sheet's hash
      } else expect(body.src, name).toBe(`/art/${sheets[e.sheet!].file}`);
    }
  });

  it('a sprite whose single file fails keeps the drawn sprite; the rest still load', async () => {
    const [lost] = entries[0];
    const r = await merge({ sprites: manifest.sprites }, (url) => url.endsWith(`/${lost}.png`));
    expect(r.n).toBe(entries.filter(([, e]) => e.file !== `sprites/${lost}.png`).length);
    expect(r.atlas.imported.has(lost)).toBe(false);
    expect(r.atlas.sprites[lost]).toEqual(DRAWN);
  });

  it('a sprite whose glow file fails is imported without its glow', async () => {
    const [lit, e] = entries.find(([, x]) => x.glow)!;
    const r = await merge({ sprites: manifest.sprites }, (url) => url.endsWith(`/${e.glow!.split('/').pop()}`));
    expect(r.n).toBe(entries.length);
    expect(r.atlas.imported.has(lit)).toBe(true);
    expect(r.atlas.sprites[lit].glow).toBeUndefined();
    expect([r.atlas.sprites[lit].w, r.atlas.sprites[lit].h]).toEqual([e.w, e.h]);
  });
});
