/** Zoned building spawning, occupancy, happiness, levelling, abandonment, demand. */
import { BUILDING_BY_KEY, ZONE_KEY, isZoneUnlocked } from './catalog';
import { edictOn, edictShare, modifierSum, modifierSumAt } from './edicts';
import { guildEffect, hallActive } from './guilds';
import { relicDone } from './relics';
import { bumpRoadVersion, marketStockCap } from './agents';
import { PORTAL_CAP } from './networks';

/** The Hospice holds this many goods of draughts; without them it heals at six tenths. */
export const HOSPICE_DRAUGHTS = 10;
/** The Academy's studied relics raise the educated floor by a hundredth each, up to this. */
export const EDUCATED_FLOOR_CAP = 0.2;
/** A Crystal Mine's seam: this much leystone, then dust. */
export const SEAM = 2400;
export const SPENT_RATE = 2;
import { seasonOf } from './world';
import { quarterAt, quarterOf } from './districts';
import { factionOf } from '../data/factions';
import { mothBonus } from './creatures';
import { wyrmGuards } from './wyrm';
import { GOLEM_LABOUR, labourGolems, raysLured, worksGolems } from './beasts';
import { aspectAt, auraAt, floodedAt, hasMarvel, litWonders, marvelExhibits, marvelNear, FLOODPROOF } from './weave';

/** The World Tree grows a stage each season: 0 sapling .. 3 full-grown. */
export const TREE_LEISURE_RADIUS = [6, 12, 18, 24];
export const TREE_WARD_RADIUS = [4, 8, 14, 20];
export function treeStage(b: Building): 0 | 1 | 2 | 3 {
  return Math.min(3, Math.floor(b.age / 30)) as 0 | 1 | 2 | 3;
}
export function worldTree(state: GameState): Building | null {
  return (state.buildings.find((b) => b && b.kind === 'worldtree' && b.state === 'ok') as Building | undefined) ?? null;
}
export function delveActive(state: GameState): boolean {
  return state.buildings.some((b) => b && b.kind === 'ruindelve' && b.state === 'ok');
}

/** Craft output multiplier in the Hush (a lit Glimhouse within 8 lifts it). */
export const HUSH_CRAFT = 0.8;

export function glimhouseNear(state: GameState, b: Building): boolean {
  return state.buildings.some((g) => g && g.kind === 'glimhouse' && g.state === 'ok' && g.lit && Math.abs(g.x - b.x) <= 8 && Math.abs(g.y - b.y) <= 8);
}

/** Buildings whose goods carts collect: Craft works and any producer with a goodsRate (Hanging Gardens). */
export function isGoodsSource(b: Building): boolean {
  const def = BUILDING_BY_KEY[b.kind];
  return def.zone === Zone.Craft || !!def.goodsRate;
}
import { SCALEMAIL_UNREST, delverBonus, forgeHot, scaleMailOn, wyrmfireBonus } from './wyrmcraft';
import { MAP_W, Terrain, Zone, idx, inBounds, type Building, type GameState } from './types';
import { commitRng, forEachBuilding, markDirty, placeBuildingRaw, pushMessage, refreshZoneList, removeBuilding, rngOf, touchesRoad } from './world';

export function capacityOf(b: Building, s?: GameState): number {
  const def = BUILDING_BY_KEY[b.kind];
  if (!def.capacity) return 0;
  if (b.state === 'ruin' || b.state === 'abandoned') return 0;
  let cap = def.capacity[Math.min(b.level, def.capacity.length) - 1];
  // the Deep Cut: a hill hall of a people that builds on hills digs a level deeper
  if (s && b.level >= 3 && def.zone === Zone.Hearth && deepCut(s, b)) cap += 2;
  return cap;
}

/** The Deep Cut edict applies to this hearth: it stands on hills, the people builds on hills, the edict is on here. */
export function deepCut(s: GameState, b: Building): boolean {
  return factionOf(s).rules.hillBuildable && s.terrain[idx(b.x, b.y)] === Terrain.Hills && edictOn(s, 'deepcut', b);
}

function demandFor(state: GameState, zone: Zone): number {
  switch (zone) {
    case Zone.Hearth: return state.demand.hearth;
    case Zone.Market: return state.demand.market;
    case Zone.Craft: return state.demand.craft;
    case Zone.Arcane: return state.demand.arcane;
    default: return 0;
  }
}

/** Called every 10 ticks: try to spawn a few buildings on zoned tiles. */
export function trySpawnBuildings(state: GameState, attempts = 5): void {
  const list = refreshZoneList(state);
  if (list.length === 0) return;
  const rng = rngOf(state);
  for (let k = 0; k < attempts; k++) {
    const i = list[rng.int(list.length)];
    const z = state.zone[i];
    if (!z || state.bIndex[i] >= 0 || state.gloam[i] || state.road[i]) continue;
    const d = demandFor(state, z);
    if (d <= 0) continue;
    if (!rng.chance(Math.min(1, d) * 0.45)) continue;
    const x = i % MAP_W;
    const y = (i / MAP_W) | 0;
    if (!touchesRoad(state, x, y, 1, 1)) continue;
    // arcane requires schooling coverage at the tile
    if (z === Zone.Arcane && state.coverage.school[i] < 40) continue;
    commitRng(state, rng);
    const b = placeBuildingRaw(state, ZONE_KEY[z], x, y, 1, true);
    if (z === Zone.Hearth) b.residents = 2;
    rng.state = state.rngState;
  }
  commitRng(state, rng);
}

/** Per-building happiness 0..100. */
export interface Term { label: string; v: number }
/** The terms of a building's happiness, in the order they are summed; computeBuildingHappiness is their sum, clamped to 0..100. */
export function happinessTerms(state: GameState, b: Building): Term[] {
  const def = BUILDING_BY_KEY[b.kind];
  const i = idx(b.x, b.y);
  const cov = state.coverage;
  const t: Term[] = [{ label: 'base', v: 50 }];
  const add = (label: string, v: number) => { if (v !== 0) t.push({ label, v }); };
  add('land value', (state.landValue[i] - 30) * 0.3);
  add('faith', (cov.faith[i] / 255) * 8);
  add('leisure', (cov.leisure[i] / 255) * 8);
  add('health', (cov.health[i] / 255) * 6);
  add('watch', (cov.watch[i] / 255) * 5);
  add(b.lit ? 'lit' : 'unlit', b.lit ? 6 : -9);
  if ((b.tended ?? -1) >= state.day) add('tended by a healer', 4);
  if (def.zone === Zone.Hearth) { const q = quarterAt(state, i); if (q === 'hearth') add('Hearth quarter', 3); else if (q === 'craft') add('Craft quarter', -4); else if (q === 'temple') add('Temple quarter', 2); }
  if (state.waterDist[i] <= 1 && !FLOODPROOF.includes(b.kind) && floodedAt(state, b.x, b.y)) add('the flood', -10); // the Sable in flood, or the Weir's open sluice
  add(b.watered ? 'watered' : 'dry', b.watered ? 6 : -11);
  add('miasma', -(state.miasma[i] / 255) * 30);
  const gd = state.gloamDist[i];
  if (gd < 7) add('the Gloam near', -(7 - gd) * 3 * (1 - cov.ward[i] / 255));
  add('traffic', -(state.trafficSmooth[i] / 255) * 10);
  add('unrest', -state.unrest * 15);
  // the restless and Gloam-hounds nearby frighten everyone
  let fear = 0;
  for (const a of state.agents) {
    if (a.kind === 2) {
      if (Math.abs(a.x - b.x) < 4 && Math.abs(a.y - b.y) < 4) fear -= 8;
    } else if (a.kind === 3 && a.species === 'hound') {
      if (Math.abs(a.x - b.x) < 3 && Math.abs(a.y - b.y) < 3) fear -= 5;
    } else if (a.kind === 3 && a.species === 'golem' && a.load === 0) {
      if (Math.abs(a.x - b.x) < 4 && Math.abs(a.y - b.y) < 4) fear -= 10;
    } else if (a.kind === 3 && a.species === 'tiger') {
      if (Math.abs(a.x - b.x) < 5 && Math.abs(a.y - b.y) < 5) fear -= 12;
    }
  }
  add('the restless and beasts near', fear);
  let tax = 10;
  switch (def.zone) {
    case Zone.Hearth: tax = state.taxRates.hearth; break;
    case Zone.Market: tax = state.taxRates.market; break;
    case Zone.Craft: tax = state.taxRates.craft; break;
    case Zone.Arcane: tax = state.taxRates.arcane; break;
  }
  add('the tithe', -(tax - 10) * 1.6);
  add('effects', modifierSumAt(state, 'happiness', state.district[i]));
  if (wyrmGuards(state)) add('the bound wyrm', 10);
  const tree = worldTree(state);
  if (tree) add('the World Tree', treeStage(tree));
  if (raysLured(state)) add('skyrays overhead', 3);
  { const ex = marvelExhibits(state); if (ex > 0) add(`the Hall of Marvels (${ex} exhibit${ex === 1 ? '' : 's'})`, ex * 2); } // +2 a rare good on show, lit (iteration 53)
  for (const w of litWonders(state)) add(`the ${BUILDING_BY_KEY[w.kind].name}`, 5); // every lit wonder hall delights the whole city
  if (relicDone(state, 'ninehouses')) add('the Nine Houses', 3);
  if (hasMarvel(state, 'househall')) add('the House-Hall', 2);
  if (edictOn(state, 'curfew', b)) add('the curfew', -4);
  if (seasonOf(state) === 1) add('Bloom', 2);
  if (def.zone === Zone.Hearth) {
    const unemployment = state.population > 0 ? 1 - state.employed / Math.max(1, workforceOf(state)) : 0;
    add('no work', -unemployment * 20);
    add('health of the city', (state.health - 0.5) * 15);
  } else if (def.zone === Zone.Market) {
    // markets like customers, leisure and full shelves
    add('leisure for the trade', (cov.leisure[i] / 255) * 6);
    if (state.population < 20) add('no customers', -8);
    const fill = b.stock / marketStockCap(b);
    if (fill <= 0.05) add('empty shelves', -14);
    else if (fill > 0.5) add('full shelves', 5);
    if (edictOn(state, 'lanternlevy', b)) add('the Lantern Levy', -6);
  } else if (def.zone === Zone.Craft) {
    add('industry tolerates', 4); // industry tolerates more
    if (b.stock >= craftStockCap(b) * 0.95) add('nobody is buying', -10); // nobody is buying
  } else if (def.zone === Zone.Arcane) {
    add('schooling', (cov.school[i] / 255) * 10 - 6);
    if (b.stock <= 0.5 && b.age > 3) add('no leystone', -10); // no leystone to enchant
    else if (b.stock > 5) add('leystone in store', 4);
  }
  return t;
}

export function computeBuildingHappiness(state: GameState, b: Building): number {
  let h = 0;
  for (const x of happinessTerms(state, b)) h += x.v;
  return Math.max(0, Math.min(100, h));
}

/** What the next level needs, each with whether it is met today (for the panel). */
export function levelUpNeeds(state: GameState, b: Building): { text: string; met: boolean }[] {
  const def = BUILDING_BY_KEY[b.kind];
  if (def.category !== 'zone' || b.level >= 3) return [];
  const i = idx(b.x, b.y);
  const lv = state.landValue[i];
  const need = b.level === 1 ? 38 : 62;
  const out = [
    { text: `land value ${need} (${lv} now)`, met: lv >= need },
    { text: 'lit', met: b.lit },
    { text: 'watered', met: b.watered },
    { text: 'happiness above 45', met: b.happiness > 45 },
  ];
  if (b.level === 2) out.push({ text: 'schooling: a quarter of the city educated, a school near, or the Deep Cut', met: state.educated > 0.25 || state.coverage.school[i] > 100 || (def.zone === Zone.Hearth && deepCut(state, b)) });
  if (b.level === 2 && def.zone === Zone.Arcane) out.push({ text: 'educated 35 %', met: state.educated >= 0.35 });
  return out;
}

export function craftStockCap(b: Building): number {
  return 30 * b.level;
}

export function workforceOf(state: GameState): number {
  return Math.round(state.population * 0.62) + labourGolems(state) * GOLEM_LABOUR;
}

/** Daily update of occupancy, happiness, levelling and abandonment for zoned buildings. */
export function dailyBuildings(state: GameState): void {
  const rng = rngOf(state);
  dailyTrade(state);
  state.artifactsSold = 0;
  state.goodsProduced = 0;
  state.goodsSold = 0;
  state.goodsShort = 0;
  let pop = 0;
  let jobs = 0;
  let happySum = 0;
  let happyW = 0;
  const workforce = workforceOf(state);
  // jobs first (uses last day's population)
  const jobBuildings: Building[] = [];
  const extraJobs: Building[] = []; // non-zone buildings with a capacity (the Quarry): jobs, not part of the happiness average
  forEachBuilding(state, (b) => {
    const def = BUILDING_BY_KEY[b.kind];
    if (b.cooldown > 0) b.cooldown--;
    if (def.category !== 'zone') {
      b.age++;
      // the Hospice draws two goods of draughts a day from the fullest market within 16 (it holds ten)
      if (b.kind === 'hospice' && b.state === 'ok' && b.lit && b.stock < HOSPICE_DRAUGHTS) {
        let best: Building | null = null;
        forEachBuilding(state, (m) => { if (BUILDING_BY_KEY[m.kind].zone === Zone.Market && m.state === 'ok' && m.stock > 0 && Math.abs(m.x - b.x) <= 16 && Math.abs(m.y - b.y) <= 16 && (!best || m.stock > best.stock)) best = m; });
        if (best) { const m = best as Building; const take = Math.min(2, m.stock, HOSPICE_DRAUGHTS - b.stock); m.stock -= take; b.stock += take; }
      }
      if (b.kind === 'hospice' && b.state === 'ok') b.stock = Math.max(0, b.stock - 1); // a day's draughts used
      // the Academy studies a loose relic every five days: a lasting floor under the educated share
      if ((b.kind === 'academy' || b.kind === 'grandacademy') && b.state === 'ok' && b.lit && state.day > 0 && state.day % 5 === 0 && state.relicStock >= 1 && state.educatedFloor < EDUCATED_FLOOR_CAP) {
        state.relicStock--;
        state.educatedFloor = Math.min(EDUCATED_FLOOR_CAP, state.educatedFloor + 0.01);
        b.progress++; // relics studied here
      }
      if (def.goodsRate && b.state === 'ok') {
        const made = Math.min(craftStockCap(b) - b.stock, def.goodsRate * (b.lit ? 1 : 0.5) * (def.capacity ? Math.max(0.25, Math.min(1, b.workers / Math.max(1, capacityOf(b, state)))) : 1)); // a works makes by its hands
        b.stock += Math.max(0, made);
        state.goodsProduced += Math.max(0, made);
      }
      if (def.capacity && b.state === 'ok') {
        extraJobs.push(b);
        jobs += capacityOf(b, state);
      }
      if (b.kind === 'worldtree' && b.age % 30 === 0 && b.age <= 90) {
        markDirty(state, b.x, b.y);
        const st = treeStage(b);
        if (st > 0) pushMessage(state, st === 3 ? `The World Tree at (${b.x},${b.y}) is full-grown: its crown stands above the Lantern of Vell, and the Gloam will not cross its shade.` : `The World Tree at (${b.x},${b.y}) has grown another season; its shade now reaches ${TREE_LEISURE_RADIUS[st]} tiles.`, 'milestone', true, { x: b.x, y: b.y });
      }
      if (b.kind === 'ruindelve' && b.state === 'ok') {
        state.stats.relics++;
        state.relicStock++;
        state.unquieted += 0.5;
      }
      return;
    }
    b.age++;
    b.stateDays++;
    if (b.state === 'burning' || b.state === 'building') return;
    if (b.state === 'ruin') {
      if (b.stateDays > 12) removeBuilding(state, b);
      return;
    }
    b.happiness = computeBuildingHappiness(state, b);
    if (b.state === 'abandoned') {
      if (b.happiness > 55 && b.lit && b.watered && b.stateDays > 2) {
        b.state = 'ok';
        b.stateDays = 0;
        b.unhappyDays = 0;
        b.dryDays = 0;
        markDirty(state, b.x, b.y);
      } else if (b.stateDays > 25) {
        removeBuilding(state, b);
      }
      return;
    }
    // unhappiness / dryness tracking
    if (b.happiness < 15) b.unhappyDays++;
    else b.unhappyDays = Math.max(0, b.unhappyDays - 1);
    if (!b.watered) b.dryDays += b.lit ? 1 : 1.5;
    else b.dryDays = Math.max(0, b.dryDays - 1);
    if (!b.lit || !b.watered) b.problemDays++;
    else b.problemDays = 0;
    const darkAbandon = factionOf(state).rules.darkAbandon;
    const dark = darkAbandon > 0 && !b.lit && b.problemDays > darkAbandon; // light is life
    if (b.unhappyDays > 8 || b.dryDays > 14 || dark) {
      b.state = 'abandoned';
      b.stateDays = 0;
      b.residents = 0;
      b.workers = 0;
      markDirty(state, b.x, b.y);
      pushMessage(state, `${def.name.split(' ')[0]} at (${b.x},${b.y}) abandoned: ${dark ? 'no light' : b.dryDays > 14 ? 'no water' : `nobody wants to stay (happiness ${Math.round(b.happiness)})`}.`, 'warn', true, { x: b.x, y: b.y });
      return;
    }
    const cap = capacityOf(b, state);
    if (def.zone === Zone.Hearth) {
      // move-in / move-out
      const d = state.demand.hearth;
      if (b.residents < cap && b.happiness > 35 && d > -0.3) {
        const gain = 1 + (b.happiness > 65 && d > 0.5 ? 1 : 0);
        b.residents = Math.min(cap, b.residents + gain);
      } else if (b.happiness < 30 && b.residents > 0 && rng.chance(0.5)) {
        b.residents = Math.max(0, b.residents - 1);
      }
      // births
      if (b.residents >= 2 && b.residents < cap && b.happiness > 50 && rng.chance(0.08)) b.residents++;
      pop += b.residents;
      happySum += b.happiness * Math.max(1, b.residents);
      happyW += Math.max(1, b.residents);
    } else {
      jobBuildings.push(b);
      jobs += cap;
    }
    // goods: craft produces, markets sell
    if (def.zone === Zone.Craft) {
      const forge = marvelNear(state, 'wyrmforge', b) && forgeHot(state); // a Forge with no wyrmfire is cold (iteration 53)
      const glim = glimhouseNear(state, b) || forge;
      const asp = aspectAt(state, b.x, b.y);
      let rate = 0.7 * (edictOn(state, 'herbgardens', b) ? 1.25 : 1) * (seasonOf(state) === 1 ? 1.15 : seasonOf(state) === 3 && !glim ? HUSH_CRAFT : 1) * (1 + mothBonus(state, b) + wyrmfireBonus(state) + (modifierSum(state, 'rain') > 0 ? 0.15 : 0) + modifierSum(state, 'goods') + (glim ? 0.1 : 0) + (asp === 'ember' ? 0.15 : 0) + (auraAt(state, 'ember', b.x, b.y) ? 0.1 : 0) + guildEffect(state, 'alchemists') * (guildEffect(state, 'alchemists') > 0 ? 0.08 : 0.1) + (forge ? 0.25 : 0));
      if (!b.lit) rate *= 0.5;
      { const q = quarterOf(state, b); if (q === 'craft') rate *= 1.2; else if (q === 'hearth') rate *= 0.8; }
      const hands = Math.min(capacityOf(b, state), b.workers + worksGolems(state, b) * GOLEM_LABOUR); // a posted Concord Warden works the bench for twelve
      const made = Math.min(craftStockCap(b) - b.stock, hands * rate);
      b.stock += Math.max(0, made);
      state.goodsProduced += Math.max(0, made);
    } else if (def.zone === Zone.Market) {
      const want = b.workers * 0.5 + 1;
      if (b.stock <= 0.5) state.goodsShort++;
      if (b.stock > 0 && theftAt(state, b)) { const taken = b.stock * 0.1; b.stock -= taken; state.stats.goodsStolen += taken; } // an unwatched shelf in an unquiet city
      b.stock = Math.max(0, b.stock - want);
    } else if (def.zone === Zone.Arcane) {
      // enchanters turn leystone into artifacts sold for crowns
      const use = Math.min(b.stock, b.workers * 0.25 * (b.lit ? 1 : 0.3) * (quarterOf(state, b) === 'scholars' ? 1.2 : 1));
      b.stock -= use;
      state.artifactsSold += use * 5 * (delveActive(state) ? 1.15 : 1) * (state.materials.rayscale > 0 ? 1.1 : 1) * (hasMarvel(state, 'hallofmarvels') ? 1.5 + 0.05 * state.relics.complete.length : 1) * grandAcademyBonus(state);
    }
    // levelling
    const i = idx(b.x, b.y);
    const lv = state.landValue[i];
    let target = 1;
    if (lv >= 38 && b.lit && b.watered) target = 2;
    if (lv >= 62 && b.lit && b.watered && (state.educated > 0.25 || state.coverage.school[i] > 100 || (def.zone === Zone.Hearth && deepCut(state, b)))) target = 3;
    if (def.zone === Zone.Arcane && target === 3 && state.educated < 0.35) target = 2;
    if (target > b.level && b.happiness > 45) b.progress += 8 + (lv - 30) * 0.2;
    else if (target < b.level) b.progress -= 6;
    else b.progress = Math.max(-40, Math.min(60, b.progress * 0.8));
    if (b.progress >= 100 && b.level < 3) {
      b.level++;
      b.progress = 0;
      b.variant = rng.int(4);
      markDirty(state, b.x, b.y);
    } else if (b.progress <= -100 && b.level > 1) {
      b.level--;
      b.progress = 0;
      b.residents = Math.min(b.residents, capacityOf(b, state));
      markDirty(state, b.x, b.y);
    }
  });
  // assign workers proportionally
  let employed = Math.min(workforce, jobs);
  const eduNeeded = 0;
  void eduNeeded;
  const fill = jobs > 0 ? employed / jobs : 0;
  for (const b of jobBuildings) {
    b.workers = Math.round(capacityOf(b, state) * fill);
    happySum += b.happiness * 2;
    happyW += 2;
  }
  for (const b of extraJobs) b.workers = Math.round(capacityOf(b, state) * fill);
  forEachBuilding(state, (b) => {
    const def = BUILDING_BY_KEY[b.kind];
    if (def.leystone && b.state === 'ok') {
      // the seam runs out: a full seam cuts the rate, a spent shaft only dust
      const left = b.seam ?? SEAM;
      let cut = SPENT_RATE;
      if (left > 0) {
        cut = Math.min(left, def.leystone * (b.lit ? 1 : 0.5) + delverBonus(state, b));
        b.seam = left - cut;
        if (b.seam <= 0) pushMessage(state, `The seam under the ${def.name} at (${b.x},${b.y}) is cut out: ${SPENT_RATE} a day of dust from here, and the empty shaft wakes the deep. Bulldoze it or move on.`, 'warn', true, { x: b.x, y: b.y });
      }
      b.stock = Math.min(60, b.stock + cut);
    }
    if (b.kind === 'mothloft') b.stock = 0; // last night's moths were counted by the works today; the next night counts afresh
    if (b.kind === 'portalarch') { if ((b.load ?? 0) > PORTAL_CAP) bumpRoadVersion(); b.load = 0; } // a new day's crossings
    if (b.flare && b.flare > 0) b.flare--;
    if (b.kind === 'scaleward' && b.state === 'ok' && state.day % 30 === 0 && state.day > 0) b.plate = Math.max(0.3, (b.plate ?? 1) - 0.1); // the plating wears a tenth a season
  });
  state.population = pop;
  state.jobs = jobs;
  state.employed = employed;
  state.happiness = happyW > 0 ? happySum / happyW : 60;
  if (pop > state.stats.peakPopulation) state.stats.peakPopulation = pop;
  commitRng(state, rng);
}

/** Demand bars in [-1,1]. Recomputed every few seconds. */
let lastDemandWhy: string[] = [];
/** One line per demand bar, from the last updateDemand (for the bars' tooltip). */
export function demandReasons(): string[] {
  return lastDemandWhy;
}

export type DemandZone = 'hearth' | 'market' | 'craft' | 'arcane';
interface DemandFacts {
  jobs: number; workforce: number; jobSurplus: number; happiness: number; unrest: number; emptyHomes: boolean;
  marketJobs: number; marketWant: number; pop: number; craftFull: number; craftN: number;
  craftJobs: number; craftWant: number; goodsShort: number; unemployment: number;
  arcaneJobs: number; educated: number; arcaneOpen: boolean;
}
let lastDemandFacts: DemandFacts | null = null;
export const DEMAND_EVEN = 0.05;
const DEMAND_NAMES: Record<DemandZone, string> = { hearth: 'Hearths', market: 'Markets', craft: 'Craft works', arcane: 'Arcane shops' };

/** What a demand bar means, in words (iteration 49): its sign, the verdict, the numbers behind it and what to do. */
export function demandExplain(state: GameState, zone: DemandZone): { sign: '+' | '−' | '0'; pct: number; headline: string; detail: string; advice: string } {
  const v = state.demand[zone];
  const pct = Math.round(Math.abs(v) * 100);
  const sign: '+' | '−' | '0' = v > DEMAND_EVEN ? '+' : v < -DEMAND_EVEN ? '−' : '0';
  const name = DEMAND_NAMES[zone];
  const f = lastDemandFacts;
  const lead = sign === '0' ? `${name} about even:` : `${name} ${sign}${pct} %:`;
  let verdict = '';
  let detail = f ? '' : 'no reckoning yet.';
  let advice = '';
  const grow = (what: string) => `New ${what} grow where you zone them beside a road.`;
  const even = 'Zoned lots fill slowly; the bar must rise above the line to grow.';
  if (zone === 'hearth') {
    verdict = sign === '+' ? 'folk want more homes.' : sign === '−' ? 'nobody is coming.' : 'homes and folk match.';
    if (f) detail = `${f.jobs} jobs for ${f.workforce} hands${f.jobSurplus > 0 ? ' (work to spare)' : ' (no work)'} · happiness ${Math.round(f.happiness)} · unrest ${Math.round(f.unrest * 100)} %${f.emptyHomes ? ' · many homes stand empty' : ''}`;
    advice = sign === '+' ? grow('hearths') : sign === '−' ? 'New hearths will not grow; more jobs, happier folk or a lower tithe bring them.' : even;
  } else if (zone === 'market') {
    verdict = sign === '+' ? 'the folk want more shops.' : sign === '−' ? 'more shops than the folk can fill.' : 'shops and folk match.';
    if (f) detail = `${f.marketJobs} market jobs, ${Math.round(f.marketWant)} wanted for ${f.pop} folk${f.craftN > 0 && f.craftFull > 0 ? ` · ${f.craftFull} of ${f.craftN} works cannot sell` : ''}`;
    advice = sign === '+' ? grow('markets') : sign === '−' ? 'New markets will not grow; wait for folk or let the works sell.' : even;
  } else if (zone === 'craft') {
    verdict = sign === '+' ? 'the shelves want more goods.' : sign === '−' ? 'more works than the markets can sell for.' : 'works and shelves match.';
    if (f) detail = `${f.craftJobs} craft jobs, ${Math.round(f.craftWant)} wanted${f.goodsShort > 0 ? ` · ${f.goodsShort} markets ran dry` : ''}${f.unemployment > 0 ? ` · ${Math.round(f.unemployment * 100)} % idle hands` : ''}`;
    advice = sign === '+' ? grow('works') : sign === '−' ? 'New works will not grow; more folk, or markets that run dry, call for them.' : even;
  } else {
    const unschooled = !f || f.educated < 0.2;
    verdict = !f || !f.arcaneOpen ? 'not yet unlocked.' : sign === '+' ? 'the schooled want enchanting work.' : sign === '−' ? (unschooled ? 'too few schooled folk.' : 'more shops than the schooled can fill.') : 'shops and scholars match.';
    if (f) detail = `${f.arcaneJobs} arcane jobs · educated ${Math.round(f.educated * 100)} %${unschooled ? ' (needs 20 %)' : ''}`;
    advice = !f || !f.arcaneOpen ? 'Arcane shops open at the Township.' : sign === '+' ? grow('shops') : sign === '−' ? (unschooled ? 'Nothing grows here until a fifth of the folk are schooled: an Academy.' : 'New shops will not grow; more schooled folk call for them.') : even;
  }
  return { sign, pct, headline: `${lead} ${verdict}`, detail, advice };
}

export function updateDemand(state: GameState): void {
  const pop = state.population;
  const workforce = workforceOf(state);
  const jobs = state.jobs;
  const unemployment = workforce > 0 ? Math.max(0, 1 - jobs / workforce) : 0;
  const jobSurplus = workforce > 0 ? (jobs - workforce) / workforce : jobs > 0 ? 1 : 0;
  // count free zoned tiles & building occupancy to derive pressure
  let hearthCap = 0;
  let hearthRes = 0;
  let marketJobs = 0;
  let craftJobs = 0;
  let arcaneJobs = 0;
  forEachBuilding(state, (b) => {
    const def = BUILDING_BY_KEY[b.kind];
    if (def.category !== 'zone' || b.state !== 'ok') return;
    if (def.zone === Zone.Hearth) {
      hearthCap += capacityOf(b, state);
      hearthRes += b.residents;
    } else if (def.zone === Zone.Market) marketJobs += capacityOf(b, state);
    else if (def.zone === Zone.Craft) craftJobs += capacityOf(b, state);
    else if (def.zone === Zone.Arcane) arcaneJobs += capacityOf(b, state);
  });
  const happy = state.happiness / 100;
  // Hearth: people want to come when there are jobs, happiness and room is scarce.
  let hearth = 0.35 + Math.min(0.6, jobSurplus * 0.8) + (happy - 0.5) * 0.9 - (state.taxRates.hearth - 10) * 0.04;
  if (hearthCap - hearthRes > Math.max(8, pop * 0.25)) hearth -= 0.4; // lots of empty homes
  if (pop < 30) hearth = Math.max(hearth, 0.5);
  hearth -= state.unrest * 0.5;
  // Market: needs shoppers; wants ~1 market job per 5 residents.
  const marketWant = pop / 5;
  let market = pop < 12 ? -0.2 : Math.max(-1, Math.min(1, (marketWant - marketJobs) / Math.max(10, marketWant))) * 0.9;
  market -= (state.taxRates.market - 10) * 0.04;
  market += unemployment * 0.3;
  // unsold goods at the works call for more markets; empty shelves call for more works
  let craftFull = 0;
  let craftN = 0;
  forEachBuilding(state, (b) => {
    if (BUILDING_BY_KEY[b.kind].zone === Zone.Craft && b.state === 'ok') {
      craftN++;
      if (b.stock >= craftStockCap(b) * 0.9) craftFull++;
    }
  });
  if (craftN > 0) market += (craftFull / craftN) * 0.4;
  // Craft: wants ~1 craft job per 3 residents; suppressed if plenty of jobs.
  const craftWant = pop / 3.2;
  let craft = pop < 6 ? 0.4 : Math.max(-1, Math.min(1, (craftWant - craftJobs) / Math.max(10, craftWant))) * 0.9;
  craft += unemployment * 0.5;
  craft -= (state.taxRates.craft - 10) * 0.04;
  if (marketJobs > 0 && state.goodsShort > 0) craft += Math.min(0.4, state.goodsShort / Math.max(4, marketJobs / 4));
  // Arcane: needs education; wants ~1 arcane job per 6 residents once educated.
  let arcane = -0.2;
  if (isZoneUnlocked(state.milestone, Zone.Arcane)) {
    const arcaneWant = state.educated > 0.2 ? (pop / 6) * Math.min(1, (state.educated - 0.2) * 3) : 0;
    arcane = Math.max(-1, Math.min(1, (arcaneWant - arcaneJobs) / Math.max(10, arcaneWant))) * 0.9;
    arcane -= (state.taxRates.arcane - 10) * 0.04;
    if (state.educated < 0.2) arcane = -0.5;
  }
  lastDemandFacts = { jobs, workforce, jobSurplus, happiness: state.happiness, unrest: state.unrest, emptyHomes: hearthCap - hearthRes > Math.max(8, pop * 0.25), marketJobs, marketWant, pop, craftFull, craftN, craftJobs, craftWant, goodsShort: state.goodsShort, unemployment, arcaneJobs, educated: state.educated, arcaneOpen: isZoneUnlocked(state.milestone, Zone.Arcane) };
  lastDemandWhy = [
    `Hearth: ${jobs} jobs for ${workforce} hands${jobSurplus > 0 ? ' (work to spare: folk want homes)' : ' (no work: nobody comes)'} · happiness ${Math.round(state.happiness)} · unrest ${Math.round(state.unrest * 100)} %${hearthCap - hearthRes > Math.max(8, pop * 0.25) ? ' · many homes stand empty' : ''}`,
    `Market: ${marketJobs} market jobs, ${Math.round(marketWant)} wanted for ${pop} folk${craftN > 0 && craftFull > 0 ? ` · ${craftFull} of ${craftN} works cannot sell` : ''}`,
    `Craft: ${craftJobs} craft jobs, ${Math.round(craftWant)} wanted${state.goodsShort > 0 ? ` · ${state.goodsShort} markets ran dry` : ''}${unemployment > 0 ? ` · ${Math.round(unemployment * 100)} % idle hands` : ''}`,
    `Arcane: ${arcaneJobs} arcane jobs${state.educated < 0.2 ? ` · educated ${Math.round(state.educated * 100)} % (needs 20 %)` : ` · educated ${Math.round(state.educated * 100)} %`}`,
  ];
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  // smooth
  const s = state.demand;
  s.hearth = clamp(s.hearth * 0.6 + clamp(hearth) * 0.4);
  s.market = clamp(s.market * 0.6 + clamp(market) * 0.4);
  s.craft = clamp(s.craft * 0.6 + clamp(craft) * 0.4);
  s.arcane = clamp(s.arcane * 0.6 + clamp(arcane) * 0.4);
}

/** Educated share, health and unrest: resident-weighted coverage. */
export function updateSocial(state: GameState): void {
  let res = 0;
  let school = 0;
  let health = 0;
  let watch = 0;
  let miasma = 0;
  let water = 0;
  forEachBuilding(state, (b) => {
    const def = BUILDING_BY_KEY[b.kind];
    if (def.zone !== Zone.Hearth || b.state !== 'ok') return;
    const i = idx(b.x, b.y);
    const r = Math.max(1, b.residents);
    res += r;
    school += (state.coverage.school[i] / 255) * r;
    health += (state.coverage.health[i] / 255) * r;
    watch += (state.coverage.watch[i] / 255) * r;
    miasma += (state.miasma[i] / 255) * r;
    water += (b.watered ? 1 : 0) * r;
  });
  if (res === 0) return;
  const schoolCov = school / res;
  const healthCov = health / res;
  const watchCov = watch / res;
  const miasmaAvg = miasma / res;
  const waterCov = water / res;
  state.educated += (Math.min(0.95, 0.05 + state.educatedFloor + schoolCov * 0.85) - state.educated) * (0.08 + 0.04 * edictShare(state, 'scholars'));
  const targetHealth = Math.max(0, Math.min(1, 0.35 + healthCov * 0.45 + waterCov * 0.25 - miasmaAvg * 0.5 + 0.12 * edictShare(state, 'draughts') + modifierSum(state, 'health')));
  state.health += (targetHealth - state.health) * 0.15;
  const workforce = workforceOf(state);
  const unemployment = workforce > 0 ? Math.max(0, 1 - state.employed / workforce) : 0;
  const restless = state.agents.filter((a) => a.kind === 2).length;
  let uzulim = 0;
  for (let i = 0; i < state.wall.length; i++) if (state.wall[i] === 3) uzulim++;
  const targetUnrest = Math.max(
    0,
    Math.min(1, 0.08 + unemployment * 0.5 + (state.taxRates.hearth - 10) * 0.02 - watchCov * 0.35 + Math.min(0.4, restless * 0.02) + (state.happiness < 35 ? 0.15 : 0) + (idleScholars(state) ? IDLE_SCHOLARS : 0) - 0.1 * edictShare(state, 'curfew') - (scaleMailOn(state) ? SCALEMAIL_UNREST : 0) + modifierSum(state, 'unrest') + uzulim * 0.02),
  );
  state.unrest += (targetUnrest - state.unrest) * 0.2;
  state.unrestHigh = state.unrest > RIOT_UNREST ? state.unrestHigh + 1 : 0;
}

/** Unrest above this for RIOT_DAYS days in a row brings a riot. */
export const RIOT_UNREST = 0.5;
/** Idle scholars: more than half the city educated with Arcane work for fewer than an eighth of the folk. */
export const IDLE_SCHOLARS = 0.05;
export function idleScholars(state: GameState): boolean {
  if (state.educated <= 0.5) return false;
  let arcaneJobs = 0;
  forEachBuilding(state, (b) => { if (BUILDING_BY_KEY[b.kind].zone === Zone.Arcane && b.state === 'ok') arcaneJobs += capacityOf(b, state); });
  return arcaneJobs < state.population / 8;
}
/** Artifacts sell for +5 % per full tenth of the educated share above four tenths while a lit Grand Academy stands. */
export function grandAcademyBonus(state: GameState): number {
  if (!state.buildings.some((b) => b && b.kind === 'grandacademy' && b.state === 'ok' && b.lit)) return 1;
  return 1 + 0.05 * Math.floor(Math.max(0, state.educated - 0.4) / 0.1);
}
/** Markets lose a tenth of their shelves a night to theft while unrest is above this and the watch there under THEFT_WATCH. */
export const THEFT_UNREST = 0.3;
export const THEFT_WATCH = 0.3;
export function theftAt(state: GameState, b: Building): boolean {
  return state.unrest > THEFT_UNREST && state.coverage.watch[idx(b.x, b.y)] < THEFT_WATCH * 255;
}

export function tileHasLitNeighbor(state: GameState, x: number, y: number, r: number): boolean {
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      if (inBounds(tx, ty) && state.bIndex[idx(tx, ty)] >= 0) return true;
    }
  return false;
}

/** Trade Depot: sells surplus from full works and buyerless mines; imports for dry markets under the edict. */
export const RELIC_PRICE = 60;
export const RELIC_KEEP = 10;
export const RELICS_PER_DAY = 2;

export function dailyTrade(state: GameState): void {
  const t = state.trade;
  const season = seasonOf(state);
  // seasonal prices: potions dear in the Hush, leystone dear in Bloom (spire-wright season)
  t.priceGoods = [2, 2, 2.5, 3][season] * (1 + modifierSum(state, 'price'));
  t.priceLeystone = [3, 4, 3, 2.5][season];
  t.exported = 0;
  t.imported = 0;
  t.importCost = 0;
  const depots = state.buildings.filter((b) => b && (b.kind === 'depot' || (b.kind === 'cartersyard' && hallActive(state, 'cartersyard'))) && b.state === 'ok');
  if (!depots.length) return;
  const hasBuyers = state.buildings.some((b) => b && BUILDING_BY_KEY[b.kind].zone === Zone.Arcane && b.state === 'ok');
  let crowns = 0;
  const carters = guildEffect(state, 'carters');
  const perDepot = 8 * (carters > 0 ? 1.5 : carters < 0 ? 0.5 : 1);
  // the Gloam road carries 8 goods a day per depot, city-wide, from the fullest shelves first (DESIGN 4.22)
  let budget = perDepot * depots.length;
  const full: Building[] = [];
  forEachBuilding(state, (b) => {
    const def = BUILDING_BY_KEY[b.kind];
    if (b.state === 'ok' && ((def.zone === Zone.Craft || def.goodsRate) && b.stock >= craftStockCap(b) * 0.8 || (b.kind === 'hunterslodge' && b.stock >= 1))) full.push(b); // pelts go too
  });
  full.sort((a, b) => b.stock / craftStockCap(b) - a.stock / craftStockCap(a));
  for (const b of full) {
    if (budget <= 0) break;
    const sell = Math.min(b.kind === 'hunterslodge' ? b.stock : b.stock - craftStockCap(b) * 0.5, budget);
    if (sell > 0) {
      b.stock -= sell;
      budget -= sell;
      t.exported += sell;
      crowns += sell * t.priceGoods;
    }
  }
  forEachBuilding(state, (b) => {
    const def = BUILDING_BY_KEY[b.kind];
    if (b.state !== 'ok') return;
    if (def.leystone && !hasBuyers && b.stock >= 30) {
      const sell = Math.min(b.stock - 10, perDepot * depots.length);
      b.stock -= sell;
      t.exported += sell;
      crowns += sell * t.priceLeystone;
    }
  });
  // loose relics: the Crown buys up to two a day at the depot, leaving ten for the Academy
  t.relicsSold = 0;
  if (state.relicStock > RELIC_KEEP) {
    const n = Math.min(RELICS_PER_DAY, state.relicStock - RELIC_KEEP);
    state.relicStock -= n;
    t.relicsSold = n;
    state.stats.relicsSold += n;
    crowns += n * RELIC_PRICE;
  }
  if (edictOn(state, 'imports')) {
    forEachBuilding(state, (b) => {
      if (BUILDING_BY_KEY[b.kind].zone !== Zone.Market || b.state !== 'ok') return;
      if (b.stock > 2) return;
      const buy = Math.min(8, marketStockCap(b) - b.stock);
      b.stock += buy;
      t.imported += buy;
      t.importCost += buy * t.priceGoods * 2;
    });
  }
  if (hasMarvel(state, 'chartroom')) crowns *= 1.15;
  state.treasury += crowns; // exports are cash on the day
  t.exported = Math.round(t.exported);
  state.tradeIncomeToday = Math.round(crowns);
}
