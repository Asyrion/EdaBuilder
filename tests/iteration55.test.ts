/** Iteration 55 (M14 part 5, the bot plays it all): the bot's purse, light-first zoning, taxes, edicts and depot; saves
 *  that carry their version; the dev commands. The tale policy and the Annals were parked in the scope reset (phase 1c). */
import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll, run } from '../src/sim/sim';
import { RoadType, SAVE_VERSION, Terrain, TICKS_PER_DAY, idx, type GameState } from '../src/sim/types';
import { buildRoad, roadPath } from '../src/sim/actions';
import { Bot } from '../src/sim/bot';
import { SaveVersionError, deserialize, serialize } from '../src/sim/save';
import { devDefaultArg, DEV_COMMANDS, runDev } from '../src/sim/dev';
import { questsFor } from '../src/sim/quests';
import { specialLock, VELLISH_HAPPINESS } from '../src/data/factions';
import { MILESTONES } from '../src/sim/catalog';
import { flatten } from './helpers';


function town(seed = 55) {
  const s = createGame(seed, 'Annalwick');
  const f = s.founding;
  flatten(s, f.x - 18, f.y - 14, f.x + 18, f.y + 14);
  buildRoad(s, RoadType.Track, roadPath(f.x - 16, f.y + 2, f.x + 16, f.y + 2, false));
  s.treasury = 50000;
  s.milestone = 3;
  recomputeAll(s);
  return s;
}
describe('The bot keeps a purse', () => {
  it('saves for a Font when the ley runs short, holds the price back from services, and buys it once the purse holds it', () => {
    const s = town();
    s.milestone = 4;
    const bot = new Bot(s);
    s.manaSupply = 100; s.manaDemand = 120; s.brownout = 0.2;
    const g = (bot as any).pickGoal();
    expect(g.kind).toBe('font');
    s.manaSupply = 100; s.manaDemand = 120; s.brownout = 0.2;
    (bot as any).goal = g; (bot as any).reserve = g.cost;
    for (let k = 0; k < 6; k++) placeBuildingRaw(s, 'hearth', s.founding.x - 8 + k, s.founding.y + 3);
    recomputeAll(s);
    s.manaSupply = 100; s.manaDemand = 120; s.brownout = 0.2;
    s.treasury = g.cost + 500; // a watchpost (800 + 1,500 buffer) would eat the Font's price
    const posts = s.buildings.filter((b) => b && b.kind === 'watchpost').length;
    (bot as any).buyServices();
    expect(s.buildings.filter((b) => b && b.kind === 'watchpost').length).toBe(posts);
    (bot as any).pursueGoal();
    expect(s.buildings.filter((b) => b && b.kind === 'font').length).toBe(1);
    expect((bot as any).goal).toBeNull();
  });
  it('takes the Crown\'s loan only as a bridge to a hall the ledger can carry, and repays it when nothing is saved for', () => {
    const s = town(55);
    s.milestone = 7; // the Lantern of Vell is the hall (the Tallowkin's Hall of Wicks, which this test used, is parked)
    const bot = new Bot(s);
    s.treasury = 500;
    (bot as any).goal = { kind: 'font', key: 'font', cost: 6700, mana: true };
    s.ledger.net = 600;
    (bot as any).pursueGoal();
    expect(s.loan).toBe(0); // never for the Fonts
    (bot as any).goal = { kind: 'hall', key: 'lantern', cost: 9500, mana: false };
    s.ledger.net = 600; // 70,000 at half a crown in a hundred is 350 a day: the ledger must carry twice that
    (bot as any).pursueGoal();
    expect(s.loan).toBe(0);
    s.ledger.net = 750;
    (bot as any).pursueGoal();
    expect(s.loan).toBe(70000);
    expect(s.buildings.filter((b) => b && b.kind === 'lantern').length).toBe(1);
    expect(bot.loans).toBe(1);
    // while it is out, the reserve holds the loan; once the purse holds it and two thousand more and nothing is saved for, it goes back
    s.manaSupply = 500; s.manaDemand = 100; s.brownout = 0;
    s.treasury = 72500;
    bot.step();
    expect(s.loan).toBe(0);
  });
  it('abandons a goal it cannot place after five days, for twenty', () => {
    const s = town(55);
    s.milestone = 6;
    const bot = new Bot(s);
    (bot as any).goal = { kind: 'hall', key: 'mine', cost: 5400, mana: false };
    s.treasury = 60000;
    // no hills anywhere: the mine cannot stand (the Ruin Delve this test used is parked)
    for (let i = 0; i < s.terrain.length; i++) if (s.terrain[i] === Terrain.Hills) s.terrain[i] = Terrain.Grass;
    for (let k = 0; k < 5; k++) (bot as any).pursueGoal();
    expect((bot as any).goal).toBeNull();
    expect((bot as any).goalBlocked.mine).toBe(s.day + 20);
  });
});

describe('The bot zones what it can light and moves the tithe', () => {
  function lots(s: GameState) { let n = 0; for (let i = 0; i < s.zone.length; i++) if (s.zone[i]) n++; return n; }
  it('paints no new lots while the Vellish ley browns out and the city sits under its gate', () => {
    const s = town();
    const bot = new Bot(s);
    const f = s.founding;
    for (let k = 0; k < 24; k++) { const b = placeBuildingRaw(s, 'hearth', f.x - 12 + k, f.y + 3); b.lit = false; }
    s.brownout = 0.3; s.happiness = 40; s.demand.hearth = 1;
    const before = lots(s);
    (bot as any).zoneByDemand();
    expect(lots(s)).toBe(before);
    s.brownout = 0; // the ley carries them: homes dark for want of a spire are keepLit's to fix
    (bot as any).zoneByDemand();
    expect(lots(s)).toBeGreaterThan(before);
  });
  it('lowers the hearth tithe under the Vellish gate and the works, shops and studios carry the difference', () => {
    const s = town();
    const bot = new Bot(s);
    s.day = 10;
    s.population = MILESTONES[4].pop; s.happiness = VELLISH_HAPPINESS(4) - 5;
    s.demand.market = 0.3; s.demand.craft = 0.3; s.demand.arcane = -0.2;
    (bot as any).setTaxes();
    expect(s.taxRates.hearth).toBe(9);
    expect(s.taxRates.market).toBe(11);
    expect(s.taxRates.craft).toBe(11);
    expect(s.taxRates.arcane).toBe(10); // no demand for studios: their tithe stays
  });
  it('turns on the curfew past 0.35 unrest, as the advisor would', () => {
    const s = town();
    const bot = new Bot(s);
    s.unrest = 0.4;
    (bot as any).setEdicts();
    expect(s.edicts.curfew).toBe(true);
    expect(s.edictSince.curfew).toBe(s.day);
  });
});

describe('The bot stands a depot', () => {
  it('finds a depot room in the outer ring when the old homes are packed (the depot of iteration 43)', () => {
    const s = town();
    const bot = new Bot(s);
    const f = s.founding;
    // a packed old core: homes on every tile beside the road near the stake, free land only far out along it
    for (let x = f.x - 6; x <= f.x + 6; x++) for (const y of [f.y + 1, f.y + 3]) if (s.bIndex[idx(x, y)] < 0 && !s.road[idx(x, y)]) placeBuildingRaw(s, 'hearth', x, y);
    for (let x = f.x - 6; x <= f.x + 6; x++) for (const y of [f.y + 4, f.y + 5, f.y, f.y - 1]) if (s.bIndex[idx(x, y)] < 0 && !s.road[idx(x, y)]) placeBuildingRaw(s, 'hearth', x, y);
    placeBuildingRaw(s, 'hearth', f.x + 15, f.y + 3);
    recomputeAll(s);
    expect((bot as any).placeService('depot')).toBe(true);
    expect(s.buildings.some((b) => b && b.kind === 'depot')).toBe(true);
  });
});

describe('Saves carry their version', () => {
  it('a save round-trips its fields; an older or a newer save is refused with the reason (save version 8, phase 1d)', () => {
    const s = town();
    s.crownFavour = 61;
    const r = deserialize(serialize(s), (seed) => createGame(seed));
    expect(r.version).toBe(SAVE_VERSION);
    expect(r.crownFavour).toBe(61);
    expect(r.stats).toEqual(s.stats);
    const o = JSON.parse(serialize(s));
    o.version = 99;
    expect(() => deserialize(JSON.stringify(o), (seed) => createGame(seed))).toThrow(SaveVersionError);
    expect(() => deserialize(JSON.stringify(o), (seed) => createGame(seed))).toThrow(/version 99/);
  });
});

describe('Dev commands', () => {
  const at = (s: GameState) => ({ x: s.founding.x, y: s.founding.y });
  it('jump to day: forward only, the season follows, the main rng untouched', () => {
    const s = town();
    const rng = s.rngState;
    expect(runDev(s, 'setday', '0', at(s))).toMatch(/Only forward/);
    expect(runDev(s, 'setday', String(s.day + 400), at(s))).toMatch(/a year/);
    runDev(s, 'setday', '45', at(s));
    expect(s.day).toBe(45);
    expect(Math.floor(s.tick / TICKS_PER_DAY)).toBe(45);
    expect(s.rngState).toBe(rng);
  });
  it("complete a task pays its reward; an unknown or a done task is refused", () => {
    const s = town();
    const q = questsFor(s).find((x) => x.reward > 0 && !s.questsDone.includes(x.id))!;
    const t0 = s.treasury;
    expect(runDev(s, 'quest', q.id, at(s))).toMatch(/done/);
    expect(s.questsDone).toContain(q.id);
    expect(s.treasury).toBe(t0 + q.reward);
    expect(runDev(s, 'quest', q.id, at(s))).toBe('Already done.');
    expect(runDev(s, 'quest', 't_hall', at(s))).toMatch(/No such task/); // a parked people's task (scope reset)
  });
  it("set a standing: the Crown's favour, clamped to 0..100", () => {
    const s = town();
    runDev(s, 'standing', 'crown:15', at(s));
    expect(s.crownFavour).toBe(15);
    runDev(s, 'standing', 'crown:140', at(s));
    expect(s.crownFavour).toBe(100);
    const c = DEV_COMMANDS.find((x) => x.id === 'standing')!;
    expect(devDefaultArg(c, s)).toBe('crown:80');
  });
  it('reset the history: the ledger; the Chronicle keeps the dev mark', () => {
    const s = town();
    s.ledgerHistory.push(10, 20);
    runDev(s, 'forget', 'ledger', at(s));
    expect(s.ledgerHistory).toEqual([]);
    runDev(s, 'forget', 'chronicle', at(s));
    expect(s.chronicle.length).toBe(1);
    expect(s.chronicle[0].text).toMatch(/dev tools/);
    expect(s.stats.devUses).toBeGreaterThanOrEqual(2);
  });
});

