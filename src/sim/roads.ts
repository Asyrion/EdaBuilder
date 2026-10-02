/** Road tiers as the sim reads them: a lantern-way that is not lit is cobble for speed, capacity and land value. */
import { DAYS_PER_SEASON, RoadType, type GameState } from './types';
import { ROAD_BY_TYPE } from './catalog';

export function roadAt(s: GameState, i: number): RoadType {
  const r = s.road[i];
  return r === RoadType.Lantern && !s.lit[i] ? RoadType.Cobble : r;
}

/** Mud: a dirt track runs at this share of its speed in the Thaw and the Hush. */
export const MUD = 0.6;
/** A tile's speed as the carts feel it: the tier's speed, and mud on a track in the wet seasons. */
export function roadSpeedAt(s: GameState, i: number): number {
  const r = roadAt(s, i);
  if (!r) return 0;
  const season = Math.floor(s.day / DAYS_PER_SEASON) % 4;
  return ROAD_BY_TYPE[r].speed * (r === RoadType.Track && (season === 0 || season === 3) ? MUD : 1);
}
