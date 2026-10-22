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

/** The road at a market's door counts for its trade (iteration 75, AUDIT B40): the market tithe is scaled by the tier there,
 *  as the sim reads it (an unlit Lantern-way is cobble), and a dirt track in the mud of the Thaw and the Hush loses a fifth. */
export const MARKET_ROAD_TRADE: Record<number, number> = { [RoadType.None]: 0.8, [RoadType.Track]: 0.9, [RoadType.Cobble]: 1.0, [RoadType.Lantern]: 1.1 };
export const MARKET_MUD_TRADE = 0.8;
export function muddySeason(s: GameState): boolean {
  const season = Math.floor(s.day / DAYS_PER_SEASON) % 4;
  return season === 0 || season === 3;
}
/** The factor for a market whose door is tile `i` (−1: no road at all). */
export function marketRoadMultAt(s: GameState, i: number): number {
  if (i < 0) return MARKET_ROAD_TRADE[RoadType.None];
  const r = roadAt(s, i);
  if (r === RoadType.Track && muddySeason(s)) return MARKET_MUD_TRADE;
  return MARKET_ROAD_TRADE[r] ?? 1;
}
/** The panel's words for the road at a market's door. */
export function marketRoadWords(s: GameState, i: number): string {
  const f = marketRoadMultAt(s, i);
  if (i < 0) return `no road: trade × ${MARKET_ROAD_TRADE[RoadType.None]}`;
  const r = roadAt(s, i);
  const raw = s.road[i];
  const name = ROAD_BY_TYPE[r]?.name ?? 'no road';
  if (r === RoadType.Track) return `${name}: trade × ${f}${muddySeason(s) ? ' in the mud of this season' : `, × ${MARKET_MUD_TRADE} in the mud of the Thaw and the Hush`}; a cobbled road trades in full, a lit Lantern-way a tenth more`;
  if (r === RoadType.Cobble) return `${raw === RoadType.Lantern ? 'Lantern-way, unlit (counts as cobbled)' : name}: trade in full; a lit Lantern-way or a Glowvine Lane a tenth more`;
  return `${name}: trade × ${f}`;
}
