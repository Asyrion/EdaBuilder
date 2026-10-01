/** Zoned building spawning, occupancy, happiness, levelling, abandonment, demand. */
import { BUILDING_BY_KEY, ZONE_KEY, isZoneUnlocked } from './catalog';
import { edictOn, edictShare, modifierSum, modifierSumAt } from './edicts';
import { guildEffect, hallActive } from './guilds';
import { relicDone } from './relics';
import { marketStockCap } from './agents';
import { seasonOf } from './world';
import { factionOf } from '../data/factions';
import { mothBonus } from './creatures';
import { wyrmGuards } from './wyrm';
import { GOLEM_LABOUR, boundGolems, raysLured } from './beasts';
import { aspectAt, hasMarvel, marvelNear } from './weave';

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
import { delverBonus, wyrmfireBonus } from './wyrmcraft';
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
export function computeBuildingHappiness(state: GameState, b: Building): number {
  const def = BUILDING_BY_KEY[b.kind];
  const i = idx(b.x, b.y);
  const cov = state.coverage;
  let h = 50;
  h += (state.landValue[i] - 30) * 0.3;
  h += (cov.faith[i] / 255) * 8 + (cov.leisure[i] / 255) * 8 + (cov.health[i] / 255) * 6 + (cov.watch[i] / 255) * 5;
  if (b.lit) h += 6;
  else h -= 9;
  if ((b.tended ?? -1) >= state.day) h += 4;
  if (b.watered) h += 6;
  else h -= 11;
  h -= (state.miasma[i] / 255) * 30;
  const gd = state.gloamDist[i];
  if (gd < 7) h -= (7 - gd) * 3 * (1 - cov.ward[i] / 255);
  h -= (state.trafficSmooth[i] / 255) * 10;
  h -= state.unrest * 15;
  // the restless and Gloam-hounds nearby frighten everyone
  for (const a of state.agents) {
    if (a.kind === 2) {
      if (Math.abs(a.x - b.x) < 4 && Math.abs(a.y - b.y) < 4) h -= 8;
    } else if (a.kind === 3 && a.species === 'hound') {
      if (Math.abs(a.x - b.x) < 3 && Math.abs(a.y - b.y) < 3) h -= 5;
    } else if (a.kind === 3 && a.species === 'golem' && a.load === 0) {
      if (Math.abs(a.x - b.x) < 4 && Math.abs(a.y - b.y) < 4) h -= 10;
    } else if (a.kind === 3 && a.species === 'tiger') {
      if (Math.abs(a.x - b.x) < 5 && Math.abs(a.y - b.y) < 5) h -= 12;
    }
  }
  let tax = 10;
  switch (def.zone) {
    case Zone.Hearth: tax = state.taxRates.hearth; break;
    case Zone.Market: tax = state.taxRates.market; break;
    case Zone.Craft: tax = state.taxRates.craft; break;
    case Zone.Arcane: tax = state.taxRates.arcane; break;
  }
  h -= (tax - 10) * 1.6;
  h += modifierSumAt(state, 'happiness', state.district[i]);
  if (wyrmGuards(state)) h += 10;
  const tree = worldTree(state);
  if (tree) h += treeStage(tree);
  if (raysLured(state)) h += 3;
  if (hasMarvel(state, 'hallofmarvels')) h += 8;
  if (relicDone(state, 'ninehouses')) h += 3;
  if (hasMarvel(state, 'househall')) h += 2;
  if (edictOn(state, 'curfew', b)) h -= 4;
  if (seasonOf(state) === 1) h += 2; // Bloom
  if (def.zone === Zone.Hearth) {
    const unemployment = state.population > 0 ? 1 - state.employed / Math.max(1, workforceOf(state)) : 0;
    h -= unemployment * 20;
    h += (state.health - 0.5) * 15;
  } else if (def.zone === Zone.Market) {
    // markets like customers, leisure and full shelves
    h += (cov.leisure[i] / 255) * 6;
    if (state.population < 20) h -= 8;
    const fill = b.stock / marketStockCap(b);
    if (fill <= 0.05) h -= 14;
    else if (fill > 0.5) h += 5;
    if (edictOn(state, 'lanternlevy', b)) h -= 6;
  } else if (def.zone === Zone.Craft) {
    h += 4; // industry tolerates more
    if (b.stock >= craftStockCap(b) * 0.95) h -= 10; // nobody is buying
  } else if (def.zone === Zone.Arcane) {
    h += (cov.school[i] / 255) * 10 - 6;
    if (b.stock <= 0.5 && b.age > 3) h -= 10; // no leystone to enchant
    else if (b.stock > 5) h += 4;
  }
  return Math.max(0, Math.min(100, h));
}

export function craftStockCap(b: Building): number {
  return 30 * b.level;
}

export function workforceOf(state: GameState): number {
  return Math.round(state.population * 0.62) + boundGolems(state) * GOLEM_LABOUR;
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
      if (def.goodsRate && b.state === 'ok') {
        const made = Math.min(craftStockCap(b) - b.stock, def.goodsRate * (b.lit ? 1 : 0.5));
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
    if (b.unhappyDays > 8 || b.dryDays > 14) {
      b.state = 'abandoned';
      b.stateDays = 0;
      b.residents = 0;
      b.workers = 0;
      markDirty(state, b.x, b.y);
      if (rng.chance(0.3)) pushMessage(state, `${def.name.split(' ')[0]} at (${b.x},${b.y}) abandoned: ${b.dryDays > 12 ? 'no mana or water' : 'nobody wants to stay'}.`, 'warn');
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
      const glim = glimhouseNear(state, b) || marvelNear(state, 'wyrmforge', b);
      const asp = aspectAt(state, b.x, b.y);
      let rate = 0.7 * (edictOn(state, 'herbgardens', b) ? 1.25 : 1) * (seasonOf(state) === 1 ? 1.15 : seasonOf(state) === 3 && !glim ? HUSH_CRAFT : 1) * (1 + mothBonus(state, b) + wyrmfireBonus(state) + (modifierSum(state, 'rain') > 0 ? 0.15 : 0) + modifierSum(state, 'goods') + (glim ? 0.1 : 0) + (asp === 'ember' ? 0.15 : 0) + guildEffect(state, 'alchemists') * (guildEffect(state, 'alchemists') > 0 ? 0.08 : 0.1) + (marvelNear(state, 'wyrmforge', b) ? 0.25 : 0));
      if (!b.lit) rate *= 0.5;
      const made = Math.min(craftStockCap(b) - b.stock, b.workers * rate);
      b.stock += Math.max(0, made);
      state.goodsProduced += Math.max(0, made);
    } else if (def.zone === Zone.Market) {
      const want = b.workers * 0.5 + 1;
      if (b.stock <= 0.5) state.goodsShort++;
      b.stock = Math.max(0, b.stock - want);
    } else if (def.zone === Zone.Arcane) {
      // enchanters turn leystone into artifacts sold for crowns
      const use = Math.min(b.stock, b.workers * 0.25 * (b.lit ? 1 : 0.3));
      b.stock -= use;
      state.artifactsSold += use * 5 * (delveActive(state) ? 1.15 : 1) * (state.materials.rayscale > 0 ? 1.1 : 1) * (hasMarvel(state, 'hallofmarvels') ? 1.5 + 0.05 * state.relics.complete.length : 1);
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
    if (def.leystone && b.state === 'ok') b.stock = Math.min(60, b.stock + def.leystone * (b.lit ? 1 : 0.5) + delverBonus(state, b));
  });
  state.population = pop;
  state.jobs = jobs;
  state.employed = employed;
  state.happiness = happyW > 0 ? happySum / happyW : 60;
  if (pop > state.stats.peakPopulation) state.stats.peakPopulation = pop;
  commitRng(state, rng);
}

/** Demand bars in [-1,1]. Recomputed every few seconds. */
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
  state.educated += (Math.min(0.95, 0.05 + schoolCov * 0.85) - state.educated) * (0.08 + 0.04 * edictShare(state, 'scholars'));
  const targetHealth = Math.max(0, Math.min(1, 0.35 + healthCov * 0.45 + waterCov * 0.25 - miasmaAvg * 0.5 + 0.12 * edictShare(state, 'draughts') + modifierSum(state, 'health')));
  state.health += (targetHealth - state.health) * 0.15;
  const workforce = workforceOf(state);
  const unemployment = workforce > 0 ? Math.max(0, 1 - state.employed / workforce) : 0;
  const restless = state.agents.filter((a) => a.kind === 2).length;
  let uzulim = 0;
  for (let i = 0; i < state.wall.length; i++) if (state.wall[i] === 3) uzulim++;
  const targetUnrest = Math.max(
    0,
    Math.min(1, 0.08 + unemployment * 0.5 + (state.taxRates.hearth - 10) * 0.02 - watchCov * 0.35 + Math.min(0.4, restless * 0.02) + (state.happiness < 35 ? 0.15 : 0) - 0.1 * edictShare(state, 'curfew') + modifierSum(state, 'unrest') + uzulim * 0.02),
  );
  state.unrest += (targetUnrest - state.unrest) * 0.2;
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
  forEachBuilding(state, (b) => {
    const def = BUILDING_BY_KEY[b.kind];
    if (b.state !== 'ok') return;
    if (def.zone === Zone.Craft && b.stock >= craftStockCap(b) * 0.8) {
      const sell = Math.min(b.stock - craftStockCap(b) * 0.5, perDepot * depots.length);
      if (sell > 0) {
        b.stock -= sell;
        t.exported += sell;
        crowns += sell * t.priceGoods;
      }
    } else if (def.leystone && !hasBuyers && b.stock >= 30) {
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
  state.artifactsSold += 0; // artifacts handled separately
  if (hasMarvel(state, 'chartroom')) crowns *= 1.15;
  state.treasury += crowns; // exports are cash on the day
  t.exported = Math.round(t.exported);
  state.tradeIncomeToday = Math.round(crowns);
}
