// The master palette for the art scripts (docs/ART_BIBLE.md §4): OKLab, the palette from art/palette.json, and the snap.
// src/render/master.ts does the same sum for the game; tests/render-atlas.test.ts holds the two to the same choice.
import { readFileSync } from 'node:fs';

const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
/** sRGB 0..255 → OKLab. */
export function oklab([r, g, b]) {
  r = lin(r); g = lin(g); b = lin(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
const unlin = (c) => Math.round(255 * Math.max(0, Math.min(1, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)));
/** OKLab → sRGB 0..255. */
export function fromOklab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [unlin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), unlin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), unlin(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
}
export const dE = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
export const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
export const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** art/palette.json: the ramps, the colours as { h, rgb, lab, ramp }, and the snap's chroma weight. */
export function loadPalette(path = new URL('../../art/palette.json', import.meta.url)) {
  const json = JSON.parse(readFileSync(path, 'utf8'));
  const colors = json.ramps.flatMap((r) => r.colors.map((h) => ({ h, rgb: rgbOf(h), lab: oklab(rgbOf(h)), ramp: r.id })));
  return { json, colors, chroma: json.snap?.chroma ?? 2 };
}

/** The palette colour a pixel snaps to: nearest in OKLab with a and b weighed `chroma` times. */
export function nearest(rgb, colors, chroma = 2) {
  const lab = oklab(rgb);
  let best = colors[0], bd = Infinity;
  for (const c of colors) {
    const d = (lab[0] - c.lab[0]) ** 2 + chroma * chroma * ((lab[1] - c.lab[1]) ** 2 + (lab[2] - c.lab[2]) ** 2);
    if (d < bd) { bd = d; best = c; }
  }
  return { c: best, d: dE(lab, best.lab) };
}

/** Snap every pixel with any alpha to the palette (alpha kept); returns a new image and the mean and worst ΔE. */
export function snapImage(img, pal = loadPalette(), memo = new Map()) {
  const out = { w: img.w, h: img.h, data: new Uint8ClampedArray(img.data) };
  let sum = 0, n = 0, worst = 0;
  for (let o = 0; o < out.data.length; o += 4) {
    if (out.data[o + 3] === 0) continue;
    const k = (out.data[o] << 16) | (out.data[o + 1] << 8) | out.data[o + 2];
    let m = memo.get(k);
    if (!m) { m = nearest([out.data[o], out.data[o + 1], out.data[o + 2]], pal.colors, pal.chroma); memo.set(k, m); }
    out.data[o] = m.c.rgb[0]; out.data[o + 1] = m.c.rgb[1]; out.data[o + 2] = m.c.rgb[2];
    sum += m.d; n++; worst = Math.max(worst, m.d);
  }
  return { img: out, mean: n ? sum / n : 0, worst };
}
