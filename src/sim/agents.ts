/** Citizens, carts and the restless: pathfinding on the road graph and movement. */
import { marketQuarterAt } from './districts';
import { BUILDING_BY_KEY, ROAD_BY_TYPE } from './catalog';
import { roadAt, roadSpeedAt } from './roads';
import { AgentKind, MAP_H, MAP_W, TICKS_PER_SEC, Zone, idx, inBounds, type Agent, type Building, type GameState } from './types';
import { commitRng, forEachBuilding, rngOf } from './world';
import { edictOn } from './edicts';

const MAX_AGENTS = 1400;
const MAX_RESTLESS = 60;

// Path cache keyed by from|to tile, one per state: emptied when the roads change and each day when the traffic is smoothed
// (scope reset phase 1d), so a path is always what A* would find today and a loaded charter walks the same paths.
const pathCaches = new WeakMap<GameState, { version: number; map: Map<number, number[] | null> }>();
export let roadVersion = 0;
export function bumpRoadVersion(): void {
  roadVersion++;
}

/** A* over road tiles (4-neighbour). Returns tile indices from start to goal, or null. */
export function findPath(state: GameState, start: number, goal: number, maxNodes = 6000): number[] | null {
  let cache = pathCaches.get(state);
  if (!cache || cache.version !== roadVersion) {
    cache = { version: roadVersion, map: new Map() };
    pathCaches.set(state, cache);
  }
  const pathCache = cache.map;
  const key = start * 65536 + goal;
  const cached = pathCache.get(key);
  if (cached !== undefined) return cached ? cached.slice() : null;
  if (!state.road[start] || !state.road[goal]) return null;
  const result = astar(state, start, goal, maxNodes);
  if (pathCache.size > 4000) pathCache.clear();
  pathCache.set(key, result);
  return result ? result.slice() : null;
}

function astar(state: GameState, start: number, goal: number, maxNodes: number): number[] | null {
  const gx = goal % MAP_W;
  const gy = (goal / MAP_W) | 0;
  const g = new Map<number, number>();
  const came = new Map<number, number>();
  // simple binary heap
  const heap: number[] = [];
  const f = new Map<number, number>();
  const push = (i: number, fi: number) => {
    f.set(i, fi);
    heap.push(i);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (f.get(heap[p])! <= f.get(heap[c])!) break;
      [heap[p], heap[c]] = [heap[c], heap[p]];
      c = p;
    }
  };
  const pop = (): number => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let c = 0;
      for (;;) {
        const l = c * 2 + 1;
        const r = l + 1;
        let m = c;
        if (l < heap.length && f.get(heap[l])! < f.get(heap[m])!) m = l;
        if (r < heap.length && f.get(heap[r])! < f.get(heap[m])!) m = r;
        if (m === c) break;
        [heap[m], heap[c]] = [heap[c], heap[m]];
        c = m;
      }
    }
    return top;
  };
  const h = (i: number) => Math.abs((i % MAP_W) - gx) + Math.abs(((i / MAP_W) | 0) - gy);
  g.set(start, 0);
  push(start, h(start));
  const closed = new Set<number>();
  let expanded = 0;
  while (heap.length) {
    const cur = pop();
    if (cur === goal) {
      const path = [cur];
      let c = cur;
      while (came.has(c)) {
        c = came.get(c)!;
        path.push(c);
      }
      path.reverse();
      return path;
    }
    if (closed.has(cur)) continue;
    closed.add(cur);
    if (++expanded > maxNodes) return null;
    const x = cur % MAP_W;
    const y = (cur / MAP_W) | 0;
    const gc = g.get(cur)!;
    const nb = [cur - 1, cur + 1, cur - MAP_W, cur + MAP_W];
    const ok = [x > 0, x < MAP_W - 1, y > 0, y < MAP_H - 1];
    for (let k = 0; k < nb.length; k++) {
      if (!ok[k]) continue;
      const j = nb[k];
      const rt = roadAt(state, j);
      if (!rt) continue;
      const congestion = state.trafficSmooth[j] / 255;
      const cost = 1 / roadSpeedAt(state, j) + congestion * 1.5; // mud on a track
      const ng = gc + cost;
      if (ng < (g.get(j) ?? Infinity)) {
        g.set(j, ng);
        came.set(j, cur);
        push(j, ng + h(j));
      }
    }
  }
  return null;
}

/** A road tile adjacent to the building footprint, or -1. */
export function marketStockCap(s: GameState, b: Building): number {
  return 20 * b.level * (marketQuarterAt(s, idx(b.x, b.y)) ? 1.5 : 1);
}

/** The door: the first road tile on a side of the footprint, else a corner (a corner counts since iteration 49; the sides come first so every older door stays where it was). */
export function roadTileOf(state: GameState, b: Building): number {
  for (let dy = -1; dy <= b.h; dy++)
    for (let dx = -1; dx <= b.w; dx++) {
      const edge = dx === -1 || dy === -1 || dx === b.w || dy === b.h;
      if (!edge) continue;
      if ((dx === -1 || dx === b.w) && (dy === -1 || dy === b.h)) continue;
      const x = b.x + dx;
      const y = b.y + dy;
      if (inBounds(x, y) && state.road[idx(x, y)]) return idx(x, y);
    }
  for (const [dx, dy] of [[-1, -1], [b.w, -1], [-1, b.h], [b.w, b.h]]) {
    const x = b.x + dx;
    const y = b.y + dy;
    if (inBounds(x, y) && state.road[idx(x, y)]) return idx(x, y);
  }
  return -1;
}

function buildingById(state: GameState, id: number): Building | null {
  if (id < 0) return null;
  for (const b of state.buildings) if (b && b.id === id) return b;
  return null;
}

/** Daily: match agent count to population, assign homes/work. */
export function dailyAgents(state: GameState): void {
  const rng = rngOf(state);
  const homes: Building[] = [];
  const works: Building[] = [];
  const markets: Building[] = [];
  const crafts: Building[] = [];
  const mines: Building[] = [];
  const arcanes: Building[] = [];
  forEachBuilding(state, (b) => {
    const def = BUILDING_BY_KEY[b.kind];
    if (b.state !== 'ok') return;
    if (def.leystone) mines.push(b);
    if (def.zone === Zone.Arcane) arcanes.push(b);
    if (def.zone === Zone.Hearth && b.residents > 0) homes.push(b);
    else if (def.zone === Zone.Market) {
      works.push(b);
      markets.push(b);
    } else if (def.zone === Zone.Craft) {
      works.push(b);
      crafts.push(b);
    } else if (def.zone === Zone.Arcane) works.push(b);
    else if (def.category === 'service' || def.category === 'leisure') {
      works.push(b);
      if (def.goodsRate) crafts.push(b);
    }
  });
  const targetCitizens = Math.min(MAX_AGENTS, Math.round(state.population / 2));
  const targetCarts = Math.min(220, Math.round(crafts.length * 0.5 + markets.length * 0.3) + (arcanes.length ? mines.length * 2 : 0));
  let citizens = 0;
  let carts = 0;
  for (const a of state.agents) {
    if (a.kind === AgentKind.Citizen) citizens++;
    else if (a.kind === AgentKind.Cart) carts++;
  }
  // remove agents whose home vanished
  state.agents = state.agents.filter((a) => a.kind === AgentKind.Restless || a.homeId >= 0);
  citizens = 0;
  carts = 0;
  for (const a of state.agents) {
    if (a.kind === AgentKind.Citizen) citizens++;
    else if (a.kind === AgentKind.Cart) carts++;
  }
  while (citizens > targetCitizens) {
    const i = state.agents.findIndex((a) => a.kind === AgentKind.Citizen);
    if (i < 0) break;
    state.agents.splice(i, 1);
    citizens--;
  }
  while (carts > targetCarts) {
    const i = state.agents.findIndex((a) => a.kind === AgentKind.Cart && !mines.some((m) => m.id === a.homeId));
    if (i < 0) break;
    state.agents.splice(i, 1);
    carts--;
  }
  if (homes.length) {
    let spawned = 0;
    while (citizens < targetCitizens && spawned < 80) {
      const home = rng.pick(homes);
      const rt = roadTileOf(state, home);
      if (rt < 0) {
        spawned++;
        continue;
      }
      state.agents.push({
        id: state.nextAgentId++,
        kind: AgentKind.Citizen,
        x: (rt % MAP_W) + 0.5,
        y: ((rt / MAP_W) | 0) + 0.5,
        path: [],
        pathIdx: 0,
        speed: 0.9 + rng.next() * 0.3,
        homeId: home.id,
        targetId: -1,
        timer: rng.int(200),
        variant: rng.int(6),
        dir: 0,
        load: 0,
      });
      citizens++;
      spawned++;
    }
  }
  // every mine keeps two carts of its own once there are enchanters to feed
  if (arcanes.length) {
    for (const mine of mines) {
      const own = state.agents.filter((a) => a.kind === AgentKind.Cart && a.homeId === mine.id).length;
      const rt = roadTileOf(state, mine);
      for (let k = own; k < 2 && rt >= 0; k++) {
        state.agents.push({ id: state.nextAgentId++, kind: AgentKind.Cart, x: (rt % MAP_W) + 0.5, y: ((rt / MAP_W) | 0) + 0.5, path: [], pathIdx: 0, speed: 0.8, homeId: mine.id, targetId: -1, timer: rng.int(100), variant: 0, dir: 0, load: 0 });
        carts++;
      }
    }
  }
  const cartHomes = crafts;
  if (cartHomes.length && markets.length) {
    let spawned = 0;
    while (carts < targetCarts && spawned < 30) {
      const home = rng.pick(cartHomes);
      const rt = roadTileOf(state, home);
      spawned++;
      if (rt < 0) continue;
      state.agents.push({
        id: state.nextAgentId++,
        kind: AgentKind.Cart,
        x: (rt % MAP_W) + 0.5,
        y: ((rt / MAP_W) | 0) + 0.5,
        path: [],
        pathIdx: 0,
        speed: 0.8,
        homeId: home.id,
        targetId: -1,
        timer: rng.int(300),
        variant: home.kind === 'mine' ? 0 : 1 + rng.int(2), // the floating carts (variant 3) are parked (scope reset phase 1c)
        dir: 0,
        load: 0,
      });
      carts++;
    }
  }
  commitRng(state, rng);
}

export function spawnRestless(state: GameState, x: number, y: number): boolean {
  const count = state.agents.reduce((n, a) => n + (a.kind === AgentKind.Restless ? 1 : 0), 0);
  if (count >= MAX_RESTLESS) return false;
  const rng = rngOf(state);
  state.agents.push({
    id: state.nextAgentId++,
    kind: AgentKind.Restless,
    x: x + 0.5,
    y: y + 0.5,
    path: [],
    pathIdx: 0,
    speed: 0.35 + rng.next() * 0.2,
    homeId: -1,
    targetId: -1,
    timer: 0,
    variant: rng.int(3),
    dir: 0,
    load: 0,
  });
  commitRng(state, rng);
  state.stats.restlessTotal++;
  return true;
}

/** Pick the next trip for an idle agent. */
interface Pools {
  works: Building[];
  markets: Building[];
  homes: Building[];
  arcanes: Building[];
}

function chooseTrip(state: GameState, a: Agent, rng: ReturnType<typeof rngOf>, pools: Pools): void {
  const cur = idx(Math.floor(a.x), Math.floor(a.y));
  if (a.kind === AgentKind.Restless) {
    // wander to a random road tile nearby
    for (let t = 0; t < 6; t++) {
      const x = Math.floor(a.x) + rng.int(21) - 10;
      const y = Math.floor(a.y) + rng.int(21) - 10;
      if (!inBounds(x, y) || !state.road[idx(x, y)]) continue;
      const p = findPath(state, cur, idx(x, y), 800);
      if (p) {
        a.path = p;
        a.pathIdx = 0;
        return;
      }
    }
    // not on a road: hop to nearest road tile
    a.timer = 40;
    return;
  }
  const home = buildingById(state, a.homeId);
  if (!home) {
    a.homeId = -1;
    return;
  }
  let dest: Building | null = null;
  if (a.kind === AgentKind.Cart) {
    if (a.targetId === -1) {
      // wait for a load; then deliver to the hungriest reachable buyer (markets for goods, enchanters for leystone)
      const buyers = home.kind === 'mine' ? pools.arcanes : pools.markets;
      if (home.stock < 4 || !buyers.length) {
        a.timer = 120;
        return;
      }
      let best: Building | null = null;
      let bs = -Infinity;
      for (let k = 0; k < 6; k++) {
        const m = rng.pick(buyers);
        const score = -m.stock * 2 - Math.abs(m.x - home.x) - Math.abs(m.y - home.y) * 0.5;
        if (score > bs) {
          bs = score;
          best = m;
        }
      }
      dest = best;
      a.load = Math.min(12, home.stock);
    } else dest = home;
  } else {
    const atHome = a.targetId === -1 || a.targetId === home.id;
    if (atHome) {
      const pool = rng.chance(0.75) ? pools.works : pools.markets;
      if (pool.length) dest = rng.pick(pool);
    } else dest = home;
  }
  if (!dest) {
    a.timer = 100;
    return;
  }
  const from = state.road[cur] ? cur : roadTileOf(state, home);
  const to = roadTileOf(state, dest);
  if (from < 0 || to < 0) {
    a.timer = 200;
    return;
  }
  const p = findPath(state, from, to);
  if (!p) {
    a.timer = 300;
    return;
  }
  a.path = p;
  a.pathIdx = 0;
  a.targetId = dest === home ? home.id : dest.id;
  if (a.kind === AgentKind.Cart) {
    if (dest === home) a.targetId = -1;
    else home.stock -= a.load; // goods leave the works
  }
}

/** Called every tick. Moves agents along paths and accumulates traffic. */
export function tickAgents(state: GameState): void {
  const rng = rngOf(state);
  let pools: Pools | null = null;
  const getPools = () => {
    if (pools) return pools;
    const works: Building[] = [];
    const markets: Building[] = [];
    const homes: Building[] = [];
    const arcanes: Building[] = [];
    forEachBuilding(state, (b) => {
      const def = BUILDING_BY_KEY[b.kind];
      if (b.state !== 'ok') return;
      if (def.zone === Zone.Hearth) homes.push(b);
      else if (def.zone === Zone.Market) {
        markets.push(b);
        works.push(b);
      } else if (def.zone === Zone.Craft) works.push(b);
      else if (def.zone === Zone.Arcane) {
        works.push(b);
        arcanes.push(b);
      } else if (def.category === 'service' || def.category === 'leisure' || def.leystone) works.push(b);
    });
    pools = { works, markets, homes, arcanes };
    return pools;
  };
  const dt = 1 / TICKS_PER_SEC;
  for (const a of state.agents) {
    if (a.kind === AgentKind.Builder) continue;
    if (a.timer > 0) {
      a.timer--;
      continue;
    }
    if (a.pathIdx >= a.path.length) {
      chooseTrip(state, a, rng, getPools());
      if (a.pathIdx >= a.path.length && a.timer === 0) a.timer = 60 + rng.int(120);
      continue;
    }
    const t = a.path[a.pathIdx];
    const tx = (t % MAP_W) + 0.5;
    const ty = ((t / MAP_W) | 0) + 0.5;
    const rt = roadAt(state, t) || 1;
    const congestion = state.trafficSmooth[t] / 255;
    let sp = a.speed * (roadSpeedAt(state, t) || ROAD_BY_TYPE[rt].speed) * (1 - congestion * 0.6) * dt;
    if (a.kind === AgentKind.Cart) sp *= 1.1;
    const dx = tx - a.x;
    const dy = ty - a.y;
    const d = Math.hypot(dx, dy);
    if (d <= sp) {
      a.x = tx;
      a.y = ty;
      a.pathIdx++;
      if (t < state.traffic.length) state.traffic[t] += a.kind === AgentKind.Cart ? 3 : 1;
      if (a.pathIdx >= a.path.length) {
        // arrived
        a.timer = a.kind === AgentKind.Restless ? 20 + rng.int(60) : 150 + rng.int(450);
        if (a.kind === AgentKind.Cart && a.targetId !== -1 && a.load > 0) {
          const m = buildingById(state, a.targetId);
          if (m && m.state === 'ok') {
            const cap = BUILDING_BY_KEY[m.kind].zone === Zone.Arcane ? 20 * m.level : marketStockCap(state, m);
            m.stock = Math.min(cap, m.stock + a.load);
            state.goodsSold += a.load;
          }
          a.load = 0;
        }
      }
    } else {
      a.x += (dx / d) * sp;
      a.y += (dy / d) * sp;
      a.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 2) : dy > 0 ? 1 : 3;
    }
    // restless not on a road: drift toward nearest road
    if (a.kind === AgentKind.Restless && !state.road[t]) a.pathIdx = a.path.length;
  }
  if (state.agents.some((a) => a.homeId === -2)) state.agents = state.agents.filter((a) => a.homeId !== -2);
  commitRng(state, rng);
}

/** Daily traffic smoothing: traffic count vs road capacity -> 0..255. */
export function dailyTraffic(state: GameState): void {
  pathCaches.delete(state); // the congestion changes below: yesterday's paths are not today's
  for (let i = 0; i < state.traffic.length; i++) {
    const rt = roadAt(state, i);
    let v = 0;
    if (rt) {
      const cap = ROAD_BY_TYPE[rt].capacity;
      v = Math.min(255, Math.round((state.traffic[i] / cap) * 255));
    }
    state.trafficSmooth[i] = Math.round(state.trafficSmooth[i] * 0.5 + v * 0.5);
    state.traffic[i] = 0;
  }
}

/** Clear restless standing in watch/ward coverage (daily). Returns number cleared. */
export function dailyRestless(state: GameState): number {
  const rng = rngOf(state);
  let cleared = 0;
  state.agents = state.agents.filter((a) => {
    if (a.kind !== AgentKind.Restless) return true;
    const i = idx(Math.max(0, Math.min(MAP_W - 1, Math.floor(a.x))), Math.max(0, Math.min(MAP_H - 1, Math.floor(a.y))));
    const p = ((state.coverage.watch[i] / 255) * 0.6 + (state.coverage.ward[i] / 255) * 0.7 + (state.coverage.faith[i] / 255) * 0.2) * (edictOn(state, 'curfew', i) ? 1.4 : 1);
    if (rng.chance(Math.min(0.9, p))) {
      cleared++;
      return false;
    }
    return true;
  });
  commitRng(state, rng);
  return cleared;
}

export function restlessCount(state: GameState): number {
  let n = 0;
  for (const a of state.agents) if (a.kind === AgentKind.Restless) n++;
  return n;
}
