import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { generateTerrain } from '../src/sim/terrain';
import { recomputeAll, run, tick } from '../src/sim/sim';
import { DAYS_PER_SEASON, RoadType, TICKS_PER_DAY, Terrain, Zone, idx, type GameState } from '../src/sim/types';
import { buildRoad, paintZone, placeBuilding, roadPath } from '../src/sim/actions';
import { dailyTrade, updateDemand } from '../src/sim/growth';
import { checkMilestones } from '../src/sim/economy';
import { marketStockCap } from '../src/sim/agents';
import { CARAVAN_GOODS, CARAVAN_PER_ROUTE, FOXPOST_SPACING, routesOpened } from '../src/sim/trade';
import { cradleAccepts, dailyFenEggs } from '../src/sim/wyrmcraft';
import { ALL_EVENTS } from '../src/sim/events';
import { Bot } from '../src/sim/bot';
import { serialize, deserialize } from '../src/sim/save';
import { FACTIONS, FENNEX_ROUTES, canBuild, factionKey, milestonesOf, nextGate, type FactionId } from '../src/data/factions';
import { flatten } from './helpers';
import { questsFor } from '../src/sim/quests';

/** A flat town with two roads at dy 2 and 3. */
function town(faction: FactionId = 'fennex'): GameState {
  const s = createGame(41, 'Foxmere', 'valley', faction);
  const f = s.founding;
  flatten(s, f.x - 24, f.y - 14, f.x + 24, f.y + 14);
  buildRoad(s, RoadType.Track, roadPath(f.x - 22, f.y + 2, f.x + 22, f.y + 2, false));
  buildRoad(s, RoadType.Track, roadPath(f.x - 22, f.y + 3, f.x + 22, f.y + 3, false));
  s.treasury = 50000;
  recomputeAll(s);
  return s;
}

describe('The Fen-Nex of the Reach: rules', () => {
  it('cannot paint Craft, and say why; the other peoples still can', () => {
    const s = town();
    const f = s.founding;
    const r = paintZone(s, Zone.Craft, f.x - 4, f.y + 4, f.x - 2, f.y + 4);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/caravan/);
    expect(paintZone(town('vellish'), Zone.Craft, f.x - 4, f.y + 4, f.x - 2, f.y + 4).ok).toBe(true);
    updateDemand(s);
    expect(s.demand.craft).toBeLessThan(0);
  });

  it('raise Hearths on stilts in the marsh, and only Hearths; the Vellish cannot', () => {
    for (const people of ['fennex', 'vellish'] as FactionId[]) {
      const s = town(people);
      const f = s.founding;
      const i = idx(f.x + 5, f.y + 4);
      s.terrain[i] = Terrain.Marsh;
      expect(paintZone(s, Zone.Market, f.x + 5, f.y + 4, f.x + 5, f.y + 4).ok, people).toBe(false);
      expect(paintZone(s, Zone.Hearth, f.x + 5, f.y + 4, f.x + 5, f.y + 4).ok, people).toBe(people === 'fennex');
    }
  });

  it('keep three times the shelf, and want a market hand for every two folk', () => {
    const s = town();
    const v = town('vellish');
    tick(s);
    const m = placeBuildingRaw(s, 'market', s.founding.x, s.founding.y + 4, 1, true);
    expect(marketStockCap(m)).toBe(60);
    tick(v);
    const mv = placeBuildingRaw(v, 'market', v.founding.x, v.founding.y + 4, 1, true);
    expect(marketStockCap(mv)).toBe(20);
    expect(FACTIONS.fennex.rules.marketJobs).toBe(2.5);
  });

  it('build a Caravanserai for the depot and a Fen Den for the cradle; the Caravanserai from the first day', () => {
    const s = town();
    expect(factionKey(s, 'depot')).toBe('caravanserai');
    expect(factionKey(s, 'cradle')).toBe('fenden');
    expect(canBuild(s, 'caravanserai')).toBe(true);
    expect(canBuild(s, 'depot')).toBe(false);
    expect(canBuild(s, 'craft')).toBe(true); // the catalog still knows it; the zone itself is refused (paintZone)
    expect(canBuild(town('vellish'), 'caravanserai')).toBe(false);
    expect(milestonesOf(s).some((m) => m.unlocks.includes('craft'))).toBe(false);
  });
});

describe('The caravans and the routes', () => {
  it('a Caravanserai with a road at its door fills the emptiest markets in reach and charges the fox\'s price', () => {
    const s = town();
    const f = s.founding;
    const markets = [0, 2, 4].map((dx) => placeBuildingRaw(s, 'market', f.x + dx, f.y + 4, 1, true));
    markets[0].stock = 50;
    expect(placeBuilding(s, 'caravanserai', f.x - 6, f.y).ok).toBe(true);
    for (const b of s.buildings) if (b && b.kind === 'caravanserai') b.state = 'ok';
    expect(routesOpened(s)).toBe(1);
    const t0 = s.treasury;
    dailyTrade(s);
    const load = CARAVAN_GOODS + CARAVAN_PER_ROUTE;
    expect(s.trade.caravanGoods).toBe(load);
    expect(s.trade.caravanCost).toBe(Math.round(load * s.trade.priceGoods * 0.6));
    expect(t0 - s.treasury).toBe(s.trade.caravanCost);
    expect(markets[1].stock + markets[2].stock).toBeGreaterThan(markets[0].stock - 50); // the empty shelves first
  });

  it('no road at the door, no route and no goods; the Vellish never buy off the caravans', () => {
    const s = town();
    const f = s.founding;
    placeBuildingRaw(s, 'market', f.x, f.y + 4, 1, true);
    const c = placeBuildingRaw(s, 'caravanserai', f.x, f.y - 10);
    c.state = 'ok';
    expect(routesOpened(s)).toBe(0);
    dailyTrade(s);
    expect(s.trade.caravanGoods ?? 0).toBe(0);
    const v = town('vellish');
    dailyTrade(v);
    expect(v.trade.caravanGoods).toBeUndefined();
  });

  it('a Fox-Post opens a route of its own only far from every other post', () => {
    const s = town();
    const f = s.founding;
    const c = placeBuildingRaw(s, 'caravanserai', f.x - 20, f.y);
    c.state = 'ok';
    const near = placeBuildingRaw(s, 'foxpost', f.x - 20 + FOXPOST_SPACING - 2, f.y + 1);
    near.state = 'ok';
    expect(routesOpened(s)).toBe(1);
    const far = placeBuildingRaw(s, 'foxpost', f.x - 20 + FOXPOST_SPACING + 1, f.y + 4);
    far.state = 'ok';
    expect(routesOpened(s)).toBe(2);
  });

  it('the milestones count routes opened, and the top bar says so', () => {
    const s = town();
    s.population = 100000;
    s.milestone = 1;
    expect(FENNEX_ROUTES[2]).toBe(1);
    checkMilestones(s);
    expect(s.milestone).toBe(1);
    expect(nextGate(s)).toMatch(/1 trade route \(0 open\)/);
    const c = placeBuildingRaw(s, 'caravanserai', s.founding.x - 6, s.founding.y);
    c.state = 'ok';
    checkMilestones(s);
    expect(s.milestone).toBeGreaterThanOrEqual(2); // the Bazaar and the Fair both ask one route
  });
});

describe('The fen start, the den and the visitors', () => {
  it('a Fen-Nex map has marsh within nine tiles of the founding; the other peoples\' maps are unchanged by it', () => {
    for (const seed of [42, 43, 44, 7]) {
      const t = generateTerrain(seed, { fen: true });
      let near = 0;
      for (let dy = -9; dy <= 9; dy++) for (let dx = -9; dx <= 9; dx++) if (t.terrain[idx(t.founding.x + dx, t.founding.y + dy)] === Terrain.Marsh) near++;
      expect(near, `seed ${seed}`).toBeGreaterThan(15);
      expect(t.terrain[idx(t.founding.x, t.founding.y)]).toBe(Terrain.LeyNode);
    }
    const a = generateTerrain(42, {});
    const b = generateTerrain(42, {});
    expect(Buffer.from(a.terrain).equals(Buffer.from(b.terrain))).toBe(true);
  });

  it('the Fen Den takes only fen eggs, and lays one at the Thaw while lit', () => {
    const s = town();
    const den = placeBuildingRaw(s, 'fenden', s.founding.x + 3, s.founding.y - 4);
    den.state = 'ok';
    den.lit = true;
    expect(cradleAccepts(den, 'fen')).toBe(true);
    expect(cradleAccepts(den, 'ember')).toBe(false);
    s.day = 4 * DAYS_PER_SEASON - 1;
    dailyFenEggs(s);
    expect(s.dragons.length).toBe(0);
    s.day = 4 * DAYS_PER_SEASON;
    dailyFenEggs(s);
    expect(s.dragons.map((d) => d.line)).toEqual(['fen']);
    den.lit = false;
    s.day = 8 * DAYS_PER_SEASON;
    dailyFenEggs(s);
    expect(s.dragons.length).toBe(1);
  });

  it('the Ledger never asks them for Craft: the Craft tasks give way to the Caravanserai and the routes', () => {
    const ids = questsFor(town()).map((q) => q.id);
    for (const id of ['f_jobs', 'o_cart', 'k_glim', 'o_caravan', 'q_quay']) expect(ids, id).not.toContain(id);
    expect(ids).toContain('x_caravan');
    expect(ids).toContain('x_routes');
    const v = questsFor(town('vellish')).map((q) => q.id);
    expect(v).toContain('f_jobs');
    expect(v).not.toContain('x_caravan');
  });

  it('a Fen-Nex city is not visited by the Fen-Nex', () => {
    const e = ALL_EVENTS.find((x) => x.id === 'fennex')!;
    const s = town();
    s.milestone = 5;
    s.population = 500;
    expect(e.when(s)).toBe(false);
    const v = town('vellish');
    v.milestone = 5;
    v.population = 500;
    expect(e.when(v)).toBe(true);
  });

  it('the bot plays them a month without error, raises a Caravanserai and paints no Craft; a save round-trips', () => {
    const s = createGame(42, 'Botfox', 'valley', 'fennex');
    const bot = new Bot(s);
    run(s, TICKS_PER_DAY * 30, { onDay: () => bot.step() });
    expect(s.gameOver).toBeFalsy();
    expect(s.buildings.some((b) => b && b.kind === 'caravanserai' && b.state === 'ok')).toBe(true);
    expect(s.zone.some((z) => z === Zone.Craft)).toBe(false);
    expect(s.milestone).toBeGreaterThanOrEqual(3);
    const r = deserialize(serialize(s), (seed) => createGame(seed));
    expect(r.faction).toBe('fennex');
    expect(routesOpened(r)).toBe(routesOpened(s));
  });
});
