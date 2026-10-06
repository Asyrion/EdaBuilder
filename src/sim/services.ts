/** Service coverage, miasma, land value. */
import { BUILDING_BY_KEY, ROAD_BY_TYPE } from './catalog';
import { LAKE_LAND, LAKE_LAND_REACH, lakeDistAt } from './water';
import { roadAt } from './roads';
import { edictOn } from './edicts';
import { quarterAt, quarterOf } from './districts';
import { MAP_H, MAP_W, SERVICE_TYPES, Terrain, cracked, idx, inBounds, isWater, type Building, type GameState, type ServiceType } from './types';
import { forEachBuilding } from './world';
import { wardenDistricts } from './wyrmcraft';
import { modifierSum } from './edicts';
import { WYRM_LAIR_RADIUS, wyrmGuards, wyrmNode } from './wyrm';
import { TREE_LEISURE_RADIUS, TREE_WARD_RADIUS, capacityOf, treeStage, worldTree } from './growth';
import { belregiReach, greatGateReach, GREAT_GATE_SOLD_STRENGTH } from './gate';

/** Land value lost within 4 tiles of any deathcare. */
export const DEATHCARE_LV = 6;
import { GOLEM_GUARD_RADIUS, GOLEM_GUARD_STRENGTH, guardGolems, mewsActive } from './beasts';
import { hallActive } from './guilds';
import { factionOf } from '../data/factions';
import { dragonAuras, nodesOfAspect, floodedAt, raining } from './weave';
import { CHARTER_SMOKE_SPILL } from './districts';

/** A service with a crew radiates by how many of its hands are filled (never below 0.3); one without a crew radiates in full. */
export function crewFactor(b: Building, state: GameState): number {
  const def = BUILDING_BY_KEY[b.kind];
  if (!def.capacity || !def.service) return 1;
  const cap = capacityOf(b, state);
  return cap > 0 ? Math.max(0.3, Math.min(1, b.workers / cap)) : 1;
}

export function updateCoverage(state: GameState, type: ServiceType): void {
  const n = MAP_W * MAP_H;
  const acc = new Float32Array(n);
  forEachBuilding(state, (b) => {
    const def = BUILDING_BY_KEY[b.kind];
    if (!def.service || def.service.type !== type) return;
    if (b.state !== 'ok') return;
    if (def.category === 'special' && b.kind !== 'stake' && !hallActive(state, b.kind)) return;
    let strength = def.service.strength * crewFactor(b, state);
    if (b.kind === 'wardlantern') strength *= factionOf(state).rules.lanternWard;
    if (b.kind === 'scaleward') strength *= b.plate ?? 1;
    if (cracked(b)) strength = 0; // the Lantern of the Cores wards nothing while cracked
    if (b.kind === 'hospice' && b.stock <= 0) strength *= 0.6; // no draughts on the shelf
    if (b.kind === 'veshari' && !b.watered) strength *= 0.5; // a dry fire hall
    if (b.kind === 'greatgate' && state.heart.held === 'sold') strength *= GREAT_GATE_SOLD_STRENGTH; // the Guardians closed the Pass (iteration 69)
    if (def.needsMana && !b.lit) strength *= type === 'ward' ? 0 : 0.5;
    else if (!b.lit && def.manaUse > 0) strength *= 0.75;
    if (strength <= 0) return;
    const consecrated = (b.kind === 'shrine' || b.kind === 'candleshrine') && (b.blessed ?? -1) >= state.day;
    const r = b.kind === 'greatgate' ? greatGateReach(state) : b.kind === 'worldtree' ? TREE_LEISURE_RADIUS[treeStage(b)] : b.kind === 'watchhouse' && type === 'watch' && mewsActive(state) ? def.service.radius * 2 : consecrated ? Math.round(def.service.radius * 1.5) : def.service.radius;
    const cx = b.x + (b.w - 1) / 2;
    const cy = b.y + (b.h - 1) / 2;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = Math.round(cx + dx);
        const y = Math.round(cy + dy);
        if (!inBounds(x, y)) continue;
        const d = Math.hypot(x - cx, y - cy);
        if (d > r) continue;
        const v = strength * (1 - (d / r) * 0.6);
        acc[idx(x, y)] += v;
      }
  });
  // gates of the Pass of Buluiain: Belregi (faith, ward) and Uzulim (ward, watch)
  if (type === 'faith' || type === 'ward' || type === 'watch') {
    const belregi = belregiReach(state); // 8, 12 beside a lit Great Gate, 16 with the Heart set in it (iteration 69)
    for (let i = 0; i < n; i++) {
      const g = state.wall[i];
      if (g < 2) continue;
      const gx = i % MAP_W;
      const gy = (i / MAP_W) | 0;
      const r = g === 2 ? belregi : 10;
      const str = g === 2 ? (type === 'faith' ? 0.3 : type === 'ward' ? 0.2 : 0) : type === 'ward' ? 0.4 : type === 'watch' ? 0.3 : 0;
      if (str <= 0) continue;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const x = gx + dx;
          const y = gy + dy;
          if (!inBounds(x, y)) continue;
          const d = Math.hypot(dx, dy);
          if (d > r) continue;
          acc[idx(x, y)] += str * (1 - (d / r) * 0.6) * (type === 'ward' ? factionOf(state).rules.wallWard : 1);
        }
    }
  }
  // dragon auras and ley aspects
  for (const au of dragonAuras(state)) {
    const str = (type === 'ward' && au.line === 'grey') || (type === 'fire' && au.line === 'tide') || (type === 'death' && au.line === 'bone') ? 0.5 : 0;
    if (!str) continue;
    const r = au.r;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = Math.round(au.x + dx);
        const y = Math.round(au.y + dy);
        if (!inBounds(x, y) || dx * dx + dy * dy > r * r) continue;
        acc[idx(x, y)] += str * (1 - Math.hypot(dx, dy) / r * 0.6);
      }
  }
  // Concord Wardens on guard hold the grey six tiles around their post (iteration 53)
  if (type === 'ward') for (const g of guardGolems(state)) {
    const r = GOLEM_GUARD_RADIUS;
    const gx = g.ax ?? g.x;
    const gy = g.ay ?? g.y;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = Math.round(gx + dx);
        const y = Math.round(gy + dy);
        if (!inBounds(x, y) || dx * dx + dy * dy > r * r) continue;
        acc[idx(x, y)] += GOLEM_GUARD_STRENGTH * (1 - (Math.hypot(dx, dy) / r) * 0.6);
      }
  }
  if (type === 'ward') for (const g of nodesOfAspect(state, 'grey')) {
    const r = 10;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = g.x + dx;
        const y = g.y + dy;
        if (!inBounds(x, y) || dx * dx + dy * dy > r * r) continue;
        acc[idx(x, y)] += 0.35;
      }
  }
  if (type === 'ward') {
    // the World Tree's roots hold the Gloam under its shade (no burning, just holding)
    const tree = worldTree(state);
    if (tree) {
      const r = TREE_WARD_RADIUS[treeStage(tree)];
      const cx = tree.x + 1;
      const cy = tree.y + 1;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (!inBounds(x, y) || dx * dx + dy * dy > r * r) continue;
          acc[idx(x, y)] += 0.6;
        }
    }
  }
  if (type === 'ward' && wyrmGuards(state)) {
    const wn = wyrmNode(state)!;
    const r = WYRM_LAIR_RADIUS;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = wn.x + dx;
        const y = wn.y + dy;
        if (!inBounds(x, y)) continue;
        const d = Math.hypot(dx, dy);
        if (d > r) continue;
        acc[idx(x, y)] += (1 - (d / r) * 0.6) * (edictOn(state, 'wyrmpeace') ? 0.5 : 1);
      }
  }
  if (type === 'watch' && modifierSum(state, 'watch') > 0) for (let i = 0; i < n; i++) acc[i] += modifierSum(state, 'watch');
  if (type === 'watch' || type === 'fire') {
    const wd = wardenDistricts(state);
    if (wd.size) for (let i = 0; i < n; i++) if (state.district[i] && wd.has(state.district[i])) acc[i] += 0.5;
  }
  const wb = state.walkerBonus?.[type];
  if (wb) for (let i = 0; i < n; i++) acc[i] += wb[i];
  // the quarters: a temple quarter's faith counts half again, a scholars' quarter's schooling a quarter more
  if (type === 'faith' || type === 'school') for (let i = 0; i < n; i++) { const q = state.district[i] ? state.districtQuarters[state.district[i]] : undefined; if (type === 'faith' && q === 'temple') acc[i] *= 1.5; else if (type === 'school' && q === 'scholars') acc[i] *= 1.25; }
  const out = state.coverage[type];
  for (let i = 0; i < n; i++) out[i] = Math.min(255, Math.round(Math.min(1, acc[i]) * 255));
}

export function updateAllCoverage(state: GameState): void {
  for (const s of SERVICE_TYPES) updateCoverage(state, s);
}

export function coverageAt(state: GameState, type: ServiceType, x: number, y: number): number {
  return state.coverage[type][idx(x, y)] / 255;
}

/** The marsh's miasma (iteration 85): per marsh tile, at its centre, fading to nothing past MARSH_MIASMA_REACH tiles. */
export const MARSH_MIASMA = 0.4;
export const MARSH_MIASMA_REACH = 2;

export function updateMiasma(state: GameState): void {
  const n = MAP_W * MAP_H;
  const acc = new Float32Array(n);
  forEachBuilding(state, (b) => {
    const def = BUILDING_BY_KEY[b.kind];
    const flare = b.kind === 'font' && (b.flare ?? 0) > 0 ? 6 : 0; // a flared Font smokes
    if ((!def.miasma && !flare) || (b.state !== 'ok' && b.state !== 'burning')) return;
    const craftQuarter = quarterOf(state, b) === 'craft';
    const amt = (def.miasma ? def.miasma * b.level * (edictOn(state, 'herbgardens', b) ? 1.3 : 1) * (craftQuarter ? 1.3 : 1) : 0) + flare;
    const r = 4;
    // a Craft quarter's smoke spills: past its district's edge it carries CHARTER_SMOKE_SPILL tiles further, so a works-only district pays its neighbours (iteration 54)
    const spill = craftQuarter ? CHARTER_SMOKE_SPILL : 0;
    const home = state.district[idx(b.x, b.y)];
    for (let dy = -r - spill; dy <= r + spill; dy++)
      for (let dx = -r - spill; dx <= r + spill; dx++) {
        const x = b.x + dx;
        const y = b.y + dy;
        if (!inBounds(x, y)) continue;
        const d = Math.abs(dx) + Math.abs(dy);
        if (d <= r) { acc[idx(x, y)] += amt * (1 - d / (r + 1)); continue; }
        if (d > r + spill || state.district[idx(x, y)] === home) continue;
        acc[idx(x, y)] += amt * (1 - r / (r + 1)) * (1 - (d - r) / (spill + 1));
      }
  });
  // the marsh breeds miasma (iteration 85): every marsh tile a small cloud within MARSH_MIASMA_REACH
  for (let i = 0; i < n; i++) {
    if (state.terrain[i] !== Terrain.Marsh) continue;
    const mx = i % MAP_W; const my = (i / MAP_W) | 0;
    for (let dy = -MARSH_MIASMA_REACH; dy <= MARSH_MIASMA_REACH; dy++) for (let dx = -MARSH_MIASMA_REACH; dx <= MARSH_MIASMA_REACH; dx++) {
      const d = Math.abs(dx) + Math.abs(dy);
      if (d > MARSH_MIASMA_REACH || !inBounds(mx + dx, my + dy)) continue;
      acc[idx(mx + dx, my + dy)] += MARSH_MIASMA * (1 - d / (MARSH_MIASMA_REACH + 1));
    }
  }
  const rain = raining(state) ? 0.3 : 1;
  if (hallActive(state, 'lyceum')) forEachBuilding(state, (b) => {
    if (b.kind !== 'lyceum' || b.state !== 'ok') return;
    for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) { const x = b.x + 1 + dx; const y = b.y + 1 + dy; if (inBounds(x, y)) acc[idx(x, y)] *= 0.67; }
  });
  for (let i = 0; i < n; i++) state.miasma[i] = Math.min(255, Math.round(acc[i] * 12 * rain));
}

/** The flat land-value bonus of every building (and the −6 of deathcare), summed per tile. */
export function landBonusMap(state: GameState): Float32Array {
  const n = MAP_W * MAP_H;
  const bonus = new Float32Array(n);
  forEachBuilding(state, (b) => {
    const def = BUILDING_BY_KEY[b.kind];
    if (def.service?.type === 'death' && b.state === 'ok') {
      // nobody wants to live beside the dead: −6 within 4 of deathcare
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const x = b.x + dx; const y = b.y + dy; if (inBounds(x, y) && Math.hypot(dx, dy) <= 4) bonus[idx(x, y)] -= DEATHCARE_LV; }
    }
    if (!def.landValue || b.state !== 'ok') return;
    const r = def.service ? def.service.radius : 6;
    const cx = b.x + (b.w - 1) / 2;
    const cy = b.y + (b.h - 1) / 2;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = Math.round(cx + dx);
        const y = Math.round(cy + dy);
        if (!inBounds(x, y)) continue;
        const d = Math.hypot(x - cx, y - cy);
        if (d > r) continue;
        bonus[idx(x, y)] += def.landValue * (1 - d / (r + 1));
      }
  });
  return bonus;
}

/** The terms of a tile's land value, in the order they are summed (the stored value is their rounded, clamped sum). */
export function landValueTerms(state: GameState, i: number, bonus: Float32Array): { label: string; v: number }[] {
  const fr = factionOf(state).rules;
  const n = MAP_W * MAP_H;
  const cov = state.coverage;
  const t: { label: string; v: number }[] = [{ label: 'base', v: 18 }];
  const add = (label: string, v: number) => { if (v !== 0) t.push({ label, v }); };
  // nearest road tier (4-neighbourhood + self)
  let road = 0;
  for (const j of [i, i - 1, i + 1, i - MAP_W, i + MAP_W]) {
    if (j < 0 || j >= n) continue;
    const rj = roadAt(state, j); // an unlit lantern-way is cobble
    if (rj > road) road = rj;
  }
  if (road) add('the road', ROAD_BY_TYPE[road].landValue + 4);
  const wd = state.waterDist[i];
  if (wd <= 5) add('water near', (5 - wd) * 2.5 * fr.waterLandValue);
  else if (wd > 8) add('dry land', -fr.dryPenalty);
  if (wd <= 1 && floodedAt(state, i % MAP_W, (i / MAP_W) | 0)) add('the flood', -10);
  if (lakeDistAt(state, i % MAP_W, (i / MAP_W) | 0) <= LAKE_LAND_REACH && !isWater(state.terrain[i])) add('by the lake', LAKE_LAND); // the lake's own (iteration 60)
  const q = quarterAt(state, i);
  if (q === 'hearth') add('Hearth quarter', 6); else if (q === 'market') add('Market quarter', -4);
  add('leisure', (cov.leisure[i] / 255) * 16);
  add('faith', (cov.faith[i] / 255) * 10);
  add('watch', (cov.watch[i] / 255) * 6);
  add('health', (cov.health[i] / 255) * 6);
  add('schooling', (cov.school[i] / 255) * 6);
  add(bonus[i] < 0 ? 'deathcare near' : 'fine buildings near', bonus[i]);
  if (state.lit[i]) add('lit', 6);
  if (state.watered[i]) add('watered', 6);
  add('miasma', -(state.miasma[i] / 255) * 40);
  const gd = state.gloamDist[i];
  if (gd < 8) add('the Gloam near', -(8 - gd) * 4);
  add('traffic', -(state.trafficSmooth[i] / 255) * 12);
  if (state.terrain[i] === Terrain.Forest) add('the forest', 3);
  if (state.terrain[i] === Terrain.Hills) add('the hills', fr.hillLandValue); else add('flat grass', -fr.grassPenalty);
  return t;
}

export function updateLandValue(state: GameState): void {
  const n = MAP_W * MAP_H;
  const lv = state.landValue;
  const bonus = landBonusMap(state);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (const x of landValueTerms(state, i, bonus)) v += x.v;
    lv[i] = Math.max(0, Math.min(100, Math.round(v)));
  }
}
