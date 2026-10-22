/** District charters ("quarters"): what a painted district is for. One effect and one cost each, read at the hooks
 *  the systems already have (land value, happiness, output, shelves, tithe, upkeep, coverage, miasma). See DESIGN.md 4.73. */
import { MAX_DISTRICTS, idx, type Building, type GameState } from './types';
import { milestonesOf } from '../data/factions';

/** Districts open at the Hamlet: the first minutes are roads and homes. */
export const DISTRICT_UNLOCK = 1;

/** Districts open in steps (iteration 49): [milestone, districts open]. Two at the Hamlet, four at the Village, six at the Market Town, all eight at the Burgh. */
export const DISTRICT_SLOTS: [number, number][] = [[1, 2], [3, 4], [5, 6], [6, 8]];

/** How many district numbers the city may paint at its milestone (0 below the Hamlet). */
export function districtSlots(s: GameState): number {
  let n = 0;
  for (const [ms, slots] of DISTRICT_SLOTS) if (s.milestone >= ms) n = slots;
  return n;
}

/** The milestone index that opens district number d. */
export function districtOpenAt(d: number): number {
  for (const [ms, slots] of DISTRICT_SLOTS) if (d <= slots) return ms;
  return DISTRICT_SLOTS[DISTRICT_SLOTS.length - 1][0];
}

/** A district with paint on the map (an old save may hold more than the slots allow; what is painted stays). */
export function districtInUse(s: GameState, d: number): boolean {
  for (let i = 0; i < s.district.length; i++) if (s.district[i] === d) return true;
  return false;
}

/** The lines a milestone adds about districts and charters, for the toast and the Chronicle. */
export function districtUnlockNotes(milestone: number): string[] {
  const out: string[] = [];
  const step = DISTRICT_SLOTS.find(([ms]) => ms === milestone);
  if (step && milestone > DISTRICT_UNLOCK) out.push(step[1] >= MAX_DISTRICTS ? 'The last two districts open.' : `Two more districts open: ${['', '', 'two', '', 'four', '', 'six'][step[1]] ?? step[1]} of eight.`);
  const charters = QUARTERS.filter((q) => q.charterUnlock === milestone && milestone > DISTRICT_UNLOCK).map((q) => q.name.replace(' quarter', ''));
  for (const c of charters) out.push(`The ${c} charter is yours.`);
  return out;
}

export type QuarterId = 'hearth' | 'craft' | 'market' | 'scholars' | 'temple';
export interface QuarterDef {
  id: QuarterId;
  name: string;
  effect: string; // what it gives
  cost: string; // what it takes
  flavor: string;
  charterUnlock: number; // the milestone that opens the charter (iteration 49)
}

export const QUARTERS: QuarterDef[] = [
  { id: 'hearth', name: 'Hearth quarter', effect: 'Land value +6 and hearths +3 happiness.', cost: 'Craft works here make a fifth less.', flavor: 'Washing on every line and nobody hammering after dusk.', charterUnlock: 1 },
  { id: 'craft', name: 'Craft quarter', effect: 'Craft works make a fifth more.', cost: 'Hearths here lose 4 happiness, and the works smoke a third more.', flavor: 'The kilns never cool. The sparrows have soot on them.', charterUnlock: 1 },
  { id: 'market', name: 'Market quarter', effect: 'Markets hold half again as many goods and pay a tenth more tithe.', cost: 'Land value −4: the carts never stop.', flavor: 'Three languages before breakfast and a fourth for the prices.', charterUnlock: 3 },
  { id: 'scholars', name: "Scholars' quarter", effect: 'Arcane works make a fifth more and schooling counts a quarter more.', cost: 'Every building here costs a tenth more upkeep.', flavor: 'Ink, leystone dust and arguments about both.', charterUnlock: 4 },
  { id: 'temple', name: 'Temple quarter', effect: 'Faith counts half again as much and hearths +2 happiness.', cost: 'Markets here pay no tithe: the Vigils take it.', flavor: 'Bells at every hour and bread on every sill.', charterUnlock: 5 },
];

/** Why a charter cannot be chosen yet, or null. */
export function charterLocked(s: GameState, q: QuarterId): string | null {
  const def = QUARTER_BY_ID[q];
  return s.milestone < def.charterUnlock ? `Opens at the ${milestonesOf(s)[def.charterUnlock].name}` : null;
}
/** A charter holds CHARTER_LOCK_DAYS days once taken, costs CHARTER_CROWN_PER_BUILDING a building a day, and its price spills: a Craft quarter's smoke carries CHARTER_SMOKE_SPILL tiles past the edge, a Temple quarter takes TEMPLE_TITHE_SHARE of the city's market tithe (iteration 54). */
export const CHARTER_LOCK_DAYS = 30;
export const CHARTER_CROWN_PER_BUILDING = 1;
export const CHARTER_SMOKE_SPILL = 4;
export const TEMPLE_TITHE_SHARE = 0.1;
/** Why a district's charter cannot be changed yet, or null. A charter with no stamp (an old save) may be changed. */
export function charterHeld(s: GameState, district: number): string | null {
  if (!s.districtQuarters[district]) return null;
  const since = s.quarterSince[district];
  if (since === undefined) return null;
  const left = CHARTER_LOCK_DAYS - (s.day - since);
  return left > 0 ? `The charter holds ${left} more day${left === 1 ? '' : 's'}` : null;
}
/** Crowns a day the charters cost: one for every standing building in a chartered district. */
export function charterUpkeep(s: GameState): number {
  let n = 0;
  for (const b of s.buildings) if (b && b.state !== 'ruin' && s.districtQuarters[s.district[idx(b.x, b.y)]]) n++;
  return n * CHARTER_CROWN_PER_BUILDING;
}
/** Buildings in one chartered district, for its panel line. */
export function charterCostOf(s: GameState, district: number): number {
  if (!s.districtQuarters[district]) return 0;
  let n = 0;
  for (const b of s.buildings) if (b && b.state !== 'ruin' && s.district[idx(b.x, b.y)] === district) n++;
  return n * CHARTER_CROWN_PER_BUILDING;
}
export function templeQuarterStands(s: GameState): boolean {
  return Object.values(s.districtQuarters).some((q) => q === 'temple');
}
export const QUARTER_BY_ID: Record<QuarterId, QuarterDef> = Object.fromEntries(QUARTERS.map((q) => [q.id, q])) as Record<QuarterId, QuarterDef>;

/** The quarter of a tile: its district's charter, or null. */
export function quarterAt(s: GameState, i: number): QuarterId | null {
  const d = s.district[i];
  return d ? (s.districtQuarters[d] ?? null) : null;
}
export function quarterOf(s: GameState, b: Building): QuarterId | null {
  return quarterAt(s, idx(b.x, b.y));
}
/** Give a district its charter (or none). Returns the reason when the charter is not yet open. */
export function setQuarter(s: GameState, district: number, q: QuarterId | null): string | null {
  if ((s.districtQuarters[district] ?? null) === q) return null;
  if (q) {
    const why = charterLocked(s, q);
    if (why) return why;
  }
  const held = charterHeld(s, district); // a charter holds thirty days once given (iteration 54)
  if (held) return held;
  if (q) {
    s.districtQuarters[district] = q;
    s.quarterSince[district] = s.day;
  } else {
    delete s.districtQuarters[district];
    delete s.quarterSince[district];
  }
  return null;
}
/** A district's buildings, standing. */
export function districtBuildings(s: GameState, d: number): Building[] {
  const out: Building[] = [];
  for (const b of s.buildings) if (b && b.state !== 'ruin' && s.district[idx(b.x, b.y)] === d) out.push(b);
  return out;
}

/** Is tile i in a district chartered as a Market quarter? */
export function marketQuarterAt(s: GameState, i: number): boolean {
  return s.district[i] > 0 && s.districtQuarters[s.district[i]] === 'market';
}
