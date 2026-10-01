/** Relic sets from the Ruin Delve: every twelfth relic is a piece of a set; an Academy catalogues it. See DESIGN.md 4.49. */
import { pushMessage, rngOf, commitRng } from './world';
import type { GameState } from './types';

export interface RelicSet { id: string; name: string; pieces: [string, string, string]; bonus: string }
export const RELIC_SETS: RelicSet[] = [
  { id: 'lanterncores', name: 'The Lantern-Cores of Vell', pieces: ['the first core', 'the second core', 'the third core'], bonus: 'ley stores hold 60 more mana' },
  { id: 'ninehouses', name: 'The Seals of the Nine Houses', pieces: ['the seal of Harrow', 'the seal of Vellane', 'the seal of Oss'], bonus: 'happiness +3 in every home' },
  { id: 'saltspoons', name: 'The Salt Spoons of Morrow', pieces: ['the long spoon', 'the short spoon', 'the broken spoon'], bonus: 'deathcare quiets 10% more dead' },
  { id: 'concordcharts', name: 'The Concord Charts', pieces: ['the river chart', 'the hill chart', 'the star chart'], bonus: 'sectors beyond the Charter cost a fifth less' },
];
export const RELICS_PER_PIECE = 12;

export interface RelicState { pieces: Record<string, number>; uncatalogued: number; complete: string[]; lastRelics: number }
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
function catalogue(s: GameState): void {
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
  if (r.uncatalogued > 0 && hasAcademy(s)) {
    r.uncatalogued--;
    catalogue(s);
  }
}
