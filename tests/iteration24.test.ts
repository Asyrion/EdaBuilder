import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
import { idx } from '../src/sim/types';
import { BOON_AT, COUNCIL_SPACING, GUILD_IDS, dailyGuilds, guildDrivers, guildEffect, hasCouncil, initGuilds } from '../src/sim/guilds';
import { holdFeast, maybeFireCalendar, resolveEvent } from '../src/sim/events';
import { modifierSum, modifierSumAt } from '../src/sim/edicts';
import { computeBuildingHappiness, dailyTrade } from '../src/sim/growth';
import { dailyTwinRoad, tradeRoutes, twinDepots } from '../src/sim/trade';
import { foundDaughter } from '../src/sim/charter';
import { OVERLAYS } from '../src/render/overlays';
import { serialize, deserialize } from '../src/sim/save';
import { activeQuests } from '../src/sim/quests';
import { flatten } from './helpers';

function town(seed = 41) {
  const s = createGame(seed, 'Council');
  const f = s.founding;
  flatten(s, f.x - 14, f.y - 10, f.x + 14, f.y + 14);
  return s;
}

describe('The guild council', () => {
  it('sits only at a lit Guildhall; standings drift to 50 without one and move with the drivers with one', () => {
    const s = town();
    const f = s.founding;
    expect(hasCouncil(s)).toBe(false);
    s.guilds.standing.carters = 80;
    dailyGuilds(s);
    expect(s.guilds.standing.carters).toBeCloseTo(80 - 0.6, 1);
    expect(guildEffect(s, 'carters')).toBe(0); // no council: no boon
    placeBuildingRaw(s, 'guildhall', f.x + 3, f.y + 3);
    recomputeAll(s);
    expect(hasCouncil(s)).toBe(true);
    // no depot displeases the carters; a depot pleases them
    expect(guildDrivers(s, 'carters').find((d) => d.text === 'no Trade Depot')!.value).toBeLessThan(0);
    placeBuildingRaw(s, 'depot', f.x - 4, f.y + 3);
    recomputeAll(s);
    expect(guildDrivers(s, 'carters').find((d) => d.text === 'a Trade Depot')!.value).toBeGreaterThan(0);
    s.guilds.standing.carters = 50;
    for (let d = 0; d < 20; d++) dailyGuilds(s);
    expect(s.guilds.standing.carters).toBeGreaterThan(55);
    // overdraw sours the spire-wrights
    s.overdrawDays = 3;
    expect(guildDrivers(s, 'spirewrights').some((d) => d.text === 'overdraw' && d.value < 0)).toBe(true);
  });

  it('the least pleased guild petitions every 20 days; granting turns the edict on and ties standing to it', () => {
    const s = town();
    const f = s.founding;
    placeBuildingRaw(s, 'guildhall', f.x + 3, f.y + 3);
    recomputeAll(s);
    s.day = 40;
    s.guilds.lastCouncil = 0;
    s.guilds.standing.sextons = 30;
    dailyGuilds(s);
    expect(s.pendingEvent?.id).toBe('council_sextons');
    expect(s.stats.councils).toBe(1);
    resolveEvent(s, 0);
    expect(s.edicts.rites).toBe(true);
    expect(s.guilds.standing.sextons).toBeCloseTo(45, 0);
    expect(s.guilds.demand).toEqual({ guild: 'sextons', until: 60 });
    const kept = guildDrivers(s, 'sextons').find((d) => d.text.includes('kept'));
    expect(kept?.value).toBe(1);
    s.edicts.rites = false;
    expect(guildDrivers(s, 'sextons').find((d) => d.text.includes('broken'))?.value).toBe(-2);
    // no second petition before the spacing has passed
    s.day = 41;
    s.guilds.standing.carters = 10;
    dailyGuilds(s);
    expect(s.pendingEvent).toBeNull();
    s.day = 40 + COUNCIL_SPACING;
    dailyGuilds(s);
    expect(s.pendingEvent?.id).toBe('council_carters');
    resolveEvent(s, 2); // refuse
    expect(s.guilds.standing.carters).toBeLessThan(10);
    expect(modifierSum(s, 'happiness')).toBe(-2);
  });

  it('boons and strikes reach exports, goods, stores and deathcare', () => {
    const s = town();
    const f = s.founding;
    placeBuildingRaw(s, 'guildhall', f.x + 3, f.y + 3);
    placeBuildingRaw(s, 'depot', f.x - 4, f.y + 3);
    const c = placeBuildingRaw(s, 'craft', f.x - 2, f.y + 6, 2);
    recomputeAll(s);
    s.guilds.standing.carters = BOON_AT;
    expect(guildEffect(s, 'carters')).toBe(1);
    c.stock = 60; // cap 40 at level 2 -> sells down to 20, capped per depot
    dailyTrade(s);
    const boon = s.trade.exported;
    c.stock = 60;
    s.guilds.standing.carters = 10;
    dailyTrade(s);
    expect(boon).toBe(12);
    expect(s.trade.exported).toBe(4);
    s.guilds.standing.alchemists = 10;
    expect(guildEffect(s, 'alchemists')).toBe(-1);
    s.guilds.standing.spirewrights = 90;
    const nx = placeBuildingRaw(s, 'nexus', f.x + 6, f.y - 4);
    void nx;
    recomputeAll(s);
    const max1 = s.manaStorageMax;
    s.guilds.standing.spirewrights = 50;
    recomputeAll(s);
    expect(max1 / s.manaStorageMax).toBeCloseTo(1.2, 2);
  });
});

describe('Festival depth', () => {
  it('the Thaw feast eats from market shelves and pays happiness by district', () => {
    const s = town();
    const f = s.founding;
    const m1 = placeBuildingRaw(s, 'market', f.x - 6, f.y + 4, 2);
    const m2 = placeBuildingRaw(s, 'market', f.x + 6, f.y + 4, 2);
    const h1 = placeBuildingRaw(s, 'hearth', f.x - 6, f.y + 8);
    const h2 = placeBuildingRaw(s, 'hearth', f.x + 6, f.y + 8);
    for (let y = f.y + 2; y <= f.y + 10; y++) for (let x = f.x - 8; x <= f.x - 4; x++) s.district[idx(x, y)] = 1;
    recomputeAll(s);
    m1.stock = 30; m2.stock = 6; // m2 has only 2 to spare
    const fed = holdFeast(s, 40);
    expect(fed.goods).toBe(28);
    expect(m1.stock).toBe(4);
    expect(fed.districts.sort()).toEqual([0, 1]);
    s.modifiers.push({ kind: 'happiness', value: 5, until: s.day + 15, label: 'feast', district: 1 });
    expect(modifierSumAt(s, 'happiness', 1)).toBe(5);
    expect(modifierSumAt(s, 'happiness', 0)).toBe(0);
    expect(modifierSum(s, 'happiness')).toBe(0);
    expect(computeBuildingHappiness(s, h1) - computeBuildingHappiness(s, h2)).toBeGreaterThan(0);
    // the event itself: fires on Thaw day 2 of the second year and takes the goods
    s.day = 122; s.population = 50; m1.stock = 30;
    maybeFireCalendar(s);
    expect(s.pendingEvent?.id).toBe('thawday');
    resolveEvent(s, 0);
    expect(s.stats.feastGoods).toBeGreaterThanOrEqual(10);
    expect(s.modifiers.some((m) => m.label === 'Thaw feast')).toBe(true);
  });

  it('the Remembrance needs an Ossuary to lay the dead; the vigil draws stored mana', () => {
    const s = town();
    const f = s.founding;
    s.unquieted = 20;
    s.day = 75; s.population = 100; // Ember day 15
    maybeFireCalendar(s);
    expect(s.pendingEvent?.id).toBe('remembrance');
    resolveEvent(s, 1);
    expect(s.unquieted).toBe(14);
    placeBuildingRaw(s, 'ossuary', f.x + 4, f.y + 4);
    s.firedEvents = []; s.unquieted = 20;
    maybeFireCalendar(s);
    resolveEvent(s, 1);
    expect(s.unquieted).toBe(5);
    // the vigil
    s.day = 91; s.manaStorage = 100;
    maybeFireCalendar(s);
    expect(s.pendingEvent?.id).toBe('vigil');
    resolveEvent(s, 0);
    expect(s.manaStorage).toBe(0);
    const hold = s.modifiers.find((m) => m.kind === 'gloamHold')!;
    expect(hold.until - s.day).toBe(6 + 8);
    expect(s.modifiers.some((m) => m.kind === 'mana')).toBe(false);
    s.firedEvents = []; s.modifiers = []; s.manaStorage = 10;
    maybeFireCalendar(s);
    resolveEvent(s, 0);
    expect(s.modifiers.some((m) => m.kind === 'mana')).toBe(true);
  });

  it('the Lantern Fair needs a Guildhall and raises export prices', () => {
    const s = town();
    const f = s.founding;
    s.day = 42; s.population = 100; // Bloom day 12
    maybeFireCalendar(s);
    expect(s.pendingEvent).toBeNull();
    placeBuildingRaw(s, 'guildhall', f.x + 3, f.y + 3);
    maybeFireCalendar(s);
    expect(s.pendingEvent?.id).toBe('lanternfair');
    resolveEvent(s, 0);
    dailyTrade(s);
    expect(s.trade.priceGoods).toBe(3);
    expect(s.guilds.standing.carters).toBe(60);
  });
});

describe('Trade routes', () => {
  it('lists the Gloam road, the river, the arches and the Twin Road; the Twin Road carries goods to the daughter', () => {
    const s = createGame(21, 'Routes');
    const f = s.founding;
    flatten(s, f.x - 12, f.y - 8, f.x + 12, f.y + 12);
    expect(tradeRoutes(s)).toEqual([]);
    placeBuildingRaw(s, 'depot', f.x - 4, f.y + 3);
    recomputeAll(s);
    expect(tradeRoutes(s).map((r) => r.kind)).toEqual(['road']);
    // the daughter
    s.milestone = 8;
    let ni = -1;
    for (let k = 0; k < s.nodes.length; k++) { const n = s.nodes[k]; if (Math.max(Math.abs(n.x - f.x), Math.abs(n.y - f.y)) >= 40 && (s.wyrm.node !== k)) { flatten(s, n.x - 8, n.y - 8, n.x + 8, n.y + 8); if (foundDaughter(s, k, 'Newlight') === null) { ni = k; break; } } }
    expect(ni).toBeGreaterThanOrEqual(0);
    const d = s.daughter!;
    let routes = tradeRoutes(s);
    expect(routes.find((r) => r.kind === 'twin')!.open).toBe(false);
    expect(twinDepots(s)).toBeNull();
    placeBuildingRaw(s, 'depot', d.x + 3, d.y + 3);
    const m = placeBuildingRaw(s, 'market', d.x - 3, d.y + 3, 2);
    const c = placeBuildingRaw(s, 'craft', f.x - 2, f.y + 6, 2);
    recomputeAll(s);
    expect(twinDepots(s)).not.toBeNull();
    routes = tradeRoutes(s);
    expect(routes.find((r) => r.kind === 'twin')!.open).toBe(true);
    c.stock = 40; m.stock = 0;
    const t0 = s.treasury;
    const moved = dailyTwinRoad(s);
    expect(moved).toBe(30);
    expect(m.stock).toBe(30);
    expect(c.stock).toBe(10);
    expect(s.treasury - t0).toBe(30);
    expect(s.stats.twinGoods).toBe(30);
    expect(activeQuests(s, 100).some((q) => q.id === 'k_twinroad')).toBe(false); // done
    const b = deserialize(serialize(s), (seed) => createGame(seed));
    expect(b.stats.twinGoods).toBe(30);
    expect(b.guilds.standing.carters).toBe(50);
  });

  it('old saves get a council and the Weave view paints aspects and auras', () => {
    const s = createGame(41, 'Old');
    const o = JSON.parse(serialize(s));
    delete o.guilds;
    delete o.stats.councils;
    const b = deserialize(JSON.stringify(o), (seed) => createGame(seed));
    expect(b.guilds).toEqual(initGuilds());
    expect(b.stats.councils).toBe(0);
    for (const g of GUILD_IDS) expect(b.guilds.standing[g]).toBe(50);
    const w = OVERLAYS.weave;
    const f = s.founding;
    expect(w.tile(s, idx(f.x, f.y), f.x, f.y)).toMatch(/rgba\(79,227,255/); // Vein
    expect(w.tile(s, idx(f.x + 11, f.y + 11), f.x + 11, f.y + 11)).toBeNull();
    expect(w.legend.length).toBe(9);
  });
});
