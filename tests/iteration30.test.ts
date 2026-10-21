import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
import { ALL_EVENTS, resolveEvent } from '../src/sim/events';
import { CHARTER_COST, RIVALRY_STING, charterGuilds, dailyGuilds, guildDrivers, isChartered } from '../src/sim/guilds';
import { activeQuests } from '../src/sim/quests';
import { serialize, deserialize } from '../src/sim/save';
import { flatten } from './helpers';

function town(seed = 41) {
  const s = createGame(seed, 'Phase6');
  const f = s.founding;
  flatten(s, f.x - 14, f.y - 10, f.x + 14, f.y + 14);
  return s;
}

describe('Relic auctions', () => {
  it('the caravan bids above the Crown and a collector may take an uncatalogued piece', () => {
    const s = town();
    const f = s.founding;
    placeBuildingRaw(s, 'depot', f.x - 4, f.y + 3);
    recomputeAll(s);
    const ev = ALL_EVENTS.find((e) => e.id === 'caravan')!;
    const ci = ev.choices.findIndex((c) => c.label.startsWith('Auction'));
    expect(ci).toBeGreaterThan(0);
    s.pendingEvent = { id: ev.id, title: ev.title, text: ev.text, choices: [] };
    resolveEvent(s, ci);
    expect(s.messages.at(-1)!.text).toMatch(/no loose relics/);
    s.relicStock = 10; s.relics.uncatalogued = 1;
    const t0 = s.treasury;
    s.pendingEvent = { id: ev.id, title: ev.title, text: ev.text, choices: [] };
    resolveEvent(s, ci);
    const gained = s.treasury - t0;
    expect(s.relicStock).toBe(0);
    expect(s.stats.relicsAuctioned).toBe(10);
    expect(gained).toBeGreaterThanOrEqual(1000);
    expect(gained).toBeLessThanOrEqual(1400 + 2500);
    expect(gained % 1 === 0 && (gained <= 1400 ? s.relics.uncatalogued === 1 : s.relics.uncatalogued === 0)).toBe(true);
    expect(s.guilds.standing.sextons).toBe(45);
  });
});

describe('Guild charters', () => {
  it('end a rivalry for 2,000 crowns: no drag, no sting, no brawl', () => {
    const s = town();
    const f = s.founding;
    expect(charterGuilds(s, 'carters')).toMatch(/Guildhall/);
    placeBuildingRaw(s, 'guildhall', f.x + 3, f.y + 3);
    recomputeAll(s);
    s.treasury = 1000;
    expect(charterGuilds(s, 'spirewrights')).toMatch(/2000 crowns/);
    s.treasury = 5000;
    s.guilds.standing.carters = 80;
    expect(guildDrivers(s, 'spirewrights').some((d) => d.text.includes('favoured'))).toBe(true);
    expect(charterGuilds(s, 'spirewrights')).toBeNull();
    expect(s.treasury).toBe(5000 - CHARTER_COST);
    expect(isChartered(s, 'carters')).toBe(true);
    expect(isChartered(s, 'alchemists')).toBe(false);
    expect(s.guilds.standing.spirewrights).toBe(60);
    expect(guildDrivers(s, 'spirewrights').some((d) => d.text.includes('favoured'))).toBe(false);
    expect(charterGuilds(s, 'carters')).toMatch(/already/);
    // no sting on a granted petition, no brawl when both strike
    s.day = 40; s.guilds.lastCouncil = 0; s.guilds.standing.carters = 30; s.guilds.standing.spirewrights = 60;
    dailyGuilds(s);
    expect(s.pendingEvent?.id).toBe('council_carters');
    resolveEvent(s, 0);
    expect(Math.abs(s.guilds.standing.spirewrights - 60)).toBeLessThan(RIVALRY_STING);
    s.guilds.standing.carters = 10; s.guilds.standing.spirewrights = 10; s.day = 200; s.guilds.lastCouncil = 200;
    dailyGuilds(s);
    expect(s.pendingEvent).toBeNull();
    expect(s.stats.guildCharters).toBe(1);
    expect(activeQuests(s, 100).some((q) => q.id === 'k_charter')).toBe(false);
    const r = deserialize(serialize(s), (seed) => createGame(seed));
    expect(r.guilds.charters).toEqual(['carters']);
    const o = JSON.parse(serialize(s)); o.version = 6; delete o.guilds.charters; // a save from before iteration 55 says 6
    expect(deserialize(JSON.stringify(o), (seed) => createGame(seed)).guilds.charters).toEqual([]);
  });
});
