/** The content files' check (iteration 87, DESIGN 4.118): what src/data/content/*.json must hold for the game to read it.
 *  Pure; a unit test holds it to an empty list and the dev board (tools/devboard) runs it after every save. */
import { BUILDINGS, MILESTONES, ROADS, type BuildingCategory } from './catalog';
import { RELIC_SETS } from './relics';
import { SERVICE_TYPES, Zone } from './types';

const CATEGORIES: BuildingCategory[] = ['zone', 'ley', 'water', 'service', 'leisure', 'wonder', 'marvel', 'special'];
const PEOPLES = ['vellish'];
const ZONE_KEYS = ['hearth', 'market', 'craft', 'arcane'];
const KEY = /^[a-z][a-z0-9_]*$/;
/** `unlock` of a building no milestone opens (the guild halls used it; they are parked, scope reset phase 1c). */
export const NEVER = 99;

export function validateContent(defs = BUILDINGS, roads = ROADS, milestones = MILESTONES, relics = RELIC_SETS): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const b of defs) {
    const at = (m: string) => out.push(`building ${b.key}: ${m}`);
    if (!KEY.test(b.key ?? '')) at('the key must be lower case letters, digits or _');
    if (seen.has(b.key)) at('the key is used twice');
    seen.add(b.key);
    if (!b.name || !b.desc || !b.flavor) at('needs a name, a desc and a flavor');
    if (!CATEGORIES.includes(b.category)) at(`unknown category "${b.category}"`);
    if (!(b.w >= 1 && b.h >= 1 && Number.isInteger(b.w) && Number.isInteger(b.h))) at('w and h must be whole tiles, at least 1');
    for (const k of ['cost', 'upkeep', 'manaUse'] as const) if (!(typeof b[k] === 'number' && b[k] >= 0)) at(`${k} must be a number, 0 or more`);
    if (!(Number.isInteger(b.unlock) && ((b.unlock >= 0 && b.unlock < milestones.length) || b.unlock === NEVER)))
      at(`unlock ${b.unlock} is not a milestone (0 to ${milestones.length - 1}, or ${NEVER}: opened otherwise)`);
    if (b.service && !SERVICE_TYPES.includes(b.service.type)) at(`unknown service "${b.service.type}"`);
    if (b.faction?.some((f) => !PEOPLES.includes(f))) at(`unknown people in faction: ${b.faction.join(', ')}`);
    if (b.relic && !relics.some((r) => r.id === b.relic)) at(`unknown relic set "${b.relic}"`);
    if (b.category === 'zone') {
      if (b.zone === undefined || b.zone === Zone.None) at('a zone building needs its zone');
      if (!b.capacity || b.capacity.length !== 3) at('a zone building needs three capacities (levels 1 to 3)');
    }
  }
  const roadKeys = new Set(roads.map((r) => r.key));
  for (const r of roads) if (!(Number.isInteger(r.unlock) && r.unlock >= 0 && r.unlock < milestones.length)) out.push(`road ${r.key}: unlock ${r.unlock} is not a milestone`);
  milestones.forEach((m, i) => {
    for (const u of m.unlocks) if (!seen.has(u) && !roadKeys.has(u) && !ZONE_KEYS.includes(u) && !PEOPLES.includes(u)) out.push(`milestone ${i} (${m.name}): unlocks unknown "${u}"`);
    if (i > 0 && !(m.pop > milestones[i - 1].pop)) out.push(`milestone ${i} (${m.name}): needs more folk than the one before`);
  });
  const relicIds = new Set<string>();
  for (const r of relics) {
    if (relicIds.has(r.id)) out.push(`relic set ${r.id}: the id is used twice`);
    relicIds.add(r.id);
    if (r.pieces.length !== 3) out.push(`relic set ${r.id}: needs three pieces`);
  }
  return out;
}
