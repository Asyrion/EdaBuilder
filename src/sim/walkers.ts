/** Walkers: NPC kinds that embody a service by doing a visible job on the roads around their building. See DESIGN.md 4.62 and 14.1. */
import { BUILDING_BY_KEY } from './catalog';
import { findPath, roadTileOf } from './agents';
import { effects } from './hazards';
import { AgentKind, MAP_H, MAP_W, SERVICE_TYPES, Zone, idx, inBounds, type Agent, type Building, type GameState, type ServiceType } from './types';
import { commitRng, forEachBuilding, rngOf } from './world';

export interface WalkerJob {
  id: string;
  name: string; // singular, lower case
  plural: string;
  desc: string;
  from: string[]; // building kinds that field it
  count: (s: GameState, b: Building) => number; // walkers per building today
  radius: (b: Building) => number; // patrol radius around the anchor
  prop: string; // sprite prop key (sprites.ts)
  target?: (s: GameState, a: Agent, anchor: Building) => number | null; // a road tile to walk to; null falls back to a random patrol tile
  onArrive?: (s: GameState, a: Agent, i: number) => void; // reaching the end of a leg
  onTile?: (s: GameState, a: Agent, i: number) => void; // entering a new road tile
  meets?: AgentKind[]; // kinds tested for contact every MEET_EVERY ticks
  onMeet?: (s: GameState, a: Agent, o: Agent) => boolean; // true: the other agent is removed
  cap: number; // effect uses per walker per day (a.load)
}

export const MEET_EVERY = 5;
export const MEET_REACH = 1.2;
export const LOG_LINES = 3;
export const WALK_SPEED = 1.3; // tiles per second, builders and walkers alike

/** One road step shared by builders and walkers; no congestion, no portals. Returns true when a new tile was reached. */
export function stepRoad(a: Agent, dt: number, speedMul = 1): boolean {
  if (a.pathIdx >= a.path.length) return false;
  const t = a.path[a.pathIdx];
  const tx = (t % MAP_W) + 0.5;
  const ty = ((t / MAP_W) | 0) + 0.5;
  const dx = tx - a.x;
  const dy = ty - a.y;
  const d = Math.hypot(dx, dy);
  const sp = a.speed * WALK_SPEED * speedMul * dt;
  if (d <= sp) { a.x = tx; a.y = ty; a.pathIdx++; return true; }
  a.x += (dx / d) * sp;
  a.y += (dy / d) * sp;
  a.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 2) : dy > 0 ? 1 : 3;
  return false;
}

export function logLine(a: Agent, text: string): void {
  a.log = [...(a.log ?? []), text].slice(-LOG_LINES);
}

/** The walkers' bonus layer on coverage; transient, rebuilt from nothing after a load, decays by half each day. */
export function walkerBonus(s: GameState, type: ServiceType): Float32Array {
  if (!s.walkerBonus) s.walkerBonus = Object.fromEntries(SERVICE_TYPES.map((t) => [t, new Float32Array(MAP_W * MAP_H)])) as Record<ServiceType, Float32Array>;
  return s.walkerBonus[type];
}
export function paintBonus(s: GameState, type: ServiceType, i: number, amount: number, max: number): void {
  const b = walkerBonus(s, type);
  b[i] = Math.min(max, b[i] + amount);
}

/** Road tile of the building of `kinds` nearest to the walker (not its own anchor), or -1. */
export function nearestRoadOf(s: GameState, a: Agent, kinds: string[], test?: (b: Building) => boolean): number {
  let best = -1;
  let bd = Infinity;
  forEachBuilding(s, (b) => {
    if (b.state !== 'ok' || !kinds.includes(b.kind) || b.id === a.anchorId || (test && !test(b))) return;
    const d = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (d >= bd) return;
    const rt = roadTileOf(s, b);
    if (rt < 0) return;
    bd = d;
    best = rt;
  });
  return best;
}

/** Zone buildings that touch the tile (the ring one tile out), for visits. */
export function buildingsAt(s: GameState, i: number): Building[] {
  const x = i % MAP_W;
  const y = (i / MAP_W) | 0;
  const out: Building[] = [];
  const seen = new Set<number>();
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!inBounds(x + dx, y + dy)) continue;
    const bi = s.bIndex[idx(x + dx, y + dy)];
    if (bi < 0 || seen.has(bi)) continue;
    seen.add(bi);
    const b = s.buildings[bi];
    if (b && b.state === 'ok') out.push(b);
  }
  return out;
}

/** A warden walker within `r` tiles of the building: the spire-wrights' candle keeps the surge off it. */
export function wardenNear(s: GameState, b: Building, r = 5): boolean {
  return s.agents.some((a) => a.kind === AgentKind.Walker && a.job === 'warden' && Math.abs(a.x - (b.x + 0.5)) <= r && Math.abs(a.y - (b.y + 0.5)) <= r);
}

export const WALKER_JOBS: Record<string, WalkerJob> = {
  sexton: {
    id: 'sexton', name: 'sexton', plural: 'sextons', prop: 'spoon',
    desc: 'Walks the lanes around its Boneyard or Ossuary with a spoon of salt: the streets it walks count as tended by deathcare, and it lays the restless it meets and quiets one of the dead for each, three a day.',
    from: ['boneyard', 'ossuary'],
    count: (_s, b) => (b.kind === 'ossuary' ? 2 : 1),
    radius: (b) => BUILDING_BY_KEY[b.kind].service?.radius ?? 12,
    onTile: (s, _a, i) => paintBonus(s, 'death', i, 0.06, 0.25),
    meets: [AgentKind.Restless],
    cap: 3,
    onMeet: (s, a, o) => {
      if (o.kind !== AgentKind.Restless || a.load >= 3) return false;
      a.load += 1;
      s.stats.restlessLaid++;
      s.stats.walkerLayings++;
      s.unquieted = Math.max(0, s.unquieted - 1);
      effects.push({ x: Math.floor(a.x), y: Math.floor(a.y), kind: 'bell', tick: s.tick });
      logLine(a, `Salted and laid one of the restless at (${Math.floor(a.x)},${Math.floor(a.y)}).`);
      return true;
    },
  },
  healer: {
    id: 'healer', name: 'healer', plural: 'healers', prop: 'satchel',
    desc: "Goes from its Healer's Shrine or Hospice to the unhappiest or driest home in reach and tends it: +4 happiness there for a day, six visits a day; the streets it walks count as under health care.",
    from: ['healer', 'hospice'],
    count: (_s, b) => (b.kind === 'hospice' ? 2 : 1),
    radius: (b) => BUILDING_BY_KEY[b.kind].service?.radius ?? 10,
    cap: 6,
    target: (s, a, anchor) => {
      const r = BUILDING_BY_KEY[anchor.kind].service?.radius ?? 10;
      let best: Building | null = null;
      let worst = 55;
      forEachBuilding(s, (b) => {
        if (b.state !== 'ok' || BUILDING_BY_KEY[b.kind].zone !== Zone.Hearth) return;
        if (Math.abs(b.x - anchor.x) > r || Math.abs(b.y - anchor.y) > r) return;
        if ((b.tended ?? -1) >= s.day) return;
        const score = b.happiness - (b.watered ? 0 : 10);
        if (score < worst) { worst = score; best = b; }
      });
      if (!best) return null;
      const rt = roadTileOf(s, best);
      return rt >= 0 ? rt : null;
    },
    onTile: (s, _a, i) => paintBonus(s, 'health', i, 0.05, 0.2),
    onArrive: (s, a, i) => {
      if (a.load >= 6) return;
      for (const b of buildingsAt(s, i)) {
        if (BUILDING_BY_KEY[b.kind].zone !== Zone.Hearth || (b.tended ?? -1) >= s.day) continue;
        b.tended = s.day;
        a.load += 1;
        s.stats.healerVisits++;
        logLine(a, `Tended the hearths at (${b.x},${b.y}).`);
        break;
      }
    },
  },
  warden: {
    id: 'warden', name: 'Tallowkin warden', plural: 'Tallowkin wardens', prop: 'candle',
    desc: 'Under the Spire Wardens edict every spire and Nexus sends a candle-eyed warden walking spire to spire: no building within five tiles of a warden is warped by a wild surge, and the streets it walks count as warded.',
    from: ['spire', 'nexus'],
    count: (s, b) => (s.edicts.wardens && b.lit ? 1 : 0),
    radius: () => 12,
    cap: 99,
    target: (s, a) => { const rt = nearestRoadOf(s, a, ['spire', 'nexus'], (b) => Math.abs(b.x - a.x) + Math.abs(b.y - a.y) <= 24); return rt >= 0 ? rt : null; },
    onTile: (s, _a, i) => paintBonus(s, 'ward', i, 0.03, 0.12),
    onArrive: (s, a, i) => { const sp = buildingsAt(s, i).find((b) => b.kind === 'spire' || b.kind === 'nexus'); if (sp) { s.stats.wardenRounds++; logLine(a, `Checked the ${sp.kind === 'nexus' ? 'Nexus' : 'spire'} at (${sp.x},${sp.y}).`); } },
  },
  watchman: {
    id: 'watchman', name: 'watchman', plural: 'watchmen', prop: 'rod',
    desc: 'Patrols the streets around its Watch House: the tiles it walks count as watched, and it kills hounds and lays the restless it meets, two of each a day.',
    from: ['watchpost', 'watchhouse'],
    count: (_s, b) => (b.kind === 'watchhouse' ? (b.lit ? 2 : 1) : 1),
    radius: (b) => BUILDING_BY_KEY[b.kind].service?.radius ?? 8,
    onTile: (s, _a, i) => paintBonus(s, 'watch', i, 0.08, 0.3),
    meets: [AgentKind.Creature, AgentKind.Restless],
    cap: 4,
    onMeet: (s, a, o) => {
      const kills = Math.floor(a.load / 10);
      const layings = a.load % 10;
      if (o.kind === AgentKind.Creature) {
        if (o.species !== 'hound' || kills >= 2) return false;
        a.load += 10;
        s.stats.houndsKilled++;
        s.stats.walkerKills++;
        effects.push({ x: Math.floor(a.x), y: Math.floor(a.y), kind: 'growl', tick: s.tick });
        logLine(a, `Killed a hound at (${Math.floor(a.x)},${Math.floor(a.y)}).`);
        return true;
      }
      if (layings >= 2) return false;
      a.load += 1;
      s.stats.restlessLaid++;
      s.stats.walkerLayings++;
      logLine(a, `Laid one of the restless at (${Math.floor(a.x)},${Math.floor(a.y)}).`);
      return true;
    },
  },
};

export function jobOf(a: Agent): WalkerJob | null {
  return a.kind === AgentKind.Walker && a.job ? WALKER_JOBS[a.job] ?? null : null;
}

export function walkersOf(s: GameState, b: Building): Agent[] {
  return s.agents.filter((a) => a.kind === AgentKind.Walker && a.anchorId === b.id);
}

export function spawnWalker(s: GameState, job: WalkerJob, b: Building, at: number): Agent {
  const rng = rngOf(s);
  const a: Agent = {
    id: s.nextAgentId++, kind: AgentKind.Walker, x: (at % MAP_W) + 0.5, y: ((at / MAP_W) | 0) + 0.5, path: [], pathIdx: 0,
    speed: 0.9 + rng.next() * 0.2, homeId: b.id, targetId: -1, timer: rng.int(30), variant: rng.int(3), dir: 0, load: 0,
    anchorId: b.id, ax: b.x, ay: b.y, job: job.id, log: [],
  };
  commitRng(s, rng);
  s.agents.push(a);
  return a;
}

/** Daily: every building fields its walkers; orphans and surplus go home; counters and the bonus layer fade. */
export function dailyWalkers(s: GameState): void {
  const alive = new Map<number, Building>();
  forEachBuilding(s, (b) => { if (b.state === 'ok') alive.set(b.id, b); });
  const keep: Agent[] = [];
  const perAnchor = new Map<string, number>();
  for (const a of s.agents) {
    if (a.kind !== AgentKind.Walker) { keep.push(a); continue; }
    const job = jobOf(a);
    const b = a.anchorId !== undefined ? alive.get(a.anchorId) : undefined;
    if (!job || !b || !job.from.includes(b.kind)) continue;
    const key = `${job.id}:${b.id}`;
    const have = perAnchor.get(key) ?? 0;
    if (have >= job.count(s, b)) continue;
    perAnchor.set(key, have + 1);
    a.load = 0;
    a.log = [];
    keep.push(a);
  }
  s.agents = keep;
  for (const job of Object.values(WALKER_JOBS)) {
    for (const b of alive.values()) {
      if (!job.from.includes(b.kind)) continue;
      const want = job.count(s, b);
      const have = perAnchor.get(`${job.id}:${b.id}`) ?? 0;
      if (have >= want) continue;
      const rt = roadTileOf(s, b);
      if (rt < 0) continue;
      for (let k = have; k < want; k++) spawnWalker(s, job, b, rt);
    }
  }
  if (s.walkerBonus) for (const t of SERVICE_TYPES) { const b = s.walkerBonus[t]; for (let i = 0; i < b.length; i++) b[i] *= 0.5; }
}

/** Every tick: walkers patrol random road tiles within their radius, work the tiles they enter and the agents they meet. */
export function tickWalkers(s: GameState): void {
  let rng: ReturnType<typeof rngOf> | null = null;
  const dt = 0.1;
  const removed = new Set<number>();
  const meetTick = s.tick % MEET_EVERY === 0;
  for (const a of s.agents) {
    if (a.kind !== AgentKind.Walker) continue;
    const job = jobOf(a);
    if (!job) continue;
    // a walker fights or lays what it meets even while it pauses
    if (meetTick && job.meets && job.onMeet && a.load < job.cap * 10) {
      for (const o of s.agents) {
        if (removed.has(o.id) || !job.meets.includes(o.kind) || o === a) continue;
        if (Math.abs(o.x - a.x) > MEET_REACH || Math.abs(o.y - a.y) > MEET_REACH) continue;
        if (job.onMeet(s, a, o)) removed.add(o.id);
      }
    }
    if (a.timer > 0) { a.timer--; continue; }
    if (a.pathIdx >= a.path.length) {
      rng ??= rngOf(s);
      const ax = a.ax ?? Math.floor(a.x);
      const ay = a.ay ?? Math.floor(a.y);
      const r = job.radius(a.anchorId !== undefined ? s.buildings.find((b) => b && b.id === a.anchorId) ?? ({ kind: 'watchpost' } as Building) : ({ kind: 'watchpost' } as Building));
      const cur = idx(Math.floor(a.x), Math.floor(a.y));
      let path: number[] | null = null;
      const anchor = a.anchorId !== undefined ? s.buildings.find((b) => b && b.id === a.anchorId) : null;
      if (job.target && anchor) {
        const to = job.target(s, a, anchor);
        if (to !== null && to !== cur) path = findPath(s, cur, to, 1200);
      }
      for (let k = 0; k < 6 && !path; k++) {
        const x = ax + rng.int(2 * r + 1) - r;
        const y = ay + rng.int(2 * r + 1) - r;
        if (!inBounds(x, y) || !s.road[idx(x, y)] || idx(x, y) === cur) continue;
        path = findPath(s, cur, idx(x, y), 800);
      }
      if (path) { a.path = path; a.pathIdx = 0; } else a.timer = 100;
      continue;
    }
    if (stepRoad(a, dt)) {
      const i = idx(Math.floor(a.x), Math.floor(a.y));
      job.onTile?.(s, a, i);
      if (a.pathIdx >= a.path.length) { job.onArrive?.(s, a, i); rng ??= rngOf(s); a.timer = 20 + rng.int(40); }
    }
  }
  if (removed.size) s.agents = s.agents.filter((o) => !removed.has(o.id));
  if (rng) commitRng(s, rng);
}
