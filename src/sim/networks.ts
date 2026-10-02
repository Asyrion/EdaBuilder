import { isCradle } from './wyrmcraft';
/** Great halls that relay the ley like a Nexus: the Lantern of Vell and the Underking's Seat. */
export const LEY_HALLS = WONDER_HALLS;
/** Mana (ley) and water networks. */
import { BUILDING_BY_KEY, NODE_MANA, ROAD_BY_TYPE, ROADS, WALL_MANA, WONDER_HALLS } from './catalog';
import { MAP_H, MAP_W, RoadType, idx, inBounds, type Building, type GameState , Terrain } from './types';
import { forEachBuilding, markDirty, nodeFlow, seasonOf, waterRadiusOf } from './world';
import { modifierSum } from './edicts';
import { guildEffect, hallActive } from './guilds';
import { relicDone } from './relics';
import { factionOf } from '../data/factions';
import { bumpRoadVersion } from './agents';
import { foundryMana } from './beasts';
import { floatingMana } from './vehicles';
import { aspectAt, dragonAuras, millFactor } from './weave';
import { edictOn } from './edicts';
import { treeStage, TREE_LEISURE_RADIUS } from './growth';

const SPIRE_LINK = 6;
const SPIRE_RADIUS = 5;
const NEXUS_RADIUS = 9;
const NODE_RADIUS = 3;
/** A second Torrent Mill within 8 of an older one runs at this share: they share the river. */
export const MILL_SHARE = 0.6;
/** A Portal Arch carries this many crossings a day before the jump congests; each crossing draws PORTAL_MANA. */
export const PORTAL_CAP = 60;
export const PORTAL_MANA = 0.1;
/** How much mana of buildings a member of the chain can light; over it, its farthest go dark. Nodes carry anything. */
export const LOAD_CAP: Record<string, number> = { spire: 80, wicktower: 20, stake: 60, nexus: 200 };
export function loadCapOf(b: Building): number {
  return LOAD_CAP[b.kind] ?? (LEY_HALLS.includes(b.kind) ? 200 : 80);
}
export function isLeyMember(b: Building): boolean {
  return b.kind === 'spire' || b.kind === 'wicktower' || b.kind === 'nexus' || b.kind === 'stake' || LEY_HALLS.includes(b.kind);
}
/** Brownout tier: 0 essential (wards, water), 1 normal, 2 dim (leisure): the dim go dark first. */
export function priorityOf(b: Building): 0 | 1 | 2 {
  if (b.priority !== undefined) return b.priority;
  const def = BUILDING_BY_KEY[b.kind];
  if (def.service?.type === 'ward' || def.waterRadius) return 0;
  if (def.category === 'leisure') return 2;
  return 1;
}
interface MemberLoad { b: Building; x: number; y: number; cap: number; load: number; list: { c: Consumer; d: number }[] }
interface Consumer { s: number; use: number; d: number; wasLit: boolean; prio: number }

let beastmastersOn = false;
export function manaUseOf(b: Building, hush = false): number {
  const def = BUILDING_BY_KEY[b.kind];
  if (b.state === 'ruin' || b.state === 'abandoned') return 0;
  const base = def.category === 'zone' ? Math.round(def.manaUse * (1 + (b.level - 1) * 0.5) * 2) / 2 : def.manaUse;
  if (isCradle(b.kind) && beastmastersOn) return base * 0.6;
  return hush && def.category === 'zone' ? base * 1.25 : base;
}

function manaMult(state: GameState): number {
  return 1 + modifierSum(state, 'mana');
}

/** Recomputes lit tiles, building.lit, supply/demand and brownout share. */
export function updateMana(state: GameState): void {
  beastmastersOn = edictOn(state, 'beastmasters');
  const n = MAP_W * MAP_H;
  const lit = new Uint8Array(n);
  const oldLit = state.lit;

  // 1. supply from the producers; the nodes are added after the chain is drawn (a node's flow counts only while something lit links it)
  let supply = 0;
  let storageMax = 0;
  forEachBuilding(state, (b) => {
    const def = BUILDING_BY_KEY[b.kind];
    if (b.state !== 'ok') return;
    if (def.manaProduce) {
      // a mill with an older mill within 8 shares its river and runs at ×0.6
      const shared = b.kind === 'torrentmill' && state.buildings.some((o) => o && o !== b && o.kind === 'torrentmill' && o.state === 'ok' && o.id < b.id && Math.abs(o.x - b.x) <= 8 && Math.abs(o.y - b.y) <= 8);
      const made = def.manaProduce * (b.kind === 'torrentmill' ? millFactor(state) * (aspectAt(state, b.x, b.y) === 'tide' ? 1.5 : 1) * factionOf(state).rules.millMana * (shared ? MILL_SHARE : 1) : 1) * (state.terrain[idx(b.x, b.y)] === Terrain.Hills ? factionOf(state).rules.hillMana : 1);
      supply += made;
      b.load = made;
    }
    if (def.manaStorage && (def.category !== 'special' || hallActive(state, b.kind))) storageMax += def.manaStorage * (aspectAt(state, b.x, b.y) === 'vein' ? 1.5 : 1);
  });

  // 2. spire chain: BFS from nodes over spires/nexus
  const spires: Building[] = [];
  forEachBuilding(state, (b) => {
    if ((b.kind === 'spire' || b.kind === 'wicktower' || b.kind === 'nexus' || LEY_HALLS.includes(b.kind) || b.kind === 'stake') && b.state !== 'ruin' && b.state !== 'building') spires.push(b);
  });
  const spireLit = new Array(spires.length).fill(false);
  const linked: boolean[] = state.nodes.map(() => false);
  const members: MemberLoad[] = [];
  const sources: { x: number; y: number; r: number }[] = state.nodes.map((nd) => ({ x: nd.x, y: nd.y, r: NODE_RADIUS }));
  const queue: { x: number; y: number; node: number }[] = state.nodes.map((nd, k) => ({ x: nd.x, y: nd.y, node: k }));
  const reach = factionOf(state).rules.spireReach; // the Tallowkin's spires reach a tile further
  const linkOf = (b: Building) => (b.kind === 'nexus' || LEY_HALLS.includes(b.kind) ? SPIRE_LINK + 3 : b.kind === 'stake' ? 4 : SPIRE_LINK + reach);
  const radiusOf = (b: Building) => (b.kind === 'nexus' || LEY_HALLS.includes(b.kind) ? NEXUS_RADIUS : b.kind === 'stake' ? 4 : b.kind === 'wicktower' ? 4 : SPIRE_RADIUS + reach);
  while (queue.length) {
    const q = queue.pop()!;
    for (let k = 0; k < spires.length; k++) {
      if (spireLit[k]) continue;
      const s = spires[k];
      const cx = s.x + (s.w - 1) / 2;
      const cy = s.y + (s.h - 1) / 2;
      const d = Math.hypot(cx - q.x, cy - q.y);
      if (d <= linkOf(s) + 0.5) {
        spireLit[k] = true;
        s.lit = true;
        if (q.node >= 0) linked[q.node] = true; // a member found straight from a node links it
        if (s.kind !== 'wicktower') queue.push({ x: cx, y: cy, node: -1 }); // a Wick-Tower glows but relays nothing
        sources.push({ x: cx, y: cy, r: radiusOf(s) });
        members.push({ b: s, x: cx, y: cy, cap: loadCapOf(s), load: 0, list: [] });
      }
    }
  }
  for (let k = 0; k < spires.length; k++) if (!spireLit[k]) { spires[k].lit = false; spires[k].load = undefined; }
  state.nodeLinked = linked;
  supply += nodeFlow(state, linked) * factionOf(state).rules.nodeMana;

  // 2a. drakes: a Glim drake lights its cradle's neighbours; a Vein drake roosting adds flow
  for (const au of dragonAuras(state)) {
    if (au.line === 'glim') sources.push({ x: au.x, y: au.y, r: 3 });
    if (au.line === 'vein') supply += 10;
  }
  // 2b. self-lit buildings (Hanging Gardens) and living glowvine lanes are sources that need no Vein
  const gardens: { x: number; y: number }[] = [];
  forEachBuilding(state, (b) => {
    const def = BUILDING_BY_KEY[b.kind];
    if (def.selfLit && b.state === 'ok') {
      if (b.kind === 'hanginggardens') gardens.push({ x: b.x + (b.w - 1) / 2, y: b.y + (b.h - 1) / 2 }); // only the vines' own gardens keep a lane alive
      sources.push({ x: b.x + (b.w - 1) / 2, y: b.y + (b.h - 1) / 2, r: 2 });
    }
  });
  if (gardens.length) {
    for (let i = 0; i < n; i++) {
      if (state.road[i] !== RoadType.Glowvine) continue;
      const x = i % MAP_W;
      const y = (i / MAP_W) | 0;
      if (gardens.some((g) => Math.hypot(g.x - x, g.y - y) <= 12)) lit[i] = 1;
    }
  }
  // 3. lit tiles from sources
  for (const s of sources) {
    const r = s.r;
    for (let dy = -r - 1; dy <= r + 1; dy++)
      for (let dx = -r - 1; dx <= r + 1; dx++) {
        const x = Math.round(s.x + dx);
        const y = Math.round(s.y + dy);
        if (!inBounds(x, y)) continue;
        if (Math.hypot(x - s.x, y - s.y) <= r + 0.5) lit[idx(x, y)] = 1;
      }
  }
  // Lantern-ways are lit if adjacent to a lit tile/building chain: treat as conductors, run in BFS below.

  // 4. building adjacency spread (buildings touching lit buildings/tiles are lit).
  const litB: boolean[] = new Array(state.buildings.length).fill(false);
  const bq: number[] = [];
  const conductors = new Uint8Array(n); // road tiles that conduct (lantern-way)
  // lantern-ways conduct; a living glowvine lane is lit already and lights what stands along it
  for (let i = 0; i < n; i++) if (state.road[i] === RoadType.Lantern || (state.road[i] === RoadType.Glowvine && lit[i])) conductors[i] = 1;
  for (let s = 0; s < state.buildings.length; s++) {
    const b = state.buildings[s];
    if (!b || b.state === 'ruin') continue;
    let touches = false;
    for (let dy = 0; dy < b.h && !touches; dy++)
      for (let dx = 0; dx < b.w; dx++)
        if (lit[idx(b.x + dx, b.y + dy)]) {
          touches = true;
          break;
        }
    if (touches) {
      litB[s] = true;
      bq.push(s);
    }
  }
  const roadLit = new Uint8Array(n);
  const rq: number[] = [];
  for (let i = 0; i < n; i++) if (conductors[i] && lit[i]) {
    roadLit[i] = 1;
    rq.push(i);
  }
  const tryLightBuildingAt = (x: number, y: number) => {
    if (!inBounds(x, y)) return;
    const s = state.bIndex[idx(x, y)];
    if (s >= 0 && !litB[s]) {
      const b = state.buildings[s];
      if (b && b.state !== 'ruin' && b.state !== 'building') {
        litB[s] = true;
        bq.push(s);
      }
    }
  };
  const tryLightRoadAt = (x: number, y: number) => {
    if (!inBounds(x, y)) return;
    const i = idx(x, y);
    if (conductors[i] && !roadLit[i]) {
      roadLit[i] = 1;
      rq.push(i);
    }
  };
  while (bq.length || rq.length) {
    if (bq.length) {
      const s = bq.pop()!;
      const b = state.buildings[s]!;
      for (let dy = -1; dy <= b.h; dy++)
        for (let dx = -1; dx <= b.w; dx++) {
          if ((dx === -1 || dx === b.w) && (dy === -1 || dy === b.h)) continue;
          if (dx >= 0 && dx < b.w && dy >= 0 && dy < b.h) continue;
          tryLightBuildingAt(b.x + dx, b.y + dy);
          tryLightRoadAt(b.x + dx, b.y + dy);
        }
    } else {
      const i = rq.pop()!;
      const x = i % MAP_W;
      const y = (i / MAP_W) | 0;
      tryLightRoadAt(x - 1, y);
      tryLightRoadAt(x + 1, y);
      tryLightRoadAt(x, y - 1);
      tryLightRoadAt(x, y + 1);
      tryLightBuildingAt(x - 1, y);
      tryLightBuildingAt(x + 1, y);
      tryLightBuildingAt(x, y - 1);
      tryLightBuildingAt(x, y + 1);
    }
  }
  // (lit road tiles are marked after the shortfall decides whether the lantern-ways dim)

  // 5. demand & brownout
  let consumers: Consumer[] = [];
  let demand = 0;
  const hush = seasonOf(state) === 3;
  const mult = manaMult(state);
  const f = state.founding;
  for (let s = 0; s < state.buildings.length; s++) {
    const b = state.buildings[s];
    if (!b) continue;
    if (!litB[s]) {
      b.lit = false;
      continue;
    }
    const use = manaUseOf(b, hush) * mult;
    if (use > 0) {
      demand += use;
      let dmin = Infinity;
      for (const nd of state.nodes) dmin = Math.min(dmin, Math.hypot(b.x - nd.x, b.y - nd.y));
      consumers.push({ s, use, d: dmin, wasLit: b.lit, prio: priorityOf(b) });
    }
    b.lit = true;
  }
  // 5a. spire load: every consumer draws through its nearest lit member or node; a member over its cap sheds its farthest first
  if (members.length) {
    for (const c of consumers) {
      const b = state.buildings[c.s]!;
      const bx = b.x + (b.w - 1) / 2;
      const by = b.y + (b.h - 1) / 2;
      let best: MemberLoad | null = null;
      let bd = Infinity;
      for (const nd of state.nodes) { const d = Math.hypot(bx - nd.x, by - nd.y); if (d < bd) { bd = d; best = null; } }
      for (const m of members) { const d = Math.hypot(bx - m.x, by - m.y); if (d < bd) { bd = d; best = m; } }
      if (best) { best.load += c.use; best.list.push({ c, d: bd }); }
    }
    const shed = new Set<number>();
    for (const m of members) {
      m.b.load = m.load;
      if (m.load <= m.cap) continue;
      m.list.sort((p, q) => Number(p.c.wasLit) - Number(q.c.wasLit) || q.d - p.d); // already dark first, then the farthest
      let over = m.load - m.cap;
      for (const e of m.list) {
        if (over <= 0) break;
        state.buildings[e.c.s]!.lit = false;
        shed.add(e.c.s);
        over -= e.c.use;
        demand -= e.c.use;
      }
    }
    if (shed.size) consumers = consumers.filter((c) => !shed.has(c.s));
  }
  let roadDemand = 0;
  for (let i = 0; i < n; i++) if (roadLit[i] && state.road[i] === RoadType.Lantern) roadDemand += ROAD_BY_TYPE[RoadType.Lantern].manaUse;
  demand += foundryMana(state);
  demand += floatingMana(state);
  forEachBuilding(state, (b) => { if (b.kind === 'portalarch' && b.lit && b.state === 'ok') demand += PORTAL_MANA * (b.load ?? 0); }); // each crossing today draws a tenth
  for (let i = 0; i < n; i++) if (state.wall[i]) demand += WALL_MANA;
  // lantern-ways are the first thing a shortfall dims: their draw leaves the demand and they go dark (with hysteresis, so they do not flicker)
  if (!state.roadsDim && demand + roadDemand > supply) state.roadsDim = true;
  else if (state.roadsDim && demand + roadDemand <= supply) state.roadsDim = false;
  if (!state.roadsDim) demand += roadDemand;
  for (let i = 0; i < n; i++) {
    if (roadLit[i] && (!state.roadsDim || state.road[i] !== RoadType.Lantern)) lit[i] = 1;
    else if (state.roadsDim && state.road[i] === RoadType.Lantern) lit[i] = 0; // dimmed even where a spire's own light falls on it
  }
  void f;

  if (relicDone(state, 'lanterncores')) storageMax += 60;
  storageMax *= 1 + 0.2 * guildEffect(state, 'spirewrights');
  // storage buffers a deficit
  let effectiveSupply = supply;
  if (demand > supply) {
    const deficit = demand - supply;
    const take = Math.min(state.manaStorage, deficit / 18); // per update slice (18 updates a day)
    state.manaStorage -= take;
    effectiveSupply += take * 18;
  } else {
    state.manaStorage = Math.min(storageMax, state.manaStorage + (supply - demand) / 18);
  }
  state.manaStorageMax = storageMax;
  let brownout = 0;
  if (demand > effectiveSupply && consumers.length) {
    // buildings already dark stay dark (no boundary blinking); then the dim tier before the normal before the essential; the farthest from the nodes first within a tier
    consumers.sort((a, b) => Number(a.wasLit) - Number(b.wasLit) || b.prio - a.prio || b.d - a.d);
    let over = demand - effectiveSupply;
    let dark = 0;
    for (const c of consumers) {
      if (over <= 0) break;
      const b = state.buildings[c.s]!;
      b.lit = false;
      over -= c.use;
      dark += c.use;
    }
    brownout = dark / Math.max(1, demand);
  }
  state.manaSupply = supply;
  state.manaDemand = demand;
  state.brownout = brownout;
  for (let s = 0; s < state.buildings.length; s++) {
    const b = state.buildings[s];
    if (b && !litB[s]) b.lit = false;
  }
  // lit tiles for overlay: also mark building tiles as lit if building lit
  forEachBuilding(state, (b) => {
    if (!b.lit) return;
    for (let dy = 0; dy < b.h; dy++) for (let dx = 0; dx < b.w; dx++) lit[idx(b.x + dx, b.y + dy)] = 1;
  });
  // dirty chunks where lit changed (for lantern-way glow rendering)
  for (let i = 0; i < n; i++) {
    if (lit[i] !== oldLit[i] && (state.road[i] === RoadType.Lantern || state.road[i] === RoadType.Glowvine)) markDirty(state, i % MAP_W, (i / MAP_W) | 0);
    if (lit[i] !== oldLit[i] && state.bIndex[i] >= 0 && state.buildings[state.bIndex[i]]?.kind === 'portalarch') bumpRoadVersion();
  }
  state.lit = lit;
}

/** How many zone levels a water building serves; the farthest homes beyond that are dry. */
export const WATER_CAP: Record<string, number> = { well: 30, seep: 20, tidewell: 45, cistern: 90, stake: 20 };
export function waterCapOf(b: Building): number {
  return WATER_CAP[b.kind] ?? 30;
}
interface WaterSource { b: Building; cx: number; cy: number; r: number; cap: number; load: number; list: { t: Building; d: number }[] }

export function updateWater(state: GameState): void {
  const n = MAP_W * MAP_H;
  const watered = new Uint8Array(n);
  let supply = 0;
  const srcs: WaterSource[] = [];
  forEachBuilding(state, (b) => {
    const def = BUILDING_BY_KEY[b.kind];
    if (!def.waterRadius || b.state !== 'ok') return;
    if (def.needsMana && !b.lit) { b.load = undefined; return; }
    let r = waterRadiusOf(state, b);
    if (r > 0 && def.waterNearBonus && state.waterDist[idx(b.x, b.y)] <= 3) r += def.waterNearBonus;
    b.load = 0;
    if (r <= 0) return; // fouled
    supply += r * r;
    const cx = b.x + (b.w - 1) / 2;
    const cy = b.y + (b.h - 1) / 2;
    srcs.push({ b, cx, cy, r, cap: waterCapOf(b), load: 0, list: [] });
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = Math.round(cx + dx);
        const y = Math.round(cy + dy);
        if (!inBounds(x, y)) continue;
        if (dx * dx + dy * dy <= r * r + 0.5) watered[idx(x, y)] = 1;
      }
  });
  // every zone building in reach draws its level from its nearest well; a well serves the nearest first up to its cap
  let demand = 0;
  const drawers: { t: Building; cx: number; cy: number }[] = [];
  forEachBuilding(state, (b) => {
    b.dryBy = undefined;
    let w = false;
    for (let dy = 0; dy < b.h && !w; dy++)
      for (let dx = 0; dx < b.w; dx++)
        if (watered[idx(b.x + dx, b.y + dy)]) {
          w = true;
          break;
        }
    b.watered = w;
    const def = BUILDING_BY_KEY[b.kind];
    if (def.category === 'zone') {
      demand += b.level;
      if (w) drawers.push({ t: b, cx: b.x + (b.w - 1) / 2, cy: b.y + (b.h - 1) / 2 });
    }
  });
  if (srcs.length) {
    const covering = (d: { cx: number; cy: number }) => srcs.filter((s) => Math.hypot(s.cx - d.cx, s.cy - d.cy) <= s.r + 0.7).sort((p, q) => Math.hypot(p.cx - d.cx, p.cy - d.cy) - Math.hypot(q.cx - d.cx, q.cy - d.cy));
    const left: { t: Building; cx: number; cy: number }[] = [];
    for (const d of drawers) {
      const c = covering(d)[0];
      if (c) c.list.push({ t: d.t, d: Math.hypot(c.cx - d.cx, c.cy - d.cy) });
    }
    for (const src of srcs) {
      src.list.sort((p, q) => p.d - q.d);
      for (const e of src.list) {
        if (src.load + e.t.level > src.cap) { left.push({ t: e.t, cx: e.t.x + (e.t.w - 1) / 2, cy: e.t.y + (e.t.h - 1) / 2 }); continue; }
        src.load += e.t.level;
      }
      src.b.load = src.list.reduce((v, e) => v + e.t.level, 0); // the full draw on it, for the panel
    }
    // a home its nearest well cannot serve may draw from another well in reach with room
    for (const d of left) {
      const other = covering(d).find((s) => s.load + d.t.level <= s.cap);
      if (other) other.load += d.t.level;
      else { d.t.watered = false; d.t.dryBy = 'overdrawn'; }
    }
  }
  state.watered = watered;
  state.waterSupply = supply;
  state.waterDemand = demand;
}

export function roadManaUse(state: GameState): number {
  let m = 0;
  for (let i = 0; i < state.road.length; i++) if (state.road[i] === RoadType.Lantern && state.lit[i]) m += ROADS[2].manaUse;
  return m;
}
