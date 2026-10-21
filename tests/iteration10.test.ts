import { describe, expect, it } from 'vitest';
import { createGame, pushMessage } from '../src/sim/world';
import { recomputeAll, run } from '../src/sim/sim';
import { buildRoad, placeBuilding, roadPath, paintZone } from '../src/sim/actions';
import { RoadType, Zone } from '../src/sim/types';
import { activeQuests, checkQuests, questProgress } from '../src/sim/quests';
import { QUESTS, advise } from '../src/data/quests';
import { serialize, deserialize } from '../src/sim/save';
import { flatten } from './helpers';

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
