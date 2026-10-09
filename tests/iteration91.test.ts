// Iteration 91 (DESIGN 4.122, docs/ART_PIPELINES.md): the Tripo Studio and Aseprite pipelines. The importer's `pixel: true`
// takes a drawn sprite as drawn; the Aseprite trace makes an indexed image with its edge in ink; install switches the old
// entry off; the Tripo CLI's output is read for its task id and its result.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePng, encodePng } from '../scripts/lib/png.mjs';
import { installEntries, luaData, render, trace, type Img } from '../scripts/aseprite';
import { resultOf, taskIdOf } from '../tools/devboard/tripo';
import { draftFor, TRIPO_MAX } from '../tools/devboard/prompts';
import { BUILDINGS } from '../src/sim/catalog';

/** A 6×6 drawing on transparency: a 4×4 block of two colours, a speck in the corner. */
function drawing(): Img {
  const w = 6, h = 6, data = new Uint8ClampedArray(w * h * 4);
  const set = (x: number, y: number, c: number[]) => data.set([...c, 255], (y * w + x) * 4);
  for (let y = 1; y < 5; y++) for (let x = 1; x < 5; x++) set(x, y, x < 3 ? [200, 60, 40] : [60, 120, 200]);
  set(5, 5, [250, 250, 250]); // a speck with no opaque neighbour
  return { w, h, data };
}

describe('the importer takes a pixel: true sprite as drawn', () => {
  it('keeps every pixel, crops to them and anchors it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'iter91-')), script = resolve('scripts/importSprites.mjs');
    try {
      mkdirSync(join(dir, 'art'), { recursive: true });
      const img = drawing();
      img.data.set([0, 0, 0, 0], (5 * 6 + 5) * 4); // without the speck: the crop is the 4×4 block
      writeFileSync(join(dir, 'art/drawn.png'), encodePng(img));
      writeFileSync(join(dir, 'art/sources.json'), JSON.stringify({ sprites: [{ name: 'b_test', src: 'art/drawn.png', pixel: true, w: 1, h: 1, anchor: 'centre', checked: true, glow: false }] }));
      execFileSync(process.execPath, [script], { cwd: dir, stdio: 'pipe' });
      const out = decodePng(readFileSync(join(dir, 'public/art/sprites/b_test.png')));
      expect([out.w, out.h]).toEqual([4, 4]);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const a = (y * 4 + x) * 4, b = ((y + 1) * 6 + x + 1) * 4;
        expect([...out.data.subarray(a, a + 4)]).toEqual([...img.data.subarray(b, b + 4)]);
      }
      const m = JSON.parse(readFileSync(join(dir, 'public/art/sprites.json'), 'utf8')).sprites.b_test;
      expect([m.w, m.h]).toEqual([4, 4]);
      expect(Number.isInteger(m.ax) && Number.isInteger(m.ay)).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('the Aseprite trace', () => {
  const t = trace(drawing(), 24);
  it('makes an indexed image: index 0 clear, index 1 the ink (the darkest), the edge in ink, a speck gone', () => {
    expect(t.palette[0]).toEqual([0, 0, 0]);
    const at = (x: number, y: number) => t.idx[y * t.w + x];
    expect(at(5, 5)).toBe(0);
    expect(at(0, 0)).toBe(0);
    for (const [x, y] of [[1, 1], [4, 1], [1, 4], [4, 4], [2, 1]]) expect(at(x, y)).toBe(1);
    expect(at(2, 2)).not.toBe(1); // inside keeps its colour
    expect(at(2, 2)).not.toBe(at(3, 2)); // two colours inside
  });
  it('renders and writes the Lua table build_sprite.lua reads', () => {
    const img = render(t);
    expect(img.data[3]).toBe(0);
    const lua = luaData('b_test', t);
    expect(lua).toMatch(/^return \{/);
    expect(lua).toMatch(/w = 6, h = 6/);
    expect((lua.match(/"[0-9a-v]{6}"/g) ?? []).length).toBe(6);
  });
  it('cuts a many-coloured sprite to the palette asked for', () => {
    const w = 16, h = 16, data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) data.set([(i * 37) % 256, (i * 91) % 256, (i * 13) % 256, 255], i * 4);
    expect(trace({ w, h, data }, 8).palette.length).toBeLessThanOrEqual(9);
  });
});

describe('install', () => {
  it('switches the live entry off, keeps it, and adds the pixel entry with its footprint and anchor', () => {
    const list = [{ name: 'b_well', src: 'inspirations/old.png', w: 1, h: 1, anchor: 'centre', shift: { x: 0, y: 6 }, checked: true }, { name: 'tree_1', src: 'x.png', kind: 'prop' }];
    const { list: out, entry } = installEntries(list, 'b_well', { w: 2, h: 2 });
    expect(out.find((e) => e.src === 'inspirations/old.png')!.off).toBe(true);
    expect(entry).toMatchObject({ name: 'b_well', src: 'art/aseprite/export/b_well.png', pixel: true, w: 1, h: 1, anchor: 'centre', shift: { x: 0, y: 6 } });
    expect(out.filter((e) => e.name === 'b_well' && !e.off)).toHaveLength(1);
    // installing again replaces the pixel entry instead of adding a second
    expect(installEntries(out, 'b_well', { w: 2, h: 2 }).list.filter((e) => e.name === 'b_well' && !e.off)).toHaveLength(1);
    // a prop keeps its kind and gets no footprint
    expect(installEntries(list, 'tree_1', { w: 1, h: 1 }).entry).toMatchObject({ kind: 'prop', pixel: true });
  });
});

describe('the Tripo CLI', () => {
  it('reads the task id from its "Task created" line', () => {
    expect(taskIdOf('Submitting…\nTask created: 4f2a9c1e-77b0-4c1e-9a33-2d1b0f6c7e10\nWaiting')).toBe('4f2a9c1e-77b0-4c1e-9a33-2d1b0f6c7e10');
    expect(taskIdOf('✔ Task created (id: abc12345def)')).toBe('abc12345def');
    expect(taskIdOf('{"task_id":"zz-99887766"}')).toBe('zz-99887766');
    expect(taskIdOf('error: not logged in')).toBeNull();
  });
  it('reads the status and the urls wherever the result nests them', () => {
    expect(resultOf('{"status":"running"}')).toEqual({ status: 'running', urls: [] });
    expect(resultOf('{"data":{"status":"success","urls":["https://a/1.webp","https://a/2.webp"]}}').urls).toHaveLength(2);
    expect(resultOf('{"status":"SUCCESS","images":[{"url":"https://a/1.png"}]}')).toEqual({ status: 'success', urls: ['https://a/1.png'] });
  });
});

describe('the board\'s draft prompt keeps the prompt rules', () => {
  it('every building\'s draft fits Tripo\'s 1000 characters and names no negation', () => {
    for (const b of BUILDINGS) {
      const d = draftFor(b as never, `b_${b.key}`, '');
      expect(d.length, b.key).toBeLessThanOrEqual(TRIPO_MAX);
      expect(d, b.key).not.toMatch(/\bno (text|ground|shadow|frame)\b/i);
      expect(d, b.key).toMatch(/plain flat white background/);
    }
    expect(draftFor(BUILDINGS[0] as never, 'b_x', 'word '.repeat(400)).length).toBeLessThanOrEqual(TRIPO_MAX); // a long brief gives way
  });
});
