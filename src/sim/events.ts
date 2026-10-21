/** Story events with choices. Fired every ~18-30 days when their condition holds; the game pauses until answered. */
import { BUILDING_BY_KEY, isDepot } from './catalog';
import { bodyOf, ensureShoals, shoalCap } from './water';
import { factionOf } from '../data/factions';
import { DISTRICT_NAMES, Terrain, Zone, type Building, type GameState } from './types';
import { COUNCIL_EVENTS } from './guilds';
import { hasAcademy } from './relics';
import { canPlaceBuilding, commitRng, forEachBuilding, illTiding, placeBuildingRaw, pushMessage, rngOf, seasonOf } from './world';
import { addFavour } from './economy';
import { Rng, hashString } from '../core/rng';
import { capacityOf } from './growth';
import { spawnRestless } from './agents';
import { districtName, markDirty } from './world';
import { MAP_W, inBounds, idx } from './types';
import { igniteBuilding, recomputeGloamDist } from './hazards';
import { RIOT_UNREST } from './growth';
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
      { label: EVENT_TEXT.cloud_wizard.choices[0].label, desc: EVENT_TEXT.cloud_wizard.choices[0].desc, apply: (s) => { const f = s.founding; let n = 0; const rng = rngOf(s); for (let tries = 0; tries < 200 && n < 12; tries++) { const x = f.x + rng.int(17) - 8; const y = f.y + rng.int(17) - 8; if (!inBounds(x, y)) continue; const i = idx(x, y); if (s.terrain[i] !== Terrain.Grass && s.terrain[i] !== Terrain.Meadow) continue; if (s.bIndex[i] >= 0 || s.road[i] || s.zone[i]) continue; s.terrain[i] = Terrain.Forest; markDirty(s, x, y); n++; } commitRng(s, rng); s.modifiers.push({ kind: 'happiness', value: 4, until: s.day + 30, label: 'The glimwood grove' }); return `${n} glimwood saplings, waist-high by morning and glowing by the next night.`; } },
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
    when: (s) => s.buildings.some((b) => b && isDepot(b.kind) && b.state === 'ok') && s.milestone >= 3,
    choices: [
      { label: EVENT_TEXT.caravan.choices[0].label, desc: (s) => `Sell every works' surplus above 10 goods at 1.5x the season price (${caravanSurplus(s)} goods on the shelves now).`, apply: (s) => { let sold = 0; for (const b of s.buildings) { if (!b || b.state !== 'ok') continue; const def = BUILDING_BY_KEY[b.kind]; if (def.zone === Zone.Craft && b.stock > 10) { const n = b.stock - 10; b.stock = 10; sold += n; } } sold = Math.round(sold); const crowns = Math.round(sold * s.trade.priceGoods * 1.5); s.treasury += crowns; s.stats.caravanGoods += sold; return sold > 0 ? `${sold} goods change hands for ${crowns} crowns. The riders pay in Belerial gold, which the guild weighs twice.` : 'The works have nothing to spare above ten goods a shelf. The riders buy bread and water the striders.'; } },
      { label: EVENT_TEXT.caravan.choices[1].label, desc: EVENT_TEXT.caravan.choices[1].desc!, apply: () => 'The riders trade the news of the plains over a cup and buy nothing. (The rare goods they once bought are parked with the dragons.)' },
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
      if (!m.visits) return EVENT_TEXT.merchant.text;
      const bought = m.spent ? 'seeds and salts' : 'nothing yet';
      return `The wagon is back, for the ${['second', 'third', 'fourth', 'fifth'][Math.min(3, m.visits - 1)]} time. The merchant remembers: ${m.visits} visit${m.visits === 1 ? '' : 's'}, ${m.spent.toLocaleString()} crowns, ${bought}${m.talks >= 2 ? ', and the stories you traded instead of coin. She says she owes you one' : m.talks ? ', and one evening of stories' : ''}.`;
    },
    when: (s) => s.buildings.some((b) => b && isDepot(b.kind) && b.state === 'ok') && s.milestone >= 5 && s.day - s.lastEventDay >= 10,
    choices: [
      { label: EVENT_TEXT.merchant.choices[0].label, desc: EVENT_TEXT.merchant.choices[0].desc!, apply: (s) => { merchantVisit(s); return 'The basket is empty this season: the merchant sold her last egg two wardlights back. She shows you the feathers instead.'; } },
      { label: EVENT_TEXT.merchant.choices[1].label, desc: (s) => `Goods production +20% for 30 days: ${merchantPrice(s, 1200).toLocaleString()} crowns.`, apply: (s) => { const price = merchantPrice(s, 1200); if (s.treasury < price) return 'Not enough crowns.'; s.treasury -= price; s.merchant.spent += price; merchantVisit(s); s.modifiers.push({ kind: 'goods', value: 0.2, until: s.day + 30, label: 'Longwood seeds' }); return 'The seeds sprout overnight in the herb yards, which the alchemists find rude.'; } },
      { label: EVENT_TEXT.merchant.choices[2].label, desc: (s) => `Unquieted dead −30; health +10 for 15 days: ${merchantPrice(s, 600).toLocaleString()} crowns.`, apply: (s) => { const price = merchantPrice(s, 600); if (s.treasury < price) return 'Not enough crowns.'; s.treasury -= price; s.merchant.spent += price; merchantVisit(s); s.unquieted = Math.max(0, s.unquieted - 30); s.modifiers.push({ kind: 'health', value: 0.1, until: s.day + 15, label: 'Ulum salts' }); return 'Salt on every lip in the boneyard, and a cleaner cough in the low streets. The merchant counts it twice and writes your name in a book.'; } },
      { label: EVENT_TEXT.merchant.choices[3].label, desc: EVENT_TEXT.merchant.choices[3].desc!, apply: (s) => { s.merchant.talks++; merchantVisit(s); return 'You trade stories: the Gates, the storm caller, a fox that was a man. The merchant leaves at dawn.'; } },
      { label: EVENT_TEXT.merchant.choices[4].label, desc: (s) => (s.merchant.talks >= 2 ? `Owed for ${s.merchant.talks} evenings of stories: Longwood seeds for nothing (goods +20% for 30 days).` : `Not yet owed: two evenings of stories first (${s.merchant.talks} so far).`), apply: (s) => { if (s.merchant.talks < 2) { merchantVisit(s); return 'The merchant laughs. "One evening is not a debt." The wagon rolls on.'; } s.merchant.talks = 0; merchantVisit(s); s.modifiers.push({ kind: 'goods', value: 0.2, until: s.day + 30, label: 'Longwood seeds (a favour)' }); return 'She hands the seed-bag over without a word about price, and says the stories were worth more.'; } },
    ],
  },
];

/** The airship captain's story fires on its own condition, before the random draw (the wyrm's tales are parked, scope reset phase 1b). */
export const AIRSHIP_EVENTS: EventDef[] = [
  {
    id: 'airship_tale', title: EVENT_TEXT.airship_tale.title,
    text: EVENT_TEXT.airship_tale.text,
    when: (s) => s.airship.tale > 0 && !s.pendingEvent,
    choices: [
      { label: EVENT_TEXT.airship_tale.choices[0].label, desc: EVENT_TEXT.airship_tale.choices[0].desc, apply: (s) => { s.airship.tale = 0; s.modifiers.push({ kind: 'goods', value: 0.1, until: s.day + 15, label: 'Foreign reagents' }); return 'Crates of foreign reagents and a jar of dust that hums. The alchemists close the shutters for a week.'; } },
      { label: EVENT_TEXT.airship_tale.choices[1].label, desc: EVENT_TEXT.airship_tale.choices[1].desc, apply: (s) => { s.airship.tale = 0; return `${addResidents(s, 30)} folk step off the gondola with everything they own and a letter of introduction.`; } },
      { label: EVENT_TEXT.airship_tale.choices[2].label, desc: EVENT_TEXT.airship_tale.choices[2].desc, apply: (s) => { s.airship.tale = 0; s.modifiers.push({ kind: 'happiness', value: 5, until: s.day + 20, label: "The captain's story" }); return 'She tells it on the square at dusk. Nobody goes home until the spires dim.'; } },
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

/** The merchant's price (her tenth off for each egg bought went with the eggs, scope reset phase 1b). */
export function merchantPrice(s: GameState, base: number): number {
  void s;
  return base;
}
function merchantVisit(s: GameState): void {
  s.merchant.visits++;
}

export const ALL_EVENTS: EventDef[] = [...EVENTS, ...CHAINS, ...VISITORS, ...CROWN, ...CALENDAR, ...AIRSHIP_EVENTS, ...COUNCIL_EVENTS, RIOT];

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

/** The airship's tale fires on its own terms (no random draw, no 18-day spacing). */
export function maybeFireAirship(s: GameState): void {
  if (s.pendingEvent || s.gameOver) return;
  for (const e of AIRSHIP_EVENTS) {
    if (!e.when(s)) continue;
    s.pendingEvent = { id: e.id, title: e.title, text: e.text, choices: e.choices.map((c) => ({ label: c.label, desc: descOf(c, s) })) };
    s.firedEvents.push(`${e.id}:?`);
    return;
  }
}

/** The Belerial caravan keeps a rhythm of its own: every CARAVAN_EVERY days at a standing depot, the first half a rhythm after the depot opens. */
export const CARAVAN_EVERY = 12;
export function hasDepot(s: GameState): boolean {
  return s.milestone >= 3 && s.buildings.some((b) => b && isDepot(b.kind) && b.state === 'ok');
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
  const pool = [...EVENTS, ...CHAINS, ...VISITORS, ...CROWN].filter((e) => e.id !== 'caravan' && e.when(s) && !recent.includes(e.id) && !(e.once && fired(e.id)));
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
