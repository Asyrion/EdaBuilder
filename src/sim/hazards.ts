/** Fire, wild surges, the Gloam, and the restless dead. */
import { BUILDING_BY_KEY } from './catalog';
import { MAP_H, MAP_W, Zone, idx, inBounds, isWater, type Building, type GameState } from './types';
import { commitRng, forEachBuilding, markDirty, pushMessage, removeBuilding, rngOf } from './world';
import { distanceMap } from './terrain';
import { spawnRestless, dailyRestless, restlessCount } from './agents';
import { manaUseOf } from './networks';
import { edictOn, modifierSum } from './edicts';
import { seasonOf } from './world';
import { WYRM_LAIR_RADIUS, wyrmBoneQuiet, wyrmGuards, wyrmNode } from './wyrm';

export interface Effect {
  x: number;
  y: number;
  kind: 'surge' | 'fire' | 'restless' | 'gloam' | 'ward' | 'portal';
  tick: number;
}
export const effects: Effect[] = [];
export function drainEffects(): Effect[] {
  return effects.splice(0, effects.length);
}

export function dailyFire(state: GameState): void {
  const rng = rngOf(state);
  const toIgnite: Building[] = [];
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
    p *= 1 - fireCov * 0.5;
    if (rng.chance(p)) toIgnite.push(b);
  });
  for (const b of toIgnite) igniteBuilding(state, b);
  commitRng(state, rng);
}

/** Set a building alight (fire hazard, wyrm flyover). */
export function igniteBuilding(state: GameState, b: Building, why = ''): boolean {
  if (b.state !== 'ok') return false;
  b.state = 'burning';
  b.stateDays = 0;
  markDirty(state, b.x, b.y);
  state.stats.firesTotal++;
  effects.push({ x: b.x, y: b.y, kind: 'fire', tick: state.tick });
  const cov = state.coverage.fire[idx(b.x, b.y)];
  pushMessage(state, `${why || 'Fire at'} ${BUILDING_BY_KEY[b.kind].name} (${b.x},${b.y})!${cov === 0 ? ' No Veshari Hall covers it.' : ''}`, 'bad');
  return true;
}

export function dailySurge(state: GameState): void {
  const threshold = edictOn(state, 'wardens') ? 1.5 : 1.25;
  if (state.manaDemand > state.manaSupply * threshold && state.manaDemand > 20) {
    state.overdrawDays++;
    if (state.overdrawDays === 1) pushMessage(state, 'The spires flicker: mana demand far exceeds the Veins. A wild surge comes in five days unless you raise a Thrum Font or Nexus, or cut consumers.', 'warn', true);
    else if (state.overdrawDays === 4) pushMessage(state, 'The ley is howling in the spires. Tomorrow it breaks loose.', 'warn');
  } else state.overdrawDays = Math.max(-4, state.overdrawDays - 1);
  if (state.overdrawDays >= 5) {
    state.overdrawDays = -4;
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

function hasBuildingNear(state: GameState, x: number, y: number, r: number): boolean {
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      if (inBounds(tx, ty) && state.bIndex[idx(tx, ty)] >= 0) return true;
    }
  return false;
}

/** Ward Lanterns burn back gloam daily; gloam creeps every few days. */
export function dailyGloam(state: GameState): void {
  const rng = rngOf(state);
  let changed = false;
  // 1. wards clear gloam in radius
  forEachBuilding(state, (b) => {
    const def = BUILDING_BY_KEY[b.kind];
    if (!def.service || def.service.type !== 'ward' || b.state !== 'ok' || !b.lit) return;
    const r = def.service.radius;
    const cx = b.x + (b.w - 1) / 2;
    const cy = b.y + (b.h - 1) / 2;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = Math.round(cx + dx);
        const y = Math.round(cy + dy);
        if (!inBounds(x, y) || dx * dx + dy * dy > r * r) continue;
        const i = idx(x, y);
        if (state.gloam[i]) {
          state.gloam[i] = 0;
          state.stats.gloamBurned++;
          markDirty(state, x, y);
          changed = true;
          if (rng.chance(0.15)) effects.push({ x, y, kind: 'ward', tick: state.tick });
        }
      }
  });
  // 1b. the bound wyrm's lair burns the Gloam back for 30 tiles (a few tiles a day, from the inside out)
  if (wyrmGuards(state)) {
    const wn = wyrmNode(state)!;
    const r = WYRM_LAIR_RADIUS;
    let budget = 40;
    for (let rr = 1; rr <= r && budget > 0; rr++)
      for (let dy = -rr; dy <= rr && budget > 0; dy++)
        for (let dx = -rr; dx <= rr && budget > 0; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== rr || dx * dx + dy * dy > r * r) continue;
          const x = wn.x + dx;
          const y = wn.y + dy;
          if (!inBounds(x, y)) continue;
          const i = idx(x, y);
          if (state.gloam[i]) {
            state.gloam[i] = 0;
            state.stats.gloamBurned++;
            markDirty(state, x, y);
            changed = true;
            budget--;
            if (rng.chance(0.2)) effects.push({ x, y, kind: 'ward', tick: state.tick });
          }
        }
  }
  // 2. creep
  const creepEvery = 4;
  if (state.day % creepEvery === 0 && state.day > 0 && modifierSum(state, 'gloamHold') <= 0) {
    const p = Math.min(0.6, 0.22 + state.day * 0.002) * (seasonOf(state) === 3 ? 1.6 : seasonOf(state) === 1 ? 0.7 : 1);
    const gloam = state.gloam;
    const newTiles: number[] = [];
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        const i = idx(x, y);
        if (!gloam[i]) continue;
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
          if (!inBounds(nx, ny)) continue;
          const j = idx(nx, ny);
          if (gloam[j] || isWater(state.terrain[j]) || state.wall[j]) continue;
          if (state.coverage.ward[j] > 0) continue;
          if (hasBuildingNear(state, nx, ny, 2)) continue;
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
    if (state.day % 12 === 0 && state.day >= 24) {
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
  // 4. gloam kills buildings it touches
  forEachBuilding(state, (b) => {
    if (b.kind === 'stake') return;
    let touched = false;
    for (let dy = 0; dy < b.h && !touched; dy++)
      for (let dx = 0; dx < b.w; dx++)
        if (state.gloam[idx(b.x + dx, b.y + dy)]) {
          touched = true;
          break;
        }
    if (touched) {
      pushMessage(state, `${BUILDING_BY_KEY[b.kind].name} at (${b.x},${b.y}) was swallowed by the Gloam.`, 'bad');
      removeBuilding(state, b);
      changed = true;
    }
  });
  if (changed) recomputeGloamDist(state);
  // 5. fail: gloam at the founding node
  const f = state.founding;
  for (let dy = -3; dy <= 3; dy++)
    for (let dx = -3; dx <= 3; dx++) {
      const x = f.x + dx;
      const y = f.y + dy;
      if (inBounds(x, y) && state.gloam[idx(x, y)] && !state.gameOver) {
        state.gameOver = 'The Gloam reaches the founding node. The light goes out, and the valley forgets its name.';
        pushMessage(state, state.gameOver, 'bad');
      }
    }
  commitRng(state, rng);
}

/** Deaths, quieting, and the restless. */
export function dailyDeath(state: GameState): void {
  const rng = rngOf(state);
  // deaths
  const rate = 0.0035 * (1.7 - state.health) * (1 + modifierSum(state, 'deaths')) * (seasonOf(state) === 3 ? 1.2 : 1);
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
    if (def.service?.type === 'death' && b.state === 'ok') quietCap += (def.service.quietRate ?? 0) * (edictOn(state, 'rites', b) ? 1.5 : 1);
  });
  quietCap += wyrmBoneQuiet(state);
  let pool = state.unquieted + covered;
  const quieted = Math.min(pool, quietCap);
  pool -= quieted;
  // uncovered bodies: half the leftover capacity can still fetch them, slowly
  const leftover = quietCap - quieted;
  const fetched = Math.min(uncoveredBodies, leftover * 0.5);
  pool += uncoveredBodies - fetched;
  state.unquieted = pool;
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
  if (rose > 0) pushMessage(state, `${rose} of the unquieted dead rise and walk the streets. Build a Boneyard, or send the Watch.`, 'bad');
  commitRng(state, rng);
  const cleared = dailyRestless(state);
  if (cleared > 0 && rng.chance(0.5)) pushMessage(state, `The Watch and the wards lay ${cleared} restless to rest.`, 'good');
  const rc = restlessCount(state);
  if (rc >= 40 && !state.gameOver) {
    state.gameOver = 'The Long Night: the restless outnumber the Watch, the living flee, and the wardlight gutters out.';
    pushMessage(state, state.gameOver, 'bad');
  }
}
