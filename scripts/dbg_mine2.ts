import { createGame } from '../src/sim/world';
import { run } from '../src/sim/sim';
import { TICKS_PER_DAY, AgentKind } from '../src/sim/types';
import { Bot } from '../src/sim/bot';
import { findPath, roadTileOf } from '../src/sim/agents';
const s = createGame(42, 'M');
s.treasury = 20000;
const bot = new Bot(s);
run(s, TICKS_PER_DAY * 100, { onDay: () => bot.step() });
const mine = s.buildings.find((b) => b && b.kind === 'mine')!;
const arcs = s.buildings.filter((b) => b && b.kind === 'arcane') as any[];
console.log('mine', mine.x, mine.y, 'stock', mine.stock, 'lit', mine.lit, 'roadTile', roadTileOf(s, mine));
const mt = roadTileOf(s, mine);
let reachable = 0;
for (const a of arcs) { const at = roadTileOf(s, a); if (mt >= 0 && at >= 0 && findPath(s, mt, at, 20000)) reachable++; }
console.log('arcanes', arcs.length, 'reachable from mine', reachable);
const carts = s.agents.filter((a) => a.kind === AgentKind.Cart);
console.log('carts', carts.length, 'from mine', carts.filter((c) => c.homeId === mine.id).length, carts.filter((c) => c.homeId === mine.id).map((c) => `load${c.load} tgt${c.targetId} t${c.timer} p${c.path.length}`).join(' '));
