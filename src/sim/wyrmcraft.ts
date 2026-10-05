/**
 * Wyrmcraft: dragons raised from eggs in a Wyrm-Cradle. Egg -> hatchling -> drake -> wyvern (-> wyrm for a trueblood).
 * Iteration 53 (M14 part 3) gave the cradle a ceiling (the Great Cradle, lodge seats, a feeding reach), hunger a price
 * (a stage lost at ten days, a dragon that returns wild), roles a cost and the bout its odds. See DESIGN.md 8.6 and 4.84.
 */
import { aspectAt } from './weave';
import { BUILDING_BY_KEY } from './catalog';
import { AgentKind, DAYS_PER_SEASON, TICKS_PER_DAY, Zone, idx, type Building, type DepartedDragon, type Dragon, type DragonLine, type DragonRole, type GameState, type Training } from './types';
import { commitRng, forEachBuilding, illTiding, markDirty, pushMessage, rngOf } from './world';
import type { Rng } from '../core/rng';
import { marketStockCap } from './agents';
import { edictOn } from './edicts';
import { gloamAtDoor, igniteBuilding } from './hazards';
import { milestonesOf } from '../data/factions';

export const STAGE_NAMES = ['egg', 'hatchling', 'drake', 'wyvern', 'wyrm'];
export const STAGE_DAYS = [30, 20, 40, 60, 120];
export const MAX_STAGE_NOW = 3; // wyvern for winged lines; wyrm stage waits
export const WINGED: DragonLine[] = ['ember', 'vein', 'sky', 'storm'];
export function maxStage(line: DragonLine): number {
  return WINGED.includes(line) ? 3 : 2;
}
/** The stage a dragon can reach: its line's, or the wyrm stage for a trueblood. */
export function stageCap(d: Dragon): number {
  return d.trueblood ? 4 : Math.min(MAX_STAGE_NOW, maxStage(d.line));
}
export const WYRM_EATS_GOODS = 20;
/** A cradle feeds from markets this near (iteration 53); a warden eats from its district instead. */
export const FEED_REACH = 12;
/** A Tamer's Lodge within LODGE_REACH of a cradle seats this many dragons. */
export const LODGE_SEATS = 4;
export const LODGE_REACH = 10;
/** Unfed this many days, a drake or older loses a stage; its mood falls HUNGER_MOOD a day meanwhile. */
export const REGRESS_AFTER = 10;
export const HUNGER_MOOD = 6;
/** The Great Cradle: four slots, four more mana, raised at the people's sixth milestone. */
export const GREAT_CRADLE_COST = 4000;
export const GREAT_CRADLE_MANA = 4;
export const GREAT_CRADLE_MILESTONE = 6;
/** An egg in a nest lined with eggshell warms this much faster. */
export const EGGSHELL_HATCH = 1.25;
/** Wyrmfire burned a day for the Craft bonus (the city toggle) and by each lit Forge. */
export const WYRMFIRE_BURN = 0.05;
export const FORGE_BURN = 0.1;
/** The Scale-Mail edict: scale a day, and the unrest it takes off. */
export const SCALEMAIL_PER_DAY = 0.05;
export const SCALEMAIL_UNREST = 0.05;
/** A returned dragon's tribute: crowns, or goods when the purse cannot, times its stage. */
export const RETURN_TRIBUTE = 500;
export const RETURN_GOODS = 60;
export const RETURN_FIRES_REACH = 12;
export const LINE_INFO: Record<DragonLine, { name: string; scale: number; desc: string }> = {
  ember: { name: 'Ember', scale: 6, desc: 'brick red, breathes wyrmfire; a delver warms the seams' },
  bone: { name: 'Bone', scale: 8, desc: 'ivory over black; the restless lie down near it' },
  glim: { name: 'Glim', scale: 3, desc: 'tiny and gold; lights a street like a lantern-way' },
  vein: { name: 'Vein', scale: 10, desc: 'ley-blue with runes; roosts on a Nexus' },
  sky: { name: 'Sky', scale: 5, desc: 'white and silver; the fastest courier' },
  grey: { name: 'Grey', scale: 9, desc: 'ash and stone; the Gloam parts around it' },
  tide: { name: 'Tide', scale: 6, desc: 'teal and finned; swims the river' },
  storm: { name: 'Storm', scale: 7, desc: 'violet with lightning; eats weather' },
  fen: { name: 'Fen', scale: 4, desc: 'a cat-dragon of the Fen-Nex, russet and clever; a warden that hounds cannot see' },
};
const NAMES = ['Ashvel', 'Tammet', 'Orrin', 'Sablewick', 'Morrowlight', 'Pell', 'Vessa', 'Glimmer', 'Cinder', 'Ossa', 'Hollow', 'Brightscale', 'Quiet', 'Ember-of-Vell', 'Wick', 'Thrum'];

/** Buildings that hold dragons: the Vellish Wyrm-Cradle, the Grimmen Hatchery, the Veshari Tide Pool. */
export const CRADLE_KINDS = ['cradle', 'hatchery', 'tidepool'];
/** A people's cradle takes only its lines; a kind not listed takes any. */
export const CRADLE_LINES: Partial<Record<string, DragonLine[]>> = { hatchery: ['bone', 'grey', 'ember'], tidepool: ['tide', 'storm', 'glim'] };
export function isCradle(kind: string): boolean {
  return CRADLE_KINDS.includes(kind);
}
export function cradleAccepts(b: Building, line?: DragonLine): boolean {
  if (!isCradle(b.kind)) return false;
  const lines = CRADLE_LINES[b.kind];
  return !lines || !line || lines.includes(line);
}
/** Two slots; four for a Great Cradle (level 2). */
export function cradleCapacity(b: Building): number {
  return isCradle(b.kind) ? (b.level >= 2 ? 4 : 2) : 0;
}
export function isGreatCradle(b: Building): boolean {
  return isCradle(b.kind) && b.level >= 2;
}
/** Raise a cradle to a Great Cradle: four slots, four more mana. The reason it cannot be, or null. */
export function raiseCradle(state: GameState, id: number): string | null {
  const b = state.buildings.find((x) => x && x.id === id);
  if (!b || !isCradle(b.kind)) return 'No cradle here';
  if (b.level >= 2) return 'Already a Great Cradle';
  if (b.state !== 'ok') return 'Finish it first';
  if (state.milestone < GREAT_CRADLE_MILESTONE) return `A Great Cradle is raised at ${milestonesOf(state)[GREAT_CRADLE_MILESTONE].name}`;
  if (state.treasury < GREAT_CRADLE_COST) return `Needs ${GREAT_CRADLE_COST} crowns`;
  state.treasury -= GREAT_CRADLE_COST;
  b.level = 2;
  markDirty(state, b.x, b.y);
  pushMessage(state, `The ${BUILDING_BY_KEY[b.kind].name} at (${b.x},${b.y}) is raised to a Great Cradle: four nests in the spiral, and the ley hums ${GREAT_CRADLE_MANA} deeper for it.`, 'milestone', true, { x: b.x, y: b.y });
  return null;
}

export function dragonsIn(state: GameState, cradleId: number): Dragon[] {
  return state.dragons.filter((d) => d.cradleId === cradleId);
}

/** A cradle with a free slot, or null. */
export function freeCradle(state: GameState, line?: DragonLine): Building | null {
  let found: Building | null = null;
  forEachBuilding(state, (b) => {
    if (found || !cradleAccepts(b, line) || b.state !== 'ok') return;
    if (dragonsIn(state, b.id).length < cradleCapacity(b)) found = b;
  });
  return found;
}

export function addEgg(state: GameState, line: DragonLine): Dragon | null {
  const cradle = freeCradle(state, line);
  if (!cradle) return null;
  const rng = rngOf(state);
  const d: Dragon = {
    id: state.nextDragonId++,
    name: rng.pick(NAMES),
    line,
    stage: 0,
    days: 0,
    cradleId: cradle.id,
    role: 'none',
    roleTarget: -1,
    mood: 70,
    hungry: 0,
    training: 'gentle',
    agentId: -1,
    born: state.day,
  };
  commitRng(state, rng);
  state.dragons.push(d);
  return d;
}

export function setTraining(state: GameState, id: number, t: Training): void {
  const d = state.dragons.find((x) => x.id === id);
  if (d) d.training = t;
}

export function setRole(state: GameState, id: number, role: DragonRole, target = -1): string | null {
  const d = state.dragons.find((x) => x.id === id);
  if (!d) return 'No such dragon';
  if (d.stage < 2) return 'Only a drake or older can take a role';
  if (d.voyage !== undefined) return 'It is away beyond the Gloam on the Sky-Dock\'s run';
  if (role === 'mount' && !state.buildings.some((b) => b && b.kind === 'wyrmcourt' && b.state === 'ok')) return 'Raise a Wyrm-Court first: a mount is raised at the Court';
  if (role === 'courier' && d.stage < 3) return 'Only a wyvern can fly goods';
  if (role === 'champion' && !state.buildings.some((b) => b && b.kind === 'ring' && b.state === 'ok')) return 'Build a Wyrm-Ring first';
  if (role === 'delver') {
    const mine = state.buildings.find((b) => b && b.id === target && b.kind === 'mine');
    if (!mine) return 'Pick a Crystal Mine';
  }
  if (role === 'warden' && target <= 0) return 'Pick a district';
  d.role = role;
  d.roleTarget = target;
  return null;
}

/** Line an egg's nest with eggshell: it warms a quarter faster. The reason it cannot be, or null. */
export function lineNest(state: GameState, id: number): string | null {
  const d = state.dragons.find((x) => x.id === id);
  if (!d) return 'No such egg';
  if (d.stage !== 0) return 'Only an egg takes a lining';
  if (d.lined) return 'Already lined';
  if (state.materials.eggshell < 1) return 'Needs 1 eggshell';
  state.materials.eggshell -= 1;
  d.lined = true;
  return null;
}

/** The lodge seats: every Tamer's Lodge within LODGE_REACH of a cradle seats LODGE_SEATS dragons, filled in dragon-id order. */
export function lodgeSeats(state: GameState): Map<number, Building | null> {
  const lodges: { b: Building; left: number }[] = [];
  forEachBuilding(state, (b) => { if (b.kind === 'tamerslodge' && b.state === 'ok') lodges.push({ b, left: LODGE_SEATS }); });
  const out = new Map<number, Building | null>();
  const sorted = [...state.dragons].filter((d) => d.stage >= 1).sort((a, b) => a.id - b.id);
  for (const d of sorted) {
    const cradle = state.buildings.find((b) => b && b.id === d.cradleId);
    let seat: Building | null = null;
    if (cradle) {
      for (const l of lodges) {
        if (l.left <= 0 || Math.hypot(l.b.x - cradle.x, l.b.y - cradle.y) > LODGE_REACH) continue;
        l.left--;
        seat = l.b;
        break;
      }
    }
    out.set(d.id, seat);
  }
  return out;
}
/** Lodges within reach of a cradle, and the dragons they would have to seat. */
export function lodgesFor(state: GameState, cradle: Building): Building[] {
  const out: Building[] = [];
  forEachBuilding(state, (b) => { if (b.kind === 'tamerslodge' && b.state === 'ok' && Math.hypot(b.x - cradle.x, b.y - cradle.y) <= LODGE_REACH) out.push(b); });
  return out;
}

/** Markets a cradle can feed from: within FEED_REACH of it. */
export function marketsInReach(state: GameState, cradle: Building): Building[] {
  const out: Building[] = [];
  forEachBuilding(state, (b) => {
    if (BUILDING_BY_KEY[b.kind].zone !== Zone.Market || b.state !== 'ok') return;
    if (Math.hypot(b.x - cradle.x, b.y - cradle.y) <= FEED_REACH) out.push(b);
  });
  return out;
}
/** Markets a warden eats from: those of its district. */
export function districtMarkets(state: GameState, district: number): Building[] {
  const out: Building[] = [];
  forEachBuilding(state, (b) => {
    if (BUILDING_BY_KEY[b.kind].zone !== Zone.Market || b.state !== 'ok') return;
    if (state.district[idx(b.x, b.y)] === district) out.push(b);
  });
  return out;
}
/** The markets that feed this dragon today. */
export function feedingMarkets(state: GameState, d: Dragon, cradle: Building): Building[] {
  return d.role === 'warden' && d.roleTarget > 0 ? districtMarkets(state, d.roleTarget) : marketsInReach(state, cradle);
}

/** Feed from the nearest stocked market within reach (a warden: of its district): returns true if fed. */
function feed(state: GameState, d: Dragon, cradle: Building, amount: number): boolean {
  let best: Building | null = null;
  let bd = Infinity;
  for (const b of feedingMarkets(state, d, cradle)) {
    if (b.stock < amount) continue;
    const dist = Math.hypot(b.x - cradle.x, b.y - cradle.y);
    if (dist < bd) {
      bd = dist;
      best = b;
    }
  }
  if (!best) return false;
  (best as Building).stock -= amount;
  return true;
}

/** How much a dragon eats a day by stage. */
export function eats(d: Dragon): number {
  return d.stage === 1 ? 6 : d.stage === 2 ? 10 : d.stage >= 4 ? WYRM_EATS_GOODS : 14;
}

/** A dragon leaves the city: remembered in state.departed so it can return after a season. */
function depart(state: GameState, d: Dragon, cradle: Building | null): void {
  state.departed.push({ name: d.name, line: d.line, stage: d.stage, day: state.day, x: cradle ? cradle.x : state.founding.x, y: cradle ? cradle.y : state.founding.y, returned: false });
}

/** The eggs go grey (iteration 73): a cradle with the Gloam at its door counts the days; at GREY_EGG_DAYS every egg in it turns to the
 *  grey line, the chosen line lost. Hatchlings and older are not touched. The count resets when the Gloam is cut back. No rng. */
export const GREY_EGG_DAYS = 3;
export function dailyGreyEggs(state: GameState): void {
  forEachBuilding(state, (c) => {
    if (!isCradle(c.kind) || c.state !== 'ok') return;
    if (!gloamAtDoor(state, c)) { if (c.grey) c.grey = 0; return; }
    c.grey = (c.grey ?? 0) + 1;
    const eggs = state.dragons.filter((d) => d.cradleId === c.id && d.stage === 0 && d.line !== 'grey');
    if (!eggs.length) return;
    if (c.grey < GREY_EGG_DAYS) {
      if (c.grey === 1) pushMessage(state, `The Gloam stands at the door of the cradle at (${c.x},${c.y}) and the ${eggs.length === 1 ? 'egg in it is' : `${eggs.length} eggs in it are`} greying. Cut it back: ${GREY_EGG_DAYS} days and they turn.`, 'warn', true, { x: c.x, y: c.y });
      return;
    }
    for (const d of eggs) { d.line = 'grey'; delete d.second; delete d.trueblood; }
    state.stats.eggsGreyed += eggs.length;
    illTiding(state);
    pushMessage(state, `The ${eggs.length === 1 ? 'egg' : `${eggs.length} eggs`} in the cradle at (${c.x},${c.y}) ${eggs.length === 1 ? 'has' : 'have'} gone grey: ash-grey, half stone, cracked like a statue. What hatches will be of the Grey line, and the Gloam will part for it.`, 'bad', true, { x: c.x, y: c.y });
  });
}

/** Daily dragon upkeep: warmth, food, growth, training mishaps, materials, roles. */
export function dailyDragons(state: GameState): void {
  dailyGreyEggs(state);
  const rng = rngOf(state);
  const gone: Dragon[] = [];
  const seats = lodgeSeats(state);
  for (const d of state.dragons) {
    const cradle = state.buildings.find((b) => b && b.id === d.cradleId) ?? null;
    if (!cradle || cradle.state !== 'ok') {
      // no cradle: eggs die, others leave
      gone.push(d);
      if (d.stage > 0) depart(state, d, cradle);
      pushMessage(state, d.stage === 0 ? `An egg went cold: its cradle is gone.` : `${d.name} the ${LINE_INFO[d.line].name} ${STAGE_NAMES[d.stage]} left: its cradle is gone.`, 'bad');
      continue;
    }
    if (d.voyage !== undefined) continue; // away on the Sky-Dock's run: neither fed nor hungry, and it does not grow (iteration 73)
    const warm = cradle.lit;
    const asp = aspectAt(state, cradle.x, cradle.y);
    const attuned = asp === d.line || (!!d.second && asp === d.second);
    const seat = seats.get(d.id) ?? null;
    let speed = (d.training === 'gentle' ? 0.8 : d.training === 'hard' ? 1.3 : 1.6) * (attuned ? 1.25 : 1) * (d.trueblood ? 1.25 : 1) * ((cradle.visited ?? -1) >= state.day ? 1.1 : 1);
    if (d.stage === 0) {
      if (warm) d.days += d.lined ? EGGSHELL_HATCH : 1;
      else if (rng.chance(0.15)) pushMessage(state, `The eggs in the cradle at (${cradle.x},${cradle.y}) are going cold: it needs mana.`, 'warn');
      if (d.days >= STAGE_DAYS[0]) {
        d.stage = 1;
        d.days = 0;
        state.materials.eggshell += 1;
        state.materials.scale += 2;
        pushMessage(state, `A ${LINE_INFO[d.line].name} hatchling breaks its shell in the cradle at (${cradle.x},${cradle.y}). The tamers name it ${d.name}.`, 'milestone');
      }
      continue;
    }
    // living dragons eat: 6 goods a day as hatchling, 10 as drake, 14 as wyvern, 20 as a great wyrm
    const fedNow = feed(state, d, cradle, eats(d));
    if (fedNow) {
      d.hungry = 0;
      d.mood = Math.min(100, d.mood + (d.training === 'gentle' ? 6 : 3) + (attuned ? 2 : 0));
    } else {
      d.hungry++;
      d.mood = Math.max(0, d.mood - HUNGER_MOOD);
      if (d.hungry === 3) pushMessage(state, d.role === 'warden' && d.roleTarget > 0 ? `${d.name} has not eaten in three days: the markets of its district have nothing on the shelf.` : `${d.name} has not eaten in three days: no market within ${FEED_REACH} tiles of its cradle has food.`, 'warn');
      if (d.hungry === REGRESS_AFTER && d.stage >= 2) {
        d.stage = (d.stage - 1) as Dragon['stage'];
        d.days = 0;
        if (d.role === 'courier' && d.stage < 3) { d.role = 'none'; d.roleTarget = -1; }
        pushMessage(state, `${d.name}, unfed for ${REGRESS_AFTER} days, shrinks back to a ${STAGE_NAMES[d.stage]}. Feed it or it flies into the Gloam.`, 'warn', true, { x: cradle.x, y: cradle.y });
      }
    }
    if (!warm) d.mood = Math.max(0, d.mood - 5);
    // a seat at a Tamer's Lodge: a hatchling needs one to grow at all; a drake without one grows at half pace and, trained hard, burns more
    const trained = d.stage === 1 ? !!seat : true;
    if (!trained && rng.chance(0.2)) pushMessage(state, `${d.name} needs a seat at a Tamer's Lodge within ${LODGE_REACH} tiles of its cradle to grow (each lodge seats ${LODGE_SEATS}).`, 'warn');
    if (d.stage >= 2 && !seat) speed *= 0.5;
    if (d.mood <= 0) {
      gone.push(d);
      depart(state, d, cradle);
      pushMessage(state, `${d.name} the ${LINE_INFO[d.line].name} ${STAGE_NAMES[d.stage]} flies into the Gloam, starved and sullen. It may remember you.`, 'bad');
      continue;
    }
    // training mishaps: hard training scorches the cradle; without a lodge seat three times as often
    if (d.training === 'hard' && d.stage >= 1 && rng.chance(0.02 * (seat ? 1 : 3))) {
      cradle.state = 'burning';
      cradle.stateDays = 0;
      markDirty(state, cradle.x, cradle.y);
      state.stats.firesTotal++;
      pushMessage(state, `${d.name} scorched the cradle roof under hard training${seat ? '' : ', with no tamer to check it'}. Fire!`, 'bad');
    }
    if (d.training === 'wild' && rng.chance(0.01)) {
      gone.push(d);
      depart(state, d, cradle);
      pushMessage(state, `${d.name}, trained wild, took wing at dawn and did not come back.`, 'warn');
      continue;
    }
    // growth
    if (trained && fedNow && d.stage < stageCap(d)) {
      d.days += speed * (d.mood > 50 ? 1 : 0.5);
      if (d.days >= STAGE_DAYS[d.stage]) {
        d.stage = (d.stage + 1) as Dragon['stage'];
        d.days = 0;
        state.materials.scale += (LINE_INFO[d.line].scale + (d.second ? LINE_INFO[d.second].scale / 2 : 0)) * (d.trueblood ? 1.5 : 1) * (d.stage >= 4 ? 2 : 1);
        if (d.stage >= 4) { state.stats.greatWyrms++; pushMessage(state, `${d.name} is a great wyrm: its shadow crosses the whole quarter, its auras reach half again as far, and the Gloam shrinks from it. It eats ${WYRM_EATS_GOODS} goods a day.`, 'milestone', true, { x: cradle.x, y: cradle.y }); continue; }
        if (d.stage === 3 && d.role === 'delver') { d.role = 'none'; d.roleTarget = -1; }
        pushMessage(state, `${d.name} is a ${STAGE_NAMES[d.stage]} now: ${LINE_INFO[d.line].desc}. ${d.stage === 3 ? 'It can fly goods as a courier.' : 'Give it a role in the Wyrms panel.'}`, 'milestone');
      }
    } else if (d.stage >= stageCap(d)) d.days += 1;
    // materials from grown dragons: an ember drake breathes a jar of wyrmfire a month, a wyvern one a fortnight
    if (d.stage >= 2 && (d.line === 'ember' || d.second === 'ember') && state.day % (d.stage >= 3 ? 15 : 30) === 0) {
      state.materials.wyrmfire += 1;
      pushMessage(state, `${d.name} breathes a jar of wyrmfire for the alchemists.`, 'good');
    }
    if (d.stage >= 2 && state.day % 45 === 0) state.materials.scale += 1;
  }
  if (gone.length) {
    const ids = new Set(gone.map((g) => g.id));
    state.dragons = state.dragons.filter((d) => !ids.has(d.id));
    state.agents = state.agents.filter((a) => !(a.kind === AgentKind.Creature && (a.species === 'drake' || a.species === 'wyvern') && a.dragonId !== undefined && ids.has(a.dragonId)));
  }
  // the sinks: the Craft bonus burns wyrmfire while the toggle is on, every lit Forge burns its own, the Scale-Mail edict wears scale
  const m = state.materials;
  if (state.burnWyrmfire && m.wyrmfire > 0) m.wyrmfire = Math.max(0, m.wyrmfire - WYRMFIRE_BURN);
  forEachBuilding(state, (b) => { if (b.kind === 'wyrmforge' && b.state === 'ok' && b.lit && m.wyrmfire > 0) m.wyrmfire = Math.max(0, m.wyrmfire - FORGE_BURN); });
  if (edictOn(state, 'scalemail') && m.scale >= SCALEMAIL_PER_DAY) m.scale = Math.max(0, m.scale - SCALEMAIL_PER_DAY);
  commitRng(state, rng);
}

/** Craft rate bonus while wyrmfire is in stock and the city burns it. */
export function wyrmfireBonus(state: GameState): number {
  return state.burnWyrmfire && state.materials.wyrmfire > 0 ? 0.15 : 0;
}
/** A Wyrmfire Forge is hot while there is wyrmfire to feed it. */
export function forgeHot(state: GameState): boolean {
  return state.materials.wyrmfire > 0;
}
/** Scale-Mail: the Watch wears it while the edict is on and scale is in the vault. */
export function scaleMailOn(state: GameState): boolean {
  return edictOn(state, 'scalemail') && state.materials.scale > 0;
}

/** Leystone per day added to a mine by delver drakes. */
export function delverBonus(state: GameState, mine: Building): number {
  let n = 0;
  for (const d of state.dragons) if (d.role === 'delver' && d.roleTarget === mine.id && d.stage >= 2) n += d.line === 'ember' ? 6 : 4;
  return n;
}
/** A delver works this mine (it halves the chance of waking a Concord Warden there). */
export function delverAt(state: GameState, mine: Building): boolean {
  return state.dragons.some((d) => d.role === 'delver' && d.roleTarget === mine.id && d.stage >= 2);
}

/** Districts with a warden drake: watch and fire coverage bonus applied in updateCoverage. */
export function wardenDistricts(state: GameState): Set<number> {
  const s = new Set<number>();
  for (const d of state.dragons) if (d.role === 'warden' && d.stage >= 2 && d.roleTarget > 0 && d.mood > 20) s.add(d.roleTarget);
  return s;
}

export function marketCapFor(b: Building): number {
  return marketStockCap(b);
}

export function dragonLabel(d: Dragon): string {
  return `${d.name} the ${LINE_INFO[d.line].name} ${STAGE_NAMES[d.stage]}`;
}

export function cradleTileOf(state: GameState, d: Dragon): [number, number] | null {
  const c = state.buildings.find((b) => b && b.id === d.cradleId);
  return c ? [c.x, c.y] : null;
}

export function lineIndex(line: DragonLine): number {
  return (['ember', 'bone', 'glim', 'vein', 'sky', 'grey', 'tide', 'storm', 'fen'] as DragonLine[]).indexOf(line);
}

export function districtTiles(state: GameState, d: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < state.district.length; i++) if (state.district[i] === d) out.push(i);
  return out;
}

export { idx };

// ---------- the Wyrm-Ring ----------
/** The next bout day: day 15 of a season, from day 45 on. */
export function nextBoutDay(state: GameState): number {
  let d = state.day + 1;
  while (d % 30 !== 15) d++;
  return Math.max(45, d);
}
/** A champion's odds this season: the deterministic halves and the chance over the two rolls of 40. */
export function boutOdds(state: GameState, champ: Dragon, day = state.day): { ours: number; theirs: number; chance: number } {
  const season = Math.floor(day / 30) % 4;
  const year = Math.floor(day / 120);
  const lineBonus = champ.line === 'ember' && champ.stage >= 3 ? 10 : champ.line === 'grey' ? 6 : 0;
  const ours = champ.stage * 20 + champ.mood / 2 + (champ.training === 'hard' ? 10 : champ.training === 'gentle' ? 5 : 0) + lineBonus;
  const theirs = champ.stage * 20 + 20 + season * 5 + Math.min(16, year * 8);
  // both sides add rng × 40: the difference of two uniforms is triangular on [-1, 1]
  const z = (theirs - ours) / 40;
  const chance = z <= -1 ? 1 : z <= 0 ? 1 - ((1 + z) * (1 + z)) / 2 : z < 1 ? ((1 - z) * (1 - z)) / 2 : 0;
  return { ours, theirs, chance };
}
/** The champion the Ring would send out: the highest stage among those named. */
export function ringChampion(state: GameState): Dragon | null {
  return state.dragons.filter((d) => d.role === 'champion' && d.stage >= 2).sort((a, b) => b.stage - a.stage)[0] ?? null;
}

/** Seasonal bout at the Wyrm-Ring on day 15 of each season. */
export function seasonalBout(state: GameState): void {
  if (state.day % 30 !== 15 || state.day < 30) return;
  const ring = state.buildings.find((b) => b && b.kind === 'ring' && b.state === 'ok');
  if (!ring) return;
  const champ = ringChampion(state);
  if (!champ) {
    pushMessage(state, 'The Wyrm-Ring stands empty this season: name a champion in the Wyrms panel.', 'info');
    return;
  }
  const rng = rngOf(state);
  fightBout(state, champ, rng);
  commitRng(state, rng);
}

/** One bout at the Ring: the champion against a challenger, odds and purse scaled (a rival wardlight's challenge halves the odds' edge and
 *  doubles the purse, iteration 73). Three rolls: ours, theirs and the challenger's name when none is given. */
export function fightBout(state: GameState, champ: Dragon, rng: Rng, oddsScale = 1, purseScale = 1, named?: string): boolean {
  const odds = boutOdds(state, champ);
  const ours = odds.ours * oddsScale + rng.next() * 40;
  const theirs = odds.theirs + rng.next() * 40;
  const challenger = named ?? rng.pick(['a Gloam-grey drake with one eye', 'a marsh-wyrm of the Ulum', 'a Belerial rider\'s strider-drake', 'an ember wyvern from the Mahjula', 'a bone drake nobody will claim']);
  if (ours >= theirs) {
    const purse = 1500 * champ.stage * purseScale;
    state.treasury += purse;
    state.stats.boutsWon++;
    state.modifiers.push({ kind: 'happiness', value: 8, until: state.day + 10, label: 'Ring victory' });
    champ.mood = Math.min(100, champ.mood + 10);
    pushMessage(state, `THE RING: ${champ.name} beats ${challenger} to first blood (the odds were ${Math.round(odds.chance * 100)} %). Purse ${purse} crowns; the square sings all night.`, 'milestone');
  } else {
    state.stats.boutsLost++;
    if (champ.stage > 1) { champ.stage = (champ.stage - 1) as Dragon['stage']; champ.days = 0; }
    if (champ.role === 'courier' && champ.stage < 3) { champ.role = 'none'; champ.roleTarget = -1; }
    champ.mood = Math.max(10, champ.mood - 20);
    state.modifiers.push({ kind: 'unrest', value: 0.05, until: state.day + 10, label: 'Ring defeat' });
    pushMessage(state, `THE RING: ${challenger} humbles ${champ.name} (the odds were ${Math.round(odds.chance * 100)} %), which limps back a ${STAGE_NAMES[champ.stage]}. The crowd is quiet.`, 'bad');
  }
  return ours >= theirs;
}

/** Courier pick: the fullest Craft works (or a stocked mine when enchanters wait) and the emptiest buyer. */
export function courierJob(state: GameState): { from: Building; to: Building; amount: number } | null {
  let from: Building | null = null;
  let best = 9;
  forEachBuilding(state, (b) => {
    const def = BUILDING_BY_KEY[b.kind];
    if (b.state !== 'ok') return;
    if ((def.zone === Zone.Craft || def.leystone) && b.stock > best) {
      best = b.stock;
      from = b;
    }
  });
  if (!from) return null;
  const f = from as Building;
  const leystone = !!BUILDING_BY_KEY[f.kind].leystone;
  let to: Building | null = null;
  let low = Infinity;
  forEachBuilding(state, (b) => {
    const def = BUILDING_BY_KEY[b.kind];
    if (b.state !== 'ok') return;
    if (leystone ? def.zone !== Zone.Arcane : def.zone !== Zone.Market) return;
    const cap = leystone ? 20 * b.level : marketStockCap(b);
    const ratio = b.stock / cap;
    if (ratio < low && ratio < 0.8) {
      low = ratio;
      to = b;
    }
  });
  if (!to) return null;
  return { from: f, to: to as Building, amount: Math.min(30, f.stock) };
}

// ---------- the departed ----------
/** The departed dragon whose season away has passed and whose tale is unanswered, if any. */
export function dueReturn(state: GameState): DepartedDragon | null {
  return state.departed.find((e) => !e.returned && state.day - e.day >= DAYS_PER_SEASON) ?? null;
}
/** A returned dragon takes its tribute: crowns by stage, or goods from the markets when the purse cannot. */
export function payReturn(state: GameState, e: DepartedDragon): string {
  e.returned = true;
  state.stats.dragonsReturned++;
  const crowns = RETURN_TRIBUTE * Math.max(1, e.stage);
  if (state.treasury >= crowns) {
    state.treasury -= crowns;
    return `${crowns} crowns are laid on the cradle stones. ${e.name} takes them in its claws and is gone over the hills.`;
  }
  let left = RETURN_GOODS * Math.max(1, e.stage);
  const want = left;
  forEachBuilding(state, (b) => {
    if (left <= 0 || BUILDING_BY_KEY[b.kind].zone !== Zone.Market || b.state !== 'ok') return;
    const t = Math.min(b.stock, left);
    b.stock -= t;
    left -= t;
  });
  return `The purse cannot pay ${crowns}; ${e.name} empties ${Math.round(want - left)} goods off the market shelves instead and is gone over the hills.`;
}
/** A returned dragon comes home if a cradle takes its line: sullen, its stage kept. */
export function homeReturn(state: GameState, e: DepartedDragon): string | null {
  const cradle = freeCradle(state, e.line);
  if (!cradle) return null;
  e.returned = true;
  state.stats.dragonsReturned++;
  const d: Dragon = { id: state.nextDragonId++, name: e.name, line: e.line, stage: e.stage, days: 0, cradleId: cradle.id, role: 'none', roleTarget: -1, mood: 40, hungry: 0, training: 'gentle', agentId: -1, born: state.day };
  state.dragons.push(d);
  return `${e.name} folds its wings in the cradle at (${cradle.x},${cradle.y}) and watches the tamers for a long while before it eats.`;
}
/** Refused, a returned dragon circles its old cradle for a day and sets roofs alight: up to its stage, unlit and unwarded, within reach. */
export function refuseReturn(state: GameState, e: DepartedDragon): string {
  e.returned = true;
  state.stats.dragonsReturned++;
  state.agents.push({
    id: state.nextAgentId++, kind: AgentKind.Creature, x: e.x + 1, y: e.y + 1, path: [], pathIdx: 0, speed: 4, homeId: -1, targetId: -1,
    timer: TICKS_PER_DAY, variant: lineIndex(e.line), dir: 0, load: 0, species: 'wyvern', dragonId: -1, anchorId: -1, ax: e.x + 1, ay: e.y + 1, alt: 30, phase: 3,
  });
  const targets: { b: Building; d: number }[] = [];
  forEachBuilding(state, (b) => {
    if (b.state !== 'ok' || b.lit || state.coverage.ward[idx(b.x, b.y)] > 0) return;
    const dist = Math.hypot(b.x - e.x, b.y - e.y);
    if (dist <= RETURN_FIRES_REACH) targets.push({ b, d: dist });
  });
  targets.sort((p, q) => p.d - q.d || p.b.id - q.b.id);
  let fires = 0;
  for (const t of targets.slice(0, Math.max(1, e.stage))) if (igniteBuilding(state, t.b, `${e.name}'s breath sets`)) fires++;
  return fires ? `${e.name} screams over ${state.cityName} all day; ${fires} dark roof${fires === 1 ? '' : 's'} within ${RETURN_FIRES_REACH} of its old cradle burn${fires === 1 ? 's' : ''}.` : `${e.name} screams over ${state.cityName} all day and finds every roof near its old cradle lit or warded. It leaves hungry.`;
}
