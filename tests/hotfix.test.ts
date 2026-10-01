import { describe, expect, it } from 'vitest';
import { createGame } from '../src/sim/world';
import { run } from '../src/sim/sim';
import { TICKS_PER_DAY, idx } from '../src/sim/types';
import { serialize, deserialize } from '../src/sim/save';
import { paintBonus, walkerBonus } from '../src/sim/walkers';
import { flatten } from './helpers';

describe('Hotfix: saves leave the walkers\' bonus layer behind', () => {
  it('serialize skips walkerBonus and a round trip keeps simulating identically', () => {
    const s = createGame(42, 'Savewick');
    flatten(s, s.founding.x - 12, s.founding.y - 2, s.founding.x + 12, s.founding.y + 12);
    run(s, TICKS_PER_DAY);
    paintBonus(s, 'watch', idx(s.founding.x + 3, s.founding.y + 3), 0.1, 0.2);
    expect(s.walkerBonus).toBeDefined();
    expect(walkerBonus(s, 'watch')[idx(s.founding.x + 3, s.founding.y + 3)]).toBeCloseTo(0.1);
    const json = serialize(s);
    expect(json).not.toContain('"walkerBonus"');
    expect(json.length).toBeLessThan(400_000);
    const t = deserialize(json, (seed) => createGame(seed));
    expect(t.walkerBonus).toBeUndefined();
    // a loaded game runs on without the transient layer; with the painted bonus gone the two cities are the same
    walkerBonus(s, 'watch').fill(0);
    run(s, TICKS_PER_DAY);
    run(t, TICKS_PER_DAY);
    expect(t.population).toBe(s.population);
    expect(t.rngState).toBe(s.rngState);
    expect(t.buildings.filter(Boolean).length).toBe(s.buildings.filter(Boolean).length);
  });

  it('deserialize drops a walkerBonus key left by an older save', () => {
    const s = createGame(7, 'Oldwick');
    const o = JSON.parse(serialize(s));
    o.walkerBonus = { watch: { 0: 0.1, 1: 0.2 } };
    const t = deserialize(JSON.stringify(o), (seed) => createGame(seed));
    expect(t.walkerBonus).toBeUndefined();
    expect(walkerBonus(t, 'watch')).toBeInstanceOf(Float32Array);
  });
});

describe('Hotfix: the light sprite cache is bounded', () => {
  it('never holds more than LIGHT_CACHE_MAX canvases and still returns a canvas', async () => {
    let made = 0;
    const fakeCtx = { createRadialGradient: () => ({ addColorStop: () => undefined }), fillRect: () => undefined, fillStyle: null as unknown };
    (globalThis as any).document = { createElement: () => { made++; return { width: 0, height: 0, getContext: () => fakeCtx }; } };
    const { lightSprite, lightCacheSize, LIGHT_CACHE_MAX } = await import('../src/render/lights');
    const a = lightSprite(6, '#ffcc88', 0.6);
    expect(lightSprite(6, '#ffcc88', 0.6)).toBe(a); // cached
    for (let k = 0; k < 2000; k++) lightSprite(6, '#ffcc88', 0.6 * (k / 2000));
    expect(lightCacheSize()).toBeLessThanOrEqual(LIGHT_CACHE_MAX);
    expect(made).toBeGreaterThan(1000);
    expect(lightSprite(3, '#88ccff', 0.5)).toBeTruthy();
    // the quantized particle intensities make only eleven keys per radius and colour
    const before = lightCacheSize();
    for (let life = 0; life <= 1; life += 0.001) lightSprite(3, '#88ccff', (Math.round(Math.min(1, life) * 10) / 10) * 0.6);
    expect(lightCacheSize() - before).toBeLessThanOrEqual(11);
    delete (globalThis as any).document;
  });
});
