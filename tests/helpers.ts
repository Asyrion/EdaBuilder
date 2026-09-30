import { Terrain, idx, inBounds, type GameState } from '../src/sim/types';

/** Flatten a rectangle to grass (keeps ley nodes) so placement tests don't depend on the seed's terrain. */
export function flatten(s: GameState, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (!inBounds(x, y)) continue;
      const i = idx(x, y);
      if (s.terrain[i] !== Terrain.LeyNode) s.terrain[i] = Terrain.Grass;
      s.gloam[i] = 0;
    }
}
