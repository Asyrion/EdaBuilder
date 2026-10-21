/** Iteration 73 (DESIGN 4.104, the loose ends): sextons walk to a guild brawl and can part it; the airship sails from a lit
 *  Sky-Dock; the Wandering Merchant remembers her deals in state; old saves load. The eggs, the wyvern, the riders and the duel
 *  were parked in the scope reset (phase 1b). */
import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
import { buildRoad, roadPath } from '../src/sim/actions';
import { AgentKind, RoadType, type GameState } from '../src/sim/types';
import { dailyAirship } from '../src/sim/vehicles';
import { WAR_EVENTS, brawlToday, sextonsAbroad } from '../src/sim/guilds';
import { dailyWalkers, tickWalkers } from '../src/sim/walkers';
import { ALL_EVENTS, merchantPrice, textOf } from '../src/sim/events';
import { deserialize, serialize } from '../src/sim/save';
import { flatten } from './helpers';

const ok = (b: { state: string; work: number }) => { b.state = 'ok'; b.work = 0; };

/** A flat town with a road south of the stake. */
function town(seed = 73): { s: GameState; f: { x: number; y: number } } {
  const s = createGame(seed, 'Looseend');
  const f = s.founding;
  flatten(s, f.x - 40, f.y - 20, f.x + 40, f.y + 20);
  s.milestone = 8;
  s.treasury = 60000;
  buildRoad(s, RoadType.Track, roadPath(f.x - 20, f.y + 5, f.x + 20, f.y + 5, false));
  recomputeAll(s);
  return { s, f };
}

describe('The Sky-Dock', () => {
  it('sends the airship only while the Dock is lit', () => {
    const { s, f } = town(74);
    const dock = placeBuildingRaw(s, 'skydock', f.x + 6, f.y + 2); ok(dock); dock.lit = false;
    for (let k = 0; k < 3; k++) { const w = placeBuildingRaw(s, 'craft', f.x - 10 + k, f.y + 4, 1); ok(w); w.stock = 60; }
    recomputeAll(s);
    dock.lit = false;
    s.day = 63;
    dailyAirship(s);
    expect(s.airship.status).toBe('docked'); // the Dock is unlit
    dock.lit = true;
    dailyAirship(s);
    expect(s.airship.status).toBe('away');
    expect(s.stats.airshipVoyages).toBe(1);
  });
});

describe('Sextons at the brawl', () => {
  it('walk to the Guildhall on the brawl\'s day and the next, and the fifth choice moves the guilds only when one is abroad', () => {
    const { s, f } = town(77);
    const hall = placeBuildingRaw(s, 'guildhall', f.x + 10, f.y + 3); ok(hall); hall.lit = true;
    const yard = placeBuildingRaw(s, 'boneyard', f.x - 10, f.y + 3); ok(yard);
    recomputeAll(s);
    dailyWalkers(s);
    expect(sextonsAbroad(s)).toBe(1);
    expect(brawlToday(s)).toBe(false);
    const war = WAR_EVENTS[0];
    const sextonChoice = war.choices[war.choices.length - 1];
    expect(sextonChoice.label).toMatch(/sextons/);
    expect(war.choices[3].label).toBe('Let them brawl'); // the old choices keep their places
    s.guilds.brawlDay = s.day;
    expect(brawlToday(s)).toBe(true);
    for (let k = 0; k < 6000 && !s.stats.brawlsParted; k++) { s.tick++; tickWalkers(s); }
    expect(s.stats.brawlsParted).toBe(1);
    const sexton = s.agents.find((a) => a.kind === AgentKind.Walker && a.job === 'sexton')!;
    expect(sexton.log?.some((l) => /Parted the brawl/.test(l))).toBe(true);
    s.day += 2;
    expect(brawlToday(s)).toBe(false);
    // the choice
    s.guilds.standing.carters = 20; s.guilds.standing.spirewrights = 20; s.guilds.standing.sextons = 50;
    expect(sextonChoice.apply(s)).toMatch(/salt spoon/);
    expect(s.guilds.standing.carters).toBe(25);
    expect(s.guilds.standing.spirewrights).toBe(25);
    expect(s.guilds.standing.sextons).toBe(60);
    s.agents = s.agents.filter((a) => a.kind !== AgentKind.Walker);
    expect(sextonChoice.apply(s)).toMatch(/settles nothing/);
    expect(s.guilds.standing.carters).toBe(25);
  });
});

describe("The merchant's memory", () => {
  it('counts visits and crowns; the egg is gone from her basket; two talks are a favour owed', () => {
    const { s } = town(78);
    const e = ALL_EVENTS.find((x) => x.id === 'merchant')!;
    expect(textOf(e, s)).toMatch(/single wagon/);
    expect(merchantPrice(s, 4000)).toBe(4000);
    s.treasury = 20000;
    const t0 = s.treasury;
    expect(e.choices[0].apply(s)).toMatch(/basket is empty/);
    expect(s.treasury).toBe(t0);
    expect(s.merchant).toEqual({ visits: 1, spent: 0, talks: 0 });
    expect(textOf(e, s)).toMatch(/second time/);
    e.choices[1].apply(s);
    expect(s.merchant.spent).toBe(1200);
    expect(t0 - s.treasury).toBe(1200);
    expect(e.choices[4].apply(s)).toMatch(/not a debt/);
    expect(s.modifiers.some((m) => m.label === 'Longwood seeds (a favour)')).toBe(false);
    e.choices[3].apply(s);
    e.choices[3].apply(s);
    expect(s.merchant.talks).toBe(2);
    expect(textOf(e, s)).toMatch(/owes you one/);
    expect(e.choices[4].apply(s)).toMatch(/worth more/);
    expect(s.merchant.talks).toBe(0);
    expect(s.modifiers.some((m) => m.label === 'Longwood seeds (a favour)')).toBe(true);
    expect(s.merchant.visits).toBe(6);
    const back = deserialize(serialize(s), (seed) => createGame(seed, 'Looseend'));
    expect(back.merchant).toEqual(s.merchant);
  });
});

describe('Saves', () => {
  it('an old save without the merchant or the brawl day loads their defaults', () => {
    const { s } = town(79);
    const o = JSON.parse(serialize(s));
    delete o.merchant;
    delete o.guilds.brawlDay;
    delete o.stats.brawlsParted;
    const old = deserialize(JSON.stringify(o), (seed) => createGame(seed, 'Looseend'));
    expect(old.merchant).toEqual({ visits: 0, spent: 0, talks: 0 });
    expect(old.guilds.brawlDay).toBe(-1);
    expect(old.stats.brawlsParted).toBe(0);
  });
});
