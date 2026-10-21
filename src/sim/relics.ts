/** Relic sets from the Ruin Delve: every twelfth relic is a piece of a set; an Academy catalogues it. See DESIGN.md 4.49. */
import { pushMessage, rngOf, commitRng } from './world';
import type { GameState } from './types';
import relicsJson from '../data/content/relics.json';

export interface RelicSet { id: string; name: string; pieces: [string, string, string]; bonus: string }
/** The sets, from src/data/content/relics.json (iteration 87, DESIGN 4.118). */
export const RELIC_SETS = relicsJson as unknown as RelicSet[];
export const RELICS_PER_PIECE = 12;

export interface RelicState { pieces: Record<string, number>; uncatalogued: number; complete: string[]; lastRelics: number; idle?: number }
export function initRelics(): RelicState {
  return { pieces: {}, uncatalogued: 0, complete: [], lastRelics: 0 };
}

export function hasAcademy(s: GameState): boolean {
  return s.buildings.some((b) => b && (b.kind === 'academy' || b.kind === 'grandacademy') && b.state === 'ok');
}

export function relicDone(s: GameState, id: string): boolean {
  return !!s.relics && s.relics.complete.includes(id);
}

/** Catalogue one piece into a random incomplete set; completes the set at three. */
export function catalogue(s: GameState): void {
  const r = s.relics;
  const open = RELIC_SETS.filter((set) => !r.complete.includes(set.id));
  if (!open.length) return;
  const rng = rngOf(s);
  const set = rng.pick(open);
  commitRng(s, rng);
  r.pieces[set.id] = (r.pieces[set.id] ?? 0) + 1;
  const n = r.pieces[set.id];
  if (n >= 3) {
    r.complete.push(set.id);
    pushMessage(s, `The Academy has ${set.name} entire: ${set.pieces.join(', ')}. ${set.bonus[0].toUpperCase()}${set.bonus.slice(1)}.`, 'milestone', true);
  } else pushMessage(s, `The Academy catalogues ${set.pieces[n - 1]} of ${set.name} (${n} of 3).`, 'good');
}

/** Dev tools: a set entire at once. */
export function grantRelicSet(s: GameState, id: string): void {
  if (!s.relics) s.relics = initRelics();
  if (!RELIC_SETS.some((r) => r.id === id) || s.relics.complete.includes(id)) return;
  s.relics.pieces[id] = 3;
  s.relics.complete.push(id);
}

/** Daily: every twelfth relic the delve brings up is a set piece; an Academy catalogues one piece a day. */
export function dailyRelics(s: GameState): void {
  if (!s.relics) s.relics = initRelics();
  const r = s.relics;
  const got = Math.floor(s.stats.relics / RELICS_PER_PIECE) - Math.floor(r.lastRelics / RELICS_PER_PIECE);
  r.lastRelics = s.stats.relics;
  if (got > 0) {
    r.uncatalogued += got;
    if (!hasAcademy(s)) pushMessage(s, `The diggers bring up a piece of something older than the Concord. Without an Academy nobody can say what.`, 'info');
  }
  // the Academy names one piece a day by the book (its scholar walkers are parked, scope reset phase 1c)
  r.idle = r.uncatalogued > 0 ? (r.idle ?? 0) + 1 : 0;
  if (r.uncatalogued > 0 && hasAcademy(s)) {
    r.uncatalogued--;
    r.idle = 0;
    catalogue(s);
  }
}
