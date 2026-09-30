import { RoadType, Zone, type ServiceType } from './types';

export type BuildingCategory = 'zone' | 'ley' | 'water' | 'service' | 'leisure' | 'wonder' | 'special';

export interface ServiceDef {
  type: ServiceType;
  radius: number;
  strength: number; // 0..1 at the centre
  quietRate?: number; // bodies per day (deathcare)
}

export interface BuildingDef {
  key: string;
  name: string;
  category: BuildingCategory;
  desc: string;
  flavor: string;
  w: number;
  h: number;
  cost: number;
  upkeep: number; // crowns per day
  manaUse: number; // per day (zone: per level)
  manaProduce?: number;
  manaStorage?: number;
  waterRadius?: number;
  waterNearBonus?: number; // extra radius if within 3 tiles of water
  needsMana?: boolean; // service works at half strength if unlit
  service?: ServiceDef;
  miasma?: number; // emitted per level, radius 4
  landValue?: number; // flat bonus in radius 6
  zone?: Zone;
  capacity?: number[]; // residents or jobs per level (index level-1)
  tax?: number; // crowns per occupant per day at 10%
  unlock: number; // milestone index
  wonder?: boolean;
  onHills?: boolean; // footprint must be hills
  leystone?: number; // leystone mined per day
}

const Z = (
  key: string,
  name: string,
  zone: Zone,
  capacity: number[],
  tax: number,
  manaUse: number,
  desc: string,
  flavor: string,
  miasma = 0,
  unlock = 0,
): BuildingDef => ({
  key,
  name,
  category: 'zone',
  desc,
  flavor,
  w: 1,
  h: 1,
  cost: 0,
  upkeep: 0,
  manaUse,
  zone,
  capacity,
  tax,
  miasma,
  unlock,
});

export const BUILDINGS: BuildingDef[] = [
  // ---- zoned ----
  Z('hearth', 'Hearth (homes)', Zone.Hearth, [4, 8, 14], 0.7, 1,
    'Homes for Hearthfolk, Tallowkin and Grimmen. Grow from sod huts to stone townhouses.',
    'Every door has an Aume-niche; every window, at night, a small warm light.'),
  Z('market', 'Market (trade)', Zone.Market, [3, 6, 10], 1.0, 2,
    'Stalls, shops and guild-houses. Wants shoppers, goods and a good road.',
    'Potions by the ladle, leystone by the ounce, gossip for free.'),
  Z('craft', 'Craft (alchemy & works)', Zone.Craft, [4, 8, 12], 1.0, 3,
    'Herb yards, stills, tanneries and leystone cutters. Jobs for many; emits miasma.',
    'The sour green fog over the stills is called "the alchemist\'s breath". Nobody lives downwind by choice.',
    3),
  Z('arcane', 'Arcane (enchanters)', Zone.Arcane, [4, 8, 14], 1.6, 4,
    'Enchanters, scriptoria and spire-wrights. Needs schooling, plenty of mana and leystone from a Crystal Mine; sells artifacts for crowns.',
    'Tallowkin sing to the leystone until it remembers the tune.', 0, 4),

  // ---- ley ----
  {
    key: 'spire', name: 'Ley Spire', category: 'ley',
    desc: 'A carved leystone spire. Lit if within 6 tiles of a ley node or another lit spire; lights buildings within 5 tiles. Lit buildings also light their neighbours.',
    flavor: 'Hum of a struck bell, felt in the teeth.',
    w: 1, h: 1, cost: 400, upkeep: 6, manaUse: 0, unlock: 0,
  },
  {
    key: 'nexus', name: 'Ley Nexus', category: 'ley',
    desc: 'A ring of spires around a leystone heart. Reaches 9 tiles and stores 120 mana to soak up peaks in demand.',
    flavor: 'The Concord built these by the thousand. Vell builds them one at a time, carefully.',
    w: 2, h: 2, cost: 5000, upkeep: 30, manaUse: 0, manaStorage: 120, unlock: 4,
  },
  {
    key: 'mine', name: 'Crystal Mine', category: 'ley',
    desc: 'Dug into hills. Grimmen miners cut 8 leystone a day (4 unlit); carts haul it to Arcane districts, which sell the enchanted artifacts for crowns.',
    flavor: 'The seams sing. The miners learn not to answer.',
    w: 2, h: 2, cost: 2600, upkeep: 30, manaUse: 2, unlock: 4, onHills: true, leystone: 8,
  },
  {
    key: 'font', name: 'Thrum Font', category: 'ley',
    desc: 'A bored well into a deep Vein. Produces 40 mana a day anywhere. Expensive and a little dangerous.',
    flavor: 'The Tallowkin who bore the shaft are paid triple and buried for free.',
    w: 2, h: 2, cost: 6500, upkeep: 50, manaUse: 0, manaProduce: 40, unlock: 4,
  },

  // ---- water ----
  {
    key: 'well', name: 'Well', category: 'water',
    desc: 'Blessed in the name of Vesh. Waters buildings within 8 tiles (10 if dug near water).',
    flavor: 'Drop a coin in and the water-mage hears it. Drop two and she answers.',
    w: 1, h: 1, cost: 300, upkeep: 4, manaUse: 0, waterRadius: 8, waterNearBonus: 2, unlock: 0,
  },
  {
    key: 'cistern', name: 'Cistern of Vesh', category: 'water',
    desc: 'A mana-driven cistern that lifts water uphill. Waters buildings within 12 tiles. Needs mana.',
    flavor: 'The water rises because it is asked nicely, and because eight mana a day are spent on the asking.',
    w: 2, h: 2, cost: 1800, upkeep: 14, manaUse: 8, waterRadius: 12, needsMana: true, unlock: 2,
  },

  // ---- services ----
  {
    key: 'watchpost', name: 'Watch Post', category: 'service',
    desc: 'A wooden tower and four sleepy watchmen. Lowers unrest and clears the restless within 8 tiles.',
    flavor: '"Halt. Are you living?" is the traditional greeting.',
    w: 1, h: 1, cost: 800, upkeep: 18, manaUse: 1,
    service: { type: 'watch', radius: 8, strength: 0.7 }, unlock: 0,
  },
  {
    key: 'watchhouse', name: 'Watch House', category: 'service',
    desc: 'A stone barracks of the Watch. Strong coverage within 14 tiles.',
    flavor: 'The cells are warded. The warden is Grimmen. Nothing gets out.',
    w: 2, h: 2, cost: 2600, upkeep: 45, manaUse: 3,
    service: { type: 'watch', radius: 14, strength: 1.0 }, unlock: 3,
  },
  {
    key: 'healer', name: "Healer's Shrine", category: 'service',
    desc: 'Half priest, half alchemist. Raises health within 10 tiles; fights the miasma sickness.',
    flavor: 'Draughts of moonwort for the cough. Prayers to Aume for everything else.',
    w: 1, h: 1, cost: 1200, upkeep: 28, manaUse: 2,
    service: { type: 'health', radius: 10, strength: 0.8 }, unlock: 1,
  },
  {
    key: 'hospice', name: 'Hospice of Vesh', category: 'service',
    desc: 'A great house of healing. Strong health coverage within 16 tiles.',
    flavor: 'The water-mages wash the sickness out of you. It takes a day and you will want a towel.',
    w: 2, h: 2, cost: 4200, upkeep: 70, manaUse: 6,
    service: { type: 'health', radius: 16, strength: 1.0 }, unlock: 5,
  },
  {
    key: 'veshari', name: 'Veshari Hall', category: 'service',
    desc: 'Water-mage fire brigade. Puts out fires within 12 tiles. Needs mana to call the water.',
    flavor: 'They arrive dripping, always, even in the Hush.',
    w: 2, h: 2, cost: 1600, upkeep: 36, manaUse: 4, needsMana: true,
    service: { type: 'fire', radius: 12, strength: 1.0 }, unlock: 2,
  },
  {
    key: 'shrine', name: 'Shrine of Aume', category: 'service',
    desc: 'A hearth-shrine. Small happiness boost and land value within 8 tiles.',
    flavor: 'Bread on the sill for the Hearthkeeper. The sparrows take it, but that counts.',
    w: 1, h: 1, cost: 500, upkeep: 8, manaUse: 0,
    service: { type: 'faith', radius: 8, strength: 0.6 }, landValue: 6, unlock: 0,
  },
  {
    key: 'temple', name: 'Temple of the Four Vigils', category: 'service',
    desc: 'Four naves for four gods. Great happiness and land value within 18 tiles.',
    flavor: 'The fifth nave is bricked up. Nobody says whose it was.',
    w: 3, h: 3, cost: 7000, upkeep: 90, manaUse: 8,
    service: { type: 'faith', radius: 18, strength: 1.0 }, landValue: 14, unlock: 6,
  },
  {
    key: 'academy', name: 'Academy of the Ley', category: 'service',
    desc: 'Schooling within 14 tiles. Educated folk are needed for Arcane districts and level-3 buildings.',
    flavor: 'First lesson: what ley is. Second lesson: why you should never, ever hold it with both hands.',
    w: 2, h: 2, cost: 3200, upkeep: 60, manaUse: 5, needsMana: true,
    service: { type: 'school', radius: 14, strength: 0.8 }, unlock: 3,
  },
  {
    key: 'grandacademy', name: 'Grand Academy', category: 'service',
    desc: 'A college of spire-wrights and alchemists. Strong schooling within 22 tiles.',
    flavor: 'Its library is warded against fire, theft and, since the incident, rain.',
    w: 3, h: 3, cost: 9000, upkeep: 130, manaUse: 12, needsMana: true,
    service: { type: 'school', radius: 22, strength: 1.0 }, landValue: 8, unlock: 6,
  },
  {
    key: 'boneyard', name: 'Boneyard', category: 'service',
    desc: "Morrow's garden. Quiets 12 dead a day within 12 tiles. Unquieted dead become restless.",
    flavor: 'Salt on the lips, a coin on the eyes, and the Rite of Quieting sung by a Grimmen sexton.',
    w: 2, h: 2, cost: 700, upkeep: 16, manaUse: 0,
    service: { type: 'death', radius: 12, strength: 0.8, quietRate: 12 }, unlock: 1,
  },
  {
    key: 'ossuary', name: 'Ossuary', category: 'service',
    desc: 'Vaults of quieted bone beneath a chapel of Morrow. Quiets 40 dead a day within 20 tiles.',
    flavor: 'The bones are stacked in patterns that soothe the ley. Alchemists come here for the quiet water.',
    w: 2, h: 2, cost: 3800, upkeep: 55, manaUse: 3,
    service: { type: 'death', radius: 20, strength: 1.0, quietRate: 40 }, unlock: 5,
  },
  {
    key: 'wardlantern', name: 'Ward Lantern', category: 'service',
    desc: 'A lantern-core on a stone post. Burns back the Gloam within 10 tiles and calms the whispering. Needs mana.',
    flavor: 'Cold blue light. The grey grass at the edge of it curls away like paper from a flame.',
    w: 1, h: 1, cost: 900, upkeep: 22, manaUse: 6, needsMana: true,
    service: { type: 'ward', radius: 10, strength: 1.0 }, unlock: 2,
  },

  // ---- leisure ----
  {
    key: 'garden', name: 'Garden of Aume', category: 'leisure',
    desc: 'Herbs, a bench and a hearth-stone. Raises land value and happiness within 6 tiles.',
    flavor: 'The glimherb grows in spirals here. Children dare each other to touch it.',
    w: 1, h: 1, cost: 250, upkeep: 5, manaUse: 0,
    service: { type: 'leisure', radius: 6, strength: 0.6 }, landValue: 8, unlock: 1,
  },
  {
    key: 'square', name: 'Market Square', category: 'leisure',
    desc: 'A cobbled square with a fountain. Big boost to trade, land value and happiness within 8 tiles.',
    flavor: 'On Thaw-day the whole wardlight dances here, Grimmen and Tallowkin and all.',
    w: 2, h: 2, cost: 1400, upkeep: 12, manaUse: 1,
    service: { type: 'leisure', radius: 8, strength: 1.0 }, landValue: 14, unlock: 3,
  },
  {
    key: 'guildhall', name: 'Guildhall', category: 'leisure',
    desc: "The alchemists' and carters' guilds. Trade bonus and land value within 10 tiles.",
    flavor: 'The guild seal is a cart wheel over a mortar. The motto: "It Moves."',
    w: 2, h: 2, cost: 3000, upkeep: 40, manaUse: 3,
    service: { type: 'leisure', radius: 10, strength: 0.8 }, landValue: 12, unlock: 5,
  },

  // ---- beasts ----
  {
    key: 'mothloft', name: 'Moth-Loft', category: 'leisure',
    desc: 'A lattice tower that glimmoths roost in. Where moths swarm at night it gathers glim-dust: Craft goods +20% within 8 tiles. Needs a ley node or lit spire within 6.',
    flavor: 'The dust is sifted at dawn by children with candle-eyes, who can see it.',
    w: 1, h: 1, cost: 900, upkeep: 12, manaUse: 2, unlock: 2, needsMana: true,
    service: { type: 'leisure', radius: 4, strength: 0.2 },
  },

  // ---- trade ----
  {
    key: 'depot', name: 'Trade Depot', category: 'leisure',
    desc: 'Carters\' yard for the Gloam road. Works with full storage and mines with no buyers send their surplus here to be sold; prices drift with the season. With the Import edict it also buys goods for empty markets.',
    flavor: 'Every cart that leaves is counted twice: once by the guild, once by the Crown.',
    w: 2, h: 2, cost: 2200, upkeep: 25, manaUse: 1, unlock: 3,
    service: { type: 'leisure', radius: 5, strength: 0.3 },
  },

  // ---- wonder ----
  {
    key: 'lantern', name: 'Lantern of Vell', category: 'wonder',
    desc: 'A great leystone lighthouse. Wards 30 tiles, delights the whole city and marks you a true wardlight.',
    flavor: 'From the top you can see the next lantern on the horizon, and the dark between.',
    w: 3, h: 3, cost: 22000, upkeep: 200, manaUse: 20, needsMana: true,
    service: { type: 'ward', radius: 30, strength: 1.0 }, landValue: 20, unlock: 7, wonder: true,
  },

  // ---- special ----
  {
    key: 'stake', name: 'Founding Stake', category: 'special',
    desc: "The Warden-Reeve's hall, the Charter nailed to its door and the Charter well in its yard. Lights and waters a few tiles around it.",
    flavor: '"Light it, hold it, and make it pay."',
    w: 2, h: 2, cost: 0, upkeep: 0, manaUse: 0, waterRadius: 5,
    service: { type: 'watch', radius: 6, strength: 0.4 }, unlock: 0,
  },
];

export const BUILDING_BY_KEY: Record<string, BuildingDef> = Object.fromEntries(
  BUILDINGS.map((b) => [b.key, b]),
);

export const ZONE_KEY: Record<number, string> = {
  [Zone.Hearth]: 'hearth',
  [Zone.Market]: 'market',
  [Zone.Craft]: 'craft',
  [Zone.Arcane]: 'arcane',
};

export interface RoadDef {
  type: RoadType;
  key: string;
  name: string;
  cost: number;
  upkeep: number;
  manaUse: number;
  speed: number;
  capacity: number; // agents per day before congestion
  landValue: number;
  unlock: number;
  desc: string;
}

export const ROADS: RoadDef[] = [
  { type: RoadType.Track, key: 'track', name: 'Dirt Track', cost: 10, upkeep: 0.3, manaUse: 0, speed: 1.0, capacity: 60, landValue: 0, unlock: 0,
    desc: 'Cheap and muddy. Slow, low capacity. Bridges cost 4×, cuts through hills 3×.' },
  { type: RoadType.Cobble, key: 'cobble', name: 'Cobbled Road', cost: 45, upkeep: 0.8, manaUse: 0, speed: 1.4, capacity: 160, landValue: 6, unlock: 1,
    desc: 'Faster and wider. Raises land value.' },
  { type: RoadType.Lantern, key: 'lantern', name: 'Lantern-way', cost: 130, upkeep: 1.5, manaUse: 1, speed: 1.7, capacity: 300, landValue: 14, unlock: 4,
    desc: 'Lit by lantern-cores; carries and lights everything along it. Costs 1 mana a tile.' },
];

export const ROAD_BY_TYPE: Record<number, RoadDef> = Object.fromEntries(ROADS.map((r) => [r.type, r]));

export interface Milestone {
  name: string;
  pop: number;
  grant: number;
  unlocks: string[]; // building keys / road keys / zone keys
  text: string;
}

export const MILESTONES: Milestone[] = [
  { name: 'Founding Stake', pop: 0, grant: 0, unlocks: ['track', 'hearth', 'market', 'craft', 'well', 'spire', 'watchpost', 'shrine'],
    text: 'The Charter is nailed to the door. Light it, hold it, and make it pay.' },
  { name: 'Hamlet', pop: 40, grant: 2000, unlocks: ['cobble', 'boneyard', 'healer', 'garden'],
    text: 'Forty souls under your light. The Crown sends cobbles, a sexton and a healer.' },
  { name: 'Thorp', pop: 100, grant: 3000, unlocks: ['veshari', 'wardlantern', 'cistern', 'mothloft'],
    text: 'A hundred hearths. The Veshari answer your call, and the first Ward Lantern is yours to raise.' },
  { name: 'Village', pop: 220, grant: 4500, unlocks: ['academy', 'watchhouse', 'square', 'depot'],
    text: 'A village with a name on the Crown\'s maps. Scholars, a proper Watch and the carters\' guild follow.' },
  { name: 'Township', pop: 400, grant: 6000, unlocks: ['arcane', 'lantern', 'nexus', 'font', 'mine'],
    text: 'The Tallowkin spire-wrights arrive. Arcane districts, lantern-ways, Thrum Fonts and Crystal Mines may be raised.' },
  { name: 'Market Town', pop: 650, grant: 8000, unlocks: ['ossuary', 'hospice', 'guildhall'],
    text: 'Carts from three valleys come to your market. The guilds petition for a hall.' },
  { name: 'Burgh', pop: 1000, grant: 11000, unlocks: ['temple', 'grandacademy'],
    text: 'A thousand souls. The Four Vigils ask for a temple; the deep Veins may be tapped.' },
  { name: 'Free City', pop: 1500, grant: 16000, unlocks: ['lantern_wonder'],
    text: 'The Crown grants you the right to raise a Lantern of Vell.' },
  { name: 'Beacon of Eda', pop: 2200, grant: 25000, unlocks: [],
    text: 'Your light is seen from the next wardlight. Songs are sung in Vell-on-Sable of your valley.' },
];

export function isBuildingUnlocked(milestone: number, key: string): boolean {
  const def = BUILDING_BY_KEY[key];
  if (!def) return false;
  return milestone >= def.unlock;
}

export function isRoadUnlocked(milestone: number, type: RoadType): boolean {
  return milestone >= ROAD_BY_TYPE[type].unlock;
}

export function isZoneUnlocked(milestone: number, zone: Zone): boolean {
  const key = ZONE_KEY[zone];
  return key ? milestone >= BUILDING_BY_KEY[key].unlock : false;
}

export const BULLDOZE_COST = 5;
export const START_TREASURY = 15000;
export const NODE_MANA = 90;
