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
   * ({ sprites: { name: { file, glow?, w, h, ax, ay } } }). Each is packed below the current atlas and replaces the
   * sprite of that name; a file that fails to load leaves the generated sprite in place. Resolves to the count merged.
   */
  async mergeOverrides(base: string): Promise<number> {
    let manifest: ImportManifest;
    try {
      const res = await fetch(`${base}art/sprites.json`, { cache: 'no-cache' });
      if (!res.ok) return 0;
      manifest = (await res.json()) as ImportManifest;
    } catch {
      return 0;
    }
    const loaded: { name: string; img: HTMLImageElement; glow: HTMLImageElement | null; e: ImportEntry }[] = [];
    for (const [name, e] of Object.entries(manifest.sprites ?? {})) {
      try {
        const img = await loadImage(`${base}art/${e.file}`);
        const glow = e.glow ? await loadImage(`${base}art/${e.glow}`).catch(() => null) : null;
        loaded.push({ name, img, glow, e });
      } catch {
        console.warn('imported sprite failed to load', name);
      }
    }
    if (!loaded.length) return 0;
    const items: { w: number; h: number }[] = [];
    for (const l of loaded) { items.push({ w: l.img.width, h: l.img.height }); if (l.glow) items.push({ w: l.glow.width, h: l.glow.height }); }
    const startY = this.image.height + 1;
    const { pos, height } = shelfPack(items, 1024, startY);
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(this.image, 0, 0);
    let k = 0;
    for (const l of loaded) {
      const p = pos[k++];
      ctx.drawImage(l.img, p.x, p.y);
      const rect: SpriteRect = { x: p.x, y: p.y, w: l.img.width, h: l.img.height, ax: l.e.ax, ay: l.e.ay };
      if (l.glow) { const g = pos[k++]; ctx.drawImage(l.glow, g.x, g.y); rect.glow = { x: g.x, y: g.y }; }
      this.sprites[l.name] = rect;
      this.imported.add(l.name);
      this.missing.delete(l.name);
    }
    this.image = canvas;
    return loaded.length;
  }
}

export interface ImportEntry { file: string; glow?: string; w: number; h: number; ax: number; ay: number }
export interface ImportManifest { sprites: Record<string, ImportEntry> }

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed ${src}`));
    img.src = src;
  });
}

/** Shelf packing in the given order, from startY down, 1 px gutters. Pure, so a test can hold it to no overlaps. */
/** A zone building's sprite: the people's copy, unless the base was imported (one painting is the look for everyone). */
export function zoneSpriteName(atlas: { imported: Set<string> }, kind: string, level: number, variant: number, suffix: string): string {
  const base = `${kind}_l${level}_v${variant % 4}`;
  return suffix && !atlas.imported.has(base) ? `${base}${suffix}` : base;
}

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
