import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
import { addEgg, dailyDragons, stageCap, WYRM_EATS_GOODS } from '../src/sim/wyrmcraft';
import { dragonAuras, computeGloamPressure } from '../src/sim/weave';
import { RELIC_KEEP, RELICS_PER_DAY, RELIC_PRICE, dailyTrade } from '../src/sim/growth';
import { STRIKE_AT, WAR_EVENTS, WAR_SPACING, dailyGuilds } from '../src/sim/guilds';
import { ALL_EVENTS, maybeFireEvent, resolveEvent } from '../src/sim/events';
import { tradeRoutes } from '../src/sim/trade';
import { activeQuests } from '../src/sim/quests';
import { serialize, deserialize } from '../src/sim/save';
import { flatten } from './helpers';

function town(seed = 41) {
  const s = createGame(seed, 'Phase5');
  const f = s.founding;
  flatten(s, f.x - 14, f.y - 10, f.x + 14, f.y + 14);
  return s;
}

describe('The great wyrm', () => {
  it('only a trueblood grows past the wyvern stage; a great wyrm eats 20, widens its auras and shrinks the Gloam', () => {
    const s = town();
    const f = s.founding;
    const c = placeBuildingRaw(s, 'cradle', f.x + 3, f.y + 3);
    placeBuildingRaw(s, 'tamerslodge', f.x - 4, f.y + 3);
    for (let k = 0; k < 3; k++) placeBuildingRaw(s, 'market', f.x - 6 + k * 3, f.y + 7, 3).stock = 60;
    recomputeAll(s);
    const d = addEgg(s, 'vein')!;
    expect(stageCap(d)).toBe(3);
    d.trueblood = true; d.second = 'ember';
    expect(stageCap(d)).toBe(4);
    const g = addEgg(s, 'grey')!;
    g.trueblood = true;
    expect(stageCap(g)).toBe(4); // a trueblood of a ground line too
    d.stage = 3; d.days = 59; d.mood = 90; d.training = 'gentle';
    c.lit = true;
    const p0 = computeGloamPressure(s);
    const sc0 = s.materials.scale;
    for (let k = 0; k < 4 && d.stage < 4; k++) dailyDragons(s);
    expect(d.stage).toBe(4);
    expect(s.stats.greatWyrms).toBe(1);
    expect(s.materials.scale - sc0).toBeGreaterThanOrEqual((10 + 3) * 1.5 * 2);
    expect(dragonAuras(s).filter((a) => a.name === d.name).map((a) => a.r)).toEqual([12, 12]);
    expect(computeGloamPressure(s)).toBeCloseTo(p0 - 0.1, 5);
    // eats 20 a day
    const m = s.buildings.filter((b) => b && b.kind === 'market');
    const before = m.reduce((n, b) => n + b!.stock, 0);
    s.dragons = [d];
    dailyDragons(s);
    expect(before - m.reduce((n, b) => n + b!.stock, 0)).toBe(WYRM_EATS_GOODS);
    expect(activeQuests(s, 100).some((q) => q.id === 'k_wyrm')).toBe(false);
    const r = deserialize(serialize(s), (seed) => createGame(seed));
    expect(r.dragons[0].stage).toBe(4);
  });
});

describe('Relic trade with the Crown', () => {
  it('the depot sells two loose relics a day above ten; the assessor pays more in person', () => {
    const s = town();
    const f = s.founding;
    placeBuildingRaw(s, 'depot', f.x - 4, f.y + 3);
    recomputeAll(s);
    s.relicStock = 11;
    const t0 = s.treasury;
    dailyTrade(s);
    expect(s.trade.relicsSold).toBe(1);
    expect(s.treasury - t0).toBe(RELIC_PRICE);
    expect(s.relicStock).toBe(RELIC_KEEP);
    s.relicStock = 20;
    dailyTrade(s);
    expect(s.trade.relicsSold).toBe(RELICS_PER_DAY);
    expect(s.stats.relicsSold).toBe(3);
    expect(tradeRoutes(s)[0].note).toMatch(/3 relics sold/);
    expect(activeQuests(s, 100).some((q) => q.id === 'k_assessor')).toBe(false);
    // the assessor
    const ev = ALL_EVENTS.find((e) => e.id === 'assessor')!;
    expect(ev.when(s)).toBe(false); // no delve
    s.buildings.push(null); // keep indices stable
    const spot = s.terrain.findIndex((t) => t === 8);
    if (spot >= 0) {
      s.relicStock = 15;
      const dv = placeBuildingRaw(s, 'ruindelve', spot % s.w, Math.floor(spot / s.w));
      void dv;
      expect(ev.when(s)).toBe(true);
      s.pendingEvent = { id: ev.id, title: ev.title, text: ev.text, choices: [] };
      const t1 = s.treasury;
      resolveEvent(s, 0);
      expect(s.treasury - t1).toBe(15 * 90);
      expect(s.relicStock).toBe(0);
      expect(s.guilds.standing.sextons).toBe(45);
      s.relics.uncatalogued = 2;
      s.pendingEvent = { id: ev.id, title: ev.title, text: ev.text, choices: [] };
      resolveEvent(s, 1);
      expect(s.treasury - t1).toBe(15 * 90 + 3000);
      expect(s.relics.uncatalogued).toBe(0);
    }
    void maybeFireEvent;
  });
});

describe('Guild war', () => {
  it('two striking rivals brawl once per 60 days; siding, the Watch and letting them fight all resolve', () => {
    const s = town();
    const f = s.founding;
    placeBuildingRaw(s, 'guildhall', f.x + 2, f.y + 4);
    placeBuildingRaw(s, 'spire', f.x + 5, f.y + 5);
    placeBuildingRaw(s, 'hearth', f.x + 6, f.y + 7);
    recomputeAll(s);
    expect(WAR_EVENTS.length).toBe(2);
    s.guilds.standing.alchemists = 15;
    s.guilds.standing.sextons = 10;
    s.day = WAR_SPACING + 1;
    dailyGuilds(s);
    expect(s.pendingEvent?.id).toBe('guildwar_alchemists');
    expect(s.stats.guildWars).toBe(1);
    resolveEvent(s, 0); // side with the alchemists
    expect(Math.abs(s.guilds.standing.alchemists - 35)).toBeLessThan(2);
    expect(s.guilds.standing.sextons).toBeLessThan(2);
    void STRIKE_AT;
    s.guilds.standing.alchemists = 10; s.guilds.standing.sextons = 10; s.guilds.lastCouncil = s.day;
    dailyGuilds(s);
    expect(s.pendingEvent).toBeNull(); // not twice in 60 days
    s.day += WAR_SPACING; s.guilds.lastCouncil = s.day;
    dailyGuilds(s);
    expect(s.pendingEvent?.id).toBe('guildwar_alchemists');
    resolveEvent(s, 3); // let them brawl
    expect(s.buildings.some((b) => b && b.state === 'burning')).toBe(true);
    expect(s.modifiers.some((m) => m.label === 'The guild brawl')).toBe(true);
    s.day += WAR_SPACING; s.guilds.standing.alchemists = 10; s.guilds.standing.sextons = 10; s.guilds.lastCouncil = s.day;
    dailyGuilds(s);
    const t0 = s.treasury;
    resolveEvent(s, 2); // the Watch
    expect(t0 - s.treasury).toBe(300);
    expect(Math.abs(s.guilds.standing.alchemists - 15)).toBeLessThan(2);
  });
});
