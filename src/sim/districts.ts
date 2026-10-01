/** District charters ("quarters"): what a painted district is for. One effect and one cost each, read at the hooks
 *  the systems already have (land value, happiness, output, shelves, tithe, upkeep, coverage, miasma). See DESIGN.md 4.73. */
import { idx, type Building, type GameState } from './types';

/** Districts open at the Hamlet: the first minutes are roads and homes. */
export const DISTRICT_UNLOCK = 1;

export type QuarterId = 'hearth' | 'craft' | 'market' | 'scholars' | 'temple';
export interface QuarterDef {
  id: QuarterId;
  name: string;
  effect: string; // what it gives
  cost: string; // what it takes
  flavor: string;
}

export const QUARTERS: QuarterDef[] = [
  { id: 'hearth', name: 'Hearth quarter', effect: 'Land value +6 and hearths +3 happiness.', cost: 'Craft works here make a fifth less.', flavor: 'Washing on every line and nobody hammering after dusk.' },
  { id: 'craft', name: 'Craft quarter', effect: 'Craft works make a fifth more.', cost: 'Hearths here lose 4 happiness, and the works smoke a third more.', flavor: 'The kilns never cool. The sparrows have soot on them.' },
  { id: 'market', name: 'Market quarter', effect: 'Markets hold half again as many goods and pay a tenth more tithe.', cost: 'Land value −4: the carts never stop.', flavor: 'Three languages before breakfast and a fourth for the prices.' },
  { id: 'scholars', name: "Scholars' quarter", effect: 'Arcane works make a fifth more and schooling counts a quarter more.', cost: 'Every building here costs a tenth more upkeep.', flavor: 'Ink, leystone dust and arguments about both.' },
  { id: 'temple', name: 'Temple quarter', effect: 'Faith counts half again as much and hearths +2 happiness.', cost: 'Markets here pay no tithe: the Vigils take it.', flavor: 'Bells at every hour and bread on every sill.' },
];
export const QUARTER_BY_ID: Record<QuarterId, QuarterDef> = Object.fromEntries(QUARTERS.map((q) => [q.id, q])) as Record<QuarterId, QuarterDef>;

/** The quarter of a tile: its district's charter, or null. */
export function quarterAt(s: GameState, i: number): QuarterId | null {
  const d = s.district[i];
  return d ? (s.districtQuarters[d] ?? null) : null;
}
export function quarterOf(s: GameState, b: Building): QuarterId | null {
  return quarterAt(s, idx(b.x, b.y));
}
export function setQuarter(s: GameState, district: number, q: QuarterId | null): void {
  if (q) s.districtQuarters[district] = q;
  else delete s.districtQuarters[district];
}
/** A district's buildings, standing. */
export function districtBuildings(s: GameState, d: number): Building[] {
  const out: Building[] = [];
  for (const b of s.buildings) if (b && b.state !== 'ruin' && s.district[idx(b.x, b.y)] === d) out.push(b);
  return out;
}

// marketStockCap has no state argument: the quarters are snapshotted once a tick, like the Fen-Nex district.
let qGrid: Uint8Array | null = null;
let qMap: Record<number, QuarterId | undefined> = {};
export function setQuarterSnapshot(map: Record<number, QuarterId | undefined>, grid: Uint8Array): void {
  qMap = map;
  qGrid = grid;
}
export function marketQuarterAt(i: number): boolean {
  return !!qGrid && qGrid[i] > 0 && qMap[qGrid[i]] === 'market';
}
