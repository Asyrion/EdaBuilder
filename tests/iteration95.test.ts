/** Iteration 95 (M17 part 3, DESIGN §4.126): the Patagoi Atoll. A ring of six isles in open water: the great isle with the
 *  founding node, three near isles over shallow bars, two far isles behind deep water; a goal of Burgh with four isles settled;
 *  sea-gales in the Hush that close the plain bridges; and the valley's terrain untouched. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateTerrain } from '../src/sim/terrain';
import { atollIsles } from '../src/sim/atoll';
import { createGame } from '../src/sim/world';
import { SCENARIOS, createScenario } from '../src/sim/scenario';
import { ATOLL_ISLES, SETTLED_BUILDINGS, isleBuildings, isleMap, settledIsles } from '../src/sim/isles';
import { GALE_DAYS, GALE_HOLD, galeIn, galeOn, galeStarts, galeToday } from '../src/sim/gales';
import { dailyFords, fordClosed } from '../src/sim/water';
import { QUESTS, questStatus } from '../src/data/quests';
import { checkQuests } from '../src/sim/quests';
import { Bot } from '../src/sim/bot';
import { run } from '../src/sim/sim';
import { forecast } from '../src/sim/forecast';
import { serialize, deserialize } from '../src/sim/save';
import { SECTORS_X, SECTORS_Y, initialSectors, sectorOf } from '../src/sim/sectors';
import { CommandRunner, stateFromHeader, verifyReplay, type ReplayHeader } from '../src/sim/commands';
import { tick } from '../src/sim/sim';
import { MAP_H, MAP_W, RoadType, TICKS_PER_DAY, Terrain, idx, isWater, type Building, type GameState } from '../src/sim/types';
import type { FactionId } from '../src/data/factions';

const PEOPLES: FactionId[] = ['vellish', 'grimmen', 'veshari', 'tallowkin', 'fennex'];
const Q = (id: string) => QUESTS.find((q) => q.id === id)!;
const fnv = (a: ArrayLike<number>, h = 0x811c9dc5) => { for (let i = 0; i < a.length; i++) h = Math.imul(h ^ a[i], 16777619) >>> 0; return h; };

describe('The valley is untouched', () => {
  it('every valley terrain option gives the map it gave before the Atoll (hashes taken on iteration 94\'s tree)', () => {
    const want: Record<string, string> = { '42:plain': '8f6ef4', '42:island': '170d22bd', '42:one': 'fcd6dc30', '42:under': '96701308', '42:river': '8f6ef4', '42:twin': '285fdd11', '7:plain': 'fb9d04b9', '7:island': 'c2be27ac', '7:one': '88c7d9f8', '7:under': '18d9ec4b', '7:river': '11c20562', '7:twin': 'a82bb26c' };
    for (const seed of [42, 7]) for (const [k, o] of Object.entries({ plain: {}, island: { island: true }, one: { nodes: 1 }, under: { underhill: true }, river: { riverside: true }, twin: { twinnode: true } })) {
      const t = generateTerrain(seed, o);
      let h = fnv(t.terrain); h = fnv(t.gloam, h); h = fnv(t.nodes.flatMap((n) => [n.x, n.y]), h); h = fnv([t.founding.x, t.founding.y], h);
      expect(h.toString(16), `${seed}:${k}`).toBe(want[`${seed}:${k}`]);
    }
  });
});

describe('The Atoll\'s map', () => {
  /** Tiles reachable from a start over land and shoal (Water), never deep water. */
  function shoalReach(s: GameState, start: number): Set<number> {
    const seen = new Set<number>([start]);
    const stack = [start];
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % MAP_W, y = (i / MAP_W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
        const j = idx(nx, ny);
        if (seen.has(j) || s.terrain[j] === Terrain.DeepWater) continue;
        seen.add(j);
        stack.push(j);
      }
    }
    return seen;
  }

  it('has six isles with the founding node on the great one, a node on each, and Gloam on the far two only, for every people', () => {
    for (const people of PEOPLES) for (const seed of [42, 7, 99]) {
      const s = createScenario(seed, 'Atoll', 'atoll', people);
      const m = isleMap(s.terrain);
      expect(m.size.length, `${people} ${seed}`).toBe(6);
      expect(m.of[idx(s.founding.x, s.founding.y)], `${people} ${seed} founding`).toBe(0); // the biggest isle
      expect(m.size[0]).toBeGreaterThan(300);
      const withNode = new Set(s.nodes.map((n) => m.of[idx(n.x, n.y)]));
      for (let k = 0; k < 6; k++) expect(withNode.has(k), `${people} ${seed} node on isle ${k}`).toBe(true);
      const kinds = atollIsles(seed);
      for (let i = 0; i < s.gloam.length; i++) {
        if (!s.gloam[i]) continue;
        const x = i % MAP_W, y = (i / MAP_W) | 0;
        const near = kinds.reduce((best, isle, k) => (Math.hypot(x - isle.x, y - isle.y) < Math.hypot(x - kinds[best].x, y - kinds[best].y) ? k : best), 0);
        expect(kinds[near].kind, `${people} ${seed} gloam at ${x},${y}`).toBe('far');
        expect(isWater(s.terrain[i])).toBe(false);
      }
      expect(s.gloam.reduce((n, v) => n + v, 0)).toBeGreaterThan(20);
    }
  });

  it('joins the near isles to the great one over shoal alone, and leaves the far two behind deep water', () => {
    for (const seed of [42, 7, 99]) {
      const s = createScenario(seed, 'Atoll', 'atoll', 'vellish');
      const reach = shoalReach(s, idx(s.founding.x, s.founding.y));
      const isles = atollIsles(seed);
      for (const isle of isles) {
        const has = (() => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (reach.has(idx(isle.x + dx, isle.y + dy))) return true; return false; })();
        expect(has, `seed ${seed} ${isle.kind} isle at ${isle.x},${isle.y}`).toBe(isle.kind !== 'far');
      }
    }
  });

  it('is deterministic by seed, differs between seeds, and every isle can be chartered by buying sectors that touch the Charter', () => {
    const a = createScenario(42, 'A', 'atoll', 'vellish'), b = createScenario(42, 'B', 'atoll', 'vellish'), c = createScenario(43, 'C', 'atoll', 'vellish');
    expect(fnv(a.terrain)).toBe(fnv(b.terrain));
    expect(fnv(a.terrain)).not.toBe(fnv(c.terrain));
    const have = new Set<number>();
    const init = initialSectors(a.founding);
    init.forEach((v, k) => v && have.add(k));
    const m = isleMap(a.terrain);
    const wanted = new Set<number>();
    for (let i = 0; i < m.of.length; i++) if (m.of[i] >= 0) wanted.add(sectorOf(i % MAP_W, (i / MAP_W) | 0));
    for (let round = 0; round < 16; round++)
      for (const k of wanted) {
        if (have.has(k)) continue;
        const sx = k % SECTORS_X, sy = Math.floor(k / SECTORS_X);
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => sx + dx >= 0 && sy + dy >= 0 && sx + dx < SECTORS_X && sy + dy < SECTORS_Y && have.has((sy + dy) * SECTORS_X + sx + dx))) have.add(k);
      }
    for (const k of wanted) expect(have.has(k), `sector ${k}`).toBe(true);
  });

  it('is on the title screen, between the Gloam island and the inherited collapse, with a goal', () => {
    expect(SCENARIOS.map((x) => x.id)).toEqual(['valley', 'onenode', 'island', 'atoll', 'inherited']);
    const def = SCENARIOS.find((x) => x.id === 'atoll')!;
    expect(def.name).toBe('The Patagoi Atoll');
    expect(def.goal).toMatch(/Burgh/);
    expect(createScenario(42, 'A', 'atoll').messages.some((m) => /Six isles/.test(m.text))).toBe(true);
  });
});

/** Stand-in zone buildings: `n` standing hearths on land of isle `k`. */
function settle(s: GameState, k: number, n: number): void {
  const m = isleMap(s.terrain);
  let placed = 0;
  for (let i = 0; i < m.of.length && placed < n; i++) {
    if (m.of[i] !== k || s.terrain[i] === Terrain.LeyNode) continue;
    s.buildings.push({ id: 8000 + s.buildings.length, kind: 'hearth', x: i % MAP_W, y: (i / MAP_W) | 0, w: 1, h: 1, state: 'ok', level: 1, lit: true } as unknown as Building);
    placed++;
  }
}

describe('The Atoll\'s goal', () => {
  it('is Burgh with four isles each holding six standing zone buildings, and pays only in the Atoll', () => {
    const s = createScenario(42, 'Goal', 'atoll', 'vellish');
    expect(Q('z_atoll').when(s)).toBe(true);
    expect(Q('z_atoll').strict).toBe(true);
    s.milestone = 6;
    for (const k of [0, 1, 2]) settle(s, k, SETTLED_BUILDINGS);
    settle(s, 3, SETTLED_BUILDINGS - 1); // one short
    expect(settledIsles(s)).toBe(3);
    expect(Q('z_atoll').done(s)).toBe(false);
    expect(questStatus(s, Q('z_atoll'))).toMatch(/3 of 4 isles settled/);
    settle(s, 3, 1);
    expect(settledIsles(s)).toBe(ATOLL_ISLES);
    s.milestone = 5;
    expect(Q('z_atoll').done(s)).toBe(false); // Burgh first
    s.milestone = 6;
    const crowns = s.treasury;
    checkQuests(s);
    expect(s.questsDone).toContain('z_atoll');
    expect(s.treasury).toBeGreaterThanOrEqual(crowns + 5000); // the goal's reward, and whatever milestone tasks paid with it
    const valley = createGame(42, 'V');
    expect(Q('z_atoll').when(valley)).toBe(false);
    valley.milestone = 6;
    checkQuests(valley);
    expect(valley.questsDone).not.toContain('z_atoll');
  });

  it('counts only standing zone buildings, on land, by isle', () => {
    const s = createScenario(42, 'Count', 'atoll', 'vellish');
    settle(s, 1, 4);
    (s.buildings[s.buildings.length - 1] as Building).state = 'building';
    (s.buildings[s.buildings.length - 2] as Building).state = 'ruin';
    expect(isleBuildings(s)[1]).toBe(2);
  });
});

describe('Sea-gales in the Hush', () => {
  const HUSH = 90; // the first day of the first Hush
  /** A Water tile on a bar (a plain track over it is a bridge), found by scanning from the founding toward the first near isle. */
  function waterTile(s: GameState): number {
    const isle = atollIsles(s.seed)[1];
    const f = s.founding;
    for (let k = 1; k < 80; k++) {
      const x = Math.round(f.x + ((isle.x - f.x) * k) / 80), y = Math.round(f.y + ((isle.y - f.y) * k) / 80);
      if (s.terrain[idx(x, y)] === Terrain.Water) return idx(x, y);
    }
    throw new Error('no water on the bar');
  }

  it('two spells of two days each Hush, from a stream of their own: the same for a seed, different between seeds, none in the valley', () => {
    expect(galeStarts(42, 0)).toEqual(galeStarts(42, 0));
    expect(galeStarts(42, 0)[0]).toBeGreaterThanOrEqual(3);
    expect(galeStarts(42, 0)[1]).toBeGreaterThanOrEqual(16);
    expect(new Set([42, 43, 44, 45, 46].map((sd) => galeStarts(sd, 0).join())).size).toBeGreaterThan(1);
    const s = createScenario(42, 'Gale', 'atoll', 'vellish');
    let days = 0;
    for (let d = 0; d < 480; d++) if (galeOn(s, d)) { days++; expect(Math.floor(d / 30) % 4).toBe(3); }
    expect(days).toBe(4 * 2 * GALE_DAYS);
    const valley = createGame(42, 'V');
    for (let d = 0; d < 480; d++) expect(galeOn(valley, d)).toBe(false);
  });

  it('closes a plain track bridge on a gale day and leaves a cobbled one, and a Quay within six tiles holds the plain one', () => {
    const s = createScenario(42, 'Gale', 'atoll', 'vellish');
    const i = waterTile(s);
    const j = i + 1 < s.terrain.length && s.terrain[i + 1] === Terrain.Water ? i + 1 : i - 1;
    s.road[i] = RoadType.Track;
    s.road[j] = RoadType.Cobble;
    s.day = HUSH + galeStarts(42, 0)[0];
    expect(galeToday(s)).toBe(true);
    dailyFords(s);
    expect(fordClosed(s, i)).toBe(true);
    expect(fordClosed(s, j)).toBe(false);
    expect(s.stats.galeDays).toBeGreaterThan(0);
    s.buildings.push({ id: 8999, kind: 'quay', x: (i % MAP_W) + GALE_HOLD, y: (i / MAP_W) | 0, w: 1, h: 1, state: 'ok', level: 1, lit: true } as unknown as Building);
    dailyFords(s);
    expect(fordClosed(s, i)).toBe(false);
    s.buildings.pop();
    s.road[i] = RoadType.Track;
    dailyFords(s);
    expect(fordClosed(s, i)).toBe(true);
    s.road[i] = RoadType.Cobble; // cobbled in the middle of the gale: open at once, not at the next dawn
    expect(fordClosed(s, i)).toBe(false);
    s.road[i] = RoadType.Track;
    s.buildings.push({ id: 8999, kind: 'quay', x: (i % MAP_W) + GALE_HOLD, y: (i / MAP_W) | 0, w: 1, h: 1, state: 'ok', level: 1, lit: true } as unknown as Building);
    s.day = HUSH + galeStarts(42, 0)[0] + GALE_DAYS; // the gale has blown out
    s.buildings.pop();
    dailyFords(s);
    expect(fordClosed(s, i)).toBe(false);
  });

  it('stops the barges, shows on the Observatory\'s forecast a few days ahead, and can be forced by the dev panel in any charter', () => {
    const s = createScenario(42, 'Gale', 'atoll', 'vellish');
    const start = galeStarts(42, 0)[0];
    s.buildings.push({ id: 8998, kind: 'observatory', x: 0, y: 0, w: 1, h: 1, state: 'ok', level: 1, lit: true } as unknown as Building);
    s.day = HUSH + start - 2;
    expect(galeIn(s, 5)).toBe(2);
    expect(forecast(s).some((f) => /sea-gale in 2 days/.test(f.text))).toBe(true);
    s.day = HUSH + start;
    expect(forecast(s).some((f) => /A sea-gale blows/.test(f.text))).toBe(true);
    const valley = createGame(42, 'V');
    valley.day = HUSH + start;
    expect(galeToday(valley)).toBe(false);
    valley.modifiers.push({ kind: 'gale', value: 1, until: valley.day + 3, label: 'Dev' });
    expect(galeToday(valley)).toBe(true);
  });
});

describe('Saves, replays and the bot on the Atoll', () => {
  it('a save of an Atoll loads as an Atoll, and a save from before the gales loads with the counter at zero', () => {
    const s = createScenario(42, 'Save', 'atoll', 'grimmen');
    const raw = JSON.parse(serialize(s));
    delete raw.stats.galeDays;
    const r = deserialize(JSON.stringify(raw), (seed) => createGame(seed));
    expect(r.scenario).toBe('atoll');
    expect(r.stats.galeDays).toBe(0);
    expect(fnv(r.terrain)).toBe(fnv(s.terrain));
    expect(isleMap(r.terrain).size.length).toBe(6);
  });

  it('a recorded Atoll charter replays to the same state', () => {
    const header: ReplayHeader = { seed: 95, name: 'Isleby', scenario: 'atoll', faction: 'veshari' };
    const s = stateFromHeader(header);
    const r = new CommandRunner(s, header);
    const f = s.founding;
    for (let d = 0; d < 5; d++)
      for (let t = 0; t < TICKS_PER_DAY; t++) {
        if (s.tick === 100) { r.exec('snap', 'road'); r.exec('road', RoadType.Track, [idx(f.x - 5, f.y + 3), idx(f.x - 4, f.y + 3), idx(f.x - 3, f.y + 3)]); }
        if (s.pendingEvent) r.exec('tale', 0, null);
        tick(s);
        r.checkpoint();
      }
    const v = verifyReplay(JSON.parse(JSON.stringify(r.toFile('test'))));
    expect(v.matches).toBe(true);
  }, 120_000);

  it('the bot plays each people\'s Atoll for thirty days without error and grows past the Village', () => {
    for (const people of PEOPLES) {
      const s = createScenario(42, 'Botwick', 'atoll', people);
      const bot = new Bot(s);
      run(s, TICKS_PER_DAY * 30, { onDay: () => bot.step() });
      expect(s.gameOver, people).toBeFalsy();
      expect(s.milestone, people).toBeGreaterThanOrEqual(3);
      expect(isleBuildings(s)[0], people).toBeGreaterThan(20);
    }
  }, 300_000);

  it('the Veshari\'s founding stands by the shoal, and their bot builds tide-wells (seed 44 once left them dry at Hamlet)', () => {
    for (const seed of [42, 43, 44, 45]) {
      const s = createScenario(seed, 'Botwick', 'atoll', 'veshari');
      const f = s.nodes[0];
      let near = false;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (s.terrain[idx(f.x + dx, f.y + dy)] === Terrain.Water) near = true;
      expect(near, `seed ${seed}`).toBe(true);
    }
    const s = createScenario(44, 'Botwick', 'atoll', 'veshari');
    const bot = new Bot(s);
    run(s, TICKS_PER_DAY * 20, { onDay: () => bot.step() });
    expect(s.buildings.filter((b) => b && b.kind === 'tidewell').length).toBeGreaterThan(3);
    expect(s.population).toBeGreaterThan(300);
  }, 120_000);
});

describe('The Atoll\'s text', () => {
  it('has its quest text and the help line', () => {
    const t = JSON.parse(readFileSync('src/data/content/text/quests.json', 'utf8')).z_atoll;
    expect(t.title).toMatch(/Atoll/);
    expect(t.hint).toMatch(/Cobble/);
  });
});
