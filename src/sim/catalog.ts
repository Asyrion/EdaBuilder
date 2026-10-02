import type { FactionId } from '../data/factions';
import { RoadType, Zone, type ServiceType } from './types';

export type BuildingCategory = 'zone' | 'ley' | 'water' | 'service' | 'leisure' | 'wonder' | 'marvel' | 'special';

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
  nearHills?: boolean; // a hills tile must touch the footprint
  nearWater?: boolean; // a river/lake tile must touch the footprint
  selfLit?: boolean; // lights itself and its neighbours without mana
  goodsRate?: number; // goods produced per day, carted like a Craft works
  onRuins?: boolean; // footprint must be Ruins tiles
  maxCount?: number; // at most this many in the city
  materials?: { scale?: number; wyrmfire?: number; eggshell?: number; rayscale?: number; glimdust?: number }; // rare goods consumed to build
  relic?: string; // needs this relic set entire (relics.ts)
  faction?: FactionId[]; // a people's own building; absent = every people
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
    desc: 'A carved leystone spire. Lit if within 6 tiles of a ley node or another lit spire; lights buildings within 5 tiles (a tile further, at twice the price, for the Tallowkin). Lit buildings also light their neighbours.',
    flavor: 'Hum of a struck bell, felt in the teeth.',
    w: 1, h: 1, cost: 400, upkeep: 6, manaUse: 0, unlock: 0,
  },
  {
    key: 'wicktower', name: 'Wick-Tower', category: 'ley', faction: ['tallowkin'],
    desc: 'A tallow-lamp pylon. Lit when a lit spire or node is within reach, and lights buildings within 4 tiles, but it relays nothing: no spire and no other Wick-Tower lights from it. Cheap light for the corners.',
    flavor: 'A spire hums. A Wick-Tower only glows, which the Tallowkin say is the polite thing to do at night.',
    w: 1, h: 1, cost: 250, upkeep: 4, manaUse: 0, unlock: 0,
  },
  {
    key: 'nexus', name: 'Ley Nexus', category: 'ley',
    desc: 'A ring of spires around a leystone heart. Reaches 9 tiles and stores 120 mana to soak up peaks in demand.',
    flavor: 'The Concord built these by the thousand. Vell builds them one at a time, carefully.',
    w: 2, h: 2, cost: 5000, upkeep: 30, manaUse: 0, manaStorage: 120, unlock: 4,
  },
  {
    key: 'mine', name: 'Crystal Mine', category: 'ley',
    desc: 'Dug into hills. Grimmen miners cut 8 leystone a day (4 unlit) from a seam of 2,400; carts haul it to Arcane districts, which sell the enchanted artifacts for crowns. A cut-out seam gives 2 a day of dust and wakes wardens three times as often.',
    flavor: 'The seams sing. The miners learn not to answer.',
    w: 2, h: 2, cost: 2600, upkeep: 30, manaUse: 2, unlock: 4, onHills: true, leystone: 8,
  },
  {
    key: 'font', name: 'Thrum Font', category: 'ley',
    desc: 'A bored well into a deep Vein. Produces 40 mana a day anywhere. Expensive and dangerous when pressed: past nine tenths of the flow it may flare (one chance in fifty a day), burning its yard and smoking for ten days.',
    flavor: 'The Tallowkin who bore the shaft are paid triple and buried for free.',
    w: 2, h: 2, cost: 6500, upkeep: 50, manaUse: 0, manaProduce: 40, unlock: 4,
  },

  {
    key: 'torrentmill', name: 'Torrent Mill', category: 'ley',
    desc: 'A Gekiryu mill on the riverbank: falling water turned into 30 mana a day, no Vein needed (more in the Thaw, half when the river freezes). Must touch river or lake water and a road; a second mill within 8 tiles shares the river and makes six tenths.',
    flavor: 'The Veshari claim the design. The Huruhui who built the first one just laughs.',
    w: 1, h: 1, cost: 5200, upkeep: 40, manaUse: 0, manaProduce: 30, unlock: 4, nearWater: true,
  },

  {
    key: 'portalarch', name: 'Portal Arch', category: 'ley',
    desc: 'One of a pair of leystone arches. Carts and folk that pass a lit arch step out of the other, anywhere on the map. Both must be lit; 12 mana each and a tenth more per crossing; past 60 crossings a day the jump jams like a crowded road. Only two may stand.',
    flavor: 'The first carter through came out the far side a moment before he went in, and refused to discuss it.',
    w: 1, h: 1, cost: 4000, upkeep: 30, manaUse: 12, unlock: 5, needsMana: true, maxCount: 2,
  },

  // ---- water ----
  {
    key: 'well', name: 'Well', category: 'water',
    desc: 'Blessed in the name of Vesh. Waters buildings within 8 tiles (10 if dug near water) and serves 30 levels of homes and works, the nearest first. Dug more than 8 tiles from any water it reaches only 4; a bank well is fouled while the river floods.',
    flavor: 'Drop a coin in and the water-mage hears it. Drop two and she answers.',
    w: 1, h: 1, cost: 300, upkeep: 4, manaUse: 0, waterRadius: 8, waterNearBonus: 2, unlock: 0,
  },
  {
    key: 'seep', name: 'Seep', category: 'water', faction: ['grimmen'],
    desc: 'A basin cut into the hill foot where the stone weeps. Waters buildings within 6 tiles (9 in the Thaw, 3 in the Ember) and serves 20 levels; must touch hills. No mana, no coin to the water-mage.',
    flavor: 'The Grimmen say the hill is only sleeping, and the seep is where it dreams of the river.',
    w: 1, h: 1, cost: 350, upkeep: 4, manaUse: 0, waterRadius: 6, nearHills: true, unlock: 0,
  },
  {
    key: 'tidewell', name: 'Tide-Well', category: 'water', faction: ['veshari'],
    desc: 'A stone shaft sunk at the water\'s edge, where the river fills it twice a day. Waters buildings within 10 tiles and serves 45 levels; must touch river or lake water. No mana, and the flood does not foul it.',
    flavor: 'The water-mage does not need a coin. She can hear the river from here.',
    w: 1, h: 1, cost: 400, upkeep: 4, manaUse: 0, waterRadius: 10, nearWater: true, unlock: 0,
  },
  {
    key: 'cistern', name: 'Cistern of Vesh', category: 'water',
    desc: 'A mana-driven cistern that lifts water anywhere, far from any river. Waters buildings within 12 tiles and serves 90 levels. Needs mana.',
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
    key: 'candleshrine', name: 'Candle-Shrine', category: 'service', faction: ['tallowkin'],
    desc: 'A hearth-shrine with a candle in every niche. Faith within 6 tiles, and it lights itself and its neighbours without a spire.',
    flavor: 'Bread on the sill for the Hearthkeeper, and a candle so she can find it.',
    w: 1, h: 1, cost: 500, upkeep: 10, manaUse: 0, selfLit: true,
    service: { type: 'faith', radius: 6, strength: 0.6 }, landValue: 6, unlock: 0,
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
    desc: 'Seats the guild council: carters, alchemists, spire-wrights and sextons. Every 20 days the least pleased guild petitions for an edict; a pleased guild pays a boon, a striking one costs. Land value within 10 tiles.',
    flavor: 'The guild seal is a cart wheel over a mortar. The motto: "It Moves."',
    w: 2, h: 2, cost: 3000, upkeep: 40, manaUse: 3,
    service: { type: 'leisure', radius: 10, strength: 0.8 }, landValue: 12, unlock: 5,
  },

  // ---- beasts ----
  {
    key: 'hunterslodge', name: "Hunters' Lodge", category: 'service',
    desc: 'Grimmen hunters with hound-spears and salt. Kills Gloam-hounds within 12 tiles each night; venison and hides raise happiness a little nearby.',
    flavor: 'The lodge door has forty-one notches. The forty-second hound got away.',
    w: 2, h: 2, cost: 1300, upkeep: 24, manaUse: 1, unlock: 2,
    service: { type: 'leisure', radius: 8, strength: 0.4 },
  },
  {
    key: 'mothloft', name: 'Moth-Loft', category: 'leisure',
    desc: 'A lattice tower that glimmoths roost in. Where moths swarm at night it gathers glim-dust: Craft goods +20% within 8 tiles. Needs a ley node or lit spire within 6.',
    flavor: 'The dust is sifted at dawn by children with candle-eyes, who can see it.',
    w: 1, h: 1, cost: 900, upkeep: 12, manaUse: 2, unlock: 2, needsMana: true,
    service: { type: 'leisure', radius: 4, strength: 0.2 },
  },

  // ---- wyrmcraft ----
  {
    key: 'stoneward', name: 'Stone Ward', category: 'service', faction: ['grimmen'],
    desc: 'A standing stone cut with the old grey runes. Holds the Gloam back within 8 tiles with no mana at all: the grey cannot cross what the Grimmen have cut.',
    flavor: 'No light. The grass simply stops being grey at the foot of it, as if embarrassed.',
    w: 1, h: 1, cost: 800, upkeep: 12, manaUse: 0,
    service: { type: 'ward', radius: 8, strength: 0.9 }, unlock: 2,
  },
  {
    key: 'quarry', name: 'Quarry', category: 'service', faction: ['grimmen'],
    desc: 'A cut face in the hill with a windlass over it. Eight cutters dress 5 goods of stone a day for the carts (half unlit, no mana) and the open cut counts four stone quarried while it works. Must be dug into hills and touch a road.',
    flavor: 'The Grimmen say a hill is only a hall that has not been asked yet.',
    w: 1, h: 1, cost: 1400, upkeep: 14, manaUse: 0, unlock: 1, onHills: true, capacity: [8], goodsRate: 5,
  },
  {
    key: 'hatchery', name: 'Hatchery', category: 'service', faction: ['grimmen'],
    desc: 'A stone nest in the hill\'s warmth. Holds two eggs of the stone lines only: Bone, Grey and Ember. Must be lit and drinks 6 mana a day; needs a ley node or spire within 6 to be cut at all.',
    flavor: 'The Grimmen do not breed the bright lines. "We keep what the Gloam cannot touch," they say, "and what the Gloam cannot touch is grey."',
    w: 2, h: 2, cost: 3200, upkeep: 28, manaUse: 6, unlock: 4, needsMana: true,
    service: { type: 'leisure', radius: 5, strength: 0.3 },
  },
  {
    key: 'cradle', name: 'Wyrm-Cradle', category: 'service',
    desc: 'A stone nest warmed by the ley. Holds two dragon eggs; hatchlings and drakes live here until given a role. Must be lit (a spire within 5 tiles) and drinks 8 mana a day, or the eggs go cold. Needs a ley node or spire within 6 to be raised at all.',
    flavor: 'The stones are laid in the spiral the grass makes around a node. Nobody taught the masons that; the eggs did.',
    w: 2, h: 2, cost: 3500, upkeep: 30, manaUse: 8, unlock: 4, needsMana: true,
    service: { type: 'leisure', radius: 5, strength: 0.3 },
  },
  {
    key: 'tamerslodge', name: "Tamer's Lodge", category: 'service',
    desc: 'Where Wyrm-Tamers, mostly candle-eyed Tallowkin, train hatchlings. A cradle within 10 tiles can raise its hatchlings; set each dragon\'s training in the Wyrms panel.',
    flavor: 'Rule one on the lodge wall: never lie to a dragon. Rule two: never let it see you count the scales.',
    w: 2, h: 2, cost: 1800, upkeep: 22, manaUse: 2, unlock: 4,
    service: { type: 'leisure', radius: 5, strength: 0.3 },
  },

  {
    key: 'ring', name: 'Wyrm-Ring', category: 'leisure',
    desc: 'An arena of sand and stands. Once a season a champion dragon fights a wild challenger to first blood: purses, pilgrims and pride, or a humbled dragon. Land value and happiness within 10.',
    flavor: 'Vell forbids a bout to the death. The Grimmen sextons would refuse to quiet the sand.',
    w: 3, h: 3, cost: 6000, upkeep: 40, manaUse: 4, unlock: 5,
    service: { type: 'leisure', radius: 10, strength: 1.0 }, landValue: 12,
  },
  {
    key: 'stormpeak', name: "Storm-Caller's Peak", category: 'service',
    desc: 'A stair to a hilltop where a Huruhui-trained storm caller works. From its panel, call rain over the whole city for 300 crowns: fires within 14 tiles of the Peak go out, miasma washed away and Craft +15% for three days. Three-day cooldown. Must be built into hills.',
    flavor: 'They climbed for three nights and came down with white hair and the rain behind them.',
    w: 1, h: 1, cost: 2800, upkeep: 30, manaUse: 6, unlock: 4, onHills: true, needsMana: true,
    service: { type: 'leisure', radius: 6, strength: 0.4 },
  },

  // ---- trade ----
  {
    key: 'depot', name: 'Trade Depot', category: 'leisure',
    desc: 'Carters\' yard for the Gloam road. Works with full storage and mines with no buyers send their surplus here to be sold; prices drift with the season. With the Import edict it also buys goods for empty markets. Within 12 tiles of a daughter wardlight\'s stake it opens the Twin Road.',
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

  {
    key: 'underkingseat', name: "Underking's Seat", category: 'wonder', faction: ['grimmen'],
    desc: 'The deepest hall in Eda, cut into the hill with a leystone heart. Wards 30 tiles, relays the ley like a Nexus, counts ten stone quarried, and marks the Grimmen a true people of the Underhill. Must touch hills. Needs mana.',
    flavor: 'The Underking has not sat in it for three hundred years. The chair is kept warm anyway.',
    w: 3, h: 3, cost: 22000, upkeep: 180, manaUse: 14, needsMana: true, nearHills: true,
    service: { type: 'ward', radius: 30, strength: 1.0 }, landValue: 20, unlock: 7, wonder: true,
  },
  {
    key: 'greatweir', name: 'The Great Weir', category: 'wonder', faction: ['veshari'],
    desc: 'A leystone weir across the Sable with sluice gates and lamps. Makes 90 mana a day from the current, wards 30 tiles across the water, relays the ley like a Nexus, and holds the Hush flood back. Must touch water. No mana.',
    flavor: 'The river did not agree to it. The river was not asked. The river, the Veshari say, is still thinking it over.',
    w: 2, h: 2, cost: 22000, upkeep: 160, manaUse: 0, manaProduce: 90, nearWater: true,
    service: { type: 'ward', radius: 30, strength: 1.0 }, landValue: 20, unlock: 7, wonder: true,
  },
  {
    key: 'lanternofwicks', name: 'Lantern of Wicks', category: 'wonder', faction: ['tallowkin'],
    desc: 'The Lantern of Vell rebuilt by the spire-wrights: a leystone lighthouse of ten thousand wicks. Wards 30 tiles, relays the ley like a Nexus, lights itself and the street around it, and marks the Tallowkin a true people of the light.',
    flavor: 'They say you can read by it from the next valley. They say a lot of things in the next valley.',
    w: 3, h: 3, cost: 18000, upkeep: 180, manaUse: 10, needsMana: true, selfLit: true,
    service: { type: 'ward', radius: 30, strength: 1.0 }, landValue: 20, unlock: 7, wonder: true,
  },

  {
    key: 'wyrmcourt', name: 'Wyrm-Court', category: 'wonder',
    desc: 'A ring of singing-stones where a Tallowkin Wyrm-Singer binds the woken wyrm to the city. Needs an awake wyrm, schooling (a third of folk educated) and 40 mana. A bound wyrm wards 30 tiles around its lair, keeps hounds away, lifts every heart by 10, and eats 40 goods a day.',
    flavor: 'The song has no words. The singers say the wyrm supplies them.',
    w: 3, h: 3, cost: 18000, upkeep: 150, manaUse: 40, needsMana: true, landValue: 12, unlock: 7, wonder: true,
  },

  {
    key: 'glimhouse', name: 'Glimhouse', category: 'service',
    desc: 'A glasshouse of ley-glass where glimherb grows all winter. Craft works within 8 tiles ignore the Hush and make 10% more all year. Needs mana.',
    flavor: 'Warm as Bloom inside, even when the frost is on the spires.',
    w: 2, h: 2, cost: 2600, upkeep: 25, manaUse: 4, unlock: 3, needsMana: true, landValue: 6,
  },
  {
    key: 'observatory', name: 'Astral Observatory', category: 'service',
    desc: 'A brass dome that reads the ley in the stars. Forecasts surges, hound nights, festivals, the wyrm and the seasons five days ahead in the Ledger. Needs mana.',
    flavor: 'The astronomers argue about everything except the forecast.',
    w: 2, h: 2, cost: 7000, upkeep: 60, manaUse: 6, unlock: 5, needsMana: true, landValue: 8,
  },
  {
    key: 'hanginggardens', name: 'Hanging Gardens', category: 'service',
    desc: 'Huruhui garden-craft: terraces of glowvine and fruit up a hillside. Makes 6 goods a day for the carts, health within 8, and lights itself and its neighbours with no mana. Must touch hills and a road; unlocks the Glowvine Lane.',
    flavor: 'The vines glow brighter when someone sings to them. Nobody has told the Veshari.',
    w: 2, h: 2, cost: 4800, upkeep: 40, manaUse: 0, unlock: 4, nearHills: true, selfLit: true, goodsRate: 6, landValue: 10,
    service: { type: 'health', radius: 8, strength: 0.4 },
  },

  {
    key: 'ruindelve', name: 'Ruin Delve', category: 'service',
    desc: 'A camp of Grimmen diggers on the Ruins of Lukuku. Brings up a relic a day: artifacts sell for 15% more while a delve works, and the ruins keep their own stories. Disturbs the old dead a little. Must stand on ruin flagstones.',
    flavor: 'The Concord was not the first to fall here. The diggers are careful about which doors they open.',
    w: 2, h: 2, cost: 3000, upkeep: 35, manaUse: 0, unlock: 4, onRuins: true,
  },
  {
    key: 'worldtree', name: 'World Tree Sapling', category: 'wonder',
    desc: 'A cutting from the World Trees of Longwood. Grows over three seasons into a tree taller than the Lantern of Vell: leisure and happiness for a widening ring (6 to 24 tiles), land value, glimmoths at night, and roots that hold the Gloam where its shade falls. No mana.',
    flavor: 'It grew a hand-span the night it was planted, and the children swear it hums.',
    w: 3, h: 3, cost: 20000, upkeep: 120, manaUse: 0, unlock: 7, wonder: true, landValue: 20,
    service: { type: 'leisure', radius: 6, strength: 1.0 },
  },

  {
    key: 'golemfoundry', name: 'Golem Foundry', category: 'service',
    desc: 'Binds Concord Wardens (stone giants that mining wakes in the hills) within 12 tiles. Each bound warden labours for 12 hands with no housing and drinks 10 mana a day here. A wild surge sets them loose again.',
    flavor: 'The Concord built them to guard a city that is gone. They do not seem to mind the change of employer.',
    w: 2, h: 2, cost: 9000, upkeep: 80, manaUse: 8, unlock: 6, needsMana: true,
  },
  {
    key: 'forgetemple', name: 'Forge-Temple', category: 'service', faction: ['grimmen'],
    desc: 'The Grimmen pray to the forge that made the Wardens. Binds Concord Wardens within 12 tiles like a foundry, and a Warden that mining wakes within 20 tiles of a lit Forge-Temple climbs out already bound. Faith within 8. Each bound warden labours for 12 hands and drinks 10 mana a day here. Needs mana.',
    flavor: 'The hammers keep time with something under the floor. The priests say it is the forge. The miners say it is not.',
    w: 2, h: 2, cost: 7500, upkeep: 70, manaUse: 6, unlock: 6, needsMana: true,
    service: { type: 'faith', radius: 8, strength: 0.5 },
  },
  {
    key: 'leybeacon', name: 'Ley Beacon', category: 'ley',
    desc: 'A tall lantern that sings on the high ley. A school of skyrays crossing the valley in Bloom or Ember will circle it for the season instead of passing: happiness +3 for the whole city, and rayscale for the enchanters (artifacts +10%). 25 mana while lit.',
    flavor: 'Fishermen of the sky. The rays do not know they are being fished.',
    w: 1, h: 1, cost: 6000, upkeep: 45, manaUse: 25, unlock: 6, needsMana: true,
  },
  {
    key: 'drakemews', name: 'Drake Mews', category: 'service',
    desc: 'Stables for Watch drakes. Every Watch House patrols twice as far while the mews is lit. If the city is unhappy the drakes spook, and a mews fire is not a small fire.',
    flavor: 'Dog-sized, ley-blue, fond of shoes.',
    w: 2, h: 2, cost: 5500, upkeep: 60, manaUse: 6, unlock: 6, needsMana: true,
  },

  {
    key: 'quay', name: 'Quay', category: 'service',
    desc: 'A stone landing on the river or lake. Each day a barge carries up to 40 goods from works within 8 tiles to the markets around another Quay, along the water. Two quays on the same water make a trade route that no road congestion touches.',
    flavor: 'The Veshari say the river was theirs first. The bargemen say the river was nobody\'s.',
    w: 1, h: 1, cost: 3200, upkeep: 25, manaUse: 0, unlock: 3, nearWater: true,
  },
  {
    key: 'landing', name: 'Landing', category: 'service', faction: ['veshari'],
    desc: 'A timber mooring on the bank. Barges sail between landings and quays: each day one carries up to 40 goods from works within 8 tiles to the markets around another mooring. Every landing counts toward the next reach.',
    flavor: 'Three planks, a post, a bell. The Veshari call it a landing; everyone else calls it the place the river starts.',
    w: 1, h: 1, cost: 900, upkeep: 10, manaUse: 0, unlock: 0, nearWater: true,
  },
  {
    key: 'tidepool', name: 'Tide Pool', category: 'service', faction: ['veshari'],
    desc: 'A walled pool open to the river, warmed by a spire. Takes only the water lines (Tide, Storm and Glim eggs); hatchlings grow with a tamer\'s visits. Must touch water and a ley node or spire within 6.',
    flavor: 'The eggs sit on the bottom like river stones and the river stones sit on the eggs, and the Veshari swear they can tell them apart.',
    w: 2, h: 2, cost: 3500, upkeep: 30, manaUse: 6, needsMana: true, unlock: 4, nearWater: true,
    service: { type: 'leisure', radius: 5, strength: 0.3 },
  },
  {
    key: 'skydock', name: 'Sky-Dock', category: 'wonder',
    desc: 'A mooring tower for the airship of the wardlights. On the third day of each season the ship leaves with up to 200 surplus goods and returns ten days later with crowns at 1.6x the season price, and sometimes a tale. 30 mana.',
    flavor: 'The next lantern on the horizon has a dock like this one. That is how you know it is a lantern.',
    w: 2, h: 2, cost: 26000, upkeep: 150, manaUse: 30, unlock: 8, wonder: true, needsMana: true, landValue: 15,
  },

  {
    key: 'fontquieting', name: 'Font of Quieting', category: 'service',
    desc: 'A basin of still water sung over by Grimmen sextons. Every Boneyard and Ossuary in the city quiets 50% more dead, and the wisps become allies: the restless are laid down far more easily everywhere. 15 mana.',
    flavor: 'Nothing moves on the water. That is the point.',
    w: 2, h: 2, cost: 12000, upkeep: 90, manaUse: 15, unlock: 7, needsMana: true, maxCount: 1,
  },

  // ---- marvels: built from rare goods ----
  {
    key: 'scaleward', name: 'Scale Ward', category: 'marvel',
    desc: 'A ward lantern plated in dragon scale. Burns back the Gloam within 10 tiles and needs no mana at all. Costs 10 scale.',
    flavor: 'The Gloam remembers what the scale belonged to.',
    w: 1, h: 1, cost: 1500, upkeep: 20, manaUse: 0, unlock: 4, materials: { scale: 10 },
    service: { type: 'ward', radius: 10, strength: 1.0 },
  },
  {
    key: 'wyrmforge', name: 'Wyrmfire Forge', category: 'marvel',
    desc: 'A forge fed with bottled wyrmfire. Craft works within 8 make 35% more (a Glimhouse\'s tenth and the forge\'s quarter) and ignore the Hush. Costs 8 wyrmfire.',
    flavor: 'The smiths wear glass over their eyes and sing to keep the fire sweet.',
    w: 2, h: 2, cost: 4000, upkeep: 45, manaUse: 4, unlock: 4, needsMana: true, materials: { wyrmfire: 8 }, miasma: 1,
  },
  {
    key: 'eggshellfont', name: 'Eggshell Font', category: 'marvel',
    desc: 'A font lined with crushed dragon eggshell, which drinks the ley like a hatchling. +25 mana a day anywhere. Costs 6 eggshell.',
    flavor: 'It purrs. Nobody has decided whether that is a good sign.',
    w: 1, h: 1, cost: 3000, upkeep: 30, manaUse: 0, manaProduce: 25, unlock: 5, materials: { eggshell: 6 },
  },
  {
    key: 'raymirror', name: 'Rayscale Mirror', category: 'marvel',
    desc: 'A mirror of polished rayscale that throws the ley into the sky. Leisure within 14 tiles, and every skyray school that crosses the valley turns to circle it. Costs 8 rayscale.',
    flavor: 'On clear nights the mirror shows a different sky.',
    w: 2, h: 2, cost: 5000, upkeep: 40, manaUse: 6, unlock: 6, needsMana: true, materials: { rayscale: 8 }, landValue: 10,
    service: { type: 'leisure', radius: 14, strength: 0.8 },
  },
  {
    key: 'hallofmarvels', name: 'Hall of Marvels', category: 'marvel',
    desc: 'A gallery of everything the valley has tamed: scale, wyrmfire, eggshell, rayscale and glim-dust under one roof. Happiness +8 for the whole city, artifacts sell for half again as much. Costs 10 of each.',
    flavor: 'Pilgrims come to see the dust that lights itself, and stay for the market.',
    w: 3, h: 3, cost: 15000, upkeep: 120, manaUse: 10, unlock: 6, needsMana: true, maxCount: 1, landValue: 20, materials: { scale: 10, wyrmfire: 10, eggshell: 10, rayscale: 10, glimdust: 10 },
    service: { type: 'faith', radius: 12, strength: 0.5 },
  },

  // ---- special ----
  {
    key: 'corelantern', name: 'Lantern of the Cores', category: 'marvel',
    desc: 'The three Lantern-Cores of Vell set in one housing. Wards 12 tiles, lights itself and its neighbours with no mana, and holds 30 mana. Needs the Lantern-Cores relic set entire.',
    flavor: 'The Concord lit a hundred of these. This one was found in three pieces under a floor.',
    w: 2, h: 2, cost: 4000, upkeep: 30, manaUse: 0, unlock: 4, selfLit: true, manaStorage: 30, relic: 'lanterncores', maxCount: 2,
    service: { type: 'ward', radius: 12, strength: 0.8 },
  },
  {
    key: 'househall', name: 'Hall of the Nine Houses', category: 'marvel',
    desc: 'The seals of the nine houses of Lukuku hung in a hall of remembrance. Faith within 12 tiles, land value, and happiness +2 for the whole city. Needs the Seals relic set entire.',
    flavor: 'Nine seals, nine names, and a tenth hook on the wall that nobody explains.',
    w: 2, h: 2, cost: 5000, upkeep: 40, manaUse: 2, unlock: 4, landValue: 15, relic: 'ninehouses', maxCount: 1,
    service: { type: 'faith', radius: 12, strength: 0.9 },
  },
  {
    key: 'saltfont', name: 'Salt Font of Morrow', category: 'marvel',
    desc: 'The three Salt Spoons stir a font that quiets 30 dead a day within 14 tiles. Needs the Salt Spoons relic set entire.',
    flavor: 'Hollis will not say what the font is filled with. It is not water.',
    w: 2, h: 2, cost: 4500, upkeep: 45, manaUse: 3, unlock: 4, relic: 'saltspoons', maxCount: 1,
    service: { type: 'death', radius: 14, strength: 0.8, quietRate: 30 },
  },
  {
    key: 'chartroom', name: 'Concord Chart-Room', category: 'marvel',
    desc: 'The three Concord Charts under glass. Every export pays 15% more, and the room reads the season like an Observatory. Needs the Concord Charts relic set entire.',
    flavor: 'The charts show roads that no longer exist to cities that never did.',
    w: 2, h: 2, cost: 3500, upkeep: 35, manaUse: 2, unlock: 4, landValue: 8, relic: 'concordcharts', maxCount: 1,
    service: { type: 'leisure', radius: 6, strength: 0.3 },
  },
  {
    key: 'cartersyard', name: "Carters' Yard", category: 'special',
    desc: 'Raised by a pleased Carters\' Guild. Counts as a second depot for the Gloam road and shelters carts: leisure within 6. Locks while the guild strikes.',
    flavor: 'Mules, wheels, and a board where every road in Eda is chalked and argued over.',
    w: 2, h: 2, cost: 0, upkeep: 10, manaUse: 0, unlock: 99, service: { type: 'leisure', radius: 6, strength: 0.4 },
  },
  {
    key: 'lyceum', name: "Alchemists' Lyceum", category: 'special',
    desc: 'Raised by a pleased Alchemists\' Guild. Scrubs miasma by a third within 10 tiles and teaches within 8. Locks while the guild strikes.',
    flavor: 'The lectures are free. The antidotes are not.',
    w: 2, h: 2, cost: 0, upkeep: 15, manaUse: 2, unlock: 99, service: { type: 'school', radius: 8, strength: 0.4 },
  },
  {
    key: 'wrightslodge', name: "Spire-Wrights' Lodge", category: 'special',
    desc: 'Raised by pleased Spire-Wrights. Holds 40 mana and the spires bear 15% more overdraw before a surge. Locks while the guild strikes.',
    flavor: 'Blue chalk on every wall: the ley as the wrights see it, which is to say, as a debt.',
    w: 2, h: 2, cost: 0, upkeep: 15, manaUse: 2, unlock: 99, manaStorage: 40,
  },
  {
    key: 'sextonchapel', name: "Sextons' Chapel", category: 'special',
    desc: 'Raised by pleased Sextons of Morrow. Quiets 15 dead a day within 12 tiles. Locks while the guild strikes.',
    flavor: 'Salt in the font, a coin in the bowl, and Hollis asleep in the back pew.',
    w: 2, h: 2, cost: 0, upkeep: 10, manaUse: 1, unlock: 99, service: { type: 'death', radius: 12, strength: 0.6, quietRate: 15 },
  },
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
  requires?: string; // building key that must exist
}

export const ROADS: RoadDef[] = [
  { type: RoadType.Track, key: 'track', name: 'Dirt Track', cost: 10, upkeep: 0.3, manaUse: 0, speed: 1.0, capacity: 60, landValue: 0, unlock: 0,
    desc: 'Cheap and muddy. Slow, low capacity, and mud in the Thaw and the Hush slows it to six tenths. Bridges cost 4×, cuts through hills 3×.' },
  { type: RoadType.Cobble, key: 'cobble', name: 'Cobbled Road', cost: 45, upkeep: 0.8, manaUse: 0, speed: 1.4, capacity: 160, landValue: 6, unlock: 1,
    desc: 'Faster and wider. Raises land value.' },
  { type: RoadType.Lantern, key: 'lantern', name: 'Lantern-way', cost: 130, upkeep: 1.5, manaUse: 1, speed: 1.7, capacity: 300, landValue: 14, unlock: 4,
    desc: 'Lit by lantern-cores; carries and lights everything along it. Costs 1 mana a tile.' },
  { type: RoadType.Glowvine, key: 'glowvine', name: 'Glowvine Lane', cost: 220, upkeep: 2.5, manaUse: 0, speed: 1.4, capacity: 200, landValue: 12, unlock: 4, requires: 'hanginggardens',
    desc: 'A cobbled lane under bioluminescent vines from the Hanging Gardens. Lights itself and everything along it with no mana, but the vines only live within 12 tiles of a Hanging Gardens.' },
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
    text: 'Forty souls under your light. The Crown sends cobbles, a sexton and a healer, and grants you districts: paint one and charter it.' },
  { name: 'Thorp', pop: 100, grant: 3000, unlocks: ['veshari', 'wardlantern', 'cistern', 'mothloft'],
    text: 'A hundred hearths. The Veshari answer your call, and the first Ward Lantern is yours to raise.' },
  { name: 'Village', pop: 220, grant: 4500, unlocks: ['academy', 'watchhouse', 'square', 'depot'],
    text: 'A village with a name on the Crown\'s maps. Scholars, a proper Watch and the carters\' guild follow.' },
  { name: 'Township', pop: 400, grant: 6000, unlocks: ['arcane', 'lantern', 'nexus', 'font', 'mine', 'cradle', 'tamerslodge'],
    text: 'The Tallowkin spire-wrights arrive. Arcane districts, lantern-ways, Thrum Fonts and Crystal Mines may be raised.' },
  { name: 'Market Town', pop: 650, grant: 8000, unlocks: ['ossuary', 'hospice', 'guildhall'],
    text: 'Carts from three valleys come to your market. The guilds petition for a hall.' },
  { name: 'Burgh', pop: 1000, grant: 11000, unlocks: ['temple', 'grandacademy', 'golemfoundry', 'leybeacon', 'drakemews'],
    text: 'A thousand souls. The Four Vigils ask for a temple; the deep Veins may be tapped.' },
  { name: 'Free City', pop: 1500, grant: 16000, unlocks: ['lantern_wonder', 'wyrmcourt', 'fontquieting'],
    text: 'The Crown grants you the right to raise a Lantern of Vell, and a Wyrm-Court if a wyrm has woken.' },
  { name: 'Beacon of Eda', pop: 2200, grant: 25000, unlocks: ['skydock'],
    text: 'Your light is seen from the next wardlight. Songs are sung in Vell-on-Sable of your valley.' },
];

export function isBuildingUnlocked(milestone: number, key: string, relics?: string[]): boolean {
  const def = BUILDING_BY_KEY[key];
  if (!def) return false;
  if (def.relic && !(relics ?? []).includes(def.relic)) return false;
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
/** Great halls that relay the ley like a Nexus and light like the Lantern: one row per people's wonder. */
export const WONDER_HALLS = ['lantern', 'underkingseat', 'greatweir', 'lanternofwicks'];

export const WALL_COST = 60;
export const WALL_UPKEEP = 0.4;
export const WALL_MANA = 0.5;
export const WALL_UNLOCK = 2; // Thorp

export const GATE_COST = { 2: 450, 3: 650 } as Record<number, number>;
export const GATE_NAMES = { 2: 'Belregi Gate', 3: 'Uzulim Gate' } as Record<number, string>;
export const GATE_UNLOCK = 3; // Village
