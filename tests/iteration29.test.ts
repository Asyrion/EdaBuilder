import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
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
