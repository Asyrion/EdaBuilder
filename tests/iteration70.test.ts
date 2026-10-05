/** Iteration 70 (DESIGN 4.101, two ways to lose): the wyrm refused three times running razes the Founding Stake unless a great
 *  wyrm meets it; three nights of hounds at a dark home's door in the Hush drive its folk out until the Thaw, half a district
 *  fled empties it, and a third emptied in one Hush brings the Long Night early. Every loss names its cause; old saves load. */
import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { ALL_EVENTS, maybeFireWyrm, resolveEvent } from '../src/sim/events';
import { WYRM_STARVE_LIMIT, payTribute, refuse } from '../src/sim/wyrm';
import { tickCreatures } from '../src/sim/creatures';
import { worth } from '../src/sim/botPolicy';
import { FLEE_NIGHTS, LONG_NIGHT_UNITS, MARCH_UNIT, dailyHush, houndAtDoor, houndLine, unitHomes, unitOf } from '../src/sim/hounds';
import { sectorOf } from '../src/sim/sectors';
import { deserialize, serialize } from '../src/sim/save';
import { ANNALS } from '../src/data/annals';
import { advise } from '../src/data/quests';
import { AgentKind, type Building, type Dragon, type GameState } from '../src/sim/types';
import { flatten } from './helpers';

/** A game whose map has a Sleeping Wyrm, woken and asking. */
function woken(): GameState {
  for (let seed = 70; seed < 120; seed++) {
    const s = createGame(seed, 'Wyrmwick');
    if (s.wyrm.node < 0) continue;
    s.wyrm.state = 'awake';
    s.wyrm.tributeDay = s.day;
    s.treasury = 100000;
    return s;
  }
  throw new Error('no wyrm map');
}
/** Fly the wyrm until it lands home or the game ends. */
function flyOut(s: GameState): void {
  for (let k = 0; k < 40000 && s.agents.some((a) => a.kind === AgentKind.Creature && a.species === 'wyrm') && !s.gameOver; k++) { s.tick++; tickCreatures(s); }
}

describe('The valley belongs to the wyrm', () => {
  it('counts refusals in a row, warns at the first and the second, and a tribute paid starts the count again', () => {
    const s = woken();
    refuse(s);
    expect(s.wyrm.starved).toBe(1);
    expect(s.messages.some((m) => /a third would be the last/.test(m.text))).toBe(true);
    flyOut(s);
    s.wyrm.state = 'awake';
    refuse(s);
    expect(s.wyrm.starved).toBe(2);
    expect(s.messages.some((m) => /comes for the Founding Stake/.test(m.text))).toBe(true);
    for (let k = 0; k < 4; k++) { const h = placeBuildingRaw(s, 'hearth', s.founding.x - 3 + k, s.founding.y + 4, 1); h.state = 'ok'; } // the Advisor speaks to a town
    expect(advise(s)?.text).toMatch(/refused 2 times running/);
    flyOut(s);
    expect(s.gameOver).toBeNull();
    s.wyrm.state = 'awake';
    payTribute(s, 'crowns');
    expect(s.wyrm.starved).toBe(0);
    expect(s.stats.wyrmStarvedMost).toBe(2);
  });

  it('the last asking says so, and the third refusal razes the Founding Stake', () => {
    const s = woken();
    s.wyrm.starved = WYRM_STARVE_LIMIT - 1;
    maybeFireWyrm(s);
    expect(s.pendingEvent?.title).toBe("The wyrm's last asking");
    expect(s.pendingEvent?.choices[2].desc).toMatch(/game ends/);
    resolveEvent(s, 2);
    expect(s.wyrm.razing).toBe(true);
    expect(worth(s)).toBe(-1e9); // the bot sees the razing coming before it lands
    flyOut(s);
    expect(s.lostTo).toBe('wyrm');
    expect(s.gameOver).toMatch(/valley belongs to the wyrm/);
    expect(s.buildings.find((b) => b && b.kind === 'stake')?.state).toBe('ruin');
  });

  it('goods short of half are a refusal too', () => {
    const s = woken();
    s.wyrm.starved = WYRM_STARVE_LIMIT - 1;
    payTribute(s, 'goods'); // no market holds any goods
    expect(s.wyrm.razing).toBe(true);
  });

  it('a great wyrm of the city\'s own meets the razing flight: the Stake stands and the count starts again', () => {
    const s = woken();
    s.dragons.push({ id: 1, name: 'Ashmaw', line: 'ember', stage: 4 } as unknown as Dragon);
    s.wyrm.starved = WYRM_STARVE_LIMIT - 1;
    refuse(s);
    expect(s.wyrm.razing).toBe(false);
    expect(s.wyrm.starved).toBe(0);
    flyOut(s);
    expect(s.gameOver).toBeNull();
    expect(s.buildings.find((b) => b && b.kind === 'stake')?.state).not.toBe('ruin');
  });

  it('the bot pays the third time rather than refuse', () => {
    const s = woken();
    s.wyrm.starved = WYRM_STARVE_LIMIT - 1;
    const tale = ALL_EVENTS.find((e) => e.id === 'wyrm_tribute')!;
    const copy = structuredClone(s);
    tale.choices[2].apply(copy);
    expect(worth(copy)).toBe(-1e9);
    const paid = structuredClone(s);
    tale.choices[0].apply(paid);
    expect(worth(paid)).toBeGreaterThan(-1e9);
  });
});

/** A flat valley in the Hush with a row of homes, all occupied, some in a painted district. */
function hush(): { s: GameState; homes: Building[] } {
  const s = createGame(70, 'Houndwick');
  const f = s.founding;
  flatten(s, f.x - 30, f.y - 30, f.x + 30, f.y + 30);
  s.day = 90; // the first day of the Hush, year 0
  dailyHush(s);
  const homes: Building[] = [];
  for (let k = 0; k < 8; k++) {
    const b = placeBuildingRaw(s, 'hearth', f.x - 4 + k, f.y + 6, 1);
    b.state = 'ok';
    b.residents = 4;
    homes.push(b);
  }
  return { s, homes };
}
/** Hounds at a home's door on n nights from today. */
function nights(s: GameState, b: Building, n: number): void {
  for (let k = 0; k < n; k++) { houndAtDoor(s, b); houndAtDoor(s, b); s.day++; } // twice a night counts once
}

describe('The Long Night comes early', () => {
  it('a night counts once; three drive a home\'s folk out until the Thaw, and the panel says so', () => {
    const { s, homes } = hush();
    const b = homes[0];
    nights(s, b, FLEE_NIGHTS - 1);
    expect(b.hounded).toBe(FLEE_NIGHTS - 1);
    expect(b.residents).toBe(4);
    expect(houndLine(s, b)).toMatch(/2 of 3 nights/);
    expect(s.messages.some((m) => /two nights now/.test(m.text))).toBe(true);
    nights(s, b, 1);
    expect(b.residents).toBe(0);
    expect(b.fled).toBe(0);
    expect(houndLine(s, b)).toMatch(/until the Thaw/);
    expect(s.stats.houndFled).toBe(1);
  });

  it('outside the Hush, or at an empty or fled home, the hounds count nothing', () => {
    const { s, homes } = hush();
    s.day = 40;
    nights(s, homes[0], 5);
    expect(homes[0].hounded).toBeUndefined();
    s.day = 95;
    homes[1].residents = 0;
    nights(s, homes[1], 5);
    expect(homes[1].fled).toBeUndefined();
  });

  it('homes in no district count by their march; half of a unit fled empties it', () => {
    const { s, homes } = hush();
    const u = unitOf(s, homes[0]);
    expect(u).toBe(MARCH_UNIT + sectorOf(homes[0].x, homes[0].y));
    const start = s.day;
    for (let k = 0; k < 4; k++) { s.day = start; nights(s, homes[k], FLEE_NIGHTS); }
    expect(unitHomes(s, u)).toEqual({ homes: 8, fled: 4 });
    expect(s.hush.emptied).toEqual([u]);
    expect(s.stats.houndEmptied).toBe(1);
    expect(s.messages.some((m) => /Two more districts emptied this Hush/.test(m.text))).toBe(true);
    expect(advise(s)?.text).toMatch(/emptied 1 district/);
    expect(s.gameOver).toBeNull();
  });

  it('the third unit emptied in one Hush brings the Long Night early; the Thaw clears it all', () => {
    const { s } = hush();
    const f = s.founding;
    // three painted districts of four homes each
    const units: Building[][] = [];
    for (let d = 1; d <= LONG_NIGHT_UNITS; d++) {
      const row: Building[] = [];
      for (let k = 0; k < 4; k++) {
        const b = placeBuildingRaw(s, 'hearth', f.x - 10 + k, f.y - 12 + d * 3, 1);
        b.state = 'ok';
        b.residents = 3;
        s.district[b.y * s.w + b.x] = d;
        row.push(b);
      }
      units.push(row);
    }
    const start = s.day;
    for (const [i, row] of units.entries()) {
      for (const b of row.slice(0, 2)) { s.day = start; nights(s, b, FLEE_NIGHTS); }
      if (i < LONG_NIGHT_UNITS - 1) expect(s.gameOver).toBeNull();
    }
    expect(s.hush.emptied).toEqual([1, 2, 3]);
    expect(s.lostTo).toBe('hounds');
    expect(s.gameOver).toMatch(/Long Night comes early/);

    const t = hush();
    for (const b of t.homes.slice(0, 2)) { t.s.day = 95; nights(t.s, b, FLEE_NIGHTS); }
    expect(t.homes[0].fled).toBe(0);
    t.s.day = 120; // the Thaw
    dailyHush(t.s);
    expect(t.homes[0].fled).toBeUndefined();
    expect(t.homes[0].hounded).toBeUndefined();
    expect(t.s.hush.emptied).toEqual([]);
  });
});

describe('Causes, the Annals and old saves', () => {
  it('every new counter has an Annals row', () => {
    const rows = new Set(ANNALS.flatMap((c) => c.rows.map((r) => r.stat)));
    for (const k of ['wyrmStarvedMost', 'houndFled', 'houndEmptied']) expect(rows.has(k as never)).toBe(true);
  });

  it('a save without the new fields loads with the defaults; a fled home round-trips', () => {
    const { s, homes } = hush();
    nights(s, homes[0], FLEE_NIGHTS);
    s.wyrm.starved = 2;
    const back = deserialize(serialize(s), (seed) => createGame(seed, 'x'));
    expect(back.wyrm.starved).toBe(2);
    expect(back.buildings.find((b) => b && b.id === homes[0].id)?.fled).toBe(0);
    const o = JSON.parse(serialize(s));
    delete o.hush;
    delete o.wyrm.starved;
    delete o.wyrm.razing;
    delete o.lostTo;
    const old = deserialize(JSON.stringify(o), (seed) => createGame(seed, 'x'));
    expect(old.wyrm.starved).toBe(0);
    expect(old.wyrm.razing).toBe(false);
    expect(old.hush).toEqual({ year: -1, emptied: [] });
    expect(old.lostTo).toBeUndefined();
  });
});
