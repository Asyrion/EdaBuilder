/** Cached radial light sprites for the light map. */
const cache = new Map<string, HTMLCanvasElement>();

export function lightSprite(radius: number, color: string, intensity = 1): HTMLCanvasElement {
  const key = `${radius}|${color}|${intensity}`;
  let c = cache.get(key);
  if (c) return c;
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
