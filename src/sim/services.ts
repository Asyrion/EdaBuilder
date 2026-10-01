/** Service coverage, miasma, land value. */
import { BUILDING_BY_KEY, ROAD_BY_TYPE } from './catalog';
import { edictOn } from './edicts';
import { MAP_H, MAP_W, SERVICE_TYPES, Terrain, idx, inBounds, type GameState, type ServiceType } from './types';
import { forEachBuilding } from './world';
import { wardenDistricts } from './wyrmcraft';
import { modifierSum } from './edicts';
import { WYRM_LAIR_RADIUS, wyrmGuards, wyrmNode } from './wyrm';
import { TREE_LEISURE_RADIUS, TREE_WARD_RADIUS, treeStage, worldTree } from './growth';
import { mewsActive } from './beasts';
import { dragonAuras, nodesOfAspect } from './weave';

export function updateCoverage(state: GameState, type: ServiceType): void {
  const n = MAP_W * MAP_H;
  const acc = new Float32Array(n);
  forEachBuilding(state, (b) => {
    const def = BUILDING_BY_KEY[b.kind];
    if (!def.service || def.service.type !== type) return;
    if (b.state !== 'ok') return;
    let strength = def.service.strength;
    if (def.needsMana && !b.lit) strength *= type === 'ward' ? 0 : 0.5;
    else if (!b.lit && def.manaUse > 0) strength *= 0.75;
    if (strength <= 0) return;
    const r = b.kind === 'worldtree' ? TREE_LEISURE_RADIUS[treeStage(b)] : b.kind === 'watchhouse' && type === 'watch' && mewsActive(state) ? def.service.radius * 2 : def.service.radius;
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
    for (let i = 0; i < n; i++) {
      const g = state.wall[i];
      if (g < 2) continue;
      const gx = i % MAP_W;
      const gy = (i / MAP_W) | 0;
      const r = g === 2 ? 8 : 10;
      const str = g === 2 ? (type === 'faith' ? 0.3 : type === 'ward' ? 0.2 : 0) : type === 'ward' ? 0.4 : type === 'watch' ? 0.3 : 0;
      if (str <= 0) continue;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const x = gx + dx;
          const y = gy + dy;
          if (!inBounds(x, y)) continue;
          const d = Math.hypot(dx, dy);
          if (d > r) continue;
          acc[idx(x, y)] += str * (1 - (d / r) * 0.6);
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
  const out = state.coverage[type];
  for (let i = 0; i < n; i++) out[i] = Math.min(255, Math.round(Math.min(1, acc[i]) * 255));
}

export function updateAllCoverage(state: GameState): void {
  for (const s of SERVICE_TYPES) updateCoverage(state, s);
}

export function coverageAt(state: GameState, type: ServiceType, x: number, y: number): number {
  return state.coverage[type][idx(x, y)] / 255;
}

export function updateMiasma(state: GameState): void {
  const n = MAP_W * MAP_H;
  const acc = new Float32Array(n);
  forEachBuilding(state, (b) => {
    const def = BUILDING_BY_KEY[b.kind];
    if (!def.miasma || b.state !== 'ok') return;
    const amt = def.miasma * b.level * (edictOn(state, 'herbgardens', b) ? 1.3 : 1);
    const r = 4;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = b.x + dx;
        const y = b.y + dy;
        if (!inBounds(x, y)) continue;
        const d = Math.abs(dx) + Math.abs(dy);
        if (d > r) continue;
        acc[idx(x, y)] += amt * (1 - d / (r + 1));
      }
  });
  const rain = modifierSum(state, 'rain') > 0 ? 0.3 : 1;
  for (let i = 0; i < n; i++) state.miasma[i] = Math.min(255, Math.round(acc[i] * 12 * rain));
}

export function updateLandValue(state: GameState): void {
  const n = MAP_W * MAP_H;
  const lv = state.landValue;
  const cov = state.coverage;
  // landValue bonuses from buildings with flat bonus
  const bonus = new Float32Array(n);
  forEachBuilding(state, (b) => {
    const def = BUILDING_BY_KEY[b.kind];
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
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const i = idx(x, y);
      let v = 18;
      // nearest road tier (4-neighbourhood + self)
      let road = 0;
      for (const j of [i, i - 1, i + 1, i - MAP_W, i + MAP_W]) {
        if (j < 0 || j >= n) continue;
        if (state.road[j] > road) road = state.road[j];
      }
      if (road) v += ROAD_BY_TYPE[road].landValue + 4;
      const wd = state.waterDist[i];
      if (wd <= 5) v += (5 - wd) * 2.5;
      v += (cov.leisure[i] / 255) * 16;
      v += (cov.faith[i] / 255) * 10;
      v += (cov.watch[i] / 255) * 6;
      v += (cov.health[i] / 255) * 6;
      v += (cov.school[i] / 255) * 6;
      v += bonus[i];
      if (state.lit[i]) v += 6;
      if (state.watered[i]) v += 6;
      v -= (state.miasma[i] / 255) * 40;
      const gd = state.gloamDist[i];
      if (gd < 8) v -= (8 - gd) * 4;
      v -= (state.trafficSmooth[i] / 255) * 12;
      if (state.terrain[i] === Terrain.Forest) v += 3;
      lv[i] = Math.max(0, Math.min(100, Math.round(v)));
    }
}
