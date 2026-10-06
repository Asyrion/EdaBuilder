// Pure, deterministic steps that turn a reference painting into a game sprite (iteration 49). Every function takes and
// returns { w, h, data } RGBA images and never touches the DOM or Math.random, so vitest can hold them to their word.

export function blank(w, h) { return { w, h, data: new Uint8ClampedArray(w * h * 4) }; }

/** Key out the near-white background by flood fill from the four corners, so a white window inside the building survives. */
export function keyBackground(img, white = 235, holes = 0) {
  const { w, h } = img;
  const data = new Uint8ClampedArray(img.data);
  const seen = new Uint8Array(w * h);
  const stack = [];
  const isBg = (i) => data[i * 4] >= white && data[i * 4 + 1] >= white && data[i * 4 + 2] >= white && data[i * 4 + 3] > 0;
  for (const i of [0, w - 1, (h - 1) * w, h * w - 1]) if (isBg(i)) { stack.push(i); seen[i] = 1; }
  while (stack.length) {
    const i = stack.pop();
    data[i * 4 + 3] = 0;
    const x = i % w, y = (i / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (!seen[j] && isBg(j)) { seen[j] = 1; stack.push(j); }
    }
  }
  // holes (iteration 74): a background region the outline encloses (the loop of a coiled wyrm) is keyed too when it holds at
  // least `holes` pixels; smaller light patches are highlights and stay
  if (holes > 0) for (let start = 0; start < w * h; start++) {
    if (seen[start] || !isBg(start)) continue;
    const region = [start]; seen[start] = 1;
    for (let k = 0; k < region.length; k++) {
      const i = region[k], x = i % w, y = (i / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (!seen[j] && isBg(j)) { seen[j] = 1; region.push(j); }
      }
    }
    if (region.length >= holes) for (const i of region) data[i * 4 + 3] = 0;
  }
  return { w, h, data };
}

/** Keep only the largest 8-connected opaque island: painted clouds, loose smoke and stray marks go. */
export function keepLargest(img) {
  const { w, h, data } = img;
  const label = new Int32Array(w * h).fill(-1);
  const sizes = [];
  for (let start = 0; start < w * h; start++) {
    if (data[start * 4 + 3] === 0 || label[start] >= 0) continue;
    const id = sizes.length; let n = 0; const stack = [start]; label[start] = id;
    while (stack.length) {
      const i = stack.pop(); n++;
      const x = i % w, y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (label[j] < 0 && data[j * 4 + 3] > 0) { label[j] = id; stack.push(j); }
      }
    }
    sizes.push(n);
  }
  let best = 0;
  for (let k = 1; k < sizes.length; k++) if (sizes[k] > sizes[best]) best = k;
  const out = new Uint8ClampedArray(data);
  for (let i = 0; i < w * h; i++) if (label[i] >= 0 && label[i] !== best) out[i * 4 + 3] = 0;
  return { w, h, data: out };
}

/** Crop to the opaque bounding box. */
export function crop(img) {
  const { w, h, data } = img;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return { img: blank(1, 1), x0: 0, y0: 0 };
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const out = blank(cw, ch);
  for (let y = 0; y < ch; y++) out.data.set(data.subarray(((y + y0) * w + x0) * 4, ((y + y0) * w + x0 + cw) * 4), y * cw * 4);
  return { img: out, x0, y0 };
}

/** Box-filter downscale to a width, alpha-weighted; the alpha is then hard (a pixel is in or out) so the edges stay crisp. */
export function boxScale(img, targetW, targetH = 0) {
  const { w, h, data } = img;
  const tw = Math.max(1, Math.round(targetW));
  const th = Math.max(1, targetH || Math.round((h * tw) / w));
  const out = blank(tw, th);
  for (let y = 0; y < th; y++) {
    const sy0 = Math.floor((y * h) / th), sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * h) / th));
    for (let x = 0; x < tw; x++) {
      const sx0 = Math.floor((x * w) / tw), sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * w) / tw));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = sy0; sy < sy1; sy++) for (let sx = sx0; sx < sx1; sx++) {
        const i = (sy * w + sx) * 4; const al = data[i + 3];
        r += data[i] * al; g += data[i + 1] * al; b += data[i + 2] * al; a += al; n++;
      }
      const o = (y * tw + x) * 4;
      if (a > 0 && a / n >= 128) { out.data[o] = Math.round(r / a); out.data[o + 1] = Math.round(g / a); out.data[o + 2] = Math.round(b / a); out.data[o + 3] = 255; }
    }
  }
  return out;
}

/** Median-cut quantization of the opaque pixels to at most n colours. Deterministic: ties break by index. */
export function quantize(img, n = 32) {
  const { w, h, data } = img;
  const px = [];
  for (let i = 0; i < w * h; i++) if (data[i * 4 + 3] > 0) px.push(i);
  if (!px.length) return { w, h, data: new Uint8ClampedArray(data) };
  let boxes = [px];
  const range = (box, c) => { let lo = 255, hi = 0; for (const i of box) { const v = data[i * 4 + c]; if (v < lo) lo = v; if (v > hi) hi = v; } return hi - lo; };
  while (boxes.length < n) {
    let bi = -1, best = -1, bc = 0;
    boxes.forEach((box, k) => { if (box.length < 2) return; for (let c = 0; c < 3; c++) { const r = range(box, c); if (r > best) { best = r; bi = k; bc = c; } } });
    if (bi < 0 || best === 0) break;
    const box = boxes[bi].slice().sort((p, q) => data[p * 4 + bc] - data[q * 4 + bc] || p - q);
    const mid = box.length >> 1;
    boxes.splice(bi, 1, box.slice(0, mid), box.slice(mid));
  }
  const out = new Uint8ClampedArray(data);
  for (const box of boxes) {
    let r = 0, g = 0, b = 0;
    for (const i of box) { r += data[i * 4]; g += data[i * 4 + 1]; b += data[i * 4 + 2]; }
    const m = [Math.round(r / box.length), Math.round(g / box.length), Math.round(b / box.length)];
    for (const i of box) { out[i * 4] = m[0]; out[i * 4 + 1] = m[1]; out[i * 4 + 2] = m[2]; }
  }
  return { w, h, data: out };
}

/** The count of distinct opaque colours. */
export function colourCount(img) {
  const s = new Set();
  for (let i = 0; i < img.w * img.h; i++) if (img.data[i * 4 + 3] > 0) s.add((img.data[i * 4] << 16) | (img.data[i * 4 + 1] << 8) | img.data[i * 4 + 2]);
  return s.size;
}

/** The night glow: warm, bright pixels (lit windows, lamps) copied onto a transparent layer. */
export function glowLayer(img, { minLum = 0.6, warm = 40, hue = 'warm', maxBlob = 0 } = {}) {
  const { w, h, data } = img;
  const out = blank(w, h);
  let count = 0;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (data[o + 3] === 0) continue;
    const r = data[o], g = data[o + 1], b = data[o + 2];
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const lit = hue === 'cool' ? b >= 180 && b - r >= warm : hue === 'any' ? Math.max(r, g, b) - Math.min(r, g, b) >= warm && Math.max(r, g, b) >= 180 : r >= 180 && r - b >= warm;
    if (lum >= minLum && lit) { out.data[o] = r; out.data[o + 1] = g; out.data[o + 2] = b; out.data[o + 3] = 255; count++; }
  }
  if (maxBlob) { // keep only small lit patches (windows, lanterns); a cream wall or a thatch roof is one large patch (iteration 82)
    const seen = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      if (seen[i] || out.data[i * 4 + 3] === 0) continue;
      const blob = [i]; seen[i] = 1;
      for (let k = 0; k < blob.length; k++) {
        const p = blob[k], x = p % w, y = (p - x) / w;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, q = ny * w + nx;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && !seen[q] && out.data[q * 4 + 3] > 0) { seen[q] = 1; blob.push(q); }
        }
      }
      if (blob.length > maxBlob) for (const p of blob) { out.data[p * 4 + 3] = 0; count--; }
    }
  }
  return { img: out, count };
}

/** The renderer's anchor convention (drawBuilding): the footprint diamond's top corner, with the sprite's last row on the diamond's bottom point. */
export function autoAnchor(w, h, spriteH) { return { ax: h * 16 + 1, ay: spriteH - 1 - (w + h) * 8 }; }

/** The footprint diamond's corners relative to the anchor, for the check sheet. */
export function footprintDiamond(w, h) { return [[0, 0], [w * 16, w * 8], [(w - h) * 16, (w + h) * 8], [-h * 16, h * 8]]; }


/** The 8-connected opaque islands of a keyed sheet, row-major: rows are clustered by centre (a new row starts when the
 *  centre drops more than rowBand below the row's first island), then left to right. */
export function islands(img, { minPixels = 40, rowBand = 40 } = {}) {
  const { w, h, data } = img;
  const label = new Int32Array(w * h).fill(-1);
  const found = [];
  for (let start = 0; start < w * h; start++) {
    if (data[start * 4 + 3] === 0 || label[start] >= 0) continue;
    const id = found.length; let n = 0; let x0 = w, y0 = h, x1 = -1, y1 = -1;
    const stack = [start]; label[start] = id;
    while (stack.length) {
      const i = stack.pop(); n++;
      const x = i % w, y = (i / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (label[j] < 0 && data[j * 4 + 3] > 0) { label[j] = id; stack.push(j); }
      }
    }
    found.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, n });
  }
  const kept = found.filter((f) => f.n >= minPixels).sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
  const rows = [];
  for (const f of kept) {
    const cy = f.y + f.h / 2;
    const row = rows.length ? rows[rows.length - 1] : null;
    if (row && cy - row.cy <= rowBand) row.items.push(f);
    else rows.push({ cy, items: [f] });
  }
  return rows.flatMap((r) => r.items.sort((a, b) => a.x - b.x));
}

/** A sub-image by rectangle [x, y, w, h] in source pixels. */
export function cropRect(img, [x, y, w, h]) {
  const out = blank(w, h);
  for (let yy = 0; yy < h; yy++) {
    const sy = y + yy; if (sy < 0 || sy >= img.h) continue;
    for (let xx = 0; xx < w; xx++) { const sx = x + xx; if (sx < 0 || sx >= img.w) continue; out.data.set(img.data.subarray((sy * img.w + sx) * 4, (sy * img.w + sx) * 4 + 4), (yy * w + xx) * 4); }
  }
  return out;
}

/** A prop's anchor: the trunk base, from the x-centroid of the bottom opaque rows; ay sits baseInset above the last row. */
export function propAnchor(img, baseInset = 0) {
  const { w, h, data } = img;
  const rows = Math.max(1, Math.round(h * 0.08));
  let sx = 0, n = 0;
  for (let y = h - rows; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 0) { sx += x + 0.5; n++; }
  return { ax: n ? Math.round(sx / n) : Math.round(w / 2), ay: h - baseInset };
}

/** The footprint anchor with the sprite's horizontal centre on the footprint diamond's centre (a sprite narrower than its footprint). */
export function centreAnchor(w, h, spriteW, spriteH) {
  return { ax: Math.round(spriteW / 2) - (w - h) * 8, ay: spriteH - 1 - (w + h) * 8 };
}

/**
 * A square texture inverse-mapped onto the 32×16 diamond (the same pixel-centre rule as the procedural diamond()), with a
 * mirror fold so the tile's edges continue into their neighbours, and a box average of the texels under each pixel.
 */
export function groundDiamond(tex, { W = 32, H = 16, sub = 4 } = {}) {
  const out = blank(W, H);
  const fold = (t) => { t -= Math.floor(t); return t < 0.5 ? t * 2 : (1 - t) * 2; };
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const sx = px + 0.5 - W / 2, sy = py + 0.5;
    const u = sx / W + sy / H, v = sy / H - sx / W;
    if (u < 0 || v < 0 || u >= 1 || v >= 1) continue;
    let r = 0, g = 0, b = 0, n = 0;
    for (let j = 0; j < sub; j++) for (let i = 0; i < sub; i++) {
      const uu = u + ((i + 0.5) / sub - 0.5) / W * 1.0, vv = v + ((j + 0.5) / sub - 0.5) / H * 1.0;
      const tx = Math.min(tex.w - 1, Math.floor(fold(uu) * tex.w)), ty = Math.min(tex.h - 1, Math.floor(fold(vv) * tex.h));
      const o = (ty * tex.w + tx) * 4;
      r += tex.data[o]; g += tex.data[o + 1]; b += tex.data[o + 2]; n++;
    }
    const o = (py * W + px) * 4;
    out.data[o] = Math.round(r / n); out.data[o + 1] = Math.round(g / n); out.data[o + 2] = Math.round(b / n); out.data[o + 3] = 255;
  }
  return out;
}

/** One median cut over several images, so a family of ground variants shares a palette. */
export function quantizeShared(imgs, n = 32) {
  let w = 0; const hs = [];
  for (const im of imgs) { w = Math.max(w, im.w); hs.push(im.h); }
  const H = hs.reduce((a, b) => a + b, 0);
  const all = blank(w, H);
  let y = 0;
  for (const im of imgs) { for (let yy = 0; yy < im.h; yy++) all.data.set(im.data.subarray(yy * im.w * 4, (yy + 1) * im.w * 4), ((y + yy) * w) * 4); y += im.h; }
  const q = quantize(all, n);
  const out = []; y = 0;
  for (const im of imgs) { const o = blank(im.w, im.h); for (let yy = 0; yy < im.h; yy++) o.data.set(q.data.subarray(((y + yy) * w) * 4, ((y + yy) * w + im.w) * 4), yy * im.w * 4); out.push(o); y += im.h; }
  return out;
}

/** Shift an image's mean colour part of the way to a reference's (ground variants of one family). */
export function meanMatch(img, ref, amount = 0.6) {
  const mean = (im) => { let r = 0, g = 0, b = 0, n = 0; for (let i = 0; i < im.w * im.h; i++) if (im.data[i * 4 + 3] > 0) { r += im.data[i * 4]; g += im.data[i * 4 + 1]; b += im.data[i * 4 + 2]; n++; } return n ? [r / n, g / n, b / n] : [0, 0, 0]; };
  const a = mean(img), c = mean(ref);
  const out = { w: img.w, h: img.h, data: new Uint8ClampedArray(img.data) };
  for (let i = 0; i < img.w * img.h; i++) if (out.data[i * 4 + 3] > 0) for (let k = 0; k < 3; k++) out.data[i * 4 + k] = Math.max(0, Math.min(255, Math.round(img.data[i * 4 + k] + (c[k] - a[k]) * amount)));
  return out;
}

function line(img, x0, y0, x1, y1, rgba) {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, x = x0, y = y0;
  for (;;) {
    if (x >= 0 && y >= 0 && x < img.w && y < img.h) img.data.set(rgba, (y * img.w + x) * 4);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}


/** Pad an image with transparent pixels. */
export function pad(img, n = 1) {
  const out = blank(img.w + 2 * n, img.h + 2 * n);
  for (let y = 0; y < img.h; y++) out.data.set(img.data.subarray(y * img.w * 4, (y + 1) * img.w * 4), ((y + n) * out.w + n) * 4);
  return out;
}

/** The procedural set's outline: every transparent pixel 4-adjacent to an opaque one takes the outline colour (pad first so the edge has room). */
export function outline(img, rgba = [26, 20, 32, 255]) {
  const { w, h, data } = img;
  const out = { w, h, data: new Uint8ClampedArray(data) };
  const op = (x, y) => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] > 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (op(x, y)) continue;
    if (op(x - 1, y) || op(x + 1, y) || op(x, y - 1) || op(x, y + 1)) out.data.set(rgba, (y * w + x) * 4);
  }
  return out;
}

/** An unsharp mask over the opaque pixels (a box-scaled painting is soft; the procedural set is crisp). amount 0 leaves it. */
export function sharpen(img, amount = 0.5) {
  const { w, h, data } = img;
  const out = { w, h, data: new Uint8ClampedArray(data) };
  if (amount <= 0) return out;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    if (data[o + 3] === 0) continue;
    for (let c = 0; c < 3; c++) {
      let sum = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = (ny * w + nx) * 4;
        if (data[q + 3] === 0) continue;
        sum += data[q + c]; n++;
      }
      const blur = sum / n;
      out.data[o + c] = Math.max(0, Math.min(255, Math.round(data[o + c] + amount * (data[o + c] - blur))));
    }
  }
  return out;
}


/** An HSL shift over the opaque pixels: hue in degrees, sat and light as additive fractions (−1..1). Alpha is kept. */
export function recolour(img, { hue = 0, sat = 0, light = 0 } = {}) {
  const { w, h, data } = img;
  const out = { w, h, data: new Uint8ClampedArray(data) };
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (data[o + 3] === 0) continue;
    const r = data[o] / 255, g = data[o + 1] / 255, b = data[o + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    let hh = 0, ss = 0;
    if (max !== min) {
      const d = max - min;
      ss = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      hh = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      hh *= 60;
    }
    hh = (((hh + hue) % 360) + 360) % 360;
    ss = Math.max(0, Math.min(1, ss + sat));
    const ll = Math.max(0, Math.min(1, l + light));
    const c = (1 - Math.abs(2 * ll - 1)) * ss, x = c * (1 - Math.abs(((hh / 60) % 2) - 1)), m = ll - c / 2;
    const k = Math.floor(hh / 60) % 6;
    const [rr, gg, bb] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][k];
    out.data[o] = Math.round((rr + m) * 255); out.data[o + 1] = Math.round((gg + m) * 255); out.data[o + 2] = Math.round((bb + m) * 255);
  }
  return out;
}

function blit(sheet, img, sx, sy, zoom) {
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const o = (y * img.w + x) * 4; if (img.data[o + 3] === 0) continue;
    for (let zy = 0; zy < zoom; zy++) for (let zx = 0; zx < zoom; zx++) {
      const px = sx + x * zoom + zx, py = sy + y * zoom + zy;
      if (px >= 0 && py >= 0 && px < sheet.w && py < sheet.h) sheet.data.set(img.data.subarray(o, o + 4), (py * sheet.w + px) * 4);
    }
  }
}

/** A sheet of every sprite at a zoom, in rows of cols: a building over its footprint diamond, a prop with its anchor on a
 *  tile's centre, a ground tile as a 3×3 field (so seams show). */
export function checkSheet(entries, zoom = 4, cell = 110, cols = 10) {
  const rows = Math.max(1, Math.ceil(entries.length / cols));
  const sheet = blank(cols * cell * zoom, rows * cell * zoom);
  for (let i = 0; i < sheet.w * sheet.h; i++) { sheet.data[i * 4] = 40; sheet.data[i * 4 + 1] = 60; sheet.data[i * 4 + 2] = 40; sheet.data[i * 4 + 3] = 255; }
  const gold = [255, 230, 80, 255];
  entries.forEach((e, k) => {
    const cx0 = (k % cols) * cell * zoom, cy0 = Math.floor(k / cols) * cell * zoom;
    if (e.kind === 'ground') {
      for (let ty = 0; ty < 3; ty++) for (let tx = 0; tx < 3; tx++) blit(sheet, e.img, cx0 + 8 * zoom + (tx - ty) * 16 * zoom + 32 * zoom, cy0 + 20 * zoom + (tx + ty) * 8 * zoom, zoom);
      return;
    }
    if (e.kind === 'prop') {
      const ox = cx0 + 55 * zoom, oy = cy0 + 80 * zoom; // the tile's centre
      const d = [[0, -8], [16, 0], [0, 8], [-16, 0]];
      for (let j = 0; j < 4; j++) { const [x0, y0] = d[j], [x1, y1] = d[(j + 1) % 4]; line(sheet, ox + x0 * zoom, oy + y0 * zoom, ox + x1 * zoom, oy + y1 * zoom, gold); }
      blit(sheet, e.img, ox - e.ax * zoom, oy - e.ay * zoom, zoom);
      line(sheet, ox - 3 * zoom, oy, ox + 3 * zoom, oy, [255, 80, 80, 255]); line(sheet, ox, oy - 3 * zoom, ox, oy + 3 * zoom, [255, 80, 80, 255]);
      return;
    }
    const ox = cx0 + 8 * zoom + e.ax * zoom;
    const oy = cy0 + (cell - 28) * zoom - (e.w_t + e.h_t) * 8 * zoom;
    blit(sheet, e.img, ox - e.ax * zoom, oy - e.ay * zoom, zoom);
    const d = footprintDiamond(e.w_t, e.h_t);
    for (let j = 0; j < 4; j++) { const [x0, y0] = d[j], [x1, y1] = d[(j + 1) % 4]; line(sheet, ox + x0 * zoom, oy + y0 * zoom, ox + x1 * zoom, oy + y1 * zoom, gold); }
  });
  return sheet;
}

/** Is (x, y) inside the polygon? (even-odd rule) */
function inPoly(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** A wing beat (iteration 76): the painting with each wing's pixels (inside its hand-set polygon, in source pixels) turned
 *  about its shoulder by `rot` degrees and squashed toward it by `sy`. The place the wing leaves is painted `white`, so the
 *  background key takes it; the moved wing is drawn over the body, or, for a wing behind it (`behind`), only where the
 *  background shows. Only the wing's paint moves: near-white pixels inside the polygon are background and stay behind. The
 *  wing's `root` (a radius about the shoulder, in source pixels) is drawn in both places, so the joint never leaves a hole. */
export function flapFrame(src, wings, frame, white = 235) {
  const { w, h } = src;
  const out = { w, h, data: new Uint8ClampedArray(src.data) };
  const isBg = (d, i) => d[i] >= white && d[i + 1] >= white && d[i + 2] >= white;
  const paint = (k) => { const i = k * 4; return src.data[i + 3] > 0 && !isBg(src.data, i); };
  // lift every wing first, so one wing's move cannot copy another's old place
  // the root (within `root` source pixels of the shoulder) stays where it is, so the back under the wing joint is never holed
  for (const wg of wings) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inPoly(wg.poly, x + 0.5, y + 0.5) || !paint(y * w + x) || Math.hypot(x - wg.pivot[0], y - wg.pivot[1]) < (wg.root ?? 0)) continue;
    const i = (y * w + x) * 4;
    out.data[i] = out.data[i + 1] = out.data[i + 2] = 255; out.data[i + 3] = 255;
  }
  // far wings first, then near ones over them
  const order = [...wings.keys()].sort((a, b) => Number(!!wings[b].behind) - Number(!!wings[a].behind));
  for (const k of order) {
    const wg = wings[k];
    const f = frame[k] ?? { rot: 0, sy: 1 };
    const t = (f.rot * Math.PI) / 180;
    const c = Math.cos(t), s = Math.sin(t);
    const [px, py] = wg.pivot;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      // inverse map: un-squash, then un-turn
      const dx = x + 0.5 - px, dy = (y + 0.5 - py) / f.sy;
      const sx = px + c * dx + s * dy, syy = py - s * dx + c * dy;
      const ix = Math.floor(sx), iy = Math.floor(syy);
      if (ix < 0 || iy < 0 || ix >= w || iy >= h || !inPoly(wg.poly, ix + 0.5, iy + 0.5) || !paint(iy * w + ix)) continue;
      const o = (y * w + x) * 4;
      if (wg.behind && !isBg(out.data, o)) continue;
      const si = (iy * w + ix) * 4;
      for (let q = 0; q < 4; q++) out.data[o + q] = src.data[si + q];
    }
  }
  return out;
}

/** Drop opaque 8-connected islands smaller than `min` pixels (the specks a moved wing leaves at its old edge; iteration 76). */
export function dropSpecks(img, min) {
  const { w, h } = img;
  const data = new Uint8ClampedArray(img.data);
  const seen = new Uint8Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || data[start * 4 + 3] === 0) continue;
    const region = [start]; seen[start] = 1;
    for (let k = 0; k < region.length; k++) {
      const i = region[k], x = i % w, y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (!seen[j] && data[j * 4 + 3] > 0) { seen[j] = 1; region.push(j); }
      }
    }
    if (region.length < min) for (const i of region) data[i * 4 + 3] = 0;
  }
  return { w, h, data };
}

/** The top face of an isometric block painting onto the 32×16 tile (iteration 83): the face is the diamond as wide as the
 *  block, its top vertex at the block's top (lifted by y, a fraction of the width, where tufts stand above it); shrink pulls the
 *  sampling toward the centre so the rim and the side faces stay out. Transparent samples are skipped. */
export function isoTopDiamond(img, { shrink = 0.12, y = 0 } = {}, W = 32, H = 16, sub = 4) {
  const out = blank(W, H);
  const fw = img.w, fh = img.w / 2, cx = img.w / 2, cy = y * img.w + fh / 2;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const dx = (px + 0.5 - W / 2) / (W / 2), dy = (py + 0.5 - H / 2) / (H / 2);
    if (Math.abs(dx) + Math.abs(dy) > 1) continue;
    let r = 0, g = 0, b = 0, n = 0;
    for (let j = 0; j < sub; j++) for (let i = 0; i < sub; i++) {
      const sx = cx + (dx + (i + 0.5 - sub / 2) / sub / (W / 2)) * (fw / 2) * (1 - shrink);
      const sy = cy + (dy + (j + 0.5 - sub / 2) / sub / (H / 2)) * (fh / 2) * (1 - shrink);
      const tx = Math.max(0, Math.min(img.w - 1, Math.floor(sx))), ty = Math.max(0, Math.min(img.h - 1, Math.floor(sy)));
      const o = (ty * img.w + tx) * 4;
      if (img.data[o + 3] < 128) continue;
      r += img.data[o]; g += img.data[o + 1]; b += img.data[o + 2]; n++;
    }
    if (!n) continue;
    const o = (py * W + px) * 4;
    out.data[o] = Math.round(r / n); out.data[o + 1] = Math.round(g / n); out.data[o + 2] = Math.round(b / n); out.data[o + 3] = 255;
  }
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) { // a hole left by a transparent sample takes its row's neighbour
    const o = (py * W + px) * 4; const dx = (px + 0.5 - W / 2) / (W / 2), dy = (py + 0.5 - H / 2) / (H / 2);
    if (Math.abs(dx) + Math.abs(dy) > 1 || out.data[o + 3]) continue;
    for (const q of [o - 4, o + 4, o - W * 4, o + W * 4]) if (q >= 0 && q < out.data.length && out.data[q + 3]) { out.data.set(out.data.slice(q, q + 4), o); break; }
  }
  return out;
}
