/** Story events with choices. Fired every ~18-30 days when their condition holds; the game pauses until answered. */
import { BUILDING_BY_KEY } from './catalog';
import { bodyOf, ensureShoals, shoalCap } from './water';
import { moorings, factionOf } from '../data/factions';
import { DISTRICT_NAMES, Terrain, Zone, type Building, type DragonLine, type GameState } from './types';
import { COUNCIL_EVENTS } from './guilds';
import { LINE_INFO, STAGE_NAMES, addEgg, dueReturn, fightBout, freeCradle, homeReturn, isCradle, payReturn, refuseReturn, ringChampion, RETURN_TRIBUTE, RETURN_GOODS } from './wyrmcraft';
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
import { HEART_GLOAM_REACH, HEART_STEP_DAYS, PASS_ALMS, PASS_PILGRIM_DAY, PASS_PILGRIMS, WARDEN_DAYS, BELREGI_REACH_HEART, GREAT_GATE_REACH_HEART, GREAT_GATE_REACH, BELREGI_REACH_GREAT, gateCounts, greatGateOf, litGreatGate, passPilgrims } from './gate';
import { WYRM_STARVE_LIMIT, WYRM_EATS, WYRM_TRIBUTE_GOODS, bind, hasCourt, marketGoods, payTribute, refuse, takeGoods, wyrmNode, wyrmTribute } from './wyrm';
import EVENT_TEXT from '../data/content/text/events.json';

export interface EventDef {
  id: string;
  title: string;
  text: string;
  textFn?: (s: GameState) => string; // when set, the text for this city (the merchant's memory, iteration 73)
  when: (s: GameState) => boolean;
  once?: boolean; // never repeats
  priority?: boolean; // drawn before any other tale while it is eligible (a tale something else depends on)
  choices: { label: string; desc: string | ((s: GameState) => string); apply: (s: GameState, amount?: number) => string; slider?: { max: number; label: string } }[];
}
/** A tale's text for this city. */
export function textOf(e: { text: string; textFn?: (s: GameState) => string }, s: GameState): string {
  return e.textFn ? e.textFn(s) : e.text;
}
/** A choice's description for this city (a people may change the numbers). */
export function descOf(c: { desc: string | ((s: GameState) => string) }, s: GameState): string {
  return typeof c.desc === 'function' ? c.desc(s) : c.desc;
}

export function addResidents(s: GameState, n: number): number {
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
    id: 'pilgrims', title: EVENT_TEXT.pilgrims.title,
    text: EVENT_TEXT.pilgrims.text,
    when: (s) => s.population > 60 && s.demand.hearth > -0.5,
    choices: [
      { label: EVENT_TEXT.pilgrims.choices[0].label, desc: EVENT_TEXT.pilgrims.choices[0].desc, apply: (s) => { s.pilgrimsDay = s.day; return `${addResidents(s, 40)} pilgrims found hearths in ${s.cityName}.`; } },
      { label: EVENT_TEXT.pilgrims.choices[1].label, desc: EVENT_TEXT.pilgrims.choices[1].desc, apply: (s) => { s.modifiers.push({ kind: 'happiness', value: 3, until: s.day + 10, label: 'Pilgrims blessed' }); return 'The pilgrims walk on, singing.'; } },
    ],
  },
  {
    id: 'relic', title: EVENT_TEXT.relic.title, once: true,
    text: EVENT_TEXT.relic.text,
    when: (s) => hasHills(s) && s.milestone >= 2,
    choices: [
      { label: EVENT_TEXT.relic.choices[0].label, desc: EVENT_TEXT.relic.choices[0].desc, apply: (s) => { s.treasury += 3000; return 'The Crown\'s assessor pays in silver and asks no questions.'; } },
      { label: EVENT_TEXT.relic.choices[1].label, desc: EVENT_TEXT.relic.choices[1].desc, apply: (s) => { if (s.buildings.some((b) => b && (b.kind === 'academy' || b.kind === 'grandacademy'))) { s.educated = Math.min(0.95, s.educated + 0.1); return 'The Academy locks it in a warded case and lectures on it for a season.'; } s.modifiers.push({ kind: 'happiness', value: 4, until: s.day + 15, label: 'Relic on display' }); return 'With no Academy to study it, the relic hangs in the Founding Stake, a curiosity.'; } },
      { label: EVENT_TEXT.relic.choices[2].label, desc: EVENT_TEXT.relic.choices[2].desc, apply: (s) => { s.unquieted = Math.max(0, s.unquieted - 20); return 'The sexton sings over it. The ground sighs and goes still.'; } },
    ],
  },
  {
    id: 'guilds', title: EVENT_TEXT.guilds.title,
    text: EVENT_TEXT.guilds.text,
    when: (s) => s.taxRates.craft >= 8 && s.buildings.some((b) => b && b.kind === 'craft'),
    choices: [
      { label: EVENT_TEXT.guilds.choices[0].label, desc: EVENT_TEXT.guilds.choices[0].desc, apply: (s) => { s.treasury += 1500; s.modifiers.push({ kind: 'craftTax', value: 6, until: s.day + 20, label: 'Guild bargain' }); return 'The guild seal is stamped: "It Moves."'; } },
      { label: EVENT_TEXT.guilds.choices[1].label, desc: EVENT_TEXT.guilds.choices[1].desc, apply: (s) => { s.modifiers.push({ kind: 'unrest', value: 0.08, until: s.day + 10, label: 'Guilds refused' }); return 'The carters stage a slow walk down the high street.'; } },
    ],
  },
  {
    id: 'plague', title: EVENT_TEXT.plague.title,
    text: EVENT_TEXT.plague.text,
    when: (s) => s.health < 0.55 && s.population > 150,
    choices: [
      { label: EVENT_TEXT.plague.choices[0].label, desc: EVENT_TEXT.plague.choices[0].desc, apply: (s) => { s.treasury -= 2000; s.modifiers.push({ kind: 'health', value: 0.15, until: s.day + 20, label: 'Healers funded' }); return 'The healers work through the night. The cough fades by the new moon.'; } },
      { label: EVENT_TEXT.plague.choices[1].label, desc: EVENT_TEXT.plague.choices[1].desc, apply: (s) => { s.modifiers.push({ kind: 'deaths', value: 1, until: s.day + 12, label: 'Cough unchecked' }); return 'The sexton sings more often that month.'; } },
    ],
  },
  {
    id: 'festival', title: EVENT_TEXT.festival.title,
    text: EVENT_TEXT.festival.text,
    when: (s) => s.population > 100 && s.happiness > 45,
    choices: [
      { label: EVENT_TEXT.festival.choices[0].label, desc: EVENT_TEXT.festival.choices[0].desc, apply: (s) => { s.treasury -= 800; s.modifiers.push({ kind: 'happiness', value: 8, until: s.day + 12, label: 'Festival' }); return 'Grimmen, Tallowkin and Hearthfolk dance on the square until the spires dim.'; } },
      { label: EVENT_TEXT.festival.choices[1].label, desc: EVENT_TEXT.festival.choices[1].desc, apply: () => 'The child is named Wick, after the old word for a lit thing.' },
    ],
  },
  {
    id: 'refugees', title: EVENT_TEXT.refugees.title,
    text: EVENT_TEXT.refugees.text,
    when: (s) => s.population > 120 && s.stats.gloamTiles > 1500,
    choices: [
      { label: EVENT_TEXT.refugees.choices[0].label, desc: EVENT_TEXT.refugees.choices[0].desc, apply: (s) => { const n = addResidents(s, 60); s.unquieted += 15; s.modifiers.push({ kind: 'unrest', value: 0.05, until: s.day + 8, label: 'Newcomers' }); return `${n} Grimmen settle in. Their sextons ask where the Boneyard is.`; } },
      { label: EVENT_TEXT.refugees.choices[1].label, desc: EVENT_TEXT.refugees.choices[1].desc, apply: (s) => { s.modifiers.push({ kind: 'happiness', value: -4, until: s.day + 10, label: 'Refugees turned away' }); return 'They walk back into the grey without a word.'; } },
    ],
  },
  {
    id: 'collector', title: EVENT_TEXT.collector.title,
    text: EVENT_TEXT.collector.text,
    when: (s) => s.treasury > 6000 && s.milestone >= 3,
    choices: [
      { label: EVENT_TEXT.collector.choices[0].label, desc: EVENT_TEXT.collector.choices[0].desc!, apply: (s) => { const t = Math.round(s.treasury * 0.1); s.treasury -= t; addFavour(s, 5); return `${t} crowns ride back to Vell-on-Sable under guard. The collector writes "prompt" in the margin.`; } },
      { label: EVENT_TEXT.collector.choices[1].label, desc: (s) => `Keep the crowns; the Crown's favour −10, and the audit is harsher each time: ${s.pleadings === 0 ? 'tithe income −15% for 15 days' : s.pleadings === 1 ? 'tithe income −25% for 15 days' : 'a levy of a fifth of the treasury at once'} (pleaded ${s.pleadings} time${s.pleadings === 1 ? '' : 's'} before).`, apply: (s) => { addFavour(s, -10); s.pleadings++; if (s.pleadings === 1) { s.modifiers.push({ kind: 'tithe', value: -0.15, until: s.day + 15, label: 'Crown audit' }); return 'The collector leaves with a thin smile and a thick ledger.'; } if (s.pleadings === 2) { s.modifiers.push({ kind: 'tithe', value: -0.25, until: s.day + 15, label: 'Crown audit, the second' }); return 'The collector has heard of the Gloam. He audits every shelf in the city for a fortnight.'; } const t = Math.round(s.treasury * 0.2); s.treasury -= t; s.stats.levies++; s.stats.levied += t; return `The collector has heard this before. ${t} crowns, a fifth of the treasury, are counted out on the Stake's steps under guard.`; } },
    ],
  },
  // ---- the wild (M16 part 1, iteration 58) ----
  {
    id: 'whitehart', title: EVENT_TEXT.whitehart.title, once: true,
    text: EVENT_TEXT.whitehart.text,
    when: (s) => s.day >= 20 && s.wild.herds.some((h) => h.sp === 'deer' && h.head >= 6 && Math.hypot(h.x - s.founding.x, h.y - s.founding.y) <= 25),
    choices: [
      { label: EVENT_TEXT.whitehart.choices[0].label, desc: EVENT_TEXT.whitehart.choices[0].desc, apply: (s) => { s.treasury += 400; s.stats.trophies++; for (const h of s.wild.herds) if (h.sp === 'deer') h.head = Math.max(0.5, h.head - 2); s.modifiers.push({ kind: 'happiness', value: -3, until: s.day + 20, label: 'The white hart killed' }); return 'The hart\'s head goes to Vell-on-Sable in a cart lined with straw. The deer keep to the far meadows after.'; } },
      { label: EVENT_TEXT.whitehart.choices[1].label, desc: EVENT_TEXT.whitehart.choices[1].desc, apply: (s) => { s.wild.thriveUntil = s.day + 60; s.modifiers.push({ kind: 'happiness', value: 2, until: s.day + 20, label: 'The white hart seen' }); return 'The hart walks into the forest at dusk. The children draw it on every wall in the low streets.'; } },
    ],
  },
  {
    id: 'wolfwinter', title: EVENT_TEXT.wolfwinter.title,
    text: EVENT_TEXT.wolfwinter.text,
    when: (s) => seasonOf(s) === 3 && s.wild.herds.filter((h) => h.sp === 'wolf' && h.head >= 2).length >= 2 && s.day - s.wild.hensDay <= 10,
    choices: [
      { label: EVENT_TEXT.wolfwinter.choices[0].label, desc: EVENT_TEXT.wolfwinter.choices[0].desc, apply: (s) => { s.treasury -= 300; let hides = 0; for (const h of s.wild.herds) if (h.sp === 'wolf' && Math.hypot(h.x - s.founding.x, h.y - s.founding.y) <= 30) { const k = Math.floor(h.head / 2); h.head -= k; hides += 2 * k; } const lodge = s.buildings.find((b) => b && b.kind === 'hunterslodge' && b.state === 'ok'); if (lodge) lodge.stock += hides; s.stats.hides += hides; return `The hunt goes out with torches and hound-spears. ${hides / 2} wolves do not come back to the forest${lodge ? '' : ', and with no lodge to cure them the hides rot in a shed'}.`; } },
      { label: EVENT_TEXT.wolfwinter.choices[1].label, desc: EVENT_TEXT.wolfwinter.choices[1].desc, apply: (s) => { s.treasury -= 150; s.wild.foldsUntil = s.day + 30; return 'Every fold in the low streets gets a lamp on a pole. The wolves sit at the forest edge and watch them.'; } },
      { label: EVENT_TEXT.wolfwinter.choices[2].label, desc: EVENT_TEXT.wolfwinter.choices[2].desc, apply: (s) => { for (const h of s.wild.herds) if (h.sp === 'deer') h.head *= 0.8; s.modifiers.push({ kind: 'unrest', value: 0.03, until: s.day + 15, label: 'The wolf winter' }); return 'The goodwives go home with their hen. The deer will pay for the winter.'; } },
    ],
  },
  // ---- the water (M16 part 2, iteration 60) ----
  {
    id: 'spawnrun', title: EVENT_TEXT.spawnrun.title, once: true,
    text: EVENT_TEXT.spawnrun.text,
    when: (s) => seasonOf(s) === 1 && s.day >= 30 && !!spawnHut(s),
    choices: [
      { label: EVENT_TEXT.spawnrun.choices[0].label, desc: EVENT_TEXT.spawnrun.choices[0].desc, apply: (s) => { const h = spawnHut(s); s.treasury += 300; if (h) { const w = ensureShoals(s); const b = bodyOf(s, h); s.water.fish[b] = Math.min(s.water.fish[b], shoalCap(w, b) * 0.4); } return 'Every boat and every net in the city goes out. The racks are full for a week and the Gloam road buys the rest. Next year will be thinner.'; } },
      { label: EVENT_TEXT.spawnrun.choices[1].label, desc: EVENT_TEXT.spawnrun.choices[1].desc, apply: (s) => { s.water.spawnUntil = s.day + 60; s.modifiers.push({ kind: 'happiness', value: 1, until: s.day + 20, label: 'The spawning run' }); return 'The nets stay on the racks. Children line the bank to watch the water boil. The fishers say the river will remember.'; } },
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
    id: 'pilgrims_shrine', title: EVENT_TEXT.pilgrims_shrine.title, priority: true,
    text: EVENT_TEXT.pilgrims_shrine.text,
    when: (s) => s.pilgrimsDay >= 0 && s.day - s.pilgrimsDay >= PILGRIM_ASK_DAYS && s.day - s.pilgrimsDay <= PILGRIM_ASK_DAYS + 10,
    choices: [
      { label: EVENT_TEXT.pilgrims_shrine.choices[0].label, desc: EVENT_TEXT.pilgrims_shrine.choices[0].desc, apply: (s) => { s.pilgrimsDay = -1; const spot = findSpot(s, 'shrine'); if (!spot) return 'No ground among the hearths will take a shrine; the pilgrims keep praying at the Stake.'; s.treasury -= 600; const b = placeBuildingRaw(s, 'shrine', spot[0], spot[1]); markDirty(s, b.x, b.y); s.stats.pilgrimShrines++; s.modifiers.push({ kind: 'happiness', value: 3, until: s.day + 15, label: 'The pilgrims\' shrine' }); return `A shrine of Aume at (${spot[0]},${spot[1]}), raised in a week by people who sing while they work.`; } },
      { label: EVENT_TEXT.pilgrims_shrine.choices[1].label, desc: EVENT_TEXT.pilgrims_shrine.choices[1].desc, apply: (s) => { s.pilgrimsDay = -1; s.modifiers.push({ kind: 'happiness', value: 1, until: s.day + 20, label: 'Holy days at the Stake' }); return 'The priest bows. The hall smells of candles every seventh day.'; } },
      { label: EVENT_TEXT.pilgrims_shrine.choices[2].label, desc: EVENT_TEXT.pilgrims_shrine.choices[2].desc, apply: (s) => { s.pilgrimsDay = -1; s.modifiers.push({ kind: 'happiness', value: -4, until: s.day + 10, label: 'The pilgrims refused' }); return 'They pray in the street outside the Stake for a week, which is worse.'; } },
    ],
  },
  {
    id: 'lukuku_first', title: EVENT_TEXT.lukuku_first.title, once: true,
    text: EVENT_TEXT.lukuku_first.text,
    when: (s) => s.buildings.some((b) => b && b.kind === 'ruindelve' && b.state === 'ok' && b.age >= 8),
    choices: [
      { label: EVENT_TEXT.lukuku_first.choices[0].label, desc: EVENT_TEXT.lukuku_first.choices[0].desc, apply: (s) => { s.educated = Math.min(0.95, s.educated + 0.05); s.treasury += 1000; return 'Rubbings and relics go north under seal. The Academy sends back a very long letter.'; } },
      { label: EVENT_TEXT.lukuku_first.choices[1].label, desc: EVENT_TEXT.lukuku_first.choices[1].desc, apply: (s) => { s.treasury += 4000; s.modifiers.push({ kind: 'happiness', value: -2, until: s.day + 10, label: 'Mosaic sold' }); return 'A Belerial collector pays in gold and takes it apart tile by tile.'; } },
    ],
  },
  {
    id: 'lukuku_door', title: EVENT_TEXT.lukuku_door.title, once: true,
    text: EVENT_TEXT.lukuku_door.text,
    when: (s) => (chose(s, 'lukuku_first', 0) || chose(s, 'lukuku_first', 1)) && s.day - s.lastEventDay >= 12 && s.buildings.some((b) => b && b.kind === 'ruindelve' && b.state === 'ok'),
    choices: [
      { label: EVENT_TEXT.lukuku_door.choices[0].label, desc: EVENT_TEXT.lukuku_door.choices[0].desc, apply: (s) => { s.treasury -= 1500; s.unquieted = Math.max(0, s.unquieted - 15); return 'The sextons sing for a night and a day. The hum stops. The foreman sleeps.'; } },
      { label: EVENT_TEXT.lukuku_door.choices[1].label, desc: EVENT_TEXT.lukuku_door.choices[1].desc, apply: (s) => { const rng = rngOf(s); const hoard = rng.chance(0.5); commitRng(s, rng); const d = s.buildings.find((b) => b && b.kind === 'ruindelve'); if (hoard) { s.treasury += 8000; s.stats.relics += 20; s.relicStock += 20; return 'A vault of lantern-cores and gold under a ceiling of painted stars. The diggers are paid triple and still will not go back.'; } s.unquieted += 20; if (d) for (let k = 0; k < 8; k++) spawnRestless(s, d.x + (k % 3), d.y + Math.floor(k / 3)); pushMessage(s, `The door at the Ruins of Lukuku opens and the old dead walk out at (${d?.x ?? 0},${d?.y ?? 0}).`, 'bad', true); return 'The door opens on stairs going down, and things coming up.'; } },
    ],
  },
  {
    id: 'relic_stolen', title: EVENT_TEXT.relic_stolen.title, once: true,
    text: EVENT_TEXT.relic_stolen.text,
    when: (s) => chose(s, 'relic', 1) && s.day - s.lastEventDay >= 15 && hasAcademy(s),
    choices: [
      { label: EVENT_TEXT.relic_stolen.choices[0].label, desc: EVENT_TEXT.relic_stolen.choices[0].desc, apply: (s) => { s.treasury -= 500; const rng = rngOf(s); const ok = rng.chance(0.75); commitRng(s, rng); if (ok) { s.treasury += 2500; return 'The Watch corners the cult in a Boneyard at midnight. The relic comes back; three cultists do not.'; } s.modifiers.push({ kind: 'unrest', value: 0.06, until: s.day + 10, label: 'Cult at large' }); return 'The cult slips into the Gloam. The chalk marks keep appearing.'; } },
      { label: EVENT_TEXT.relic_stolen.choices[1].label, desc: EVENT_TEXT.relic_stolen.choices[1].desc, apply: (s) => { s.modifiers.push({ kind: 'unrest', value: 0.06, until: s.day + 12, label: 'Cult emboldened' }); return 'Nobody sleeps well for a fortnight.'; } },
    ],
  },
  {
    id: 'guilds_return', title: EVENT_TEXT.guilds_return.title, once: true,
    text: EVENT_TEXT.guilds_return.text,
    when: (s) => chose(s, 'guilds', 0) && s.day - s.lastEventDay >= 20 && s.milestone >= 5,
    choices: [
      { label: EVENT_TEXT.guilds_return.choices[0].label, desc: EVENT_TEXT.guilds_return.choices[0].desc, apply: (s) => { s.treasury += 1500; s.modifiers.push({ kind: 'craftTax', value: 8, until: s.day + 120, label: 'Guild pact' }); return 'The carters paint "It Moves" on every cart in the valley.'; } },
      { label: EVENT_TEXT.guilds_return.choices[1].label, desc: EVENT_TEXT.guilds_return.choices[1].desc, apply: () => 'The guildmasters bow, tightly.' },
    ],
  },
  {
    id: 'grimmen_boneyard', title: EVENT_TEXT.grimmen_boneyard.title, once: true,
    text: EVENT_TEXT.grimmen_boneyard.text,
    when: (s) => chose(s, 'refugees', 0) && s.day - s.lastEventDay >= 12,
    choices: [
      { label: EVENT_TEXT.grimmen_boneyard.choices[0].label, desc: EVENT_TEXT.grimmen_boneyard.choices[0].desc, apply: (s) => { const spot = findSpot(s, 'boneyard'); if (!spot) { s.treasury -= 200; s.unquieted = Math.max(0, s.unquieted - 15); return 'No ground could be found; the sextons sing the Rite in the streets instead.'; } s.treasury -= 700; placeBuildingRaw(s, 'boneyard', spot[0], spot[1]); s.unquieted = Math.max(0, s.unquieted - 15); return 'Morrow\'s garden opens at dusk. The Grimmen sing all night, and the ground goes quiet.'; } },
      { label: EVENT_TEXT.grimmen_boneyard.choices[1].label, desc: EVENT_TEXT.grimmen_boneyard.choices[1].desc, apply: (s) => { s.unquieted += 10; s.modifiers.push({ kind: 'unrest', value: 0.05, until: s.day + 10, label: 'Grimmen refused' }); return 'They bury their dead beyond the last lantern, without the Rite.'; } },
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
    id: 'thawday', title: EVENT_TEXT.thawday.title, season: 0, seasonDay: 2,
    text: EVENT_TEXT.thawday.text,
    when: (s) => s.population > 40,
    choices: [
      { label: EVENT_TEXT.thawday.choices[0].label, desc: EVENT_TEXT.thawday.choices[0].desc, apply: (s) => { s.treasury -= 300; const fed = holdFeast(s, 40); if (fed.goods < 10) { s.modifiers.push({ kind: 'happiness', value: 2, until: s.day + 8, label: 'A thin feast' }); return `The shelves were bare: ${Math.round(fed.goods)} goods make a thin feast of bread and water. The choir sings anyway.`; } s.modifiers.push({ kind: 'happiness', value: 3, until: s.day + 15, label: 'Thaw feast' }); for (const d of fed.districts) s.modifiers.push({ kind: 'happiness', value: 5, until: s.day + 15, label: `Thaw feast (${d ? DISTRICT_NAMES[d - 1] : 'the old town'})`, district: d }); return `${Math.round(fed.goods)} goods from ${fed.districts.map((d) => (d ? districtName(s, d) : 'the old town')).join(', ')}: bread, glimherb ale, and a Grimmen choir that nobody expected to be so good.`; } },
      { label: EVENT_TEXT.thawday.choices[1].label, desc: EVENT_TEXT.thawday.choices[1].desc, apply: (s) => { s.modifiers.push({ kind: 'happiness', value: -2, until: s.day + 5, label: 'Ward labour' }); let n = 0; for (let i = 0; i < s.gloam.length; i++) if (s.gloam[i] && s.coverage.ward[i] > 0) { s.gloam[i] = 0; n++; markDirty(s, i % MAP_W, Math.floor(i / MAP_W)); } s.stats.gloamBurned += n; if (n) recomputeGloamDist(s); return `${n} tiles of grey grass are cut and burned under the lanterns.`; } },
    ],
  },
  {
    id: 'remembrance', title: EVENT_TEXT.remembrance.title, season: 2, seasonDay: 15,
    text: EVENT_TEXT.remembrance.text,
    when: (s) => s.population > 80,
    choices: [
      { label: EVENT_TEXT.remembrance.choices[0].label, desc: EVENT_TEXT.remembrance.choices[0].desc, apply: (s) => { s.educated = Math.min(0.95, s.educated + 0.04); const oss = hasOssuary(s); s.unquieted += oss ? 3 : 12; s.remembranceDead += oss ? 3 : 12; return oss ? 'The names are read over the vaults. The bones keep their pattern and the spires barely flutter.' : 'The names are read. The spires hum a half-tone flat until dawn.'; } },
      { label: EVENT_TEXT.remembrance.choices[1].label, desc: EVENT_TEXT.remembrance.choices[1].desc, apply: (s) => { const oss = hasOssuary(s); s.unquieted = Math.max(0, s.unquieted - (oss ? 15 : 6)); s.modifiers.push({ kind: 'happiness', value: 2, until: s.day + 10, label: 'Remembrance kept' }); return oss ? 'A night of candles in the Ossuary. Hollis counts the quiet and finds it good.' : 'A night of candles and no speeches. Morrow approves.'; } },
    ],
  },
  {
    id: 'vigil', title: EVENT_TEXT.vigil.title, season: 3, seasonDay: 1,
    text: EVENT_TEXT.vigil.text,
    when: (s) => s.population > 40,
    choices: [
      { label: EVENT_TEXT.vigil.choices[0].label, desc: (s) => { const r = factionOf(s).rules; return `The lamps draw up to ${Math.round(120 * r.vigilCost)} stored mana from the Nexus rings: the Gloam holds 6 days, plus a day for every ${Math.round(12 * r.vigilCost)} mana drawn. Shallow stores (under ${Math.round(60 * r.vigilCost)}) mean the lamps burn from the spires instead: demand +15% for 10 days.`; }, apply: (s) => { const vc = factionOf(s).rules.vigilCost; const take = Math.min(120 * vc, s.manaStorage); s.manaStorage -= take; const days = 6 + Math.floor(take / (12 * vc)); if (take < 60 * vc) s.modifiers.push({ kind: 'mana', value: 0.15, until: s.day + 10, label: 'Hush vigil' }); s.modifiers.push({ kind: 'gloamHold', value: 1, until: s.day + days, label: 'Vigil holds the Gloam' }); return take >= 60 * vc ? `${Math.round(take)} mana from the stores keeps every window amber for ${days} nights, until day ${s.day + days}. Beyond the last lantern, the grey grass waits.` : `The stores are shallow: the spires burn hot to keep the windows lit, and the Gloam holds ${days} nights, until day ${s.day + days}.`; } },
      { label: EVENT_TEXT.vigil.choices[1].label, desc: (s) => (factionOf(s).rules.vigilMandatory ? 'The Tallowkin do not sleep through the vigil. Happiness −8 for 30 days, and the dark remembers.' : 'No cost. The whispering is louder this Hush: happiness −3 for 20 days.'), apply: (s) => { const hard = factionOf(s).rules.vigilMandatory; s.modifiers.push({ kind: 'happiness', value: hard ? -8 : -3, until: s.day + (hard ? 30 : 20), label: 'Vigil skipped' }); return hard ? 'Nobody sleeps. Every candle-eyed child sits at a dark window all night, and in the morning nobody speaks to the Warden-Reeve.' : 'Old Maud keeps her lamp lit anyway. She says the dark remembers who did not.'; } },
    ],
  },
  {
    id: 'lanternfair', title: EVENT_TEXT.lanternfair.title, season: 1, seasonDay: 12,
    text: EVENT_TEXT.lanternfair.text,
    when: (s) => s.population > 60 && s.buildings.some((b) => b && b.kind === 'guildhall' && b.state === 'ok'),
    choices: [
      { label: EVENT_TEXT.lanternfair.choices[0].label, desc: EVENT_TEXT.lanternfair.choices[0].desc, apply: (s) => { s.treasury -= 500; s.modifiers.push({ kind: 'price', value: 0.5, until: s.day + 6, label: 'Lantern Fair' }); s.guilds.standing.carters = Math.min(100, s.guilds.standing.carters + 10); s.guilds.standing.alchemists = Math.min(100, s.guilds.standing.alchemists + 5); return 'Lanterns on every cart. A Belerial buyer pays gold for a crate of glimherb ale and asks if there is more.'; } },
      { label: EVENT_TEXT.lanternfair.choices[1].label, desc: EVENT_TEXT.lanternfair.choices[1].desc, apply: (s) => { s.guilds.standing.carters = Math.max(0, s.guilds.standing.carters - 8); return 'The carters from the other wardlights turn their mules around at the gate. The Watch sleeps well.'; } },
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
    id: 'egg_first', title: EVENT_TEXT.egg_first.title, once: true, priority: true, // the Crown heard of the cradle: it answers, not the luck of the draw (iteration 55)
    text: EVENT_TEXT.egg_first.text,
    when: (s) => s.buildings.some((b) => b && isCradle(b.kind) && b.state === 'ok') && s.dragons.length === 0,
    choices: [
      { label: EVENT_TEXT.egg_first.choices[0].label, desc: (s) => `${s.faction === 'veshari' ? 'A tide' : 'An ember'} egg goes into your cradle.`, apply: (s) => { const d = addEgg(s, s.faction === 'veshari' ? 'tide' : 'ember'); return d ? `The egg hums the moment it touches the cradle stones. The tamers call it ${d.name}.` : 'The cradle is full; the rider takes the egg on to the next wardlight.'; } },
      { label: EVENT_TEXT.egg_first.choices[1].label, desc: EVENT_TEXT.egg_first.choices[1].desc!, apply: (s) => { s.treasury += 800; return 'The rider bows, leaves a purse, and rides on with the crate.'; } },
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
    id: 'egg_poachers', title: EVENT_TEXT.egg_poachers.title,
    text: EVENT_TEXT.egg_poachers.text,
    when: (s) => s.buildings.some((b) => b && isCradle(b.kind)) && s.treasury > 3000 && s.dragons.length < 6,
    choices: [
      { label: EVENT_TEXT.egg_poachers.choices[0].label, desc: EVENT_TEXT.egg_poachers.choices[0].desc, apply: (s) => { if (s.treasury < 2500) return 'The purse is too light; the carters pull their hoods up and go.'; const rng = rngOf(s); const line = rng.pick(['ember', 'bone', 'glim'] as DragonLine[]); commitRng(s, rng); if (!freeCradle(s, line)) return `No cradle has room for a ${LINE_INFO[line].name.toLowerCase()} egg; the poachers sell it on to the Crown.`; s.treasury -= 2500; const d = addEgg(s, line); return d ? `A ${LINE_INFO[line].name.toLowerCase()} egg, still warm. The poachers are gone before the crowns are counted.` : 'No cradle had room; the egg is sold on to the Crown at a loss. The poachers laugh.'; } },
      { label: EVENT_TEXT.egg_poachers.choices[1].label, desc: EVENT_TEXT.egg_poachers.choices[1].desc, apply: (s) => { s.modifiers.push({ kind: 'unrest', value: -0.03, until: s.day + 10, label: 'Poachers jailed' }); const rng = rngOf(s); const luck = rng.chance(0.4); commitRng(s, rng); if (luck) { const d = addEgg(s, 'ember'); if (d) return 'The Watch takes the carters and the egg. It goes to the cradle.'; } return 'The Watch takes the carters. The egg is not in the cart.'; } },
      { label: EVENT_TEXT.egg_poachers.choices[2].label, desc: EVENT_TEXT.egg_poachers.choices[2].desc, apply: () => 'They leave by the Gloam road, moss dripping.' },
    ],
  },
];

/** Visitors from the wider Eda (lore drop). */
/** The Crown's assessor comes for relics. */
const CROWN: EventDef[] = [
  {
    id: 'assessor', title: EVENT_TEXT.assessor.title,
    text: EVENT_TEXT.assessor.text,
    when: (s) => s.relicStock >= 12 && s.buildings.some((b) => b && b.kind === 'ruindelve' && b.state === 'ok'),
    choices: [
      { label: EVENT_TEXT.assessor.choices[0].label, desc: EVENT_TEXT.assessor.choices[0].desc, apply: (s) => { const n = s.relicStock; s.treasury += n * 90; s.stats.relicsSold += n; addFavour(s, 0.2 * n); s.relicStock = 0; s.guilds.standing.sextons = Math.max(0, s.guilds.standing.sextons - 5); return `${n} relics go north under seal for ${n * 90} crowns. Hollis says the dead will want them back.`; } },
      { label: EVENT_TEXT.assessor.choices[1].label, desc: EVENT_TEXT.assessor.choices[1].desc, apply: (s) => { const n = s.relics.uncatalogued; if (!n) return 'There are no uncatalogued pieces. The assessor buys a cup of tea instead.'; s.treasury += n * 1500; s.relics.uncatalogued = 0; s.stats.relicsSold += n; addFavour(s, 3 * n); s.guilds.standing.sextons = Math.max(0, s.guilds.standing.sextons - 8); return `${n} piece(s) of something older than the Concord leave in the grey coach for ${n * 1500} crowns.`; } },
      { label: EVENT_TEXT.assessor.choices[2].label, desc: EVENT_TEXT.assessor.choices[2].desc, apply: (s) => { s.educated = Math.min(0.95, s.educated + 0.02); return 'The assessor writes a long note and underlines it twice. The scholars are delighted.'; } },
    ],
  },
];

const VISITORS: EventDef[] = [
  {
    id: 'fennex', title: EVENT_TEXT.fennex.title, once: true,
    text: EVENT_TEXT.fennex.text,
    when: (s) => s.milestone >= 4 && s.population > 250,
    choices: [
      { label: EVENT_TEXT.fennex.choices[0].label, desc: EVENT_TEXT.fennex.choices[0].desc, apply: (s) => { const rng = rngOf(s); const honest = rng.chance(0.5); commitRng(s, rng); if (honest) { s.treasury += 3000; return 'Honest, this time. Salts, dyes and a set of scales that weigh true, paid for in coin that stays coin.'; } s.treasury -= 1500; s.modifiers.push({ kind: 'happiness', value: -3, until: s.day + 7, label: 'Swindled by foxes' }); return 'The coin turns to leaves by morning. The Fen-Nex are already two valleys away, laughing.'; } },
      { label: EVENT_TEXT.fennex.choices[1].label, desc: EVENT_TEXT.fennex.choices[1].desc, apply: (s) => { const d = marketDistrict(s); if (!d) { s.treasury += 500; return 'No painted district holds a market. The foxes shrug and trade honestly, for once: +500 crowns.'; } s.fenNex = d; pushMessage(s, `${districtName(s, d)} is the Fen-Nex quarter now: no tithe from its markets, twice the shelves.`, 'milestone', true); return `They move into ${districtName(s, d)} overnight. The market signs are already in two scripts.`; } },
      { label: EVENT_TEXT.fennex.choices[2].label, desc: EVENT_TEXT.fennex.choices[2].desc, apply: () => 'They bow, and bow, and are gone. One of the Watch lanterns is missing in the morning.' },
    ],
  },
  {
    id: 'fennex_gift', title: EVENT_TEXT.fennex_gift.title, once: true,
    text: EVENT_TEXT.fennex_gift.text,
    when: (s) => s.fenNex > 0 && s.day - s.lastEventDay >= 20 && s.buildings.some((b) => b && isCradle(b.kind) && b.state === 'ok'),
    choices: [
      { label: EVENT_TEXT.fennex_gift.choices[0].label, desc: EVENT_TEXT.fennex_gift.choices[0].desc, apply: (s) => { const rng = rngOf(s); const real = rng.chance(0.5); commitRng(s, rng); if (!real) { s.modifiers.push({ kind: 'happiness', value: 2, until: s.day + 10, label: 'A good joke' }); return 'Leaves. Very warm leaves. The whole quarter is laughing and, somehow, so is the city.'; } const d = addEgg(s, 'fen'); return d ? `Real. The tamers call it ${d.name}; it is already stealing shoes.` : 'Real, and no cradle has room. The speaker takes it back with a look of sympathy.'; } },
      { label: EVENT_TEXT.fennex_gift.choices[1].label, desc: EVENT_TEXT.fennex_gift.choices[1].desc, apply: () => '"Wise," she says, in a tone that means the opposite.' },
    ],
  },
  {
    id: 'longwood_sighting', title: EVENT_TEXT.longwood_sighting.title,
    text: EVENT_TEXT.longwood_sighting.text,
    when: (s) => forestTiles(s) >= TIGER_FOREST && s.milestone >= 2,
    choices: [
      { label: EVENT_TEXT.longwood_sighting.choices[0].label, desc: EVENT_TEXT.longwood_sighting.choices[0].desc, apply: (s) => { s.modifiers.push({ kind: 'happiness', value: 3, until: s.day + 12, label: 'A wonder in the woods' }); return 'The story grows a head each telling. Children leave apples at the forest edge.'; } },
      { label: EVENT_TEXT.longwood_sighting.choices[1].label, desc: EVENT_TEXT.longwood_sighting.choices[1].desc, apply: (s) => { s.treasury -= 400; s.modifiers.push({ kind: 'unrest', value: -0.03, until: s.day + 10, label: 'The hunt' }); return 'Three days in the trees, a great deal of ale, and one very clear hoofprint.'; } },
    ],
  },
  {
    id: 'dr_jelly', title: EVENT_TEXT.dr_jelly.title, once: true,
    text: EVENT_TEXT.dr_jelly.text,
    when: (s) => s.milestone >= 3 && s.treasury > 3000,
    choices: [
      { label: EVENT_TEXT.dr_jelly.choices[0].label, desc: EVENT_TEXT.dr_jelly.choices[0].desc, apply: (s) => { s.treasury -= 1200; const rng = rngOf(s); const r = rng.int(4); commitRng(s, rng); if (r === 0) { s.treasury += 6000; return 'Drunk by the Warden-Reeve at noon. By dusk a vein of silver is found under the square: +6,000 crowns.'; } if (r === 1) { s.modifiers.push({ kind: 'happiness', value: 10, until: s.day + 20, label: "Dr. Jelly's potion" }); return 'Poured into the well. Everyone is very, very cheerful for three weeks.'; } if (r === 2) { s.educated = Math.min(0.95, s.educated + 0.1); return 'Given to the Academy. The students understand leystone perfectly for one afternoon, and write it all down.'; } s.modifiers.push({ kind: 'mana', value: 0.3, until: s.day + 10, label: 'Ley headache' }); return 'The spires hum a note nobody asked for. Mana demand +30% for ten days.'; } },
      { label: EVENT_TEXT.dr_jelly.choices[1].label, desc: EVENT_TEXT.dr_jelly.choices[1].desc, apply: (s) => { s.modifiers.push({ kind: 'goods', value: 0.1, until: s.day + 10, label: 'Strange batch' }); return 'The stills run strange and strong for a week. Craft goods +10%.'; } },
    ],
  },
  {
    id: 'cloud_wizard', title: EVENT_TEXT.cloud_wizard.title, once: true,
    text: EVENT_TEXT.cloud_wizard.text,
    when: (s) => s.milestone >= 4,
    choices: [
      { label: EVENT_TEXT.cloud_wizard.choices[0].label, desc: EVENT_TEXT.cloud_wizard.choices[0].desc, apply: (s) => { const f = s.founding; let n = 0; const rng = rngOf(s); for (let tries = 0; tries < 200 && n < 12; tries++) { const x = f.x + rng.int(17) - 8; const y = f.y + rng.int(17) - 8; if (!inBounds(x, y)) continue; const i = idx(x, y); if (s.terrain[i] !== Terrain.Grass && s.terrain[i] !== Terrain.Meadow) continue; if (s.bIndex[i] >= 0 || s.road[i] || s.zone[i] || s.wall[i]) continue; s.terrain[i] = Terrain.Forest; markDirty(s, x, y); n++; } commitRng(s, rng); s.modifiers.push({ kind: 'happiness', value: 4, until: s.day + 30, label: 'The glimwood grove' }); return `${n} glimwood saplings, waist-high by morning and glowing by the next night.`; } },
      { label: EVENT_TEXT.cloud_wizard.choices[1].label, desc: EVENT_TEXT.cloud_wizard.choices[1].desc, apply: () => 'He leaves a single seed on the Stake. It has not sprouted. Yet.' },
    ],
  },
  {
    id: 'asyrion', title: EVENT_TEXT.asyrion.title, once: true,
    text: EVENT_TEXT.asyrion.text,
    when: (s) => s.milestone >= 5 && s.day > 60,
    choices: [
      { label: EVENT_TEXT.asyrion.choices[0].label, desc: EVENT_TEXT.asyrion.choices[0].desc, apply: (s) => { s.treasury += 500; s.modifiers.push({ kind: 'happiness', value: 2, until: s.day + 10, label: 'A kind word' }); return 'The note is pinned inside the Stake. Nobody agrees on what the traveller looked like.'; } },
    ],
  },
  {
    id: 'stormcaller', title: EVENT_TEXT.stormcaller.title, once: true, priority: true,
    text: EVENT_TEXT.stormcaller.text,
    when: (s) => s.milestone >= 4 && s.population > 300,
    choices: [
      { label: EVENT_TEXT.stormcaller.choices[0].label, desc: EVENT_TEXT.stormcaller.choices[0].desc, apply: (s) => { s.modifiers.push({ kind: 'rain', value: 1, until: s.day + 10, label: 'Huruhui rain' }); s.educated = Math.min(0.95, s.educated + 0.02); let n = 0; for (const b of s.buildings) if (b && b.state === 'burning') { b.state = 'ok'; b.stateDays = 0; n++; } return `They climb at dusk. By midnight it is raining on every roof in the valley and ${n} fire${n === 1 ? ' is' : 's are'} out. The Academy takes notes.`; } },
      { label: EVENT_TEXT.stormcaller.choices[1].label, desc: EVENT_TEXT.stormcaller.choices[1].desc, apply: () => 'They bow, and the wind picks up as they leave, which may be coincidence.' },
    ],
  },
  {
    id: 'caravan', title: EVENT_TEXT.caravan.title,
    text: EVENT_TEXT.caravan.text,
    when: (s) => s.buildings.some((b) => b && b.kind === 'depot' && b.state === 'ok') && s.milestone >= 3,
    choices: [
      { label: EVENT_TEXT.caravan.choices[0].label, desc: (s) => `Sell every works' surplus above 10 goods at 1.5x the season price (${caravanSurplus(s)} goods on the shelves now).`, apply: (s) => { let sold = 0; for (const b of s.buildings) { if (!b || b.state !== 'ok') continue; const def = BUILDING_BY_KEY[b.kind]; if (def.zone === Zone.Craft && b.stock > 10) { const n = b.stock - 10; b.stock = 10; sold += n; } } sold = Math.round(sold); const crowns = Math.round(sold * s.trade.priceGoods * 1.5); s.treasury += crowns; s.stats.caravanGoods += sold; return sold > 0 ? `${sold} goods change hands for ${crowns} crowns. The riders pay in Belerial gold, which the guild weighs twice.` : 'The works have nothing to spare above ten goods a shelf. The riders buy bread and water the striders.'; } },
      { label: EVENT_TEXT.caravan.choices[1].label, desc: (s) => { const m = s.materials; return `Scale 400, wyrmfire 500, eggshell 200, rayscale 300, glim-dust 150 crowns each (${Math.round(m.scale * 400 + m.wyrmfire * 500 + m.eggshell * 200 + m.rayscale * 300 + m.glimdust * 150)} crowns for the whole vault); the slider sets the share sold.`; }, slider: { max: 100, label: 'share of the vault sold' }, apply: (s, amount) => { const share = amount === undefined ? 1 : Math.max(0, Math.min(100, amount)) / 100; const m = s.materials; const sold = { scale: m.scale * share, wyrmfire: m.wyrmfire * share, eggshell: m.eggshell * share, rayscale: m.rayscale * share, glimdust: m.glimdust * share }; const crowns = Math.round(sold.scale * 400 + sold.wyrmfire * 500 + sold.eggshell * 200 + sold.rayscale * 300 + sold.glimdust * 150); const line = `${Math.round(sold.scale)} scale, ${sold.wyrmfire.toFixed(1)} wyrmfire, ${sold.eggshell.toFixed(1)} eggshell, ${sold.rayscale.toFixed(1)} rayscale and ${sold.glimdust.toFixed(1)} glim-dust`; m.scale -= sold.scale; m.wyrmfire -= sold.wyrmfire; m.eggshell -= sold.eggshell; m.rayscale -= sold.rayscale; m.glimdust -= sold.glimdust; s.treasury += crowns; return crowns > 0 ? `${line} go east in sealed jars for ${crowns} crowns${share < 1 ? `; the rest stays in the vault` : ''}.` : 'The jars are empty. The riders shrug and water the striders.'; } },
      { label: EVENT_TEXT.caravan.choices[2].label, desc: EVENT_TEXT.caravan.choices[2].desc!, apply: (s) => { if (s.treasury < 2000) return 'The purse is too light; the riders shrug and pack up.'; s.treasury -= 2000; s.modifiers.push({ kind: 'watch', value: 0.2, until: s.day + 60, label: 'Strider patrols' }); return 'Four striders and a rider to teach the Watch. The birds hiss at everyone but the Grimmen.'; } },
      { label: EVENT_TEXT.caravan.choices[3].label, desc: EVENT_TEXT.caravan.choices[3].desc!, apply: (s) => { if (s.relicStock < 1) return 'There are no loose relics to auction. The riders look at the empty table and laugh.'; const rng = rngOf(s); const price = 100 + rng.int(41); const n = s.relicStock; let out = `${n} relics go under the hammer at ${price} each: ${n * price} crowns.`; s.treasury += n * price; s.relicStock = 0; s.stats.relicsSold += n; s.stats.relicsAuctioned += n; if (s.relics.uncatalogued > 0 && rng.chance(0.34)) { s.relics.uncatalogued--; s.treasury += 2500; out += ' A Belerial collector in a striped coat pays 2,500 for a piece nobody has named yet.'; } commitRng(s, rng); s.guilds.standing.sextons = Math.max(0, s.guilds.standing.sextons - 5); return out; } },
      { label: EVENT_TEXT.caravan.choices[4].label, desc: EVENT_TEXT.caravan.choices[4].desc!, apply: () => 'They water the striders and ride for the next wardlight before noon.' },
    ],
  },
  {
    id: 'merchant', title: EVENT_TEXT.merchant.title,
    text: EVENT_TEXT.merchant.text,
    textFn: (s) => {
      const m = s.merchant;
      if (!m.visits) return 'A single wagon with a wandering merchant famous across three regions. The wagon holds things no cart in Vell has carried: seeds from Longwood, a white egg in a basket of feathers, salts from the Ulum.';
      const bought = m.eggs ? `${m.eggs === 1 ? 'an egg' : `${m.eggs} eggs`}${m.spent > m.eggs * 3000 ? ' and more' : ''}` : m.spent ? 'seeds and salts' : 'nothing yet';
      return `The wagon is back, for the ${['second', 'third', 'fourth', 'fifth'][Math.min(3, m.visits - 1)]} time. The merchant remembers: ${m.visits} visit${m.visits === 1 ? '' : 's'}, ${m.spent.toLocaleString()} crowns, ${bought}${m.talks >= 2 ? ', and the stories you traded instead of coin. She says she owes you one' : m.talks ? ', and one evening of stories' : ''}. ${m.eggs ? `The basket holds ${m.eggs === 1 ? 'a storm egg this time' : 'an ember egg this time'}` : 'The white egg is still in its basket'}, ${m.eggs ? 'at a price for an old customer' : 'at the old price'}.`;
    },
    when: (s) => s.buildings.some((b) => b && b.kind === 'depot' && b.state === 'ok') && s.milestone >= 5 && s.day - s.lastEventDay >= 10,
    choices: [
      { label: EVENT_TEXT.merchant.choices[0].label, desc: (s) => `${merchantEgg(s) === 'sky' ? 'A sky egg: a wyvern-only line, the fastest courier' : merchantEgg(s) === 'storm' ? 'A storm egg: the storm line, lightning in its wake' : 'An ember egg: the Craft line'}, ${merchantPrice(s, 4000).toLocaleString()} crowns${s.merchant.eggs ? ` (a tenth off for each egg bought: ${s.merchant.eggs})` : ''}. Needs a free cradle.`, apply: (s) => { const price = merchantPrice(s, 4000); const line = merchantEgg(s); if (s.treasury < price) return 'Not enough crowns; the merchant smiles and closes the basket.'; const d = addEgg(s, line); if (!d) return 'No cradle has room. The merchant keeps the egg and your interest.'; s.treasury -= price; s.merchant.spent += price; s.merchant.eggs++; merchantVisit(s); return `The egg is ${line === 'sky' ? 'white as the plains at noon' : line === 'storm' ? 'the blue of a sky before hail, and it hums' : 'warm as a hearthstone'}. The tamers name it ${d.name}.`; } },
      { label: EVENT_TEXT.merchant.choices[1].label, desc: (s) => `Goods production +20% for 30 days: ${merchantPrice(s, 1200).toLocaleString()} crowns.`, apply: (s) => { const price = merchantPrice(s, 1200); if (s.treasury < price) return 'Not enough crowns.'; s.treasury -= price; s.merchant.spent += price; merchantVisit(s); s.modifiers.push({ kind: 'goods', value: 0.2, until: s.day + 30, label: 'Longwood seeds' }); return 'The seeds sprout overnight in the herb yards, which the alchemists find rude.'; } },
      { label: EVENT_TEXT.merchant.choices[2].label, desc: (s) => `Unquieted dead −30; health +10 for 15 days: ${merchantPrice(s, 600).toLocaleString()} crowns.`, apply: (s) => { const price = merchantPrice(s, 600); if (s.treasury < price) return 'Not enough crowns.'; s.treasury -= price; s.merchant.spent += price; merchantVisit(s); s.unquieted = Math.max(0, s.unquieted - 30); s.modifiers.push({ kind: 'health', value: 0.1, until: s.day + 15, label: 'Ulum salts' }); return 'Salt on every lip in the boneyard, and a cleaner cough in the low streets. The merchant counts it twice and writes your name in a book.'; } },
      { label: EVENT_TEXT.merchant.choices[3].label, desc: EVENT_TEXT.merchant.choices[3].desc!, apply: (s) => { s.merchant.talks++; merchantVisit(s); return 'You trade stories: the Gates, the storm caller, a fox that was a man. The merchant leaves at dawn.'; } },
      { label: EVENT_TEXT.merchant.choices[4].label, desc: (s) => (s.merchant.talks >= 2 ? `Owed for ${s.merchant.talks} evenings of stories: Longwood seeds for nothing (goods +20% for 30 days).` : `Not yet owed: two evenings of stories first (${s.merchant.talks} so far).`), apply: (s) => { if (s.merchant.talks < 2) { merchantVisit(s); return 'The merchant laughs. "One evening is not a debt." The wagon rolls on.'; } s.merchant.talks = 0; merchantVisit(s); s.modifiers.push({ kind: 'goods', value: 0.2, until: s.day + 30, label: 'Longwood seeds (a favour)' }); return 'She hands the seed-bag over without a word about price, and says the stories were worth more.'; } },
    ],
  },
];

/** The Sleeping Wyrm (DESIGN 4.29). These fire on their own conditions, before the random draw. */
export const WYRM_EVENTS: EventDef[] = [
  {
    id: 'airship_tale', title: EVENT_TEXT.airship_tale.title,
    text: EVENT_TEXT.airship_tale.text,
    when: (s) => s.airship.tale > 0 && !s.pendingEvent,
    choices: [
      { label: EVENT_TEXT.airship_tale.choices[0].label, desc: EVENT_TEXT.airship_tale.choices[0].desc, apply: (s) => { s.airship.tale = 0; s.materials.rayscale += 4; s.modifiers.push({ kind: 'goods', value: 0.1, until: s.day + 15, label: 'Foreign reagents' }); return 'Crates of pale scale and a jar of dust that hums. The alchemists close the shutters for a week.'; } },
      { label: EVENT_TEXT.airship_tale.choices[1].label, desc: EVENT_TEXT.airship_tale.choices[1].desc, apply: (s) => { s.airship.tale = 0; return `${addResidents(s, 30)} folk step off the gondola with everything they own and a letter of introduction.`; } },
      { label: EVENT_TEXT.airship_tale.choices[2].label, desc: EVENT_TEXT.airship_tale.choices[2].desc, apply: (s) => { s.airship.tale = 0; s.modifiers.push({ kind: 'happiness', value: 5, until: s.day + 20, label: "The captain's story" }); return 'She tells it on the square at dusk. Nobody goes home until the spires dim.'; } },
    ],
  },
  {
    id: 'wyvern_tale', title: EVENT_TEXT.wyvern_tale.title,
    text: EVENT_TEXT.wyvern_tale.text,
    when: (s) => (s.airship.wyvernTale ?? 0) > 0 && !s.pendingEvent,
    choices: [
      { label: EVENT_TEXT.wyvern_tale.choices[0].label, desc: EVENT_TEXT.wyvern_tale.choices[0].desc!, apply: (s) => { s.airship.wyvernTale = 0; if (s.treasury < 3000) return 'The purse is too light; the rider keeps the basket shut.'; const rng = rngOf(s); const line = rng.pick(['ember', 'bone', 'glim', 'storm'] as DragonLine[]); commitRng(s, rng); const d = addEgg(s, line); if (!d) return `No cradle has room for a ${LINE_INFO[line].name.toLowerCase()} egg; the rider takes it home again.`; s.treasury -= 3000; return `A ${LINE_INFO[line].name.toLowerCase()} egg from a cradle three lanterns east. The tamers name it ${d.name}.`; } },
      { label: EVENT_TEXT.wyvern_tale.choices[1].label, desc: (s) => { const ring = s.buildings.some((b) => b && b.kind === 'ring' && b.state === 'ok'); const champ = ringChampion(s); return ring && champ ? `${champ.name} fights the rival's wyvern at the Ring today: the odds at three quarters, the purse doubled (${3000 * champ.stage} crowns).` : ring ? 'The Ring stands, but no champion is named: the challenge goes unanswered.' : 'No Wyrm-Ring stands: the challenge goes unanswered.'; }, apply: (s) => { s.airship.wyvernTale = 0; const ring = s.buildings.some((b) => b && b.kind === 'ring' && b.state === 'ok'); const champ = ringChampion(s); if (!ring || !champ) return 'The rider shrugs and rides home with the challenge unanswered. The story of it goes round the wardlights anyway.'; const rng = rngOf(s); const won = fightBout(s, champ, rng, 0.75, 2, "the rival wardlight's wyvern"); commitRng(s, rng); return won ? `${champ.name} meets the rival's wyvern over the Ring and sends it home bleeding. The purse is the richest the Ring has paid.` : `The rival's wyvern is a bigger beast than its rider let on. ${champ.name} is carried back to its cradle.`; } },
      { label: EVENT_TEXT.wyvern_tale.choices[2].label, desc: EVENT_TEXT.wyvern_tale.choices[2].desc!, apply: (s) => { s.airship.wyvernTale = 0; s.modifiers.push({ kind: 'happiness', value: 4, until: s.day + 15, label: "The wyvern's story" }); return 'The rider tells it on the square: a city whose spires sing in a different key, and a wyvern of yours that would not be caught. Nobody goes home until the spires dim.'; } },
    ],
  },
  {
    id: 'wyrm_tribute', title: EVENT_TEXT.wyrm_tribute.title,
    text: EVENT_TEXT.wyrm_tribute.text,
    when: (s) => s.wyrm.state === 'awake' && s.wyrm.tributeDay >= 0 && s.day >= s.wyrm.tributeDay && !s.pendingEvent,
    choices: [
      { label: EVENT_TEXT.wyrm_tribute.choices[0].label, desc: EVENT_TEXT.wyrm_tribute.choices[0].desc!, apply: (s) => payTribute(s, 'crowns') },
      { label: EVENT_TEXT.wyrm_tribute.choices[1].label, desc: (s) => `${WYRM_TRIBUTE_GOODS} goods taken from the market shelves (${Math.round(marketGoods(s))} on them now). Fewer than half and it counts as a refusal${s.wyrm.starved >= WYRM_STARVE_LIMIT - 1 ? ': the last one' : ''}.`, apply: (s) => payTribute(s, 'goods') },
      { label: EVENT_TEXT.wyrm_tribute.choices[2].label, desc: (s) => (s.wyrm.starved >= WYRM_STARVE_LIMIT - 1 ? `Refused ${s.wyrm.starved} times running, it will not circle this time: it flies for the Founding Stake and burns the Charter on its door. The game ends, unless a great wyrm of your own rises to meet it.` : s.wyrm.starved > 0 ? 'It flies over the city and burns up to four buildings, then sleeps again. Refused twice running, the next refusal will be its last: it would come for the Founding Stake.' : 'It flies over the city and burns up to four buildings, then sleeps again; spires near it will wake it once more. It remembers refusals in a row: the third brings it down on the Founding Stake.'), apply: (s) => refuse(s) },
    ],
  },
  {
    id: 'wyrm_binding', title: EVENT_TEXT.wyrm_binding.title,
    text: EVENT_TEXT.wyrm_binding.text,
    when: (s) => s.wyrm.state === 'awake' && hasCourt(s) && !s.pendingEvent && (s.wyrm.tributeDay < 0 || s.day < s.wyrm.tributeDay) && (s.wyrm.askedBind < 0 || s.day - s.wyrm.askedBind >= 20),
    choices: [
      { label: EVENT_TEXT.wyrm_binding.choices[0].label, desc: EVENT_TEXT.wyrm_binding.choices[0].desc, apply: (s) => { if (s.educated >= 0.3) return bind(s); s.wyrm.tributeDay = s.day; s.modifiers.push({ kind: 'happiness', value: -4, until: s.day + 10, label: 'Failed binding' }); return 'The song breaks before dawn. The wyrm laughs, if wyrms laugh, and names its price.'; } },
      { label: EVENT_TEXT.wyrm_binding.choices[1].label, desc: EVENT_TEXT.wyrm_binding.choices[1].desc, apply: () => 'The singers practise. The wyrm listens from the ridge.' },
    ],
  },
  {
    id: 'wyrm_sulks', title: EVENT_TEXT.wyrm_sulks.title,
    text: EVENT_TEXT.wyrm_sulks.text,
    when: (s) => s.wyrm.state === 'bound' && s.wyrm.sulking >= 2 && s.wyrm.sulking % 10 === 2 && !s.pendingEvent,
    choices: [
      { label: EVENT_TEXT.wyrm_sulks.choices[0].label, desc: EVENT_TEXT.wyrm_sulks.choices[0].desc!, apply: (s) => { let have = 0; forEachBuilding(s, (b) => { if (BUILDING_BY_KEY[b.kind].zone === Zone.Arcane) have += b.stock; }); if (have < 30) return 'There is not enough leystone in the city. The wyrm sniffs at the empty carts and turns away.'; let left = 60; forEachBuilding(s, (b) => { if (left > 0 && BUILDING_BY_KEY[b.kind].zone === Zone.Arcane && b.stock > 0) { const t = Math.min(b.stock, left); b.stock -= t; left -= t; } }); s.wyrm.sulking = 0; s.wyrm.unfed = 0; return 'It eats the leystone like bread and comes back to its post by the node.'; } },
      { label: EVENT_TEXT.wyrm_sulks.choices[1].label, desc: EVENT_TEXT.wyrm_sulks.choices[1].desc!, apply: (s) => { s.treasury -= 3000; s.wyrm.sulking = 0; s.wyrm.unfed = 0; return 'Forty carts of Belerial bread and beer. The wyrm is content, for now.'; } },
      { label: EVENT_TEXT.wyrm_sulks.choices[2].label, desc: `No ward from its lair until markets feed it ${WYRM_EATS} goods a day. Forty days of sulking and it dies.`, apply: () => 'It does not look at the city. The lanterns at the edge burn alone.' },
    ],
  },
  {
    id: 'egg_vein', title: EVENT_TEXT.egg_vein.title,
    text: EVENT_TEXT.egg_vein.text,
    when: (s) => s.wyrm.state === 'bound' && s.wyrm.sulking === 0 && s.wyrm.fedDays >= 30 && !s.pendingEvent,
    choices: [
      { label: EVENT_TEXT.egg_vein.choices[0].label, desc: EVENT_TEXT.egg_vein.choices[0].desc, apply: (s) => { s.wyrm.fedDays = 0; const d = addEgg(s, 'vein'); if (d) return `The vein egg is carried to the cradle under guard. The tamers call it ${d.name}.`; s.treasury += 6000; return 'No cradle had room. The Crown pays 6,000 crowns and sends a warded coach for it.'; } },
      { label: EVENT_TEXT.egg_vein.choices[1].label, desc: EVENT_TEXT.egg_vein.choices[1].desc, apply: (s) => { s.wyrm.fedDays = 0; s.modifiers.push({ kind: 'happiness', value: 5, until: s.day + 20, label: 'The wyrm is grateful' }); return 'The wyrm curls around it. Folk come to the edge of the lair to hear the two notes together.'; } },
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
    id: 'underking_envoy', title: EVENT_TEXT.underking_envoy.title,
    text: EVENT_TEXT.underking_envoy.text,
    when: (s) => s.faction === 'grimmen' && s.milestone >= 3,
    choices: [
      { label: EVENT_TEXT.underking_envoy.choices[0].label, desc: EVENT_TEXT.underking_envoy.choices[0].desc, apply: (s) => { if (s.treasury < 1500) return 'The purse is too light. The envoy writes it down and goes.'; s.treasury -= 1500; s.modifiers.push({ kind: 'happiness', value: 4, until: s.day + 15, label: 'The deep holds trade' }); return 'The envoy counts it twice and bows once. Deep-hold salt and lamp-oil come up the ramp for a season.'; } },
      { label: EVENT_TEXT.underking_envoy.choices[1].label, desc: EVENT_TEXT.underking_envoy.choices[1].desc, apply: (s) => { const n = takeGoods(s, 30); s.modifiers.push({ kind: 'happiness', value: 2, until: s.day + 10, label: 'The deep holds fed' }); return `${n} goods go down the ramp on the wardens' backs. The envoy says the Underking will remember the weight.`; } },
      { label: EVENT_TEXT.underking_envoy.choices[2].label, desc: EVENT_TEXT.underking_envoy.choices[2].desc, apply: (s) => { s.modifiers.push({ kind: 'happiness', value: -4, until: s.day + 12, label: 'The deep holds shut' }); return 'The envoy does not argue. The deep-hold doors are shut by nightfall, and the Grimmen of the Underhill feel the dark behind them.'; } },
    ],
  },
  {
    id: 'collapse', title: EVENT_TEXT.collapse.title,
    text: EVENT_TEXT.collapse.text,
    when: (s) => s.faction === 'grimmen' && hillBuildings(s).length >= 4,
    choices: [
      { label: EVENT_TEXT.collapse.choices[0].label, desc: EVENT_TEXT.collapse.choices[0].desc, apply: (s) => { if (s.treasury < 600) return 'There is no coin for timber. The crews do what they can with their hands, which is nothing.'; s.treasury -= 600; return 'Timber and prayer. The crack stops at the third prop and the street holds.'; } },
      { label: EVENT_TEXT.collapse.choices[1].label, desc: EVENT_TEXT.collapse.choices[1].desc, apply: (s) => { const rng = rngOf(s); const list = hillBuildings(s).filter((b) => BUILDING_BY_KEY[b.kind].category === 'zone'); if (!list.length) { commitRng(s, rng); s.stats.stoneCut += 2; return 'The gallery falls under empty ground. The cutters carry out the stone and count it.'; } const b = rng.pick(list); commitRng(s, rng); b.state = 'ruin'; b.stateDays = 0; b.residents = 0; b.workers = 0; markDirty(s, b.x, b.y); s.stats.stoneCut += 2; return `The ${BUILDING_BY_KEY[b.kind].name} at (${b.x},${b.y}) goes down into the dark with a sound like a door. The rubble is good stone.`; } },
    ],
  },
  {
    id: 'true_leystone', title: EVENT_TEXT.true_leystone.title, once: true,
    text: EVENT_TEXT.true_leystone.text,
    when: (s) => s.faction === 'grimmen' && s.buildings.some((b) => b && b.kind === 'mine' && b.state === 'ok'),
    choices: [
      { label: EVENT_TEXT.true_leystone.choices[0].label, desc: EVENT_TEXT.true_leystone.choices[0].desc, apply: (s) => { let n = 0; forEachBuilding(s, (b) => { if (b.kind === 'mine' && b.state === 'ok') { b.stock = Math.min(60, b.stock + 30); n++; } }); s.materials.scale += 3; return `${n} mine${n === 1 ? '' : 's'} fill with true leystone. The enchanters will not sleep this week.`; } },
      { label: EVENT_TEXT.true_leystone.choices[1].label, desc: EVENT_TEXT.true_leystone.choices[1].desc, apply: (s) => { s.treasury += 2500; return "The Crown's assessor arrives with a purse and a very long lease. The seam is theirs now, and the crowns are yours."; } },
      { label: EVENT_TEXT.true_leystone.choices[2].label, desc: EVENT_TEXT.true_leystone.choices[2].desc, apply: (s) => { s.stats.trueVeins++; return 'The miners wall the seam up with their own hands. That night every spire in the Underhill burns a shade brighter.'; } },
    ],
  },
];

/** The Veshari's own tales: the eggs of the water lines, and the bargemen. */
function tidePool(s: GameState): Building | undefined {
  return s.buildings.find((b) => b && b.kind === 'tidepool' && b.state === 'ok') ?? undefined;
}
export const VESHARI: EventDef[] = [
  {
    id: 'tide_net', title: EVENT_TEXT.tide_net.title, once: true,
    text: EVENT_TEXT.tide_net.text,
    when: (s) => s.faction === 'veshari' && !!tidePool(s) && s.dragons.length < 6,
    choices: [
      { label: EVENT_TEXT.tide_net.choices[0].label, desc: EVENT_TEXT.tide_net.choices[0].desc, apply: (s) => { const d = addEgg(s, 'tide'); if (d) return `${d.name} is laid in the pool and the fisher gets a landing named after her.`; s.treasury += 2500; return "No pool had room. The Crown's assessor pays 2,500 crowns and the fisher gets a drink."; } },
      { label: EVENT_TEXT.tide_net.choices[1].label, desc: EVENT_TEXT.tide_net.choices[1].desc, apply: (s) => { s.treasury += 2500; return 'The assessor wraps it in wet cloth and rides for Vell-on-Sable. 2,500 crowns.'; } },
      { label: EVENT_TEXT.tide_net.choices[2].label, desc: EVENT_TEXT.tide_net.choices[2].desc, apply: (s) => { s.modifiers.push({ kind: 'happiness', value: 3, until: s.day + 20, label: 'The egg in the net' }); return 'They set it on the pool wall and do not hatch it. Folk come down to the water to look.'; } },
    ],
  },
  {
    id: 'storm_egg', title: EVENT_TEXT.storm_egg.title, once: true,
    text: EVENT_TEXT.storm_egg.text,
    when: (s) => s.faction === 'veshari' && (s.stats.stormWarps > 0 || s.storms.length > 0) && s.dragons.length < 6,
    choices: [
      { label: EVENT_TEXT.storm_egg.choices[0].label, desc: EVENT_TEXT.storm_egg.choices[0].desc, apply: (s) => { const d = addEgg(s, 'storm'); if (d) return `${d.name} is laid in the pool. The water around it crackles for a week.`; s.treasury += 3000; return "No pool had room. The Crown's assessor pays 3,000 crowns and keeps his gloves on."; } },
      { label: EVENT_TEXT.storm_egg.choices[1].label, desc: EVENT_TEXT.storm_egg.choices[1].desc, apply: (s) => { s.treasury += 3000; return 'The assessor pays 3,000 crowns and carries it in a lead box. 3,000 crowns.'; } },
      { label: EVENT_TEXT.storm_egg.choices[2].label, desc: EVENT_TEXT.storm_egg.choices[2].desc, apply: (s) => { const p = tidePool(s); startStorm(s, p ? p.x : s.founding.x, p ? p.y : s.founding.y); return 'The egg splits in the shallows and the sky splits with it. Nobody sees what came out.'; } },
    ],
  },
  {
    id: 'bargemen_strike', title: EVENT_TEXT.bargemen_strike.title,
    text: EVENT_TEXT.bargemen_strike.text,
    when: (s) => s.faction === 'veshari' && moorings(s) >= 4,
    choices: [
      { label: EVENT_TEXT.bargemen_strike.choices[0].label, desc: EVENT_TEXT.bargemen_strike.choices[0].desc, apply: (s) => { s.treasury -= 900; return 'The purse goes round the landings. By dawn the poles are back in the water. 900 crowns.'; } },
      { label: EVENT_TEXT.bargemen_strike.choices[1].label, desc: EVENT_TEXT.bargemen_strike.choices[1].desc, apply: (s) => { s.modifiers.push({ kind: 'barges', value: -1, until: s.day + 8, label: 'The bargemen strike' }); return 'They sit. The river goes on without them, which they find insulting. Eight days later they are back, poorer.'; } },
    ],
  },
];

/** The Tallowkin's tales (iteration 52). */
export const TALLOWKIN: EventDef[] = [
  {
    id: 'wrights_strike', title: EVENT_TEXT.wrights_strike.title,
    text: EVENT_TEXT.wrights_strike.text,
    when: (s) => s.faction === 'tallowkin' && s.buildings.filter((b) => b && b.kind === 'spire' && b.state === 'ok').length >= 4,
    choices: [
      { label: EVENT_TEXT.wrights_strike.choices[0].label, desc: EVENT_TEXT.wrights_strike.choices[0].desc, apply: (s) => { s.treasury -= 700; return 'The purse goes round the lodge. By dawn there is blue chalk on every wall again. 700 crowns.'; } },
      { label: EVENT_TEXT.wrights_strike.choices[1].label, desc: EVENT_TEXT.wrights_strike.choices[1].desc, apply: (s) => { s.modifiers.push({ kind: 'wrights', value: 0.5, until: s.day + 10, label: "The spire-wrights' strike" }); return 'They sit. Whoever sets a shard in the next ten days pays a stranger to do it, and strangers charge.'; } },
    ],
  },
  {
    id: 'surge_wickhouses', title: EVENT_TEXT.surge_wickhouses.title, once: true,
    text: EVENT_TEXT.surge_wickhouses.text,
    when: (s) => s.faction === 'tallowkin' && s.stats.surgesTotal >= 1 && s.buildings.filter((b) => b && b.kind === 'hearth' && b.state === 'ok' && b.lit).length >= 10,
    choices: [
      { label: EVENT_TEXT.surge_wickhouses.choices[0].label, desc: EVENT_TEXT.surge_wickhouses.choices[0].desc, apply: (s) => { s.treasury -= 300; s.modifiers.push({ kind: 'happiness', value: 4, until: s.day + 6, label: 'The candles relit' }); return 'The sextons go door to door with snuffers and new tallow. The city sleeps. 300 crowns.'; } },
      { label: EVENT_TEXT.surge_wickhouses.choices[1].label, desc: EVENT_TEXT.surge_wickhouses.choices[1].desc, apply: (s) => { s.modifiers.push({ kind: 'mana', value: 0.15, until: s.day + 6, label: 'The candles burn blue' }); const lit = s.buildings.filter((b) => b && b.kind === 'hearth' && b.state === 'ok' && b.lit) as Building[]; const rng = rngOf(s); for (let k = 0; k < 2 && lit.length; k++) { const b = lit.splice(rng.int(lit.length), 1)[0]; igniteBuilding(s, b); } commitRng(s, rng); return 'They burn. For six days the ley runs high and blue through every wick; two houses burn with it.'; } },
    ],
  },
  {
    id: 'candle_child', title: EVENT_TEXT.candle_child.title, once: true,
    text: EVENT_TEXT.candle_child.text,
    when: (s) => s.faction === 'tallowkin' && s.milestone >= 3,
    choices: [
      { label: EVENT_TEXT.candle_child.choices[0].label, desc: EVENT_TEXT.candle_child.choices[0].desc, apply: (s) => { s.stats.trueVeins++; return 'She reads. The Veins answer with a flow the spire-wrights have no chalk for. Every node gives ten more, for good.'; } },
      { label: EVENT_TEXT.candle_child.choices[1].label, desc: EVENT_TEXT.candle_child.choices[1].desc, apply: (s) => { s.educatedFloor = Math.min(0.2, s.educatedFloor + 0.02); return 'She reads at the shrine instead, where the words are older and the fire smaller. The children who sit with her learn.'; } },
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
  id: 'riot', title: EVENT_TEXT.riot.title,
  text: EVENT_TEXT.riot.text,
  when: (s) => s.unrestHigh >= RIOT_DAYS,
  choices: [
    { label: EVENT_TEXT.riot.choices[0].label, desc: (s) => { const m = leastWatchedMarket(s); const cov = m ? s.coverage.watch[idx(m.x, m.y)] / 255 : 0; return `The least-watched market${m ? ` at (${m.x},${m.y})` : ''} has watch coverage ${Math.round(cov * 100)} %: at half or more the Watch holds the square (+3 happiness for 5 days); under it the market burns.`; }, apply: (s) => { s.unrestHigh = 0; s.stats.riots++; const m = leastWatchedMarket(s); if (!m) return 'There is no market to riot in. The crowd shouts itself hoarse and goes home.'; const cov = s.coverage.watch[idx(m.x, m.y)] / 255; if (cov >= 0.5) { s.modifiers.push({ kind: 'happiness', value: 3, until: s.day + 5, label: 'The Watch held the square' }); return `The Watch holds the square at (${m.x},${m.y}). By midnight the torches are out and the stalls stand; the city sleeps easier for it.`; } igniteBuilding(s, m, 'The riot fires the'); return `The Watch is too thin at (${m.x},${m.y}): the market burns. Raise a Watch Post where the shelves are, and bring the unrest down.`; } },
    { label: EVENT_TEXT.riot.choices[1].label, desc: EVENT_TEXT.riot.choices[1].desc!, apply: (s) => { s.treasury -= 600; s.unrestHigh = 0; s.stats.riots++; s.modifiers.push({ kind: 'unrest', value: -0.1, until: s.day + 10, label: "The Crown's peace" }); return 'Bread and a reading of the amnesty from the square steps. The torches go out one by one. The crowd remembers the bread.'; } },
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
  id: 'dragon_returns', title: EVENT_TEXT.dragon_returns.title,
  text: EVENT_TEXT.dragon_returns.text,
  when: (s) => dueReturn(s) !== null,
  choices: [
    { label: EVENT_TEXT.dragon_returns.choices[0].label, desc: (s) => { const e = dueReturn(s); return e ? `${RETURN_TRIBUTE * Math.max(1, e.stage)} crowns, or ${RETURN_GOODS * Math.max(1, e.stage)} goods off the market shelves if the purse cannot; it leaves for good.` : 'It leaves for good.'; }, apply: (s) => { const e = dueReturn(s); return e ? payReturn(s, e) : 'Nothing changes.'; } },
    { label: EVENT_TEXT.dragon_returns.choices[1].label, desc: (s) => { const e = dueReturn(s); return e && freeCradle(s, e.line) ? `It comes home a ${STAGE_NAMES[e.stage]}, sullen (mood 40), and eats from the markets again.` : `No cradle takes a ${e ? LINE_INFO[e.line].name : ''} dragon now: refused, it burns.`; }, apply: (s) => { const e = dueReturn(s); if (!e) return 'Nothing changes.'; return homeReturn(s, e) ?? refuseReturn(s, e); } },
    { label: EVENT_TEXT.dragon_returns.choices[2].label, desc: (s) => { const e = dueReturn(s); return `It circles the old cradle all day and sets up to ${e ? Math.max(1, e.stage) : 1} dark, unwarded roof${e && e.stage > 1 ? 's' : ''} within 12 tiles alight.`; }, apply: (s) => { const e = dueReturn(s); return e ? refuseReturn(s, e) : 'Nothing changes.'; } },
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
// ---------------------------------------------------------------- the Heart of Belregi (iteration 69, DESIGN 4.100)

/** One line of the city's record at the gates: what the High Warden has heard, and whether it raises the Pass's trust or lowers it. */
export interface GateDeed { text: string; trust: 1 | -1 }
/** The record of the gates: earlier answers at the gate (the pilgrims, their shrine, the Lantern Fair, the poachers) and the gates in
 *  the wall. The tales of the Heart recite it, and its sum is the Pass's trust. */
export function gateRecord(s: GameState): GateDeed[] {
  const out: GateDeed[] = [];
  if (chose(s, 'pilgrims', 0)) out.push({ text: 'you took in the pilgrims of Aume', trust: 1 });
  if (chose(s, 'pilgrims_shrine', 0)) out.push({ text: 'you raised them a shrine', trust: 1 });
  if (chose(s, 'pilgrims_shrine', 2)) out.push({ text: 'you refused the pilgrims their shrine', trust: -1 });
  if (chose(s, 'lanternfair', 0)) out.push({ text: 'you opened your gates for the Lantern Fair', trust: 1 });
  if (chose(s, 'lanternfair', 1)) out.push({ text: 'you kept your gates shut on the Lantern Fair', trust: -1 });
  if (chose(s, 'egg_poachers', 1)) out.push({ text: 'your Watch took the egg poachers at the gate', trust: 1 });
  if (chose(s, 'egg_poachers', 0)) out.push({ text: 'you bought a poached egg at the gate', trust: -1 });
  const g = gateCounts(s);
  if (g.belregi > g.uzulim) out.push({ text: `your wall has more Belregi gates than Uzulim (${g.belregi} to ${g.uzulim})`, trust: 1 });
  else if (g.uzulim > g.belregi) out.push({ text: `your wall has more Uzulim gates than Belregi (${g.uzulim} to ${g.belregi})`, trust: -1 });
  return out;
}
/** The Pass's trust: the sum of the record. Under zero the Heart wakes cold and gives half. */
export function heartTrust(s: GameState): number {
  return gateRecord(s).reduce((a, d) => a + d.trust, 0);
}
function recite(s: GameState, who = 'She'): string {
  const r = gateRecord(s);
  if (!r.length) return who === 'She' ? 'She has heard nothing of you at the gates, good or ill, and says so.' : `${who} has heard nothing of you at the gates, good or ill.`;
  const good = r.filter((d) => d.trust > 0).map((d) => d.text);
  const ill = r.filter((d) => d.trust < 0).map((d) => d.text);
  const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  const bits: string[] = [];
  if (good.length) bits.push(`${who} has heard that ${list(good)}.`);
  if (ill.length) bits.push(`${who} has ${good.length ? 'also heard' : 'heard'} that ${list(ill)}.`);
  return bits.join(' ');
}
const cold = (s: GameState) => heartTrust(s) < 0;
function heartStep(s: GameState): void {
  s.heart.step++;
  s.heart.day = s.day;
}

export const HEART_EVENTS: EventDef[] = [
  {
    id: 'heart_warden', title: EVENT_TEXT.heart_warden.title,
    // heart.day holds the day the Gate first stood lit until she comes (maybeFireHeart stamps it)
    text: EVENT_TEXT.heart_warden.text,
    when: (s) => s.heart.step === 0 && s.heart.held === 'none' && !!litGreatGate(s) && s.heart.day >= 0 && s.day - s.heart.day >= WARDEN_DAYS,
    choices: [
      { label: EVENT_TEXT.heart_warden.choices[0].label, desc: (s) => `The Gate wards ${GREAT_GATE_REACH_HEART} tiles instead of ${GREAT_GATE_REACH}, and every Belregi gate ${BELREGI_REACH_HEART} instead of ${BELREGI_REACH_GREAT}.${gateCounts(s).uzulim ? ' An Uzulim gate stands in your wall: its wardens will hear of it.' : ''} In the Hush the Heart wakes and asks what you want of it.`, apply: (s) => { s.heart.held = 'set'; heartStep(s); return 'The Heart goes into the keystone of the arch. The runes on every Belregi gate in the wall turn a deeper blue that night.'; } },
      { label: EVENT_TEXT.heart_warden.choices[1].label, desc: `The Heart goes home to the Pass. Twice as many pilgrims of the Pass come each season (${PASS_PILGRIMS * 2} instead of ${PASS_PILGRIMS}), and the Crown's favour rises 5. The Heart still wakes in the Hush, far away, and the Guardians send word.`, apply: (s) => { s.heart.held = 'guardians'; heartStep(s); addFavour(s, 5); return 'The High Warden bows, which the Guardians do not do often. The road to the Pass is busier by the next season.'; } },
      { label: EVENT_TEXT.heart_warden.choices[2].label, desc: EVENT_TEXT.heart_warden.choices[2].desc!, apply: (s) => { s.heart.held = 'sold'; s.heart.step = 3; s.heart.day = s.day; s.treasury += 6000; addFavour(s, 10); return 'The assessor pays in Crown silver and has the box on a cart before dusk. The High Warden leaves by the Gloam road and does not look back. The runes on the Great Gate dim.'; } },
    ],
  },
  {
    id: 'heart_obelisks', title: EVENT_TEXT.heart_obelisks.title,
    text: EVENT_TEXT.heart_obelisks.text,
    when: (s) => s.heart.step === 1 && s.heart.held === 'set' && gateCounts(s).uzulim > 0 && !!litGreatGate(s) && s.day - s.heart.day >= HEART_STEP_DAYS,
    choices: [
      { label: EVENT_TEXT.heart_obelisks.choices[0].label, desc: EVENT_TEXT.heart_obelisks.choices[0].desc!, apply: (s) => { heartStep(s); s.modifiers.push({ kind: 'unrest', value: 0.05, until: s.day + 15, label: 'The Uzulim refused' }); return 'The wardens leave without a word. The crimson symbols on your Uzulim gates burn a little brighter, and the streets near them are quarrelsome.'; } },
      { label: EVENT_TEXT.heart_obelisks.choices[1].label, desc: `A sliver of the Heart goes into each Uzulim gate: the Great Gate wards ${GREAT_GATE_REACH} tiles again and the Belregi gates ${BELREGI_REACH_GREAT}, but the Uzulim gates stop adding unrest while the Great Gate stands.`, apply: (s) => { s.heart.held = 'shared'; heartStep(s); return 'The Heart is cut on the Stake\'s anvil by a Grimmen smith who will not say how. The obelisks hum in a lower key; folk near them sleep better.'; } },
      { label: EVENT_TEXT.heart_obelisks.choices[2].label, desc: EVENT_TEXT.heart_obelisks.choices[2].desc!, apply: (s) => { heartStep(s); s.treasury -= 2500; return 'The wardens count it twice and go. Nobody thinks it is over.'; } },
    ],
  },
  {
    id: 'heart_wakes', title: EVENT_TEXT.heart_wakes.title,
    text: EVENT_TEXT.heart_wakes.text,
    when: (s) => s.heart.step === 2 && (s.heart.held === 'set' || s.heart.held === 'shared' || s.heart.held === 'guardians') && seasonOf(s) === 3 && !!greatGateOf(s) && s.day - s.heart.day >= HEART_STEP_DAYS,
    choices: [
      { label: EVENT_TEXT.heart_wakes.choices[0].label, desc: (s) => `The Gloam is cleared within ${cold(s) ? Math.round(HEART_GLOAM_REACH / 2) : HEART_GLOAM_REACH} tiles of the Great Gate${cold(s) ? ' (the Heart is cold: half the reach)' : ''}.`, apply: (s) => { const g = greatGateOf(s); heartStep(s); if (!g) return 'The Gate is gone; the Heart has nothing to answer through.'; const r = cold(s) ? Math.round(HEART_GLOAM_REACH / 2) : HEART_GLOAM_REACH; const cx = g.x + 1; const cy = g.y + 1; let n = 0; for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) { if (!inBounds(x, y) || Math.hypot(x - cx, y - cy) > r) continue; const i = idx(x, y); if (s.gloam[i]) { s.gloam[i] = 0; n++; markDirty(s, x, y); } } s.stats.gloamBurned += n; if (n) recomputeGloamDist(s); return n ? `A blue wind goes out from the arch at midnight. By dawn ${n} tiles of grey grass are green again.` : 'A blue wind goes out from the arch at midnight and finds no grey to burn. The Heart seems pleased anyway.'; } },
      { label: EVENT_TEXT.heart_wakes.choices[1].label, desc: (s) => `Rain over the city for ${cold(s) ? 5 : 10} days and goods +${cold(s) ? 10 : 20} % for 30${cold(s) ? ' (the Heart is cold: half)' : ''}.`, apply: (s) => { const h = cold(s) ? 0.5 : 1; heartStep(s); s.modifiers.push({ kind: 'rain', value: 1, until: s.day + 10 * h, label: 'The Heart\'s rain' }); s.modifiers.push({ kind: 'goods', value: 0.2 * h, until: s.day + 30, label: 'The Heart\'s harvest' }); return 'Rain in the Hush, warm as Bloom. The herb yards do not know what season it is and do not care.'; } },
      { label: EVENT_TEXT.heart_wakes.choices[2].label, desc: (s) => `The Guardians name ${s.cityName} a friend of the Pass: happiness +${cold(s) ? 2 : 3} for 60 days${cold(s) ? ' (the Heart is cold: less)' : ''}.`, apply: (s) => { heartStep(s); s.modifiers.push({ kind: 'happiness', value: cold(s) ? 2 : 3, until: s.day + 60, label: 'A friend of the Pass' }); return 'The Heart goes back to sleep. The High Warden writes, in a hand like a carved rune, that it has not been asked for nothing in three hundred years.'; } },
    ],
  },
];
/** The tale's text for this city: the High Warden recites the record, the waking says how warm the Heart is. */
function heartText(s: GameState, e: EventDef): string {
  if (e.id === 'heart_warden') return `${e.text} ${recite(s)} "The Heart goes where it is kept well," she says. "Tell me where it goes."`;
  if (e.id === 'heart_obelisks') return `${e.text} ${gateCounts(s).uzulim === 1 ? 'Your Uzulim gate is' : `Your ${gateCounts(s).uzulim} Uzulim gates are`} the proof of it, they say, and they want their share.`;
  if (e.id === 'heart_wakes') {
    const where = s.heart.held === 'guardians' ? 'The Guardians send word from the Pass: the Heart woke there, and it asked after the city that sent it home.' : 'The keystone of the Great Gate is warm to the touch, and the runes beat like a slow heart.';
    const t = heartTrust(s);
    const warmth = t < 0 ? 'It is cold toward you: what it gives, it gives by half.' : t >= 2 ? 'It is warm toward you.' : 'It is neither warm nor cold toward you.';
    return `${e.text} ${where} ${recite(s, 'The Pass')} ${warmth}`;
  }
  return e.text;
}
/** The Heart's tales fire on their own terms, with no draw: a city without a Great Gate never meets them. A Heart set in a city with
 *  no Uzulim gate skips the obelisks, and a Heart the Guardians keep goes straight to the waking. */
export function maybeFireHeart(s: GameState): void {
  if (s.pendingEvent || s.gameOver || s.heart.step >= 3 || !greatGateOf(s)) return;
  if (s.heart.step === 0 && s.heart.day < 0 && litGreatGate(s)) s.heart.day = s.day; // the day the Gate first stood lit: the Warden comes ten days on
  if (s.heart.step === 1 && s.day - s.heart.day >= HEART_STEP_DAYS && (s.heart.held === 'guardians' || (s.heart.held === 'set' && gateCounts(s).uzulim === 0))) s.heart.step = 2; // no tale between: the waking counts its days from the Warden
  for (const e of HEART_EVENTS) {
    if (!e.when(s)) continue;
    s.pendingEvent = { id: e.id, title: e.title, text: heartText(s, e), choices: e.choices.map((c) => ({ label: c.label, desc: descOf(c, s) })) };
    s.firedEvents.push(`${e.id}:?`);
    return;
  }
}
/** Pilgrims of the Pass, on the 15th of each season: up to 12 (24 with the Guardians) lodge in empty homes and pay alms. */
export function dailyGatePilgrims(s: GameState): void {
  if (s.day % 30 !== PASS_PILGRIM_DAY) return;
  const n = passPilgrims(s);
  if (n <= 0) return;
  const lodged = addResidents(s, n);
  const alms = lodged * PASS_ALMS;
  s.treasury += alms;
  s.stats.gatePilgrims += lodged;
  s.stats.gateAlms += alms;
  pushMessage(s, lodged ? `Pilgrims of the Pass come through the Great Gate: ${lodged} lodge in ${s.cityName}'s empty homes and pay ${alms} crowns in alms.` : 'Pilgrims of the Pass come through the Great Gate, find no empty home, pray at the arch and walk on.', 'good');
}
/** The merchant's memory (iteration 73): the egg on offer is sky the first time, storm the second, ember after. */
export function merchantEgg(s: GameState): DragonLine {
  return s.merchant.eggs === 0 ? 'sky' : s.merchant.eggs === 1 ? 'storm' : 'ember';
}
/** A tenth off for each egg bought before, down to half. */
export function merchantPrice(s: GameState, base: number): number {
  return Math.round(base * Math.max(0.5, 1 - 0.1 * s.merchant.eggs));
}
function merchantVisit(s: GameState): void {
  s.merchant.visits++;
}

export const ALL_EVENTS: EventDef[] = [...EVENTS, ...CHAINS, ...EGGS, ...VISITORS, ...CROWN, ...GRIMMEN, ...VESHARI, ...TALLOWKIN, ...CALENDAR, ...WYRM_EVENTS, ...COUNCIL_EVENTS, ...HEART_EVENTS, RIOT, DRAGON_RETURNS];

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
    s.pendingEvent = { id: e.id, title: e.title, text: textOf(e, s), choices: e.choices.map((c) => ({ label: c.label, desc: descOf(c, s) })) };
    s.firedEvents.push(`${tag}:?`);
    s.lastEventDay = s.day;
    return;
  }
}

/** Wyrm events fire on their own terms (no random draw, no 18-day spacing). */
export function maybeFireWyrm(s: GameState): void {
  if (s.pendingEvent || s.gameOver) return;
  for (const e of WYRM_EVENTS) {
    if (s.wyrm.state === 'none' && e.id !== 'airship_tale' && e.id !== 'wyvern_tale') continue; // the captain's story and the wyvern's need no wyrm
    if (!e.when(s)) continue;
    if (e.id === 'wyrm_binding') s.wyrm.askedBind = s.day;
    // the third asking after two refusals is the last (iteration 70)
    const last = e.id === 'wyrm_tribute' && s.wyrm.starved >= WYRM_STARVE_LIMIT - 1;
    s.pendingEvent = { id: e.id, title: last ? "The wyrm's last asking" : e.title, text: last ? `${e.text} It has been refused ${s.wyrm.starved} times running. The keeper is pale: this time it is not asking for coin so much as for a reason not to come down on the Founding Stake.` : e.text, choices: e.choices.map((c) => ({ label: c.label, desc: descOf(c, s) })) };
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
  s.pendingEvent = { id: e.id, title: e.title, text: textOf(e, s), choices: e.choices.map((c) => ({ label: c.label, desc: descOf(c, s), slider: c.slider })) };
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
    s.pendingEvent = { id: e.id, title: e.title, text: textOf(e, s), choices: e.choices.map((c) => ({ label: c.label, desc: descOf(c, s) })) };
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
  const before = s.treasury;
  const result = asked > 0 && asked > s.treasury ? `the purse is too light: ${asked} crowns asked, ${Math.round(s.treasury)} in the chest. Nothing changes.` : c.apply(s, amount);
  // the caravan's take goes in the books: the Annals, the Budget's row and the day's line of the ledger history (iteration 63: it was counted
  // nowhere, and iteration 61 judged the depot by its 8 goods a day when the caravan paid it ten times its upkeep)
  if (def.id === 'caravan') {
    const take = Math.max(0, Math.round(s.treasury - before));
    s.stats.caravanCrowns += take;
    s.stats.lastCaravanCrowns = take;
    if (take > 0 && s.ledgerHistory.length) s.ledgerHistory[s.ledgerHistory.length - 1] += take;
  }
  pushMessage(s, `${pe.title}: ${result}`, 'milestone');
}
