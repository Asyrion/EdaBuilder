/** Story events with choices. Fired every ~18-30 days when their condition holds; the game pauses until answered. */
import { BUILDING_BY_KEY } from './catalog';
import { DISTRICT_NAMES, Terrain, Zone, type Building, type DragonLine, type GameState } from './types';
import { COUNCIL_EVENTS } from './guilds';
import { LINE_INFO, addEgg } from './wyrmcraft';
import { canPlaceBuilding, commitRng, forEachBuilding, placeBuildingRaw, pushMessage, rngOf } from './world';
import { capacityOf } from './growth';
import { spawnRestless } from './agents';
import { TIGER_FOREST, forestTiles, marketDistrict } from './lore';
import { districtName, markDirty } from './world';
import { inBounds, idx } from './types';
import { WYRM_EATS, WYRM_TRIBUTE_GOODS, bind, hasCourt, marketGoods, payTribute, refuse, takeGoods, wyrmNode, wyrmTribute } from './wyrm';

export interface EventDef {
  id: string;
  title: string;
  text: string;
  when: (s: GameState) => boolean;
  once?: boolean; // never repeats
  choices: { label: string; desc: string; apply: (s: GameState) => string }[];
}

function addResidents(s: GameState, n: number): number {
  let left = n;
  forEachBuilding(s, (b) => {
    if (left <= 0 || BUILDING_BY_KEY[b.kind].zone !== Zone.Hearth || b.state !== 'ok') return;
    const room = capacityOf(b) - b.residents;
    const take = Math.min(room, left, 3);
    if (take > 0) {
      b.residents += take;
      left -= take;
    }
  });
  return n - left;
}

const hasHills = (s: GameState) => {
  let n = 0;
  for (let i = 0; i < s.terrain.length; i++) if (s.terrain[i] === Terrain.Hills) n++;
  return n > 40;
};

export const EVENTS: EventDef[] = [
  {
    id: 'pilgrims', title: 'A caravan of pilgrims',
    text: 'Forty Hearthfolk pilgrims of Aume arrive at the gate, footsore from the Gloam road. Their priest asks leave to settle under your light.',
    when: (s) => s.population > 60 && s.demand.hearth > -0.5,
    choices: [
      { label: 'Welcome them', desc: 'Up to 40 folk move into empty homes.', apply: (s) => `${addResidents(s, 40)} pilgrims found hearths in ${s.cityName}.` },
      { label: 'Bless them and send them on', desc: 'Nothing changes, but Aume remembers: happiness +3 for 10 days.', apply: (s) => { s.modifiers.push({ kind: 'happiness', value: 3, until: s.day + 10, label: 'Pilgrims blessed' }); return 'The pilgrims walk on, singing.'; } },
    ],
  },
  {
    id: 'relic', title: 'A relic of the Concord',
    text: 'Miners in the hills unearth a leystone lantern-core of the Aurel Concord, still faintly humming after three centuries.',
    when: (s) => hasHills(s) && s.milestone >= 2,
    choices: [
      { label: 'Sell it to the Crown', desc: '+3,000 crowns.', apply: (s) => { s.treasury += 3000; return 'The Crown\'s assessor pays in silver and asks no questions.'; } },
      { label: 'Give it to the scholars', desc: 'Educated share +10% (needs an Academy) — otherwise it is studied by candle-eyed children for a small happiness boost.', apply: (s) => { if (s.buildings.some((b) => b && (b.kind === 'academy' || b.kind === 'grandacademy'))) { s.educated = Math.min(0.95, s.educated + 0.1); return 'The Academy locks it in a warded case and lectures on it for a season.'; } s.modifiers.push({ kind: 'happiness', value: 4, until: s.day + 15, label: 'Relic on display' }); return 'With no Academy to study it, the relic hangs in the Founding Stake, a curiosity.'; } },
      { label: 'Bury it with the Rite of Quieting', desc: 'Unquieted dead −20.', apply: (s) => { s.unquieted = Math.max(0, s.unquieted - 20); return 'The sexton sings over it. The ground sighs and goes still.'; } },
    ],
  },
  {
    id: 'guilds', title: 'The guilds petition',
    text: 'The alchemists\' and carters\' guilds offer 1,500 crowns now in exchange for a Craft tithe of 6% for the next 20 days.',
    when: (s) => s.taxRates.craft >= 8 && s.buildings.some((b) => b && b.kind === 'craft'),
    choices: [
      { label: 'Accept the bargain', desc: '+1,500 crowns; Craft tithe capped at 6% for 20 days.', apply: (s) => { s.treasury += 1500; s.modifiers.push({ kind: 'craftTax', value: 6, until: s.day + 20, label: 'Guild bargain' }); return 'The guild seal is stamped: "It Moves."'; } },
      { label: 'Refuse', desc: 'Unrest +8% for 10 days.', apply: (s) => { s.modifiers.push({ kind: 'unrest', value: 0.08, until: s.day + 10, label: 'Guilds refused' }); return 'The carters stage a slow walk down the high street.'; } },
    ],
  },
  {
    id: 'plague', title: 'A cough in the low streets',
    text: 'A miasma-cough is spreading through the hearths nearest the stills. The healers ask for coin to brew quiet-water and moonwort.',
    when: (s) => s.health < 0.55 && s.population > 150,
    choices: [
      { label: 'Fund the healers (2,000 crowns)', desc: 'Health +15 for 20 days.', apply: (s) => { s.treasury -= 2000; s.modifiers.push({ kind: 'health', value: 0.15, until: s.day + 20, label: 'Healers funded' }); return 'The healers work through the night. The cough fades by the new moon.'; } },
      { label: 'Let it run its course', desc: 'Deaths ×2 for 12 days.', apply: (s) => { s.modifiers.push({ kind: 'deaths', value: 1, until: s.day + 12, label: 'Cough unchecked' }); return 'The sexton sings more often that month.'; } },
    ],
  },
  {
    id: 'festival', title: 'A candle-eyed child',
    text: 'A Tallowkin child is born in the hearth district with eyes like two lamps: the first born under your light. The folk want a festival.',
    when: (s) => s.population > 100 && s.happiness > 45,
    choices: [
      { label: 'Hold the Thaw-day dance (800 crowns)', desc: 'Happiness +8 for 12 days.', apply: (s) => { s.treasury -= 800; s.modifiers.push({ kind: 'happiness', value: 8, until: s.day + 12, label: 'Festival' }); return 'Grimmen, Tallowkin and Hearthfolk dance on the square until the spires dim.'; } },
      { label: 'A quiet blessing only', desc: 'No cost, no effect.', apply: () => 'The child is named Wick, after the old word for a lit thing.' },
    ],
  },
  {
    id: 'refugees', title: 'Grimmen out of the Gloam',
    text: 'Sixty grey-skinned Grimmen walk out of the Gloam at dawn, unharmed by it, carrying their dead. They ask for hearths and a Boneyard for their kin.',
    when: (s) => s.population > 120 && s.stats.gloamTiles > 1500,
    choices: [
      { label: 'Take them in', desc: 'Up to 60 folk move in; unquieted dead +15; unrest +5% for 8 days.', apply: (s) => { const n = addResidents(s, 60); s.unquieted += 15; s.modifiers.push({ kind: 'unrest', value: 0.05, until: s.day + 8, label: 'Newcomers' }); return `${n} Grimmen settle in. Their sextons ask where the Boneyard is.`; } },
      { label: 'Turn them away', desc: 'Happiness −4 for 10 days (the Hearthfolk are ashamed).', apply: (s) => { s.modifiers.push({ kind: 'happiness', value: -4, until: s.day + 10, label: 'Refugees turned away' }); return 'They walk back into the grey without a word.'; } },
    ],
  },
  {
    id: 'collector', title: 'The Crown\'s collector',
    text: 'A tax collector from Vell-on-Sable presents the Crown\'s seal and a ledger. The Charter, he notes, owes a tenth of the treasury.',
    when: (s) => s.treasury > 6000 && s.milestone >= 3,
    choices: [
      { label: 'Pay the tenth', desc: '−10% of the treasury.', apply: (s) => { const t = Math.round(s.treasury * 0.1); s.treasury -= t; return `${t} crowns ride back to Vell-on-Sable under guard.`; } },
      { label: 'Plead the Gloam', desc: 'Keep the crowns; tithe income −15% for 15 days while the Crown audits you.', apply: (s) => { s.modifiers.push({ kind: 'tithe', value: -0.15, until: s.day + 15, label: 'Crown audit' }); return 'The collector leaves with a thin smile and a thick ledger.'; } },
    ],
  },
];

/** True if event `id` was answered with choice `choice` at least `daysAgo` days ago. */
export function chose(s: GameState, id: string, choice: number): boolean {
  return s.firedEvents.includes(`${id}:${choice}`);
}

const CHAINS: EventDef[] = [
  {
    id: 'lukuku_first', title: 'The first fall', once: true,
    text: 'Under the Lukuku flagstones the diggers find a hall older than the Concord: a mosaic of a city with three lanterns, and a script no Academy reads. Whatever fell here fell twice.',
    when: (s) => s.buildings.some((b) => b && b.kind === 'ruindelve' && b.state === 'ok' && b.age >= 8),
    choices: [
      { label: 'Catalogue it for the Academy', desc: 'Educated share +5%; +1,000 crowns from the Crown for the finding.', apply: (s) => { s.educated = Math.min(0.95, s.educated + 0.05); s.treasury += 1000; return 'Rubbings and relics go north under seal. The Academy sends back a very long letter.'; } },
      { label: 'Sell the mosaic', desc: '+4,000 crowns; the diggers are ashamed.', apply: (s) => { s.treasury += 4000; s.modifiers.push({ kind: 'happiness', value: -2, until: s.day + 10, label: 'Mosaic sold' }); return 'A Belerial collector pays in gold and takes it apart tile by tile.'; } },
    ],
  },
  {
    id: 'lukuku_door', title: 'The door under the flagstones', once: true,
    text: 'The diggers have found a sealed door, warm to the touch, with the same script as the mosaic. The foreman says it hums in the same key as the ley. She would rather not open it. The Grimmen would rather not be asked.',
    when: (s) => (chose(s, 'lukuku_first', 0) || chose(s, 'lukuku_first', 1)) && s.day - s.lastEventDay >= 12 && s.buildings.some((b) => b && b.kind === 'ruindelve' && b.state === 'ok'),
    choices: [
      { label: 'Seal it with the Rite of Quieting', desc: 'Costs 1,500 crowns; unquieted dead −15; nothing comes out.', apply: (s) => { s.treasury -= 1500; s.unquieted = Math.max(0, s.unquieted - 15); return 'The sextons sing for a night and a day. The hum stops. The foreman sleeps.'; } },
      { label: 'Open it', desc: 'Half the time a hoard: +8,000 crowns and relics. Half the time the old dead: eight restless rise at the ruins and the unquieted +20.', apply: (s) => { const rng = rngOf(s); const hoard = rng.chance(0.5); commitRng(s, rng); const d = s.buildings.find((b) => b && b.kind === 'ruindelve'); if (hoard) { s.treasury += 8000; s.stats.relics += 20; return 'A vault of lantern-cores and gold under a ceiling of painted stars. The diggers are paid triple and still will not go back.'; } s.unquieted += 20; if (d) for (let k = 0; k < 8; k++) spawnRestless(s, d.x + (k % 3), d.y + Math.floor(k / 3)); pushMessage(s, `The door at the Ruins of Lukuku opens and the old dead walk out at (${d?.x ?? 0},${d?.y ?? 0}).`, 'bad', true); return 'The door opens on stairs going down, and things coming up.'; } },
    ],
  },
  {
    id: 'relic_stolen', title: 'The relic is gone', once: true,
    text: 'The Concord lantern-core has vanished from the Academy\'s warded case. A cult of the Undying Court is suspected; their marks are chalked on the door.',
    when: (s) => chose(s, 'relic', 1) && s.day - s.lastEventDay >= 15,
    choices: [
      { label: 'Send the Watch after them (500 crowns)', desc: 'Likely recovers the relic and its worth: +2,500 crowns.', apply: (s) => { s.treasury -= 500; const rng = rngOf(s); const ok = rng.chance(0.75); commitRng(s, rng); if (ok) { s.treasury += 2500; return 'The Watch corners the cult in a Boneyard at midnight. The relic comes back; three cultists do not.'; } s.modifiers.push({ kind: 'unrest', value: 0.06, until: s.day + 10, label: 'Cult at large' }); return 'The cult slips into the Gloam. The chalk marks keep appearing.'; } },
      { label: 'Let it go', desc: 'Unrest +6% for 12 days; the cult is emboldened.', apply: (s) => { s.modifiers.push({ kind: 'unrest', value: 0.06, until: s.day + 12, label: 'Cult emboldened' }); return 'Nobody sleeps well for a fortnight.'; } },
    ],
  },
  {
    id: 'guilds_return', title: 'The guilds return', once: true,
    text: 'Pleased with the last bargain, the guilds propose a lasting one: a permanent Craft tithe cap of 8% in exchange for funding half of a Guildhall.',
    when: (s) => chose(s, 'guilds', 0) && s.day - s.lastEventDay >= 20 && s.milestone >= 5,
    choices: [
      { label: 'Seal the pact', desc: '+1,500 crowns toward a Guildhall; Craft tithe capped at 8% for 120 days.', apply: (s) => { s.treasury += 1500; s.modifiers.push({ kind: 'craftTax', value: 8, until: s.day + 120, label: 'Guild pact' }); return 'The carters paint "It Moves" on every cart in the valley.'; } },
      { label: 'Decline', desc: 'No effect.', apply: () => 'The guildmasters bow, tightly.' },
    ],
  },
  {
    id: 'grimmen_boneyard', title: 'A garden for the grey', once: true,
    text: 'The Grimmen you took in ask to raise a Boneyard of their own for their carried dead. Their sextons will tend it; they ask only for the ground and the stone.',
    when: (s) => chose(s, 'refugees', 0) && s.day - s.lastEventDay >= 12,
    choices: [
      { label: 'Grant the ground (700 crowns)', desc: 'A Boneyard is raised beside a road near the hearths; unquieted dead −15.', apply: (s) => { const spot = findSpot(s, 'boneyard'); if (!spot) { s.treasury -= 200; s.unquieted = Math.max(0, s.unquieted - 15); return 'No ground could be found; the sextons sing the Rite in the streets instead.'; } s.treasury -= 700; placeBuildingRaw(s, 'boneyard', spot[0], spot[1]); s.unquieted = Math.max(0, s.unquieted - 15); return 'Morrow\'s garden opens at dusk. The Grimmen sing all night, and the ground goes quiet.'; } },
      { label: 'Refuse', desc: 'Unquieted dead +10; unrest +5% for 10 days.', apply: (s) => { s.unquieted += 10; s.modifiers.push({ kind: 'unrest', value: 0.05, until: s.day + 10, label: 'Grimmen refused' }); return 'They bury their dead beyond the last lantern, without the Rite.'; } },
    ],
  },
];

function findSpot(s: GameState, key: string): [number, number] | null {
  for (const b of s.buildings) {
    if (!b || BUILDING_BY_KEY[b.kind].zone !== Zone.Hearth) continue;
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = b.x + dx;
        const y = b.y + dy;
        if (x < 1 || y < 1 || x >= s.w - 2 || y >= s.h - 2) continue;
        if (!canPlaceBuilding(s, key, x, y)) return [x, y];
      }
  }
  return null;
}

function hasOssuary(s: GameState): boolean {
  return s.buildings.some((b) => b && b.kind === 'ossuary' && b.state === 'ok');
}

/** The Thaw feast eats from market shelves; every district that fed it is remembered. */
export function holdFeast(s: GameState, want: number): { goods: number; districts: number[] } {
  let goods = 0;
  const districts = new Set<number>();
  const markets = s.buildings.filter((b): b is Building => !!b && BUILDING_BY_KEY[b.kind].zone === Zone.Market && b.state === 'ok' && b.stock > 4).sort((a, b) => b.stock - a.stock);
  for (const m of markets) {
    if (goods >= want) break;
    const t = Math.min(m.stock - 4, want - goods);
    m.stock -= t;
    goods += t;
    districts.add(s.district[idx(m.x, m.y)]);
  }
  s.stats.feastGoods = Math.round(goods);
  s.stats.lastFeastDay = s.day;
  return { goods, districts: [...districts] };
}

/** Calendar events fire on fixed days of the season, at most once per year each. */
const CALENDAR: (EventDef & { seasonDay: number; season: number })[] = [
  {
    id: 'thawday', title: 'Thaw-day', season: 0, seasonDay: 2,
    text: 'The ice has cracked on the river. By old Vellish custom the Warden-Reeve opens the Thaw with a feast on the square, or with a day of labour on the wards.',
    when: (s) => s.population > 40,
    choices: [
      { label: 'A feast (300 crowns and 40 goods)', desc: 'Markets give up to 40 goods from their shelves. Happiness +3 for 15 days everywhere, and +5 more in every district whose markets fed the feast. Under 10 goods it is a thin feast: +2 for 8 days.', apply: (s) => { s.treasury -= 300; const fed = holdFeast(s, 40); if (fed.goods < 10) { s.modifiers.push({ kind: 'happiness', value: 2, until: s.day + 8, label: 'A thin feast' }); return `The shelves were bare: ${Math.round(fed.goods)} goods make a thin feast of bread and water. The choir sings anyway.`; } s.modifiers.push({ kind: 'happiness', value: 3, until: s.day + 15, label: 'Thaw feast' }); for (const d of fed.districts) s.modifiers.push({ kind: 'happiness', value: 5, until: s.day + 15, label: `Thaw feast (${d ? DISTRICT_NAMES[d - 1] : 'the old town'})`, district: d }); return `${Math.round(fed.goods)} goods from ${fed.districts.length} quarter${fed.districts.length === 1 ? '' : 's'}: bread, glimherb ale, and a Grimmen choir that nobody expected to be so good.`; } },
      { label: 'A day on the wards', desc: 'Every lit Ward Lantern burns back the Gloam once more today; happiness −2 for 5 days.', apply: (s) => { s.modifiers.push({ kind: 'happiness', value: -2, until: s.day + 5, label: 'Ward labour' }); let n = 0; for (let i = 0; i < s.gloam.length; i++) if (s.gloam[i] && s.coverage.ward[i] > 0) { s.gloam[i] = 0; n++; } return `${n} tiles of grey grass are cut and burned under the lanterns.`; } },
    ],
  },
  {
    id: 'remembrance', title: 'The Remembrance', season: 2, seasonDay: 15,
    text: 'Mid-Ember is the Remembrance of the Hollowing. Scholars ask to read the names of the nine houses aloud from the Founding Stake; the priests of Morrow would rather the names stayed buried.',
    when: (s) => s.population > 80,
    choices: [
      { label: 'Read the names', desc: 'Educated share +4%. The ley stirs: unquieted dead +12, or only +3 if an Ossuary holds the bones steady.', apply: (s) => { s.educated = Math.min(0.95, s.educated + 0.04); const oss = hasOssuary(s); s.unquieted += oss ? 3 : 12; return oss ? 'The names are read over the vaults. The bones keep their pattern and the spires barely flutter.' : 'The names are read. The spires hum a half-tone flat until dawn.'; } },
      { label: 'Keep the silence', desc: 'Unquieted dead −6, or −15 with an Ossuary to lay them in; the Four Vigils are pleased: happiness +2 for 10 days.', apply: (s) => { const oss = hasOssuary(s); s.unquieted = Math.max(0, s.unquieted - (oss ? 15 : 6)); s.modifiers.push({ kind: 'happiness', value: 2, until: s.day + 10, label: 'Remembrance kept' }); return oss ? 'A night of candles in the Ossuary. Hollis counts the quiet and finds it good.' : 'A night of candles and no speeches. Morrow approves.'; } },
    ],
  },
  {
    id: 'vigil', title: 'The Hush vigil', season: 3, seasonDay: 1,
    text: 'The first night of the Hush. Tradition asks every hearth to keep a lamp burning until dawn, so that the Gloam finds no dark window to whisper at.',
    when: (s) => s.population > 40,
    choices: [
      { label: 'Keep the vigil', desc: 'The lamps draw up to 120 stored mana from the Nexus rings: the Gloam holds 6 days, plus a day for every 12 mana drawn. Shallow stores (under 60) mean the lamps burn from the spires instead: demand +15% for 10 days.', apply: (s) => { const take = Math.min(120, s.manaStorage); s.manaStorage -= take; const days = 6 + Math.floor(take / 12); if (take < 60) s.modifiers.push({ kind: 'mana', value: 0.15, until: s.day + 10, label: 'Hush vigil' }); s.modifiers.push({ kind: 'gloamHold', value: 1, until: s.day + days, label: 'Vigil holds the Gloam' }); return take >= 60 ? `${Math.round(take)} mana from the stores keeps every window amber for ${days} nights. Beyond the last lantern, the grey grass waits.` : `The stores are shallow: the spires burn hot to keep the windows lit, and the Gloam holds ${days} nights.`; } },
      { label: 'Let folk sleep', desc: 'No cost. The whispering is louder this Hush: happiness −3 for 20 days.', apply: (s) => { s.modifiers.push({ kind: 'happiness', value: -3, until: s.day + 20, label: 'Vigil skipped' }); return 'Old Maud keeps her lamp lit anyway. She says the dark remembers who did not.'; } },
    ],
  },
  {
    id: 'lanternfair', title: 'The Lantern Fair', season: 1, seasonDay: 12,
    text: 'Mid-Bloom, and the Guildhall asks leave to hold the Lantern Fair: carters from three wardlights, alchemists hawking draughts, and buyers who pay Bloom prices and half again.',
    when: (s) => s.population > 60 && s.buildings.some((b) => b && b.kind === 'guildhall' && b.state === 'ok'),
    choices: [
      { label: 'Open the fair (500 crowns)', desc: 'Export prices +50% for 6 days; the carters (+10) and alchemists (+5) are pleased.', apply: (s) => { s.treasury -= 500; s.modifiers.push({ kind: 'price', value: 0.5, until: s.day + 6, label: 'Lantern Fair' }); s.guilds.standing.carters = Math.min(100, s.guilds.standing.carters + 10); s.guilds.standing.alchemists = Math.min(100, s.guilds.standing.alchemists + 5); return 'Lanterns on every cart. A Belerial buyer pays gold for a crate of glimherb ale and asks if there is more.'; } },
      { label: 'Keep the gates shut', desc: 'No cost; hounds are about and the Watch is glad of it. The carters sulk (−8).', apply: (s) => { s.guilds.standing.carters = Math.max(0, s.guilds.standing.carters - 8); return 'The carters from the other wardlights turn their mules around at the gate. The Watch sleeps well.'; } },
    ],
  },
];

/** Egg events: the only way to get dragons. */
function eggChoices(line: DragonLine, sell: number): EventDef['choices'] {
  return [
    { label: 'Keep the egg', desc: 'Needs a Wyrm-Cradle with a free slot; otherwise it is sold to the Crown.', apply: (s) => { const d = addEgg(s, line); if (d) return `The ${LINE_INFO[line].name.toLowerCase()} egg is laid in the cradle, warm and humming. The tamers already call it ${d.name}.`; s.treasury += sell; return `No cradle had room. The Crown's assessor pays ${sell} crowns and rides off very carefully.`; } },
    { label: `Sell it to the Crown (+${sell} crowns)`, desc: 'Crowns now.', apply: (s) => { s.treasury += sell; return `${sell} crowns, and a receipt with the royal wyrm-seal.`; } },
    { label: 'Give it to the Academy', desc: 'Educated share +5% (needs an Academy), else happiness +3 for 10 days.', apply: (s) => { if (s.buildings.some((b) => b && (b.kind === 'academy' || b.kind === 'grandacademy'))) { s.educated = Math.min(0.95, s.educated + 0.05); return 'The scholars draw it from every angle and argue about the spiral.'; } s.modifiers.push({ kind: 'happiness', value: 3, until: s.day + 10, label: 'Egg on display' }); return 'Without an Academy it sits in the Founding Stake, and half the valley comes to look.'; } },
  ];
}

const EGGS: EventDef[] = [
  {
    id: 'egg_first', title: "The Crown's gift", once: true,
    text: 'A rider from Vell-on-Sable brings a crate packed with warm ash and a letter under the wyrm-seal: the Crown has heard you raised a cradle, and sends a first egg "so that the valley may learn what it is to keep a dragon".',
    when: (s) => s.buildings.some((b) => b && b.kind === 'cradle' && b.state === 'ok') && s.dragons.length === 0,
    choices: [
      { label: 'Accept the egg', desc: 'An ember egg goes into your cradle.', apply: (s) => { const d = addEgg(s, 'ember'); return d ? `The egg hums the moment it touches the cradle stones. The tamers call it ${d.name}.` : 'The cradle is full; the rider takes the egg on to the next wardlight.'; } },
      { label: 'Decline politely', desc: '+800 crowns from the Crown for your modesty; no egg.', apply: (s) => { s.treasury += 800; return 'The rider bows, leaves a purse, and rides on with the crate.'; } },
    ],
  },
  {
    id: 'egg_seam', title: 'A seam of warm stone',
    text: 'Grimmen miners break into a seam that is warm to the touch, and in a hollow of red stone lies an egg the size of a bucket, ticking softly.',
    when: (s) => s.milestone >= 4 && s.buildings.some((b) => b && b.kind === 'mine' && b.age >= 20) && s.dragons.length < 6,
    choices: eggChoices('ember', 1500),
  },
  {
    id: 'egg_bone', title: 'A hatchling in the boneyard',
    text: 'The wisps over the Ossuary have gathered in a ring all week. At its centre the sexton finds an ivory egg half-buried in the quiet ground.',
    when: (s) => s.milestone >= 4 && s.buildings.some((b) => b && b.kind === 'ossuary') && s.agents.filter((a) => a.species === 'wisp').length >= 6 && s.dragons.length < 6,
    choices: eggChoices('bone', 1800),
  },
  {
    id: 'egg_glim', title: 'Something in the loft',
    text: 'The moth-keepers report a nest of glim-dust in the top of the loft, and in it a golden egg no bigger than a fist, warm as a lamp.',
    when: (s) => s.buildings.some((b) => b && b.kind === 'mothloft' && b.age >= 40) && s.dragons.length < 6,
    choices: eggChoices('glim', 900),
  },
  {
    id: 'egg_sky', title: 'A skyray nest', once: true,
    text: 'The rays circling the Beacon have left something on its roof: an egg like a pale stone, veined silver, cold to the touch and lighter than it should be.',
    when: (s) => s.agents.some((a) => a.kind === 3 && a.species === 'skyray' && a.phase === 1) && s.dragons.length < 6,
    choices: eggChoices('sky', 3000),
  },
  {
    id: 'egg_grey', title: 'The Concord vault', once: true,
    text: 'The bound wardens have led the foundry-masters to a door in the hill they were built to guard. Inside, in a nest of grey ash, lies an egg half turned to stone. It is warm.',
    when: (s) => s.stats.golemsBound >= 3 && s.dragons.length < 6,
    choices: eggChoices('grey', 3500),
  },
  {
    id: 'egg_poachers', title: 'Poachers at the gate',
    text: 'Three hooded carters offer an egg wrapped in wet moss for 2,500 crowns. They will not say where it came from. The Watch would like a word with them.',
    when: (s) => s.buildings.some((b) => b && b.kind === 'cradle') && s.treasury > 3000 && s.dragons.length < 6,
    choices: [
      { label: 'Buy the egg (2,500 crowns)', desc: 'An ember, bone or glim egg, if a cradle has room.', apply: (s) => { const rng = rngOf(s); const line = rng.pick(['ember', 'bone', 'glim'] as DragonLine[]); commitRng(s, rng); s.treasury -= 2500; const d = addEgg(s, line); return d ? `A ${LINE_INFO[line].name.toLowerCase()} egg, still warm. The poachers are gone before the crowns are counted.` : 'No cradle had room; the egg is sold on to the Crown at a loss. The poachers laugh.'; } },
      { label: 'Arrest them', desc: 'Unrest −3% for 10 days; 40% chance the egg is recovered anyway.', apply: (s) => { s.modifiers.push({ kind: 'unrest', value: -0.03, until: s.day + 10, label: 'Poachers jailed' }); const rng = rngOf(s); const luck = rng.chance(0.4); commitRng(s, rng); if (luck) { const d = addEgg(s, 'ember'); if (d) return 'The Watch takes the carters and the egg. It goes to the cradle.'; } return 'The Watch takes the carters. The egg is not in the cart.'; } },
      { label: 'Send them away', desc: 'Nothing changes.', apply: () => 'They leave by the Gloam road, moss dripping.' },
    ],
  },
];

/** Visitors from the wider Eda (lore drop). */
/** The Crown's assessor comes for relics. */
const CROWN: EventDef[] = [
  {
    id: 'assessor', title: "The Crown's assessor",
    text: 'A grey coach with the royal lantern on its door stops at the Ruin Delve. The assessor has a ledger, a loupe and a purse, and asks what the diggers have brought up.',
    when: (s) => s.relicStock >= 12 && s.buildings.some((b) => b && b.kind === 'ruindelve' && b.state === 'ok'),
    choices: [
      { label: 'Sell the loose relics', desc: '90 crowns each, better than the depot pays; the sextons mutter (−5).', apply: (s) => { const n = s.relicStock; s.treasury += n * 90; s.stats.relicsSold += n; s.relicStock = 0; s.guilds.standing.sextons = Math.max(0, s.guilds.standing.sextons - 5); return `${n} relics go north under seal for ${n * 90} crowns. Hollis says the dead will want them back.`; } },
      { label: 'Sell the uncatalogued pieces', desc: '1,500 crowns for each set piece the Academy has not named; they are gone from the sets. Sextons −8.', apply: (s) => { const n = s.relics.uncatalogued; if (!n) return 'There are no uncatalogued pieces. The assessor buys a cup of tea instead.'; s.treasury += n * 1500; s.relics.uncatalogued = 0; s.stats.relicsSold += n; s.guilds.standing.sextons = Math.max(0, s.guilds.standing.sextons - 8); return `${n} piece(s) of something older than the Concord leave in the grey coach for ${n * 1500} crowns.`; } },
      { label: 'Keep everything for the Academy', desc: 'Educated share +2%; the assessor leaves empty-handed.', apply: (s) => { s.educated = Math.min(0.95, s.educated + 0.02); return 'The assessor writes a long note and underlines it twice. The scholars are delighted.'; } },
    ],
  },
];

const VISITORS: EventDef[] = [
  {
    id: 'fennex', title: 'The Fen-Nex come to market', once: true,
    text: 'Fox-folk in travelling cloaks, seven of them, or nine, or five: they change between counts. They trade honestly exactly half the time and are proud of it. Their speaker offers a deal, or a quarter of the city to make their own.',
    when: (s) => s.milestone >= 4 && s.population > 250,
    choices: [
      { label: 'Trade with them', desc: 'Half the time +3,000 crowns; half the time −1,500 crowns and a week of grumbling.', apply: (s) => { const rng = rngOf(s); const honest = rng.chance(0.5); commitRng(s, rng); if (honest) { s.treasury += 3000; return 'Honest, this time. Salts, dyes and a set of scales that weigh true, paid for in coin that stays coin.'; } s.treasury -= 1500; s.modifiers.push({ kind: 'happiness', value: -3, until: s.day + 7, label: 'Swindled by foxes' }); return 'The coin turns to leaves by morning. The Fen-Nex are already two valleys away, laughing.'; } },
      { label: 'Grant them a quarter', desc: 'The district with the most markets becomes the Fen-Nex quarter: its markets pay no tithe but hold twice the goods. Needs a painted district with markets.', apply: (s) => { const d = marketDistrict(s); if (!d) return 'No painted district holds a market. The foxes shrug and trade honestly, for once: +500 crowns.'; s.fenNex = d; pushMessage(s, `${districtName(s, d)} is the Fen-Nex quarter now: no tithe from its markets, twice the shelves.`, 'milestone', true); return `They move into ${districtName(s, d)} overnight. The market signs are already in two scripts.`; } },
      { label: 'Turn them away', desc: 'No effect, probably.', apply: () => 'They bow, and bow, and are gone. One of the Watch lanterns is missing in the morning.' },
    ],
  },
  {
    id: 'fennex_gift', title: 'A gift from the quarter', once: true,
    text: 'The Fen-Nex speaker brings a basket to the Founding Stake: in it, an egg the colour of fox fur, warm and purring. "Half our gifts are real," she says. "Guess which half."',
    when: (s) => s.fenNex > 0 && s.day - s.lastEventDay >= 20 && s.buildings.some((b) => b && b.kind === 'cradle' && b.state === 'ok'),
    choices: [
      { label: 'Take the egg', desc: 'A fen-drake egg, if a cradle has room; or a basket of leaves.', apply: (s) => { const rng = rngOf(s); const real = rng.chance(0.5); commitRng(s, rng); if (!real) { s.modifiers.push({ kind: 'happiness', value: 2, until: s.day + 10, label: 'A good joke' }); return 'Leaves. Very warm leaves. The whole quarter is laughing and, somehow, so is the city.'; } const d = addEgg(s, 'fen'); return d ? `Real. The tamers call it ${d.name}; it is already stealing shoes.` : 'Real, and no cradle has room. The speaker takes it back with a look of sympathy.'; } },
      { label: 'Decline', desc: 'Nothing changes.', apply: () => '"Wise," she says, in a tone that means the opposite.' },
    ],
  },
  {
    id: 'longwood_sighting', title: 'Something out of Longwood',
    text: 'Woodcutters at the forest edge saw a creature no bestiary in Vell describes: antlered, luminous, walking on the mist. It looked at them for a long moment and went back into the trees.',
    when: (s) => forestTiles(s) >= TIGER_FOREST && s.milestone >= 2,
    choices: [
      { label: 'Let it be told', desc: 'Happiness +3 for 12 days.', apply: (s) => { s.modifiers.push({ kind: 'happiness', value: 3, until: s.day + 12, label: 'A wonder in the woods' }); return 'The story grows a head each telling. Children leave apples at the forest edge.'; } },
      { label: 'Send hunters after it (400 crowns)', desc: 'It is never found; unrest −3% for 10 days (the hunt is a holiday).', apply: (s) => { s.treasury -= 400; s.modifiers.push({ kind: 'unrest', value: -0.03, until: s.day + 10, label: 'The hunt' }); return 'Three days in the trees, a great deal of ale, and one very clear hoofprint.'; } },
    ],
  },
  {
    id: 'dr_jelly', title: 'Dr. Jelly', once: true,
    text: 'An alchemist in a coat of many pockets, who introduces himself as Dr. Jelly and is very sorry about the name, offers one potion for 1,200 crowns. He will not say what it does. He is fairly sure it is not fatal.',
    when: (s) => s.milestone >= 3 && s.treasury > 3000,
    choices: [
      { label: 'Buy the potion', desc: 'A random large effect: crowns, happiness, schooling, or a mana headache.', apply: (s) => { s.treasury -= 1200; const rng = rngOf(s); const r = rng.int(4); commitRng(s, rng); if (r === 0) { s.treasury += 6000; return 'Drunk by the Warden-Reeve at noon. By dusk a vein of silver is found under the square: +6,000 crowns.'; } if (r === 1) { s.modifiers.push({ kind: 'happiness', value: 10, until: s.day + 20, label: "Dr. Jelly's potion" }); return 'Poured into the well. Everyone is very, very cheerful for three weeks.'; } if (r === 2) { s.educated = Math.min(0.95, s.educated + 0.1); return 'Given to the Academy. The students understand leystone perfectly for one afternoon, and write it all down.'; } s.modifiers.push({ kind: 'mana', value: 0.3, until: s.day + 10, label: 'Ley headache' }); return 'The spires hum a note nobody asked for. Mana demand +30% for ten days.'; } },
      { label: 'Decline', desc: 'He sells it to someone in the Craft district instead.', apply: (s) => { s.modifiers.push({ kind: 'goods', value: 0.1, until: s.day + 10, label: 'Strange batch' }); return 'The stills run strange and strong for a week. Craft goods +10%.'; } },
    ],
  },
  {
    id: 'cloud_wizard', title: 'The Cloud Forest Wizard', once: true,
    text: 'A wizard who smells of rain and moss offers to plant a grove of glimwood beside your founding node: trees that light themselves, as in the cloud forests of the far south. He asks only that nobody cut them.',
    when: (s) => s.milestone >= 4,
    choices: [
      { label: 'Let him plant', desc: 'Twelve tiles near the founding node become glimwood forest: land value and happiness +4 for a season.', apply: (s) => { const f = s.founding; let n = 0; const rng = rngOf(s); for (let tries = 0; tries < 200 && n < 12; tries++) { const x = f.x + rng.int(17) - 8; const y = f.y + rng.int(17) - 8; if (!inBounds(x, y)) continue; const i = idx(x, y); if (s.terrain[i] !== Terrain.Grass && s.terrain[i] !== Terrain.Meadow) continue; if (s.bIndex[i] >= 0 || s.road[i] || s.zone[i] || s.wall[i]) continue; s.terrain[i] = Terrain.Forest; markDirty(s, x, y); n++; } commitRng(s, rng); s.modifiers.push({ kind: 'happiness', value: 4, until: s.day + 30, label: 'The glimwood grove' }); return `${n} glimwood saplings, waist-high by morning and glowing by the next night.`; } },
      { label: 'Thank him and decline', desc: 'No effect.', apply: () => 'He leaves a single seed on the Stake. It has not sprouted. Yet.' },
    ],
  },
  {
    id: 'asyrion', title: 'A traveller at the gate', once: true,
    text: 'A quiet traveller stops at the Founding Stake, studies the spires for a long while as if checking them against a drawing, and asks nothing. Before leaving they set down a purse and a single line on a scrap of paper: "It is good. Keep going."',
    when: (s) => s.milestone >= 5 && s.day > 60,
    choices: [
      { label: 'Keep the note', desc: '+500 crowns; happiness +2 for 10 days.', apply: (s) => { s.treasury += 500; s.modifiers.push({ kind: 'happiness', value: 2, until: s.day + 10, label: 'A kind word' }); return 'The note is pinned inside the Stake. Nobody agrees on what the traveller looked like.'; } },
    ],
  },
  {
    id: 'stormcaller', title: 'A storm caller of the Huruhui', once: true,
    text: 'A traveller with white hair and glowing sigils on their arms asks for a hilltop to work from. They say the valleys beyond the Pass of Buluiain taught them to call rain, and that your Craft district smells like it needs some.',
    when: (s) => s.milestone >= 4 && s.population > 300,
    choices: [
      { label: 'Give them the hills', desc: 'Rain over the whole city for 10 days (fires out, miasma washed, herbs thriving); educated share +2%. The Storm-Caller\'s Peak becomes buildable at Township.', apply: (s) => { s.modifiers.push({ kind: 'rain', value: 1, until: s.day + 10, label: 'Huruhui rain' }); s.educated = Math.min(0.95, s.educated + 0.02); let n = 0; for (const b of s.buildings) if (b && b.state === 'burning') { b.state = 'ok'; b.stateDays = 0; n++; } return `They climb at dusk. By midnight it is raining on every roof in the valley and ${n} fire${n === 1 ? ' is' : 's are'} out. The Academy takes notes.`; } },
      { label: 'Send them on to Vell-on-Sable', desc: 'No effect.', apply: () => 'They bow, and the wind picks up as they leave, which may be coincidence.' },
    ],
  },
  {
    id: 'caravan', title: 'A caravan from the Plains of Belerial',
    text: 'Dust on the Gloam road: riders on tall two-legged striders, banners the colour of the yellow plains, wagons behind. They halt at the Trade Depot and unroll their goods.',
    when: (s) => s.buildings.some((b) => b && b.kind === 'depot' && b.state === 'ok') && s.milestone >= 3,
    choices: [
      { label: 'Trade', desc: 'Sell surplus goods from full works at 1.5x the season price.', apply: (s) => { let sold = 0; for (const b of s.buildings) { if (!b || b.state !== 'ok') continue; const def = BUILDING_BY_KEY[b.kind]; if (def.zone === Zone.Craft && b.stock > 10) { const n = b.stock - 10; b.stock = 10; sold += n; } } const crowns = Math.round(sold * s.trade.priceGoods * 1.5); s.treasury += crowns; return `${sold} goods change hands for ${crowns} crowns. The riders pay in Belerial gold, which the guild weighs twice.`; } },
      { label: 'Sell rare goods', desc: 'Scale 400, rayscale 300, glim-dust 150 crowns each; the Plains pay well for what they cannot breed.', apply: (s) => { const m = s.materials; const crowns = Math.round(m.scale * 400 + m.rayscale * 300 + m.glimdust * 150); const line = `${Math.round(m.scale)} scale, ${m.rayscale.toFixed(1)} rayscale and ${m.glimdust.toFixed(1)} glim-dust`; m.scale = 0; m.rayscale = 0; m.glimdust = 0; s.treasury += crowns; return crowns > 0 ? `${line} go east in sealed jars for ${crowns} crowns.` : 'The jars are empty. The riders shrug and water the striders.'; } },
      { label: 'Buy striders (2,000 crowns)', desc: 'Mounted Watch patrols: watch coverage +0.2 everywhere for 60 days.', apply: (s) => { if (s.treasury < 2000) return 'The purse is too light; the riders shrug and pack up.'; s.treasury -= 2000; s.modifiers.push({ kind: 'watch', value: 0.2, until: s.day + 60, label: 'Strider patrols' }); return 'Four striders and a rider to teach the Watch. The birds hiss at everyone but the Grimmen.'; } },
      { label: 'Send them on', desc: 'No effect.', apply: () => 'They water the striders and ride for the next wardlight before noon.' },
    ],
  },
  {
    id: 'merchant', title: 'The Wandering Merchant of Belerial',
    text: 'A single wagon with a wandering merchant famous across three regions. The wagon holds things no cart in Vell has carried: seeds from Longwood, a white egg in a basket of feathers, salts from the Ulum.',
    when: (s) => s.buildings.some((b) => b && b.kind === 'depot' && b.state === 'ok') && s.milestone >= 5 && s.day - s.lastEventDay > 30,
    choices: [
      { label: 'The white egg (4,000 crowns)', desc: 'A sky egg: a wyvern-only line, the fastest courier. Needs a free cradle.', apply: (s) => { if (s.treasury < 4000) return 'Not enough crowns; the merchant smiles and closes the basket.'; const d = addEgg(s, 'sky'); if (!d) return 'No cradle has room. The merchant keeps the egg and your interest.'; s.treasury -= 4000; return `The egg is white as the plains at noon. The tamers name it ${d.name}.`; } },
      { label: 'Longwood seeds (1,200 crowns)', desc: 'Goods production +20% for 30 days.', apply: (s) => { if (s.treasury < 1200) return 'Not enough crowns.'; s.treasury -= 1200; s.modifiers.push({ kind: 'goods', value: 0.2, until: s.day + 30, label: 'Longwood seeds' }); return 'The seeds sprout overnight in the herb yards, which the alchemists find rude.'; } },
      { label: 'Ulum salts (600 crowns)', desc: 'Unquieted dead −30; health +10 for 15 days.', apply: (s) => { if (s.treasury < 600) return 'Not enough crowns.'; s.treasury -= 600; s.unquieted = Math.max(0, s.unquieted - 30); s.modifiers.push({ kind: 'health', value: 0.1, until: s.day + 15, label: 'Ulum salts' }); return 'Salt on every lip in the boneyard, and a cleaner cough in the low streets.'; } },
      { label: 'Only talk', desc: 'No effect; the merchant remembers you.', apply: () => 'You trade stories: the Gates, the storm caller, a fox that was a man. The merchant leaves at dawn.' },
    ],
  },
];

/** The Sleeping Wyrm (DESIGN 4.29). These fire on their own conditions, before the random draw. */
export const WYRM_EVENTS: EventDef[] = [
  {
    id: 'airship_tale', title: "The captain's story",
    text: 'The airship captain will not take her fee until she has told it: a wardlight three lanterns east whose spires sing in a different key, a market that trades in dreams, a wyrm that asked after yours by name. She has brought something back.',
    when: (s) => s.airship.tale > 0 && !s.pendingEvent,
    choices: [
      { label: 'Rayscale and glim-dust', desc: 'Rayscale +4 (artifacts +10% while it lasts); Craft goods +10% for 15 days.', apply: (s) => { s.airship.tale = 0; s.materials.rayscale += 4; s.modifiers.push({ kind: 'goods', value: 0.1, until: s.day + 15, label: 'Foreign reagents' }); return 'Crates of pale scale and a jar of dust that hums. The alchemists close the shutters for a week.'; } },
      { label: 'Passengers', desc: 'Up to 30 folk from the other wardlight move into empty hearths.', apply: (s) => { s.airship.tale = 0; return `${addResidents(s, 30)} folk step off the gondola with everything they own and a letter of introduction.`; } },
      { label: 'The story itself', desc: 'Happiness +5 for 20 days.', apply: (s) => { s.airship.tale = 0; s.modifiers.push({ kind: 'happiness', value: 5, until: s.day + 20, label: "The captain's story" }); return 'She tells it on the square at dusk. Nobody goes home until the spires dim.'; } },
    ],
  },
  {
    id: 'wyrm_tribute', title: 'The wyrm wants its due',
    text: 'Its head rests on the ridge above the node, eyes like two ley-lamps. A Tallowkin who claims to understand it says the terms are simple: a tribute each season, rising, or it flies.',
    when: (s) => s.wyrm.state === 'awake' && s.wyrm.tributeDay >= 0 && s.day >= s.wyrm.tributeDay && !s.pendingEvent,
    choices: [
      { label: 'Pay in crowns', desc: 'Costs the current tribute; the next will be half again as much.', apply: (s) => payTribute(s, 'crowns') },
      { label: 'Pay in goods', desc: `${WYRM_TRIBUTE_GOODS} goods taken from the market shelves. Fewer than half and it counts as a refusal.`, apply: (s) => payTribute(s, 'goods') },
      { label: 'Refuse', desc: 'It flies over the city and burns up to four buildings, then sleeps again; spires near it will wake it once more.', apply: (s) => refuse(s) },
    ],
  },
  {
    id: 'wyrm_binding', title: 'The song at the Court',
    text: 'The Wyrm-Court is lit and the singers are ready. Tonight they can walk to the node and sing the binding: a night of song that ends, if the schools have taught them well, with a guardian.',
    when: (s) => s.wyrm.state === 'awake' && hasCourt(s) && !s.pendingEvent && (s.wyrm.tributeDay < 0 || s.day < s.wyrm.tributeDay) && (s.wyrm.askedBind < 0 || s.day - s.wyrm.askedBind >= 20),
    choices: [
      { label: 'Sing the binding', desc: 'Needs a third of the folk educated. Otherwise the singers falter and the wyrm demands tribute at once.', apply: (s) => { if (s.educated >= 0.3) return bind(s); s.wyrm.tributeDay = s.day; s.modifiers.push({ kind: 'happiness', value: -4, until: s.day + 10, label: 'Failed binding' }); return 'The song breaks before dawn. The wyrm laughs, if wyrms laugh, and names its price.'; } },
      { label: 'Not yet', desc: 'Wait a season; the Court keeps its upkeep.', apply: () => 'The singers practise. The wyrm listens from the ridge.' },
    ],
  },
  {
    id: 'wyrm_sulks', title: 'The guardian sulks',
    text: 'The markets have not fed the wyrm for ten days. It lies with its back to the city and the Gloam creeps a little closer each night. Its keeper says it would take leystone, or coin, as an apology.',
    when: (s) => s.wyrm.state === 'bound' && s.wyrm.sulking >= 2 && s.wyrm.sulking % 10 === 2 && !s.pendingEvent,
    choices: [
      { label: 'Send leystone (60)', desc: 'Taken from Arcane workshops; the wyrm is content again at once.', apply: (s) => { let left = 60; forEachBuilding(s, (b) => { if (left > 0 && BUILDING_BY_KEY[b.kind].zone === Zone.Arcane && b.stock > 0) { const t = Math.min(b.stock, left); b.stock -= t; left -= t; } }); if (left > 30) return 'There is not enough leystone in the city. The wyrm sniffs at what came and turns away.'; s.wyrm.sulking = 0; s.wyrm.unfed = 0; return 'It eats the leystone like bread and comes back to its post by the node.'; } },
      { label: 'Pay 3,000 crowns', desc: 'Bought goods from Belerial are carted to it.', apply: (s) => { s.treasury -= 3000; s.wyrm.sulking = 0; s.wyrm.unfed = 0; return 'Forty carts of Belerial bread and beer. The wyrm is content, for now.'; } },
      { label: 'Let it sulk', desc: `No ward from its lair until markets feed it ${WYRM_EATS} goods a day. Forty days of sulking and it dies.`, apply: () => 'It does not look at the city. The lanterns at the edge burn alone.' },
    ],
  },
  {
    id: 'egg_vein', title: 'A vein egg',
    text: 'The bound wyrm has been fed and content for a full season. At dawn the keepers find an egg on the warm stone of its node: ley-blue, veined with light, humming the note the spires hum.',
    when: (s) => s.wyrm.state === 'bound' && s.wyrm.sulking === 0 && s.wyrm.fedDays >= 30 && !s.pendingEvent,
    choices: [
      { label: 'Keep the egg', desc: 'Needs a Wyrm-Cradle with a free slot; otherwise it is sold to the Crown for 6,000 crowns.', apply: (s) => { s.wyrm.fedDays = 0; const d = addEgg(s, 'vein'); if (d) return `The vein egg is carried to the cradle under guard. The tamers call it ${d.name}.`; s.treasury += 6000; return 'No cradle had room. The Crown pays 6,000 crowns and sends a warded coach for it.'; } },
      { label: 'Leave it with the wyrm', desc: 'Happiness +5 for 20 days; the wyrm is grateful.', apply: (s) => { s.wyrm.fedDays = 0; s.modifiers.push({ kind: 'happiness', value: 5, until: s.day + 20, label: 'The wyrm is grateful' }); return 'The wyrm curls around it. Folk come to the edge of the lair to hear the two notes together.'; } },
    ],
  },
];

export const ALL_EVENTS: EventDef[] = [...EVENTS, ...CHAINS, ...EGGS, ...VISITORS, ...CROWN, ...CALENDAR, ...WYRM_EVENTS, ...COUNCIL_EVENTS];

/** Fires the calendar event of today, if any (once per year). */
export function maybeFireCalendar(s: GameState): void {
  if (s.pendingEvent || s.gameOver || s.day < 30) return; // the founding Thaw has no festivals
  const season = Math.floor(s.day / 30) % 4;
  const dayOfSeason = s.day % 30;
  const year = Math.floor(s.day / 120);
  for (const e of CALENDAR) {
    if (e.season !== season || e.seasonDay !== dayOfSeason || !e.when(s)) continue;
    const tag = `${e.id}@${year}`;
    if (s.firedEvents.some((f) => f.startsWith(tag))) continue;
    s.pendingEvent = { id: e.id, title: e.title, text: e.text, choices: e.choices.map((c) => ({ label: c.label, desc: c.desc })) };
    s.firedEvents.push(`${tag}:?`);
    s.lastEventDay = s.day;
    return;
  }
}

/** Wyrm events fire on their own terms (no random draw, no 18-day spacing). */
export function maybeFireWyrm(s: GameState): void {
  if (s.pendingEvent || s.gameOver || s.wyrm.state === 'none') return;
  for (const e of WYRM_EVENTS) {
    if (!e.when(s)) continue;
    if (e.id === 'wyrm_binding') s.wyrm.askedBind = s.day;
    s.pendingEvent = { id: e.id, title: e.title, text: e.text, choices: e.choices.map((c) => ({ label: c.label, desc: c.desc })) };
    s.firedEvents.push(`${e.id}:?`);
    if (s.firedEvents.length > 40) s.firedEvents.shift();
    return;
  }
}

export function maybeFireEvent(s: GameState): void {
  if (s.pendingEvent || s.gameOver) return;
  // the storyteller: a grace week after an ill tiding; a long calm invites trouble
  if (s.day - s.lastBadDay < 6) return;
  const calm = s.day - Math.max(s.lastBadDay, s.lastEventDay);
  if (s.day - s.lastEventDay < (calm > 25 ? 10 : 18)) return;
  const rng = rngOf(s);
  if (!rng.chance(calm > 25 ? 0.24 : 0.12)) {
    commitRng(s, rng);
    return;
  }
  const recent = s.firedEvents.slice(-4).map((f) => f.split(':')[0]);
  const fired = (id: string) => s.firedEvents.some((f) => f.split(':')[0] === id);
  const pool = [...EVENTS, ...CHAINS, ...EGGS, ...VISITORS, ...CROWN].filter((e) => e.when(s) && !recent.includes(e.id) && !(e.once && fired(e.id)));
  if (pool.length) {
    const e = rng.pick(pool);
    s.pendingEvent = { id: e.id, title: e.title, text: e.text, choices: e.choices.map((c) => ({ label: c.label, desc: c.desc })) };
    s.lastEventDay = s.day;
    s.firedEvents.push(`${e.id}:?`);
    if (s.firedEvents.length > 40) s.firedEvents.shift();
  }
  commitRng(s, rng);
}

export function resolveEvent(s: GameState, choice: number): void {
  const pe = s.pendingEvent;
  if (!pe) return;
  const def = ALL_EVENTS.find((e) => e.id === pe.id);
  s.pendingEvent = null;
  if (!def) return;
  const ci = Math.max(0, Math.min(def.choices.length - 1, choice));
  const c = def.choices[ci];
  for (let k = s.firedEvents.length - 1; k >= 0; k--) {
    const f = s.firedEvents[k];
    if (f.endsWith(':?') && (f === `${def.id}:?` || f.startsWith(`${def.id}@`))) { s.firedEvents[k] = f.slice(0, -1) + ci; break; }
  }
  const result = c.apply(s);
  pushMessage(s, `${pe.title}: ${result}`, 'milestone');
}
