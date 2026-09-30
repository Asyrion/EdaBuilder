/**
 * Wyrmcraft I: dragons raised from eggs in a Wyrm-Cradle. Egg -> hatchling -> drake in this
 * iteration; wyvern and wyrm stages arrive with the sky layer. See DESIGN.md 8.6.
 */
import { BUILDING_BY_KEY } from './catalog';
import { AgentKind, Zone, idx, type Building, type Dragon, type DragonLine, type DragonRole, type GameState, type Training } from './types';
import { commitRng, forEachBuilding, markDirty, pushMessage, rngOf } from './world';
import { marketStockCap } from './agents';

export const STAGE_NAMES = ['egg', 'hatchling', 'drake', 'wyvern', 'wyrm'];
export const STAGE_DAYS = [30, 20, 40, 60, 120];
export const MAX_STAGE_NOW = 3; // wyvern for winged lines; wyrm stage waits
export const WINGED: DragonLine[] = ['ember', 'vein', 'sky', 'storm'];
export function maxStage(line: DragonLine): number {
  return WINGED.includes(line) ? 3 : 2;
}
export const LINE_INFO: Record<DragonLine, { name: string; scale: number; desc: string }> = {
  ember: { name: 'Ember', scale: 6, desc: 'brick red, breathes wyrmfire; a delver warms the seams' },
  bone: { name: 'Bone', scale: 8, desc: 'ivory over black; the restless lie down near it' },
  glim: { name: 'Glim', scale: 3, desc: 'tiny and gold; lights a street like a lantern-way' },
  vein: { name: 'Vein', scale: 10, desc: 'ley-blue with runes; roosts on a Nexus' },
  sky: { name: 'Sky', scale: 5, desc: 'white and silver; the fastest courier' },
  grey: { name: 'Grey', scale: 9, desc: 'ash and stone; the Gloam parts around it' },
  tide: { name: 'Tide', scale: 6, desc: 'teal and finned; swims the river' },
  storm: { name: 'Storm', scale: 7, desc: 'violet with lightning; eats weather' },
};
const NAMES = ['Ashvel', 'Tammet', 'Orrin', 'Sablewick', 'Morrowlight', 'Pell', 'Vessa', 'Glimmer', 'Cinder', 'Ossa', 'Hollow', 'Brightscale', 'Quiet', 'Ember-of-Vell', 'Wick', 'Thrum'];

export function cradleCapacity(b: Building): number {
  return b.kind === 'cradle' ? 2 : 0;
}

export function dragonsIn(state: GameState, cradleId: number): Dragon[] {
  return state.dragons.filter((d) => d.cradleId === cradleId);
}

/** A cradle with a free slot, or null. */
export function freeCradle(state: GameState): Building | null {
  let found: Building | null = null;
  forEachBuilding(state, (b) => {
    if (found || b.kind !== 'cradle' || b.state !== 'ok') return;
    if (dragonsIn(state, b.id).length < cradleCapacity(b)) found = b;
  });
  return found;
}

export function addEgg(state: GameState, line: DragonLine): Dragon | null {
  const cradle = freeCradle(state);
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

function tamerNear(state: GameState, cradle: Building): boolean {
  let ok = false;
  forEachBuilding(state, (b) => {
    if (b.kind === 'tamerslodge' && b.state === 'ok' && Math.hypot(b.x - cradle.x, b.y - cradle.y) <= 10) ok = true;
  });
  return ok;
}

/** Feed from the nearest stocked market: returns true if fed. */
function feed(state: GameState, cradle: Building, amount: number): boolean {
  let best: Building | null = null;
  let bd = Infinity;
  forEachBuilding(state, (b) => {
    if (BUILDING_BY_KEY[b.kind].zone !== Zone.Market || b.state !== 'ok' || b.stock < amount) return;
    const d = Math.hypot(b.x - cradle.x, b.y - cradle.y);
    if (d < bd) {
      bd = d;
      best = b;
    }
  });
  if (!best) return false;
  (best as Building).stock -= amount;
  return true;
}

/** Daily dragon upkeep: warmth, food, growth, training mishaps, materials, roles. */
export function dailyDragons(state: GameState): void {
  const rng = rngOf(state);
  const gone: Dragon[] = [];
  for (const d of state.dragons) {
    const cradle = state.buildings.find((b) => b && b.id === d.cradleId) ?? null;
    if (!cradle || cradle.state !== 'ok') {
      // no cradle: eggs die, others leave
      gone.push(d);
      pushMessage(state, d.stage === 0 ? `An egg went cold: its cradle is gone.` : `${d.name} the ${LINE_INFO[d.line].name} ${STAGE_NAMES[d.stage]} left: its cradle is gone.`, 'bad');
      continue;
    }
    const warm = cradle.lit;
    const speed = d.training === 'gentle' ? 0.8 : d.training === 'hard' ? 1.3 : 1.6;
    if (d.stage === 0) {
      if (warm) d.days += 1;
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
    // living dragons eat: 6 goods a day as hatchling, 10 as drake
    const fedNow = feed(state, cradle, d.stage === 1 ? 6 : d.stage === 2 ? 10 : 14);
    if (fedNow) {
      d.hungry = 0;
      d.mood = Math.min(100, d.mood + (d.training === 'gentle' ? 6 : 3));
    } else {
      d.hungry++;
      d.mood = Math.max(0, d.mood - 12);
      if (d.hungry === 3) pushMessage(state, `${d.name} has not eaten in three days. Markets near the cradle are empty.`, 'warn');
    }
    if (!warm) d.mood = Math.max(0, d.mood - 5);
    const trained = d.stage === 1 ? tamerNear(state, cradle) : true;
    if (!trained && rng.chance(0.2)) pushMessage(state, `${d.name} needs a Tamer's Lodge within 10 tiles of its cradle to grow.`, 'warn');
    if (d.mood <= 0) {
      gone.push(d);
      pushMessage(state, `${d.name} the ${LINE_INFO[d.line].name} ${STAGE_NAMES[d.stage]} flies into the Gloam, starved and sullen. It may remember you.`, 'bad');
      continue;
    }
    // training mishaps
    if (d.training === 'hard' && d.stage >= 1 && rng.chance(0.02)) {
      cradle.state = 'burning';
      cradle.stateDays = 0;
      markDirty(state, cradle.x, cradle.y);
      state.stats.firesTotal++;
      pushMessage(state, `${d.name} scorched the cradle roof under hard training. Fire!`, 'bad');
    }
    if (d.training === 'wild' && rng.chance(0.01)) {
      gone.push(d);
      pushMessage(state, `${d.name}, trained wild, took wing at dawn and did not come back.`, 'warn');
      continue;
    }
    // growth
    if (trained && fedNow && d.stage < Math.min(MAX_STAGE_NOW, maxStage(d.line))) {
      d.days += speed * (d.mood > 50 ? 1 : 0.5);
      if (d.days >= STAGE_DAYS[d.stage]) {
        d.stage = (d.stage + 1) as Dragon['stage'];
        d.days = 0;
        state.materials.scale += LINE_INFO[d.line].scale;
        if (d.stage === 3 && d.role === 'delver') { d.role = 'none'; d.roleTarget = -1; }
        pushMessage(state, `${d.name} is a ${STAGE_NAMES[d.stage]} now: ${LINE_INFO[d.line].desc}. ${d.stage === 3 ? 'It can fly goods as a courier.' : 'Give it a role in the Wyrms panel.'}`, 'milestone');
      }
    } else if (d.stage >= Math.min(MAX_STAGE_NOW, maxStage(d.line))) d.days += 1;
    // materials from grown dragons
    if (d.stage >= 2 && d.line === 'ember' && state.day % 30 === 0) {
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
  // consume materials in use
  if (state.materials.wyrmfire > 0) state.materials.wyrmfire = Math.max(0, state.materials.wyrmfire - 0.05);
  if (state.materials.eggshell > 0) state.materials.eggshell = Math.max(0, state.materials.eggshell - 0.02);
  commitRng(state, rng);
}

/** Craft rate bonus while wyrmfire is in stock. */
export function wyrmfireBonus(state: GameState): number {
  return state.materials.wyrmfire > 0 ? 0.15 : 0;
}

/** Leystone per day added to a mine by delver drakes. */
export function delverBonus(state: GameState, mine: Building): number {
  let n = 0;
  for (const d of state.dragons) if (d.role === 'delver' && d.roleTarget === mine.id && d.stage >= 2) n += d.line === 'ember' ? 6 : 4;
  return n;
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
  return (['ember', 'bone', 'glim', 'vein', 'sky', 'grey', 'tide', 'storm'] as DragonLine[]).indexOf(line);
}

export function districtTiles(state: GameState, d: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < state.district.length; i++) if (state.district[i] === d) out.push(i);
  return out;
}

export { idx };

/** Seasonal bout at the Wyrm-Ring on day 15 of each season. */
export function seasonalBout(state: GameState): void {
  if (state.day % 30 !== 15 || state.day < 30) return;
  const ring = state.buildings.find((b) => b && b.kind === 'ring' && b.state === 'ok');
  if (!ring) return;
  const champ = state.dragons.filter((d) => d.role === 'champion' && d.stage >= 2).sort((a, b) => b.stage - a.stage)[0];
  if (!champ) {
    pushMessage(state, 'The Wyrm-Ring stands empty this season: name a champion in the Wyrms panel.', 'info');
    return;
  }
  const rng = rngOf(state);
  const season = Math.floor(state.day / 30) % 4;
  const lineBonus = champ.line === 'ember' && champ.stage >= 3 ? 10 : champ.line === 'grey' ? 6 : 0;
  const ours = champ.stage * 20 + champ.mood / 2 + (champ.training === 'hard' ? 10 : champ.training === 'gentle' ? 5 : 0) + lineBonus + rng.next() * 40;
  const theirs = 40 + season * 5 + Math.floor(state.day / 120) * 8 + rng.next() * 40;
  const challenger = rng.pick(['a Gloam-grey drake with one eye', 'a marsh-wyrm of the Ulum', 'a Belerial rider\'s strider-drake', 'an ember wyvern from the Mahjula', 'a bone drake nobody will claim']);
  if (ours >= theirs) {
    const purse = 1500 * champ.stage;
    state.treasury += purse;
    state.stats.boutsWon++;
    state.modifiers.push({ kind: 'happiness', value: 8, until: state.day + 10, label: 'Ring victory' });
    champ.mood = Math.min(100, champ.mood + 10);
    pushMessage(state, `THE RING: ${champ.name} beats ${challenger} to first blood. Purse ${purse} crowns; the square sings all night.`, 'milestone');
  } else {
    state.stats.boutsLost++;
    if (champ.stage > 1) { champ.stage = (champ.stage - 1) as Dragon['stage']; champ.days = 0; }
    champ.mood = Math.max(10, champ.mood - 20);
    state.modifiers.push({ kind: 'unrest', value: 0.05, until: state.day + 10, label: 'Ring defeat' });
    pushMessage(state, `THE RING: ${challenger} humbles ${champ.name}, which limps back a ${STAGE_NAMES[champ.stage]}. The crowd is quiet.`, 'bad');
  }
  commitRng(state, rng);
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
    const cap = 20 * b.level;
    const ratio = b.stock / cap;
    if (ratio < low && ratio < 0.8) {
      low = ratio;
      to = b;
    }
  });
  if (!to) return null;
  return { from: f, to: to as Building, amount: Math.min(30, f.stock) };
}
