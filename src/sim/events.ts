/** Story events with choices. Fired every ~18-30 days when their condition holds; the game pauses until answered. */
import { BUILDING_BY_KEY } from './catalog';
import { bodyOf, ensureShoals, shoalCap } from './water';
import { moorings, factionOf } from '../data/factions';
import { DISTRICT_NAMES, Terrain, Zone, type Building, type DragonLine, type GameState } from './types';
import { COUNCIL_EVENTS } from './guilds';
import { LINE_INFO, STAGE_NAMES, addEgg, dueReturn, freeCradle, homeReturn, isCradle, payReturn, refuseReturn, RETURN_TRIBUTE, RETURN_GOODS } from './wyrmcraft';
import { hasAcademy } from './relics';
import { canPlaceBuilding, commitRng, forEachBuilding, illTiding, placeBuildingRaw, pushMessage, rngOf, seasonOf } from './world';
import { addFavour } from './economy';
import { Rng, hashString } from '../core/rng';
import { capacityOf } from './growth';
import { spawnRestless } from './agents';
import { TIGER_FOREST, forestTiles, marketDistrict, startStorm } from './lore';
import { districtName, markDirty } from './world';
import { MAP_W, inBounds, idx } from './types';
import { igniteBuilding, recomputeGloamDist } from './hazards';
import { RIOT_UNREST } from './growth';
import { WYRM_EATS, WYRM_TRIBUTE_GOODS, bind, hasCourt, marketGoods, payTribute, refuse, takeGoods, wyrmNode, wyrmTribute } from './wyrm';

export interface EventDef {
  id: string;
  title: string;
  text: string;
  when: (s: GameState) => boolean;
  once?: boolean; // never repeats
  priority?: boolean; // drawn before any other tale while it is eligible (a tale something else depends on)
  choices: { label: string; desc: string | ((s: GameState) => string); apply: (s: GameState, amount?: number) => string; slider?: { max: number; label: string } }[];
}
/** A choice's description for this city (a people may change the numbers). */
export function descOf(c: { desc: string | ((s: GameState) => string) }, s: GameState): string {
  return typeof c.desc === 'function' ? c.desc(s) : c.desc;
}

function addResidents(s: GameState, n: number): number {
  let left = n;
  forEachBuilding(s, (b) => {
    if (left <= 0 || BUILDING_BY_KEY[b.kind].zone !== Zone.Hearth || b.state !== 'ok') return;
    const room = capacityOf(b, s) - b.residents;
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
      { label: 'Welcome them', desc: 'Up to 40 folk move into empty homes; a month on they will ask for a shrine of their own.', apply: (s) => { s.pilgrimsDay = s.day; return `${addResidents(s, 40)} pilgrims found hearths in ${s.cityName}.`; } },
      { label: 'Bless them and send them on', desc: 'Nothing changes, but Aume remembers: happiness +3 for 10 days.', apply: (s) => { s.modifiers.push({ kind: 'happiness', value: 3, until: s.day + 10, label: 'Pilgrims blessed' }); return 'The pilgrims walk on, singing.'; } },
    ],
  },
  {
    id: 'relic', title: 'A relic of the Concord', once: true,
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
      { label: 'Pay the tenth', desc: '−10% of the treasury; the Crown\'s favour +5.', apply: (s) => { const t = Math.round(s.treasury * 0.1); s.treasury -= t; addFavour(s, 5); return `${t} crowns ride back to Vell-on-Sable under guard. The collector writes "prompt" in the margin.`; } },
      { label: 'Plead the Gloam', desc: (s) => `Keep the crowns; the Crown's favour −10, and the audit is harsher each time: ${s.pleadings === 0 ? 'tithe income −15% for 15 days' : s.pleadings === 1 ? 'tithe income −25% for 15 days' : 'a levy of a fifth of the treasury at once'} (pleaded ${s.pleadings} time${s.pleadings === 1 ? '' : 's'} before).`, apply: (s) => { addFavour(s, -10); s.pleadings++; if (s.pleadings === 1) { s.modifiers.push({ kind: 'tithe', value: -0.15, until: s.day + 15, label: 'Crown audit' }); return 'The collector leaves with a thin smile and a thick ledger.'; } if (s.pleadings === 2) { s.modifiers.push({ kind: 'tithe', value: -0.25, until: s.day + 15, label: 'Crown audit, the second' }); return 'The collector has heard of the Gloam. He audits every shelf in the city for a fortnight.'; } const t = Math.round(s.treasury * 0.2); s.treasury -= t; s.stats.levies++; s.stats.levied += t; return `The collector has heard this before. ${t} crowns, a fifth of the treasury, are counted out on the Stake's steps under guard.`; } },
    ],
  },
  // ---- the wild (M16 part 1, iteration 58) ----
  {
    id: 'whitehart', title: 'The white hart', once: true,
    text: 'The watch on the stake saw it at first light: a white hart grazing with the deer on the meadow, its antlers like frost on a branch. By noon half the city has climbed something to look. The lodge\'s master asks whether the Warden-Reeve wants its head.',
    when: (s) => s.day >= 20 && s.wild.herds.some((h) => h.sp === 'deer' && h.head >= 6 && Math.hypot(h.x - s.founding.x, h.y - s.founding.y) <= 25),
    choices: [
      { label: 'Hunt it', desc: '+400 crowns for its head (a trophy); every herd of deer loses 2 head; the folk call it an ill omen: happiness −3 for 20 days.', apply: (s) => { s.treasury += 400; s.stats.trophies++; for (const h of s.wild.herds) if (h.sp === 'deer') h.head = Math.max(0.5, h.head - 2); s.modifiers.push({ kind: 'happiness', value: -3, until: s.day + 20, label: 'The white hart killed' }); return 'The hart\'s head goes to Vell-on-Sable in a cart lined with straw. The deer keep to the far meadows after.'; } },
      { label: 'Let it run', desc: 'The herds breed half again as fast for 60 days; happiness +2 for 20 days.', apply: (s) => { s.wild.thriveUntil = s.day + 60; s.modifiers.push({ kind: 'happiness', value: 2, until: s.day + 20, label: 'The white hart seen' }); return 'The hart walks into the forest at dusk. The children draw it on every wall in the low streets.'; } },
    ],
  },
  {
    id: 'wolfwinter', title: 'The wolf winter',
    text: 'The wolves are bold this Hush. They have taken hens from the hearths at the forest edge and their howling keeps the low streets awake. A deputation of goodwives waits on the stake\'s steps with a dead hen.',
    when: (s) => seasonOf(s) === 3 && s.wild.herds.filter((h) => h.sp === 'wolf' && h.head >= 2).length >= 2 && s.day - s.wild.hensDay <= 10,
    choices: [
      { label: 'Call a winter hunt (300 crowns)', desc: 'Every pack within 30 of the stake loses half its head; their hides go to the nearest lodge.', apply: (s) => { s.treasury -= 300; let hides = 0; for (const h of s.wild.herds) if (h.sp === 'wolf' && Math.hypot(h.x - s.founding.x, h.y - s.founding.y) <= 30) { const k = Math.floor(h.head / 2); h.head -= k; hides += 2 * k; } const lodge = s.buildings.find((b) => b && b.kind === 'hunterslodge' && b.state === 'ok'); if (lodge) lodge.stock += hides; s.stats.hides += hides; return `The hunt goes out with torches and hound-spears. ${hides / 2} wolves do not come back to the forest${lodge ? '' : ', and with no lodge to cure them the hides rot in a shed'}.`; } },
      { label: 'Lamps on the folds (150 crowns)', desc: 'Lanterns over every hen-house for 30 days: the wolves take no hens.', apply: (s) => { s.treasury -= 150; s.wild.foldsUntil = s.day + 30; return 'Every fold in the low streets gets a lamp on a pole. The wolves sit at the forest edge and watch them.'; } },
      { label: 'Let the wolves keep the deer', desc: 'The packs thin the deer instead: every herd of deer loses a fifth; unrest +3 % for 15 days.', apply: (s) => { for (const h of s.wild.herds) if (h.sp === 'deer') h.head *= 0.8; s.modifiers.push({ kind: 'unrest', value: 0.03, until: s.day + 15, label: 'The wolf winter' }); return 'The goodwives go home with their hen. The deer will pay for the winter.'; } },
    ],
  },
  // ---- the water (M16 part 2, iteration 60) ----
  {
    id: 'spawnrun', title: 'The spawning run', once: true,
    text: 'The fishers came up from the bank at dawn shouting. The water below the huts is silver from bank to bank: the spawning run, the whole year\'s fish in one place for three days. The net-master asks whether to take it.',
    when: (s) => seasonOf(s) === 1 && s.day >= 30 && !!spawnHut(s),
    choices: [
      { label: 'Net the run', desc: '+300 crowns for the catch; the shoal of that water falls to two fifths of what it holds.', apply: (s) => { const h = spawnHut(s); s.treasury += 300; if (h) { const w = ensureShoals(s); const b = bodyOf(s, h); s.water.fish[b] = Math.min(s.water.fish[b], shoalCap(w, b) * 0.4); } return 'Every boat and every net in the city goes out. The racks are full for a week and the Gloam road buys the rest. Next year will be thinner.'; } },
      { label: 'Let it spawn', desc: 'The shoals regrow twice as fast for 60 days; happiness +1 for 20 days.', apply: (s) => { s.water.spawnUntil = s.day + 60; s.modifiers.push({ kind: 'happiness', value: 1, until: s.day + 20, label: 'The spawning run' }); return 'The nets stay on the racks. Children line the bank to watch the water boil. The fishers say the river will remember.'; } },
    ],
  },
];

/** A Fishers' Hut on a shoal at four fifths of its cap or more (the spawning run's condition). */
function spawnHut(s: GameState): Building | null {
  let out: Building | null = null;
  const w = ensureShoals(s); // the shoals first: a new map's are filled on first use
  forEachBuilding(s, (b) => {
    if (out || b.kind !== 'fishershut' || b.state !== 'ok') return;
    const body = bodyOf(s, b);
    if (body >= 0 && s.water.fish[body] >= shoalCap(w, body) * 0.8) out = b;
  });
  return out;
}

/** True if event `id` was answered with choice `choice` at least `daysAgo` days ago. */
export function chose(s: GameState, id: string, choice: number): boolean {
  // a tale is recorded as `id:choice`; a festival as `id@year:choice`
  const plain = `${id}:${choice}`;
  const tail = `:${choice}`;
  const head = `${id}@`;
  return s.firedEvents.some((f) => f === plain || (f.startsWith(head) && f.endsWith(tail)));
}

const CHAINS: EventDef[] = [
  {
    id: 'pilgrims_shrine', title: 'The pilgrims ask for a shrine', priority: true,
    text: 'A month under your light, the pilgrims of Aume come to the Founding Stake with their priest. They have no shrine of their own, they say, and the Vigils are far; they ask for one among their hearths, and offer to raise the walls themselves.',
    when: (s) => s.pilgrimsDay >= 0 && s.day - s.pilgrimsDay >= PILGRIM_ASK_DAYS && s.day - s.pilgrimsDay <= PILGRIM_ASK_DAYS + 10,
    choices: [
      { label: 'Raise them a shrine (600 crowns)', desc: 'A shrine of Aume stands among the hearths; happiness +3 for 15 days.', apply: (s) => { s.pilgrimsDay = -1; const spot = findSpot(s, 'shrine'); if (!spot) return 'No ground among the hearths will take a shrine; the pilgrims keep praying at the Stake.'; s.treasury -= 600; const b = placeBuildingRaw(s, 'shrine', spot[0], spot[1]); markDirty(s, b.x, b.y); s.stats.pilgrimShrines++; s.modifiers.push({ kind: 'happiness', value: 3, until: s.day + 15, label: 'The pilgrims\' shrine' }); return `A shrine of Aume at (${spot[0]},${spot[1]}), raised in a week by people who sing while they work.`; } },
      { label: 'The Stake\'s hall is theirs on holy days', desc: 'No shrine; happiness +1 for 20 days.', apply: (s) => { s.pilgrimsDay = -1; s.modifiers.push({ kind: 'happiness', value: 1, until: s.day + 20, label: 'Holy days at the Stake' }); return 'The priest bows. The hall smells of candles every seventh day.'; } },
      { label: 'Refuse them', desc: 'Happiness −4 for 10 days; Aume remembers.', apply: (s) => { s.pilgrimsDay = -1; s.modifiers.push({ kind: 'happiness', value: -4, until: s.day + 10, label: 'The pilgrims refused' }); return 'They pray in the street outside the Stake for a week, which is worse.'; } },
    ],
  },
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
      { label: 'Open it', desc: 'Half the time a hoard: +8,000 crowns and relics. Half the time the old dead: eight restless rise at the ruins and the unquieted +20.', apply: (s) => { const rng = rngOf(s); const hoard = rng.chance(0.5); commitRng(s, rng); const d = s.buildings.find((b) => b && b.kind === 'ruindelve'); if (hoard) { s.treasury += 8000; s.stats.relics += 20; s.relicStock += 20; return 'A vault of lantern-cores and gold under a ceiling of painted stars. The diggers are paid triple and still will not go back.'; } s.unquieted += 20; if (d) for (let k = 0; k < 8; k++) spawnRestless(s, d.x + (k % 3), d.y + Math.floor(k / 3)); pushMessage(s, `The door at the Ruins of Lukuku opens and the old dead walk out at (${d?.x ?? 0},${d?.y ?? 0}).`, 'bad', true); return 'The door opens on stairs going down, and things coming up.'; } },
    ],
  },
  {
    id: 'relic_stolen', title: 'The relic is gone', once: true,
    text: 'The Concord lantern-core has vanished from the Academy\'s warded case. A cult of the Undying Court is suspected; their marks are chalked on the door.',
    when: (s) => chose(s, 'relic', 1) && s.day - s.lastEventDay >= 15 && hasAcademy(s),
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

/** Welcomed pilgrims ask for a shrine this many days on (iteration 54). */
export const PILGRIM_ASK_DAYS = 30;
/** The Fen-Nex quarter's seasonal audit: the foxes trade honestly half the time, on a coin of their own (iteration 54). */
export function foxAudit(s: GameState): void {
  if (s.fenNex <= 0 || s.day <= 0 || s.day % 30 !== 0) return;
  const rng = new Rng(hashString(`${s.seed}:${s.day}:fox`));
  const honest = rng.chance(0.5);
  s.stats.foxAudits++;
  if (honest) { s.treasury += 2000; pushMessage(s, `The season's audit of ${districtName(s, s.fenNex)}: the foxes' ledgers balance, for once, and ${s.cityName} is 2,000 crowns the richer.`, 'good', true); }
  else { s.treasury -= 1000; pushMessage(s, `The season's audit of ${districtName(s, s.fenNex)}: the foxes' ledgers are in three scripts and none of them adds up. 1,000 crowns are gone and nobody is sorry.`, 'warn', true); }
}

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
export const CALENDAR: (EventDef & { seasonDay: number; season: number })[] = [
  {
    id: 'thawday', title: 'Thaw-day', season: 0, seasonDay: 2,
    text: 'The ice has cracked on the river. By old Vellish custom the Warden-Reeve opens the Thaw with a feast on the square, or with a day of labour on the wards.',
    when: (s) => s.population > 40,
    choices: [
      { label: 'A feast (300 crowns and 40 goods)', desc: 'Markets give up to 40 goods from their shelves. Happiness +3 for 15 days everywhere, and +5 more in every district whose markets fed the feast. Under 10 goods it is a thin feast: +2 for 8 days.', apply: (s) => { s.treasury -= 300; const fed = holdFeast(s, 40); if (fed.goods < 10) { s.modifiers.push({ kind: 'happiness', value: 2, until: s.day + 8, label: 'A thin feast' }); return `The shelves were bare: ${Math.round(fed.goods)} goods make a thin feast of bread and water. The choir sings anyway.`; } s.modifiers.push({ kind: 'happiness', value: 3, until: s.day + 15, label: 'Thaw feast' }); for (const d of fed.districts) s.modifiers.push({ kind: 'happiness', value: 5, until: s.day + 15, label: `Thaw feast (${d ? DISTRICT_NAMES[d - 1] : 'the old town'})`, district: d }); return `${Math.round(fed.goods)} goods from ${fed.districts.map((d) => (d ? districtName(s, d) : 'the old town')).join(', ')}: bread, glimherb ale, and a Grimmen choir that nobody expected to be so good.`; } },
      { label: 'A day on the wards', desc: 'Every lit Ward Lantern burns back the Gloam once more today; happiness −2 for 5 days.', apply: (s) => { s.modifiers.push({ kind: 'happiness', value: -2, until: s.day + 5, label: 'Ward labour' }); let n = 0; for (let i = 0; i < s.gloam.length; i++) if (s.gloam[i] && s.coverage.ward[i] > 0) { s.gloam[i] = 0; n++; markDirty(s, i % MAP_W, Math.floor(i / MAP_W)); } s.stats.gloamBurned += n; if (n) recomputeGloamDist(s); return `${n} tiles of grey grass are cut and burned under the lanterns.`; } },
    ],
  },
  {
    id: 'remembrance', title: 'The Remembrance', season: 2, seasonDay: 15,
    text: 'Mid-Ember is the Remembrance of the Hollowing. Scholars ask to read the names of the nine houses aloud from the Founding Stake; the priests of Morrow would rather the names stayed buried.',
    when: (s) => s.population > 80,
    choices: [
      { label: 'Read the names', desc: 'Educated share +4%. The ley stirs: unquieted dead +12, or only +3 if an Ossuary holds the bones steady.', apply: (s) => { s.educated = Math.min(0.95, s.educated + 0.04); const oss = hasOssuary(s); s.unquieted += oss ? 3 : 12; s.remembranceDead += oss ? 3 : 12; return oss ? 'The names are read over the vaults. The bones keep their pattern and the spires barely flutter.' : 'The names are read. The spires hum a half-tone flat until dawn.'; } },
      { label: 'Keep the silence', desc: 'Unquieted dead −6, or −15 with an Ossuary to lay them in; the Four Vigils are pleased: happiness +2 for 10 days.', apply: (s) => { const oss = hasOssuary(s); s.unquieted = Math.max(0, s.unquieted - (oss ? 15 : 6)); s.modifiers.push({ kind: 'happiness', value: 2, until: s.day + 10, label: 'Remembrance kept' }); return oss ? 'A night of candles in the Ossuary. Hollis counts the quiet and finds it good.' : 'A night of candles and no speeches. Morrow approves.'; } },
    ],
  },
  {
    id: 'vigil', title: 'The Hush vigil', season: 3, seasonDay: 1,
    text: 'The first night of the Hush. Tradition asks every hearth to keep a lamp burning until dawn, so that the Gloam finds no dark window to whisper at.',
    when: (s) => s.population > 40,
    choices: [
      { label: 'Keep the vigil', desc: (s) => { const r = factionOf(s).rules; return `The lamps draw up to ${Math.round(120 * r.vigilCost)} stored mana from the Nexus rings: the Gloam holds 6 days, plus a day for every ${Math.round(12 * r.vigilCost)} mana drawn. Shallow stores (under ${Math.round(60 * r.vigilCost)}) mean the lamps burn from the spires instead: demand +15% for 10 days.`; }, apply: (s) => { const vc = factionOf(s).rules.vigilCost; const take = Math.min(120 * vc, s.manaStorage); s.manaStorage -= take; const days = 6 + Math.floor(take / (12 * vc)); if (take < 60 * vc) s.modifiers.push({ kind: 'mana', value: 0.15, until: s.day + 10, label: 'Hush vigil' }); s.modifiers.push({ kind: 'gloamHold', value: 1, until: s.day + days, label: 'Vigil holds the Gloam' }); return take >= 60 * vc ? `${Math.round(take)} mana from the stores keeps every window amber for ${days} nights, until day ${s.day + days}. Beyond the last lantern, the grey grass waits.` : `The stores are shallow: the spires burn hot to keep the windows lit, and the Gloam holds ${days} nights, until day ${s.day + days}.`; } },
      { label: 'Let folk sleep', desc: (s) => (factionOf(s).rules.vigilMandatory ? 'The Tallowkin do not sleep through the vigil. Happiness −8 for 30 days, and the dark remembers.' : 'No cost. The whispering is louder this Hush: happiness −3 for 20 days.'), apply: (s) => { const hard = factionOf(s).rules.vigilMandatory; s.modifiers.push({ kind: 'happiness', value: hard ? -8 : -3, until: s.day + (hard ? 30 : 20), label: 'Vigil skipped' }); return hard ? 'Nobody sleeps. Every candle-eyed child sits at a dark window all night, and in the morning nobody speaks to the Warden-Reeve.' : 'Old Maud keeps her lamp lit anyway. She says the dark remembers who did not.'; } },
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
    { label: `Sell it to the Crown (+${sell} crowns)`, desc: 'Crowns now, and the Crown\'s favour +3.', apply: (s) => { s.treasury += sell; addFavour(s, 3); return `${sell} crowns, and a receipt with the royal wyrm-seal.`; } },
    { label: 'Give it to the Academy', desc: 'Educated share +5% (needs an Academy), else happiness +3 for 10 days.', apply: (s) => { if (s.buildings.some((b) => b && (b.kind === 'academy' || b.kind === 'grandacademy'))) { s.educated = Math.min(0.95, s.educated + 0.05); return 'The scholars draw it from every angle and argue about the spiral.'; } s.modifiers.push({ kind: 'happiness', value: 3, until: s.day + 10, label: 'Egg on display' }); return 'Without an Academy it sits in the Founding Stake, and half the valley comes to look.'; } },
  ];
}

const EGGS: EventDef[] = [
  {
    id: 'egg_first', title: "The Crown's gift", once: true, priority: true, // the Crown heard of the cradle: it answers, not the luck of the draw (iteration 55)
    text: 'A rider from Vell-on-Sable brings a crate packed with warm ash and a letter under the wyrm-seal: the Crown has heard you raised a cradle, and sends a first egg "so that the valley may learn what it is to keep a dragon".',
    when: (s) => s.buildings.some((b) => b && isCradle(b.kind) && b.state === 'ok') && s.dragons.length === 0,
    choices: [
      { label: 'Accept the egg', desc: (s) => `${s.faction === 'veshari' ? 'A tide' : 'An ember'} egg goes into your cradle.`, apply: (s) => { const d = addEgg(s, s.faction === 'veshari' ? 'tide' : 'ember'); return d ? `The egg hums the moment it touches the cradle stones. The tamers call it ${d.name}.` : 'The cradle is full; the rider takes the egg on to the next wardlight.'; } },
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
    when: (s) => s.buildings.some((b) => b && isCradle(b.kind)) && s.treasury > 3000 && s.dragons.length < 6,
    choices: [
      { label: 'Buy the egg (2,500 crowns)', desc: 'An ember, bone or glim egg, if a cradle has room.', apply: (s) => { if (s.treasury < 2500) return 'The purse is too light; the carters pull their hoods up and go.'; const rng = rngOf(s); const line = rng.pick(['ember', 'bone', 'glim'] as DragonLine[]); commitRng(s, rng); if (!freeCradle(s, line)) return `No cradle has room for a ${LINE_INFO[line].name.toLowerCase()} egg; the poachers sell it on to the Crown.`; s.treasury -= 2500; const d = addEgg(s, line); return d ? `A ${LINE_INFO[line].name.toLowerCase()} egg, still warm. The poachers are gone before the crowns are counted.` : 'No cradle had room; the egg is sold on to the Crown at a loss. The poachers laugh.'; } },
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
      { label: 'Sell the loose relics', desc: '90 crowns each, better than the depot pays; the Crown\'s favour rises a fifth a relic; the sextons mutter (−5).', apply: (s) => { const n = s.relicStock; s.treasury += n * 90; s.stats.relicsSold += n; addFavour(s, 0.2 * n); s.relicStock = 0; s.guilds.standing.sextons = Math.max(0, s.guilds.standing.sextons - 5); return `${n} relics go north under seal for ${n * 90} crowns. Hollis says the dead will want them back.`; } },
      { label: 'Sell the uncatalogued pieces', desc: '1,500 crowns for each set piece the Academy has not named; they are gone from the sets; the Crown\'s favour +3 each. Sextons −8.', apply: (s) => { const n = s.relics.uncatalogued; if (!n) return 'There are no uncatalogued pieces. The assessor buys a cup of tea instead.'; s.treasury += n * 1500; s.relics.uncatalogued = 0; s.stats.relicsSold += n; addFavour(s, 3 * n); s.guilds.standing.sextons = Math.max(0, s.guilds.standing.sextons - 8); return `${n} piece(s) of something older than the Concord leave in the grey coach for ${n * 1500} crowns.`; } },
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
      { label: 'Grant them a quarter', desc: 'The district with the most markets becomes the Fen-Nex quarter: its markets pay no tithe but hold twice the goods. Needs a painted district with markets.', apply: (s) => { const d = marketDistrict(s); if (!d) { s.treasury += 500; return 'No painted district holds a market. The foxes shrug and trade honestly, for once: +500 crowns.'; } s.fenNex = d; pushMessage(s, `${districtName(s, d)} is the Fen-Nex quarter now: no tithe from its markets, twice the shelves.`, 'milestone', true); return `They move into ${districtName(s, d)} overnight. The market signs are already in two scripts.`; } },
      { label: 'Turn them away', desc: 'No effect, probably.', apply: () => 'They bow, and bow, and are gone. One of the Watch lanterns is missing in the morning.' },
    ],
  },
  {
    id: 'fennex_gift', title: 'A gift from the quarter', once: true,
    text: 'The Fen-Nex speaker brings a basket to the Founding Stake: in it, an egg the colour of fox fur, warm and purring. "Half our gifts are real," she says. "Guess which half."',
    when: (s) => s.fenNex > 0 && s.day - s.lastEventDay >= 20 && s.buildings.some((b) => b && isCradle(b.kind) && b.state === 'ok'),
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
    id: 'stormcaller', title: 'A storm caller of the Huruhui', once: true, priority: true,
    text: 'A traveller with white hair and glowing sigils on their arms asks for a hilltop to work from. They say the valleys beyond the Pass of Buluiain taught them to call rain, and that your Craft district smells like it needs some.',
    when: (s) => s.milestone >= 4 && s.population > 300,
    choices: [
      { label: 'Give them the hills', desc: 'Rain over the whole city for 10 days (fires out, miasma washed, herbs thriving); educated share +2%. The Storm-Caller\'s Peak becomes buildable at Township.', apply: (s) => { s.modifiers.push({ kind: 'rain', value: 1, until: s.day + 10, label: 'Huruhui rain' }); s.educated = Math.min(0.95, s.educated + 0.02); let n = 0; for (const b of s.buildings) if (b && b.state === 'burning') { b.state = 'ok'; b.stateDays = 0; n++; } return `They climb at dusk. By midnight it is raining on every roof in the valley and ${n} fire${n === 1 ? ' is' : 's are'} out. The Academy takes notes.`; } },
      { label: 'Send them on to Vell-on-Sable', desc: 'No Storm-Caller\'s Peak for this city: the stair needs its caller.', apply: () => 'They bow, and the wind picks up as they leave, which may be coincidence.' },
    ],
  },
  {
    id: 'caravan', title: 'A caravan from the Plains of Belerial',
    text: 'Dust on the Gloam road: riders on tall two-legged striders, banners the colour of the yellow plains, wagons behind. They halt at the Trade Depot and unroll their goods.',
    when: (s) => s.buildings.some((b) => b && b.kind === 'depot' && b.state === 'ok') && s.milestone >= 3,
    choices: [
      { label: 'Trade', desc: (s) => `Sell every works' surplus above 10 goods at 1.5x the season price (${caravanSurplus(s)} goods on the shelves now).`, apply: (s) => { let sold = 0; for (const b of s.buildings) { if (!b || b.state !== 'ok') continue; const def = BUILDING_BY_KEY[b.kind]; if (def.zone === Zone.Craft && b.stock > 10) { const n = b.stock - 10; b.stock = 10; sold += n; } } sold = Math.round(sold); const crowns = Math.round(sold * s.trade.priceGoods * 1.5); s.treasury += crowns; s.stats.caravanGoods += sold; return sold > 0 ? `${sold} goods change hands for ${crowns} crowns. The riders pay in Belerial gold, which the guild weighs twice.` : 'The works have nothing to spare above ten goods a shelf. The riders buy bread and water the striders.'; } },
      { label: 'Sell rare goods', desc: (s) => { const m = s.materials; return `Scale 400, wyrmfire 500, eggshell 200, rayscale 300, glim-dust 150 crowns each (${Math.round(m.scale * 400 + m.wyrmfire * 500 + m.eggshell * 200 + m.rayscale * 300 + m.glimdust * 150)} crowns for the whole vault); the slider sets the share sold.`; }, slider: { max: 100, label: 'share of the vault sold' }, apply: (s, amount) => { const share = amount === undefined ? 1 : Math.max(0, Math.min(100, amount)) / 100; const m = s.materials; const sold = { scale: m.scale * share, wyrmfire: m.wyrmfire * share, eggshell: m.eggshell * share, rayscale: m.rayscale * share, glimdust: m.glimdust * share }; const crowns = Math.round(sold.scale * 400 + sold.wyrmfire * 500 + sold.eggshell * 200 + sold.rayscale * 300 + sold.glimdust * 150); const line = `${Math.round(sold.scale)} scale, ${sold.wyrmfire.toFixed(1)} wyrmfire, ${sold.eggshell.toFixed(1)} eggshell, ${sold.rayscale.toFixed(1)} rayscale and ${sold.glimdust.toFixed(1)} glim-dust`; m.scale -= sold.scale; m.wyrmfire -= sold.wyrmfire; m.eggshell -= sold.eggshell; m.rayscale -= sold.rayscale; m.glimdust -= sold.glimdust; s.treasury += crowns; return crowns > 0 ? `${line} go east in sealed jars for ${crowns} crowns${share < 1 ? `; the rest stays in the vault` : ''}.` : 'The jars are empty. The riders shrug and water the striders.'; } },
      { label: 'Buy striders (2,000 crowns)', desc: 'Mounted Watch patrols: watch coverage +0.2 everywhere for 60 days.', apply: (s) => { if (s.treasury < 2000) return 'The purse is too light; the riders shrug and pack up.'; s.treasury -= 2000; s.modifiers.push({ kind: 'watch', value: 0.2, until: s.day + 60, label: 'Strider patrols' }); return 'Four striders and a rider to teach the Watch. The birds hiss at everyone but the Grimmen.'; } },
      { label: 'Auction the loose relics', desc: 'The caravan bids 100 to 140 crowns a relic, above the Crown; one collector in three buys an uncatalogued piece for 2,500. Sextons −5.', apply: (s) => { if (s.relicStock < 1) return 'There are no loose relics to auction. The riders look at the empty table and laugh.'; const rng = rngOf(s); const price = 100 + rng.int(41); const n = s.relicStock; let out = `${n} relics go under the hammer at ${price} each: ${n * price} crowns.`; s.treasury += n * price; s.relicStock = 0; s.stats.relicsSold += n; s.stats.relicsAuctioned += n; if (s.relics.uncatalogued > 0 && rng.chance(0.34)) { s.relics.uncatalogued--; s.treasury += 2500; out += ' A Belerial collector in a striped coat pays 2,500 for a piece nobody has named yet.'; } commitRng(s, rng); s.guilds.standing.sextons = Math.max(0, s.guilds.standing.sextons - 5); return out; } },
      { label: 'Send them on', desc: 'No effect.', apply: () => 'They water the striders and ride for the next wardlight before noon.' },
    ],
  },
  {
    id: 'merchant', title: 'The Wandering Merchant of Belerial',
    text: 'A single wagon with a wandering merchant famous across three regions. The wagon holds things no cart in Vell has carried: seeds from Longwood, a white egg in a basket of feathers, salts from the Ulum.',
    when: (s) => s.buildings.some((b) => b && b.kind === 'depot' && b.state === 'ok') && s.milestone >= 5 && s.day - s.lastEventDay >= 10,
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
      { label: 'Pay in crowns', desc: 'Costs the current tribute; each tribute asks 750 crowns more than the last.', apply: (s) => payTribute(s, 'crowns') },
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
      { label: 'Send leystone (60)', desc: 'Taken from Arcane workshops; the wyrm is content again at once.', apply: (s) => { let have = 0; forEachBuilding(s, (b) => { if (BUILDING_BY_KEY[b.kind].zone === Zone.Arcane) have += b.stock; }); if (have < 30) return 'There is not enough leystone in the city. The wyrm sniffs at the empty carts and turns away.'; let left = 60; forEachBuilding(s, (b) => { if (left > 0 && BUILDING_BY_KEY[b.kind].zone === Zone.Arcane && b.stock > 0) { const t = Math.min(b.stock, left); b.stock -= t; left -= t; } }); s.wyrm.sulking = 0; s.wyrm.unfed = 0; return 'It eats the leystone like bread and comes back to its post by the node.'; } },
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

/** The Grimmen's own tales: the Underking's envoy, a collapse, a vein of true leystone. Only a Grimmen city hears them. */
function hillBuildings(s: GameState): Building[] {
  const out: Building[] = [];
  forEachBuilding(s, (b) => { if (b.state === 'ok' && s.terrain[idx(b.x, b.y)] === Terrain.Hills) out.push(b); });
  return out;
}
export const GRIMMEN: EventDef[] = [
  {
    id: 'underking_envoy', title: "The Underking's envoy",
    text: 'A grey-cloaked envoy of the Underking comes up the ramp with two stone-faced wardens and a ledger of obligations older than the Crown. The deep holds ask what the Underhill sends them this year.',
    when: (s) => s.faction === 'grimmen' && s.milestone >= 3,
    choices: [
      { label: 'Send 1,500 crowns', desc: 'The deep holds open their galleries to your carts: happiness +4 for 15 days.', apply: (s) => { if (s.treasury < 1500) return 'The purse is too light. The envoy writes it down and goes.'; s.treasury -= 1500; s.modifiers.push({ kind: 'happiness', value: 4, until: s.day + 15, label: 'The deep holds trade' }); return 'The envoy counts it twice and bows once. Deep-hold salt and lamp-oil come up the ramp for a season.'; } },
      { label: 'Send 30 goods', desc: 'From the market shelves; happiness +2 for 10 days.', apply: (s) => { const n = takeGoods(s, 30); s.modifiers.push({ kind: 'happiness', value: 2, until: s.day + 10, label: 'The deep holds fed' }); return `${n} goods go down the ramp on the wardens' backs. The envoy says the Underking will remember the weight.`; } },
      { label: 'Refuse', desc: 'The galleries close: happiness −4 for 12 days.', apply: (s) => { s.modifiers.push({ kind: 'happiness', value: -4, until: s.day + 12, label: 'The deep holds shut' }); return 'The envoy does not argue. The deep-hold doors are shut by nightfall, and the Grimmen of the Underhill feel the dark behind them.'; } },
    ],
  },
  {
    id: 'collapse', title: 'A gallery collapses',
    text: 'A crack runs through the hill like a slow bell. The cutters say a gallery under the street is going, and there is an hour, perhaps two, to shore it.',
    when: (s) => s.faction === 'grimmen' && hillBuildings(s).length >= 4,
    choices: [
      { label: 'Shore it up (600 crowns)', desc: 'The crews hold it; nothing falls.', apply: (s) => { if (s.treasury < 600) return 'There is no coin for timber. The crews do what they can with their hands, which is nothing.'; s.treasury -= 600; return 'Timber and prayer. The crack stops at the third prop and the street holds.'; } },
      { label: 'Let it fall', desc: 'One building on the hill is lost to ruin; the rubble counts two stone quarried.', apply: (s) => { const rng = rngOf(s); const list = hillBuildings(s).filter((b) => BUILDING_BY_KEY[b.kind].category === 'zone'); if (!list.length) { commitRng(s, rng); s.stats.stoneCut += 2; return 'The gallery falls under empty ground. The cutters carry out the stone and count it.'; } const b = rng.pick(list); commitRng(s, rng); b.state = 'ruin'; b.stateDays = 0; b.residents = 0; b.workers = 0; markDirty(s, b.x, b.y); s.stats.stoneCut += 2; return `The ${BUILDING_BY_KEY[b.kind].name} at (${b.x},${b.y}) goes down into the dark with a sound like a door. The rubble is good stone.`; } },
    ],
  },
  {
    id: 'true_leystone', title: 'A vein of true leystone', once: true,
    text: 'The miners break into a seam that hums. True leystone, clear as water and warm as a hand: the Concord cut their Wardens from it. The Underhill has never found so much at once.',
    when: (s) => s.faction === 'grimmen' && s.buildings.some((b) => b && b.kind === 'mine' && b.state === 'ok'),
    choices: [
      { label: 'Mine it', desc: 'Every mine fills by 30 leystone; +3 scale for the Marvels.', apply: (s) => { let n = 0; forEachBuilding(s, (b) => { if (b.kind === 'mine' && b.state === 'ok') { b.stock = Math.min(60, b.stock + 30); n++; } }); s.materials.scale += 3; return `${n} mine${n === 1 ? '' : 's'} fill with true leystone. The enchanters will not sleep this week.`; } },
      { label: 'Sell the news to the Crown', desc: '+2,500 crowns; the Crown sends its own cutters.', apply: (s) => { s.treasury += 2500; return "The Crown's assessor arrives with a purse and a very long lease. The seam is theirs now, and the crowns are yours."; } },
      { label: 'Leave it to the Veins', desc: 'The seam stays in the hill: the ley nodes flow 10 more mana a day for ever.', apply: (s) => { s.stats.trueVeins++; return 'The miners wall the seam up with their own hands. That night every spire in the Underhill burns a shade brighter.'; } },
    ],
  },
];

/** The Veshari's own tales: the eggs of the water lines, and the bargemen. */
function tidePool(s: GameState): Building | undefined {
  return s.buildings.find((b) => b && b.kind === 'tidepool' && b.state === 'ok') ?? undefined;
}
export const VESHARI: EventDef[] = [
  {
    id: 'tide_net', title: 'A tide egg in the net', once: true,
    text: 'A fisher on the Sable hauls up something heavier than a fish: an egg the colour of deep water, finned along its seam. The pool-keepers are already arguing over who found it.',
    when: (s) => s.faction === 'veshari' && !!tidePool(s) && s.dragons.length < 6,
    choices: [
      { label: 'Keep it', desc: 'The egg goes to the Tide Pool.', apply: (s) => { const d = addEgg(s, 'tide'); if (d) return `${d.name} is laid in the pool and the fisher gets a landing named after her.`; s.treasury += 2500; return "No pool had room. The Crown's assessor pays 2,500 crowns and the fisher gets a drink."; } },
      { label: 'Sell it to the Crown', desc: '+2,500 crowns.', apply: (s) => { s.treasury += 2500; return 'The assessor wraps it in wet cloth and rides for Vell-on-Sable. 2,500 crowns.'; } },
      { label: 'Give it to the pool-keepers', desc: 'Kept on the pool wall as a relic: +3 happiness for 20 days.', apply: (s) => { s.modifiers.push({ kind: 'happiness', value: 3, until: s.day + 20, label: 'The egg in the net' }); return 'They set it on the pool wall and do not hatch it. Folk come down to the water to look.'; } },
    ],
  },
  {
    id: 'storm_egg', title: 'A storm egg', once: true,
    text: 'When the mana-storm passed over the water it left something floating: an egg veined with violet lightning, humming like a struck bell. The pool-keepers wade out for it with a net on a pole.',
    when: (s) => s.faction === 'veshari' && (s.stats.stormWarps > 0 || s.storms.length > 0) && s.dragons.length < 6,
    choices: [
      { label: 'Keep it', desc: 'The egg goes to the Tide Pool.', apply: (s) => { const d = addEgg(s, 'storm'); if (d) return `${d.name} is laid in the pool. The water around it crackles for a week.`; s.treasury += 3000; return "No pool had room. The Crown's assessor pays 3,000 crowns and keeps his gloves on."; } },
      { label: 'Sell it to the Crown', desc: '+3,000 crowns.', apply: (s) => { s.treasury += 3000; return 'The assessor pays 3,000 crowns and carries it in a lead box. 3,000 crowns.'; } },
      { label: 'Let it hatch wild', desc: 'A mana-storm breaks over the water for four days.', apply: (s) => { const p = tidePool(s); startStorm(s, p ? p.x : s.founding.x, p ? p.y : s.founding.y); return 'The egg splits in the shallows and the sky splits with it. Nobody sees what came out.'; } },
    ],
  },
  {
    id: 'bargemen_strike', title: "The bargemen's strike",
    text: 'The bargemen have tied up every barge on the Sable and sit on the landings with their poles across their knees. They want rope-money: the river is theirs first, they say, and the Veshari only borrow it.',
    when: (s) => s.faction === 'veshari' && moorings(s) >= 4,
    choices: [
      { label: 'Pay the rope-money', desc: '900 crowns; the barges cast off at dawn.', apply: (s) => { s.treasury -= 900; return 'The purse goes round the landings. By dawn the poles are back in the water. 900 crowns.'; } },
      { label: 'Let them sit', desc: 'No barge sails for eight days; the carts manage.', apply: (s) => { s.modifiers.push({ kind: 'barges', value: -1, until: s.day + 8, label: 'The bargemen strike' }); return 'They sit. The river goes on without them, which they find insulting. Eight days later they are back, poorer.'; } },
    ],
  },
];

/** The Tallowkin's tales (iteration 52). */
export const TALLOWKIN: EventDef[] = [
  {
    id: 'wrights_strike', title: "The spire-wrights' strike",
    text: 'The spire-wrights have downed their chalk. Four spires stand on your light, they say, and every one was priced by the Crown and paid by the Tallowkin; the wrights want chalk-money of their own before another shard is set.',
    when: (s) => s.faction === 'tallowkin' && s.buildings.filter((b) => b && b.kind === 'spire' && b.state === 'ok').length >= 4,
    choices: [
      { label: 'Pay the chalk-money (700 crowns)', desc: '700 crowns; the chalk is back on the walls by dawn.', apply: (s) => { s.treasury -= 700; return 'The purse goes round the lodge. By dawn there is blue chalk on every wall again. 700 crowns.'; } },
      { label: 'Let them sit', desc: 'Spires and Wick-Towers cost half again for ten days.', apply: (s) => { s.modifiers.push({ kind: 'wrights', value: 0.5, until: s.day + 10, label: "The spire-wrights' strike" }); return 'They sit. Whoever sets a shard in the next ten days pays a stranger to do it, and strangers charge.'; } },
    ],
  },
  {
    id: 'surge_wickhouses', title: 'A surge in the wickhouses', once: true,
    text: 'The wild surge ran down the lantern-ways and into the hearths: every candle in the wickhouses burns a hand high and blue, and the candle-eyed children will not sleep. The spire-wrights say it will pass. The mothers say snuff them.',
    when: (s) => s.faction === 'tallowkin' && s.stats.surgesTotal >= 1 && s.buildings.filter((b) => b && b.kind === 'hearth' && b.state === 'ok' && b.lit).length >= 10,
    choices: [
      { label: 'Snuff and relight (300 crowns)', desc: '300 crowns of tallow; +4 happiness for six days.', apply: (s) => { s.treasury -= 300; s.modifiers.push({ kind: 'happiness', value: 4, until: s.day + 6, label: 'The candles relit' }); return 'The sextons go door to door with snuffers and new tallow. The city sleeps. 300 crowns.'; } },
      { label: 'Let them burn bright', desc: '+15 % mana flow for six days; two hearths catch fire.', apply: (s) => { s.modifiers.push({ kind: 'mana', value: 0.15, until: s.day + 6, label: 'The candles burn blue' }); const lit = s.buildings.filter((b) => b && b.kind === 'hearth' && b.state === 'ok' && b.lit) as Building[]; const rng = rngOf(s); for (let k = 0; k < 2 && lit.length; k++) { const b = lit.splice(rng.int(lit.length), 1)[0]; igniteBuilding(s, b); } commitRng(s, rng); return 'They burn. For six days the ley runs high and blue through every wick; two houses burn with it.'; } },
    ],
  },
  {
    id: 'candle_child', title: 'The candle-eyed child', once: true,
    text: 'A child of the wickhouses, her eyes two steady flames, has been found at the node at midnight, three nights running, reading the Veins aloud in a voice that is not hers. The spire-wrights want her at the node. Her mother wants her at the shrine.',
    when: (s) => s.faction === 'tallowkin' && s.milestone >= 3,
    choices: [
      { label: 'Let her read the Veins', desc: 'A true vein: +10 mana at every node, for good.', apply: (s) => { s.stats.trueVeins++; return 'She reads. The Veins answer with a flow the spire-wrights have no chalk for. Every node gives ten more, for good.'; } },
      { label: 'Send her to the Candle-Shrine', desc: 'The shrine schools her: the educated floor rises 2 %.', apply: (s) => { s.educatedFloor = Math.min(0.2, s.educatedFloor + 0.02); return 'She reads at the shrine instead, where the words are older and the fire smaller. The children who sit with her learn.'; } },
    ],
  },
];

/** Unrest above RIOT_UNREST for this many days in a row brings a riot to the least-watched market. */
export const RIOT_DAYS = 5;
function leastWatchedMarket(s: GameState): Building | null {
  let best: Building | null = null;
  let low = Infinity;
  forEachBuilding(s, (b) => { if (BUILDING_BY_KEY[b.kind].zone !== Zone.Market || b.state !== 'ok') return; const c = s.coverage.watch[idx(b.x, b.y)]; if (c < low) { low = c; best = b; } });
  return best;
}
export const RIOT: EventDef = {
  id: 'riot', title: 'A riot in the market',
  text: 'Five days of shouting in the streets, and tonight the shouting has torches. A crowd is in the least-watched market, and the stalls are made of wood.',
  when: (s) => s.unrestHigh >= RIOT_DAYS,
  choices: [
    { label: 'Send the Watch', desc: (s) => { const m = leastWatchedMarket(s); const cov = m ? s.coverage.watch[idx(m.x, m.y)] / 255 : 0; return `The least-watched market${m ? ` at (${m.x},${m.y})` : ''} has watch coverage ${Math.round(cov * 100)} %: at half or more the Watch holds the square (+3 happiness for 5 days); under it the market burns.`; }, apply: (s) => { s.unrestHigh = 0; s.stats.riots++; const m = leastWatchedMarket(s); if (!m) return 'There is no market to riot in. The crowd shouts itself hoarse and goes home.'; const cov = s.coverage.watch[idx(m.x, m.y)] / 255; if (cov >= 0.5) { s.modifiers.push({ kind: 'happiness', value: 3, until: s.day + 5, label: 'The Watch held the square' }); return `The Watch holds the square at (${m.x},${m.y}). By midnight the torches are out and the stalls stand; the city sleeps easier for it.`; } igniteBuilding(s, m, 'The riot fires the'); return `The Watch is too thin at (${m.x},${m.y}): the market burns. Raise a Watch Post where the shelves are, and bring the unrest down.`; } },
    { label: "Pay the Crown's peace (600 crowns)", desc: 'Bread on the square and a Crown amnesty: no fire, and unrest −10 % for 10 days.', apply: (s) => { s.treasury -= 600; s.unrestHigh = 0; s.stats.riots++; s.modifiers.push({ kind: 'unrest', value: -0.1, until: s.day + 10, label: "The Crown's peace" }); return 'Bread and a reading of the amnesty from the square steps. The torches go out one by one. The crowd remembers the bread.'; } },
  ],
};
/** The riot fires on its own count, before the storyteller's draw. */
export function maybeFireRiot(s: GameState): void {
  if (s.pendingEvent || s.gameOver || s.unrestHigh < RIOT_DAYS) return;
  s.pendingEvent = { id: RIOT.id, title: RIOT.title, text: RIOT.text, choices: RIOT.choices.map((c) => ({ label: c.label, desc: descOf(c, s) })) };
  s.firedEvents.push(`${RIOT.id}:?`);
}
void RIOT_UNREST;

/** A departed dragon returns after a season, wild, and asks a tribute (iteration 53). Fired by maybeFireReturn on its own terms. */
export const DRAGON_RETURNS: EventDef = {
  id: 'dragon_returns', title: 'A shadow over the cradle',
  text: 'A dragon that left this city circles its old cradle at dawn, thinner and wilder, and lands on the roof. The tamers know it by name. It wants what it is owed.',
  when: (s) => dueReturn(s) !== null,
  choices: [
    { label: 'Pay its tribute', desc: (s) => { const e = dueReturn(s); return e ? `${RETURN_TRIBUTE * Math.max(1, e.stage)} crowns, or ${RETURN_GOODS * Math.max(1, e.stage)} goods off the market shelves if the purse cannot; it leaves for good.` : 'It leaves for good.'; }, apply: (s) => { const e = dueReturn(s); return e ? payReturn(s, e) : 'Nothing changes.'; } },
    { label: 'Open a cradle', desc: (s) => { const e = dueReturn(s); return e && freeCradle(s, e.line) ? `It comes home a ${STAGE_NAMES[e.stage]}, sullen (mood 40), and eats from the markets again.` : `No cradle takes a ${e ? LINE_INFO[e.line].name : ''} dragon now: refused, it burns.`; }, apply: (s) => { const e = dueReturn(s); if (!e) return 'Nothing changes.'; return homeReturn(s, e) ?? refuseReturn(s, e); } },
    { label: 'Refuse it', desc: (s) => { const e = dueReturn(s); return `It circles the old cradle all day and sets up to ${e ? Math.max(1, e.stage) : 1} dark, unwarded roof${e && e.stage > 1 ? 's' : ''} within 12 tiles alight.`; }, apply: (s) => { const e = dueReturn(s); return e ? refuseReturn(s, e) : 'Nothing changes.'; } },
  ],
};
export function maybeFireReturn(s: GameState): void {
  if (s.pendingEvent || s.gameOver) return;
  const e = dueReturn(s);
  if (!e) return;
  const def = DRAGON_RETURNS;
  s.pendingEvent = { id: def.id, title: `${e.name} returns`, text: `${e.name} the ${LINE_INFO[e.line].name} ${STAGE_NAMES[e.stage]}, which left ${s.cityName} ${s.day - e.day} days ago, circles its old cradle at (${e.x},${e.y}) at dawn, thinner and wilder, and lands on the roof. The tamers know it by name. It wants what it is owed.`, choices: def.choices.map((c) => ({ label: c.label, desc: descOf(c, s) })) };
  s.firedEvents.push(`${def.id}:?`);
}
export const ALL_EVENTS: EventDef[] = [...EVENTS, ...CHAINS, ...EGGS, ...VISITORS, ...CROWN, ...GRIMMEN, ...VESHARI, ...TALLOWKIN, ...CALENDAR, ...WYRM_EVENTS, ...COUNCIL_EVENTS, RIOT, DRAGON_RETURNS];

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
    s.pendingEvent = { id: e.id, title: e.title, text: e.text, choices: e.choices.map((c) => ({ label: c.label, desc: descOf(c, s) })) };
    s.firedEvents.push(`${tag}:?`);
    s.lastEventDay = s.day;
    return;
  }
}

/** Wyrm events fire on their own terms (no random draw, no 18-day spacing). */
export function maybeFireWyrm(s: GameState): void {
  if (s.pendingEvent || s.gameOver) return;
  for (const e of WYRM_EVENTS) {
    if (s.wyrm.state === 'none' && e.id !== 'airship_tale') continue; // the captain's story needs no wyrm
    if (!e.when(s)) continue;
    if (e.id === 'wyrm_binding') s.wyrm.askedBind = s.day;
    s.pendingEvent = { id: e.id, title: e.title, text: e.text, choices: e.choices.map((c) => ({ label: c.label, desc: descOf(c, s) })) };
    s.firedEvents.push(`${e.id}:?`);
    return;
  }
}

/** The Belerial caravan keeps a rhythm of its own: every CARAVAN_EVERY days at a standing depot, the first half a rhythm after the depot opens. */
export const CARAVAN_EVERY = 12;
export function hasDepot(s: GameState): boolean {
  return s.milestone >= 3 && s.buildings.some((b) => b && b.kind === 'depot' && b.state === 'ok');
}
/** Goods the caravan's Trade would buy today: every works' stock above ten. */
export function caravanSurplus(s: GameState): number {
  let n = 0;
  for (const b of s.buildings) if (b && b.state === 'ok' && BUILDING_BY_KEY[b.kind].zone === Zone.Craft && b.stock > 10) n += b.stock - 10;
  return Math.round(n);
}
/** Days until the next caravan halts (0 when one waits at the gate); null without a depot. */
export function caravanDue(s: GameState): number | null {
  if (!hasDepot(s)) return null;
  if (s.pendingEvent && s.pendingEvent.id === 'caravan') return 0;
  const last = s.stats.lastCaravanDay < 0 ? s.day - CARAVAN_EVERY / 2 : s.stats.lastCaravanDay;
  return Math.max(0, last + CARAVAN_EVERY - s.day);
}
export function maybeFireCaravan(s: GameState): void {
  if (s.pendingEvent || s.gameOver || !hasDepot(s)) return;
  if (s.stats.lastCaravanDay < 0) s.stats.lastCaravanDay = s.day - CARAVAN_EVERY / 2;
  if (s.day - s.stats.lastCaravanDay < CARAVAN_EVERY) return;
  const e = ALL_EVENTS.find((x) => x.id === 'caravan')!;
  s.pendingEvent = { id: e.id, title: e.title, text: e.text, choices: e.choices.map((c) => ({ label: c.label, desc: descOf(c, s), slider: c.slider })) };
  s.firedEvents.push(`${e.id}:?`);
  s.stats.lastCaravanDay = s.day;
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
  // the caravan keeps its own rhythm (maybeFireCaravan) and is never drawn here
  const pool = [...EVENTS, ...CHAINS, ...EGGS, ...VISITORS, ...CROWN, ...GRIMMEN, ...VESHARI, ...TALLOWKIN].filter((e) => e.id !== 'caravan' && e.when(s) && !recent.includes(e.id) && !(e.once && fired(e.id)));
  if (pool.length) {
    const e = pool.find((x) => x.priority) ?? rng.pick(pool);
    s.pendingEvent = { id: e.id, title: e.title, text: e.text, choices: e.choices.map((c) => ({ label: c.label, desc: descOf(c, s) })) };
    s.lastEventDay = s.day;
    s.firedEvents.push(`${e.id}:?`);
  }
  commitRng(s, rng);
}

export function resolveEvent(s: GameState, choice: number, amount?: number): void {
  const pe = s.pendingEvent;
  if (!pe) return;
  const def = ALL_EVENTS.find((e) => e.id === pe.id);
  s.pendingEvent = null;
  if (!def) return;
  const ci = Math.max(0, Math.min(def.choices.length - 1, choice));
  const c = def.choices[ci];
  // a choice that names its price in its label is refused when the purse cannot pay it
  const price = /\(([\d,]+) crowns\)/.exec(c.label);
  const asked = price ? Number(price[1].replace(/,/g, '')) : 0;
  for (let k = s.firedEvents.length - 1; k >= 0; k--) {
    const f = s.firedEvents[k];
    if (f.endsWith(':?') && (f === `${def.id}:?` || f.startsWith(`${def.id}@`))) { s.firedEvents[k] = f.slice(0, -1) + ci; break; }
  }
  // only a named price is refused: a free choice in a city in debt was refused as "0 crowns asked" and its tale asked again every day (fixed in iteration 55)
  const result = asked > 0 && asked > s.treasury ? `the purse is too light: ${asked} crowns asked, ${Math.round(s.treasury)} in the chest. Nothing changes.` : c.apply(s, amount);
  pushMessage(s, `${pe.title}: ${result}`, 'milestone');
}
