// Iteration 49: road corners, districts in steps, the demand bars explained, the Founding Stake that grows.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { STAKE_STAGE_AT, canPlaceBuilding, createGame, placeBuildingRaw, roadInRing, stakeHallName, stakeSpriteName, stakeStage, touchesRoad } from '../src/sim/world';
import { roadTileOf } from '../src/sim/agents';
import { buildRoad, paintDistrict, roadPath } from '../src/sim/actions';
import { MAX_DISTRICTS, RoadType, Zone, idx } from '../src/sim/types';
import { demandExplain, demandReasons, trySpawnBuildings, updateDemand } from '../src/sim/growth';
import { DISTRICT_SLOTS, charterLocked, districtInUse, districtOpenAt, districtSlots, districtUnlockNotes, setQuarter } from '../src/sim/districts';
import { activeQuests } from '../src/sim/quests';
import { deserialize, serialize } from '../src/sim/save';
import { recomputeAll } from '../src/sim/sim';
import { flatten } from './helpers';

function town(seed = 41) {
  const s = createGame(seed, 'Cornerwick');
  const f = s.founding;
  flatten(s, f.x - 20, f.y - 14, f.x + 20, f.y + 16);
  buildRoad(s, RoadType.Track, roadPath(f.x - 10, f.y + 2, f.x + 5, f.y + 2, false)); // ends at f.x + 5
  s.sectors.fill(1);
  s.treasury = 50000;
  recomputeAll(s);
  return s;
}

describe('A road at the corner', () => {
  it('a corner counts for a 1×1 and a 2×2, a bare ring refuses, and a hall may stand corner-to-road', () => {
    const s = town();
    const f = s.founding;
    expect(touchesRoad(s, f.x + 6, f.y + 3, 1, 1)).toBe(true); // diagonal to the road's end
    expect(roadInRing(s, f.x + 6, f.y + 3)).toBe(true);
    expect(roadInRing(s, f.x + 7, f.y + 3)).toBe(false);
    expect(touchesRoad(s, f.x + 6, f.y + 3, 2, 2)).toBe(true);
    expect(touchesRoad(s, f.x + 7, f.y + 3, 2, 2)).toBe(false);
    expect(canPlaceBuilding(s, 'well', f.x + 6, f.y + 3)).toBeNull();
    expect(canPlaceBuilding(s, 'well', f.x + 8, f.y + 3)).toBe('Must touch a road (a corner counts)');
  });

  it('the door prefers a side and falls back to the corner; a zone tile diagonal to the road end grows', () => {
    const s = town();
    const f = s.founding;
    const side = placeBuildingRaw(s, 'hearth', f.x, f.y + 3);
    expect(roadTileOf(s, side)).toBe(idx(f.x, f.y + 2));
    const corner = placeBuildingRaw(s, 'hearth', f.x + 6, f.y + 3);
    expect(roadTileOf(s, corner)).toBe(idx(f.x + 5, f.y + 2));
    const far = placeBuildingRaw(s, 'hearth', f.x + 8, f.y + 3);
    expect(roadTileOf(s, far)).toBe(-1);
    // growth on the diagonal lot
    const t = town(43);
    const g = t.founding;
    const i = idx(g.x + 6, g.y + 3);
    t.zone[i] = Zone.Hearth;
    t.demand.hearth = 1;
    for (let k = 0; k < 400 && t.bIndex[i] < 0; k++) trySpawnBuildings(t, 5);
    expect(t.bIndex[i]).toBeGreaterThanOrEqual(0);
    expect(t.buildings[t.bIndex[i]]!.kind).toBe('hearth');
  });
});

describe('Districts in steps', () => {
  it('slots open 2/4/6/8 at the Hamlet, Village, Market Town and Burgh; painting past the slots is refused with the milestone', () => {
    const s = town();
    const f = s.founding;
    expect(DISTRICT_SLOTS).toEqual([[1, 2], [3, 4], [5, 6], [6, 8]]);
    const bySlot = [0, 1, 2, 3, 4, 5, 6, 7].map((m) => { s.milestone = m; return districtSlots(s); });
    expect(bySlot).toEqual([0, 2, 2, 4, 4, 6, 8, 8]);
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(districtOpenAt)).toEqual([1, 1, 3, 3, 5, 5, 6, 6]);
    s.milestone = 1;
    expect(paintDistrict(s, 2, f.x - 8, f.y - 4, f.x - 2, f.y).ok).toBe(true);
    const r = paintDistrict(s, 3, f.x + 2, f.y - 4, f.x + 8, f.y);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/opens at the Village$/);
    expect(paintDistrict(s, 0, f.x - 8, f.y - 4, f.x - 2, f.y).ok).toBe(true); // clearing is always allowed
    expect(paintDistrict(s, MAX_DISTRICTS + 1, f.x, f.y, f.x, f.y).reason).toBe('No such district');
    s.milestone = 3;
    expect(paintDistrict(s, 3, f.x + 2, f.y - 4, f.x + 8, f.y).ok).toBe(true);
    expect(districtInUse(s, 3)).toBe(true);
  });

  it('an old save with six districts at the Hamlet keeps them, may extend them, but cannot paint a seventh', () => {
    const s = town();
    const f = s.founding;
    s.milestone = 6;
    for (let d = 1; d <= 6; d++) expect(paintDistrict(s, d, f.x - 12 + d * 3, f.y - 6, f.x - 10 + d * 3, f.y - 4).ok).toBe(true);
    const o = JSON.parse(serialize(s));
    o.milestone = 1;
    const u = deserialize(JSON.stringify(o), (seed) => createGame(seed));
    expect(districtInUse(u, 6)).toBe(true);
    expect(districtSlots(u)).toBe(2);
    expect(paintDistrict(u, 6, f.x + 8, f.y - 6, f.x + 10, f.y - 4).ok).toBe(true);
    expect(paintDistrict(u, 7, f.x + 12, f.y - 6, f.x + 14, f.y - 4).ok).toBe(false);
    expect(u.lessonsSeen).toEqual([]);
    u.lessonsSeen.push('districts');
    expect(deserialize(serialize(u), (seed) => createGame(seed)).lessonsSeen).toEqual(['districts']);
  });

  it('charters open in steps, the notes name them, and the Districts chapter pins first', () => {
    const s = town();
    s.milestone = 1;
    expect(setQuarter(s, 1, 'hearth')).toBeNull();
    expect(setQuarter(s, 1, 'market')).toBe('Opens at the Village');
    expect(s.districtQuarters[1]).toBe('hearth');
    expect(charterLocked(s, 'temple')).toBe('Opens at the Market Town');
    expect(charterLocked(s, 'scholars')).toBe('Opens at the Township');
    s.milestone = 5; s.day += 30; // the hearth charter's thirty-day hold has run (iteration 54)
    expect(setQuarter(s, 1, 'temple')).toBeNull();
    s.day += 30;
    expect(setQuarter(s, 1, null)).toBeNull();
    expect(s.districtQuarters[1]).toBeUndefined();
    expect(districtUnlockNotes(1)).toEqual([]);
    expect(districtUnlockNotes(2)).toEqual([]);
    expect(districtUnlockNotes(3)).toEqual(['Two more districts open: four of eight.', 'The Market charter is yours.']);
    expect(districtUnlockNotes(4)).toEqual(["The Scholars' charter is yours."]);
    expect(districtUnlockNotes(5)).toEqual(['Two more districts open: six of eight.', 'The Temple charter is yours.']);
    expect(districtUnlockNotes(6)).toEqual(['The last two districts open.']);
    s.milestone = 1;
    expect(activeQuests(s, 3, 'Districts')[0].chapter).toBe('Districts');
  });
});

describe('The demand bars explained', () => {
  it('says the sign, the verdict, the numbers and the advice; the old four lines stay', () => {
    const s = town();
    s.population = 140;
    updateDemand(s);
    s.demand.hearth = 0.62;
    s.demand.market = -0.3;
    s.demand.craft = 0.02;
    s.demand.arcane = -0.5;
    const h = demandExplain(s, 'hearth');
    expect(h.sign).toBe('+');
    expect(h.headline).toBe('Hearths +62 %: folk want more homes.');
    expect(h.detail).toMatch(/^\d+ jobs for \d+ hands/);
    expect(h.advice).toBe('New hearths grow where you zone them beside a road.');
    const m = demandExplain(s, 'market');
    expect(m.headline).toBe('Markets −30 %: more shops than the folk can fill.');
    expect(m.detail).toMatch(/market jobs, \d+ wanted for 140 folk/);
    expect(m.advice).toMatch(/^New markets will not grow/);
    const c = demandExplain(s, 'craft');
    expect(c.sign).toBe('0');
    expect(c.headline).toMatch(/^Craft works about even:/);
    const a = demandExplain(s, 'arcane');
    expect(a.advice).toBe('Arcane shops open at the Township.');
    s.milestone = 4;
    updateDemand(s);
    s.demand.arcane = -0.5;
    expect(demandExplain(s, 'arcane').advice).toMatch(/an Academy/);
    expect(demandReasons().length).toBe(4);
    expect(demandReasons()[0]).toMatch(/^Hearth:/);
  });
});

describe('The Founding Stake that grows', () => {
  it('stages by milestone, the sprite name falls back, the hall is named by the people, and the imported sprites are in the manifest', () => {
    const s = town();
    expect(STAKE_STAGE_AT).toEqual([0, 3, 6, 7]);
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map((m) => { s.milestone = m; return stakeStage(s); })).toEqual([0, 0, 0, 1, 1, 1, 2, 3, 3]);
    expect(stakeSpriteName(2, (n) => n === 'b_stake_s2')).toBe('b_stake_s2');
    expect(stakeSpriteName(1, () => false)).toBe('b_stake');
    s.milestone = 0;
    expect(stakeHallName(s)).toBe('the founding hall');
    s.milestone = 6;
    expect(stakeHallName(s)).toBe("the Burgh's hall");
    const manifest = JSON.parse(readFileSync('public/art/sprites.json', 'utf8'));
    for (const k of [0, 1, 2, 3]) {
      const e = manifest.sprites[`b_stake_s${k}`];
      expect(e.file).toBe(`sprites/b_stake_s${k}.png`);
      expect(e.w).toBeLessThanOrEqual(68); // at most the 2×2 footprint and its outline; since iteration 56 scaled to the procedural hall and centred
      expect(e.ax).toBe(Math.round(e.w / 2));
      expect(typeof e.ax).toBe('number');
      expect(typeof e.ay).toBe('number');
    }
  });
});
