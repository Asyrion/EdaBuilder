/** Iteration 55 (M14 part 5, the bot plays it all, and the Annals): the bot's tale policy, purse, light-first zoning, taxes,
 *  edicts, walls and depot; the Annals over every counter; saves that branch on their version; five dev commands; and the
 *  Hall of Wicks that the vigil festival really unlocks. */
import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll, run } from '../src/sim/sim';
import { RoadType, SAVE_VERSION, TICKS_PER_DAY, idx, type GameState } from '../src/sim/types';
import { buildRoad, roadPath } from '../src/sim/actions';
import { ALL_EVENTS, descOf } from '../src/sim/events';
import { Bot } from '../src/sim/bot';
import { chooseTale, worth } from '../src/sim/botPolicy';
import { ANNALS, ANNALS_INTERNAL } from '../src/data/annals';
import { MIGRATIONS, SaveVersionError, deserialize, serialize } from '../src/sim/save';
import { devDefaultArg, DEV_COMMANDS, runDev } from '../src/sim/dev';
import { flooding, riverFrozen, weatherAt } from '../src/sim/weave';
import { questsFor } from '../src/sim/quests';
import { specialLock, VELLISH_HAPPINESS } from '../src/data/factions';
import { MILESTONES } from '../src/sim/catalog';
import { flatten } from './helpers';


function town(seed = 55, faction: 'vellish' | 'grimmen' | 'veshari' | 'tallowkin' = 'vellish') {
  const s = createGame(seed, 'Annalwick', 'valley', faction);
  const f = s.founding;
  flatten(s, f.x - 18, f.y - 14, f.x + 18, f.y + 14);
  buildRoad(s, RoadType.Track, roadPath(f.x - 16, f.y + 2, f.x + 16, f.y + 2, false));
  s.treasury = 50000;
  s.milestone = 3;
  recomputeAll(s);
  return s;
}
/** Put a tale on the table the way the storyteller does. */
function pend(s: GameState, id: string) {
  const e = ALL_EVENTS.find((x) => x.id === id)!;
  s.pendingEvent = { id: e.id, title: e.title, text: e.text, choices: e.choices.map((c) => ({ label: c.label, desc: descOf(c, s), slider: c.slider })) };
}

describe('The bot answers a tale greedily', () => {
  it('scores each choice on a copy, leaves the live state and its rng untouched, and answers the same way twice', () => {
    const s = town();
    pend(s, 'council_spirewrights');
    const rng = s.rngState;
    const json = serialize(s);
    const a = chooseTale(s);
    const b = chooseTale(s);
    expect(s.rngState).toBe(rng);
    expect(serialize(s)).toBe(json);
    expect(a).toEqual(b);
    // granting the spire-wrights' petition costs 60 a day for nothing this town needs: the policy does not grant it
    expect(a.choice).not.toBe(0);
  });
  it('keeps an egg when a cradle has room and sells it when none has', () => {
    const s = town();
    s.milestone = 4;
    pend(s, 'egg_seam');
    expect(chooseTale(s).choice).toBe(1); // no cradle: "keep" would sell it anyway, and the Crown's sale adds favour
    const f = s.founding;
    placeBuildingRaw(s, 'cradle', f.x + 4, f.y + 3);
    recomputeAll(s);
    expect(chooseTale(s).choice).toBe(0);
  });
  it('worth counts the purse, the ledger, the timed effects and the roofs', () => {
    const s = town();
    const w0 = worth(s);
    s.treasury += 1000;
    expect(worth(s) - w0).toBeCloseTo(1000, 0);
    s.modifiers.push({ kind: 'happiness', value: 3, until: s.day + 10, label: 'test' });
    expect(worth(s)).toBeGreaterThan(w0 + 1000);
  });
});

describe('The bot keeps a purse', () => {
  it('saves for a Font when the ley runs short, holds the price back from services, and buys it once the purse holds it', () => {
    const s = town();
    s.milestone = 4;
    const bot = new Bot(s);
    s.manaSupply = 100; s.manaDemand = 120; s.brownout = 0.2;
    const g = (bot as any).pickGoal();
    expect(g.kind).toBe('font');
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
    const s = town(55, 'tallowkin');
    s.milestone = 5;
    s.firedEvents.push('vigil@0:0');
    const bot = new Bot(s);
    s.treasury = 500;
    (bot as any).goal = { kind: 'font', key: 'font', cost: 6700, mana: true };
    s.ledger.net = 600;
    (bot as any).pursueGoal();
    expect(s.loan).toBe(0); // never for the Fonts
    (bot as any).goal = { kind: 'hall', key: 'hallofwicks', cost: 6500, mana: false };
    s.ledger.net = 400; // 50,000 at half a crown in a hundred is 250 a day: the ledger must carry twice that
    (bot as any).pursueGoal();
    expect(s.loan).toBe(0);
    s.ledger.net = 560;
    (bot as any).pursueGoal();
    expect(s.loan).toBe(50000);
    expect(s.buildings.filter((b) => b && b.kind === 'hallofwicks').length).toBe(1);
    expect(bot.loans).toBe(1);
    // while it is out, the reserve holds the loan; once the purse holds it and two thousand more and nothing is saved for, it goes back
    s.manaSupply = 500; s.manaDemand = 100; s.brownout = 0;
    s.treasury = 52500;
    bot.step();
    expect(s.loan).toBe(0);
  });
  it('abandons a goal it cannot place after five days, for twenty', () => {
    const s = town(55, 'veshari');
    s.milestone = 4;
    const bot = new Bot(s);
    (bot as any).goal = { kind: 'mill', key: 'torrentmill', cost: 5400, mana: true };
    s.treasury = 60000;
    // no bank beside a road in this flattened square: the mill cannot stand
    for (let k = 0; k < 5; k++) (bot as any).pursueGoal();
    expect((bot as any).goal).toBeNull();
    expect((bot as any).goalBlocked.mill).toBe(s.day + 20);
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
  it('the Tallowkin hold zoning while the lit share is under the next gate and three points', () => {
    const s = town(55, 'tallowkin');
    const bot = new Bot(s);
    const f = s.founding;
    for (let k = 0; k < 24; k++) { const b = placeBuildingRaw(s, 'hearth', f.x - 12 + k, f.y + 3); b.lit = k < 12; }
    s.demand.hearth = 1;
    const before = lots(s);
    (bot as any).zoneByDemand();
    expect(lots(s)).toBe(before);
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

describe('The bot walls the grey side and stands a depot', () => {
  it('raises a wall arc with gates on the roads once thirty hounds have come', () => {
    const s = town();
    const bot = new Bot(s);
    const f = s.founding;
    for (let x = f.x - 20; x <= f.x + 20; x++) for (let y = f.y - 26; y <= f.y - 22; y++) s.gloam[idx(x, y)] = 1; // the Gloam to the north
    buildRoad(s, RoadType.Track, roadPath(f.x + 2, f.y + 1, f.x + 2, f.y - 18, true));
    recomputeAll(s);
    s.manaSupply = 400; s.manaDemand = 50;
    s.stats.houndsTotal = 29;
    (bot as any).raiseWalls();
    expect(s.wall.some(Boolean)).toBe(false);
    s.stats.houndsTotal = 30;
    (bot as any).raiseWalls();
    expect(bot.wallArcs).toBe(1);
    const walls = [...s.wall].filter((v) => v === 1).length;
    const gates = [...s.wall].filter((v) => v === 2).length;
    expect(walls).toBeGreaterThan(6);
    expect(gates).toBeGreaterThanOrEqual(1);
  });
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

describe('The Annals', () => {
  it('list every counter: each key of stats is a row or an internal timer with its reason', () => {
    const s = createGame(55, 'Annalwick');
    const rows = new Set(ANNALS.flatMap((c) => c.rows.map((r) => r.stat).filter(Boolean)));
    for (const k of Object.keys(s.stats)) expect(rows.has(k as never) || k in ANNALS_INTERNAL, `stats.${k} is on no page`).toBe(true);
    for (const c of ANNALS) for (const r of c.rows) {
      expect(!!r.stat !== !!r.value).toBe(true);
      expect(r.note.length).toBeGreaterThan(10);
      expect(['number', 'string']).toContain(r.stat ? typeof s.stats[r.stat] : typeof r.value!(s));
    }
    expect(ANNALS.length).toBeGreaterThanOrEqual(12);
  });
});

describe('Saves branch on their version', () => {
  it('a save from before iteration 55 (version 6, fields missing) loads with the old defaults and runs a day', () => {
    const s = town();
    run(s, TICKS_PER_DAY * 2);
    const o = JSON.parse(serialize(s));
    expect(o.version).toBe(SAVE_VERSION);
    o.version = 6;
    delete o.crownFavour; delete o.departed; delete o.edictSince; delete o.stats.levies; delete o.stats.stoneCut; delete o.sectors;
    o.stats.terraformed = 7;
    const r = deserialize(JSON.stringify(o), (seed) => createGame(seed));
    expect(r.version).toBe(SAVE_VERSION);
    expect(r.crownFavour).toBe(50);
    expect(r.departed).toEqual([]);
    expect(r.edictSince).toEqual({});
    expect(r.stats.levies).toBe(0);
    expect(r.stats.stoneCut).toBe(7); // stone before iteration 38 was every terraform op
    expect([...r.sectors].every((v) => v === 1)).toBe(true);
    run(r, TICKS_PER_DAY);
    expect(r.day).toBe(s.day + 1);
  });
  it('a version 7 save round-trips its fields; a save with no version counts as 6; a newer save is refused with the reason', () => {
    const s = town();
    s.crownFavour = 61; s.stats.riots = 2; s.firedEvents.push('vigil@0:0');
    const r = deserialize(serialize(s), (seed) => createGame(seed));
    expect(r.crownFavour).toBe(61);
    expect(r.stats).toEqual(s.stats);
    expect(r.firedEvents).toEqual(s.firedEvents);
    const o = JSON.parse(serialize(s));
    delete o.version; delete o.departed;
    expect(deserialize(JSON.stringify(o), (seed) => createGame(seed)).departed).toEqual([]);
    o.version = 99;
    expect(() => deserialize(JSON.stringify(o), (seed) => createGame(seed))).toThrow(SaveVersionError);
    expect(() => deserialize(JSON.stringify(o), (seed) => createGame(seed))).toThrow(/version 99/);
    for (let v = 6; v < SAVE_VERSION; v++) expect(typeof MIGRATIONS[v]).toBe('function');
  });
});

describe('Five dev commands', () => {
  const at = (s: GameState) => ({ x: s.founding.x, y: s.founding.y });
  it('jump to day: forward only, the season and the weather follow, the main rng untouched', () => {
    const s = town();
    const rng = s.rngState;
    expect(runDev(s, 'setday', '0', at(s))).toMatch(/Only forward/);
    expect(runDev(s, 'setday', String(s.day + 400), at(s))).toMatch(/a year/);
    runDev(s, 'setday', '45', at(s));
    expect(s.day).toBe(45);
    expect(Math.floor(s.tick / TICKS_PER_DAY)).toBe(45);
    expect(s.weather).toEqual(weatherAt(s, 45));
    expect(s.rngState).toBe(rng);
  });
  it('flood or freeze the river for ten days, whatever the season or the people', () => {
    const s = town();
    expect(flooding(s)).toBe(false);
    runDev(s, 'river', 'flood', at(s));
    expect(flooding(s)).toBe(true);
    runDev(s, 'river', 'freeze', at(s));
    expect(riverFrozen(s)).toBe(true);
    s.day += 10;
    expect(flooding(s)).toBe(false);
    expect(riverFrozen(s)).toBe(false);
  });
  it("complete a task pays its reward; another people's or a done task is refused", () => {
    const s = town();
    const q = questsFor(s).find((x) => x.reward > 0 && !s.questsDone.includes(x.id))!;
    const t0 = s.treasury;
    expect(runDev(s, 'quest', q.id, at(s))).toMatch(/done/);
    expect(s.questsDone).toContain(q.id);
    expect(s.treasury).toBe(t0 + q.reward);
    expect(runDev(s, 'quest', q.id, at(s))).toBe('Already done.');
    expect(runDev(s, 'quest', 't_hall', at(s))).toMatch(/another people/);
  });
  it("set a standing: a guild's or the Crown's favour, clamped to 0..100", () => {
    const s = town();
    runDev(s, 'standing', 'crown:15', at(s));
    expect(s.crownFavour).toBe(15);
    runDev(s, 'standing', 'carters:140', at(s));
    expect(s.guilds.standing.carters).toBe(100);
    const c = DEV_COMMANDS.find((x) => x.id === 'standing')!;
    expect(devDefaultArg(c, s)).toBe('carters:80');
  });
  it('reset the history: the tales forget all but the ones that unlock a building; the ledger; the Chronicle keeps the dev mark', () => {
    const s = town();
    s.firedEvents.push('pilgrims:0', 'stormcaller:0', 'vigil@0:0', 'egg_first:1');
    s.ledgerHistory.push(10, 20);
    runDev(s, 'forget', 'tales', at(s));
    expect(s.firedEvents).toEqual(['stormcaller:0', 'vigil@0:0']);
    runDev(s, 'forget', 'ledger', at(s));
    expect(s.ledgerHistory).toEqual([]);
    runDev(s, 'forget', 'chronicle', at(s));
    expect(s.chronicle.length).toBe(1);
    expect(s.chronicle[0].text).toMatch(/dev tools/);
    expect(s.stats.devUses).toBeGreaterThanOrEqual(3);
  });
});

describe('The Hall of Wicks is sworn at the vigil festival itself', () => {
  it('a vigil kept as a festival (`vigil@year:0`) unlocks it; one skipped does not', () => {
    const s = town(55, 'tallowkin');
    s.milestone = 5;
    expect(specialLock(s, 'hallofwicks')).toMatch(/vigil/);
    s.firedEvents.push('vigil@0:1');
    expect(specialLock(s, 'hallofwicks')).toMatch(/vigil/);
    s.firedEvents.push('vigil@0:0');
    expect(specialLock(s, 'hallofwicks')).toBeNull();
  });
});

describe('The Crown answers the first cradle', () => {
  it("the Crown's gift is a priority tale", () => {
    expect(ALL_EVENTS.find((e) => e.id === 'egg_first')!.priority).toBe(true);
  });
});
