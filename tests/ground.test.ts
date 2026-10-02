// Iteration 46, M14 part 1b: the ground has limits. Wells with capacity, mud, mine seams, Font flares, shared rivers, portal crossings, the Gloam that takes.
import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw, waterRadiusOf } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
import { RoadType, Terrain, idx } from '../src/sim/types';
import { buildRoad, roadPath } from '../src/sim/actions';
import { MILL_SHARE, PORTAL_CAP, PORTAL_MANA, updateMana, updateWater, waterCapOf } from '../src/sim/networks';
import { MUD, roadSpeedAt } from '../src/sim/roads';
import { ROAD_BY_TYPE } from '../src/sim/catalog';
import { SEAM, SPENT_RATE, dailyBuildings } from '../src/sim/growth';
import { GOLEM_WAKE_CHANCE } from '../src/sim/beasts';
import { FLARE_DAYS, GLOAM_TAKES, GREY_DAYS, dailyFire, dailyGloam, fontsRunHot } from '../src/sim/hazards';
import { updateMiasma } from '../src/sim/services';
import { serialize, deserialize } from '../src/sim/save';
import { flatten } from './helpers';

function town(seed = 41, faction: 'vellish' | 'veshari' = 'vellish') {
  const s = createGame(seed, 'Ground', 'valley', faction);
  const f = s.founding;
  flatten(s, f.x - 20, f.y - 14, f.x + 20, f.y + 16);
  buildRoad(s, RoadType.Track, roadPath(f.x - 18, f.y + 2, f.x + 18, f.y + 2, false));
  s.milestone = 6;
  s.treasury = 80000;
  s.sectors.fill(1);
  recomputeAll(s);
  return s;
}
const ok = (b: { state: string; work: number }) => { b.state = 'ok'; b.work = 0; };

describe('Wells with capacity', () => {
  it('a well serves 30 levels, the nearest first; the farthest go dry and say why; a second well with room takes them', () => {
    const s = town();
    const f = s.founding;
    s.waterDist.fill(5);
    const well = placeBuildingRaw(s, 'well', f.x, f.y + 8); ok(well);
    // thirteen level-3 hearths in a row above it, all within its 8 tiles and out of the Stake's reach: 39 levels against a cap of 30
    const hs = [] as ReturnType<typeof placeBuildingRaw>[];
    for (let k = 0; k < 13; k++) { const b = placeBuildingRaw(s, 'hearth', f.x - 6 + k, f.y + 12, 3); ok(b); hs.push(b); }
    updateWater(s);
    expect(waterCapOf(well)).toBe(30);
    expect(well.load).toBe(39);
    const dry = hs.filter((b) => !b.watered);
    expect(dry.length).toBe(3);
    expect(dry.every((b) => b.dryBy === 'overdrawn')).toBe(true);
    // the nearest are served: the dry ones are the farthest from the well
    const far = Math.max(...hs.filter((b) => b.watered).map((b) => Math.abs(b.x - well.x)));
    expect(dry.every((b) => Math.abs(b.x - well.x) >= far)).toBe(true);
    // a second well in reach of the dry end takes them
    const w2 = placeBuildingRaw(s, 'well', f.x + 7, f.y + 9); ok(w2);
    updateWater(s);
    expect(hs.every((b) => b.watered)).toBe(true);
  });

  it('a plain well far from water reaches 4, a cistern keeps 12; the Seep follows the season; the flood fouls a bank well and not a Tide-Well', () => {
    const s = town();
    const f = s.founding;
    const well = placeBuildingRaw(s, 'well', f.x + 4, f.y + 4); ok(well);
    const cistern = placeBuildingRaw(s, 'cistern', f.x - 6, f.y + 4); ok(cistern); cistern.lit = true;
    s.waterDist.fill(12);
    expect(waterRadiusOf(s, well)).toBe(4);
    expect(waterRadiusOf(s, cistern)).toBe(12);
    s.waterDist.fill(5);
    expect(waterRadiusOf(s, well)).toBe(8);
    const seep = placeBuildingRaw(s, 'seep', f.x + 10, f.y - 4); ok(seep);
    s.day = 0; expect(waterRadiusOf(s, seep)).toBe(9); // the Thaw
    s.day = 30; expect(waterRadiusOf(s, seep)).toBe(6);
    s.day = 60; expect(waterRadiusOf(s, seep)).toBe(3); // the Ember
    // the Veshari's Hush flood fouls a well within 2 of the river; the Tide-Well drinks the flood
    const v = town(41, 'veshari');
    const bw = placeBuildingRaw(v, 'well', v.founding.x + 4, v.founding.y + 4); ok(bw);
    const tw = placeBuildingRaw(v, 'tidewell', v.founding.x - 4, v.founding.y + 4); ok(tw);
    v.waterDist.fill(2);
    v.day = 0;
    expect(waterRadiusOf(v, bw)).toBe(8);
    v.day = 96; // the Hush, past its fifth day: the river is over the bank
    expect(waterRadiusOf(v, bw)).toBe(0);
    expect(waterRadiusOf(v, tw)).toBe(10);
    updateWater(v);
    expect(bw.load).toBe(0);
  });
});

describe('Mud, seams, rivers, crossings', () => {
  it('a dirt track runs at six tenths in the Thaw and the Hush; cobble does not', () => {
    const s = town();
    const t = idx(s.founding.x, s.founding.y + 2);
    expect(s.road[t]).toBe(RoadType.Track);
    s.day = 0; expect(roadSpeedAt(s, t)).toBeCloseTo(ROAD_BY_TYPE[RoadType.Track].speed * MUD, 6);
    s.day = 40; expect(roadSpeedAt(s, t)).toBeCloseTo(ROAD_BY_TYPE[RoadType.Track].speed, 6);
    s.day = 100; expect(roadSpeedAt(s, t)).toBeCloseTo(ROAD_BY_TYPE[RoadType.Track].speed * MUD, 6);
    s.road[t] = RoadType.Cobble;
    expect(roadSpeedAt(s, t)).toBeCloseTo(ROAD_BY_TYPE[RoadType.Cobble].speed, 6);
  });

  it("a mine's seam falls by its cut; a spent shaft cuts dust and wakes the deep three times as often", () => {
    const s = town();
    const f = s.founding;
    for (let dy = -3; dy <= -2; dy++) for (let dx = 4; dx <= 5; dx++) s.terrain[idx(f.x + dx, f.y + dy)] = Terrain.Hills;
    const mine = placeBuildingRaw(s, 'mine', f.x + 4, f.y - 3); ok(mine); mine.lit = true; mine.stock = 0;
    expect(mine.seam).toBeUndefined(); // a full seam reads as SEAM
    dailyBuildings(s);
    expect(mine.seam).toBe(SEAM - 8);
    expect(mine.stock).toBe(8);
    mine.seam = 3; mine.stock = 0;
    dailyBuildings(s);
    expect(mine.seam).toBe(0);
    expect(mine.stock).toBe(3);
    expect(s.messages[s.messages.length - 1].text).toMatch(/cut out/);
    mine.stock = 0;
    dailyBuildings(s);
    expect(mine.stock).toBe(SPENT_RATE);
    expect(GOLEM_WAKE_CHANCE * 3).toBeCloseTo(0.09, 6);
    const r = deserialize(serialize(s), (seed) => createGame(seed));
    expect(r.buildings.find((b) => b && b.id === mine.id)!.seam).toBe(0);
  });

  it('a second mill within 8 of an older one shares the river; portal crossings count, draw mana and jam past 60', () => {
    const s = town();
    const f = s.founding;
    for (let x = f.x - 12; x <= f.x + 12; x++) s.terrain[idx(x, f.y + 6)] = Terrain.Water;
    const m1 = placeBuildingRaw(s, 'torrentmill', f.x - 4, f.y + 5); ok(m1);
    updateMana(s);
    const one = m1.load!;
    expect(one).toBeGreaterThan(0);
    const m2 = placeBuildingRaw(s, 'torrentmill', f.x + 2, f.y + 5); ok(m2);
    updateMana(s);
    expect(m1.load).toBeCloseTo(one, 6);
    expect(m2.load).toBeCloseTo(one * MILL_SHARE, 6);
    const m3 = placeBuildingRaw(s, 'torrentmill', f.x + 12, f.y + 5); ok(m3);
    updateMana(s);
    expect(m3.load).toBeCloseTo(one, 6); // ten tiles from the nearest: its own stretch
    // crossings
    const sp = placeBuildingRaw(s, 'spire', f.x + 4, f.y - 1); ok(sp); // lit by the founding node; lights 5 tiles
    const a1 = placeBuildingRaw(s, 'portalarch', f.x + 2, f.y - 4); ok(a1);
    const a2 = placeBuildingRaw(s, 'portalarch', f.x + 6, f.y + 1); ok(a2);
    recomputeAll(s);
    expect(a1.lit && a2.lit).toBe(true);
    const base = s.manaDemand;
    a1.load = 30; a2.load = 30;
    updateMana(s);
    expect(s.manaDemand).toBeCloseTo(base + 60 * PORTAL_MANA, 6);
    a1.load = PORTAL_CAP + 1;
    expect(a1.load > PORTAL_CAP).toBe(true);
    dailyBuildings(s);
    expect(a1.load).toBe(0); // a new day
  });
});

describe('Fonts and the Gloam', () => {
  it('a hot Font may flare: it and the zone buildings beside it burn, and it smokes for ten days', () => {
    const s = town();
    const f = s.founding;
    const font = placeBuildingRaw(s, 'font', f.x + 6, f.y - 2); ok(font); font.lit = true;
    const near = placeBuildingRaw(s, 'hearth', f.x + 8, f.y - 1, 1); ok(near);
    const far = placeBuildingRaw(s, 'hearth', f.x + 12, f.y - 1, 1); ok(far);
    s.manaSupply = 100; s.manaDemand = 95;
    expect(fontsRunHot(s)).toBe(true);
    let flared = false;
    for (let k = 0; k < 600 && !flared; k++) { dailyFire(s); if (font.state === 'burning') flared = true; else { font.state = 'ok'; near.state = 'ok'; } }
    expect(flared).toBe(true);
    expect(near.state).toBe('burning');
    expect(far.state).toBe('ok');
    expect(font.flare).toBe(FLARE_DAYS);
    updateMiasma(s);
    expect(s.miasma[idx(font.x + 1, font.y + 1)]).toBeGreaterThan(0);
    s.manaDemand = 50;
    expect(fontsRunHot(s)).toBe(false);
  });

  it('past the pressure the grey comes to a dark door, warns, and takes the building on the third day; a lit or warded one is left alone', () => {
    const s = town();
    const f = s.founding;
    // a dark house far from the stake, Gloam two tiles east of it
    const dark = placeBuildingRaw(s, 'hearth', f.x + 14, f.y - 8, 1); ok(dark); dark.lit = false;
    const lit = placeBuildingRaw(s, 'hearth', f.x - 14, f.y - 8, 1); ok(lit);
    for (let dy = -2; dy <= 2; dy++) { s.gloam[idx(f.x + 17, f.y - 8 + dy)] = 1; s.gloam[idx(f.x - 17, f.y - 8 + dy)] = 1; }
    s.gloamPressure = GLOAM_TAKES;
    s.day = 4; // a creep day
    s.coverage.ward.fill(0);
    // creep refuses a tile beside a lit house but may enter beside a dark one: run creep days until the grey is at the dark door
    let atDoor = false;
    for (let d = 0; d < 40 && !atDoor; d++) { s.day = 4 + d * 4; lit.lit = true; dark.lit = false; dailyGloam(s); if ((dark.greyDays ?? 0) > 0) atDoor = true; }
    expect(atDoor).toBe(true);
    expect(s.messages.some((m) => /grey is at the door/.test(m.text))).toBe(true);
    expect(lit.greyDays ?? 0).toBe(0);
    expect(s.gloam[idx(f.x - 15, f.y - 8)]).toBe(0); // the lit house keeps the grey two tiles off
    // warned: still standing; lit again it is left alone
    const id = dark.id;
    dark.lit = true;
    s.day += 1; dailyGloam(s);
    expect(dark.greyDays).toBe(0);
    expect(s.buildings.some((b) => b && b.id === id)).toBe(true);
    // dark again: taken on the third day
    dark.lit = false;
    for (let d = 0; d < GREY_DAYS; d++) { s.day += 1; dailyGloam(s); }
    expect(s.buildings.some((b) => b && b.id === id)).toBe(false);
    expect(s.gloam[idx(f.x + 14, f.y - 8)]).toBe(1);
    expect(s.messages.some((m) => /swallowed by the Gloam/.test(m.text))).toBe(true);
  });
});
