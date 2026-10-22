/** Fire, wild surges, the Gloam, and the restless dead. */
import { BUILDING_BY_KEY } from './catalog';
import { AgentKind, DAYS_PER_SEASON, MAP_H, MAP_W, Zone, idx, inBounds, isWater, type Building, type GameState } from './types';
import { commitRng, forEachBuilding, markDirty, pushMessage, removeBuilding, rngOf } from './world';
import { distanceMap } from './terrain';
import { spawnRestless, dailyRestless, restlessCount } from './agents';
import { crewFactor } from './services';
import { factionOf } from '../data/factions';
import { manaUseOf } from './networks';
import { edictOn } from './edicts';
import { seasonOf } from './world';

export type EffectKind = 'surge' | 'fire' | 'restless' | 'gloam' | 'ward' | SoundCue;
/** Sound-only cues the sim raises at a place; the game pans and attenuates them by the camera. */
export type SoundCue = 'horn' | 'bell' | 'hammer';
export const SOUND_CUES: SoundCue[] = ['horn', 'bell', 'hammer'];

export interface Effect {
  x: number;
  y: number;
  kind: EffectKind;
  tick: number;
}
export const effects: Effect[] = [];
export function drainEffects(): Effect[] {
  return effects.splice(0, effects.length);
}

/** Over this share of the flow a lit Thrum Font runs hot: each has FLARE_CHANCE a day of a bore flare. */
export const FLARE_AT = 0.9;
export const FLARE_CHANCE = 0.02;
export const FLARE_DAYS = 10;
export function fontsRunHot(state: GameState): boolean {
  return state.manaDemand > state.manaSupply * FLARE_AT && state.buildings.some((b) => b && b.kind === 'font' && b.lit && b.state === 'ok');
}

export function dailyFire(state: GameState): void {
  const rng = rngOf(state);
  const toIgnite: Building[] = [];
  // a hot Font: pressed past nine tenths of the flow, a lit Font may flare: it and the zone buildings beside it burn, and it smokes for ten days
  if (state.manaDemand > state.manaSupply * FLARE_AT) {
    forEachBuilding(state, (b) => {
      if (b.kind !== 'font' || !b.lit || b.state !== 'ok' || (b.flare ?? 0) > 0) return;
      if (!rng.chance(FLARE_CHANCE)) return;
      b.flare = FLARE_DAYS;
      pushMessage(state, `A bore flare at the Thrum Font at (${b.x},${b.y}): the ley came up the shaft as fire. The yard will smoke for ${FLARE_DAYS} days.`, 'bad', true, { x: b.x, y: b.y });
      igniteBuilding(state, b, 'A bore flare at');
      forEachBuilding(state, (o) => {
        if (o === b || o.state !== 'ok' || BUILDING_BY_KEY[o.kind].category !== 'zone') return;
        const dx = Math.max(0, b.x - (o.x + o.w - 1), o.x - (b.x + b.w - 1));
        const dy = Math.max(0, b.y - (o.y + o.h - 1), o.y - (b.y + b.h - 1));
        if (Math.max(dx, dy) <= 2) igniteBuilding(state, o, 'A bore flare at');
      });
    });
  }
  forEachBuilding(state, (b) => {
    const def = BUILDING_BY_KEY[b.kind];
    const i = idx(b.x, b.y);
    const fireCov = state.coverage.fire[i] / 255;
    if (b.state === 'burning') {
      if (fireCov > 0 && rng.chance(0.35 + fireCov * 0.6)) {
        b.state = 'ok';
        b.stateDays = 0;
        markDirty(state, b.x, b.y);
        return;
      }
      if (b.stateDays >= 2) {
        b.state = 'ruin';
        b.stateDays = 0;
        b.residents = 0;
        b.workers = 0;
        markDirty(state, b.x, b.y);
        pushMessage(state, `${def.name} at (${b.x},${b.y}) burned to the ground.`, 'bad');
        return;
      }
      // spread
      for (let dy = -1; dy <= b.h; dy++)
        for (let dx = -1; dx <= b.w; dx++) {
          if ((dx === -1 || dx === b.w) && (dy === -1 || dy === b.h)) continue;
          const x = b.x + dx;
          const y = b.y + dy;
          if (!inBounds(x, y)) continue;
          const s = state.bIndex[idx(x, y)];
          if (s < 0) continue;
          const nb = state.buildings[s];
          if (nb && nb !== b && nb.state === 'ok' && rng.chance(0.22 * (1 - fireCov))) toIgnite.push(nb);
        }
      return;
    }
    if (b.state !== 'ok' || def.category === 'special' || def.category === 'water' || (def.category === 'ley' && b.kind !== 'font') || b.kind === 'garden' || b.kind === 'square') return;
    let p = 0.00025;
    if (def.zone === Zone.Craft) p *= 2.5;
    if (def.category === 'zone' && b.level === 1) p *= 1.4;
    if (def.key === 'font') p *= 6;
    if (seasonOf(state) === 2) p *= 1.3; // Ember, the dry season
    p *= 1 - fireCov * 0.5;
    if (rng.chance(p)) toIgnite.push(b);
  });
  for (const b of toIgnite) igniteBuilding(state, b);
  commitRng(state, rng);
}

/** Set a building alight (the fire hazard). */
export function igniteBuilding(state: GameState, b: Building, why = ''): boolean {
  if (b.state !== 'ok') return false;
  b.state = 'burning';
  b.stateDays = 0;
  markDirty(state, b.x, b.y);
  state.stats.firesTotal++;
  effects.push({ x: b.x, y: b.y, kind: 'fire', tick: state.tick });
  const cov = state.coverage.fire[idx(b.x, b.y)];
  pushMessage(state, `${why || 'Fire at'} ${BUILDING_BY_KEY[b.kind].name} (${b.x},${b.y})!${cov === 0 ? ' No Water-Mages\' Hall covers it.' : ''}`, 'bad');
  return true;
}

/** Days of overdraw (demand over 1.25 × supply with the store spent) before the wild surge; the top bar counts them down. */
export const SURGE_DAYS = 5;
export function dailySurge(state: GameState): void {
  const threshold = 1.25;
  // a Nexus store soaks up the peak: the count runs only once the store is spent
  if (state.manaDemand > state.manaSupply * threshold && state.manaDemand > 20 && state.manaStorage <= 0.5) {
    state.overdrawDays++;
    state.stats.brownoutOpen = 1;
    if (state.overdrawDays === 1) pushMessage(state, 'The spires flicker: mana demand far exceeds the Veins. A wild surge comes in five days unless you raise a Thrum Font, store it in a Nexus, or cut consumers.', 'warn', true);
    else if (state.overdrawDays < 4) pushMessage(state, `The ley still runs over: a wild surge in ${SURGE_DAYS - state.overdrawDays} days. A Thrum Font, a Nexus's store, or fewer lit buildings stop it.`, 'warn');
    else if (state.overdrawDays === 4) pushMessage(state, 'The ley is howling in the spires. Tomorrow it breaks loose.', 'warn');
  } else {
    if (state.stats.brownoutOpen) { state.stats.brownoutsSurvived++; state.stats.brownoutOpen = 0; }
    state.overdrawDays = Math.max(-4, state.overdrawDays - 1);
  }
  if (state.overdrawDays >= SURGE_DAYS) {
    state.overdrawDays = -4;
    state.stats.brownoutOpen = 0;
    const rng = rngOf(state);
    const lit: Building[] = [];
    forEachBuilding(state, (b) => {
      if (b.lit && b.state === 'ok' && manaUseOf(b) > 0 && BUILDING_BY_KEY[b.kind].category === 'zone') lit.push(b);
    });
    const n = Math.min(lit.length, 2 + rng.int(4));
    for (let k = 0; k < n; k++) {
      const b = lit.splice(rng.int(lit.length), 1)[0];
      b.state = 'ruin';
      b.stateDays = 0;
      b.residents = 0;
      b.workers = 0;
      markDirty(state, b.x, b.y);
      effects.push({ x: b.x, y: b.y, kind: 'surge', tick: state.tick });
    }
    state.stats.surgesTotal++;
    pushMessage(state, `WILD SURGE! Overdrawn ley lashes out: ${n} building(s) warped into ruin. The Concord made the same mistake.`, 'bad');
    commitRng(state, rng);
  }
}

export function recomputeGloamDist(state: GameState): void {
  state.gloamDist = distanceMap((i) => state.gloam[i] === 1, 15);
  let n = 0;
  for (let i = 0; i < state.gloam.length; i++) n += state.gloam[i];
  state.stats.gloamTiles = n;
}

/** A ward burns this many grey tiles a day at full strength and crew (times its strength and plating). */
export const WARD_BURN = 12;
export function wardBurnBudget(state: GameState, b: Building): number {
  const def = BUILDING_BY_KEY[b.kind];
  if (!def.service || def.service.type !== 'ward') return 0;
  let strength = def.service.strength * crewFactor(b, state);
  if (b.kind === 'wardlantern') strength *= factionOf(state).rules.lanternWard;
  return Math.round(WARD_BURN * strength);
}
/** Grey tiles inside a ward's radius, for its panel. */
export function greyInReach(state: GameState, b: Building): number {
  const def = BUILDING_BY_KEY[b.kind];
  const r = def.service?.radius ?? 0;
  const cx = b.x + (b.w - 1) / 2;
  const cy = b.y + (b.h - 1) / 2;
  let n = 0;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = Math.round(cx + dx); const y = Math.round(cy + dy); if (inBounds(x, y) && dx * dx + dy * dy <= r * r && state.gloam[idx(x, y)]) n++; }
  return n;
}
/** At this Gloam pressure the grey comes up to the door of a dark, unwarded building. */
export const GLOAM_TAKES = 0.65;
/** Days the grey stands at a dark building's door before it is taken. */
export const GREY_DAYS = 3;
/** A building within r; with litOnly, only one that is lit or stands on warded ground counts. */
function hasBuildingNear(state: GameState, x: number, y: number, r: number, litOnly = false): boolean {
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      if (!inBounds(tx, ty)) continue;
      const s = state.bIndex[idx(tx, ty)];
      if (s < 0) continue;
      if (!litOnly) return true;
      const b = state.buildings[s];
      if (b && (b.lit || b.kind === 'stake' || state.coverage.ward[idx(tx, ty)] > 0)) return true;
    }
  return false;
}
/** True if a Gloam tile touches the building's footprint (4-neighbourhood). */
export function gloamAtDoor(state: GameState, b: Building): boolean {
  for (let dy = -1; dy <= b.h; dy++)
    for (let dx = -1; dx <= b.w; dx++) {
      if ((dx === -1 || dx === b.w) && (dy === -1 || dy === b.h)) continue;
      if (dx >= 0 && dx < b.w && dy >= 0 && dy < b.h) continue;
      const x = b.x + dx;
      const y = b.y + dy;
      if (inBounds(x, y) && state.gloam[idx(x, y)]) return true;
    }
  return false;
}

/** Ward Lanterns burn back gloam daily; gloam creeps every few days. */
export function dailyGloam(state: GameState): void {
  const rng = rngOf(state);
  let changed = false;
  // 1. wards burn the grey in their radius on a budget: WARD_BURN × strength tiles a day, the nearest first; a Stone Ward holds and burns nothing
  forEachBuilding(state, (b) => {
    const def = BUILDING_BY_KEY[b.kind];
    if (!def.service || def.service.type !== 'ward' || b.state !== 'ok') return;
    if (!b.lit && (def.needsMana || def.manaUse > 0)) return;
    let budget = wardBurnBudget(state, b);
    if (budget <= 0) return;
    const r = def.service.radius;
    const cx = b.x + (b.w - 1) / 2;
    const cy = b.y + (b.h - 1) / 2;
    for (let rr = 0; rr <= r && budget > 0; rr++)
      for (let dy = -rr; dy <= rr && budget > 0; dy++)
        for (let dx = -rr; dx <= rr && budget > 0; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== rr || dx * dx + dy * dy > r * r) continue;
          const x = Math.round(cx + dx);
          const y = Math.round(cy + dy);
          if (!inBounds(x, y)) continue;
          const i = idx(x, y);
          if (state.gloam[i]) {
            state.gloam[i] = 0;
            markDirty(state, x, y);
            changed = true;
            budget--;
            if (rng.chance(0.15)) effects.push({ x, y, kind: 'ward', tick: state.tick });
          }
        }
  });
  // 2. creep
  const creepEvery = 4;
  if (state.day % creepEvery === 0 && state.day > 0) {
    const p = Math.min(0.6, 0.22 + state.day * 0.002) * (seasonOf(state) === 3 ? 1.6 : seasonOf(state) === 1 ? 0.7 : 1) * (0.5 + state.gloamPressure);
    const gloam = state.gloam;
    const newTiles: number[] = [];
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        const i = idx(x, y);
        if (!gloam[i]) continue;
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
          if (!inBounds(nx, ny)) continue;
          const j = idx(nx, ny);
          if (gloam[j] || isWater(state.terrain[j])) continue;
          if (state.coverage.ward[j] > 0) continue;
          if (state.bIndex[j] >= 0) continue; // never onto a building: the grey comes to the door first
          // the grey keeps two tiles from a lit building; past the pressure of GLOAM_TAKES it comes up to a dark, unwarded one
          if (hasBuildingNear(state, nx, ny, 2, state.gloamPressure >= GLOAM_TAKES)) continue;
          if (rng.chance(p * 0.25)) newTiles.push(j);
        }
      }
    for (const j of newTiles) {
      if (gloam[j]) continue;
      gloam[j] = 1;
      changed = true;
      markDirty(state, j % MAP_W, (j / MAP_W) | 0);
      if (state.zone[j]) {
        state.zone[j] = 0;
        state.zoneListDirty = true;
      }
    }
    // 3. pockets: every ~12 days a pocket opens somewhere unlit and unbuilt
    if (state.day % 12 === 0 && state.day >= 24 && state.gloamPressure >= 0.3) {
      for (let t = 0; t < 40; t++) {
        const x = 6 + rng.int(MAP_W - 12);
        const y = 6 + rng.int(MAP_H - 12);
        const i = idx(x, y);
        if (isWater(state.terrain[i]) || state.gloam[i] || state.lit[i] || state.coverage.ward[i] > 0) continue;
        if (hasBuildingNear(state, x, y, 6)) continue;
        if (Math.hypot(x - state.founding.x, y - state.founding.y) < 22) continue;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const j = idx(x + dx, y + dy);
            if (inBounds(x + dx, y + dy) && !isWater(state.terrain[j])) {
              state.gloam[j] = 1;
              markDirty(state, x + dx, y + dy);
            }
          }
        changed = true;
        const dirx = x < state.founding.x ? 'west' : 'east';
        const diry = y < state.founding.y ? 'north' : 'south';
        pushMessage(state, `A pocket of Gloam opens in the ${diry}-${dirx}. Grey grass, whispering. A Ward Lantern would burn it back.`, 'warn', true, { x, y });
        effects.push({ x, y, kind: 'gloam', tick: state.tick });
        break;
      }
    }
  }
  // 4. gloam kills buildings it touches; at the door of a dark, unwarded building it waits GREY_DAYS days first
  const taken: Building[] = [];
  forEachBuilding(state, (b) => {
    if (b.kind === 'stake') return;
    let touched = false;
    for (let dy = 0; dy < b.h && !touched; dy++)
      for (let dx = 0; dx < b.w; dx++)
        if (state.gloam[idx(b.x + dx, b.y + dy)]) {
          touched = true;
          break;
        }
    if (touched) { taken.push(b); return; }
    const dark = !b.lit && state.coverage.ward[idx(b.x, b.y)] === 0 && b.state !== 'building';
    if (dark && gloamAtDoor(state, b)) {
      b.greyDays = (b.greyDays ?? 0) + 1;
      if (b.greyDays === 1) pushMessage(state, `The grey is at the door of the ${BUILDING_BY_KEY[b.kind].name} at (${b.x},${b.y}): light it or ward it within two days, or the Gloam takes it.`, 'warn', true, { x: b.x, y: b.y });
      if (b.greyDays >= GREY_DAYS) {
        for (let dy = 0; dy < b.h; dy++) for (let dx = 0; dx < b.w; dx++) { const j = idx(b.x + dx, b.y + dy); state.gloam[j] = 1; if (state.zone[j]) { state.zone[j] = 0; state.zoneListDirty = true; } markDirty(state, b.x + dx, b.y + dy); }
        taken.push(b);
      }
    } else if (b.greyDays) b.greyDays = 0;
  });
  for (const b of taken) {
    pushMessage(state, `${BUILDING_BY_KEY[b.kind].name} at (${b.x},${b.y}) was swallowed by the Gloam.`, 'bad', true, { x: b.x, y: b.y });
    removeBuilding(state, b);
    changed = true;
  }
  if (changed) recomputeGloamDist(state);
  // 5. fail: gloam at the founding node
  const f = state.founding;
  for (let dy = -3; dy <= 3; dy++)
    for (let dx = -3; dx <= 3; dx++) {
      const x = f.x + dx;
      const y = f.y + dy;
      if (inBounds(x, y) && state.gloam[idx(x, y)] && !state.gameOver) {
        state.gameOver = 'The Gloam reaches the founding node. The light goes out, and the valley forgets its name.';
        state.lostTo = 'gloam';
        pushMessage(state, state.gameOver, 'bad');
      }
    }
  commitRng(state, rng);
}

/** Deaths, quieting, and the restless. */
export function dailyDeath(state: GameState): void {
  const rng = rngOf(state);
  // deaths
  const rate = 0.0035 * (1.7 - state.health) * (seasonOf(state) === 3 ? 1.2 : 1);
  const expected = state.population * rate;
  let deaths = Math.floor(expected);
  if (rng.chance(expected - deaths)) deaths++;
  state.deathsToday = deaths;
  let covered = 0;
  const homes: Building[] = [];
  forEachBuilding(state, (b) => {
    if (BUILDING_BY_KEY[b.kind].zone === Zone.Hearth && b.residents > 0 && b.state === 'ok') homes.push(b);
  });
  let uncoveredBodies = 0;
  for (let k = 0; k < deaths && homes.length; k++) {
    const b = rng.pick(homes);
    if (b.residents > 0) b.residents--;
    if (state.coverage.death[idx(b.x, b.y)] > 30) covered++;
    else uncoveredBodies++;
  }
  // quieting capacity
  let quietCap = 0;
  forEachBuilding(state, (b) => {
    const def = BUILDING_BY_KEY[b.kind];
    if (def.service?.type === 'death' && b.state === 'ok') quietCap += (def.service.quietRate ?? 0) * crewFactor(b, state) * (edictOn(state, 'rites', b) ? 1.5 : 1);
  });
  let pool = state.unquieted + covered;
  const quieted = Math.min(pool, quietCap);
  pool -= quieted;
  // uncovered bodies: half the leftover capacity can still fetch them, slowly
  const leftover = quietCap - quieted;
  const fetched = Math.min(uncoveredBodies, leftover * 0.5);
  pool += uncoveredBodies - fetched;
  state.unquieted = pool;
  state.quietCap = quietCap;
  state.quietedToday = quieted + fetched;
  state.waitingDead = pool;
  // restless rise
  let rose = 0;
  while (state.unquieted >= 20 && homes.length) {
    state.unquieted -= 20;
    const b = rng.pick(homes);
    commitRng(state, rng);
    if (spawnRestless(state, b.x, b.y)) {
      rose++;
      effects.push({ x: b.x, y: b.y, kind: 'restless', tick: state.tick });
    }
    rng.state = state.rngState;
  }
  if (rose > 0) {
    // the dead the Remembrance stirred rise first, and the Chronicle says so (iteration 54)
    const stirred = Math.min(rose, Math.floor(state.remembranceDead / 20));
    state.remembranceDead = Math.max(0, state.remembranceDead - stirred * 20);
    pushMessage(state, `${rose} of the unquieted dead rise and walk the streets${stirred > 0 ? ` (${stirred} of them stirred by the Remembrance)` : ''}. Build a Boneyard, or send the Watch.`, 'bad');
  }
  commitRng(state, rng);
  const cleared = dailyRestless(state);
  if (cleared > 0 && rng.chance(0.5)) pushMessage(state, `The Watch and the wards lay ${cleared} restless to rest.`, 'good');
  const rc = restlessCount(state);
  if (rc >= 40 && !state.gameOver) {
    state.gameOver = 'The Long Night: the restless outnumber the Watch, the living flee, and the wardlight gutters out.';
    state.lostTo = 'restless';
    pushMessage(state, state.gameOver, 'bad');
  }
}

// ---------- Gloam pressure (from the weave, which is parked: scope reset phase 1c) ----------
/** 0..1: how hard the Gloam presses. Dead, restless and overdraw raise it; faith lowers it. */
export function computeGloamPressure(s: GameState): number {
  let p = 0.3;
  p += Math.min(0.3, s.unquieted / 80);
  let restless = 0;
  for (const a of s.agents) if (a.kind === AgentKind.Restless) restless++;
  p += Math.min(0.2, restless / 30);
  if (s.overdrawDays > 0) p += 0.15;
  if (seasonOf(s) === 3) p += 0.1;
  // faith: share of zoned buildings under faith coverage
  let zoned = 0;
  let faithful = 0;
  forEachBuilding(s, (b) => { if (BUILDING_BY_KEY[b.kind].category === 'zone' && b.state === 'ok') { zoned++; if (s.coverage.faith[idx(b.x, b.y)] > 60) faithful++; } });
  if (zoned) p -= 0.25 * (faithful / zoned);
  return Math.max(0, Math.min(1, p));
}
export function pressureWord(p: number): string {
  return p < 0.25 ? 'quiet' : p < 0.45 ? 'restless' : p < 0.65 ? 'pressing' : 'hungry';
}
/** Daily: the Gloam's pressure. */
export function dailyGloamPressure(s: GameState): void {
  s.gloamPressure = computeGloamPressure(s);
}
