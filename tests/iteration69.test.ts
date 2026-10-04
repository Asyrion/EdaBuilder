/** Iteration 69 (DESIGN 4.100, the Great Gate and the Heart of Belregi): the gatehouse raised beside a Belregi gate, its ward and
 *  the gates' longer reach, its pilgrims, the three tales of the Heart on their own terms, the record of the gates they recite,
 *  old saves, and a sprite. */
import { describe, expect, it } from 'vitest';
import { createGame, canPlaceBuilding, placeBuildingRaw } from '../src/sim/world';
import { coverageAt, updateCoverage } from '../src/sim/services';
import { WALKER_JOBS } from '../src/sim/walkers';
import { ALL_EVENTS, EVENTS, dailyGatePilgrims, gateRecord, heartTrust, maybeFireHeart, resolveEvent } from '../src/sim/events';
import { BELREGI_REACH, BELREGI_REACH_GREAT, BELREGI_REACH_HEART, GREAT_GATE_REACH_HEART, HEART_STEP_DAYS, PASS_ALMS, PASS_PILGRIMS, PASS_PILGRIM_DAY, WARDEN_DAYS, belregiReach, greatGateReach, passPilgrims, pilgrimsDue } from '../src/sim/gate';
import { deserialize, serialize } from '../src/sim/save';
import { BUILDING_BY_KEY } from '../src/sim/catalog';
import { generateSprites } from '../src/render/sprites';
import { Zone, idx, type Building, type GameState } from '../src/sim/types';
import { flatten } from './helpers';

/** A flat valley with a north–south Warding Wall five tiles east of the stake, a Belregi gate in it, and a road through the gate. */
function walled(seed = 7): { s: GameState; gx: number; gy: number } {
  const s = createGame(seed, 'Gatewick');
  const f = s.founding;
  flatten(s, f.x - 40, f.y - 40, f.x + 40, f.y + 40);
  s.sectors.fill(1);
  s.milestone = 6;
  const gx = f.x + 8;
  for (let y = f.y - 12; y <= f.y + 12; y++) s.wall[idx(gx, y)] = 1;
  const gy = f.y + 6;
  s.wall[idx(gx, gy)] = 2;
  for (let x = gx - 6; x <= gx + 6; x++) s.road[idx(x, gy)] = 1;
  return { s, gx, gy };
}
/** The Great Gate west of the gate tile, under the road, standing and lit. */
function raise(s: GameState, gx: number, gy: number): Building {
  const b = placeBuildingRaw(s, 'greatgate', gx - 3, gy - 3);
  b.state = 'ok';
  b.lit = true;
  return b;
}
const answer = (s: GameState, id: string, choice: number) => s.firedEvents.push(`${id}:${choice}`);

describe('The Great Gate', () => {
  it('is a wonder of the Burgh that must stand beside a Belregi gate', () => {
    const def = BUILDING_BY_KEY.greatgate;
    expect(def.wonder).toBe(true);
    expect(def.unlock).toBe(6);
    expect(def.w).toBe(3);
    const { s, gx, gy } = walled();
    expect(canPlaceBuilding(s, 'greatgate', gx - 3, gy - 3)).toBeNull(); // touches the gate tile and the road
    s.road[idx(gx - 4, gy - 8)] = 1;
    expect(canPlaceBuilding(s, 'greatgate', gx - 3, gy - 9)).toMatch(/Belregi gate/); // beside the wall and a road, but no gate
    s.wall[idx(gx, gy)] = 3; // an Uzulim gate does not serve
    expect(canPlaceBuilding(s, 'greatgate', gx - 3, gy - 3)).toMatch(/Belregi gate/);
  });

  it('wards 20 tiles of its own, 30 with the Heart; at six tenths once the Heart is sold', () => {
    const { s, gx, gy } = walled();
    const b = raise(s, gx, gy);
    const cx = b.x + 1;
    const cy = b.y + 1;
    updateCoverage(s, 'ward');
    expect(coverageAt(s, 'ward', cx - 18, cy)).toBeGreaterThan(0);
    expect(coverageAt(s, 'ward', cx - 25, cy)).toBe(0);
    s.heart.held = 'set';
    expect(greatGateReach(s)).toBe(GREAT_GATE_REACH_HEART);
    updateCoverage(s, 'ward');
    expect(coverageAt(s, 'ward', cx - 25, cy)).toBeGreaterThan(0);
    s.heart.held = 'none';
    updateCoverage(s, 'ward');
    const full = coverageAt(s, 'ward', cx - 12, cy); // beyond the Belregi gate's own 8
    s.heart.held = 'sold';
    updateCoverage(s, 'ward');
    expect(coverageAt(s, 'ward', cx - 12, cy)).toBeLessThan(full * 0.8);
    b.lit = false; // dark, it wards nothing
    updateCoverage(s, 'ward');
    expect(coverageAt(s, 'ward', cx - 12, cy)).toBe(0);
  });

  it('the Belregi gates reach 8 alone, 12 beside a lit Great Gate, 16 with the Heart set', () => {
    const { s, gx, gy } = walled();
    // a second Belregi gate far up the wall, away from the Great Gate's own ward
    const g2 = gy - 18;
    for (let y = g2 - 2; y <= g2 + 2; y++) s.wall[idx(gx, y)] = 1;
    s.wall[idx(gx, g2)] = 2;
    updateCoverage(s, 'faith');
    expect(belregiReach(s)).toBe(BELREGI_REACH);
    expect(coverageAt(s, 'faith', gx + 10, g2)).toBe(0);
    const b = raise(s, gx, gy);
    expect(belregiReach(s)).toBe(BELREGI_REACH_GREAT);
    updateCoverage(s, 'faith');
    expect(coverageAt(s, 'faith', gx + 10, g2)).toBeGreaterThan(0);
    expect(coverageAt(s, 'faith', gx + 14, g2)).toBe(0);
    s.heart.held = 'set';
    expect(belregiReach(s)).toBe(BELREGI_REACH_HEART);
    updateCoverage(s, 'faith');
    expect(coverageAt(s, 'faith', gx + 14, g2)).toBeGreaterThan(0);
    b.lit = false;
    expect(belregiReach(s)).toBe(BELREGI_REACH);
  });

  it('sends three pilgrims while lit', () => {
    const { s, gx, gy } = walled();
    const b = raise(s, gx, gy);
    expect(WALKER_JOBS.pilgrim.from).toContain('greatgate');
    expect(WALKER_JOBS.pilgrim.count(s, b)).toBe(3);
    b.lit = false;
    expect(WALKER_JOBS.pilgrim.count(s, b)).toBe(0);
  });

  it('lodges pilgrims of the Pass on the 15th of each season: 12, 24 with the Guardians, none once sold', () => {
    const { s, gx, gy } = walled();
    raise(s, gx, gy);
    const f = s.founding;
    for (let k = 0; k < 10; k++) { const h = placeBuildingRaw(s, 'hearth', f.x - 6 + k, f.y - 6); h.state = 'ok'; h.residents = 0; }
    expect(BUILDING_BY_KEY.hearth.zone).toBe(Zone.Hearth);
    s.day = 30 + PASS_PILGRIM_DAY - 1;
    expect(pilgrimsDue(s)).toBe(1);
    const t0 = s.treasury;
    dailyGatePilgrims(s);
    expect(s.stats.gatePilgrims).toBe(0);
    s.day++;
    expect(passPilgrims(s)).toBe(PASS_PILGRIMS);
    dailyGatePilgrims(s);
    expect(s.stats.gatePilgrims).toBe(PASS_PILGRIMS);
    expect(s.treasury - t0).toBe(PASS_PILGRIMS * PASS_ALMS);
    s.heart.held = 'guardians';
    expect(passPilgrims(s)).toBe(PASS_PILGRIMS * 2);
    s.heart.held = 'sold';
    expect(passPilgrims(s)).toBe(0);
    s.day += 30;
    dailyGatePilgrims(s);
    expect(s.stats.gatePilgrims).toBe(PASS_PILGRIMS);
  });
});

describe('The record of the gates', () => {
  it('reads the earlier answers at the gate and the gates in the wall', () => {
    const { s, gx } = walled();
    expect(gateRecord(s).map((d) => d.trust)).toEqual([1]); // one Belregi gate, no Uzulim
    answer(s, 'pilgrims', 0);
    answer(s, 'pilgrims_shrine', 0);
    answer(s, 'lanternfair', 1);
    answer(s, 'egg_poachers', 0);
    expect(heartTrust(s)).toBe(1 + 2 - 2);
    for (let y = 0; y < 3; y++) s.wall[idx(gx, s.founding.y - 10 + y)] = 3; // three Uzulim gates outnumber the Belregi
    expect(heartTrust(s)).toBe(-1);
    expect(gateRecord(s).some((d) => /Uzulim gates than Belregi/.test(d.text))).toBe(true);
  });
});

describe('The Heart of Belregi', () => {
  it('stays out of the storyteller\'s pool and fires nothing without a Great Gate', () => {
    for (const id of ['heart_warden', 'heart_obelisks', 'heart_wakes']) {
      expect(EVENTS.some((e) => e.id === id)).toBe(false);
      expect(ALL_EVENTS.some((e) => e.id === id)).toBe(true);
    }
    const { s } = walled();
    s.day = 200;
    maybeFireHeart(s);
    expect(s.pendingEvent).toBeNull();
    expect(s.heart).toEqual({ held: 'none', step: 0, day: -1 });
  });

  it('the High Warden comes ten days after the Gate stands lit, and recites the record', () => {
    const { s, gx, gy } = walled();
    answer(s, 'pilgrims', 0);
    raise(s, gx, gy);
    s.day = 100;
    maybeFireHeart(s);
    expect(s.pendingEvent).toBeNull();
    expect(s.heart.day).toBe(100);
    s.day = 100 + WARDEN_DAYS;
    maybeFireHeart(s);
    expect(s.pendingEvent?.id).toBe('heart_warden');
    expect(s.pendingEvent?.text).toMatch(/pilgrims of Aume/);
    resolveEvent(s, 0);
    expect(s.heart).toEqual({ held: 'set', step: 1, day: 100 + WARDEN_DAYS });
  });

  it('with an Uzulim gate the obelisks come; sharing quiets the Uzulim unrest', () => {
    const { s, gx, gy } = walled();
    s.wall[idx(gx, s.founding.y - 10)] = 3;
    raise(s, gx, gy);
    s.heart = { held: 'set', step: 1, day: 100 };
    s.day = 100 + HEART_STEP_DAYS - 1;
    maybeFireHeart(s);
    expect(s.pendingEvent).toBeNull();
    s.day++;
    maybeFireHeart(s);
    expect(s.pendingEvent?.id).toBe('heart_obelisks');
    resolveEvent(s, 1);
    expect(s.heart.held).toBe('shared');
    expect(s.heart.step).toBe(2);
    expect(belregiReach(s)).toBe(BELREGI_REACH_GREAT);
  });

  it('without an Uzulim gate the obelisks are skipped, and the Heart wakes in the Hush', () => {
    const { s, gx, gy } = walled();
    raise(s, gx, gy);
    s.heart = { held: 'set', step: 1, day: 100 };
    s.day = 100 + HEART_STEP_DAYS; // day 120: the Thaw of year two
    maybeFireHeart(s);
    expect(s.pendingEvent).toBeNull();
    expect(s.heart.step).toBe(2);
    s.day = 210; // the Hush
    maybeFireHeart(s);
    expect(s.pendingEvent?.id).toBe('heart_wakes');
    // ask it to hold the Gloam: grey ground near the Gate is cleared
    const g = s.buildings.find((b) => b && b.kind === 'greatgate')!;
    const i = idx(g.x - 10, g.y);
    s.gloam[i] = 1;
    resolveEvent(s, 0);
    expect(s.gloam[i]).toBe(0);
    expect(s.heart.step).toBe(3);
    s.day = 330;
    maybeFireHeart(s);
    expect(s.pendingEvent).toBeNull(); // the chain is over
  });

  it('the Guardians keep it: no obelisks, and word of the waking comes from the Pass', () => {
    const { s, gx, gy } = walled();
    s.wall[idx(gx, s.founding.y - 10)] = 3;
    raise(s, gx, gy);
    s.heart = { held: 'guardians', step: 1, day: 100 };
    s.day = 210;
    maybeFireHeart(s);
    expect(s.pendingEvent?.id).toBe('heart_wakes');
    expect(s.pendingEvent?.text).toMatch(/Guardians send word/);
  });

  it('a cold Heart gives half; selling it ends the tales', () => {
    const { s, gx, gy } = walled();
    raise(s, gx, gy);
    answer(s, 'lanternfair', 1);
    answer(s, 'egg_poachers', 0);
    expect(heartTrust(s)).toBeLessThan(0);
    s.heart = { held: 'set', step: 2, day: 150 };
    s.day = 210;
    maybeFireHeart(s);
    expect(s.pendingEvent?.text).toMatch(/cold toward you/);
    expect(s.pendingEvent?.choices[2].desc).toMatch(/\+2/);
    resolveEvent(s, 2);
    expect(s.modifiers.some((m) => m.label === 'A friend of the Pass' && m.value === 2)).toBe(true);

    const w = walled(8);
    raise(w.s, w.gx, w.gy);
    w.s.heart.day = 100;
    w.s.day = 110;
    maybeFireHeart(w.s);
    const t0 = w.s.treasury;
    resolveEvent(w.s, 2);
    expect(w.s.heart.held).toBe('sold');
    expect(w.s.treasury - t0).toBe(6000);
    w.s.day = 210;
    maybeFireHeart(w.s);
    expect(w.s.pendingEvent).toBeNull();
  });
});

describe('Saves and sprites', () => {
  it('a save without the Heart loads as none; the Heart round-trips', () => {
    const { s, gx, gy } = walled();
    raise(s, gx, gy);
    s.heart = { held: 'guardians', step: 2, day: 123 };
    const back = deserialize(serialize(s), (seed) => createGame(seed, 'x'));
    expect(back.heart).toEqual({ held: 'guardians', step: 2, day: 123 });
    const o = JSON.parse(serialize(s));
    delete o.heart;
    delete o.stats.gatePilgrims;
    const old = deserialize(JSON.stringify(o), (seed) => createGame(seed, 'x'));
    expect(old.heart).toEqual({ held: 'none', step: 0, day: -1 });
    expect(old.stats.gatePilgrims).toBe(0);
  });

  it('the Great Gate has a drawn sprite with a glow', () => {
    const spr = generateSprites().find((d) => d.name === 'b_greatgate');
    expect(spr).toBeTruthy();
    expect(spr!.p.w).toBe(98); // a 3×3 footprint
    let lit = 0;
    for (let i = 3; i < spr!.glow!.data.length; i += 4) if (spr!.glow!.data[i] > 0) lit++;
    expect(lit).toBeGreaterThan(20); // the Heart and the runes glow
  });
});
