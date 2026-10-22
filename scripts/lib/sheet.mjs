// The imported sprites as the game has them (scope reset phase 1d): the build ships only the sheets and
// public/art/sprites.json, so a tool that wants one sprite's pixels cuts it from its sheet here.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodePng, encodePng } from './png.mjs';
import { cropRect } from './sprite.mjs';

const sheets = new Map();

/** public/art/sprites.json under `root`, or null when there is none. */
export function readManifest(root) {
  const p = join(root, 'public/art/sprites.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}

function sheetImage(root, manifest, n) {
  const s = manifest.sheets?.[n];
  if (!s) return null;
  const p = join(root, 'public/art', s.file);
  if (!sheets.has(p)) sheets.set(p, existsSync(p) ? decodePng(readFileSync(p)) : null);
  return sheets.get(p);
}

/** One imported sprite's pixels ({ w, h, data }), its body or its glow, cut from its sheet; null when it has none. */
export function spriteImage(root, manifest, entry, glow = false) {
  if (!entry) return null;
  if (glow) {
    if (!entry.glow || entry.gsheet === undefined) return null;
    const img = sheetImage(root, manifest, entry.gsheet);
    return img && cropRect(img, [entry.gx, entry.gy, entry.gw ?? entry.w, entry.gh ?? entry.h]);
  }
  if (entry.sheet === undefined) return null;
  const img = sheetImage(root, manifest, entry.sheet);
  return img && cropRect(img, [entry.sx, entry.sy, entry.w, entry.h]);
}

/** The same as a PNG file's bytes, for a sprite by name; null when the manifest has no such sprite. */
export function spritePng(root, name, glow = false) {
  const manifest = readManifest(root);
  const img = manifest && spriteImage(root, manifest, manifest.sprites?.[name], glow);
  return img ? Buffer.from(encodePng(img)) : null;
}
