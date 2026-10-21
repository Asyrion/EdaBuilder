/**
 * Sprite atlas. Packs generated sprites into one canvas and exposes a manifest.
 * If public/art/atlas.json (+ atlas.png) exist they override the procedural atlas,
 * so hand-made art can be dropped in without touching code. The manifest format:
 * { "image": "atlas.png", "sprites": { name: { x, y, w, h, ax, ay, glow?: {x,y} } } }
 */
import { generateSprites, type SpriteDef } from './sprites';

export interface SpriteRect {
  x: number;
  y: number;
  w: number;
  h: number;
  ax: number;
  ay: number;
  glow?: { x: number; y: number };
  /** The sheet the rect points into, when not the atlas image (the mirrored sheet, iteration 58). */
  src?: CanvasImageSource;
}

/** A sprite's rect in the sheet mirrored left to right (W wide): the body and the glow move to W − x − w, the anchor to
 *  w − ax, so a sprite drawn at the same point is its own mirror image about the anchor (a building turned to its road). */
export function mirrorRect(r: SpriteRect, sheetW: number): SpriteRect {
  const m: SpriteRect = { x: sheetW - r.x - r.w, y: r.y, w: r.w, h: r.h, ax: r.w - r.ax, ay: r.ay };
  if (r.glow) m.glow = { x: sheetW - r.glow.x - r.w, y: r.glow.y };
  return m;
}

export interface AtlasManifest {
  image: string;
  sprites: Record<string, SpriteRect>;
}

export class SpriteAtlas {
  image!: HTMLCanvasElement | HTMLImageElement;
  sprites: Record<string, SpriteRect> = {};
  /** Names that came from public/art/sprites.json: an imported painting is the look for every people (iteration 51). */
  imported = new Set<string>();
  private missing = new Set<string>();
  private mirrorSheet: HTMLCanvasElement | null = null;
  private mirrorOf: unknown = null;
  private mirrorRects = new Map<string, SpriteRect>();

  /** The sprite mirrored left to right, drawn from one mirrored copy of the sheet made on first use (iteration 58). */
  mirrored(name: string): SpriteRect | null {
    const s = this.get(name);
    if (!s) return null;
    if (this.mirrorOf !== this.image || !this.mirrorSheet) {
      const c = document.createElement('canvas');
      c.width = this.image.width;
      c.height = this.image.height;
      const ctx = c.getContext('2d')!;
      ctx.translate(c.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(this.image, 0, 0);
      this.mirrorSheet = c;
      this.mirrorOf = this.image;
      this.mirrorRects.clear();
    }
    let m = this.mirrorRects.get(name);
    if (!m) { m = { ...mirrorRect(s, this.image.width), src: this.mirrorSheet }; this.mirrorRects.set(name, m); }
    return m;
  }

  get(name: string): SpriteRect | null {
    const s = this.sprites[name];
    if (s) return s;
    if (!this.missing.has(name)) {
      this.missing.add(name);
      console.warn('missing sprite', name);
    }
    return null;
  }

  has(name: string): boolean {
    return name in this.sprites;
  }

  /** How many `${prefix}0..N-1` sprites the atlas holds (tree_, bush_, mushroom_: the imported set may add more than the procedural one). */
  countVariants(prefix: string): number {
    let n = 0;
    while (this.has(`${prefix}${n}`)) n++;
    return n;
  }

  static fromGenerated(): SpriteAtlas {
    const defs = generateSprites();
    const atlas = new SpriteAtlas();
    const { canvas, rects } = pack(defs);
    atlas.image = canvas;
    atlas.sprites = rects;
    return atlas;
  }

  /** Try to load an override atlas; resolves to null if none exists. */
  static async fromOverride(base: string): Promise<SpriteAtlas | null> {
    try {
      const res = await fetch(`${base}art/atlas.json`, { cache: 'no-cache' });
      if (!res.ok) return null;
      const manifest = (await res.json()) as AtlasManifest;
      const img = new Image();
      img.src = `${base}art/${manifest.image}`;
      await img.decode();
      const atlas = new SpriteAtlas();
      atlas.image = img;
      atlas.sprites = manifest.sprites;
      return atlas;
    } catch {
      return null;
    }
  }

  manifest(): AtlasManifest {
    return { image: 'atlas.png', sprites: this.sprites };
  }

  /**
   * Per-sprite overrides (iteration 49): public/art/sprites.json lists PNGs made by scripts/importSprites.mjs
   * ({ sheets?, sprites: { name: { file, glow?, w, h, ax, ay, sheet?, sx?, sy?, gsheet?, gx?, gy?, gw?, gh? } } }). Each is
   * packed below the current atlas and replaces the sprite of that name; a file that fails to load leaves the generated
   * sprite in place. Since iteration 90 the pixels come from a few sheets loaded at once (a thousand single files, fetched
   * one after another, kept the page blank for a minute over the internet); a manifest without sheets, or an entry whose
   * sheet failed, loads its single files, 24 at a time. A sheet's name carries its content hash; a single file is asked for
   * with the hash of the sheet that holds it (`?v=`), so the browser's cache never pairs a new manifest with an old file. `onProgress` hears
   * the sprites done (never fewer than before) out of all. Resolves to the count merged.
   */
  async mergeOverrides(base: string, onProgress?: (done: number, total: number) => void): Promise<number> {
    let manifest: ImportManifest;
    try {
      const res = await fetch(`${base}art/sprites.json`, { cache: 'no-cache' });
      if (!res.ok) return 0;
      manifest = (await res.json()) as ImportManifest;
    } catch {
      return 0;
    }
    const entries = Object.entries(manifest.sprites ?? {});
    const sheetList = manifest.sheets ?? [];
    const sheets = await Promise.all(sheetList.map((s) =>
      loadImage(`${base}art/${s.file}`)
        .then((img) => { if (img.width !== s.w || img.height !== s.h) throw new Error('size'); return img; })
        .catch(() => { console.warn('sprite sheet failed to load', s.file); return null; })));
    // each entry's pixels: a cut from its sheet, or (no sheet, or its sheet failed) its single files
    const cuts: (Loaded | null)[] = entries.map(([, e]) => {
      const body = e.sheet !== undefined ? sheets[e.sheet] : null;
      if (!body) return null;
      if (!e.glow) return { body: { src: body, x: e.sx ?? 0, y: e.sy ?? 0, w: e.w, h: e.h }, glow: null };
      const glow = e.gsheet !== undefined ? sheets[e.gsheet] : null;
      if (!glow) return null;
      return { body: { src: body, x: e.sx ?? 0, y: e.sy ?? 0, w: e.w, h: e.h }, glow: { src: glow, x: e.gx ?? 0, y: e.gy ?? 0, w: e.gw ?? e.w, h: e.gh ?? e.h } };
    });
    const single = entries.map((_, i) => i).filter((i) => !cuts[i]);
    let done = entries.length - single.length; // progress counts sprites: the sheets' all at once, then each single file
    onProgress?.(done, entries.length);
    await pool(24, single.map((i) => async () => {
      const [name, e] = entries[i];
      const v = (n?: number) => (n !== undefined && sheetList[n] ? `?v=${sheetList[n].hash}` : '');
      try {
        const img = await loadImage(`${base}art/${e.file}${v(e.sheet)}`);
        const glow = e.glow ? await loadImage(`${base}art/${e.glow}${v(e.gsheet)}`).catch(() => null) : null;
        cuts[i] = { body: whole(img), glow: glow && whole(glow) };
      } catch {
        console.warn('imported sprite failed to load', name);
      }
      onProgress?.(++done, entries.length);
    }));
    const loaded = entries.flatMap(([name, e], i) => { const c = cuts[i]; return c ? [{ name, e, ...c }] : []; });
    if (!loaded.length) return 0;
    const items: { w: number; h: number }[] = [];
    for (const l of loaded) { items.push(l.body); if (l.glow) items.push(l.glow); }
    const startY = this.image.height + 1;
    const { pos, height } = shelfPack(items, 1024, startY);
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false; // every cut is copied 1:1
    ctx.drawImage(this.image, 0, 0);
    const draw = (c: Cut, at: { x: number; y: number }) => ctx.drawImage(c.src, c.x, c.y, c.w, c.h, at.x, at.y, c.w, c.h);
    let k = 0;
    for (const l of loaded) {
      const p = pos[k++];
      draw(l.body, p);
      const rect: SpriteRect = { x: p.x, y: p.y, w: l.body.w, h: l.body.h, ax: l.e.ax, ay: l.e.ay };
      if (l.glow) { const g = pos[k++]; draw(l.glow, g); rect.glow = { x: g.x, y: g.y }; }
      this.sprites[l.name] = rect;
      this.imported.add(l.name);
      this.missing.delete(l.name);
    }
    this.image = canvas;
    return loaded.length;
  }
}

export interface ImportEntry {
  file: string;
  glow?: string;
  w: number;
  h: number;
  ax: number;
  ay: number;
  /** Where the pixels sit in manifest.sheets (iteration 90): the body at sheet/sx/sy, the glow at gsheet/gx/gy, gw × gh. */
  sheet?: number;
  sx?: number;
  sy?: number;
  gsheet?: number;
  gx?: number;
  gy?: number;
  gw?: number;
  gh?: number;
}
/** A sheet of imported sprites (iteration 90): its hash is its content's, and part of its file name. */
export interface ImportSheet { file: string; w: number; h: number; hash: string }
export interface ImportManifest { sheets?: ImportSheet[]; sprites: Record<string, ImportEntry> }

/** A piece of an image: a sheet's rect, or a whole single file. */
interface Cut { src: CanvasImageSource; x: number; y: number; w: number; h: number }
interface Loaded { body: Cut; glow: Cut | null }
const whole = (img: HTMLImageElement): Cut => ({ src: img, x: 0, y: 0, w: img.width, h: img.height });

/** Runs the jobs at most n at a time. */
async function pool(n: number, jobs: (() => Promise<void>)[]): Promise<void> {
  let next = 0;
  const worker = async () => { while (next < jobs.length) await jobs[next++](); };
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, worker));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed ${src}`));
    img.src = src;
  });
}

/** A zone building's sprite: every people its own (iteration 82). A people's slot shows its own imported painting or, where
 *  none was drawn yet, its own drawn house; no people borrows another's painting (iteration 51's shared look is gone). */
export function zoneSpriteName(_atlas: { imported: Set<string> }, kind: string, level: number, variant: number): string {
  return `${kind}_l${level}_v${variant % 4}`;
}

/** A building's look (iteration 83): where the atlas holds `<base>_v0..N-1` (the user's paintings), one of them chosen by the
 *  building's tile, the same every frame and every load; else the base sprite. `counts` caches N per base. */
export function lookName(atlas: { countVariants(prefix: string): number }, base: string, x: number, y: number, counts?: Map<string, number>): string {
  let n = counts?.get(base);
  if (n === undefined) { n = atlas.countVariants(`${base}_v`); counts?.set(base, n); }
  if (n === 0) return base;
  const h = Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663);
  return `${base}_v${(h >>> 0) % n}`;
}

/** Shelf packing in the given order, from startY down, 1 px gutters. Pure, so a test can hold it to no overlaps. */
export function shelfPack(items: { w: number; h: number }[], W = 1024, startY = 0): { pos: { x: number; y: number }[]; height: number } {
  let x = 0;
  let y = startY;
  let shelf = 0;
  const pos: { x: number; y: number }[] = [];
  for (const it of items) {
    if (x + it.w + 1 > W) {
      x = 0;
      y += shelf + 1;
      shelf = 0;
    }
    pos.push({ x, y });
    x += it.w + 1;
    shelf = Math.max(shelf, it.h);
  }
  return { pos, height: y + shelf + 1 };
}

function pack(defs: SpriteDef[]): { canvas: HTMLCanvasElement; rects: Record<string, SpriteRect> } {
  // shelf packing sorted by height
  const items: { def: SpriteDef; w: number; h: number; glow: boolean }[] = [];
  for (const d of defs) {
    items.push({ def: d, w: d.p.w, h: d.p.h, glow: false });
    if (d.glow) items.push({ def: d, w: d.glow.w, h: d.glow.h, glow: true });
  }
  items.sort((a, b) => b.h - a.h);
  const W = 1024;
  const { pos, height: H } = shelfPack(items, W, 0);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const rects: Record<string, SpriteRect> = {};
  items.forEach((it, i) => {
    const p = it.glow ? it.def.glow! : it.def.p;
    const img = new ImageData(new Uint8ClampedArray(p.data), p.w, p.h);
    ctx.putImageData(img, pos[i].x, pos[i].y);
    if (!it.glow) rects[it.def.name] = { x: pos[i].x, y: pos[i].y, w: p.w, h: p.h, ax: it.def.ax, ay: it.def.ay };
  });
  items.forEach((it, i) => {
    if (it.glow) rects[it.def.name].glow = { x: pos[i].x, y: pos[i].y };
  });
  return { canvas, rects };
}
