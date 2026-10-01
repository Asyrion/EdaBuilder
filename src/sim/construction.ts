/** Construction: placed buildings and spawned zone buildings rise over days, raised by the Warden-Reeve's builders. See DESIGN.md 4.51. */
import { BUILDING_BY_KEY, type BuildingDef } from './catalog';
import { AgentKind, MAP_W, TICKS_PER_DAY, type Agent, type Building, type GameState } from './types';
import { findPath, roadTileOf } from './agents';
import { effects } from './hazards';
import { commitRng, forEachBuilding, markDirty, pushMessage, rngOf } from './world';

/** Set `instant` to skip construction (tests, headless tools). */
export const construction = { instant: false };

export const MAX_BUILDERS = 10;
export const BUILDERS_PER_SITE = 3;
export const BASE_RATE = 0.25; // work per tick with no builder present: the folk raise it themselves, slowly
export const ZONE_RATE = 1; // zone buildings are raised by the folk who will live and work there: a day, no builders

/** Days one builder needs: zone buildings a day, others by cost, wonders longer. */
export function buildDaysFor(def: BuildingDef): number {
  if (def.category === 'zone') return 1;
  if (def.cost <= 0) return 2;
  const d = Math.max(1, Math.min(6, Math.ceil(def.cost / 1500)));
  return def.wonder ? Math.min(10, Math.round(d * 1.5)) : d;
}

export function buildTicks(def: BuildingDef): number {
  return buildDaysFor(def) * TICKS_PER_DAY;
}

export function sites(s: GameState): Building[] {
  const out: Building[] = [];
  forEachBuilding(s, (b) => { if (b.state === 'building') out.push(b); });
  return out;
}

export function builders(s: GameState): Agent[] {
  return s.agents.filter((a) => a.kind === AgentKind.Builder);
}

/** Builders assigned to a site, and how many have arrived. */
export function buildersAt(s: GameState, b: Building): { assigned: number; present: number } {
  let assigned = 0;
  let present = 0;
  for (const a of s.agents) if (a.kind === AgentKind.Builder && a.targetId === b.id) { assigned++; if (a.phase === 2) present++; }
  return { assigned, present };
}

export function builderTarget(s: GameState): number {
  return Math.min(MAX_BUILDERS, 2 + Math.floor(s.population / 150));
}

/** Daily: the builders' yard at the Founding Stake keeps 2 + population/200 builders. */
export function dailyConstruction(s: GameState): void {
  const stake = s.buildings.find((b) => b && b.kind === 'stake' && b.state === 'ok');
  if (!stake) return;
  const rt = roadTileOf(s, stake);
  if (rt < 0) return;
  const have = builders(s);
  const want = builderTarget(s);
  const rng = rngOf(s);
  for (let k = have.length; k < want; k++) {
    s.agents.push({ id: s.nextAgentId++, kind: AgentKind.Builder, x: (rt % MAP_W) + 0.5, y: ((rt / MAP_W) | 0) + 0.5, path: [], pathIdx: 0, speed: 1.0 + rng.next() * 0.2, homeId: stake.id, targetId: -1, timer: 0, variant: k % 3, dir: 0, load: 0, phase: 0 });
  }
  if (have.length > want) {
    const drop = new Set(have.filter((a) => a.targetId < 0).slice(0, have.length - want).map((a) => a.id));
    if (drop.size) s.agents = s.agents.filter((a) => !drop.has(a.id));
  }
  commitRng(s, rng);
}

function finish(s: GameState, b: Building): void {
  b.state = 'ok';
  b.stateDays = 0;
  b.work = 0;
  for (let dy = 0; dy < b.h; dy++) for (let dx = 0; dx < b.w; dx++) markDirty(s, b.x + dx, b.y + dy);
  const def = BUILDING_BY_KEY[b.kind];
  if (def.category !== 'zone') pushMessage(s, `${def.name} at (${b.x},${b.y}) is finished.`, 'good', false, { x: b.x, y: b.y });
  effects.push({ x: b.x, y: b.y, kind: 'bell', tick: s.tick });
}

/** Every tick: builders pick sites, walk the roads to them, and work; sites with nobody still rise slowly. */
export function tickConstruction(s: GameState): void {
  const list = sites(s);
  if (list.length && s.tick % 50 === 1 && builders(s).length < builderTarget(s)) dailyConstruction(s); // the yard hires as soon as there is work
  const crew = builders(s);
  if (!list.length) {
    for (const a of crew) if (a.targetId !== -1 || a.phase !== 0) { a.targetId = -1; a.phase = 0; a.path = []; a.pathIdx = 0; }
    return;
  }
  const byId = new Map<number, Building>();
  for (const b of list) byId.set(b.id, b);
  const assigned = new Map<number, number>();
  for (const a of crew) {
    if (a.targetId >= 0 && !byId.has(a.targetId)) { a.targetId = -1; a.phase = 0; a.path = []; a.pathIdx = 0; }
    if (a.targetId >= 0) assigned.set(a.targetId, (assigned.get(a.targetId) ?? 0) + 1);
  }
  // idle builders take the nearest understaffed site (a few per tick keeps pathfinding cheap)
  let picks = 0;
  for (const a of crew) {
    if (a.targetId >= 0 || picks >= 2) continue;
    let best: Building | null = null;
    let bestD = Infinity;
    for (const b of list) {
      if (BUILDING_BY_KEY[b.kind].category === 'zone' || (assigned.get(b.id) ?? 0) >= BUILDERS_PER_SITE) continue;
      const d = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      if (d < bestD) { bestD = d; best = b; }
    }
    if (!best) break;
    picks++;
    const from = Math.floor(a.y) * MAP_W + Math.floor(a.x);
    const to = roadTileOf(s, best);
    const path = to >= 0 ? findPath(s, from, to) : null;
    if (!path) { assigned.set(best.id, BUILDERS_PER_SITE); a.timer = 100; continue; } // unreachable this tick; the folk build it themselves
    a.targetId = best.id;
    a.path = path;
    a.pathIdx = 0;
    a.phase = 1;
    assigned.set(best.id, (assigned.get(best.id) ?? 0) + 1);
  }
  // walk
  const dt = 1 / 10;
  for (const a of crew) {
    if (a.phase !== 1) continue;
    if (a.pathIdx >= a.path.length) { a.phase = 2; continue; }
    const t = a.path[a.pathIdx];
    const tx = (t % MAP_W) + 0.5;
    const ty = ((t / MAP_W) | 0) + 0.5;
    const dx = tx - a.x;
    const dy = ty - a.y;
    const d = Math.hypot(dx, dy);
    const sp = a.speed * 1.4 * dt;
    if (d <= sp) { a.x = tx; a.y = ty; a.pathIdx++; if (a.pathIdx >= a.path.length) a.phase = 2; }
    else { a.x += (dx / d) * sp; a.y += (dy / d) * sp; a.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 2) : dy > 0 ? 1 : 3; }
  }
  // work
  for (const b of list) {
    const zone = BUILDING_BY_KEY[b.kind].category === 'zone';
    const { present } = zone ? { present: 0 } : buildersAt(s, b);
    b.work -= zone ? ZONE_RATE : BASE_RATE + present;
    if (present > 0 && (s.tick + b.id) % 120 === 0) effects.push({ x: b.x, y: b.y, kind: 'hammer', tick: s.tick });
    if (b.work <= 0) {
      finish(s, b);
      for (const a of crew) if (a.targetId === b.id) { a.targetId = -1; a.phase = 0; a.path = []; a.pathIdx = 0; }
    }
  }
}
