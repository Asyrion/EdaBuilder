/** Quest bookkeeping: which quests are active, and daily completion checks. */
import { QUESTS, type QuestDef } from '../data/quests';
import type { GameState } from './types';
import { pushMessage } from './world';

export function activeQuests(s: GameState, max = 3): QuestDef[] {
  const done = new Set(s.questsDone);
  // A quest whose goal is already met is hidden at once; the next check pays it.
  return QUESTS.filter((q) => !done.has(q.id) && q.when(s) && !q.done(s)).sort((a, b) => a.priority - b.priority).slice(0, max);
}

/** Every 50 ticks: complete quests whose condition holds (active or not, so nothing is missed). One ticker line per batch. */
export function checkQuests(s: GameState): QuestDef[] {
  const done = new Set(s.questsDone);
  const completed: QuestDef[] = [];
  for (const q of QUESTS) {
    if (done.has(q.id)) continue;
    if (!q.when(s) && !q.done(s)) continue;
    if (q.done(s)) {
      s.questsDone.push(q.id);
      if (q.reward > 0) s.treasury += q.reward;
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
  return { done: s.questsDone.length, total: QUESTS.length };
}
