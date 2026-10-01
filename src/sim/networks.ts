import { isCradle } from './wyrmcraft';
/** Great halls that relay the ley like a Nexus: the Lantern of Vell and the Underking's Seat. */
export const LEY_HALLS = WONDER_HALLS;
/** Mana (ley) and water networks. */
import { BUILDING_BY_KEY, NODE_MANA, ROAD_BY_TYPE, ROADS, WALL_MANA, WONDER_HALLS } from './catalog';
import { MAP_H, MAP_W, RoadType, idx, inBounds, type Building, type GameState , Terrain } from './types';
import { forEachBuilding, markDirty, nodeMana, seasonOf, waterRadiusOf } from './world';
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

  // 1. supply
  let supply = (state.nodes.length * NODE_MANA + nodeMana(state)) * factionOf(state).rules.nodeMana;
  let storageMax = 0;
  forEachBuilding(state, (b) => {
    const def = BUILDING_BY_KEY[b.kind];
    if (b.state !== 'ok') return;
    if (def.manaProduce) supply += def.manaProduce * (b.kind === 'torrentmill' ? millFactor(state) * (aspectAt(state, b.x, b.y) === 'tide' ? 1.5 : 1) * factionOf(state).rules.millMana : 1) * (state.terrain[idx(b.x, b.y)] === Terrain.Hills ? factionOf(state).rules.hillMana : 1);
    if (def.manaStorage && (def.category !== 'special' || hallActive(state, b.kind))) storageMax += def.manaStorage * (aspectAt(state, b.x, b.y) === 'vein' ? 1.5 : 1);
  });

  // 2. spire chain: BFS from nodes over spires/nexus
  const spires: Building[] = [];
  forEachBuilding(state, (b) => {
    if ((b.kind === 'spire' || b.kind === 'nexus' || LEY_HALLS.includes(b.kind) || b.kind === 'stake') && b.state !== 'ruin' && b.state !== 'building') spires.push(b);
  });
  const spireLit = new Array(spires.length).fill(false);
  const sources: { x: number; y: number; r: number }[] = state.nodes.map((nd) => ({ x: nd.x, y: nd.y, r: NODE_RADIUS }));
  const queue: { x: number; y: number }[] = state.nodes.map((nd) => ({ x: nd.x, y: nd.y }));
  const linkOf = (b: Building) => (b.kind === 'nexus' || LEY_HALLS.includes(b.kind) ? SPIRE_LINK + 3 : b.kind === 'stake' ? 4 : SPIRE_LINK);
  const radiusOf = (b: Building) => (b.kind === 'nexus' || LEY_HALLS.includes(b.kind) ? NEXUS_RADIUS : b.kind === 'stake' ? 4 : SPIRE_RADIUS);
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
        queue.push({ x: cx, y: cy });
        sources.push({ x: cx, y: cy, r: radiusOf(s) });
      }
    }
  }
  for (let k = 0; k < spires.length; k++) if (!spireLit[k]) spires[k].lit = false;

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
      gardens.push({ x: b.x + (b.w - 1) / 2, y: b.y + (b.h - 1) / 2 });
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
  for (let i = 0; i < n; i++) if (state.road[i] === RoadType.Lantern) conductors[i] = 1;
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
  for (let i = 0; i < n; i++) if (roadLit[i]) lit[i] = 1;

  // 5. demand & brownout
  const consumers: { s: number; use: number; d: number; wasLit: boolean }[] = [];
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
      consumers.push({ s, use, d: dmin, wasLit: b.lit });
    }
    b.lit = true;
  }
  let roadDemand = 0;
  for (let i = 0; i < n; i++) if (roadLit[i]) roadDemand += ROAD_BY_TYPE[RoadType.Lantern].manaUse;
  demand += roadDemand;
  demand += foundryMana(state);
  demand += floatingMana(state);
  for (let i = 0; i < n; i++) if (state.wall[i]) demand += WALL_MANA;
  void f;

  if (relicDone(state, 'lanterncores')) storageMax += 60;
  storageMax *= 1 + 0.2 * guildEffect(state, 'spirewrights');
  // storage buffers a deficit
  let effectiveSupply = supply;
  if (demand > supply) {
    const deficit = demand - supply;
    const take = Math.min(state.manaStorage, deficit * 0.1); // per update slice (10 per day)
    state.manaStorage -= take;
    effectiveSupply += take * 10;
  } else {
    state.manaStorage = Math.min(storageMax, state.manaStorage + (supply - demand) * 0.1);
  }
  state.manaStorageMax = storageMax;
  let brownout = 0;
  if (demand > effectiveSupply && consumers.length) {
    // buildings already dark stay dark (no boundary blinking); then the farthest from the nodes go first
    consumers.sort((a, b) => Number(a.wasLit) - Number(b.wasLit) || b.d - a.d);
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

export function updateWater(state: GameState): void {
  const n = MAP_W * MAP_H;
  const watered = new Uint8Array(n);
  let supply = 0;
  forEachBuilding(state, (b) => {
    const def = BUILDING_BY_KEY[b.kind];
    if (!def.waterRadius || b.state !== 'ok') return;
    if (def.needsMana && !b.lit) return;
    let r = waterRadiusOf(state, b);
    if (def.waterNearBonus) {
      const cx = b.x;
      const cy = b.y;
      if (state.waterDist[idx(cx, cy)] <= 3) r += def.waterNearBonus;
    }
    supply += r * r;
    const cx = b.x + (b.w - 1) / 2;
    const cy = b.y + (b.h - 1) / 2;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = Math.round(cx + dx);
        const y = Math.round(cy + dy);
        if (!inBounds(x, y)) continue;
        if (dx * dx + dy * dy <= r * r + 0.5) watered[idx(x, y)] = 1;
      }
  });
  let demand = 0;
  forEachBuilding(state, (b) => {
    let w = false;
    for (let dy = 0; dy < b.h && !w; dy++)
      for (let dx = 0; dx < b.w; dx++)
        if (watered[idx(b.x + dx, b.y + dy)]) {
          w = true;
          break;
        }
    b.watered = w;
    const def = BUILDING_BY_KEY[b.kind];
    if (def.category === 'zone') demand += b.level;
  });
  state.watered = watered;
  state.waterSupply = supply;
  state.waterDemand = demand;
}

export function roadManaUse(state: GameState): number {
  let m = 0;
  for (let i = 0; i < state.road.length; i++) if (state.road[i] === RoadType.Lantern && state.lit[i]) m += ROADS[2].manaUse;
  return m;
}
