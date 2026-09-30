/**
 * A scripted "reasonable player" used for headless balance runs and the demo/perf harness.
 * It expands a street grid from the Founding Stake, zones by demand, keeps buildings lit and
 * watered, and buys services as they unlock. Deliberately simple; it is a test tool, not AI.
 */
import { buildRoad, bulldoze, paintZone, placeBuilding, roadPath } from './actions';
import { BUILDING_BY_KEY, MILESTONES, isBuildingUnlocked } from './catalog';
import { MAP_H, MAP_W, RoadType, Terrain, Zone, idx, inBounds, isWater, type GameState } from './types';
import { canPlaceBuilding, forEachBuilding } from './world';

export interface BotOptions {
  aggressive?: boolean; // zone more than demand asks
}

export class Bot {
  radius = 8; // half-size of the developed square around the stake
  private lastExpand = -99;
  constructor(private s: GameState, private opts: BotOptions = {}) {}

  private get cx(): number {
    return this.s.founding.x + 2;
  }
  private get cy(): number {
    return this.s.founding.y + 1;
  }

  /** Call once per day. */
  step(): void {
    const s = this.s;
    if (s.gameOver) return;
    this.ensureGrid();
    this.zoneByDemand();
    this.keepWatered();
    this.keepLit();
    this.buyServices();
    // expand when zone tiles are mostly used and demand is positive
    const free = this.freeZoneTiles();
    const wantMore = s.demand.hearth > 0.2 || s.demand.market > 0.3 || s.demand.craft > 0.3 || s.demand.arcane > 0.3;
    if (free < 12 && wantMore && s.day - this.lastExpand >= 4 && s.treasury > 800 && this.radius < 40) {
      this.radius += 5;
      this.lastExpand = s.day;
    }
  }

  private freeZoneTiles(): number {
    let n = 0;
    const s = this.s;
    for (let i = 0; i < s.zone.length; i++) if (s.zone[i] && s.bIndex[i] < 0) n++;
    return n;
  }

  /** Streets every 5 tiles in both directions within the current radius. */
  private ensureGrid(): void {
    const s = this.s;
    const r = this.radius;
    for (let k = -r; k <= r; k += 5) {
      const type = s.milestone >= 1 && Math.abs(k) % 10 === 0 ? RoadType.Cobble : RoadType.Track;
      buildRoad(s, type, roadPath(this.cx - r, this.cy + k, this.cx + r, this.cy + k, false));
      buildRoad(s, type, roadPath(this.cx + k, this.cy - r, this.cx + k, this.cy + r, true));
    }
  }

  private zoneByDemand(): void {
    const s = this.s;
    const r = this.radius;
    const d = s.demand;
    // pick the zone with the highest demand above a threshold
    const cands: [Zone, number][] = [[Zone.Hearth, d.hearth], [Zone.Market, d.market], [Zone.Craft, d.craft], [Zone.Arcane, d.arcane]];
    cands.sort((a, b) => b[1] - a[1]);
    let painted = 0;
    for (const [z, v] of cands) {
      if (v < (this.opts.aggressive ? 0 : 0.15)) continue;
      if (z === Zone.Arcane && s.milestone < 4) continue;
      // find unzoned road-adjacent tiles inside the radius, paint a few strips (2 rows beside a street)
      outer: for (let y = this.cy - r; y <= this.cy + r; y++) {
        for (let x = this.cx - r; x <= this.cx + r; x++) {
          if (!inBounds(x, y)) continue;
          const i = idx(x, y);
          if (s.zone[i] || s.road[i] || s.bIndex[i] >= 0 || s.gloam[i]) continue;
          const t = s.terrain[i];
          if (isWater(t) || t === Terrain.Hills || t === Terrain.LeyNode) continue;
          const adj = [idx(x - 1, y), idx(x + 1, y), idx(x, y - 1), idx(x, y + 1)].some((j) => j >= 0 && j < s.road.length && s.road[j]);
          if (!adj) continue;
          // craft away from the centre, hearth near
          const dist = Math.max(Math.abs(x - this.cx), Math.abs(y - this.cy));
          if (z === Zone.Craft && dist < 8) continue;
          if (z === Zone.Hearth && dist > r) continue;
          paintZone(s, z, x, y, x, y);
          painted++;
          if (painted >= 14) break outer;
        }
      }
      if (painted >= 14) break;
    }
  }

  /** Place wells (or cisterns) near unwatered zone buildings. */
  private keepWatered(): void {
    const s = this.s;
    let dry: { x: number; y: number } | null = null;
    forEachBuilding(s, (b) => {
      if (!dry && !b.watered && BUILDING_BY_KEY[b.kind].category === 'zone' && b.state === 'ok') dry = { x: b.x, y: b.y };
    });
    if (!dry) return;
    const d = dry as { x: number; y: number };
    const key = s.milestone >= 2 && s.treasury > 4000 && s.manaSupply - s.manaDemand > 12 ? 'cistern' : 'well';
    if (!this.placeNear(key, d.x, d.y, 4)) this.placeNear('well', d.x, d.y, 6);
  }

  /** Place spires near unlit buildings, chained to the lit network. */
  private keepLit(): void {
    const s = this.s;
    let dark: { x: number; y: number } | null = null;
    forEachBuilding(s, (b) => {
      if (!dark && !b.lit && BUILDING_BY_KEY[b.kind].category === 'zone' && b.state === 'ok') dark = { x: b.x, y: b.y };
    });
    if (!dark) return;
    if (s.manaDemand > s.manaSupply * 0.95) return; // no point lighting more
    const d = dark as { x: number; y: number };
    // candidate spots within 5 of the dark building that are within 6 of a lit spire/node
    const lit: { x: number; y: number; link: number }[] = s.nodes.map((n) => ({ x: n.x, y: n.y, link: 6 }));
    forEachBuilding(s, (b) => {
      if (b.lit && (b.kind === 'spire' || b.kind === 'nexus' || b.kind === 'stake')) lit.push({ x: b.x + (b.w - 1) / 2, y: b.y + (b.h - 1) / 2, link: b.kind === 'spire' ? 6 : b.kind === 'stake' ? 4 : 9 });
    });
    let best: { x: number; y: number; score: number } | null = null;
    for (let dy = -6; dy <= 6; dy++)
      for (let dx = -6; dx <= 6; dx++) {
        const x = d.x + dx;
        const y = d.y + dy;
        if (!inBounds(x, y) || canPlaceBuilding(s, 'spire', x, y)) continue;
        const dd = Math.hypot(dx, dy);
        if (dd > 5) continue;
        let linked = false;
        for (const l of lit) if (Math.hypot(l.x - x, l.y - y) <= l.link + 0.5) linked = true;
        if (!linked) continue;
        // prefer spots that light many unlit buildings
        let score = 0;
        forEachBuilding(s, (b) => {
          if (!b.lit && Math.hypot(b.x - x, b.y - y) <= 5) score++;
        });
        if (!best || score > best.score) best = { x, y, score };
      }
    if (best) placeBuilding(s, 'spire', (best as { x: number }).x, (best as { y: number }).y);
    else {
      // no linkable spot: chain a relay spire toward the dark building from the nearest lit source
      let near: { x: number; y: number; link: number } | null = null;
      let nd = Infinity;
      for (const l of lit) {
        const dd = Math.hypot(l.x - d.x, l.y - d.y);
        if (dd < nd) {
          nd = dd;
          near = l;
        }
      }
      if (!near) return;
      const n = near as { x: number; y: number; link: number };
      const ux = (d.x - n.x) / nd;
      const uy = (d.y - n.y) / nd;
      const tx = Math.round(n.x + ux * (n.link - 0.5));
      const ty = Math.round(n.y + uy * (n.link - 0.5));
      this.placeNear('spire', tx, ty, 2);
    }
  }

  private countKind(key: string): number {
    let n = 0;
    forEachBuilding(this.s, (b) => {
      if (b.kind === key) n++;
    });
    return n;
  }

  private buyServices(): void {
    const s = this.s;
    const buildings = s.buildings.filter((b) => b && BUILDING_BY_KEY[b.kind].category === 'zone').length;
    const buffer = 1500;
    const want = (key: string, target: number, nearGloam = false) => {
      if (!isBuildingUnlocked(s.milestone, key)) return;
      const def = BUILDING_BY_KEY[key];
      if (this.countKind(key) >= target) return;
      if (s.treasury < def.cost + buffer) return;
      if (def.needsMana && s.manaDemand + def.manaUse > s.manaSupply) return;
      if (nearGloam) {
        // place toward the nearest gloam tile from the city centre
        let best = -1;
        let bd = Infinity;
        for (let i = 0; i < s.gloam.length; i++) {
          if (!s.gloam[i]) continue;
          const x = i % MAP_W;
          const y = (i / MAP_W) | 0;
          const dd = Math.hypot(x - this.cx, y - this.cy);
          if (dd < bd) {
            bd = dd;
            best = i;
          }
        }
        if (best < 0) return;
        const gx = best % MAP_W;
        const gy = (best / MAP_W) | 0;
        // spot on the city edge toward the gloam
        const ux = (gx - this.cx) / bd;
        const uy = (gy - this.cy) / bd;
        const r = Math.min(this.radius, bd - 6);
        this.placeNear(key, Math.round(this.cx + ux * r), Math.round(this.cy + uy * r), 4);
        return;
      }
      // spread services: place near a random zone building far from existing same-kind
      const spots: { x: number; y: number; d: number }[] = [];
      forEachBuilding(s, (b) => {
        if (BUILDING_BY_KEY[b.kind].category !== 'zone') return;
        let dmin = Infinity;
        forEachBuilding(s, (o) => {
          if (o.kind === key) dmin = Math.min(dmin, Math.hypot(o.x - b.x, o.y - b.y));
        });
        spots.push({ x: b.x, y: b.y, d: dmin });
      });
      spots.sort((a, b) => b.d - a.d);
      for (const sp of spots.slice(0, 6)) if (this.placeNear(key, sp.x, sp.y, 4)) return;
    };
    want('watchpost', 1 + Math.floor(buildings / 60));
    want('shrine', 1 + Math.floor(buildings / 80));
    want('boneyard', 1 + Math.floor(s.population / 700));
    want('healer', 1 + Math.floor(buildings / 90));
    want('garden', 1 + Math.floor(buildings / 50));
    want('veshari', 1 + Math.floor(buildings / 120));
    want('wardlantern', 1 + Math.floor(s.day / 30), true);
    want('academy', 1 + Math.floor(buildings / 200));
    want('square', 1);
    want('watchhouse', Math.floor(buildings / 150));
    want('ossuary', Math.floor(s.population / 1200));
    want('hospice', Math.floor(buildings / 250));
    want('guildhall', 1);
    want('nexus', Math.floor(buildings / 220));
    want('temple', 1);
    want('grandacademy', 1);
    want('font', s.manaDemand > s.manaSupply * 0.85 ? 1 + this.countKind('font') : 0);
    if (s.milestone >= 7 && s.treasury > 30000) want('lantern', 1);
    void MILESTONES;
  }

  /** Try to place a building near (x,y) within a search radius. */
  private placeNear(key: string, x: number, y: number, r: number): boolean {
    const s = this.s;
    const def = BUILDING_BY_KEY[key];
    if (s.treasury < def.cost) return false;
    let best: { x: number; y: number; d: number } | null = null;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const px = x + dx;
        const py = y + dy;
        if (!inBounds(px, py) || px < 1 || py < 1 || px >= MAP_W - 3 || py >= MAP_H - 3) continue;
        if (canPlaceBuilding(s, key, px, py)) continue;
        const d = Math.hypot(dx, dy);
        if (!best || d < best.d) best = { x: px, y: py, d };
      }
    if (!best) {
      // dense city: sacrifice a level-1 zoned building next to a road
      if (def.w === 1 && def.h === 1) {
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            const px = x + dx;
            const py = y + dy;
            if (!inBounds(px, py)) continue;
            const bi = s.bIndex[idx(px, py)];
            const b = bi >= 0 ? s.buildings[bi] : null;
            if (b && b.w === 1 && b.level === 1 && BUILDING_BY_KEY[b.kind].category === 'zone') {
              bulldoze(s, px, py);
              return placeBuilding(s, key, px, py).ok;
            }
          }
      }
      return false;
    }
    return placeBuilding(s, key, (best as { x: number }).x, (best as { y: number }).y).ok;
  }
}
