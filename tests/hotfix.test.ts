import { describe, expect, it } from 'vitest';

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
