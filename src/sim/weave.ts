/** The ley-weave: node aspects, dragon auras, Gloam pressure and the season's touch on the river. See DESIGN.md 13. */
import { BUILDING_BY_KEY } from './catalog';
import { AgentKind, DAYS_PER_SEASON, Zone, idx, type Building, type DragonLine, type GameState } from './types';
import { forEachBuilding, seasonOf } from './world';
import { treeStage, worldTree } from './growth';
import { wyrmGuards } from './wyrm';
import { districtTiles } from './wyrmcraft';

export const ASPECT_RADIUS = 10;
export const ASPECTS: DragonLine[] = ['ember', 'bone', 'glim', 'vein', 'sky', 'grey', 'tide', 'storm'];
export const ASPECT_INFO: Record<DragonLine, { name: string; color: string; desc: string }> = {
  ember: { name: 'Ember', color: '#ff7a3c', desc: 'warm ley: Craft works within 10 make 15% more, fires start half again as often' },
  bone: { name: 'Bone', color: '#d9d2c0', desc: 'quiet ley: deathcare within 10 quiets half again as many; the restless lie down more easily' },
  glim: { name: 'Glim', color: '#ffd166', desc: 'bright ley: twice the glimmoths, and Moth-Lofts gather twice the dust' },
  vein: { name: 'Vein', color: '#4fe3ff', desc: 'deep ley: +15 mana a day, and a Nexus within 10 stores half again as much' },
  sky: { name: 'Sky', color: '#e8f4ff', desc: 'high ley: couriers fly faster from a cradle here; a Ley Beacon within 10 reaches 45 tiles' },
  grey: { name: 'Grey', color: '#8a8894', desc: 'still ley: the Gloam does not creep within 10, and hounds shy from it' },
  tide: { name: 'Tide', color: '#3ec9b0', desc: 'wet ley: wells within 10 reach two tiles further, Torrent Mills make half again more, fires are rarer' },
  storm: { name: 'Storm', color: '#c58cff', desc: 'wild ley: mana-storms dissolve within 10; the Storm-Caller\'s Peak recovers twice as fast' },
  fen: { name: 'Fen', color: '#c27b3f', desc: 'fox ley' },
};

/** Assign aspects: the founding node is always Vein; the rest by seed. */
export function assignAspects(nodes: { x: number; y: number; aspect?: DragonLine }[], founding: { x: number; y: number }, pick: () => number): void {
  const pool = ASPECTS.filter((a) => a !== 'vein');
  const used = new Map<DragonLine, number>();
  for (const n of nodes) if (n.aspect) used.set(n.aspect, (used.get(n.aspect) ?? 0) + 1);
  for (const n of nodes) {
    if (n.aspect) continue;
    if (n.x === founding.x && n.y === founding.y) { n.aspect = 'vein'; continue; }
    // no aspect more than twice on one map
    let a = pool[pick() % pool.length];
    for (let k = 0; k < pool.length && (used.get(a) ?? 0) >= 2; k++) a = pool[(pool.indexOf(a) + 1) % pool.length];
    n.aspect = a;
    used.set(a, (used.get(a) ?? 0) + 1);
  }
}

/** The aspect of the nearest node within ASPECT_RADIUS of a tile, or null. */
export function aspectAt(s: GameState, x: number, y: number, r = ASPECT_RADIUS): DragonLine | null {
  let best: DragonLine | null = null;
  let bd = r + 0.001;
  for (const n of s.nodes) {
    const d = Math.hypot(n.x - x, n.y - y);
    if (d < bd && n.aspect) { bd = d; best = n.aspect; }
  }
  return best;
}
export function nodesOfAspect(s: GameState, a: DragonLine): { x: number; y: number }[] {
  return s.nodes.filter((n) => n.aspect === a);
}

// ---------- dragon auras ----------
export interface Aura { x: number; y: number; r: number; line: DragonLine; name: string }
let auraCache: { tick: number; list: Aura[] } | null = null;
/** Drakes and wyverns at stage 2+ with no role or a warden post radiate their line's aura. Cached per 50 ticks. */
export function dragonAuras(s: GameState): Aura[] {
  const stamp = Math.floor(s.tick / 50) * 1000003 + s.dragons.length;
  if (auraCache && auraCache.tick === stamp) return auraCache.list;
  const list: Aura[] = [];
  for (const d of s.dragons) {
    if (d.stage < 2 || (d.role !== 'none' && d.role !== 'warden')) continue;
    let x = -1;
    let y = -1;
    if (d.role === 'warden' && d.roleTarget > 0) {
      const tiles = districtTiles(s, d.roleTarget);
      if (tiles.length) { let sx = 0; let sy = 0; for (const t of tiles) { sx += t % s.w; sy += (t / s.w) | 0; } x = sx / tiles.length; y = sy / tiles.length; }
    }
    if (x < 0) {
      const c = s.buildings.find((b) => b && b.id === d.cradleId);
      if (!c) continue;
      x = c.x + 1;
      y = c.y + 1;
    }
    const r = d.role === 'warden' ? 12 : 8;
    list.push({ x, y, r, line: d.line, name: d.name });
    if (d.second) list.push({ x, y, r: d.trueblood ? r : r - 3, line: d.second, name: d.name });
  }
  auraCache = { tick: stamp, list };
  return list;
}
export function auraAt(s: GameState, line: DragonLine, x: number, y: number): boolean {
  return dragonAuras(s).some((a) => a.line === line && Math.hypot(a.x - x, a.y - y) <= a.r);
}
export const AURA_INFO: Record<DragonLine, string> = {
  ember: 'wyrmfire for the works',
  bone: 'the restless lie down within its aura (deathcare)',
  glim: 'lights its cradle\'s neighbours without mana',
  vein: '+10 mana a day while it roosts',
  sky: 'flies courier loads of 40, a third faster',
  grey: 'the Gloam parts around it (ward)',
  tide: 'douses fires within its aura (fire brigade)',
  storm: 'dissolves mana-storms within its aura',
  fen: 'hounds cannot find the hearths within its aura',
};

// ---------- Gloam pressure ----------
/** 0..1: how hard the Gloam presses. Dead, restless, overdraw and wild things raise it; faith, the wyrm, the Tree and Grey ley lower it. */
export function computeGloamPressure(s: GameState): number {
  let p = 0.3;
  p += Math.min(0.3, s.unquieted / 80);
  let restless = 0;
  let wild = 0;
  for (const a of s.agents) {
    if (a.kind === AgentKind.Restless) restless++;
    else if (a.kind === AgentKind.Creature && ((a.species === 'golem' && a.load === 0) || a.species === 'tiger')) wild++;
  }
  p += Math.min(0.2, restless / 30);
  p += Math.min(0.1, wild * 0.03);
  if (s.overdrawDays > 0) p += 0.15;
  if (s.storms.length) p += 0.05;
  if (seasonOf(s) === 3) p += 0.1;
  // faith: share of zoned buildings under faith coverage
  let zoned = 0;
  let faithful = 0;
  forEachBuilding(s, (b) => { if (BUILDING_BY_KEY[b.kind].category === 'zone' && b.state === 'ok') { zoned++; if (s.coverage.faith[idx(b.x, b.y)] > 60) faithful++; } });
  if (zoned) p -= 0.25 * (faithful / zoned);
  if (wyrmGuards(s)) p -= 0.2;
  const tree = worldTree(s);
  if (tree) p -= 0.04 * treeStage(tree);
  p -= 0.03 * nodesOfAspect(s, 'grey').length;
  return Math.max(0, Math.min(1, p));
}
export function pressureWord(p: number): string {
  return p < 0.25 ? 'quiet' : p < 0.45 ? 'restless' : p < 0.65 ? 'pressing' : 'hungry';
}

// ---------- the river and the season ----------
export function riverFrozen(s: GameState): boolean {
  return seasonOf(s) === 3 && s.day % DAYS_PER_SEASON >= 5;
}
/** Torrent Mill output by season: the Thaw flood, the Hush freeze. */
export function millFactor(s: GameState): number {
  if (riverFrozen(s)) return 0.5;
  return seasonOf(s) === 0 ? 1.3 : 1;
}

/** Daily: Moth-Lofts gather glim-dust, Gloam pressure is recomputed. */
export function dailyWeave(s: GameState): void {
  let dust = 0;
  forEachBuilding(s, (b) => {
    if (b.kind === 'mothloft' && b.lit && b.state === 'ok') dust += 0.3 * (aspectAt(s, b.x, b.y) === 'glim' ? 2 : 1);
  });
  s.materials.glimdust += dust;
  s.stats.glimdustTotal += dust;
  s.gloamPressure = computeGloamPressure(s);
  // a quiet Hush: every day of the season under 0.45
  const dos = s.day % DAYS_PER_SEASON;
  if (seasonOf(s) === 3) {
    if (dos === 0) s.stats.hushPressureBreaks = 0;
    if (s.gloamPressure >= 0.45) s.stats.hushPressureBreaks++;
    if (dos === DAYS_PER_SEASON - 1 && s.stats.hushPressureBreaks === 0) s.stats.quietHush++;
  }
}

export function hasMarvel(s: GameState, key: string): boolean {
  return s.buildings.some((b) => b && b.kind === key && b.state === 'ok');
}
export function marvelNear(s: GameState, key: string, b: Building, r = 8): boolean {
  return s.buildings.some((o) => o && o.kind === key && o.state === 'ok' && o.lit && Math.abs(o.x - b.x) <= r && Math.abs(o.y - b.y) <= r);
}

export { Zone };
