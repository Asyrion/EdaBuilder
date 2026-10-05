/** The Long Night early (iteration 70, DESIGN 4.101): in the Hush, a hound pack at the doors of a dark, unwarded home three nights
 *  running drives its folk out until the Thaw; a district (or, for homes in no district, a march) with half its homes fled is
 *  emptied; a third emptied in one Hush brings the Long Night before its season. No roll: the hounds' own paths decide it all.
 *  A night lies within one sim day (the day turns at mid-morning), so the day is the night's key. */
import { BUILDING_BY_KEY } from './catalog';
import { sectorName, sectorOf } from './sectors';
import { Zone, idx, type Building, type GameState } from './types';
import { districtName, illTiding, markDirty, pushMessage, seasonOf } from './world';

/** Nights at its door before a home's folk flee. */
export const FLEE_NIGHTS = 3;
/** The share of a unit's homes fled that empties it, and the fewest homes a unit needs to count. */
export const EMPTY_SHARE = 0.5;
export const UNIT_MIN_HOMES = 4;
/** The share fled at which the Chronicle warns. */
export const WARN_SHARE = 0.25;
/** Units emptied in one Hush that bring the Long Night early. */
export const LONG_NIGHT_UNITS = 3;
/** A home in no painted district counts by its march: 100 + the sector's index. */
export const MARCH_UNIT = 100;

export const isHush = (s: GameState) => seasonOf(s) === 3;
export const yearOf = (s: GameState) => Math.floor(s.day / 120);

/** The unit a home counts in: its painted district, else its march. */
export function unitOf(s: GameState, b: { x: number; y: number }): number {
  const d = s.district[idx(b.x, b.y)];
  return d > 0 ? d : MARCH_UNIT + sectorOf(b.x, b.y);
}
export function unitName(s: GameState, u: number): string {
  return u < MARCH_UNIT ? districtName(s, u) : `the outskirts of ${sectorName(u - MARCH_UNIT)}`;
}
const isHome = (b: Building) => BUILDING_BY_KEY[b.kind].zone === Zone.Hearth && (b.state === 'ok' || b.state === 'abandoned');

/** A unit's homes and how many of them have fled. */
export function unitHomes(s: GameState, u: number): { homes: number; fled: number } {
  let homes = 0;
  let fled = 0;
  for (const b of s.buildings) {
    if (!b || !isHome(b) || unitOf(s, b) !== u) continue;
    homes++;
    if (b.fled !== undefined) fled++;
  }
  return { homes, fled };
}

/** Called by the hound's harass branch when it reaches a building's door: in the Hush, an occupied home counts the night. */
export function houndAtDoor(s: GameState, b: Building): void {
  if (!isHush(s) || s.gameOver || b.state !== 'ok' || BUILDING_BY_KEY[b.kind].zone !== Zone.Hearth || b.residents <= 0 || b.fled !== undefined) return;
  if (b.houndNight === s.day) return;
  b.houndNight = s.day;
  b.hounded = (b.hounded ?? 0) + 1;
  const u = unitOf(s, b);
  if (b.hounded === FLEE_NIGHTS - 1 && !s.hush.warned?.includes(u)) {
    (s.hush.warned ??= []).push(u);
    pushMessage(s, `Gloam-hounds have been at the doors in ${unitName(s, u)} two nights now. A third night at the same door and its folk flee until the Thaw: light it, ward it, or send the hunters.`, 'warn', true, { x: b.x, y: b.y });
  }
  if (b.hounded >= FLEE_NIGHTS) flee(s, b);
}

/** A home's folk flee the hounds: the home stands empty until the Thaw. */
export function flee(s: GameState, b: Building): void {
  const folk = b.residents;
  b.residents = 0;
  b.fled = yearOf(s);
  s.stats.houndFled++;
  markDirty(s, b.x, b.y);
  illTiding(s);
  const u = unitOf(s, b);
  pushMessage(s, `Three nights of hounds at the door: the ${folk} folk of the home at (${b.x},${b.y}) in ${unitName(s, u)} flee, and it stands empty until the Thaw.`, 'bad', false, { x: b.x, y: b.y });
  checkUnit(s, u, b);
}

/** After a flight: warn at a quarter fled, empty the unit at half, and end the charter at the third emptied this Hush. */
export function checkUnit(s: GameState, u: number, at: { x: number; y: number }): void {
  const { homes, fled } = unitHomes(s, u);
  if (homes < UNIT_MIN_HOMES) return;
  const name = unitName(s, u);
  if (fled >= homes * WARN_SHARE && fled < homes * EMPTY_SHARE && !s.hush.quarter?.includes(u)) {
    (s.hush.quarter ??= []).push(u);
    pushMessage(s, `A quarter of the homes in ${name} have fled the hounds (${fled} of ${homes}). At half, the district is theirs.`, 'bad', true, at);
  }
  if (fled < homes * EMPTY_SHARE || s.hush.emptied.includes(u)) return;
  s.hush.emptied.push(u);
  s.stats.houndEmptied++;
  const n = s.hush.emptied.length;
  if (n >= LONG_NIGHT_UNITS) {
    const names = s.hush.emptied.map((k) => unitName(s, k));
    s.gameOver = `The Long Night comes early. The hounds have emptied ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} in one Hush; the last lamps in them go out, the Gloam walks in behind the pack, and the wardlight cannot hold what is left.`;
    s.lostTo = 'hounds';
    pushMessage(s, s.gameOver, 'bad', true, at);
    return;
  }
  pushMessage(s, `${name[0].toUpperCase()}${name.slice(1)} stands empty: ${fled} of its ${homes} homes have fled the hounds. ${n === 1 ? 'Two more districts emptied this Hush' : 'One more district emptied this Hush'} and the Long Night comes early.`, 'bad', true, at);
}

/** Daily: a new Hush clears the hounds' count; the Thaw lets the fled folk come home. */
export function dailyHush(s: GameState): void {
  const y = yearOf(s);
  if (isHush(s)) {
    if (s.hush.year === y) return;
    s.hush = { year: y, emptied: [] };
    for (const b of s.buildings) if (b) { b.hounded = undefined; b.houndNight = undefined; }
    return;
  }
  if (s.hush.emptied.length || s.hush.warned || s.hush.quarter) s.hush = { year: s.hush.year, emptied: [] };
  let back = 0;
  for (const b of s.buildings) if (b && b.fled !== undefined) { b.fled = undefined; b.hounded = undefined; b.houndNight = undefined; back++; }
  if (back) pushMessage(s, `The Thaw: the hounds are gone from the doors, and ${back} home${back === 1 ? '' : 's'} that fled them may be lived in again.`, 'good', true);
}

/** A hearth's line for its panel in the Hush, or null. */
export function houndLine(s: GameState, b: Building): string | null {
  if (b.fled !== undefined) return 'fled from the hounds: empty until the Thaw';
  if (isHush(s) && (b.hounded ?? 0) > 0) return `at the door ${b.hounded} of ${FLEE_NIGHTS} nights this Hush (a third and its folk flee)`;
  return null;
}
