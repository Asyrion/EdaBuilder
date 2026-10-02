// Pure, deterministic steps that turn a reference painting into a game sprite (iteration 49). Every function takes and
// returns { w, h, data } RGBA images and never touches the DOM or Math.random, so vitest can hold them to their word.

export function blank(w, h) { return { w, h, data: new Uint8ClampedArray(w * h * 4) }; }

/** Key out the near-white background by flood fill from the four corners, so a white window inside the building survives. */
export function keyBackground(img, white = 235) {
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
export function glowLayer(img, { minLum = 0.6, warm = 40 } = {}) {
  const { w, h, data } = img;
  const out = blank(w, h);
  let count = 0;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (data[o + 3] === 0) continue;
    const r = data[o], g = data[o + 1], b = data[o + 2];
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (lum >= minLum && r >= 180 && r - b >= warm) { out.data[o] = r; out.data[o + 1] = g; out.data[o + 2] = b; out.data[o + 3] = 255; count++; }
  }
  return { img: out, count };
}

/** The renderer's anchor convention (drawBuilding): the footprint diamond's top corner, with the sprite's last row on the diamond's bottom point. */
export function autoAnchor(w, h, spriteH) { return { ax: h * 16 + 1, ay: spriteH - 1 - (w + h) * 8 }; }

/** The footprint diamond's corners relative to the anchor, for the check sheet. */
export function footprintDiamond(w, h) { return [[0, 0], [w * 16, w * 8], [(w - h) * 16, (w + h) * 8], [-h * 16, h * 8]]; }

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

/** A sheet with every sprite at a zoom over its footprint diamond, so the hand-set offsets can be judged by eye. */
export function checkSheet(entries, zoom = 4, cell = 110) {
  const sheet = blank(entries.length * cell * zoom, cell * zoom);
  sheet.data.fill(0);
  for (let i = 0; i < sheet.w * sheet.h; i++) { sheet.data[i * 4] = 40; sheet.data[i * 4 + 1] = 60; sheet.data[i * 4 + 2] = 40; sheet.data[i * 4 + 3] = 255; }
  entries.forEach((e, k) => {
    const ox = k * cell * zoom + 8 * zoom + e.ax * zoom; // the anchor's sheet position
    const oy = (cell - 28) * zoom - (e.h - e.ay) * zoom + (e.h - e.ay - (e.w_t + e.h_t) * 8) * zoom;
    const sx = ox - e.ax * zoom, sy = oy - e.ay * zoom;
    for (let y = 0; y < e.h; y++) for (let x = 0; x < e.w; x++) {
      const o = (y * e.w + x) * 4; if (e.img.data[o + 3] === 0) continue;
      for (let zy = 0; zy < zoom; zy++) for (let zx = 0; zx < zoom; zx++) {
        const px = sx + x * zoom + zx, py = sy + y * zoom + zy;
        if (px >= 0 && py >= 0 && px < sheet.w && py < sheet.h) sheet.data.set(e.img.data.subarray(o, o + 4), (py * sheet.w + px) * 4);
      }
    }
    const d = footprintDiamond(e.w_t, e.h_t);
    for (let j = 0; j < 4; j++) { const [x0, y0] = d[j], [x1, y1] = d[(j + 1) % 4]; line(sheet, ox + x0 * zoom, oy + y0 * zoom, ox + x1 * zoom, oy + y1 * zoom, [255, 230, 80, 255]); }
  });
  return sheet;
}
