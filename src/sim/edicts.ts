/** City-wide edicts (policies). Toggled by the player; effects are read by the systems. */
import { BUILDING_BY_KEY } from './catalog';
import { Terrain, Zone, idx, type Building, type GameState } from './types';
import type { FactionId } from '../data/factions';

export interface EdictDef {
  key: string;
  name: string;
  desc: string;
  flavor: string;
  costPerDay: (s: GameState) => number;
  unlock: number; // milestone
  faction?: FactionId[]; // a people's own edict; absent = every people
  cityOnly?: boolean; // read city-wide only: never offered or billed per district
}

export const EDICTS: EdictDef[] = [
  {
    key: 'beastmasters', name: "Beastmasters' Charter",
    desc: 'Drakes and golems are fed from the city purse: cradles and foundries draw 40% less mana, but the tamers\' scraps draw hounds: packs come 50% more often. 40 crowns/day.',
    flavor: 'Everything that eats can be tamed. Everything that is tamed still eats.',
    costPerDay: () => 40, unlock: 4, cityOnly: true,
  },
  {
    key: 'bounty', name: "Hunters' Bounty",
    desc: 'A crown a pelt. Hunters\' Lodges clear hounds twice as far, the Watch kills them more often, and thrumhares vanish from the meadows (they are pelts too).',
    flavor: 'The lodge door ran out of room for notches in a season.',
    costPerDay: (s) => 20 + s.buildings.filter((b) => b && b.kind === 'hunterslodge').length * 15, unlock: 2, cityOnly: true,
  },
  {
    key: 'wyrmpeace', name: 'Wyrm-Peace',
    desc: 'A standing offering at the wyrm\'s node: tribute is halved, and so is the ward of a bound wyrm\'s lair. 80 crowns/day.',
    flavor: 'Half a hoard buys half a guardian. The wyrm can count.',
    costPerDay: () => 80, unlock: 5, cityOnly: true,
  },
  {
    key: 'scalemail', name: 'Scale-Mail',
    desc: 'The Watch wears dragon scale: unrest −5 % while scale is in the vault, and the mail wears 0.05 scale a day. No crowns; the vault pays.',
    flavor: 'It turns a knife. It also turns heads, which the Warden-Reeve counts as the point.',
    costPerDay: () => 0, unlock: 4, cityOnly: true,
  },
  {
    key: 'curfew', name: 'Night Curfew',
    desc: 'The Watch clears the streets after dark. Unrest −10, restless cleared faster; happiness −4.',
    flavor: '"Halt. Are you living? Then go home."',
    costPerDay: () => 15, unlock: 1,
  },
  {
    key: 'draughts', name: 'Free Healing Draughts',
    desc: 'Moonwort draughts for every household. Health +12; costs 0.3 crowns per resident per day.',
    flavor: 'The alchemists grumble about the price. The children stop coughing.',
    costPerDay: (s) => Math.round(s.population * 0.3), unlock: 1,
  },
  {
    key: 'rites', name: 'Rite Subsidy',
    desc: 'The city pays the sextons. Boneyards and Ossuaries quiet 50% more dead. 25 crowns/day per deathcare building.',
    flavor: 'Salt on the lips, a coin on the eyes, and now a second coin for Hollis.',
    costPerDay: (s) => 25 * s.buildings.filter((b) => b && (b.kind === 'boneyard' || b.kind === 'ossuary')).length, unlock: 1,
  },
  {
    key: 'wardens', name: 'Spire Wardens',
    desc: 'Tallowkin wardens watch the spires day and night. Wild surges only strike above 1.5× overdraw. 60 crowns/day.',
    flavor: 'They sleep in shifts under the obelisks and dream in blue.',
    costPerDay: () => 60, unlock: 2, cityOnly: true,
  },
  {
    key: 'herbgardens', name: 'Herb Garden Edict',
    desc: 'Every Craft yard must keep a glimherb bed. Goods production +25%, miasma +30%.',
    flavor: 'The alchemist\'s breath grows sweeter and thicker.',
    costPerDay: () => 0, unlock: 2,
  },
  {
    key: 'lanternlevy', name: 'Lantern Levy',
    desc: 'Markets pay for the street lanterns. Market tithe +20%, market happiness −6.',
    flavor: '"It Moves," says the guild seal. "It Pays," says the Warden-Reeve.',
    costPerDay: () => 0, unlock: 3,
  },
  {
    key: 'imports', name: 'Import Goods',
    desc: 'The Trade Depot buys goods for markets with empty shelves at twice the export price. Needs a Trade Depot.',
    flavor: 'Potions from Vell-on-Sable, sold at Vell-on-Sable prices.',
    costPerDay: (s) => s.trade.importCost, unlock: 3, cityOnly: true,
  },
  {
    key: 'scholars', name: 'Scholars\' Stipend',
    desc: 'Free schooling for Grimmen and Tallowkin children. Educated share grows 50% faster. 0.2 crowns per resident per day.',
    flavor: 'The girl who reads leystone like a book now has forty classmates.',
    costPerDay: (s) => Math.round(s.population * 0.2), unlock: 3,
  },
  {
    key: 'deepcut', name: 'The Deep Cut', faction: ['grimmen'],
    desc: 'Halls on the hill dig a level deeper: a hill hearth reaches its third level without schooling and holds two more folk there. 1.5 crowns a day per hill hearth.',
    flavor: 'Down is a direction the Vellish forget they have.',
    costPerDay: (s) => Math.round(1.5 * s.buildings.filter((b) => b && b.kind === 'hearth' && b.state !== 'ruin' && s.terrain[idx(b.x, b.y)] === Terrain.Hills).length), unlock: 3,
  },
];

export const EDICT_BY_KEY: Record<string, EdictDef> = Object.fromEntries(EDICTS.map((e) => [e.key, e]));
const FACTION_EDICTS = new Set(EDICTS.filter((e) => e.faction).map((e) => e.key));

/** Does this people have the edict at all? Another people's edict is never on, whatever the flags say. */
export function edictOf(s: GameState, key: string): boolean {
  return !FACTION_EDICTS.has(key) || !!EDICT_BY_KEY[key].faction!.includes(s.faction);
}

/** The edicts this people can see: the shared ones and its own. */
export function edictsFor(s: GameState): EdictDef[] {
  return EDICTS.filter((e) => !e.faction || e.faction.includes(s.faction));
}

/** City-wide edict, or the edict of the district a tile/building lies in. */
export function edictOn(s: GameState, key: string, at?: number | Building): boolean {
  if (FACTION_EDICTS.has(key) && !edictOf(s, key)) return false;
  if (s.edicts[key]) return true;
  if (at === undefined) return false;
  const i = typeof at === 'number' ? at : idx(at.x, at.y);
  const d = s.district[i];
  return d > 0 && !!s.districtEdicts[`${d}:${key}`];
}

/** Share of residents living under an edict (1 if city-wide). */
export function edictShare(s: GameState, key: string): number {
  if (s.edicts[key]) return 1;
  let res = 0;
  let under = 0;
  for (const b of s.buildings) {
    if (!b || BUILDING_BY_KEY[b.kind].zone !== Zone.Hearth || b.state !== 'ok') continue;
    res += b.residents;
    if (edictOn(s, key, b)) under += b.residents;
  }
  return res > 0 ? under / res : 0;
}

export function districtsInUse(s: GameState): number[] {
  const seen = new Set<number>();
  for (let i = 0; i < s.district.length; i++) if (s.district[i]) seen.add(s.district[i]);
  return [...seen].sort((a, b) => a - b);
}

export function edictUpkeep(s: GameState): number {
  let c = 0;
  for (const e of EDICTS) {
    if (e.faction && !e.faction.includes(s.faction)) continue;
    if (s.edicts[e.key]) {
      c += e.costPerDay(s);
      continue;
    }
    if (e.cityOnly) continue; // a city-only edict is never billed per district
    // per-district: flat costs are split, per-resident costs follow the residents
    const share = edictShare(s, e.key);
    if (share > 0) c += Math.round(e.costPerDay(s) * Math.max(share, 0.25));
  }
  return c;
}

/** Sum of active temporary modifiers of a kind. */
export function modifierSum(s: GameState, kind: string): number {
  let v = 0;
  for (const m of s.modifiers) if (m.kind === kind && m.until > s.day && m.district === undefined) v += m.value;
  return v;
}

/** City-wide modifiers plus those scoped to one district. */
export function modifierSumAt(s: GameState, kind: string, district: number): number {
  let v = 0;
  for (const m of s.modifiers) if (m.kind === kind && m.until > s.day && (m.district === undefined || m.district === district)) v += m.value;
  return v;
}
