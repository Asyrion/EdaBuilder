/**
 * Creatures: free-moving fauna that reuse the agent structure. Glimmoths swarm lit ley at
 * night, thrumhares graze meadows by day, wisps drift over boneyards and the restless.
 * They are ambient life with small mechanical hooks (glim-dust for Moth-Lofts, wisps as
 * the early warning for restless dead).
 */
import { BUILDING_BY_KEY } from './catalog';
import { AgentKind, MAP_H, MAP_W, TICKS_PER_SEC, Terrain, idx, inBounds, isWater, type Agent, type Building, type GameState, type Species } from './types';
import { commitRng, forEachBuilding, markDirty, pushMessage, rngOf, seasonOf, timeOfDay } from './world';

const CAP: Record<Species, number> = { glimmoth: 90, thrumhare: 60, wisp: 40, hound: 30, drake: 20, wyvern: 20 };
import { courierJob, districtTiles, lineIndex } from './wyrmcraft';

export function creatureCount(state: GameState, species?: Species): number {
  let n = 0;
  for (const a of state.agents) if (a.kind === AgentKind.Creature && (!species || a.species === species)) n++;
  return n;
}

export function isNight(state: GameState): boolean {
  const t = timeOfDay(state);
  return t < 0.24 || t > 0.78;
}

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
  forEachBuilding(state, (b) => {
    if (b.lit && b.state === 'ok' && (b.kind === 'spire' || b.kind === 'nexus' || b.kind === 'wardlantern' || b.kind === 'mothloft')) out.push({ x: b.x, y: b.y, id: b.id });
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
  if (night && state.stats.gloamTiles > 0 && state.day >= 6) {
    const hush = seasonOf(state) === 3;
    const packs = Math.min(CAP.hound, Math.floor((state.population / 250 + 1) * (hush ? 2.2 : 1) * 3));
    if (hounds < packs && rng.chance(hush ? 0.35 : 0.15)) {
      // spawn a pack on a gloam tile within 22 tiles of a random building
      const spots: number[] = [];
      const blds = state.buildings.filter((b) => b && b.state === 'ok' && state.gloamDist[idx(b.x, b.y)] <= 14) as Building[];
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
    a.speed = want === 'wyvern' ? 4.5 : d.stage >= 2 ? 1.1 : 0.7;
    a.alt = 0;
    a.phase = 0;
  }
  // ---- despawn: moths by day, hares at night, surplus wisps
  const keepWisps = want;
  let wispSeen = 0;
  state.agents = state.agents.filter((a) => {
    if (a.kind !== AgentKind.Creature) return true;
    if (a.species === 'glimmoth' && !night) return rng.chance(0.6);
    if (a.species === 'thrumhare' && night) return rng.chance(0.6);
    if (a.species === 'hound' && !night) return rng.chance(0.3); // slink back into the grey at dawn
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
  for (const a of state.agents) {
    if (a.kind !== AgentKind.Creature) continue;
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
        const scared = state.coverage.ward[hi] > 0 || state.lit[hi] === 1 || state.coverage.watch[hi] > 90;
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
          // at the building: harass (rarely, real damage)
          a.timer = 40 + rng.int(40);
          if (rng.chance(0.01)) {
            const b = state.buildings.find((o) => o && o.id === a.targetId);
            if (b && b.state === 'ok' && BUILDING_BY_KEY[b.kind].category === 'zone' && b.level === 1) {
              b.state = 'ruin';
              b.stateDays = 0;
              b.residents = 0;
              b.workers = 0;
              markDirty(state, b.x, b.y);
              state.stats.houndRaids++;
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
      case 'wyvern': {
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
        const sp = a.speed * dt;
        a.alt = dist > 3 ? Math.min(36, alt + 3) : Math.max(0, alt - 3);
        if (dist <= sp) {
          a.x = tx;
          a.y = ty;
          a.path = [];
          if (a.phase === 1) {
            const from = state.buildings.find((b) => b && b.id === a.homeId);
            if (from) {
              a.load = Math.min(30, from.stock);
              from.stock -= a.load;
            }
            a.phase = 2;
            a.timer = 20;
          } else if (a.phase === 2) {
            const to = state.buildings.find((b) => b && b.id === a.targetId);
            if (to) {
              to.stock = Math.min(20 * to.level, to.stock + a.load);
              state.goodsSold += a.load;
              state.stats.goodsDelivered += a.load;
              state.stats.courierTrips++;
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

/** Moth-Loft bonus for a craft building: +20% if a lit loft with moths is within 8 tiles. */
export function mothBonus(state: GameState, b: Building): number {
  let bonus = 0;
  forEachBuilding(state, (o) => {
    if (o.kind !== 'mothloft' || !o.lit || o.state !== 'ok') return;
    if (Math.hypot(o.x - b.x, o.y - b.y) <= 8) bonus = 0.2;
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
    for (const l of lodges) if (Math.hypot(l.x + 0.5 - a.x, l.y + 0.5 - a.y) <= 12 && rng.chance(0.8)) { killed++; return false; }
    const i = idx(Math.max(0, Math.min(MAP_W - 1, Math.floor(a.x))), Math.max(0, Math.min(MAP_H - 1, Math.floor(a.y))));
    if (state.coverage.watch[i] > 120 && rng.chance(0.3)) { killed++; return false; }
    return true;
  });
  commitRng(state, rng);
  state.stats.houndsKilled += killed;
  if (killed > 0 && lodges.length && rng.chance(0.5)) pushMessage(state, `The hunters bring back ${killed} hound pelt${killed > 1 ? 's' : ''}. Another notch on the lodge door.`, 'good');
  return killed;
}
