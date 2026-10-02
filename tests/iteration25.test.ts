import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
import { idx } from '../src/sim/types';
import { BREED_DAY, canBreed, dailyBreeding } from '../src/sim/breeding';
import { addEgg, dailyDragons } from '../src/sim/wyrmcraft';
import { dragonAuras } from '../src/sim/weave';
import { RELIC_SETS, dailyRelics, initRelics, relicDone } from '../src/sim/relics';
import { BOON_AT, HALL_DAYS, HALL_OF, dailyGuilds, hallActive } from '../src/sim/guilds';
import { dailyTrade } from '../src/sim/growth';
import { dailyDeath } from '../src/sim/hazards';
import { updateMiasma } from '../src/sim/services';
import { sectorCost } from '../src/sim/sectors';
import { serialize, deserialize } from '../src/sim/save';
import { activeQuests } from '../src/sim/quests';
import { buildRoad, roadPath } from '../src/sim/actions';
import { RoadType } from '../src/sim/types';
import { flatten } from './helpers';

function town(seed = 41) {
  const s = createGame(seed, 'Phase3');
  const f = s.founding;
  flatten(s, f.x - 14, f.y - 10, f.x + 14, f.y + 14);
  return s;
}

describe('Cross-line breeding', () => {
  it('needs two content drakes of different lines in a lit cradle attuned to one, and a free slot', () => {
    const s = town();
    const f = s.founding; // Vein node
    const c1 = placeBuildingRaw(s, 'cradle', f.x + 3, f.y + 3);
    recomputeAll(s);
    expect(canBreed(s, c1).why).toMatch(/two grown/);
    const a = addEgg(s, 'vein')!;
    const b = addEgg(s, 'ember')!;
    expect(a.cradleId).toBe(c1.id);
    expect(canBreed(s, c1).why).toMatch(/drakes/);
    a.stage = 2; b.stage = 2; a.mood = 80; b.mood = 80;
    expect(canBreed(s, c1).why).toMatch(/free slot/);
    const c2 = placeBuildingRaw(s, 'cradle', f.x - 5, f.y + 3);
    recomputeAll(s);
    const ok = canBreed(s, c1);
    expect(ok.ok).toBe(true);
    expect(ok.line).toBe('vein');
    expect(ok.second).toBe('ember');
    b.line = 'vein';
    expect(canBreed(s, c1).why).toMatch(/one line/);
    b.line = 'ember';
    s.nodes[0].aspect = 'grey';
    expect(canBreed(s, c1).why).toMatch(/attuned/);
    s.nodes[0].aspect = 'vein';
    // lays on Bloom day 20 only
    s.day = BREED_DAY - 1;
    dailyBreeding(s);
    expect(s.dragons.length).toBe(2);
    s.day = BREED_DAY;
    dailyBreeding(s);
    expect(s.dragons.length).toBe(3);
    const egg = s.dragons[2];
    expect(egg.line).toBe('vein');
    expect(egg.second).toBe('ember');
    expect(egg.cradleId).toBe(c2.id);
    expect(s.stats.crossEggs).toBe(1);
    expect(activeQuests(s, 100).some((q) => q.id === 'k_cross')).toBe(false);
    // the crossed dragon carries a fainter second aura, is attuned to either line, and breathes wyrmfire
    egg.stage = 2;
    const auras = dragonAuras(s).filter((x) => x.name === egg.name);
    expect(auras.map((x) => [x.line, x.r])).toEqual([['vein', 8], ['ember', 5]]);
    s.day = 120; s.materials.wyrmfire = 0;
    for (const m of s.buildings) if (m && m.kind === 'market') m.stock = 20;
    placeBuildingRaw(s, 'market', f.x - 5, f.y + 6, 2).stock = 40;
    dailyDragons(s);
    expect(s.materials.wyrmfire).toBeGreaterThan(0);
    const r = deserialize(serialize(s), (seed) => createGame(seed));
    expect(r.dragons[2].second).toBe('ember');
  });
});

describe('Relic sets', () => {
  it('a piece every twelve relics, catalogued by an Academy; three make a set with a lasting boon', () => {
    const s = town();
    const f = s.founding;
    expect(s.relics).toEqual(initRelics());
    s.stats.relics = 11;
    dailyRelics(s);
    expect(s.relics.uncatalogued).toBe(0);
    s.stats.relics = 24;
    dailyRelics(s);
    expect(s.relics.uncatalogued).toBe(2); // no Academy: they wait
    placeBuildingRaw(s, 'academy', f.x + 4, f.y + 4);
    dailyRelics(s);
    expect(s.relics.uncatalogued).toBe(1);
    expect(Object.values(s.relics.pieces).reduce((a, b) => a + b, 0)).toBe(1);
    for (let k = 0; k < 40; k++) { s.stats.relics += 12; dailyRelics(s); }
    expect(s.relics.complete.length).toBe(RELIC_SETS.length);
    expect(s.relics.uncatalogued).toBeGreaterThan(0); // nothing left to catalogue into
    // boons
    const cost0 = sectorCost(s, 0);
    s.relics.complete = s.relics.complete.filter((id) => id !== 'concordcharts');
    expect(cost0 / sectorCost(s, 0)).toBeCloseTo(0.8, 2);
    s.relics.complete = [];
    recomputeAll(s);
    const st0 = s.manaStorageMax;
    s.relics.complete = ['lanterncores'];
    recomputeAll(s);
    expect(s.manaStorageMax - st0).toBe(60);
    expect(relicDone(s, 'lanterncores')).toBe(true);
    const r = deserialize(serialize(s), (seed) => createGame(seed));
    expect(r.relics.complete).toEqual(['lanterncores']);
    const o = JSON.parse(serialize(s)); delete o.relics;
    expect(deserialize(JSON.stringify(o), (seed) => createGame(seed)).relics).toEqual(initRelics());
  });
});

describe('Guild halls', () => {
  it('a guild pleased for ten days raises its hall by the Guildhall; the hall locks while the guild strikes', () => {
    const s = town();
    const f = s.founding;
    buildRoad(s, RoadType.Track, roadPath(f.x - 10, f.y + 3, f.x + 10, f.y + 3, false));
    const gh = placeBuildingRaw(s, 'guildhall', f.x + 2, f.y + 4);
    placeBuildingRaw(s, 'spire', f.x + 5, f.y + 5);
    placeBuildingRaw(s, 'depot', f.x - 5, f.y + 4);
    const c = placeBuildingRaw(s, 'craft', f.x - 2, f.y - 3, 2);
    recomputeAll(s);
    s.guilds.standing.carters = 95;
    s.guilds.standing.sextons = 95;
    for (let d = 0; d < HALL_DAYS - 1; d++) { dailyGuilds(s); s.guilds.standing.carters = 95; s.guilds.standing.sextons = 95; }
    expect(s.guilds.pleasedDays.carters).toBe(HALL_DAYS - 1);
    expect(s.buildings.some((b) => b && b.kind === 'cartersyard')).toBe(false);
    dailyGuilds(s);
    const yard = s.buildings.find((b) => b && b.kind === 'cartersyard')!;
    const chapel = s.buildings.find((b) => b && b.kind === 'sextonchapel')!;
    expect(yard).toBeTruthy();
    expect(chapel).toBeTruthy();
    expect(Math.max(Math.abs(yard.x - gh.x), Math.abs(yard.y - gh.y))).toBeLessThanOrEqual(9);
    expect(s.stats.guildHalls).toBe(2);
    expect(s.guilds.pleasedDays.carters).toBe(0);
    expect(hallActive(s, 'cartersyard')).toBe(true);
    expect(activeQuests(s, 100).some((q) => q.id === 'k_hall')).toBe(false);
    // the yard counts as a depot
    recomputeAll(s);
    s.guilds.standing.carters = 50;
    c.stock = 60;
    dailyTrade(s);
    expect(s.trade.exported).toBe(16);
    // the chapel quiets 15 a day with its crew of three; locked on strike
    recomputeAll(s);
    chapel.workers = 3;
    s.unquieted = 30; s.deathsToday = 0;
    dailyDeath(s);
    const quietedOpen = 30 - s.unquieted;
    s.guilds.standing.sextons = 10;
    expect(hallActive(s, 'sextonchapel')).toBe(false);
    s.unquieted = 30;
    dailyDeath(s);
    expect(quietedOpen).toBeGreaterThanOrEqual(15);
    expect(30 - s.unquieted).toBeLessThan(quietedOpen);
    // the lyceum scrubs miasma; the lodge raises the surge threshold
    s.guilds.standing.alchemists = 95;
    s.guilds.pleasedDays.alchemists = HALL_DAYS - 1;
    dailyGuilds(s);
    const ly = s.buildings.find((b) => b && b.kind === 'lyceum')!;
    expect(ly).toBeTruthy();
    updateMiasma(s);
    const mi = s.miasma[idx(c.x, c.y)];
    s.guilds.standing.alchemists = 10;
    updateMiasma(s);
    expect(mi).toBeLessThan(s.miasma[idx(c.x, c.y)]);
    expect(Object.values(HALL_OF).every((k) => typeof k === 'string')).toBe(true);
    void BOON_AT;
  });
});
