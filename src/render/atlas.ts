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
  let x = 0;
  let y = 0;
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
  const H = y + shelf + 1;
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
