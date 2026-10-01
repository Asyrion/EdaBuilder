/** Road tiers as the sim reads them: a lantern-way that is not lit is cobble for speed, capacity and land value. */
import { RoadType, type GameState } from './types';

export function roadAt(s: GameState, i: number): RoadType {
  const r = s.road[i];
  return r === RoadType.Lantern && !s.lit[i] ? RoadType.Cobble : r;
}
