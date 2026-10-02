/** Iteration 58 (M16 part 1, the wild): herds on their ground that thin where the city spreads, deer that run from the light,
 *  a lodge that hunts a chosen quarry for hides, meat and trophies, meat on the shelves, wolves in the Hush, the Close Season,
 *  two tales, old saves, a sprite for every creature, and a wild that is the same twice. */
import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
import { dailyTrade, happinessTerms } from '../src/sim/growth';
import { tickCreatures } from '../src/sim/creatures';
import { EVENTS } from '../src/sim/events';
import { deserialize, serialize } from '../src/sim/save';
import { generateSprites } from '../src/render/sprites';
import { AgentKind, MAP_W, Terrain, idx, type GameState, type Herd, type WildSpecies } from '../src/sim/types';
import { CLOSE_FLOOR, HUNT_REACH, MARKET_MEAT_CAP, WILD, WILD_SPECIES, builtGrid, dailyGame, dailyMeat, dailyWild, dailyWolves, habitat, houndChance, huntBlock, syncWildAgents } from '../src/sim/wild';
import { HIDE_PRICE, MEAT_PRICE, TROPHY_PRICE } from '../src/sim/growth';
import { flatten } from './helpers';

/** A clean field: grass flattened, then painted with a terrain, no herds but the ones a test adds. */
function field(seed: number, t: Terrain = Terrain.Meadow): GameState {
  const s = createGame(seed, 'Wildwick');
  const f = s.founding;
  flatten(s, f.x - 30, f.y - 30, f.x + 30, f.y + 30);
  for (let y = f.y - 30; y <= f.y + 30; y++) for (let x = f.x - 30; x <= f.x + 30; x++) if (s.terrain[idx(x, y)] === Terrain.Grass && Math.abs(x - f.x) > 6) s.terrain[idx(x, y)] = t;
  s.wild.herds = [];
  s.agents = s.agents.filter((a) => a.herdId === undefined);
  recomputeAll(s);
  return s;
}
function herd(s: GameState, sp: WildSpecies, x: number, y: number, head: number): Herd {
  const h: Herd = { id: s.wild.nextId++, sp, x, y, head, cap: head, bx: x, by: y, taken: -1, prey: -1 };
  s.wild.herds.push(h);
  return h;
}

describe('Herds on their ground', () => {
  it('a new map holds herds of every kind its land supports, each on its own habitat, with its agents', () => {
    const s = createGame(57, 'Wildwick');
    expect(s.wild.seeded).toBe(true);
    const kinds = new Set(s.wild.herds.map((h) => h.sp));
    for (const sp of ['deer', 'elk', 'boar', 'wolf'] as WildSpecies[]) expect(kinds.has(sp), sp).toBe(true);
    const g = builtGrid(s);
    for (const h of s.wild.herds) expect(habitat(s, h.sp, h.x, h.y, g), `${h.sp} at ${h.x},${h.y}`).toBe(true);
    const agents = s.agents.filter((a) => a.herdId !== undefined);
    expect(agents.length).toBeGreaterThan(20);
    for (const a of agents) expect(s.wild.herds.some((h) => h.id === a.herdId && h.sp === a.species)).toBe(true);
  });

  it('a herd whose meadow is built over loses its cap, thins and is gone, with a message', () => {
    const s = field(1);
    const f = s.founding;
    const h = herd(s, 'deer', f.x + 15, f.y + 15, 8);
    s.day = 10;
    dailyWild(s);
    expect(h.cap).toBe(WILD.deer.max);
    for (let y = h.y - 7; y <= h.y + 7; y += 3) for (let x = h.x - 7; x <= h.x + 7; x += 3) placeBuildingRaw(s, 'hearth', x, y);
    dailyWild(s);
    expect(h.cap).toBeLessThan(WILD.deer.minSeed);
    for (let d = 0; d < 60 && s.wild.herds.includes(h); d++) { s.day++; dailyWild(s); }
    expect(s.wild.herds.includes(h)).toBe(false);
    expect(s.stats.herdsLost).toBe(1);
    expect(s.chronicle.some((c) => /city stands where they grazed/.test(c.text))).toBe(true);
  });

  it('herds breed in Bloom and not in the Hush, and twice as fast where a ward holds the ground', () => {
    const s = field(2);
    const f = s.founding;
    const a = herd(s, 'deer', f.x + 15, f.y + 15, 4);
    s.day = 31; // Bloom
    dailyWild(s);
    expect(a.head).toBeGreaterThan(4);
    const before = a.head;
    s.day = 95; // the Hush
    dailyWild(s);
    expect(a.head).toBeLessThanOrEqual(before);
  });
});

describe('Deer and the light', () => {
  it('a deer on lit ground runs away from the light', () => {
    const s = field(3);
    const f = s.founding;
    const h = herd(s, 'deer', f.x + 15, f.y + 15, 6);
    syncWildAgents(s);
    const a = s.agents.find((x) => x.herdId === h.id)!;
    a.x = h.x + 0.5; a.y = h.y + 0.5; a.timer = 0; a.path = [];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 0; dx++) s.lit[idx(h.x + dx, h.y + dy)] = 1; // light to its west
    while ((s.tick + a.id) % 5 !== 0) s.tick++;
    tickCreatures(s);
    expect(a.load).toBe(1); // running
    for (let k = 0; k < 40; k++) { s.tick++; tickCreatures(s); }
    expect(a.x).toBeGreaterThan(h.x + 1.5); // east, away from it
  });

  it('at night a deer goes to its bed in the woods', () => {
    const s = field(4);
    const f = s.founding;
    const h = herd(s, 'deer', f.x + 15, f.y + 15, 6);
    h.bx = h.x + 6; h.by = h.y;
    syncWildAgents(s);
    const a = s.agents.find((x) => x.herdId === h.id)!;
    a.x = h.x + 0.5; a.y = h.y + 0.5; a.timer = 0; a.path = [];
    s.tick = 900 * 3 + 600; // late in the day: night
    for (let k = 0; k < 120; k++) { s.tick++; tickCreatures(s); }
    expect(Math.hypot(a.x - (h.bx + 0.5), a.y - (h.by + 0.5))).toBeLessThan(2);
  });
});

describe("The Hunters' Lodge hunts a quarry", () => {
  function lodgeField(seed: number, sp: WildSpecies, head: number) {
    const s = field(seed);
    const f = s.founding;
    const l = placeBuildingRaw(s, 'hunterslodge', f.x + 8, f.y + 8);
    l.workers = 6;
    l.quarry = sp;
    const h = herd(s, sp, f.x + 16, f.y + 16, head);
    return { s, l, h };
  }

  it('a lodge on deer takes head from the herd in its grounds and brings in meat and hides', () => {
    const { s, l, h } = lodgeField(5, 'deer', 8);
    expect(Math.hypot(h.x - l.x, h.y - l.y)).toBeLessThanOrEqual(HUNT_REACH);
    for (let d = 1; d <= 12; d++) { s.day = d; dailyGame(s); }
    expect(h.head).toBeLessThan(8);
    const took = 8 - h.head;
    expect(l.stock).toBe(took * WILD.deer.hides);
    expect(l.meat).toBe(took * WILD.deer.meat);
    expect(l.took).toBeGreaterThan(0);
    expect(s.stats.hides).toBe(took);
  });

  it('elk give antlers now and then: a trophy', () => {
    const { s, l, h } = lodgeField(6, 'elk', 5);
    for (let d = 1; d <= 200 && !(l.trophies ?? 0); d++) { s.day = d; h.head = 5; dailyGame(s); }
    expect(l.trophies).toBeGreaterThan(0);
    expect(s.stats.trophies).toBeGreaterThan(0);
  });

  it('a lodge after game kills hounds at half the chance; on hounds, or in the Close Season\'s Bloom, at full', () => {
    const { s, l } = lodgeField(7, 'deer', 6);
    expect(houndChance(s, l)).toBe(0.4);
    l.quarry = undefined;
    expect(houndChance(s, l)).toBe(0.8);
    l.quarry = 'deer';
    s.edicts.closeseason = true;
    s.day = 35;
    expect(houndChance(s, l)).toBe(0.8);
  });

  it('the Close Season: no game in Bloom, and no herd taken below its floor', () => {
    const { s, l, h } = lodgeField(8, 'deer', 8);
    s.edicts.closeseason = true;
    s.day = 35; // Bloom
    expect(huntBlock(s, l)).toMatch(/Close Season/);
    for (let d = 35; d < 45; d++) { s.day = d; dailyGame(s); }
    expect(h.head).toBe(8);
    h.head = CLOSE_FLOOR;
    s.day = 70; // Ember
    expect(huntBlock(s, l)).toMatch(/floor/);
    for (let d = 70; d < 90; d++) { s.day = d; dailyGame(s); }
    expect(h.head).toBe(CLOSE_FLOOR);
  });

  it('the depot sells hides, salted meat and trophies at their own prices', () => {
    const { s, l } = lodgeField(9, 'deer', 6);
    const f = s.founding;
    placeBuildingRaw(s, 'depot', f.x - 14, f.y - 14);
    l.stock = 5; l.meat = 25; l.trophies = 3;
    s.day = 65; // Ember
    const t0 = s.treasury;
    dailyTrade(s);
    expect(s.trade.hidesSold).toBe(5);
    expect(s.trade.meatSold).toBe(3); // the budget of 8 a depot: 5 hides, then 3 of the 5 salted
    expect(s.trade.trophiesSold).toBe(2);
    expect(s.treasury - t0).toBeCloseTo(5 * HIDE_PRICE[2] + 3 * MEAT_PRICE[2] + 2 * TROPHY_PRICE[2], 5);
    expect(s.stats.huntCrowns).toBe(Math.round(5 * HIDE_PRICE[2] + 3 * MEAT_PRICE[2] + 2 * TROPHY_PRICE[2]));
  });

  it('meat goes to the markets in reach, and the hearths near them are happier', () => {
    const { s, l } = lodgeField(10, 'deer', 6);
    const f = s.founding;
    const m = placeBuildingRaw(s, 'market', l.x + 5, l.y);
    const home = placeBuildingRaw(s, 'hearth', l.x + 7, l.y + 2);
    l.meat = 12;
    dailyMeat(s);
    expect(m.meat).toBe(MARKET_MEAT_CAP);
    expect(l.meat).toBe(12 - MARKET_MEAT_CAP);
    expect(s.wild.meatAt).toEqual([m.x, m.y]);
    expect(happinessTerms(s, home).some((t) => t.label === 'meat on the shelves' && t.v > 0)).toBe(true);
    void f;
  });
});

describe('Wolves in the Hush', () => {
  function wolfField(seed: number) {
    const s = field(seed, Terrain.Forest);
    const f = s.founding;
    const p = herd(s, 'wolf', f.x + 18, f.y + 18, 4);
    const home = placeBuildingRaw(s, 'hearth', f.x + 12, f.y + 12);
    home.residents = 3;
    home.level = 1;
    recomputeAll(s);
    return { s, p, home };
  }
  it('a pack takes hens from an unwatched hearth at the edge; the hearth feels it', () => {
    const { s, home } = wolfField(11);
    for (let d = 91; d < 110 && !s.stats.hensTaken; d++) { s.day = d; dailyWolves(s); }
    expect(s.stats.hensTaken).toBeGreaterThan(0);
    expect(home.wolfDay).toBeDefined();
    expect(happinessTerms(s, home).some((t) => t.label === 'the wolves took a hen' && t.v < 0)).toBe(true);
  });
  it('not outside the Hush, and not while the folds have their lamps', () => {
    const { s } = wolfField(12);
    for (let d = 40; d < 60; d++) { s.day = d; dailyWolves(s); }
    expect(s.stats.hensTaken).toBe(0);
    s.wild.foldsUntil = 200;
    for (let d = 91; d < 115; d++) { s.day = d; dailyWolves(s); }
    expect(s.stats.hensTaken).toBe(0);
  });
});

describe('Two tales of the wild', () => {
  it('the white hart: hunting it pays and thins the deer; letting it run makes the herds thrive', () => {
    const s = field(13);
    const f = s.founding;
    const e = EVENTS.find((x) => x.id === 'whitehart')!;
    const d = herd(s, 'deer', f.x + 12, f.y + 12, 7);
    s.day = 10;
    expect(e.when(s)).toBe(false);
    s.day = 25;
    expect(e.when(s)).toBe(true);
    const t0 = s.treasury;
    e.choices[0].apply(s);
    expect(s.treasury - t0).toBe(400);
    expect(d.head).toBe(5);
    e.choices[1].apply(s);
    expect(s.wild.thriveUntil).toBe(85);
  });
  it('the wolf winter comes in the Hush after a hen; the hunt halves the packs, the lamps keep the hens', () => {
    const s = field(14, Terrain.Forest);
    const f = s.founding;
    const a = herd(s, 'wolf', f.x + 12, f.y + 12, 4);
    herd(s, 'wolf', f.x - 14, f.y - 14, 4);
    placeBuildingRaw(s, 'hunterslodge', f.x + 8, f.y + 8);
    const e = EVENTS.find((x) => x.id === 'wolfwinter')!;
    s.day = 95;
    expect(e.when(s)).toBe(false);
    s.wild.hensDay = 93;
    expect(e.when(s)).toBe(true);
    e.choices[0].apply(s);
    expect(a.head).toBe(2);
    expect(s.stats.hides).toBe(8);
    e.choices[1].apply(s);
    expect(s.wild.foldsUntil).toBe(125);
  });
});

describe('Saves, sprites and determinism', () => {
  it('a save from before the wild loads and seeds its herds on its own land the next day', () => {
    const s = createGame(15, 'Wildwick');
    const o = JSON.parse(serialize(s));
    delete o.wild;
    o.agents = o.agents.filter((a: { herdId?: number }) => a.herdId === undefined);
    const t = deserialize(JSON.stringify(o), (seed) => createGame(seed));
    expect(t.wild.seeded).toBe(false);
    expect(t.wild.herds.length).toBe(0);
    t.day++;
    dailyWild(t);
    expect(t.wild.herds.length).toBeGreaterThan(5);
    expect(t.agents.some((a) => a.herdId !== undefined)).toBe(true);
  });
  it('every creature has a sprite, two frames', () => {
    const names = new Set(generateSprites().map((d) => d.name));
    for (const sp of [...WILD_SPECIES, 'glimmoth', 'thrumhare', 'wisp', 'hound', 'golem', 'skyray', 'tiger', 'rider', 'airship']) for (const f of [0, 1]) expect(names.has(`${sp}_${f}`), `${sp}_${f}`).toBe(true);
  });
  it('the wild is the same twice for one seed, and stays off the map edge', () => {
    const run = () => {
      const s = createGame(16, 'Wildwick');
      for (let t = 0; t < 900 * 3; t++) { s.tick++; tickCreatures(s); if (s.tick % 900 === 0) { s.day++; dailyWild(s); } }
      return { herds: JSON.stringify(s.wild.herds), agents: s.agents.filter((a) => a.kind === AgentKind.Creature && a.herdId !== undefined).map((a) => `${a.x.toFixed(3)},${a.y.toFixed(3)}`).join(';') };
    };
    const a = run();
    const b = run();
    expect(a).toEqual(b);
    for (const p of a.agents.split(';')) { const [x, y] = p.split(',').map(Number); expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(MAP_W); expect(y).toBeGreaterThanOrEqual(0); }
  });
});
