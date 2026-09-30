/** Story events with choices. Fired every ~18-30 days when their condition holds; the game pauses until answered. */
import { BUILDING_BY_KEY } from './catalog';
import { Terrain, Zone, type DragonLine, type GameState } from './types';
import { LINE_INFO, addEgg } from './wyrmcraft';
import { canPlaceBuilding, commitRng, forEachBuilding, placeBuildingRaw, pushMessage, rngOf } from './world';
import { capacityOf } from './growth';

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

/** Calendar events fire on fixed days of the season, at most once per year each. */
const CALENDAR: (EventDef & { seasonDay: number; season: number })[] = [
  {
    id: 'thawday', title: 'Thaw-day', season: 0, seasonDay: 2,
    text: 'The ice has cracked on the river. By old Vellish custom the Warden-Reeve opens the Thaw with a feast on the square, or with a day of labour on the wards.',
    when: (s) => s.population > 40,
    choices: [
      { label: 'A feast (600 crowns)', desc: 'Happiness +6 for 15 days.', apply: (s) => { s.treasury -= 600; s.modifiers.push({ kind: 'happiness', value: 6, until: s.day + 15, label: 'Thaw feast' }); return 'Bread, glimherb ale, and a Grimmen choir that nobody expected to be so good.'; } },
      { label: 'A day on the wards', desc: 'Every lit Ward Lantern burns back the Gloam once more today; happiness −2 for 5 days.', apply: (s) => { s.modifiers.push({ kind: 'happiness', value: -2, until: s.day + 5, label: 'Ward labour' }); let n = 0; for (let i = 0; i < s.gloam.length; i++) if (s.gloam[i] && s.coverage.ward[i] > 0) { s.gloam[i] = 0; n++; } return `${n} tiles of grey grass are cut and burned under the lanterns.`; } },
    ],
  },
  {
    id: 'remembrance', title: 'The Remembrance', season: 2, seasonDay: 15,
    text: 'Mid-Ember is the Remembrance of the Hollowing. Scholars ask to read the names of the nine houses aloud from the Founding Stake; the priests of Morrow would rather the names stayed buried.',
    when: (s) => s.population > 80,
    choices: [
      { label: 'Read the names', desc: 'Educated share +4%; unquieted dead +8 (the ley stirs).', apply: (s) => { s.educated = Math.min(0.95, s.educated + 0.04); s.unquieted += 8; return 'The names are read. The spires hum a half-tone flat until dawn.'; } },
      { label: 'Keep the silence', desc: 'Unquieted dead −8; the Four Vigils are pleased: happiness +2 for 10 days.', apply: (s) => { s.unquieted = Math.max(0, s.unquieted - 8); s.modifiers.push({ kind: 'happiness', value: 2, until: s.day + 10, label: 'Remembrance kept' }); return 'A night of candles and no speeches. Morrow approves.'; } },
    ],
  },
  {
    id: 'vigil', title: 'The Hush vigil', season: 3, seasonDay: 1,
    text: 'The first night of the Hush. Tradition asks every hearth to keep a lamp burning until dawn, so that the Gloam finds no dark window to whisper at.',
    when: (s) => s.population > 40,
    choices: [
      { label: 'Keep the vigil', desc: 'Mana demand +15% for 10 days; the Gloam does not creep for 10 days.', apply: (s) => { s.modifiers.push({ kind: 'mana', value: 0.15, until: s.day + 10, label: 'Hush vigil' }); s.modifiers.push({ kind: 'gloamHold', value: 1, until: s.day + 10, label: 'Vigil holds the Gloam' }); return 'Every window in the valley burns amber. Beyond the last lantern, the grey grass waits.'; } },
      { label: 'Let folk sleep', desc: 'No cost. The whispering is louder this Hush: happiness −3 for 20 days.', apply: (s) => { s.modifiers.push({ kind: 'happiness', value: -3, until: s.day + 20, label: 'Vigil skipped' }); return 'Old Maud keeps her lamp lit anyway. She says the dark remembers who did not.'; } },
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

export const ALL_EVENTS: EventDef[] = [...EVENTS, ...CHAINS, ...EGGS, ...CALENDAR];

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

export function maybeFireEvent(s: GameState): void {
  if (s.pendingEvent || s.gameOver) return;
  if (s.day - s.lastEventDay < 18) return;
  const rng = rngOf(s);
  if (!rng.chance(0.12)) {
    commitRng(s, rng);
    return;
  }
  const recent = s.firedEvents.slice(-4).map((f) => f.split(':')[0]);
  const fired = (id: string) => s.firedEvents.some((f) => f.split(':')[0] === id);
  const pool = [...EVENTS, ...CHAINS, ...EGGS].filter((e) => e.when(s) && !recent.includes(e.id) && !(e.once && fired(e.id)));
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
