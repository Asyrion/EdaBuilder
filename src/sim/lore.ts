/** Iteration 16: Fen-Nex quarter, war-tigers, mana-storms, the Font of Quieting. See DESIGN.md 4.37. */
import { BUILDING_BY_KEY } from './catalog';
import { AgentKind, MAP_H, MAP_W, Terrain, Zone, idx, inBounds, isWater, type Agent, type Building, type GameState } from './types';
import { commitRng, forEachBuilding, markDirty, pushMessage, rngOf, seasonOf, illTiding } from './world';
import { effects } from './hazards';
import { auraAt, nodesOfAspect } from './weave';
import { edictOn } from './edicts';

export const STORM_DAYS = 4;
export const STORM_RADIUS = 5;
export const TIGER_CAP = 4;
export const TIGER_FOREST = 220; // forest tiles a map needs before tigers come

// ---------- Fen-Nex quarter ----------
export function fenNexDistrict(s: GameState): number {
  return s.fenNex;
}
export function inFenNex(s: GameState, b: Building): boolean {
  return s.fenNex > 0 && s.district[idx(b.x, b.y)] === s.fenNex;
}
/** The district with the most markets (for the Fen-Nex to settle in), or 0. */
export function marketDistrict(s: GameState): number {
  const counts = new Map<number, number>();
  forEachBuilding(s, (b) => {
    if (BUILDING_BY_KEY[b.kind].zone !== Zone.Market) return;
    const d = s.district[idx(b.x, b.y)];
    if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
  });
  let best = 0;
  let bn = 0;
  for (const [d, n] of counts) if (n > bn) { bn = n; best = d; }
  return best;
}

// ---------- mana-storms ----------
export function startStorm(s: GameState, x: number, y: number): void {
  s.storms.push({ x, y, until: s.day + STORM_DAYS, vx: 0, vy: 0 });
  effects.push({ x, y, kind: 'storm', tick: s.tick });
  pushMessage(s, `A mana-storm coils out of the surge at (${x},${y}): a pocket of wild ley that will drift for ${STORM_DAYS} days, warping what it touches. Wards dissolve it.`, 'warn', true, { x, y });
}

/** Daily: storms drift, warp buildings under them, and die under wards or with time. */
export function dailyStorms(s: GameState): void {
  if (!s.storms.length) return;
  const rng = rngOf(s);
  const keep: GameState['storms'] = [];
  for (const st of s.storms) {
    // drift
    if (rng.chance(0.5) || (st.vx === 0 && st.vy === 0)) { st.vx = rng.int(3) - 1; st.vy = rng.int(3) - 1; }
    st.x = Math.max(2, Math.min(MAP_W - 3, st.x + st.vx * 3));
    st.y = Math.max(2, Math.min(MAP_H - 3, st.y + st.vy * 3));
    const ci = idx(st.x, st.y);
    const stormStill = nodesOfAspect(s, 'storm').some((n) => Math.hypot(n.x - st.x, n.y - st.y) <= 10) || auraAt(s, 'storm', st.x, st.y);
    if (s.day >= st.until || s.coverage.ward[ci] > 90 || stormStill) {
      if (s.day < st.until) s.stats.stormsDissolved++;
      pushMessage(s, s.day >= st.until ? `The mana-storm at (${st.x},${st.y}) blows itself out.` : `The wards at (${st.x},${st.y}) dissolve the mana-storm.`, 'info', true, { x: st.x, y: st.y });
      continue;
    }
    // warp: zoned buildings under it level up or down at random
    forEachBuilding(s, (b) => {
      const def = BUILDING_BY_KEY[b.kind];
      if (def.category !== 'zone' || b.state !== 'ok') return;
      if (Math.hypot(b.x - st.x, b.y - st.y) > STORM_RADIUS) return;
      if (!rng.chance(0.35)) return;
      if (rng.chance(0.5) && b.level < 3) { b.level++; b.variant = rng.int(4); }
      else if (b.level > 1) { b.level--; b.variant = rng.int(4); }
      else return;
      b.progress = 0;
      markDirty(s, b.x, b.y);
      s.stats.stormWarps++;
    });
    keep.push(st);
  }
  s.storms = keep;
  commitRng(s, rng);
}

// ---------- war-tigers ----------
export function forestTiles(s: GameState): number {
  let n = 0;
  for (let i = 0; i < s.terrain.length; i++) if (s.terrain[i] === Terrain.Forest) n++;
  return n;
}
export function tigerCount(s: GameState): number {
  let n = 0;
  for (const a of s.agents) if (a.kind === AgentKind.Creature && a.species === 'tiger') n++;
  return n;
}
/** Nightly chance (called from the creature population step) that a war-tiger comes out of a big forest. */
export function maybeSpawnTiger(s: GameState, night: boolean): void {
  if (!night || tigerCount(s) >= TIGER_CAP || s.day < 40 || s.milestone < 3) return;
  const season = seasonOf(s);
  if (forestTiles(s) < TIGER_FOREST) return;
  const rng = rngOf(s);
  const p = (season === 2 ? 0.05 : season === 3 ? 0.08 : 0.02) * (edictOn(s, 'bounty') ? 0.5 : 1);
  if (!rng.chance(p)) { commitRng(s, rng); return; }
  // a forest tile within 10 of a building that touches forest
  const spots: number[] = [];
  forEachBuilding(s, (b) => {
    if (spots.length > 60 || b.state !== 'ok') return;
    for (let k = 0; k < 4; k++) {
      const x = b.x + rng.int(21) - 10;
      const y = b.y + rng.int(21) - 10;
      if (inBounds(x, y) && s.terrain[idx(x, y)] === Terrain.Forest && s.bIndex[idx(x, y)] < 0) spots.push(idx(x, y));
    }
  });
  if (spots.length) {
    const i = rng.pick(spots);
    const x = i % MAP_W;
    const y = (i / MAP_W) | 0;
    const a: Agent = {
      id: s.nextAgentId++, kind: AgentKind.Creature, x: x + 0.5, y: y + 0.5, path: [], pathIdx: 0, speed: 1.9, homeId: -1, targetId: -1,
      timer: 0, variant: 0, dir: 0, load: 0, species: 'tiger', anchorId: -1, ax: x + 0.5, ay: y + 0.5,
    };
    s.agents.push(a);
    s.stats.tigersTotal++;
    effects.push({ x, y, kind: 'growl', tick: s.tick });
    illTiding(s);
    pushMessage(s, `A war-tiger of Longwood is loose in the forest at (${x},${y}): striped, silent, and twice a hound. Hunters' Lodges, Watch Houses and warden drakes are the only answer.`, 'bad', true, { x, y });
  }
  commitRng(s, rng);
}

/** Daily: hunters, strong Watch and warden drakes kill tigers; a tiger by a hearth takes someone. */
export function dailyTigers(s: GameState, wardenDistricts: Set<number>): number {
  const rng = rngOf(s);
  const lodges: Building[] = [];
  forEachBuilding(s, (b) => { if (b.kind === 'hunterslodge' && b.state === 'ok') lodges.push(b); });
  let killed = 0;
  let taken = 0;
  s.agents = s.agents.filter((a) => {
    if (a.kind !== AgentKind.Creature || a.species !== 'tiger') return true;
    const i = idx(Math.max(0, Math.min(MAP_W - 1, Math.floor(a.x))), Math.max(0, Math.min(MAP_H - 1, Math.floor(a.y))));
    if (lodges.some((l) => Math.hypot(l.x - a.x, l.y - a.y) <= (edictOn(s, 'bounty') ? 20 : 12)) && rng.chance(0.35)) { killed++; return false; }
    if (s.coverage.watch[i] > 160 && rng.chance(0.25)) { killed++; return false; }
    if (s.district[i] && wardenDistricts.has(s.district[i]) && rng.chance(0.5)) { killed++; return false; }
    // it takes someone from a hearth it lies beside
    const bi = s.bIndex[idx(Math.floor(a.x), Math.floor(a.y))];
    forEachBuilding(s, (b) => {
      if (taken > 3 || BUILDING_BY_KEY[b.kind].zone !== Zone.Hearth || b.residents <= 0) return;
      if (Math.abs(b.x - a.x) <= 1.5 && Math.abs(b.y - a.y) <= 1.5 && rng.chance(0.5)) { b.residents--; s.unquieted++; taken++; }
    });
    void bi;
    return true;
  });
  commitRng(s, rng);
  s.stats.tigersKilled += killed;
  if (killed) pushMessage(s, `${killed} war-tiger${killed > 1 ? 's' : ''} brought down. The pelt is worth a season of pelts.`, 'good', true);
  if (taken) illTiding(s);
  if (taken) pushMessage(s, `A war-tiger took ${taken} of the folk from the hearths at the forest edge in the night.`, 'bad', true);
  return killed;
}

// ---------- Font of Quieting ----------
export function fontOfQuieting(s: GameState): boolean {
  return s.buildings.some((b) => b && b.kind === 'fontquieting' && b.state === 'ok' && b.lit);
}

export function isTiger(a: Agent): boolean {
  return a.kind === AgentKind.Creature && a.species === 'tiger';
}

export { isWater };
