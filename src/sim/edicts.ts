/** City-wide edicts (policies). Toggled by the player; effects are read by the systems. */
import type { GameState } from './types';

export interface EdictDef {
  key: string;
  name: string;
  desc: string;
  flavor: string;
  costPerDay: (s: GameState) => number;
  unlock: number; // milestone
}

export const EDICTS: EdictDef[] = [
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
    costPerDay: () => 60, unlock: 2,
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
    key: 'scholars', name: 'Scholars\' Stipend',
    desc: 'Free schooling for Grimmen and Tallowkin children. Educated share grows 50% faster. 0.2 crowns per resident per day.',
    flavor: 'The girl who reads leystone like a book now has forty classmates.',
    costPerDay: (s) => Math.round(s.population * 0.2), unlock: 3,
  },
];

export const EDICT_BY_KEY: Record<string, EdictDef> = Object.fromEntries(EDICTS.map((e) => [e.key, e]));

export function edictOn(s: GameState, key: string): boolean {
  return !!s.edicts[key];
}

export function edictUpkeep(s: GameState): number {
  let c = 0;
  for (const e of EDICTS) if (s.edicts[e.key]) c += e.costPerDay(s);
  return c;
}

/** Sum of active temporary modifiers of a kind. */
export function modifierSum(s: GameState, kind: string): number {
  let v = 0;
  for (const m of s.modifiers) if (m.kind === kind && m.until > s.day) v += m.value;
  return v;
}
