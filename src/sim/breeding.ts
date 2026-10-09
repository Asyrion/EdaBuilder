/** Cross-line breeding: two grown dragons of different lines in a cradle attuned to one of them lay a crossed egg on Bloom day 20. See DESIGN.md 4.48. */
import { aspectAt } from './weave';
import { LINE_INFO, cradleCapacity, dragonsIn, freeCradle, isCradle } from './wyrmcraft';
import { commitRng, forEachBuilding, pushMessage, rngOf } from './world';
import type { Building, Dragon, DragonLine, GameState } from './types';

export const BREED_DAY = 50; // Bloom day 20 of each year (day % 120)
export const BREED_MOOD = 60;
const NAMES = ['Twain', 'Half-Ember', 'Marrow', 'Dapple', 'Sorrel', 'Pyre-and-Salt', 'Lantern', 'Mottle', 'Weft', 'Eddy'];

export interface BreedCheck { ok: boolean; why: string; sire?: Dragon; dam?: Dragon; line?: DragonLine; second?: DragonLine; trueblood?: boolean }

/** Why a cradle can or cannot breed this year. */
export function canBreed(s: GameState, cradle: Building): BreedCheck {
  const inside = dragonsIn(s, cradle.id);
  if (inside.length < 2) return { ok: false, why: 'needs two grown dragons in the cradle' };
  // every pair in the cradle is weighed, not only the first two (iteration 91: a Great Cradle of ember, ember and glim breeds)
  const grown = inside.filter((d) => d.stage >= 2);
  if (grown.length < 2) return { ok: false, why: 'both must be drakes or older' };
  const pairs: [Dragon, Dragon][] = [];
  for (let i = 0; i < grown.length; i++) for (let j = i + 1; j < grown.length; j++) pairs.push([grown[i], grown[j]]);
  // different first lines breed, as ever (mirror crosses too); one first line breeds only from two crossed parents whose second
  // lines differ (iteration 91), never a plain dragon with a crossed one, whose egg would copy the crossed parent
  const breeds = (a: Dragon, b: Dragon) => a.line !== b.line || (!!a.second && !!b.second && a.second !== b.second);
  const distinct = pairs.filter(([a, b]) => breeds(a, b));
  if (!distinct.length) return { ok: false, why: 'two of one line breed nothing new' };
  const asp = aspectAt(s, cradle.x, cradle.y);
  const attuned = distinct.filter(([a, b]) => asp === a.line || asp === b.line);
  if (!attuned.length) return { ok: false, why: `the cradle must be attuned to one parent's line (this node is ${asp ? LINE_INFO[asp].name : 'none'})` };
  if (!cradle.lit) return { ok: false, why: 'the cradle is cold' };
  const pair = attuned.find(([a, b]) => a.mood >= BREED_MOOD && b.mood >= BREED_MOOD);
  if (!pair) return { ok: false, why: `both must be content (mood ${BREED_MOOD}+)` };
  const [a, b] = pair;
  const sire = asp === a.line ? a : b;
  const dam = sire === a ? b : a;
  if (!freeCradle(s, sire.line)) return { ok: false, why: `no cradle that takes a ${LINE_INFO[sire.line].name} egg has a free slot` };
  const second = dam.line !== sire.line ? dam.line : dam.second!; // one first line: the dam's second line is what is new
  const trueblood = !!sire.second && !!dam.second;
  return { ok: true, why: trueblood ? 'two crossed parents: a trueblood egg will be laid on Bloom day 20' : 'a crossed egg will be laid on Bloom day 20', sire, dam, line: sire.line, second, trueblood };
}

/** Daily: on Bloom day 20 every breeding cradle lays one crossed egg into a free cradle. */
export function dailyBreeding(s: GameState): void {
  if (s.day % 120 !== BREED_DAY) return;
  const cradles: Building[] = [];
  forEachBuilding(s, (b) => { if (isCradle(b.kind) && b.state === 'ok' && cradleCapacity(b) > 0) cradles.push(b); });
  const rng = rngOf(s);
  for (const c of cradles) {
    const chk = canBreed(s, c);
    if (!chk.ok) continue;
    const home = freeCradle(s, chk.line);
    if (!home) continue;
    const d: Dragon = {
      id: s.nextDragonId++, name: rng.pick(NAMES), line: chk.line!, second: chk.second, trueblood: chk.trueblood || undefined, stage: 0, days: 0, cradleId: home.id,
      role: 'none', roleTarget: -1, mood: 70, hungry: 0, training: 'gentle', agentId: -1, born: s.day,
    };
    s.dragons.push(d);
    s.stats.crossEggs++;
    if (chk.trueblood) { s.stats.truebloods++; pushMessage(s, `${chk.sire!.name} and ${chk.dam!.name}, both crossed, have laid a trueblood egg at (${c.x},${c.y}): ${LINE_INFO[d.line].name} and ${LINE_INFO[d.second!].name} in full. A bloodline begins in ${s.cityName}.`, 'milestone', true, { x: c.x, y: c.y }); continue; }
    pushMessage(s, `${chk.sire!.name} and ${chk.dam!.name} have laid a crossed egg at (${c.x},${c.y}): ${LINE_INFO[d.line].name} shot through with ${LINE_INFO[d.second!].name}. It will carry both auras.`, 'milestone', true, { x: c.x, y: c.y });
  }
  commitRng(s, rng);
}

export function dragonLines(d: Dragon): DragonLine[] {
  return d.second ? [d.line, d.second] : [d.line];
}
