/** Iteration 73 (DESIGN 4.104, the loose ends): the eggs go grey with the Gloam three days at a cradle's door; the Sky-Dock sends a
 *  wyvern instead of the airship (half the load, half the days, no mana) and it may bring a rival's egg or a challenge; a drake with a
 *  Watch rider crosses the whole map once a Wyrm-Court stands; sextons walk to a guild brawl and can part it; the great wyrm's own
 *  flyer duels the Vein-Wyrm; the Wandering Merchant remembers her deals in state; old saves load. */
import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
import { buildRoad, roadPath } from '../src/sim/actions';
import { AgentKind, RoadType, idx, type Agent, type Building, type Dragon, type GameState } from '../src/sim/types';
import { GREY_EGG_DAYS, addEgg, dailyDragons, dailyGreyEggs, fightBout, setRole } from '../src/sim/wyrmcraft';
import { WYVERN_DAYS, WYVERN_LOAD, dailyAirship, dockWyvern, toggleSkyDockWyvern } from '../src/sim/vehicles';
import { tickCreatures, updateCreatures } from '../src/sim/creatures';
import { spawnRestless } from '../src/sim/agents';
import { WAR_EVENTS, brawlToday, sextonsAbroad } from '../src/sim/guilds';
import { dailyWalkers, tickWalkers } from '../src/sim/walkers';
import { sendDuelist, startFlyover } from '../src/sim/wyrm';
import { ALL_EVENTS, merchantEgg, merchantPrice, textOf } from '../src/sim/events';
import { deserialize, serialize } from '../src/sim/save';
import { ANNALS } from '../src/data/annals';
import { BUILDING_BY_KEY } from '../src/sim/catalog';
import { COMMAND_OPS } from '../src/sim/commands';
import { Rng } from '../src/core/rng';
import { flatten } from './helpers';

const ok = (b: { state: string; work: number }) => { b.state = 'ok'; b.work = 0; };

/** A flat town with a lit cradle and a road south of it. */
function town(seed = 73): { s: GameState; cradle: Building; f: { x: number; y: number } } {
  const s = createGame(seed, 'Looseend');
  const f = s.founding;
  flatten(s, f.x - 40, f.y - 20, f.x + 40, f.y + 20);
  s.milestone = 8;
  s.treasury = 60000;
  buildRoad(s, RoadType.Track, roadPath(f.x - 20, f.y + 5, f.x + 20, f.y + 5, false));
  const cradle = placeBuildingRaw(s, 'cradle', f.x, f.y + 2); ok(cradle); cradle.lit = true;
  recomputeAll(s);
  return { s, cradle, f };
}
const egg = (s: GameState, line: Parameters<typeof addEgg>[1]): Dragon => { const d = addEgg(s, line); if (!d) throw new Error('no cradle'); return d; };
const agentOf = (s: GameState, d: Dragon): Agent | undefined => s.agents.find((a) => a.kind === AgentKind.Creature && (a.species === 'drake' || a.species === 'wyvern') && a.dragonId === d.id);

describe('The eggs go grey', () => {
  it('turn to the grey line on the third day of the Gloam at the door, warn on the first, spare hatchlings, and reset when it is cut back', () => {
    const { s, cradle } = town();
    const a = egg(s, 'ember');
    const b = egg(s, 'sky');
    b.stage = 1; // a hatchling is not touched
    s.gloam[idx(cradle.x - 1, cradle.y)] = 1;
    dailyGreyEggs(s);
    expect(cradle.grey).toBe(1);
    expect(a.line).toBe('ember');
    expect(s.messages.some((m) => /greying/.test(m.text))).toBe(true);
    dailyGreyEggs(s);
    expect(a.line).toBe('ember');
    expect(cradle.grey).toBe(GREY_EGG_DAYS - 1);
    dailyGreyEggs(s);
    expect(a.line).toBe('grey');
    expect(b.line).toBe('sky');
    expect(s.stats.eggsGreyed).toBe(1);
    expect(s.messages.some((m) => /gone grey/.test(m.text))).toBe(true);
    // the Gloam cut back: the count resets, and a new egg is safe again for three days
    s.gloam[idx(cradle.x - 1, cradle.y)] = 0;
    dailyGreyEggs(s);
    expect(cradle.grey).toBe(0);
    expect(ANNALS.flatMap((c) => c.rows.map((r) => r.stat))).toContain('eggsGreyed');
    expect(BUILDING_BY_KEY.cradle.desc).toMatch(/grey/);
  });

  it('is the dragons\' daily work: dailyDragons counts the door before it feeds', () => {
    const { s, cradle } = town();
    const a = egg(s, 'bone');
    s.gloam[idx(cradle.x, cradle.y + cradle.h)] = 1;
    for (let k = 0; k < GREY_EGG_DAYS; k++) dailyDragons(s);
    expect(a.line).toBe('grey');
  });
});

describe("The Sky-Dock's wyvern", () => {
  function dockTown() {
    const { s, cradle, f } = town(74);
    const dock = placeBuildingRaw(s, 'skydock', f.x + 6, f.y + 2); ok(dock); dock.lit = false;
    for (let k = 0; k < 3; k++) { const w = placeBuildingRaw(s, 'craft', f.x - 10 + k, f.y + 4, 1); ok(w); w.stock = 60; }
    recomputeAll(s);
    const d = egg(s, 'sky'); d.stage = 3; d.days = 0;
    updateCreatures(s);
    return { s, cradle, f, dock, d };
  }

  it('leaves on day 3 without a lit Dock with half the airship\'s load, keeps the dragon away and unfed, and brings it home in five days with crowns', () => {
    const { s, d } = dockTown();
    expect(agentOf(s, d)).toBeDefined();
    expect(toggleSkyDockWyvern(s)).toBeNull();
    expect(s.airship.wyvern).toBe(true);
    expect(dockWyvern(s)?.id).toBe(d.id);
    s.day = 33;
    dailyAirship(s);
    expect(s.airship.status).toBe('away');
    expect(s.airship.wyvernId).toBe(d.id);
    expect(s.airship.goods).toBe(WYVERN_LOAD);
    expect(d.voyage).toBe(33 + WYVERN_DAYS);
    expect(s.stats.wyvernVoyages).toBe(1);
    expect(s.stats.airshipVoyages).toBe(0);
    expect(agentOf(s, d)).toBeUndefined();
    updateCreatures(s);
    expect(agentOf(s, d)).toBeUndefined();
    expect(dockWyvern(s)).toBeNull();
    expect(setRole(s, d.id, 'courier')).toMatch(/away/);
    dailyDragons(s);
    expect(d.hungry).toBe(0); // no market feeds it, and it is not hungry: it is away
    s.day = 35;
    dailyAirship(s);
    expect(s.airship.status).toBe('away');
    const t0 = s.treasury;
    s.day = 33 + WYVERN_DAYS;
    dailyAirship(s);
    expect(s.airship.status).toBe('docked');
    expect(s.airship.wyvernId).toBe(-1);
    expect(d.voyage).toBeUndefined();
    expect(s.treasury - t0).toBe(Math.round(WYVERN_LOAD * s.trade.priceGoods * 1.6));
    updateCreatures(s);
    expect(agentOf(s, d)).toBeDefined();
    // with no wyvern at home the airship goes instead, if the Dock is lit
    d.role = 'champion';
    expect(dockWyvern(s)).toBeNull();
    const dock = s.buildings.find((b) => b && b.kind === 'skydock')!;
    dock.lit = false;
    s.day = 63;
    dailyAirship(s);
    expect(s.airship.status).toBe('docked'); // the Dock is unlit
    dock.lit = true;
    dailyAirship(s);
    expect(s.airship.status).toBe('away'); // the airship, with the Dock lit
    expect(s.airship.wyvernId).toBe(-1);
    expect(s.stats.airshipVoyages).toBe(1);
    const back = deserialize(serialize(s), (seed) => createGame(seed, 'Looseend'));
    expect(back.airship.wyvern).toBe(true);
  });

  it('may bring a tale: a rival\'s egg for 3,000, a challenge the Ring answers at three quarters the odds and twice the purse, or the story', () => {
    const { s, cradle } = dockTown();
    const tale = ALL_EVENTS.find((e) => e.id === 'wyvern_tale')!;
    expect(tale.when(s)).toBe(false);
    s.day = 10;
    s.airship.wyvernTale = s.day;
    expect(tale.when(s)).toBe(true);
    const t0 = s.treasury;
    const before = s.dragons.length;
    expect(tale.choices[0].apply(s)).toMatch(/egg from a cradle/);
    expect(s.dragons.length).toBe(before + 1);
    expect(['ember', 'bone', 'glim', 'storm']).toContain(s.dragons[s.dragons.length - 1].line);
    expect(t0 - s.treasury).toBe(3000);
    expect(s.airship.wyvernTale).toBe(0);
    // the challenge without a Ring
    s.airship.wyvernTale = s.day;
    expect(tale.choices[1].apply(s)).toMatch(/unanswered/);
    // with a Ring and a champion: a bout today
    const ring = placeBuildingRaw(s, 'ring', cradle.x + 8, cradle.y + 6); ok(ring);
    const champ = s.dragons.find((d) => d.stage >= 2)!;
    champ.role = 'champion';
    s.airship.wyvernTale = s.day;
    const won0 = s.stats.boutsWon, lost0 = s.stats.boutsLost;
    tale.choices[1].apply(s);
    expect(s.stats.boutsWon + s.stats.boutsLost).toBe(won0 + lost0 + 1);
    expect(s.messages.some((m) => /THE RING: .*rival wardlight's wyvern/.test(m.text))).toBe(true);
    // the story
    s.airship.wyvernTale = s.day;
    tale.choices[2].apply(s);
    expect(s.modifiers.some((m) => m.label === "The wyvern's story")).toBe(true);
    // fightBout's purse scale: a sure win at twice the purse pays 3,000 a stage
    const rich = town(75).s;
    const c = egg(rich, 'ember'); c.stage = 3; c.role = 'champion';
    const t1 = rich.treasury;
    const won = fightBout(rich, c, new Rng(1), 1000, 2, 'a test drake');
    expect(won).toBe(true);
    expect(rich.treasury - t1).toBe(1500 * 3 * 2);
  });
});

describe('Hatchling riders cross the map', () => {
  it('a mount needs a Wyrm-Court and a drake; mounted, it flies to a restless 50 tiles off and lays it, and is drawn as a rider', () => {
    const { s, cradle, f } = town(76);
    const d = egg(s, 'ember'); d.stage = 2;
    expect(setRole(s, d.id, 'mount')).toMatch(/Wyrm-Court/);
    const court = placeBuildingRaw(s, 'wyrmcourt', f.x + 8, f.y - 4); ok(court);
    const young = egg(s, 'bone');
    expect(setRole(s, young.id, 'mount')).toMatch(/drake or older/);
    expect(setRole(s, d.id, 'mount')).toBeNull();
    expect(d.role).toBe('mount');
    updateCreatures(s);
    const a = agentOf(s, d)!;
    expect(a.species).toBe('drake');
    const far = { x: Math.min(s.w - 3, cradle.x + 50), y: cradle.y };
    expect(spawnRestless(s, far.x, far.y)).toBe(true);
    const restless = () => s.agents.filter((o) => o.kind === AgentKind.Restless).length;
    expect(restless()).toBe(1);
    let flew = false;
    for (let k = 0; k < 4000 && restless() > 0; k++) { s.tick++; tickCreatures(s); if ((a.alt ?? 0) > 10) flew = true; }
    expect(restless()).toBe(0);
    expect(flew).toBe(true);
    expect(s.stats.mountRescues).toBe(1);
    expect(s.stats.riderRescues).toBe(1);
    expect(BUILDING_BY_KEY.wyrmcourt.desc).toMatch(/mount/);
    // home again, and a role change puts it back on the ground
    for (let k = 0; k < 2000 && Math.hypot(a.x - (a.ax ?? 0), a.y - (a.ay ?? 0)) > 2; k++) { s.tick++; tickCreatures(s); }
    expect(Math.hypot(a.x - (a.ax ?? 0), a.y - (a.ay ?? 0))).toBeLessThanOrEqual(2);
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

describe('The duel flown', () => {
  it('the great wyrm\'s own flyer chases the Vein-Wyrm, roars at the meeting, and the old one circles half as long', () => {
    let s: GameState | null = null;
    for (let seed = 80; seed < 140 && !s; seed++) { const g = createGame(seed, 'Duelwick'); if (g.wyrm.node >= 0) s = g; }
    if (!s) throw new Error('no wyrm map');
    const f = s.founding;
    flatten(s, f.x - 12, f.y - 12, f.x + 12, f.y + 12);
    s.wyrm.state = 'awake';
    const cradle = placeBuildingRaw(s, 'cradle', f.x + 3, f.y + 3); ok(cradle); cradle.lit = true;
    recomputeAll(s);
    const gw = egg(s, 'sky'); gw.stage = 4;
    updateCreatures(s);
    const duelist = agentOf(s, gw)!;
    expect(duelist.species).toBe('wyvern');
    expect(sendDuelist(s)).toBe(true);
    duelist.phase = 0;
    startFlyover(s, true);
    expect(duelist.phase).toBe(4);
    expect(s.stats.wyrmDuels).toBe(1);
    const wyrm = () => s!.agents.find((a) => a.kind === AgentKind.Creature && a.species === 'wyrm');
    expect(wyrm()).toBeDefined();
    let met = false;
    let halfTimer = false;
    for (let k = 0; k < 6000 && wyrm(); k++) {
      s.tick++;
      tickCreatures(s);
      const w = wyrm();
      if (w && w.variant === 1) met = true;
      if (w && w.phase === 2 && w.timer > 0 && w.timer <= 130 && met) halfTimer = true;
    }
    expect(met).toBe(true);
    expect(duelist.load).toBe(1);
    expect(halfTimer).toBe(true);
    expect(wyrm()).toBeUndefined();
    for (let k = 0; k < 10; k++) { s.tick++; tickCreatures(s); }
    expect(duelist.phase).toBe(0);
    expect(sendDuelist(s)).toBe(true); // ready for the next
  });
});

describe("The merchant's memory", () => {
  it('counts visits, crowns and eggs; the egg on offer is sky, then storm, then ember, cheaper each time; two talks are a favour owed', () => {
    const { s } = town(78);
    const e = ALL_EVENTS.find((x) => x.id === 'merchant')!;
    expect(textOf(e, s)).toMatch(/single wagon/);
    expect(merchantEgg(s)).toBe('sky');
    expect(merchantPrice(s, 4000)).toBe(4000);
    s.treasury = 20000;
    expect(e.choices[0].apply(s)).toMatch(/white as the plains/);
    expect(s.dragons[s.dragons.length - 1].line).toBe('sky');
    expect(s.merchant).toEqual({ visits: 1, spent: 4000, eggs: 1, talks: 0 });
    expect(textOf(e, s)).toMatch(/second time/);
    expect(textOf(e, s)).toMatch(/storm egg/);
    expect(merchantEgg(s)).toBe('storm');
    expect(merchantPrice(s, 4000)).toBe(3600);
    expect(e.choices[0].apply(s)).toMatch(/before hail/);
    expect(s.dragons[s.dragons.length - 1].line).toBe('storm');
    expect(s.merchant.spent).toBe(7600);
    expect(merchantEgg(s)).toBe('ember');
    expect(merchantPrice(s, 600)).toBe(480);
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

describe('Saves and ops', () => {
  it('an old save without the merchant, the brawl day or the wyvern loads their defaults; a cradle\'s grey days and a voyage survive a save', () => {
    const { s, cradle } = town(79);
    const d = egg(s, 'glim'); d.stage = 3; d.voyage = s.day + 2;
    cradle.grey = 2;
    const back = deserialize(serialize(s), (seed) => createGame(seed, 'Looseend'));
    expect(back.dragons[0].voyage).toBe(s.day + 2);
    expect(back.buildings.find((b) => b && b.id === cradle.id)?.grey).toBe(2);
    const o = JSON.parse(serialize(s));
    delete o.merchant;
    delete o.guilds.brawlDay;
    delete o.airship.wyvern; delete o.airship.wyvernId; delete o.airship.wyvernTale;
    delete o.stats.eggsGreyed; delete o.stats.wyvernVoyages; delete o.stats.mountRescues; delete o.stats.brawlsParted;
    const old = deserialize(JSON.stringify(o), (seed) => createGame(seed, 'Looseend'));
    expect(old.merchant).toEqual({ visits: 0, spent: 0, eggs: 0, talks: 0 });
    expect(old.guilds.brawlDay).toBe(-1);
    expect(old.airship.wyvern).toBe(false);
    expect(old.airship.wyvernId).toBe(-1);
    expect(old.stats.eggsGreyed).toBe(0);
    expect(old.stats.brawlsParted).toBe(0);
    expect(COMMAND_OPS).toContain('skydock');
  });
});
