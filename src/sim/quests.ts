/** Quest bookkeeping: which quests are active, and daily completion checks. */
import { QUESTS, type QuestDef } from '../data/quests';
import type { GameState } from './types';
import { pushMessage } from './world';

/** A people's own chapter belongs to that people alone; every other quest is everyone's. */
export function questsFor(s: GameState): QuestDef[] {
  return QUESTS.filter((q) => !q.people || q.people === s.faction);
}

export function activeQuests(s: GameState, max = 3): QuestDef[] {
  const done = new Set(s.questsDone);
  // A quest whose goal is already met is hidden at once; the next check pays it.
  return questsFor(s).filter((q) => !done.has(q.id) && q.when(s) && !q.done(s)).sort((a, b) => a.priority - b.priority).slice(0, max);
}

/** Every 50 ticks: complete quests whose condition holds (active or not, so nothing is missed). One ticker line per batch. */
export function checkQuests(s: GameState): QuestDef[] {
  const done = new Set(s.questsDone);
  const completed: QuestDef[] = [];
  for (const q of questsFor(s)) {
    if (done.has(q.id)) continue;
    if (!q.when(s) && (q.strict || !q.done(s))) continue;
    if (q.done(s)) {
      s.questsDone.push(q.id);
      if (q.reward > 0) s.treasury += q.reward;
      if (q.id === 'z_daily') s.challengeDay = s.day;
      completed.push(q);
    }
  }
  if (completed.length) {
    const reward = completed.reduce((n, q) => n + q.reward, 0);
    const names = completed.map((q) => q.title).join('; ');
    pushMessage(s, `Charter ${completed.length === 1 ? 'task' : 'tasks'} done: ${names}${reward ? ` (+${reward} crowns)` : ''}.`, 'good', true);
  }
  return completed;
}

export function questProgress(s: GameState): { done: number; total: number } {
  return { done: s.questsDone.length, total: questsFor(s).length };
}
