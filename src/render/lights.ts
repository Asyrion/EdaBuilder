/** Cached radial light sprites for the light map. Keys must come from a finite set (callers quantize
 *  the intensity); the bound below is a safety net, because every entry is a live canvas element. */
const cache = new Map<string, HTMLCanvasElement>();
export const LIGHT_CACHE_MAX = 512;
export function lightCacheSize(): number {
  return cache.size;
}

export function lightSprite(radius: number, color: string, intensity = 1): HTMLCanvasElement {
  const key = `${radius}|${color}|${intensity}`;
  let c = cache.get(key);
  if (c) return c;
  if (cache.size >= LIGHT_CACHE_MAX) cache.clear();
  c = document.createElement('canvas');
  c.width = c.height = radius * 2;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  const [r, gg, b] = color.match(/\w\w/g)!.map((h) => parseInt(h, 16));
  g.addColorStop(0, `rgba(${r},${gg},${b},${intensity})`);
  g.addColorStop(0.4, `rgba(${r},${gg},${b},${intensity * 0.45})`);
  g.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, radius * 2, radius * 2);
  cache.set(key, c);
  return c;
}
