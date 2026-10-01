/** Concord Wardens (golems), skyrays and the buildings that bind or lure them. See DESIGN.md 4.34. */
import { BUILDING_BY_KEY } from './catalog';
import { edictOn } from './edicts';
import { AgentKind, MAP_H, MAP_W, Terrain, idx, inBounds, type Agent, type Building, type GameState } from './types';
import { commitRng, forEachBuilding, pushMessage, rngOf, seasonOf } from './world';
import { effects } from './hazards';

export const GOLEM_LABOUR = 12; // jobs' worth of work per bound golem
export const GOLEM_MANA = 10; // mana a day per bound golem at the foundry
export const GOLEM_WAKE_CHANCE = 0.03; // per mine per day
export const GOLEM_CAP = 12;
export const FOUNDRY_RADIUS = 12;
export const SKYRAY_SCHOOL = 5;
export const BEACON_RADIUS = 10;
export const RAYSCALE_PER_DAY = 0.6;

export function isGolem(a: Agent): boolean {
  return a.kind === AgentKind.Creature && a.species === 'golem';
}
/** Bound golems carry load 1; wild ones load 0. */
export function boundGolems(s: GameState): number {
  let n = 0;
  for (const a of s.agents) if (isGolem(a) && a.load > 0) n++;
  return n;
}
export function wildGolems(s: GameState): number {
  let n = 0;
  for (const a of s.agents) if (isGolem(a) && a.load === 0) n++;
  return n;
}
/** Buildings that bind Wardens: the Vellish Golem Foundry and the Grimmen Forge-Temple. */
export const GOLEM_HOUSES = ['golemfoundry', 'forgetemple'];
export const FORGE_WAKE_RADIUS = 20; // a Warden woken this near a lit Forge-Temple climbs out bound
export function foundries(s: GameState): Building[] {
  const out: Building[] = [];
  forEachBuilding(s, (b) => { if (GOLEM_HOUSES.includes(b.kind) && b.state === 'ok' && b.lit) out.push(b); });
  return out;
}
/** Mana a lit foundry draws for the golems it holds. */
export function foundryMana(s: GameState): number {
  const per = edictOn(s, 'beastmasters') ? GOLEM_MANA * 0.6 : GOLEM_MANA;
  return boundGolems(s) * per;
}

function spawnGolem(s: GameState, x: number, y: number, bound = false): Agent {
  const a: Agent = {
    id: s.nextAgentId++, kind: AgentKind.Creature, x: x + 0.5, y: y + 0.5, path: [], pathIdx: 0, speed: 0.45, homeId: -1, targetId: -1,
    timer: 0, variant: 0, dir: 0, load: bound ? 1 : 0, species: 'golem', anchorId: -1, ax: x + 0.5, ay: y + 0.5,
  };
  s.agents.push(a);
  return a;
}

/** Daily: mines wake Concord Wardens in the hills nearby; foundries bind wild ones within reach. */
export function dailyBeasts(s: GameState): void {
  const rng = rngOf(s);
  const fs = foundries(s);
  // 1. mining wakes wardens; near a lit Forge-Temple they climb out already bound
  if (creatureN(s, 'golem') < GOLEM_CAP) {
    forEachBuilding(s, (b) => {
      if (b.kind !== 'mine' || b.state !== 'ok' || b.age < 5) return;
      if (!rng.chance(GOLEM_WAKE_CHANCE)) return;
      for (let k = 0; k < 20; k++) {
        const x = b.x + rng.int(13) - 6;
        const y = b.y + rng.int(13) - 6;
        if (!inBounds(x, y) || s.terrain[idx(x, y)] !== Terrain.Hills || s.bIndex[idx(x, y)] >= 0) continue;
        const forge = fs.find((f) => f.kind === 'forgetemple' && Math.hypot(f.x + 1 - x, f.y + 1 - y) <= FORGE_WAKE_RADIUS);
        const g = spawnGolem(s, x, y, !!forge);
        s.stats.golemsWoken++;
        effects.push({ x, y, kind: 'stomp', tick: s.tick });
        if (forge) {
          g.homeId = forge.id;
          g.ax = forge.x + 1;
          g.ay = forge.y + 2.5;
          s.stats.golemsBound++;
          pushMessage(s, `The miners at (${b.x},${b.y}) have woken a Concord Warden, and it walks straight to the Forge-Temple at (${forge.x},${forge.y}) and kneels. The Grimmen say the forge remembers it.`, 'good', true, { x, y });
        } else pushMessage(s, `The miners at (${b.x},${b.y}) have woken a Concord Warden: a stone giant climbs out of the hill and starts walking. Nothing burns it and the Gloam parts for it. A ${s.faction === 'grimmen' ? 'Forge-Temple' : 'Golem Foundry'} (Burgh) can bind it.`, 'warn', true, { x, y });
        break;
      }
    });
  }
  // 2. foundries bind wild wardens within reach
  if (fs.length) {
    for (const a of s.agents) {
      if (!isGolem(a) || a.load > 0) continue;
      const f = fs.find((b) => Math.hypot(b.x + 1 - a.x, b.y + 1 - a.y) <= FOUNDRY_RADIUS);
      if (!f) continue;
      a.load = 1;
      a.homeId = f.id;
      a.ax = f.x + 1;
      a.ay = f.y + 2.5;
      s.stats.golemsBound++;
      pushMessage(s, `The ${BUILDING_BY_KEY[f.kind].name} at (${f.x},${f.y}) binds a Concord Warden. It will labour for ${GOLEM_LABOUR} hands and never sleep.`, 'good', true, { x: f.x, y: f.y });
    }
  }
  // 3. skyrays: a school crosses the map in Bloom and Ember; a lit Ley Beacon keeps it
  const season = seasonOf(s);
  const rays = creatureN(s, 'skyray');
  if ((season === 1 || season === 2) && rays === 0 && s.day % 30 >= 4 && s.day % 30 <= 22 && rng.chance(0.12)) {
    const side = rng.int(4);
    const x0 = side === 0 ? 2 : side === 1 ? MAP_W - 3 : 20 + rng.int(MAP_W - 40);
    const y0 = side === 2 ? 2 : side === 3 ? MAP_H - 3 : 20 + rng.int(MAP_H - 40);
    const x1 = side === 0 ? MAP_W - 3 : side === 1 ? 2 : MAP_W - 1 - x0;
    const y1 = side === 2 ? MAP_H - 3 : side === 3 ? 2 : MAP_H - 1 - y0;
    for (let k = 0; k < SKYRAY_SCHOOL; k++) {
      const a: Agent = {
        id: s.nextAgentId++, kind: AgentKind.Creature, x: x0 + (rng.next() - 0.5) * 6, y: y0 + (rng.next() - 0.5) * 6, path: [idx(x1, y1)], pathIdx: 0, speed: 1.6 + rng.next() * 0.4,
        homeId: -1, targetId: -1, timer: 0, variant: k, dir: 0, load: 0, species: 'skyray', anchorId: -1, ax: x1 + 0.5, ay: y1 + 0.5, alt: 60, phase: 0,
      };
      s.agents.push(a);
    }
    s.stats.skyraySchools++;
    pushMessage(s, `A school of skyrays rides the high ley over the valley, manta-shadows sliding across the roofs. A lit Ley Beacon would keep them.`, 'info', true);
  }
  // 4. lured rays shed rayscale
  const lured = s.agents.filter((a) => a.kind === AgentKind.Creature && a.species === 'skyray' && a.phase === 1).length;
  if (lured > 0) {
    s.materials.rayscale += RAYSCALE_PER_DAY * Math.min(1, lured / 3);
    s.stats.rayscaleTotal += RAYSCALE_PER_DAY * Math.min(1, lured / 3);
  }
  if (s.materials.rayscale > 0) s.materials.rayscale = Math.max(0, s.materials.rayscale - 0.15); // enchanters use it
  commitRng(s, rng);
}

function creatureN(s: GameState, species: string): number {
  let n = 0;
  for (const a of s.agents) if (a.kind === AgentKind.Creature && a.species === species) n++;
  return n;
}

/** A wild surge sends bound golems mad again. */
export function surgeMaddensGolems(s: GameState): number {
  let n = 0;
  for (const a of s.agents) if (isGolem(a) && a.load > 0) { a.load = 0; a.homeId = -1; n++; }
  if (n) pushMessage(s, `${n} bound Concord Warden${n > 1 ? 's' : ''} break their binding in the surge and walk loose.`, 'bad', true);
  return n;
}

/** Skyrays lured by a lit Ley Beacon circle it (phase 1) and stay. */
export function beacon(s: GameState): Building | null {
  let out: Building | null = null;
  forEachBuilding(s, (b) => { if ((b.kind === 'leybeacon' || b.kind === 'raymirror') && b.state === 'ok' && b.lit) out = out ?? b; });
  return out;
}

/** Are lured rays circling? Happiness for the whole city. */
export function raysLured(s: GameState): boolean {
  return s.agents.some((a) => a.kind === AgentKind.Creature && a.species === 'skyray' && a.phase === 1);
}

/** Watch radius from Watch Houses doubles with a lit Drake Mews. */
export function mewsActive(s: GameState): boolean {
  return s.buildings.some((b) => b && b.kind === 'drakemews' && b.state === 'ok' && b.lit);
}

export function describeBeasts(s: GameState): string {
  const w = wildGolems(s);
  const b = boundGolems(s);
  const r = creatureN(s, 'skyray');
  const bits: string[] = [];
  if (w || b) bits.push(`Concord Wardens: ${b} bound (${b * GOLEM_LABOUR} hands, ${Math.round(foundryMana(s))} mana), ${w} wild`);
  if (r) bits.push(raysLured(s) ? `${r} skyrays circle the Beacon` : `${r} skyrays are crossing the valley`);
  if (s.materials.rayscale > 0) bits.push(`rayscale ${s.materials.rayscale.toFixed(1)} (artifacts +10%)`);
  return bits.join(' · ') || 'No wardens woken, no skyrays in sight.';
}

export { BUILDING_BY_KEY };
