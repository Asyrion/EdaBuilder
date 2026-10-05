/**
 * Creatures: free-moving fauna that reuse the agent structure. Glimmoths swarm lit ley at
 * night, thrumhares graze meadows by day, wisps drift over boneyards and the restless.
 * They are ambient life with small mechanical hooks (glim-dust for Moth-Lofts, wisps as
 * the early warning for restless dead).
 */
import { WYRM_FLYOVER_FIRES, endFlyover, inLair, razeStake, wyrmGuards, flyoverFireCap } from './wyrm';
import { beacon } from './beasts';
import { RIDER_RANGE, airshipArrives, riderTarget } from './vehicles';
import { maybeSpawnTiger } from './lore';
import { aspectAt, auraAt, blizzard } from './weave';
import { edictOn } from './edicts';
import { effects, igniteBuilding } from './hazards';
import { BUILDING_BY_KEY } from './catalog';
import { AgentKind, MAP_H, MAP_W, TICKS_PER_SEC, Terrain, Zone, idx, inBounds, isWater, type Agent, type Building, type GameState, type Species } from './types';
import { commitRng, forEachBuilding, illTiding, markDirty, pushMessage, rngOf, seasonOf, timeOfDay } from './world';

const CAP: Record<Species, number> = { glimmoth: 90, thrumhare: 60, wisp: 40, hound: 30, drake: 20, wyvern: 20, wyrm: 1, golem: 12, skyray: 6, rider: 4, airship: 1, tiger: 4, boat: 0, deer: 0, elk: 0, boar: 0, otter: 0, heron: 0, goat: 0, wolf: 0 }; // the wild keeps its own numbers (wild.ts)
import { courierJob, districtTiles, lineIndex } from './wyrmcraft';
import { marketStockCap } from './agents';
import { HOUND_REACH, houndChance, isWild, tickWildAgent } from './wild';
import { tickBoat } from './water';
import { Rng } from '../core/rng';
import { houndAtDoor } from './hounds';

export function creatureCount(state: GameState, species?: Species): number {
  let n = 0;
  for (const a of state.agents) if (a.kind === AgentKind.Creature && (!species || a.species === species)) n++;
  return n;
}

export function isNight(state: GameState): boolean {
  const t = timeOfDay(state);
  return t < 0.24 || t > 0.78;
}

export { spawn as spawnCreature };
function spawn(state: GameState, species: Species, x: number, y: number, anchorId = -1): Agent {
  const rng = rngOf(state);
  const a: Agent = {
    id: state.nextAgentId++,
    kind: AgentKind.Creature,
    x: x + 0.5,
    y: y + 0.5,
    path: [],
    pathIdx: 0,
    speed: species === 'thrumhare' ? 1.6 : species === 'glimmoth' ? 1.2 : species === 'hound' ? 1.3 : 0.4,
    homeId: -1,
    targetId: -1,
    timer: 0,
    variant: rng.int(3),
    dir: 0,
    load: 0,
    species,
    anchorId,
    ax: x + 0.5,
    ay: y + 0.5,
  };
  commitRng(state, rng);
  state.agents.push(a);
  return a;
}

/** Sources glimmoths swarm: ley nodes and lit spires/nexus/wards. */
function leySources(state: GameState): { x: number; y: number; id: number }[] {
  const out = state.nodes.map((n) => ({ x: n.x, y: n.y, id: -1 }));
  for (const n of state.nodes) if (n.aspect === 'glim') out.push({ x: n.x, y: n.y, id: -1 });
  forEachBuilding(state, (b) => {
    if (b.lit && b.state === 'ok' && (b.kind === 'spire' || b.kind === 'nexus' || b.kind === 'wardlantern' || b.kind === 'mothloft')) out.push({ x: b.x, y: b.y, id: b.id });
    if (b.kind === 'worldtree' && b.state === 'ok' && b.age >= 60) { out.push({ x: b.x + 1, y: b.y + 1, id: b.id }); out.push({ x: b.x + 1, y: b.y, id: b.id }); }
  });
  return out;
}

/** Runs every 50 ticks: manage populations. */
export function updateCreatures(state: GameState): void {
  const rng = rngOf(state);
  const night = isNight(state);
  // ---- glimmoths: 2 per ley source at night, gone by day
  const moths = creatureCount(state, 'glimmoth');
  if (night) {
    const sources = leySources(state);
    const want = Math.min(CAP.glimmoth, sources.length * 2);
    // seen at a lit spire or loft (a bare node's moths are not the Ledger's)
    if (want > 0 && sources.some((src) => src.id >= 0)) state.stats.mothsSeen = Math.max(state.stats.mothsSeen, want);
    // each lit loft remembers the most moths that swarmed within 8 of it tonight (read by the works at dawn)
    forEachBuilding(state, (o) => {
      if (o.kind !== 'mothloft' || !o.lit || o.state !== 'ok') return;
      let near = 0;
      for (const a of state.agents) if (a.kind === AgentKind.Creature && a.species === 'glimmoth' && Math.hypot(a.x - o.x, a.y - o.y) <= 8) near++;
      if (near > o.stock) o.stock = near;
    });
    if (moths < want) {
      for (let k = moths; k < want && k - moths < 12; k++) {
        const s = rng.pick(sources);
        commitRng(state, rng);
        spawn(state, 'glimmoth', s.x, s.y, s.id);
        rng.state = state.rngState;
      }
    }
  }
  // ---- thrumhares: meadow grazers by day
  const hares = creatureCount(state, 'thrumhare');
  if (!night) {
    let meadow = 0;
    for (let i = 0; i < state.terrain.length; i++) if (state.terrain[i] === Terrain.Meadow && state.bIndex[i] < 0 && !state.gloam[i]) meadow++;
    const want = Math.min(CAP.thrumhare, Math.floor(meadow / 25));
    if (hares < want) {
      for (let tries = 0; tries < 30 && creatureCount(state, 'thrumhare') < want; tries++) {
        const i = rng.int(state.terrain.length);
        if (state.terrain[i] !== Terrain.Meadow || state.bIndex[i] >= 0 || state.gloam[i]) continue;
        commitRng(state, rng);
        spawn(state, 'thrumhare', i % MAP_W, (i / MAP_W) | 0);
        rng.state = state.rngState;
      }
    }
  }
  // ---- wisps: one per boneyard/ossuary, one per restless, more when the dead are unquieted
  const wisps = creatureCount(state, 'wisp');
  const yards: Building[] = [];
  forEachBuilding(state, (b) => {
    if (BUILDING_BY_KEY[b.kind].service?.type === 'death' && b.state === 'ok') yards.push(b);
  });
  const restless = state.agents.filter((a) => a.kind === AgentKind.Restless);
  const want = Math.min(CAP.wisp, yards.length + restless.length + Math.floor(state.unquieted / 8));
  if (wisps >= 6) state.stats.wispRing = Math.max(state.stats.wispRing, wisps);
  if (wisps < want) {
    for (let k = wisps; k < want && k - wisps < 6; k++) {
      let x: number;
      let y: number;
      let anchor = -1;
      if (restless.length && rng.chance(0.5)) {
        const r = rng.pick(restless);
        x = Math.floor(r.x);
        y = Math.floor(r.y);
        anchor = r.id;
      } else if (yards.length) {
        const b = rng.pick(yards);
        x = b.x + rng.int(b.w);
        y = b.y + rng.int(b.h);
        anchor = b.id;
      } else {
        const f = state.founding;
        x = f.x + rng.int(9) - 4;
        y = f.y + rng.int(9) - 4;
      }
      if (!inBounds(x, y)) continue;
      commitRng(state, rng);
      spawn(state, 'wisp', x, y, anchor);
      rng.state = state.rngState;
    }
  }
  // ---- Gloam-hounds: packs come out of the Gloam at night, bolder in the Hush
  const hounds = creatureCount(state, 'hound');
  if (night && state.stats.gloamTiles > 0 && state.day >= 6 && !blizzard(state)) { // a blizzard keeps the packs in their dens (iteration 54)
    const hush = seasonOf(state) === 3;
    const packs = Math.min(CAP.hound, Math.floor((state.population / 250 + 1) * (hush ? 2.2 : 1) * 3));
    if (hounds < packs && rng.chance((hush ? 0.35 : 0.15) * (edictOn(state, 'beastmasters') ? 1.5 : 1))) {
      // spawn a pack on a gloam tile within 22 tiles of a random building
      const spots: number[] = [];
      const blds = state.buildings.filter((b) => b && b.state === 'ok' && state.gloamDist[idx(b.x, b.y)] <= 14 && !(wyrmGuards(state) && inLair(state, b.x, b.y))) as Building[];
      if (blds.length) {
        const b = rng.pick(blds);
        for (let dy = -22; dy <= 22; dy++)
          for (let dx = -22; dx <= 22; dx++) {
            const tx = b.x + dx;
            const ty = b.y + dy;
            if (inBounds(tx, ty) && state.gloam[idx(tx, ty)]) spots.push(idx(tx, ty));
          }
        if (spots.length) {
          const pick = spots[rng.int(spots.length)];
          spots.length = 0;
          spots.push(pick);
        }
      }
      if (spots.length) {
        const i = spots[0];
        const n = 3 + rng.int(3);
        commitRng(state, rng);
        for (let k = 0; k < n; k++) spawn(state, 'hound', i % MAP_W, (i / MAP_W) | 0);
        rng.state = state.rngState;
        state.stats.houndsTotal += n;
        effects.push({ x: i % MAP_W, y: (i / MAP_W) | 0, kind: 'howl', tick: state.tick });
        if (rng.chance(0.6)) pushMessage(state, `Gloam-hounds howl at the ${((i / MAP_W) | 0) < state.founding.y ? 'north' : 'south'}ern edge. ${hush ? 'The Hush makes them bold.' : ''} Ward Lanterns and the Watch drive them off; a Hunters' Lodge ends them.`, 'warn');
      }
    }
  }
  // ---- drakes: one visible agent per hatchling/drake, near its cradle or at its post
  for (const d of state.dragons) {
    if (d.stage < 1) continue;
    const want: Species = d.stage >= 3 ? 'wyvern' : 'drake';
    const existing = state.agents.find((a) => a.kind === AgentKind.Creature && (a.species === 'drake' || a.species === 'wyvern') && a.dragonId === d.id);
    if (existing && existing.species === want) continue;
    if (existing) state.agents = state.agents.filter((a) => a !== existing);
    const c = state.buildings.find((b) => b && b.id === d.cradleId);
    if (!c) continue;
    const a = spawn(state, want, c.x, c.y + c.h);
    a.dragonId = d.id;
    a.variant = lineIndex(d.line);
    a.speed = want === 'wyvern' ? (d.line === 'sky' ? 6 : 4.5) * (c.lit && aspectAt(state, c.x, c.y) === 'sky' ? 1.25 : 1) : d.stage >= 2 ? 1.1 : 0.7;
    a.alt = 0;
    a.phase = 0;
  }
  maybeSpawnTiger(state, night);
  // ---- drake riders: two per lit Drake Mews
  {
    const want = riderTarget(state);
    let have = creatureCount(state, 'rider');
    if (have < want) {
      forEachBuilding(state, (m) => {
        if (m.kind !== 'drakemews' || m.state !== 'ok' || !m.lit || have >= want) return;
        const here = state.agents.filter((a) => a.kind === AgentKind.Creature && a.species === 'rider' && a.anchorId === m.id).length;
        for (let k = here; k < 2 && have < want; k++) {
          const a = spawn(state, 'rider', m.x + 1, m.y + 2, m.id);
          a.speed = 3.2;
          a.alt = 0;
          a.phase = 0;
          have++;
        }
      });
    }
  }
  // ---- despawn: moths by day, hares at night, surplus wisps
  const keepWisps = want;
  let wispSeen = 0;
  state.agents = state.agents.filter((a) => {
    if (a.kind !== AgentKind.Creature) return true;
    if (a.species === 'glimmoth' && !night) return rng.chance(0.6);
    if (a.species === 'thrumhare' && night) return rng.chance(0.6);
    if (a.species === 'thrumhare' && edictOn(state, 'bounty')) return false; // pelts
    if (a.species === 'golem') return true;
    if (a.species === 'tiger' && !night) return rng.chance(0.85); // slips back into the trees by day, mostly
    if (a.species === 'rider') return state.buildings.some((b) => b && b.id === a.anchorId && b.state === 'ok' && b.lit);
    if (a.species === 'airship') return a.timer >= 0;
    if (a.species === 'skyray') return a.timer >= 0;
    if (a.species === 'hound' && !night) return rng.chance(0.3); // slink back into the grey at dawn
    if (a.species === 'hound' && wyrmGuards(state) && inLair(state, a.x, a.y)) return false; // nothing hunts under the wyrm's eye
    if (a.species === 'wyrm') return state.wyrm.flyover > 0;
    if (a.species === 'wyvern' && a.dragonId === -1) return a.phase === 3 && a.timer > 0; // a returned dragon, refused: it circles for a day
    if (a.species === 'drake' || a.species === 'wyvern') return state.dragons.some((d) => d.id === a.dragonId && d.stage >= 1);
    if (a.species === 'wisp') {
      wispSeen++;
      if (wispSeen > keepWisps) return false;
    }
    return true;
  });
  commitRng(state, rng);
}

/** Every tick: movement behaviours. Creatures ignore roads. */
export function tickCreatures(state: GameState): void {
  const rng = rngOf(state);
  const dt = 1 / TICKS_PER_SEC;
  const t = state.tick * dt;
  let wr: Rng | null = null; // the wild moves on a stream of its own (wild.ts), so herds add no roll to the main one
  const night = isNight(state);
  for (const a of state.agents) {
    if (a.kind !== AgentKind.Creature) continue;
    if (isWild(a.species)) {
      if (!wr) wr = new Rng((Math.imul(state.seed ^ 0x9e3779b9, 31) + Math.imul(state.tick, 2654435761)) >>> 0);
      tickWildAgent(state, a, wr, night, dt);
      continue;
    }
    if (a.species === 'boat') { // the fishers' boats row on the same side stream (water.ts, iteration 60)
      if (!wr) wr = new Rng((Math.imul(state.seed ^ 0x9e3779b9, 31) + Math.imul(state.tick, 2654435761)) >>> 0);
      tickBoat(state, a, wr, night, dt);
      continue;
    }
    const ax = a.ax ?? a.x;
    const ay = a.ay ?? a.y;
    switch (a.species) {
      case 'glimmoth': {
        // flutter on a wobbly orbit around the source
        const ph = a.id * 0.7;
        const r = 1.2 + 0.6 * Math.sin(t * 0.9 + ph);
        const tx = ax + Math.cos(t * 1.7 + ph) * r;
        const ty = ay + Math.sin(t * 2.3 + ph) * r * 0.6;
        a.x += (tx - a.x) * 0.15 + (rng.next() - 0.5) * 0.05;
        a.y += (ty - a.y) * 0.15 + (rng.next() - 0.5) * 0.05;
        break;
      }
      case 'golem': {
        // wild: a slow, unstoppable walk toward the city, then aimless; bound: paces by the foundry; in harness: its cart is the warden (iteration 72)
        if (a.duty === 'haul') break;
        if (a.timer > 0) { a.timer--; break; }
        if (a.path.length === 0) {
          const bound = a.load > 0;
          const cx = bound ? ax : a.x;
          const cy = bound ? ay : a.y;
          const range = bound ? 3 : 7;
          for (let k = 0; k < 6; k++) {
            const nx = Math.floor(cx + (rng.next() - 0.5) * range * 2);
            const ny = Math.floor(cy + (rng.next() - 0.5) * range * 2);
            if (!inBounds(nx, ny) || isWater(state.terrain[idx(nx, ny)]) || state.bIndex[idx(nx, ny)] >= 0) continue;
            a.path = [idx(nx, ny)];
            break;
          }
          if (a.path.length === 0) { a.timer = 40; break; }
          if (!bound && rng.chance(0.3)) { const f = state.founding; const nx = Math.floor(a.x + Math.sign(f.x - a.x) * 4); const ny = Math.floor(a.y + Math.sign(f.y - a.y) * 4); if (inBounds(nx, ny) && !isWater(state.terrain[idx(nx, ny)])) a.path = [idx(nx, ny)]; }
        }
        const tx = (a.path[0] % MAP_W) + 0.5;
        const ty = ((a.path[0] / MAP_W) | 0) + 0.5;
        const dx = tx - a.x;
        const dy = ty - a.y;
        const dist = Math.hypot(dx, dy);
        const sp = a.speed * dt;
        if (dist <= sp) { a.x = tx; a.y = ty; a.path = []; a.timer = 30 + rng.int(60); }
        else { a.x += (dx / dist) * sp; a.y += (dy / dist) * sp; a.dir = dx > 0 ? 0 : 2; }
        break;
      }
      case 'skyray': {
        // phase 0: cross the map high up; a lit Ley Beacon within 30 tiles lures the school (phase 1) to circle it
        const bc = beacon(state);
        const season = seasonOf(state);
        if (a.phase === 1) {
          // the school circles the lure that sang to it (a Beacon or a Rayscale Mirror); rays from older saves keep the first lit one
          const lure = ((a.anchorId ?? -1) >= 0 ? state.buildings.find((b) => b && b.id === a.anchorId && b.state === 'ok' && b.lit) : bc) ?? null;
          if (!lure || (season !== 1 && season !== 2)) { a.phase = 0; a.anchorId = -1; a.path = [idx(a.x < MAP_W / 2 ? 2 : MAP_W - 3, Math.max(2, Math.min(MAP_H - 3, Math.floor(a.y))))]; break; }
          const ph = a.id * 1.3;
          const r = 6 + (a.variant % 3) * 1.5;
          const tx = lure.x + 0.5 + Math.cos(t * 0.35 + ph) * r * 1.4;
          const ty = lure.y + 0.5 + Math.sin(t * 0.35 + ph) * r * 0.8;
          a.x += (tx - a.x) * 0.04;
          a.y += (ty - a.y) * 0.04;
          a.dir = tx > a.x ? 0 : 2;
          a.alt = 50 + Math.sin(t * 0.8 + ph) * 6;
          break;
        }
        if (bc && Math.hypot(bc.x - a.x, bc.y - a.y) <= (aspectAt(state, bc.x, bc.y) === 'sky' ? 45 : 30)) {
          a.phase = 1;
          a.anchorId = bc.id;
          if (a.variant === 0) effects.push({ x: bc.x, y: bc.y, kind: 'song', tick: state.tick });
          if (a.variant === 0) pushMessage(state, bc.kind === 'raymirror' ? `The skyrays turn on the Rayscale Mirror's light at (${bc.x},${bc.y}) and begin to circle. They will stay the season and shed glim-dust over it.` : `The skyrays turn on the Ley Beacon's song at (${bc.x},${bc.y}) and begin to circle. They will stay the season.`, 'good', true, { x: bc.x, y: bc.y });
          break;
        }
        if (a.path.length === 0) { a.timer = -1; break; }
        const tx = (a.path[0] % MAP_W) + 0.5;
        const ty = ((a.path[0] / MAP_W) | 0) + 0.5;
        const dx = tx - a.x;
        const dy = ty - a.y;
        const dist = Math.hypot(dx, dy);
        const sp = a.speed * dt;
        a.alt = 60 + Math.sin(t * 0.7 + a.id) * 5;
        if (dist <= sp) { a.path = []; a.timer = -1; }
        else { a.x += (dx / dist) * sp + Math.sin(t * 0.5 + a.id) * 0.01; a.y += (dy / dist) * sp; a.dir = dx > 0 ? 0 : 2; }
        break;
      }
      case 'tiger': {
        // stalks the nearest hearth by night, unafraid of light; lies up in the forest by day
        if (a.timer > 0) { a.timer--; break; }
        if (a.path.length === 0 || rng.chance(0.01)) {
          let best = -1;
          let bd = 30;
          if (isNight(state)) {
            for (let s2 = 0; s2 < state.buildings.length; s2++) {
              const b = state.buildings[s2];
              if (!b || b.state !== 'ok' || BUILDING_BY_KEY[b.kind].zone !== Zone.Hearth || b.residents <= 0) continue;
              const d = Math.hypot(b.x - a.x, b.y - a.y);
              if (d < bd && state.coverage.watch[idx(b.x, b.y)] < 160) { bd = d; best = s2; }
            }
          }
          if (best >= 0) a.path = [idx(state.buildings[best]!.x + 1, state.buildings[best]!.y)];
          else {
            for (let k = 0; k < 6; k++) {
              const nx = Math.floor(ax + (rng.next() - 0.5) * 12);
              const ny = Math.floor(ay + (rng.next() - 0.5) * 12);
              if (inBounds(nx, ny) && state.terrain[idx(nx, ny)] === Terrain.Forest) { a.path = [idx(nx, ny)]; break; }
            }
          }
          if (a.path.length === 0) { a.timer = 40; break; }
        }
        const tx = (a.path[0] % MAP_W) + 0.5;
        const ty = ((a.path[0] / MAP_W) | 0) + 0.5;
        const dx = tx - a.x;
        const dy = ty - a.y;
        const dist = Math.hypot(dx, dy);
        const sp = a.speed * dt;
        if (dist <= sp) { a.x = tx; a.y = ty; a.path = []; a.timer = 80 + rng.int(120); }
        else if (!isWater(state.terrain[idx(Math.floor(a.x + (dx / dist) * sp), Math.floor(a.y + (dy / dist) * sp))])) { a.x += (dx / dist) * sp; a.y += (dy / dist) * sp; a.dir = dx > 0 ? 0 : 2; }
        else { a.path = []; a.timer = 20; }
        break;
      }
      case 'rider': {
        // fly straight to the nearest restless or burning building within range of the mews; lay it down, or douse it
        if (a.timer > 0) { a.timer--; a.alt = Math.max(0, (a.alt ?? 0) - 2); break; }
        if (a.path.length === 0 && a.targetId < 0) {
          let best = -1;
          let bd = RIDER_RANGE;
          let bx = 0;
          let by = 0;
          let kind = 0;
          for (const o of state.agents) {
            if (o.kind !== AgentKind.Restless) continue;
            const d = Math.hypot(o.x - ax, o.y - ay);
            if (d < bd) { bd = d; best = o.id; bx = o.x; by = o.y; kind = 1; }
          }
          for (const b of state.buildings) {
            if (!b || b.state !== 'burning') continue;
            const d = Math.hypot(b.x - ax, b.y - ay);
            if (d < bd) { bd = d; best = b.id; bx = b.x + 0.5; by = b.y + 0.5; kind = 2; }
          }
          if (best < 0) { a.timer = 40; break; }
          a.targetId = best;
          a.load = kind;
          a.path = [idx(Math.floor(bx), Math.floor(by))];
        } else if (a.path.length === 0) {
          // going home
          a.path = [idx(Math.floor(ax), Math.floor(ay))];
          a.load = 0;
        }
        const tx = (a.path[0] % MAP_W) + 0.5;
        const ty = ((a.path[0] / MAP_W) | 0) + 0.5;
        const dx = tx - a.x;
        const dy = ty - a.y;
        const dist = Math.hypot(dx, dy);
        const sp = a.speed * dt;
        a.alt = dist > 2 ? Math.min(24, (a.alt ?? 0) + 3) : Math.max(0, (a.alt ?? 0) - 3);
        if (dist <= sp) {
          a.x = tx; a.y = ty; a.path = [];
          if (a.load === 1) {
            const n = state.agents.length;
            state.agents = state.agents.filter((o) => o.id !== a.targetId);
            if (state.agents.length < n) { state.stats.restlessLaid++; state.stats.riderRescues++; }
          } else if (a.load === 2) {
            const b = state.buildings.find((o) => o && o.id === a.targetId);
            if (b && b.state === 'burning' && rng.chance(0.6)) { b.state = 'ok'; b.stateDays = 0; markDirty(state, b.x, b.y); state.stats.riderRescues++; }
          }
          if (a.load > 0) { a.load = 0; a.targetId = -1; a.path = [idx(Math.floor(ax), Math.floor(ay))]; }
          else { a.targetId = -1; a.timer = 60 + rng.int(60); }
        } else { a.x += (dx / dist) * sp; a.y += (dy / dist) * sp; a.dir = dx > 0 ? 0 : 2; }
        break;
      }
      case 'airship': {
        // phase 0: leaving to the map edge (climbing); phase 1: returning to the dock (descending near it)
        if (a.path.length === 0) { a.timer = -1; break; }
        const tx = (a.path[0] % MAP_W) + 0.5;
        const ty = ((a.path[0] / MAP_W) | 0) + 0.5;
        const dx = tx - a.x;
        const dy = ty - a.y;
        const dist = Math.hypot(dx, dy);
        const sp = a.speed * dt;
        a.alt = a.phase === 0 ? Math.min(70, (a.alt ?? 0) + 0.6) : dist < 12 ? Math.max(10, (a.alt ?? 70) - 0.6) : 70;
        if (dist <= sp) {
          a.x = tx; a.y = ty; a.path = []; a.timer = -1;
          if (a.phase === 1) airshipArrives(state);
        } else { a.x += (dx / dist) * sp; a.y += (dy / dist) * sp; a.dir = dx > 0 ? 0 : 2; }
        break;
      }
      case 'thrumhare': {
        if (a.timer > 0) {
          a.timer--;
          // flee any non-creature agent within 2 tiles
          break;
        }
        if (a.path.length === 0) {
          // pick a nearby meadow/grass tile to hop to
          for (let k = 0; k < 5; k++) {
            const nx = Math.floor(ax) + rng.int(7) - 3;
            const ny = Math.floor(ay) + rng.int(7) - 3;
            if (!inBounds(nx, ny)) continue;
            const i = idx(nx, ny);
            const tt = state.terrain[i];
            if ((tt === Terrain.Meadow || tt === Terrain.Grass) && state.bIndex[i] < 0 && !state.road[i] && !state.gloam[i]) {
              a.path = [i];
              a.pathIdx = 0;
              break;
            }
          }
          if (a.path.length === 0) a.timer = 30;
          break;
        }
        const ti = a.path[0];
        const tx = (ti % MAP_W) + 0.5;
        const ty = ((ti / MAP_W) | 0) + 0.5;
        const dx = tx - a.x;
        const dy = ty - a.y;
        const d = Math.hypot(dx, dy);
        const sp = a.speed * dt;
        if (d <= sp) {
          a.x = tx;
          a.y = ty;
          a.path = [];
          a.timer = 20 + rng.int(60);
        } else {
          a.x += (dx / d) * sp;
          a.y += (dy / d) * sp;
          a.dir = dx > 0 ? 0 : 2;
        }
        break;
      }
      case 'hound': {
        if (a.timer > 0) {
          a.timer--;
          break;
        }
        const hx = Math.floor(a.x);
        const hy = Math.floor(a.y);
        const hi = idx(hx, hy);
        // light and wards hurt: flee toward the anchor (its gloam tile)
        const scared = state.coverage.ward[hi] > 0 || state.lit[hi] === 1 || state.coverage.watch[hi] > 90 || auraAt(state, 'fen', a.x, a.y);
        let tx: number;
        let ty: number;
        if (scared) {
          tx = ax;
          ty = ay;
          a.timer = 10;
        } else {
          // stalk the nearest unlit, unwarded building
          if (a.path.length === 0 || rng.chance(0.02)) {
            let best = -1;
            let bd = 26;
            for (let s2 = 0; s2 < state.buildings.length; s2++) {
              const b = state.buildings[s2];
              if (!b || b.state !== 'ok') continue;
              const d = Math.hypot(b.x - a.x, b.y - a.y);
              if (d >= bd) continue;
              const bi = idx(b.x, b.y);
              if (state.coverage.ward[bi] > 0 || (b.lit && state.coverage.watch[bi] > 60)) continue;
              bd = d;
              best = s2;
            }
            a.path = best >= 0 ? [idx(state.buildings[best]!.x, state.buildings[best]!.y)] : [];
            a.targetId = best >= 0 ? state.buildings[best]!.id : -1;
          }
          if (a.path.length === 0) {
            tx = ax + (rng.next() - 0.5) * 6;
            ty = ay + (rng.next() - 0.5) * 6;
          } else {
            tx = (a.path[0] % MAP_W) + 0.5;
            ty = ((a.path[0] / MAP_W) | 0) + 0.5;
          }
        }
        const dx = tx - a.x;
        const dy = ty - a.y;
        const d = Math.hypot(dx, dy);
        const sp = a.speed * dt;
        if (d > 1.2) {
          const nx = a.x + (dx / d) * sp;
          const ny = a.y + (dy / d) * sp;
          const ni = idx(Math.floor(nx), Math.floor(ny));
          // walls and water stop them; slide along instead
          if (inBounds(Math.floor(nx), Math.floor(ny)) && !state.wall[ni] && !isWater(state.terrain[ni]) && state.bIndex[ni] < 0) {
            a.x = nx;
            a.y = ny;
          } else if (inBounds(Math.floor(nx), hy) && !state.wall[idx(Math.floor(nx), hy)] && !isWater(state.terrain[idx(Math.floor(nx), hy)]) && state.bIndex[idx(Math.floor(nx), hy)] < 0) {
            a.x = nx;
          } else if (inBounds(hx, Math.floor(ny)) && !state.wall[idx(hx, Math.floor(ny))] && !isWater(state.terrain[idx(hx, Math.floor(ny))]) && state.bIndex[idx(hx, Math.floor(ny))] < 0) {
            a.y = ny;
          } else a.timer = 15;
          a.dir = dx > 0 ? 0 : 2;
        } else if (!scared && a.targetId >= 0) {
          // at the building: harass (rarely, real damage); in the Hush a home counts the night, and three drive its folk out (iteration 70)
          a.timer = 40 + rng.int(40);
          { const tb = state.buildings.find((o) => o && o.id === a.targetId); if (tb) houndAtDoor(state, tb); }
          if (rng.chance(0.01)) {
            const b = state.buildings.find((o) => o && o.id === a.targetId);
            if (b && b.state === 'ok' && BUILDING_BY_KEY[b.kind].category === 'zone' && b.level === 1) {
              b.state = 'ruin';
              b.stateDays = 0;
              b.residents = 0;
              b.workers = 0;
              markDirty(state, b.x, b.y);
              state.stats.houndRaids++;
              illTiding(state);
              pushMessage(state, `Gloam-hounds tore through the ${BUILDING_BY_KEY[b.kind].name.split(' ')[0].toLowerCase()} at (${b.x},${b.y}).`, 'bad');
            }
          }
        }
        break;
      }
      case 'drake': {
        const d = state.dragons.find((x) => x.id === a.dragonId);
        if (!d) break;
        if (a.timer > 0) {
          a.timer--;
          break;
        }
        // home: the cradle; posts: a district (warden) or a mine (delver)
        let hx = ax;
        let hy = ay;
        if (d.role === 'delver') {
          const m = state.buildings.find((b) => b && b.id === d.roleTarget);
          if (m) {
            hx = m.x + m.w + 0.5;
            hy = m.y + 0.5;
          }
        }
        if (a.path.length === 0) {
          if (d.role === 'warden' && d.roleTarget > 0) {
            const tiles = districtTiles(state, d.roleTarget);
            if (tiles.length) {
              let pick = -1;
              for (let k = 0; k < 8 && pick < 0; k++) {
                const i = tiles[rng.int(tiles.length)];
                if (state.bIndex[i] < 0 && !isWater(state.terrain[i]) && !state.wall[i]) pick = i;
              }
              if (pick >= 0) a.path = [pick];
            }
          } else {
            const nx = Math.floor(hx) + rng.int(5) - 2;
            const ny = Math.floor(hy) + rng.int(5) - 2;
            if (inBounds(nx, ny) && state.bIndex[idx(nx, ny)] < 0 && !isWater(state.terrain[idx(nx, ny)])) a.path = [idx(nx, ny)];
          }
          if (a.path.length === 0) a.timer = 30;
          break;
        }
        const ti = a.path[0];
        const tx = (ti % MAP_W) + 0.5;
        const ty = ((ti / MAP_W) | 0) + 0.5;
        const dx = tx - a.x;
        const dy = ty - a.y;
        const dist = Math.hypot(dx, dy);
        const sp = a.speed * dt;
        if (dist <= sp) {
          a.x = tx;
          a.y = ty;
          a.path = [];
          a.timer = 40 + rng.int(80);
        } else {
          a.x += (dx / dist) * sp;
          a.y += (dy / dist) * sp;
          a.dir = dx > 0 ? 0 : 2;
        }
        break;
      }
      case 'wyrm': {
        // phase 1: out to the city; 2: circle it (timer); 3: home to the node
        const hostile = a.load > 0;
        const alt = a.alt ?? 0;
        const f = state.founding;
        if (a.phase === 1 && a.path.length === 0) a.path = [idx(f.x, f.y)];
        if (a.phase === 2) {
          if (a.timer <= 0) { a.phase = 3; a.path = [idx(Math.floor(ax), Math.floor(ay))]; }
          else {
            a.timer--;
            if (a.path.length === 0) {
              const nx = f.x + rng.int(41) - 20;
              const ny = f.y + rng.int(41) - 20;
              if (inBounds(nx, ny)) a.path = [idx(nx, ny)];
            }
          }
        }
        if (a.path.length === 0) break;
        const ti = a.path[0];
        const tx = (ti % MAP_W) + 0.5;
        const ty = ((ti / MAP_W) | 0) + 0.5;
        const dx = tx - a.x;
        const dy = ty - a.y;
        const dist = Math.hypot(dx, dy);
        const sp = a.speed * dt;
        a.alt = a.phase === 3 && dist < 6 ? Math.max(0, alt - 3) : Math.min(48, alt + 3);
        if (dist <= sp) {
          a.x = tx;
          a.y = ty;
          a.path = [];
          if (a.phase === 1 && a.load === 2) { razeStake(state); a.load = 1; a.phase = 2; a.timer = 260; } // the third refusal: the Stake (iteration 70)
          else if (a.phase === 1) { a.phase = 2; a.timer = hostile ? 260 : 200; }
          else if (a.phase === 3) {
            state.agents = state.agents.filter((o) => o !== a);
            endFlyover(state, hostile);
          }
        } else {
          a.x += (dx / dist) * sp;
          a.y += (dy / dist) * sp;
          a.dir = dx > 0 ? 0 : 2;
        }
        if (a.phase === 2) {
          // hostile: set the roofs beneath it alight; bound: scatter the moths
          if (hostile && state.wyrm.fires < flyoverFireCap(state) && state.tick % 12 === 0) {
            const bi = state.bIndex[idx(Math.floor(a.x), Math.floor(a.y))];
            const b = bi >= 0 ? state.buildings[bi] : null;
            if (b && b.state === 'ok' && BUILDING_BY_KEY[b.kind].category !== 'special' && rng.chance(0.5) && igniteBuilding(state, b, 'Wyrmfire at')) state.wyrm.fires++;
          }
          if (!hostile && state.tick % 10 === 0) state.agents = state.agents.filter((o) => !(o.kind === AgentKind.Creature && o.species === 'glimmoth' && Math.abs(o.x - a.x) < 6 && Math.abs(o.y - a.y) < 6));
        }
        break;
      }
      case 'wyvern': {
        if (a.dragonId === -1 && a.phase === 3) {
          // a refused dragon screams over its old cradle all day, then is gone
          a.timer--;
          const ph = a.id * 0.7;
          const tx = ax + Math.cos(t * 0.5 + ph) * 6;
          const ty = ay + Math.sin(t * 0.5 + ph) * 3.5;
          a.x += (tx - a.x) * 0.03;
          a.y += (ty - a.y) * 0.03;
          a.dir = tx > a.x ? 0 : 2;
          a.alt = 30 + Math.sin(t * 0.9 + ph) * 4;
          break;
        }
        const d = state.dragons.find((x) => x.id === a.dragonId);
        if (!d) break;
        const alt = a.alt ?? 0;
        if (a.timer > 0) {
          a.timer--;
          a.alt = Math.max(0, alt - 2);
          break;
        }
        if (a.path.length === 0) {
          // choose where to fly
          if (d.role === 'courier' && a.phase !== 2) {
            const job = courierJob(state);
            if (job) {
              a.homeId = job.from.id;
              a.targetId = job.to.id;
              a.load = 0;
              a.phase = 1;
              a.path = [idx(job.from.x, job.from.y)];
            } else {
              a.timer = 100;
              break;
            }
          } else if (a.phase === 2) {
            const to = state.buildings.find((b) => b && b.id === a.targetId);
            if (to) a.path = [idx(to.x, to.y)];
            else { a.phase = 0; a.load = 0; a.timer = 50; break; }
          } else {
            // circle the cradle
            const nx = Math.floor(ax) + rng.int(9) - 4;
            const ny = Math.floor(ay) + rng.int(9) - 4;
            if (inBounds(nx, ny)) a.path = [idx(nx, ny)];
            else a.timer = 30;
            break;
          }
        }
        const ti = a.path[0];
        const tx = (ti % MAP_W) + 0.5;
        const ty = ((ti / MAP_W) | 0) + 0.5;
        const dx = tx - a.x;
        const dy = ty - a.y;
        const dist = Math.hypot(dx, dy);
        const sp = a.speed * dt * (auraAt(state, 'sky', a.x, a.y) ? 1.25 : 1); // a Sky dragon's aura speeds every flyer in it
        a.alt = dist > 3 ? Math.min(36, alt + 3) : Math.max(0, alt - 3);
        if (dist <= sp) {
          a.x = tx;
          a.y = ty;
          a.path = [];
          if (a.phase === 1) {
            const from = state.buildings.find((b) => b && b.id === a.homeId);
            if (from) {
              a.load = Math.min(d.line === 'sky' ? 40 : 30, from.stock);
              from.stock -= a.load;
            }
            a.phase = 2;
            a.timer = 20;
          } else if (a.phase === 2) {
            const to = state.buildings.find((b) => b && b.id === a.targetId);
            if (to) {
              const cap = BUILDING_BY_KEY[to.kind].zone === Zone.Market ? marketStockCap(to) : 20 * to.level;
              const put = Math.max(0, Math.min(a.load, cap - to.stock));
              to.stock += put;
              if (BUILDING_BY_KEY[to.kind].zone === Zone.Market) state.goodsSold += put;
              state.stats.goodsDelivered += put;
              state.stats.courierTrips++;
              const from = state.buildings.find((b) => b && b.id === a.homeId);
              if (from && a.load > put) from.stock += a.load - put; // the rest goes back on the works' shelf
              d.lastTrip = { fx: from ? from.x : to.x, fy: from ? from.y : to.y, tx: to.x, ty: to.y, goods: Math.round(put), day: state.day }; // shown in the Wyrms panel (iteration 53)
            }
            a.load = 0;
            a.phase = 0;
            a.timer = 60;
          } else a.timer = 60 + rng.int(120);
        } else {
          a.x += (dx / dist) * sp;
          a.y += (dy / dist) * sp;
          a.dir = dx > 0 ? 0 : 2;
        }
        break;
      }
      case 'wisp': {
        // drift around the anchor; follow restless if anchored to one
        let cx = ax;
        let cy = ay;
        if (a.anchorId !== undefined && a.anchorId >= 0) {
          const r = state.agents.find((o) => o.id === a.anchorId && o.kind === AgentKind.Restless);
          if (r) {
            cx = r.x;
            cy = r.y;
          }
        }
        const ph = a.id * 1.3;
        const tx = cx + Math.cos(t * 0.5 + ph) * 1.5;
        const ty = cy + Math.sin(t * 0.7 + ph) * 0.9;
        a.x += (tx - a.x) * 0.04;
        a.y += (ty - a.y) * 0.04;
        break;
      }
    }
    // keep on the map and off deep water
    if (a.x < 0.5) a.x = 0.5;
    if (a.y < 0.5) a.y = 0.5;
    if (a.x > MAP_W - 0.5) a.x = MAP_W - 0.5;
    if (a.y > MAP_H - 0.5) a.y = MAP_H - 0.5;
  }
  commitRng(state, rng);
}

/** Moth-Loft bonus for a craft building: 4 % per glimmoth that swarmed a lit loft within 8 tiles last night (a loft's `stock`), up to 20 %. */
export function mothBonus(state: GameState, b: Building): number {
  let bonus = 0;
  forEachBuilding(state, (o) => {
    if (o.kind !== 'mothloft' || !o.lit || o.state !== 'ok') return;
    if (Math.hypot(o.x - b.x, o.y - b.y) <= 8) bonus = Math.max(bonus, Math.min(0.2, 0.04 * o.stock));
  });
  return bonus;
}

export function isCreatureWater(state: GameState, x: number, y: number): boolean {
  return inBounds(Math.floor(x), Math.floor(y)) && isWater(state.terrain[idx(Math.floor(x), Math.floor(y))]);
}

/** Daily: Hunters' Lodges kill hounds within 12; strong Watch coverage drives them off. */
export function dailyHunt(state: GameState): number {
  const rng = rngOf(state);
  const lodges: Building[] = [];
  forEachBuilding(state, (b) => {
    if (b.kind === 'hunterslodge' && b.state === 'ok') lodges.push(b);
  });
  let killed = 0;
  state.agents = state.agents.filter((a) => {
    if (a.kind !== AgentKind.Creature || a.species !== 'hound') return true;
    const bounty = edictOn(state, 'bounty');
    for (const l of lodges) if (Math.hypot(l.x + 0.5 - a.x, l.y + 0.5 - a.y) <= (bounty ? 2 * HOUND_REACH : HOUND_REACH) && rng.chance(houndChance(state, l))) { killed++; l.stock += 1; state.stats.pelts++; return false; } // a pelt (a hide) for the Gloam road; half the chance while the hunters are out after game (iteration 58)
    const i = idx(Math.max(0, Math.min(MAP_W - 1, Math.floor(a.x))), Math.max(0, Math.min(MAP_H - 1, Math.floor(a.y))));
    if (state.coverage.watch[i] > 120 && rng.chance(bounty ? 0.6 : 0.3)) { killed++; return false; }
    return true;
  });
  commitRng(state, rng);
  state.stats.houndsKilled += killed;
  if (killed > 0 && lodges.length && rng.chance(0.5)) pushMessage(state, `The hunters bring back ${killed} hound pelt${killed > 1 ? 's' : ''}. Another notch on the lodge door.`, 'good');
  return killed;
}
