/** The player-facing side: the Charter's Ledger (quests, the advisor) and the Chronicle, what an open task still needs, the
 *  key bindings and keyboard focus, the dev tools, and the faction scaffold another people would plug into. */
import { afterAll, describe, expect, it } from 'vitest';
import { canPlaceBuilding, createGame, placeBuildingRaw, pushMessage } from '../src/sim/world';
import { recomputeAll, run } from '../src/sim/sim';
import { buildRoad, paintZone, placeBuilding, roadPath } from '../src/sim/actions';
import { RoadType, TICKS_PER_DAY, Terrain, Zone, idx, type GameState } from '../src/sim/types';
import { activeQuests, checkQuests, questProgress, questsFor } from '../src/sim/quests';
import { NOT_PLAIN_BUILD, QUESTS, advise, buildStatus, questStatus } from '../src/data/quests';
import { serialize, deserialize } from '../src/sim/save';
import { Bot } from '../src/sim/bot';
import { construction } from '../src/sim/construction';
import { DEV_COMMANDS, DEV_GROUPS, devDefaultArg, runDev } from '../src/sim/dev';
import { MILESTONES } from '../src/sim/catalog';
import { FACTIONS, NEUTRAL_RULES, buildsFor, canBuild, factionKey, factionOf, milestonesOf, type FactionId } from '../src/data/factions';
import { checkMilestones } from '../src/sim/economy';
import { updateCoverage, updateLandValue } from '../src/sim/services';
import { updateMana } from '../src/sim/networks';
import { DEFAULT_KEYS, KEY_ACTIONS, keyFor } from '../src/ui/keys';
import { REGIONS, UNBINDABLE, migrateKeys, nextRegion, shortcutTarget } from '../src/ui/focus';
import { flatten } from './helpers';

// The Charter's Ledger and the Chronicle.
describe("The Charter's Ledger (quests)", () => {
  it('has unique ids and every quest belongs to a chapter', () => {
    const ids = new Set(QUESTS.map((q) => q.id));
    expect(ids.size).toBe(QUESTS.length);
    for (const q of QUESTS) {
      expect(q.chapter.length).toBeGreaterThan(0);
      expect(q.hint.length).toBeGreaterThan(10);
    }
  });

  it('starts with the road quest first and shows at most three', () => {
    const s = createGame(7, 'Ledger');
    const q = activeQuests(s);
    expect(q.length).toBeLessThanOrEqual(3);
    expect(q[0].id).toBe('f_road');
    expect(questProgress(s)).toEqual({ done: 0, total: QUESTS.filter((q) => !q.people).length }); // a people's own chapter is not counted for the others
  });

  it('completes quests in order, pays rewards once and writes the Chronicle', () => {
    const s = createGame(7, 'Ledger');
    const f = s.founding;
    flatten(s, f.x - 12, f.y - 4, f.x + 12, f.y + 8);
    expect(checkQuests(s)).toEqual([]);
    buildRoad(s, RoadType.Track, roadPath(f.x - 10, f.y + 3, f.x + 10, f.y + 3, false));
    const done = checkQuests(s);
    expect(done.map((q) => q.id)).toEqual(['f_road']);
    expect(s.questsDone).toContain('f_road');
    expect(checkQuests(s)).toEqual([]); // not paid twice
    expect(activeQuests(s)[0].id).toBe('f_hearth');
    paintZone(s, Zone.Hearth, f.x - 8, f.y + 4, f.x - 1, f.y + 4);
    expect(checkQuests(s).map((q) => q.id)).toEqual(['f_hearth']);
    // A quest that is already satisfied when it becomes available completes and pays.
    s.population = 20;
    s.treasury = 5000;
    placeBuilding(s, 'watchpost', f.x + 1, f.y + 4);
    placeBuilding(s, 'shrine', f.x + 3, f.y + 4);
    const before = s.treasury;
    const ids = checkQuests(s).map((q) => q.id);
    expect(ids).toContain('f_watch');
    expect(s.treasury).toBe(before + 300);
    expect(s.chronicle.some((e) => e.text.includes('Watch Post'))).toBe(true);
  });

  it('is checked daily by the sim and survives save/load', () => {
    const s = createGame(11, 'Ledger');
    const f = s.founding;
    flatten(s, f.x - 12, f.y - 4, f.x + 12, f.y + 8);
    buildRoad(s, RoadType.Track, roadPath(f.x - 10, f.y + 3, f.x + 10, f.y + 3, false));
    recomputeAll(s);
    run(s, 901);
    expect(s.questsDone).toContain('f_road');
    const back = deserialize(serialize(s), (seed) => createGame(seed));
    expect(back.questsDone).toEqual(s.questsDone);
    expect(back.chronicle.length).toBe(s.chronicle.length);
  });

  it('the advisor stays quiet in a tiny town and speaks on overdraw', () => {
    const s = createGame(3, 'Ledger');
    expect(advise(s)).toBeNull();
    for (let k = 0; k < 6; k++) s.buildings.push({ id: 100 + k, kind: 'hearth', x: 1 + k, y: 1, w: 1, h: 1, level: 1, variant: 0, residents: 2, workers: 0, happiness: 50, lit: true, watered: true, state: 'ok', stateDays: 0, progress: 0, age: 1, unhappyDays: 0, dryDays: 0, cooldown: 0, stock: 0, problemDays: 0 } as never);
    s.overdrawDays = 2;
    const a = advise(s);
    expect(a?.text).toMatch(/overdrawn/);
    expect(a?.focus).toEqual({ build: 'nexus' });
  });
});

describe('The Chronicle', () => {
  it('records only world events, milestones and ill tidings, with a place when given', () => {
    const s = createGame(5, 'Chron');
    const n = s.chronicle.length;
    pushMessage(s, 'Not enough crowns.', 'warn');
    expect(s.chronicle.length).toBe(n);
    pushMessage(s, 'A wisp seen at (12,40).', 'info', true);
    expect(s.chronicle.length).toBe(n + 1);
    expect(s.chronicle[n]).toMatchObject({ x: 12, y: 40, day: s.day, kind: 'info' });
    pushMessage(s, 'Fire!', 'bad', false, { x: 3, y: 4 });
    expect(s.chronicle[n + 1]).toMatchObject({ x: 3, y: 4, kind: 'bad' });
    pushMessage(s, 'Chron is now a Hamlet!', 'milestone');
    expect(s.chronicle[n + 2].kind).toBe('milestone');
  });

  it('keeps the last 200 entries', () => {
    const s = createGame(5, 'Chron');
    for (let k = 0; k < 260; k++) pushMessage(s, `event ${k}`, 'info', true);
    expect(s.chronicle.length).toBe(200);
    expect(s.chronicle[199].text).toBe('event 259');
  });

  it('season changes are chronicled', () => {
    const s = createGame(5, 'Chron');
    for (let d = 0; d < 31; d++) run(s, 900);
    expect(s.chronicle.some((e) => /begins/.test(e.text))).toBe(true);
  });
});

// Key bindings.
describe('Key bindings', () => {
  it('have defaults and resolve a bound key to its action', () => {
    expect(keyFor(DEFAULT_KEYS, ' ')).toBe('pause');
    expect(keyFor(DEFAULT_KEYS, 'b')).toBe('bulldoze');
    expect(keyFor({ ...DEFAULT_KEYS, bulldoze: 'q' }, 'q')).toBe('bulldoze');
    expect(keyFor({ ...DEFAULT_KEYS, bulldoze: 'q' }, 'b')).toBeNull();
  });
});

// Keyboard focus: where a shortcut may fire, the regions F6 moves between, the key table that frees Tab, and the keys a player
// may not bind. The DOM side (dialogs holding focus, roving focus in the toolbar) is held by a Playwright script.
describe('Where a shortcut may fire', () => {
  it('on the page and on the map, and nowhere a control or a dialog has focus', () => {
    expect(shortcutTarget(null)).toBe(true);
    expect(shortcutTarget({ tagName: 'BODY' })).toBe(true);
    expect(shortcutTarget({ tagName: 'CANVAS', id: 'game' })).toBe(true);
    expect(shortcutTarget({ tagName: 'CANVAS', id: 'clock' })).toBe(false); // the top bar's clock is not the map
    for (const tagName of ['BUTTON', 'SELECT', 'INPUT', 'A', 'DIV']) expect(shortcutTarget({ tagName })).toBe(false);
  });
});

describe('The regions', () => {
  it('run in screen order and end at the map', () => {
    expect(REGIONS[0]).toBe('topbar');
    expect(REGIONS[1]).toBe('toolbar');
    expect(REGIONS[REGIONS.length - 1]).toBe('game');
  });
  it('F6 moves forward, Shift+F6 back, both wrap and skip a hidden region', () => {
    const all = REGIONS.map(() => true);
    expect(nextRegion(-1, all)).toBe(0);
    expect(nextRegion(0, all)).toBe(1);
    expect(nextRegion(REGIONS.length - 1, all)).toBe(0);
    expect(nextRegion(0, all, true)).toBe(REGIONS.length - 1);
    const someHidden = all.map((v, i) => i !== 2 && i !== 3); // the Ledger and the building panel closed
    expect(nextRegion(1, someHidden)).toBe(4);
    expect(nextRegion(4, someHidden, true)).toBe(1);
    expect(nextRegion(0, all.map(() => false))).toBe(-1);
  });
});

describe('The key table', () => {
  it('Info views is V: Tab moves focus again', () => {
    expect(DEFAULT_KEYS.views).toBe('v');
    for (const k of UNBINDABLE) expect(Object.values(DEFAULT_KEYS)).not.toContain(k);
  });
  it('a saved table from before binds Info views to V, and an unbindable key elsewhere is cleared', () => {
    const old = { ...DEFAULT_KEYS, views: 'tab' };
    expect(migrateKeys(old).views).toBe('v');
    expect(migrateKeys({ ...DEFAULT_KEYS, help: 'f6' }).help).toBe('');
    expect(migrateKeys({ ...DEFAULT_KEYS })).toEqual(DEFAULT_KEYS);
  });
  it('no two actions share a key, and every action has one', () => {
    const vals = KEY_ACTIONS.map((a) => DEFAULT_KEYS[a.id]);
    expect(new Set(vals).size).toBe(vals.length);
    expect(vals.every(Boolean)).toBe(true);
  });
});

// The quests that never complete (DESIGN §4.123): an audit of the Charter tasks found some that a well-played city could not
// finish, or whose text sent the player the wrong way; each is held here.
const Q = (id: string) => QUESTS.find((q) => q.id === id)!;

describe('Iteration 92: the text says what completes the task', () => {
  it('names the Beacon gate', () => {
    expect(Q('c_beacon').hint).toMatch(/happiness gate/);
    expect(Q('c_beacon').focus).toBeUndefined();
  });
});

// What a task still needs (DESIGN §4.124): under each open task the Ledger shows a live line read from the city: a building not
// built, being built, unlit or in ruins, or a counter against its target.
const PEOPLES: FactionId[] = ['vellish'];

describe('Iteration 93: every task says what it still needs', () => {
  it('the list of "build X" tasks with a larger goal matches their conditions', () => {
    const plain = (q: (typeof QUESTS)[number]) => /^\(s\) => has\(s, ['"]\w+['"]\)$/.test(q.done.toString().replace(/\s+/g, ' '));
    const builds = QUESTS.filter((q) => q.focus && 'build' in q.focus);
    for (const q of builds) expect(NOT_PLAIN_BUILD.has(q.id), q.id).toBe(!plain(q));
    for (const id of NOT_PLAIN_BUILD) expect(builds.some((q) => q.id === id), id).toBe(true);
  });

  it('every building task has a line, and no line throws or comes back empty, early, a month in and from an old save, for every people', () => {
    for (const people of PEOPLES) {
      const s = createGame(42, 'Lines', people);
      const states = [s];
      const bot = new Bot(s);
      run(s, TICKS_PER_DAY * 30, { onDay: () => bot.step() });
      states.push(s);
      const raw = JSON.parse(serialize(s));
      delete raw.stats.watchRounds;
      states.push(deserialize(JSON.stringify(raw), (seed) => createGame(seed)));
      const fresh = createGame(7, 'Fresh', people);
      states.push(fresh);
      for (const st of states) for (const q of QUESTS) {
        const line = questStatus(st, q);
        if (q.focus && 'build' in q.focus && !NOT_PLAIN_BUILD.has(q.id)) expect(line, `${people} ${q.id}`).toBeTruthy();
        if (line !== null) expect(line.length, `${people} ${q.id}`).toBeGreaterThan(3);
      }
    }
  });

  it('a Ward-Lantern\'s line walks from not built, through being built, to unlit, then the task is done', () => {
    construction.instant = false; // the site rises over days here
    const s = createGame(42, 'Lantern');
    const f = s.founding;
    flatten(s, f.x - 12, f.y - 8, f.x + 12, f.y + 10);
    s.treasury = 99999; s.milestone = 1; s.sectors.fill(1);
    expect(questStatus(s, Q('g_ward'))).toMatch(/unlocks at/);
    s.milestone = 2;
    expect(questStatus(s, Q('g_ward'))).toMatch(/^Not built yet/);
    buildRoad(s, 1, roadPath(f.x - 10, f.y + 2, f.x + 10, f.y + 2, false));
    expect(placeBuilding(s, 'wardlantern', f.x - 6, f.y + 3).ok).toBe(true);
    recomputeAll(s);
    expect(questStatus(s, Q('g_ward'))).toMatch(/Being built: \d+ %/);
    const site = s.buildings.find((b) => b && b.kind === 'wardlantern')!;
    site.work = Math.round(site.workTotal! / 2);
    expect(questStatus(s, Q('g_ward'))).toMatch(/Being built: 50 %/);
    site.state = 'ok'; site.work = 0; site.lit = false;
    expect(buildStatus(s, 'wardlantern')).toMatch(/unlit/);
    site.lit = true;
    expect(buildStatus(s, 'wardlantern')).toBe('Built.');
    site.state = 'ruin';
    expect(buildStatus(s, 'wardlantern')).toMatch(/ruins/);
    construction.instant = true;
  });

  it('the counters follow the city', () => {
    const s = createGame(42, 'Counts');
    s.milestone = 3;
    s.educated = 0.296; // not yet 30: never shown as met
    expect(questStatus(s, Q('a_academy'))).toMatch(/29 % of the folk educated, of 30 %/);
  });

});

// Dev tools.
describe('Dev tools', () => {
  it('every command runs on a fresh charter without throwing, and uses are counted and chronicled', () => {
    const s = createGame(41, 'Dev');
    const f = s.founding;
    flatten(s, f.x - 14, f.y - 10, f.x + 14, f.y + 14);
    recomputeAll(s);
    expect(DEV_GROUPS.length).toBeGreaterThanOrEqual(4); // the Wyrms group is parked (reset 1b), the Crown's struck out (2-6)
    const at = { x: f.x + 8, y: f.y + 8 };
    let n = 0;
    for (const c of DEV_COMMANDS) {
      if (c.id === 'day' || c.id === 'season') continue; // run separately below
      const arg = devDefaultArg(c, s); // a list's first option or a number's default (iteration 55)
      const out = runDev(s, c.id, arg, at);
      expect(typeof out).toBe('string');
      n++;
    }
    expect(s.stats.devUses).toBe(n);
    expect(s.chronicle.some((c) => c.text.includes('dev tools'))).toBe(true);
    expect(s.chronicle.filter((c) => c.text.includes('dev tools')).length).toBe(1);
    expect(runDev(s, 'nope', '', at)).toBe('Unknown command');
    construction.instant = true; // the toggle flipped it off
  });

  it('commands do what they say: crowns, gloam, finish', () => {
    const s = createGame(41, 'Dev');
    const f = s.founding;
    flatten(s, f.x - 14, f.y - 10, f.x + 14, f.y + 14);
    recomputeAll(s);
    const at = { x: f.x + 8, y: f.y - 6 };
    const t0 = s.treasury;
    runDev(s, 'crowns', '', at);
    expect(s.treasury - t0).toBe(10000);
    runDev(s, 'gloam', '', at);
    expect(s.gloam[idx(at.x, at.y)]).toBe(1);
    runDev(s, 'cleargloam', '', at);
    expect(s.gloam[idx(at.x, at.y)]).toBe(0);
    const m0 = s.milestone;
    runDev(s, 'milestone', '', at);
    expect(s.milestone).toBe(m0 + 1);
    construction.instant = false;
    placeBuildingRaw(s, 'well', f.x - 4, f.y + 3, 1, true);
    expect(s.buildings.some((b) => b && b.state === 'building')).toBe(true);
    runDev(s, 'finish', '', at);
    expect(s.buildings.some((b) => b && b.state === 'building')).toBe(false);
    construction.instant = true;
    const d0 = s.day;
    runDev(s, 'day', '', at);
    expect(s.day).toBe(d0 + 1);
    const r = deserialize(serialize(s), (seed) => createGame(seed));
    expect(r.stats.devUses).toBe(s.stats.devUses);
  });
});

// The dev commands: jump to a day, complete a task, set a standing, reset the history.
function town(seed = 55) {
  const s = createGame(seed, 'Annalwick');
  const f = s.founding;
  flatten(s, f.x - 18, f.y - 14, f.x + 18, f.y + 14);
  buildRoad(s, RoadType.Track, roadPath(f.x - 16, f.y + 2, f.x + 16, f.y + 2, false));
  s.treasury = 50000;
  s.milestone = 3;
  recomputeAll(s);
  return s;
}
describe('Dev commands', () => {
  const at = (s: GameState) => ({ x: s.founding.x, y: s.founding.y });
  it('jump to day: forward only, the season follows, the main rng untouched', () => {
    const s = town();
    const rng = s.rngState;
    expect(runDev(s, 'setday', '0', at(s))).toMatch(/Only forward/);
    expect(runDev(s, 'setday', String(s.day + 400), at(s))).toMatch(/a year/);
    runDev(s, 'setday', '45', at(s));
    expect(s.day).toBe(45);
    expect(Math.floor(s.tick / TICKS_PER_DAY)).toBe(45);
    expect(s.rngState).toBe(rng);
  });
  it("complete a task pays its reward; an unknown or a done task is refused", () => {
    const s = town();
    const q = questsFor(s).find((x) => x.reward > 0 && !s.questsDone.includes(x.id))!;
    const t0 = s.treasury;
    expect(runDev(s, 'quest', q.id, at(s))).toMatch(/done/);
    expect(s.questsDone).toContain(q.id);
    expect(s.treasury).toBe(t0 + q.reward);
    expect(runDev(s, 'quest', q.id, at(s))).toBe('Already done.');
    expect(runDev(s, 'quest', 't_hall', at(s))).toMatch(/No such task/); // a parked people's task (scope reset)
  });
  it('reset the history: the ledger; the Chronicle keeps the dev mark', () => {
    const s = town();
    s.ledgerHistory.push(10, 20);
    runDev(s, 'forget', 'ledger', at(s));
    expect(s.ledgerHistory).toEqual([]);
    runDev(s, 'forget', 'chronicle', at(s));
    expect(s.chronicle.length).toBe(1);
    expect(s.chronicle[0].text).toMatch(/dev tools/);
    expect(s.stats.devUses).toBeGreaterThanOrEqual(2);
  });
});

// The faction scaffold.
// a throwaway people to prove every rule point: the seam another people would plug into (the scope reset keeps it, docs/PARKED.md)
FACTIONS.test = {
  id: 'test' as never, name: 'The Test Folk', people: 'Testish', playable: true, lore: 'test',
  milestones: MILESTONES.map((m, i) => ({ ...m, name: `Depth ${i}` })),
  deny: ['garden'], replaces: { well: 'cistern' },
  rules: { ...NEUTRAL_RULES, hillLandValue: 10, grassPenalty: 5, hillBuildable: true, lanternWard: 0.5, hillMana: 2, nodeMana: 0.5, startCrowns: 1000, waterLandValue: 1, dryPenalty: 0, spireReach: 0, spireCost: 1, darkAbandon: 0, milestoneGate: (_s, next) => next < 2 },
};
afterAll(() => { delete FACTIONS.test; });

function peoplesTown(faction = 'vellish') {
  const s = createGame(41, 'Peoples', faction as 'vellish');
  const f = s.founding;
  flatten(s, f.x - 16, f.y - 12, f.x + 16, f.y + 16);
  buildRoad(s, RoadType.Track, roadPath(f.x - 14, f.y + 2, f.x + 14, f.y + 2, false));
  return s;
}

describe('The faction scaffold', () => {
  it('a new game is Vellish with neutral rules and the Vellish milestones; saves keep it and old saves default', () => {
    const s = peoplesTown();
    expect(s.faction).toBe('vellish');
    expect(factionOf(s).id).toBe('vellish');
    expect(milestonesOf(s)).toBe(MILESTONES);
    expect(factionKey(s, 'well')).toBe('well');
    expect(canBuild(s, 'well')).toBe(true);
    const r = deserialize(serialize(s), (seed) => createGame(seed));
    expect(r.faction).toBe('vellish');
    const o = JSON.parse(serialize(s)); delete o.faction;
    expect(deserialize(JSON.stringify(o), (seed) => createGame(seed)).faction).toBe('vellish');
  });

  it('every rule point reads the people: hills, ward, mana, crowns, milestones, unlocks', () => {
    const v = peoplesTown();
    const t = peoplesTown('test');
    expect(factionOf(t).people).toBe('Testish');
    expect(t.treasury - v.treasury).toBe(1000);
    expect(milestonesOf(t)[1].name).toBe('Depth 1');
    const f = t.founding;
    // hills: buildable and zoneable, and worth more
    for (const s of [v, t]) for (let dy = 4; dy <= 7; dy++) for (let dx = -6; dx <= 6; dx++) s.terrain[idx(f.x + dx, f.y + dy)] = Terrain.Hills;
    buildRoad(t, RoadType.Track, roadPath(f.x - 6, f.y + 3, f.x + 6, f.y + 3, false));
    buildRoad(v, RoadType.Track, roadPath(f.x - 6, f.y + 3, f.x + 6, f.y + 3, false));
    expect(canPlaceBuilding(v, 'shrine', f.x, f.y + 4)).toMatch(/terrain/);
    expect(canPlaceBuilding(t, 'shrine', f.x, f.y + 4)).toBeNull();
    paintZone(v, Zone.Hearth, f.x - 2, f.y + 4, f.x + 2, f.y + 4);
    paintZone(t, Zone.Hearth, f.x - 2, f.y + 4, f.x + 2, f.y + 4);
    expect(v.zone[idx(f.x, f.y + 4)]).toBe(0);
    expect(t.zone[idx(f.x, f.y + 4)]).toBe(Zone.Hearth);
    recomputeAll(v); recomputeAll(t);
    updateLandValue(v); updateLandValue(t);
    const hill = idx(f.x, f.y + 5);
    const grass = idx(f.x, f.y - 4);
    expect(t.landValue[hill] - v.landValue[hill]).toBe(10);
    expect(v.landValue[grass] - t.landValue[grass]).toBe(5);
    // node flow halves; a hill building's mana doubles
    updateMana(v); updateMana(t);
    expect(t.manaSupply).toBeCloseTo(v.manaSupply * 0.5, 5);
    for (const s of [v, t]) { s.terrain[idx(f.x + 8, f.y - 6)] = Terrain.Hills; s.terrain[idx(f.x + 9, f.y - 6)] = Terrain.Hills; s.terrain[idx(f.x + 8, f.y - 5)] = Terrain.Hills; s.terrain[idx(f.x + 9, f.y - 5)] = Terrain.Hills; placeBuildingRaw(s, 'font', f.x + 8, f.y - 6); }
    const before = [v.manaSupply, t.manaSupply];
    updateMana(v); updateMana(t);
    const dv = v.manaSupply - before[0];
    const dt = t.manaSupply - before[1];
    expect(dv).toBeGreaterThan(0);
    expect(dt).toBeCloseTo(dv * 2, 3);
    // lantern halves
    for (const s of [v, t]) { placeBuildingRaw(s, 'spire', f.x + 3, f.y - 6); const l = placeBuildingRaw(s, 'wardlantern', f.x + 5, f.y - 4); recomputeAll(s); expect(l.lit).toBe(true); }
    updateCoverage(v, 'ward'); updateCoverage(t, 'ward');
    const li = idx(f.x + 5, f.y - 5);
    expect(t.coverage.ward[li]).toBeLessThan(v.coverage.ward[li]);
    // the milestone gate holds the city at its milestone
    v.population = 700; t.population = 700;
    checkMilestones(v); checkMilestones(t);
    expect(v.milestone).toBeGreaterThanOrEqual(3);
    expect(t.milestone).toBe(1);
    // unlocks: denied and replaced keys are not built, the replacement is
    expect(canBuild(v, 'garden')).toBe(true);
    expect(canBuild(t, 'garden')).toBe(false);
    expect(canBuild(t, 'well')).toBe(false);
    expect(factionKey(t, 'well')).toBe('cistern');
    expect(buildsFor(factionOf(t), { key: 'x', faction: ['vellish'] } as never)).toBe(false);
  });
});
