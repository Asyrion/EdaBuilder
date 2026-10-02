/** Iteration 58 (every building faces its road): a building whose road runs past its left face is drawn mirrored, the
 *  visible front edges before the back ones; the mirrored rect is the sprite's mirror image about its anchor. */
import { describe, expect, it } from 'vitest';
import { faceLeft } from '../src/render/facing';
import { mirrorRect } from '../src/render/atlas';
import { BUILDINGS } from '../src/sim/catalog';
import { MAP_H, MAP_W, idx } from '../src/sim/types';

const world = (roads: [number, number][]) => {
  const road = new Uint8Array(MAP_W * MAP_H);
  for (const [x, y] of roads) road[idx(x, y)] = 1;
  return { road } as unknown as Parameters<typeof faceLeft>[0];
};

describe('Buildings turn to their road', () => {
  const house = { x: 20, y: 20, w: 1, h: 1 };
  const hall = { x: 20, y: 20, w: 2, h: 2 };

  it('a road on one edge: the right faces (+x, −y) keep the sprite, the left faces (+y, −x) mirror it', () => {
    expect(faceLeft(world([[21, 20]]), house)).toBe(false); // +x, the lower-right face
    expect(faceLeft(world([[20, 21]]), house)).toBe(true); // +y, the lower-left face
    expect(faceLeft(world([[20, 19]]), house)).toBe(false); // −y, behind on the right
    expect(faceLeft(world([[19, 20]]), house)).toBe(true); // −x, behind on the left
    expect(faceLeft(world([[22, 21]]), hall)).toBe(false);
    expect(faceLeft(world([[21, 22]]), hall)).toBe(true);
    expect(faceLeft(world([[19, 21]]), hall)).toBe(true);
    expect(faceLeft(world([]), house)).toBe(false); // no road: the default
  });

  it('the visible front edges win over the back ones, and the longer road front wins a tie of sides', () => {
    expect(faceLeft(world([[20, 21], [20, 19]]), house)).toBe(true); // front-left beats back-right
    expect(faceLeft(world([[21, 20], [19, 20]]), house)).toBe(false); // front-right beats back-left
    expect(faceLeft(world([[21, 20], [20, 21]]), house)).toBe(false); // both fronts: right
    expect(faceLeft(world([[22, 20], [20, 22], [21, 22]]), hall)).toBe(true); // two road tiles on the left front, one on the right
    expect(faceLeft(world([[19, 20], [20, 19]]), house)).toBe(false); // both backs: right
  });

  it('corner-only roads: the left corner mirrors, the others keep the sprite', () => {
    expect(faceLeft(world([[19, 21]]), house)).toBe(true); // the left corner (−x, +y)
    expect(faceLeft(world([[21, 19]]), house)).toBe(false); // the right corner
    expect(faceLeft(world([[21, 21]]), house)).toBe(false); // the bottom corner
    expect(faceLeft(world([[19, 19]]), house)).toBe(false); // the top corner
  });

  it('the mirrored rect: the body and glow at W − x − w, the anchor at w − ax, the same rows', () => {
    const r = { x: 100, y: 40, w: 30, h: 20, ax: 12, ay: 18, glow: { x: 300, y: 80 } };
    const m = mirrorRect(r, 1024);
    expect(m).toEqual({ x: 1024 - 100 - 30, y: 40, w: 30, h: 20, ax: 18, ay: 18, glow: { x: 1024 - 300 - 30, y: 80 } });
    expect(mirrorRect(m, 1024)).toEqual(r);
    expect(mirrorRect({ x: 0, y: 0, w: 8, h: 8, ax: 4, ay: 8 }, 64).glow).toBeUndefined();
  });

  it('every footprint is square, so a mirror about the footprint keeps a building on its tiles', () => {
    for (const b of BUILDINGS) expect(b.w, b.key).toBe(b.h);
  });
});
