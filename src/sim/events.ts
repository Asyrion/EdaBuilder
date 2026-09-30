/** Story events with choices. Fired every ~18-30 days when their condition holds; the game pauses until answered. */
import { BUILDING_BY_KEY } from './catalog';
import { Terrain, Zone, type GameState } from './types';
import { commitRng, forEachBuilding, pushMessage, rngOf } from './world';
import { capacityOf } from './growth';

export interface EventDef {
  id: string;
  title: string;
  text: string;
  when: (s: GameState) => boolean;
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

export function maybeFireEvent(s: GameState): void {
  if (s.pendingEvent || s.gameOver) return;
  if (s.day - s.lastEventDay < 18) return;
  const rng = rngOf(s);
  if (!rng.chance(0.12)) {
    commitRng(s, rng);
    return;
  }
  const recent = s.firedEvents.slice(-4);
  const pool = EVENTS.filter((e) => e.when(s) && !recent.includes(e.id));
  if (pool.length) {
    const e = rng.pick(pool);
    s.pendingEvent = { id: e.id, title: e.title, text: e.text, choices: e.choices.map((c) => ({ label: c.label, desc: c.desc })) };
    s.lastEventDay = s.day;
    s.firedEvents.push(e.id);
    if (s.firedEvents.length > 20) s.firedEvents.shift();
  }
  commitRng(s, rng);
}

export function resolveEvent(s: GameState, choice: number): void {
  const pe = s.pendingEvent;
  if (!pe) return;
  const def = EVENTS.find((e) => e.id === pe.id);
  s.pendingEvent = null;
  if (!def) return;
  const c = def.choices[Math.max(0, Math.min(def.choices.length - 1, choice))];
  const result = c.apply(s);
  pushMessage(s, `${pe.title}: ${result}`, 'milestone');
}
