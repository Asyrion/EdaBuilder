/** The master palette at work in the game (scope reset phase 3-2, docs/ART_BIBLE.md §4): every sprite the game paints is
 *  snapped to art/palette.json before it goes into the atlas. The same sum as scripts/lib/palette.mjs (the importer's);
 *  tests/render-atlas.test.ts holds the two to the same choice. */
import paletteJson from '../../art/palette.json';

type Lab = [number, number, number];
const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
export function oklab(r: number, g: number, b: number): Lab {
  r = lin(r); g = lin(g); b = lin(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

interface PaletteFile { ramps: { id: string; colors: string[] }[]; snap?: { chroma?: number } }
const file = paletteJson as PaletteFile;
/** The palette's colours as packed 0xRRGGBB, in the file's order. */
export const MASTER: number[] = file.ramps.flatMap((r) => r.colors.map((h) => parseInt(h.slice(1), 16)));
const LABS: Lab[] = MASTER.map((c) => oklab(c >> 16, (c >> 8) & 255, c & 255));
const CHROMA2 = (file.snap?.chroma ?? 2) ** 2;
const memo = new Map<number, number>();

/** The palette colour (0xRRGGBB) a colour snaps to: nearest in OKLab, hue and chroma weighed by the file's `snap.chroma`. */
export function snapColour(rgb: number): number {
  let m = memo.get(rgb);
  if (m !== undefined) return m;
  const [L, a, b] = oklab(rgb >> 16, (rgb >> 8) & 255, rgb & 255);
  let best = 0, bd = Infinity;
  for (let i = 0; i < LABS.length; i++) {
    const q = LABS[i];
    const d = (L - q[0]) ** 2 + CHROMA2 * ((a - q[1]) ** 2 + (b - q[2]) ** 2);
    if (d < bd) { bd = d; best = i; }
  }
  m = MASTER[best];
  memo.set(rgb, m);
  return m;
}

/** Snap an RGBA buffer in place: every pixel with any alpha takes its palette colour, the alpha stays. */
export function snapRgba(data: Uint8ClampedArray): void {
  for (let o = 0; o < data.length; o += 4) {
    if (data[o + 3] === 0) continue;
    const c = snapColour((data[o] << 16) | (data[o + 1] << 8) | data[o + 2]);
    data[o] = c >> 16; data[o + 1] = (c >> 8) & 255; data[o + 2] = c & 255;
  }
}

const MASTER_SET = new Set(MASTER);
/** True if a colour is one of the palette's. */
export function onPalette(rgb: number): boolean {
  return MASTER_SET.has(rgb);
}
