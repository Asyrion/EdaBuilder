// A dependency-free PNG codec for the art pipeline (Node's zlib does the deflate). Decodes 8-bit grey, grey+alpha,
// RGB, RGBA and palette images (non-interlaced); encodes 8-bit RGBA. Pure functions over { w, h, data } RGBA buffers.
import { deflateSync, inflateSync } from 'node:zlib';

const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** @param {Uint8Array} buf @returns {{ w: number, h: number, data: Uint8ClampedArray }} RGBA */
export function decodePng(buf) {
  for (let i = 0; i < 8; i++) if (buf[i] !== SIG[i]) throw new Error('not a PNG');
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let p = 8;
  let w = 0, h = 0, depth = 0, type = 0, interlace = 0;
  const idat = [];
  let plte = null, trns = null;
  while (p < buf.length) {
    const len = dv.getUint32(p); const name = String.fromCharCode(buf[p + 4], buf[p + 5], buf[p + 6], buf[p + 7]);
    const body = buf.subarray(p + 8, p + 8 + len);
    if (name === 'IHDR') { w = dv.getUint32(p + 8); h = dv.getUint32(p + 12); depth = buf[p + 16]; type = buf[p + 17]; interlace = buf[p + 20]; }
    else if (name === 'PLTE') plte = body;
    else if (name === 'tRNS') trns = body;
    else if (name === 'IDAT') idat.push(body);
    else if (name === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8) throw new Error(`unsupported bit depth ${depth}`);
  if (interlace) throw new Error('interlaced PNGs are not supported');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!channels) throw new Error(`unsupported colour type ${type}`);
  const raw = inflateSync(Buffer.concat(idat.map((b) => Buffer.from(b))));
  const stride = w * channels;
  const out = new Uint8Array(stride * h);
  let prev = new Uint8Array(stride);
  let q = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[q++];
    const row = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? row[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      const v = raw[q++];
      let r;
      if (f === 0) r = v;
      else if (f === 1) r = v + a;
      else if (f === 2) r = v + b;
      else if (f === 3) r = v + ((a + b) >> 1);
      else { const pp = a + b - c; const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      row[x] = r & 255;
    }
    prev = row;
  }
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0, o = 0; i < w * h; i++, o += 4) {
    const s = i * channels;
    if (type === 2) { data[o] = out[s]; data[o + 1] = out[s + 1]; data[o + 2] = out[s + 2]; data[o + 3] = 255; }
    else if (type === 6) { data[o] = out[s]; data[o + 1] = out[s + 1]; data[o + 2] = out[s + 2]; data[o + 3] = out[s + 3]; }
    else if (type === 0) { data[o] = data[o + 1] = data[o + 2] = out[s]; data[o + 3] = 255; }
    else if (type === 4) { data[o] = data[o + 1] = data[o + 2] = out[s]; data[o + 3] = out[s + 1]; }
    else { const k = out[s]; data[o] = plte[k * 3]; data[o + 1] = plte[k * 3 + 1]; data[o + 2] = plte[k * 3 + 2]; data[o + 3] = trns && k < trns.length ? trns[k] : 255; }
  }
  return { w, h, data };
}

function chunk(name, body) {
  const out = new Uint8Array(12 + body.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, body.length);
  for (let i = 0; i < 4; i++) out[4 + i] = name.charCodeAt(i);
  out.set(body, 8);
  dv.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
}

/** @param {{ w: number, h: number, data: Uint8ClampedArray }} img @returns {Uint8Array} */
export function encodePng(img) {
  const { w, h, data } = img;
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w); dv.setUint32(4, h); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = new Uint8Array((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; raw.set(data.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1); }
  const idat = new Uint8Array(deflateSync(Buffer.from(raw), { level: 9 }));
  const parts = [new Uint8Array(SIG), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
