import { isCradle } from '../sim/wyrmcraft';
import { isFordTile } from '../sim/water';
/** The Charter's Ledger: guided goals for every mechanic. See DESIGN.md 4.27. */
import { AgentKind, Terrain, Zone, idx, type GameState } from '../sim/types';
import { BUILDING_BY_KEY } from '../sim/catalog';
import { factionKey, litShare, stoneQuarried, type FactionId, moorings } from './factions';
import { chose } from '../sim/events';
import { aspectAt } from '../sim/weave';
import { debtLine } from '../sim/economy';
import QUEST_TEXT from './content/text/quests.json';

export type Focus =
  | { tool: 'road' | 'zoneHearth' | 'zoneMarket' | 'zoneCraft' | 'zoneArcane' | 'wall' | 'gateBelregi' | 'district' }
  | { build: string }
  | { panel: 'edicts' | 'wyrms' | 'budget' | 'views' | 'chronicle' }
  | { overlay: string }
  | { center: 'founding' | 'gloam' | 'node' | 'cradle' | 'wyrm' | 'ruins' | 'cart' | 'greatgate' };

export interface QuestDef {
  id: string;
  chapter: string;
  title: string;
  hint: string;
  when: (s: GameState) => boolean;
  done: (s: GameState) => boolean;
  focus?: Focus;
  reward: number; // crowns
  priority: number; // lower first
  people?: FactionId; // a people's own chapter: shown and paid for that people only
  strict?: boolean; // completes only while `when` holds (a scenario's goal never pays in another game)
}

const hasCradle = (s: GameState) => s.buildings.some((b) => b && isCradle(b.kind) && b.state !== 'ruin' && b.state !== 'building');
/** Counts this people's building for a Vellish key (a Seep for 'well'), so the Charter's goals read for every people. */
const has = (s: GameState, kind0: string, n = 1) => { const kind = factionKey(s, kind0); return s.buildings.filter((b) => b && b.kind === kind && b.state !== 'ruin' && b.state !== 'building').length >= n; };
const onHills = (s: GameState, kind: string) => s.buildings.filter((b) => b && b.kind === kind && b.state === 'ok' && s.terrain[idx(b.x, b.y)] === Terrain.Hills).length;
const zoned = (s: GameState, z: Zone, n: number) => { let c = 0; for (let i = 0; i < s.zone.length; i++) if (s.zone[i] === z) c++; return c >= n; };
const roads = (s: GameState) => { let c = 0; for (let i = 0; i < s.road.length; i++) if (s.road[i]) c++; return c; };
const walls = (s: GameState) => { let c = 0; for (let i = 0; i < s.wall.length; i++) if (s.wall[i] === 1) c++; return c; };
const gates = (s: GameState) => { for (let i = 0; i < s.wall.length; i++) if (s.wall[i] >= 2) return true; return false; };
const belregiGates = (s: GameState) => { for (let i = 0; i < s.wall.length; i++) if (s.wall[i] === 2) return true; return false; };
const zoneBuildings = (s: GameState, z?: Zone) => s.buildings.filter((b) => b && BUILDING_BY_KEY[b.kind].category === 'zone' && b.state === 'ok' && (z === undefined || BUILDING_BY_KEY[b.kind].zone === z)) as NonNullable<GameState['buildings'][number]>[];
const unlit = (s: GameState) => zoneBuildings(s).filter((b) => !b.lit).length;
const dry = (s: GameState) => zoneBuildings(s).filter((b) => !b.watered).length;
const districts = (s: GameState) => { for (let i = 0; i < s.district.length; i++) if (s.district[i]) return true; return false; };

export const QUESTS: QuestDef[] = [
  // Founding
  { id: 'f_road', chapter: QUEST_TEXT.f_road.chapter, title: QUEST_TEXT.f_road.title, hint: QUEST_TEXT.f_road.hint, when: () => true, done: (s) => roads(s) > 8, focus: { tool: 'road' }, reward: 0, priority: 1 },
  { id: 'f_hearth', chapter: QUEST_TEXT.f_hearth.chapter, title: QUEST_TEXT.f_hearth.title, hint: QUEST_TEXT.f_hearth.hint, when: (s) => roads(s) > 8, done: (s) => zoned(s, Zone.Hearth, 6), focus: { tool: 'zoneHearth' }, reward: 0, priority: 2 },
  { id: 'f_jobs', chapter: QUEST_TEXT.f_jobs.chapter, title: QUEST_TEXT.f_jobs.title, hint: QUEST_TEXT.f_jobs.hint, when: (s) => zoned(s, Zone.Hearth, 6), done: (s) => zoned(s, Zone.Craft, 3) && zoned(s, Zone.Market, 2), focus: { tool: 'zoneCraft' }, reward: 0, priority: 3 },
  { id: 'f_spire', chapter: QUEST_TEXT.f_spire.chapter, title: QUEST_TEXT.f_spire.title, hint: QUEST_TEXT.f_spire.hint, when: (s) => zoned(s, Zone.Hearth, 6), done: (s) => has(s, 'spire'), focus: { build: 'spire' }, reward: 0, priority: 4 },
  { id: 'f_well', chapter: QUEST_TEXT.f_well.chapter, title: QUEST_TEXT.f_well.title, hint: QUEST_TEXT.f_well.hint, when: (s) => zoned(s, Zone.Hearth, 6), done: (s) => has(s, 'well'), focus: { build: 'well' }, reward: 0, priority: 5 },
  { id: 'f_watch', chapter: QUEST_TEXT.f_watch.chapter, title: QUEST_TEXT.f_watch.title, hint: QUEST_TEXT.f_watch.hint, when: (s) => s.population > 15, done: (s) => has(s, 'watchpost') && has(s, 'shrine'), focus: { build: 'watchpost' }, reward: 300, priority: 6 },
  { id: 'f_sector', chapter: QUEST_TEXT.f_sector.chapter, title: QUEST_TEXT.f_sector.title, hint: QUEST_TEXT.f_sector.hint, when: (s) => s.milestone >= 1 && s.sectors.some((v) => !v), done: (s) => s.stats.sectorsBought > 0, reward: 500, priority: 9 },
  { id: 'f_hamlet', chapter: QUEST_TEXT.f_hamlet.chapter, title: QUEST_TEXT.f_hamlet.title, hint: QUEST_TEXT.f_hamlet.hint, when: (s) => s.population > 15, done: (s) => s.milestone >= 1, reward: 0, priority: 7 },
  // Light and water
  { id: 'l_all', chapter: QUEST_TEXT.l_all.chapter, title: QUEST_TEXT.l_all.title, hint: QUEST_TEXT.l_all.hint, when: (s) => s.milestone >= 1 && unlit(s) > 0, done: (s) => unlit(s) === 0 && zoneBuildings(s).length > 10, focus: { overlay: 'mana' }, reward: 400, priority: 10 },
  { id: 'l_water', chapter: QUEST_TEXT.l_water.chapter, title: QUEST_TEXT.l_water.title, hint: QUEST_TEXT.l_water.hint, when: (s) => s.milestone >= 1 && dry(s) > 0, done: (s) => dry(s) === 0 && zoneBuildings(s).length > 10, focus: { overlay: 'water' }, reward: 400, priority: 11 },
  { id: 'l_cistern', chapter: QUEST_TEXT.l_cistern.chapter, title: QUEST_TEXT.l_cistern.title, hint: QUEST_TEXT.l_cistern.hint, when: (s) => s.milestone >= 2, done: (s) => has(s, 'cistern'), focus: { build: 'cistern' }, reward: 500, priority: 12 },
  { id: 'l_nexus', chapter: QUEST_TEXT.l_nexus.chapter, title: QUEST_TEXT.l_nexus.title, hint: QUEST_TEXT.l_nexus.hint, when: (s) => s.milestone >= 4, done: (s) => has(s, 'nexus'), focus: { build: 'nexus' }, reward: 800, priority: 30 },
  { id: 'l_font', chapter: QUEST_TEXT.l_font.chapter, title: QUEST_TEXT.l_font.title, hint: QUEST_TEXT.l_font.hint, when: (s) => s.milestone >= 4 && s.manaDemand > s.manaSupply * 0.8, done: (s) => has(s, 'font'), focus: { build: 'font' }, reward: 1000, priority: 31 },
  { id: 'l_deepen', chapter: QUEST_TEXT.l_deepen.chapter, title: QUEST_TEXT.l_deepen.title, hint: QUEST_TEXT.l_deepen.hint, when: (s) => s.milestone >= 6, done: (s) => s.nodes.some((n) => (n.depth ?? 0) > 0), focus: { center: 'node' }, reward: 1500, priority: 32 },
  // The dead
  { id: 'd_boneyard', chapter: QUEST_TEXT.d_boneyard.chapter, title: QUEST_TEXT.d_boneyard.title, hint: QUEST_TEXT.d_boneyard.hint, when: (s) => s.milestone >= 1, done: (s) => has(s, 'boneyard'), focus: { build: 'boneyard' }, reward: 400, priority: 8 },
  { id: 'd_restless', chapter: QUEST_TEXT.d_restless.chapter, title: QUEST_TEXT.d_restless.title, hint: QUEST_TEXT.d_restless.hint, when: (s) => s.agents.some((a) => a.kind === AgentKind.Restless), done: (s) => s.stats.restlessLaid > 0, focus: { build: 'watchpost' }, reward: 500, priority: 9 },
  { id: 'd_ossuary', chapter: QUEST_TEXT.d_ossuary.chapter, title: QUEST_TEXT.d_ossuary.title, hint: QUEST_TEXT.d_ossuary.hint, when: (s) => s.milestone >= 5, done: (s) => has(s, 'ossuary'), focus: { build: 'ossuary' }, reward: 800, priority: 40 },
  // The grey edge
  { id: 'g_ward', chapter: QUEST_TEXT.g_ward.chapter, title: QUEST_TEXT.g_ward.title, hint: QUEST_TEXT.g_ward.hint, when: (s) => s.milestone >= 2, done: (s) => has(s, 'wardlantern'), focus: { build: 'wardlantern' }, reward: 500, priority: 13 },
  { id: 'g_burn', chapter: QUEST_TEXT.g_burn.chapter, title: QUEST_TEXT.g_burn.title, hint: QUEST_TEXT.g_burn.hint, when: (s) => has(s, 'wardlantern'), done: (s) => s.stats.gloamBurned >= 50, focus: { overlay: 'ward' }, reward: 800, priority: 14 },
  { id: 'g_wall', chapter: QUEST_TEXT.g_wall.chapter, title: QUEST_TEXT.g_wall.title, hint: QUEST_TEXT.g_wall.hint, when: (s) => s.milestone >= 2 && (s.stats.houndsTotal > 0 || s.stats.gloamTiles > 2000), done: (s) => walls(s) >= 20, focus: { tool: 'wall' }, reward: 600, priority: 15 },
  { id: 'g_hounds', chapter: QUEST_TEXT.g_hounds.chapter, title: QUEST_TEXT.g_hounds.title, hint: QUEST_TEXT.g_hounds.hint, when: (s) => s.stats.houndsTotal > 0, done: (s) => s.stats.houndsKilled >= 10, focus: { build: 'hunterslodge' }, reward: 700, priority: 16 },
  { id: 'g_gate', chapter: QUEST_TEXT.g_gate.chapter, title: QUEST_TEXT.g_gate.title, hint: QUEST_TEXT.g_gate.hint, when: (s) => walls(s) >= 10 && s.milestone >= 3, done: (s) => gates(s), focus: { tool: 'gateBelregi' }, reward: 600, priority: 17 },
  { id: 'g_greatgate', chapter: QUEST_TEXT.g_greatgate.chapter, title: QUEST_TEXT.g_greatgate.title, hint: QUEST_TEXT.g_greatgate.hint, when: (s) => s.milestone >= 6 && belregiGates(s), done: (s) => has(s, 'greatgate'), focus: { build: 'greatgate' }, reward: 2000, priority: 18 },
  { id: 'g_heart', chapter: QUEST_TEXT.g_heart.chapter, title: QUEST_TEXT.g_heart.title, hint: QUEST_TEXT.g_heart.hint, when: (s) => has(s, 'greatgate'), done: (s) => s.heart.step >= 1, focus: { center: 'greatgate' }, reward: 1000, priority: 19 },
  // Goods
  { id: 'o_cart', chapter: QUEST_TEXT.o_cart.chapter, title: QUEST_TEXT.o_cart.title, hint: QUEST_TEXT.o_cart.hint, when: (s) => zoneBuildings(s, Zone.Craft).length > 0 && zoneBuildings(s, Zone.Market).length > 0, done: (s) => s.stats.goodsDelivered > 0, focus: { center: 'cart' }, reward: 200, priority: 18 },
  { id: 'o_full', chapter: QUEST_TEXT.o_full.chapter, title: QUEST_TEXT.o_full.title, hint: QUEST_TEXT.o_full.hint, when: (s) => s.goodsShort > 0, done: (s) => s.stats.fullDays >= 5 && zoneBuildings(s, Zone.Market).length > 3 && s.day > 20, focus: { overlay: 'goods' }, reward: 600, priority: 19 },
  { id: 'o_depot', chapter: QUEST_TEXT.o_depot.chapter, title: QUEST_TEXT.o_depot.title, hint: QUEST_TEXT.o_depot.hint, when: (s) => s.milestone >= 3, done: (s) => has(s, 'depot'), focus: { build: 'depot' }, reward: 700, priority: 20 },
  { id: 'o_caravan', chapter: QUEST_TEXT.o_caravan.chapter, title: QUEST_TEXT.o_caravan.title, hint: QUEST_TEXT.o_caravan.hint, when: (s) => has(s, 'depot'), done: (s) => s.stats.caravanGoods >= 200, reward: 900, priority: 21 },
  // Schooling and the arcane
  { id: 'a_academy', chapter: QUEST_TEXT.a_academy.chapter, title: QUEST_TEXT.a_academy.title, hint: QUEST_TEXT.a_academy.hint, when: (s) => s.milestone >= 3, done: (s) => s.educated >= 0.3, focus: { build: 'academy' }, reward: 800, priority: 22 },
  { id: 'a_arcane', chapter: QUEST_TEXT.a_arcane.chapter, title: QUEST_TEXT.a_arcane.title, hint: QUEST_TEXT.a_arcane.hint, when: (s) => s.milestone >= 4, done: (s) => zoneBuildings(s, Zone.Arcane).length > 0, focus: { tool: 'zoneArcane' }, reward: 800, priority: 23 },
  { id: 'a_mine', chapter: QUEST_TEXT.a_mine.chapter, title: QUEST_TEXT.a_mine.title, hint: QUEST_TEXT.a_mine.hint, when: (s) => s.milestone >= 4, done: (s) => has(s, 'mine'), focus: { build: 'mine' }, reward: 800, priority: 24 },
  { id: 'a_artifact', chapter: QUEST_TEXT.a_artifact.chapter, title: QUEST_TEXT.a_artifact.title, hint: QUEST_TEXT.a_artifact.hint, when: (s) => has(s, 'mine') && zoneBuildings(s, Zone.Arcane).length > 0, done: (s) => s.artifactsSold > 0, focus: { panel: 'budget' }, reward: 800, priority: 25 },
  // Districts
  { id: 'x_paint', chapter: QUEST_TEXT.x_paint.chapter, title: QUEST_TEXT.x_paint.title, hint: QUEST_TEXT.x_paint.hint, when: (s) => s.milestone >= 1, done: (s) => districts(s), focus: { tool: 'district' }, reward: 300, priority: 26 },
  { id: 'x_charter', chapter: QUEST_TEXT.x_charter.chapter, title: QUEST_TEXT.x_charter.title, hint: QUEST_TEXT.x_charter.hint, when: (s) => districts(s), done: (s) => Object.values(s.districtQuarters).some(Boolean), focus: { panel: 'edicts' }, reward: 400, priority: 27 },
  { id: 'x_pay', chapter: QUEST_TEXT.x_pay.chapter, title: QUEST_TEXT.x_pay.title, hint: QUEST_TEXT.x_pay.hint, when: (s) => Object.values(s.districtQuarters).some(Boolean), done: (s) => s.stats.quarterDays >= 2, focus: { panel: 'edicts' }, reward: 300, priority: 28 },
  { id: 'x_edict', chapter: QUEST_TEXT.x_edict.chapter, title: QUEST_TEXT.x_edict.title, hint: QUEST_TEXT.x_edict.hint, when: (s) => districts(s), done: (s) => Object.values(s.districtEdicts).some(Boolean), focus: { panel: 'edicts' }, reward: 400, priority: 29 },
  // Seasons
  { id: 's_brownout', chapter: QUEST_TEXT.s_brownout.chapter, title: QUEST_TEXT.s_brownout.title, hint: QUEST_TEXT.s_brownout.hint, when: (s) => s.overdrawDays > 0, done: (s) => s.stats.brownoutsSurvived > 0, focus: { build: 'nexus' }, reward: 600, priority: 33 },
  { id: 'x_rename', chapter: QUEST_TEXT.x_rename.chapter, title: QUEST_TEXT.x_rename.title, hint: QUEST_TEXT.x_rename.hint, when: (s) => districts(s), done: (s) => Object.values(s.districtNames).some((n) => !s.daughter || n !== s.daughter.name), focus: { panel: 'edicts' }, reward: 200, priority: 30 },
  { id: 's_vigil', chapter: QUEST_TEXT.s_vigil.chapter, title: QUEST_TEXT.s_vigil.title, hint: QUEST_TEXT.s_vigil.hint, when: (s) => s.day >= 85, done: (s) => chose(s, 'vigil', 0), reward: 800, priority: 51 },
  { id: 's_feast', chapter: QUEST_TEXT.s_feast.chapter, title: QUEST_TEXT.s_feast.title, hint: QUEST_TEXT.s_feast.hint, when: (s) => s.day >= 110, done: (s) => chose(s, 'thawday', 0), reward: 600, priority: 52 },
  { id: 'b_moths', chapter: QUEST_TEXT.b_moths.chapter, title: QUEST_TEXT.b_moths.title, hint: QUEST_TEXT.b_moths.hint, when: (s) => s.milestone >= 1, done: (s) => s.stats.mothsSeen > 0, focus: { center: 'node' }, reward: 100, priority: 27 },
  { id: 'b_wisps', chapter: QUEST_TEXT.b_wisps.chapter, title: QUEST_TEXT.b_wisps.title, hint: QUEST_TEXT.b_wisps.hint, when: (s) => s.unquieted > 10, done: (s) => s.stats.wispRing > 0, reward: 300, priority: 41 },
  { id: 's_hush', chapter: QUEST_TEXT.s_hush.chapter, title: QUEST_TEXT.s_hush.title, hint: QUEST_TEXT.s_hush.hint, when: (s) => s.day >= 60, done: (s) => s.day >= 120, reward: 1500, priority: 50 },
  // Beasts
  { id: 'b_loft', chapter: QUEST_TEXT.b_loft.chapter, title: QUEST_TEXT.b_loft.title, hint: QUEST_TEXT.b_loft.hint, when: (s) => s.milestone >= 2, done: (s) => has(s, 'mothloft'), focus: { build: 'mothloft' }, reward: 500, priority: 28 },
  // Wyrmcraft
  { id: 'w_cradle', chapter: QUEST_TEXT.w_cradle.chapter, title: QUEST_TEXT.w_cradle.title, hint: QUEST_TEXT.w_cradle.hint, when: (s) => s.milestone >= 4, done: (s) => hasCradle(s) && has(s, 'tamerslodge'), focus: { build: 'cradle' }, reward: 1000, priority: 33 },
  { id: 'w_egg', chapter: QUEST_TEXT.w_egg.chapter, title: QUEST_TEXT.w_egg.title, hint: QUEST_TEXT.w_egg.hint, when: (s) => hasCradle(s), done: (s) => s.dragons.length > 0, focus: { panel: 'wyrms' }, reward: 0, priority: 34 },
  { id: 'w_hatch', chapter: QUEST_TEXT.w_hatch.chapter, title: QUEST_TEXT.w_hatch.title, hint: QUEST_TEXT.w_hatch.hint, when: (s) => s.dragons.length > 0, done: (s) => s.dragons.some((d) => d.stage >= 1) || s.materials.eggshell > 0, focus: { panel: 'wyrms' }, reward: 800, priority: 35 },
  { id: 'w_role', chapter: QUEST_TEXT.w_role.chapter, title: QUEST_TEXT.w_role.title, hint: QUEST_TEXT.w_role.hint, when: (s) => s.dragons.some((d) => d.stage >= 2), done: (s) => s.dragons.some((d) => d.role !== 'none'), focus: { panel: 'wyrms' }, reward: 1000, priority: 36 },
  { id: 'w_courier', chapter: QUEST_TEXT.w_courier.chapter, title: QUEST_TEXT.w_courier.title, hint: QUEST_TEXT.w_courier.hint, when: (s) => s.dragons.some((d) => d.stage >= 3), done: (s) => s.stats.courierTrips > 0, focus: { panel: 'wyrms' }, reward: 1500, priority: 37 },
  { id: 'w_ring', chapter: QUEST_TEXT.w_ring.chapter, title: QUEST_TEXT.w_ring.title, hint: QUEST_TEXT.w_ring.hint, when: (s) => s.dragons.some((d) => d.stage >= 2) && s.milestone >= 5, done: (s) => s.stats.boutsWon > 0, focus: { build: 'ring' }, reward: 2000, priority: 38 },
  // Huruhui and Gekiryu craft
  { id: 'k_mill', chapter: QUEST_TEXT.k_mill.chapter, title: QUEST_TEXT.k_mill.title, hint: QUEST_TEXT.k_mill.hint, when: (s) => s.milestone >= 4, done: (s) => has(s, 'torrentmill'), focus: { build: 'torrentmill' }, reward: 800, priority: 29 },
  { id: 'k_glim', chapter: QUEST_TEXT.k_glim.chapter, title: QUEST_TEXT.k_glim.title, hint: QUEST_TEXT.k_glim.hint, when: (s) => s.milestone >= 3 && zoneBuildings(s, Zone.Craft).length >= 3, done: (s) => has(s, 'glimhouse'), focus: { build: 'glimhouse' }, reward: 500, priority: 39 },
  { id: 'k_gardens', chapter: QUEST_TEXT.k_gardens.chapter, title: QUEST_TEXT.k_gardens.title, hint: QUEST_TEXT.k_gardens.hint, when: (s) => s.milestone >= 4, done: (s) => has(s, 'hanginggardens'), focus: { build: 'hanginggardens' }, reward: 800, priority: 46 },
  { id: 'k_glowvine', chapter: QUEST_TEXT.k_glowvine.chapter, title: QUEST_TEXT.k_glowvine.title, hint: QUEST_TEXT.k_glowvine.hint, when: (s) => has(s, 'hanginggardens'), done: (s) => { let c = 0; for (let i = 0; i < s.road.length; i++) if (s.road[i] === 4) c++; return c >= 12; }, focus: { tool: 'road' }, reward: 600, priority: 47 },
  { id: 'k_obs', chapter: QUEST_TEXT.k_obs.chapter, title: QUEST_TEXT.k_obs.title, hint: QUEST_TEXT.k_obs.hint, when: (s) => s.milestone >= 5, done: (s) => has(s, 'observatory'), focus: { build: 'observatory' }, reward: 1000, priority: 48 },
  // Longwood and Lukuku
  { id: 'p_arch', chapter: QUEST_TEXT.p_arch.chapter, title: QUEST_TEXT.p_arch.title, hint: QUEST_TEXT.p_arch.hint, when: (s) => s.milestone >= 5, done: (s) => has(s, 'portalarch', 2), focus: { build: 'portalarch' }, reward: 1200, priority: 49 },
  { id: 'r_delve', chapter: QUEST_TEXT.r_delve.chapter, title: QUEST_TEXT.r_delve.title, hint: QUEST_TEXT.r_delve.hint, when: (s) => s.milestone >= 4 && s.terrain.some((t) => t === 8), done: (s) => has(s, 'ruindelve'), focus: { center: 'ruins' }, reward: 800, priority: 50 },
  { id: 't_plant', chapter: QUEST_TEXT.t_plant.chapter, title: QUEST_TEXT.t_plant.title, hint: QUEST_TEXT.t_plant.hint, when: (s) => s.milestone >= 7, done: (s) => has(s, 'worldtree'), focus: { build: 'worldtree' }, reward: 2000, priority: 67 },
  { id: 't_grown', chapter: QUEST_TEXT.t_grown.chapter, title: QUEST_TEXT.t_grown.title, hint: QUEST_TEXT.t_grown.hint, when: (s) => has(s, 'worldtree'), done: (s) => s.buildings.some((b) => b && b.kind === 'worldtree' && b.age >= 90), reward: 3000, priority: 68 },
  // Beasts
  { id: 'e_foundry', chapter: QUEST_TEXT.e_foundry.chapter, title: QUEST_TEXT.e_foundry.title, hint: QUEST_TEXT.e_foundry.hint, when: (s) => s.stats.golemsWoken > 0, done: (s) => s.stats.golemsBound > 0, focus: { build: 'golemfoundry' }, reward: 1500, priority: 51 },
  { id: 'e_beacon', chapter: QUEST_TEXT.e_beacon.chapter, title: QUEST_TEXT.e_beacon.title, hint: QUEST_TEXT.e_beacon.hint, when: (s) => s.milestone >= 6, done: (s) => s.stats.rayscaleTotal > 0, focus: { build: 'leybeacon' }, reward: 1500, priority: 52 },
  { id: 'e_mews', chapter: QUEST_TEXT.e_mews.chapter, title: QUEST_TEXT.e_mews.title, hint: QUEST_TEXT.e_mews.hint, when: (s) => s.milestone >= 6 && has(s, 'watchhouse'), done: (s) => has(s, 'drakemews'), focus: { build: 'drakemews' }, reward: 800, priority: 53 },
  { id: 'e_edict', chapter: QUEST_TEXT.e_edict.chapter, title: QUEST_TEXT.e_edict.title, hint: QUEST_TEXT.e_edict.hint, when: (s) => s.milestone >= 4, done: (s) => !!(s.edicts.beastmasters || s.edicts.bounty || s.edicts.wyrmpeace) || Object.keys(s.districtEdicts).some((k) => s.districtEdicts[k] && /:(beastmasters|bounty|wyrmpeace)$/.test(k)), focus: { panel: 'edicts' }, reward: 400, priority: 54 },
  // Vehicles
  { id: 'q_quay', chapter: QUEST_TEXT.q_quay.chapter, title: QUEST_TEXT.q_quay.title, hint: QUEST_TEXT.q_quay.hint, when: (s) => s.milestone >= 3 && zoneBuildings(s, Zone.Market).length > 2, done: (s) => s.stats.bargeTrips > 0, focus: { build: 'quay' }, reward: 700, priority: 55 },
  { id: 'q_float', chapter: QUEST_TEXT.q_float.chapter, title: QUEST_TEXT.q_float.title, hint: QUEST_TEXT.q_float.hint, when: (s) => zoneBuildings(s, Zone.Arcane).length > 0, done: (s) => s.agents.some((a) => a.kind === 1 && a.variant === 3), reward: 600, priority: 56 },
  { id: 'q_rider', chapter: QUEST_TEXT.q_rider.chapter, title: QUEST_TEXT.q_rider.title, hint: QUEST_TEXT.q_rider.hint, when: (s) => has(s, 'drakemews'), done: (s) => s.stats.riderRescues > 0, focus: { build: 'drakemews' }, reward: 800, priority: 57 },
  { id: 'q_airship', chapter: QUEST_TEXT.q_airship.chapter, title: QUEST_TEXT.q_airship.title, hint: QUEST_TEXT.q_airship.hint, when: (s) => s.milestone >= 8, done: (s) => s.stats.airshipVoyages > 0, focus: { build: 'skydock' }, reward: 3000, priority: 69 },
  { id: 'w_meat', chapter: QUEST_TEXT.w_meat.chapter, title: QUEST_TEXT.w_meat.title, hint: QUEST_TEXT.w_meat.hint, when: (s) => s.milestone >= 2 && s.wild.herds.length > 0, done: (s) => s.wild.meatAt.length > 0, focus: { build: 'hunterslodge' }, reward: 600, priority: 57 },
  // the water (iteration 60)
  { id: 'w_fish', chapter: QUEST_TEXT.w_fish.chapter, title: QUEST_TEXT.w_fish.title, hint: QUEST_TEXT.w_fish.hint, when: (s) => s.milestone >= 1, done: (s) => s.water.fishAt.length > 0, focus: { build: 'fishershut' }, reward: 400, priority: 57 },
  { id: 'w_thatch', chapter: QUEST_TEXT.w_thatch.chapter, title: QUEST_TEXT.w_thatch.title, hint: QUEST_TEXT.w_thatch.hint, when: (s) => s.milestone >= 1, done: (s) => s.stats.homesThatched >= 10, focus: { build: 'reedcutters' }, reward: 400, priority: 58 },
  { id: 'w_wyrm', chapter: QUEST_TEXT.w_wyrm.chapter, title: QUEST_TEXT.w_wyrm.title, hint: QUEST_TEXT.w_wyrm.hint, when: (s) => (s.stats.wyrmsLaired ?? 0) > 0, done: (s) => (s.stats.wyrmsDriven ?? 0) > 0, focus: { build: 'veshari' }, reward: 400, priority: 57 },
  { id: 'w_ford', chapter: QUEST_TEXT.w_ford.chapter, title: QUEST_TEXT.w_ford.title, hint: QUEST_TEXT.w_ford.hint, when: (s) => s.milestone >= 1 && s.day >= 5, done: (s) => { for (let i = 0; i < s.road.length; i++) if (s.road[i] && isFordTile(s, i)) return true; return false; }, focus: { tool: 'road' }, reward: 300, priority: 58 },
  // Longwood and the Fen-Nex
  { id: 'n_tiger', chapter: QUEST_TEXT.n_tiger.chapter, title: QUEST_TEXT.n_tiger.title, hint: QUEST_TEXT.n_tiger.hint, when: (s) => s.stats.tigersTotal > 0, done: (s) => s.stats.tigersKilled > 0, focus: { build: 'hunterslodge' }, reward: 1200, priority: 58 },
  { id: 'n_font', chapter: QUEST_TEXT.n_font.chapter, title: QUEST_TEXT.n_font.title, hint: QUEST_TEXT.n_font.hint, when: (s) => s.milestone >= 7, done: (s) => has(s, 'fontquieting'), focus: { build: 'fontquieting' }, reward: 1500, priority: 59 },
  { id: 'n_storm', chapter: QUEST_TEXT.n_storm.chapter, title: QUEST_TEXT.n_storm.title, hint: QUEST_TEXT.n_storm.hint, when: (s) => s.storms.length > 0, done: (s) => s.stats.stormsDissolved > 0, focus: { overlay: 'ward' }, reward: 800, priority: 60 },
  // The ley-weave
  { id: 'y_attune', chapter: QUEST_TEXT.y_attune.chapter, title: QUEST_TEXT.y_attune.title, hint: QUEST_TEXT.y_attune.hint, when: (s) => s.dragons.length > 0, done: (s) => s.dragons.some((d) => { const c = s.buildings.find((b) => b && b.id === d.cradleId); return !!c && aspectAt(s, c.x, c.y) === d.line; }), focus: { center: 'cradle' }, reward: 600, priority: 36 },
  { id: 'y_marvel', chapter: QUEST_TEXT.y_marvel.chapter, title: QUEST_TEXT.y_marvel.title, hint: QUEST_TEXT.y_marvel.hint, when: (s) => s.milestone >= 4 && (s.materials.scale > 0 || s.materials.rayscale > 0 || s.materials.glimdust > 0), done: (s) => s.stats.marvels > 0, focus: { build: 'scaleward' }, reward: 1000, priority: 49 },
  { id: 'y_quiet', chapter: QUEST_TEXT.y_quiet.chapter, title: QUEST_TEXT.y_quiet.title, hint: QUEST_TEXT.y_quiet.hint, when: (s) => s.day >= 60, done: (s) => s.stats.quietHush > 0, focus: { build: 'shrine' }, reward: 1500, priority: 42 },
  // The guilds, the feast and the routes
  { id: 'k_council', chapter: QUEST_TEXT.k_council.chapter, title: QUEST_TEXT.k_council.title, hint: QUEST_TEXT.k_council.hint, when: (s) => s.milestone >= 5, done: (s) => s.stats.councils > 0, focus: { build: 'guildhall' }, reward: 500, priority: 50 },
  { id: 'k_boon', chapter: QUEST_TEXT.k_boon.chapter, title: QUEST_TEXT.k_boon.title, hint: QUEST_TEXT.k_boon.hint, when: (s) => s.stats.councils > 0, done: (s) => Object.values(s.guilds.standing).some((v) => v >= 70), focus: { panel: 'edicts' }, reward: 1000, priority: 51 },
  { id: 'k_feast', chapter: QUEST_TEXT.k_feast.chapter, title: QUEST_TEXT.k_feast.title, hint: QUEST_TEXT.k_feast.hint, when: (s) => s.day >= 100, done: (s) => s.stats.feastGoods >= 10, focus: { tool: 'zoneMarket' }, reward: 600, priority: 52 },
  { id: 'k_twinroad', chapter: QUEST_TEXT.k_twinroad.chapter, title: QUEST_TEXT.k_twinroad.title, hint: QUEST_TEXT.k_twinroad.hint, when: (s) => !!s.daughter, done: (s) => s.stats.twinGoods > 0, focus: { build: 'depot' }, reward: 1500, priority: 53 },
  { id: 'k_hall', chapter: QUEST_TEXT.k_hall.chapter, title: QUEST_TEXT.k_hall.title, hint: QUEST_TEXT.k_hall.hint, when: (s) => s.stats.councils > 0, done: (s) => s.stats.guildHalls > 0, focus: { panel: 'edicts' }, reward: 1200, priority: 54 },
  { id: 'k_cross', chapter: QUEST_TEXT.k_cross.chapter, title: QUEST_TEXT.k_cross.title, hint: QUEST_TEXT.k_cross.hint, when: (s) => s.dragons.filter((d) => d.stage >= 2).length >= 2, done: (s) => s.stats.crossEggs > 0, focus: { center: 'cradle' }, reward: 1500, priority: 55 },
  { id: 'k_relics', chapter: QUEST_TEXT.k_relics.chapter, title: QUEST_TEXT.k_relics.title, hint: QUEST_TEXT.k_relics.hint, when: (s) => s.stats.relics >= 12, done: (s) => s.relics.complete.length > 0, focus: { build: 'academy' }, reward: 2000, priority: 56 },
  { id: 'k_blood', chapter: QUEST_TEXT.k_blood.chapter, title: QUEST_TEXT.k_blood.title, hint: QUEST_TEXT.k_blood.hint, when: (s) => s.dragons.filter((d) => d.second && d.stage >= 2).length >= 2, done: (s) => s.stats.truebloods > 0, focus: { center: 'cradle' }, reward: 2500, priority: 57 },
  { id: 'k_relicbuild', chapter: QUEST_TEXT.k_relicbuild.chapter, title: QUEST_TEXT.k_relicbuild.title, hint: QUEST_TEXT.k_relicbuild.hint, when: (s) => s.relics.complete.length > 0, done: (s) => s.buildings.some((b) => !!b && !!BUILDING_BY_KEY[b.kind].relic && b.state === 'ok'), focus: { build: 'corelantern' }, reward: 1500, priority: 58 },
  { id: 'k_wyrm', chapter: QUEST_TEXT.k_wyrm.chapter, title: QUEST_TEXT.k_wyrm.title, hint: QUEST_TEXT.k_wyrm.hint, when: (s) => s.dragons.some((d) => d.trueblood && d.stage >= 3), done: (s) => s.stats.greatWyrms > 0, focus: { panel: 'wyrms' }, reward: 4000, priority: 59 },
  { id: 'k_assessor', chapter: QUEST_TEXT.k_assessor.chapter, title: QUEST_TEXT.k_assessor.title, hint: QUEST_TEXT.k_assessor.hint, when: (s) => s.relicStock >= 6, done: (s) => s.stats.relicsSold > 0, focus: { build: 'depot' }, reward: 800, priority: 60 },
  { id: 'k_charter', chapter: QUEST_TEXT.k_charter.chapter, title: QUEST_TEXT.k_charter.title, hint: QUEST_TEXT.k_charter.hint, when: (s) => s.stats.guildWars > 0 || s.stats.councils >= 3, done: (s) => s.stats.guildCharters > 0, focus: { panel: 'edicts' }, reward: 1500, priority: 61 },
  { id: 'k_duel', chapter: QUEST_TEXT.k_duel.chapter, title: QUEST_TEXT.k_duel.title, hint: QUEST_TEXT.k_duel.hint, when: (s) => s.stats.greatWyrms > 0 && s.wyrm.state !== 'none', done: (s) => s.stats.wyrmDuels > 0, focus: { center: 'wyrm' }, reward: 3000, priority: 62 },
  { id: 'w_patrol', chapter: QUEST_TEXT.w_patrol.chapter, title: QUEST_TEXT.w_patrol.title, hint: QUEST_TEXT.w_patrol.hint, when: (s) => has(s, 'watchhouse') || has(s, 'watchpost'), done: (s) => s.stats.walkerKills + s.stats.walkerLayings > 0, focus: { overlay: 'watch' }, reward: 400, priority: 24 },
  { id: 'w_sexton', chapter: QUEST_TEXT.w_sexton.chapter, title: QUEST_TEXT.w_sexton.title, hint: QUEST_TEXT.w_sexton.hint, when: (s) => has(s, 'boneyard') || has(s, 'ossuary'), done: (s) => s.stats.walkerLayings > 0 && s.agents.some((a) => a.kind === 5 && a.job === 'sexton') || s.stats.walkerLayings > 2, focus: { overlay: 'death' }, reward: 400, priority: 25 },
  { id: 'w_healer', chapter: QUEST_TEXT.w_healer.chapter, title: QUEST_TEXT.w_healer.title, hint: QUEST_TEXT.w_healer.hint, when: (s) => has(s, 'healer') || has(s, 'hospice'), done: (s) => s.stats.healerVisits > 0, focus: { overlay: 'health' }, reward: 400, priority: 26 },
  { id: 'w_warden', chapter: QUEST_TEXT.w_warden.chapter, title: QUEST_TEXT.w_warden.title, hint: QUEST_TEXT.w_warden.hint, when: (s) => s.milestone >= 2 && s.buildings.filter((b) => b && (b.kind === 'spire' || b.kind === 'nexus')).length >= 2, done: (s) => s.stats.wardenRounds > 0, focus: { panel: 'edicts' }, reward: 600, priority: 27 },
  { id: 'w_scholar', chapter: QUEST_TEXT.w_scholar.chapter, title: QUEST_TEXT.w_scholar.title, hint: QUEST_TEXT.w_scholar.hint, when: (s) => (has(s, 'academy') || has(s, 'grandacademy')) && has(s, 'ruindelve'), done: (s) => s.stats.scholarTrips > 0, focus: { build: 'academy' }, reward: 600, priority: 51 },
  { id: 'w_tamer', chapter: QUEST_TEXT.w_tamer.chapter, title: QUEST_TEXT.w_tamer.title, hint: QUEST_TEXT.w_tamer.hint, when: (s) => has(s, 'tamerslodge') && hasCradle(s), done: (s) => s.stats.tamerVisits > 0, focus: { build: 'tamerslodge' }, reward: 500, priority: 37 },
  { id: 'w_pilgrim', chapter: QUEST_TEXT.w_pilgrim.chapter, title: QUEST_TEXT.w_pilgrim.title, hint: QUEST_TEXT.w_pilgrim.hint, when: (s) => s.buildings.filter((b) => b && (b.kind === 'shrine' || b.kind === 'temple') && b.state === 'ok').length >= 2, done: (s) => s.stats.pilgrimPrayers > 0, focus: { overlay: 'faith' }, reward: 400, priority: 28 },
  // The Underhill (the Grimmen's own chapter)
  { id: 'u_cut', chapter: QUEST_TEXT.u_cut.chapter, people: 'grimmen', title: QUEST_TEXT.u_cut.title, hint: QUEST_TEXT.u_cut.hint, when: (s) => s.faction === 'grimmen', done: (s) => stoneQuarried(s) >= 2, focus: { tool: 'zoneHearth' }, reward: 300, priority: 2 },
  { id: 'u_seep', chapter: QUEST_TEXT.u_seep.chapter, people: 'grimmen', title: QUEST_TEXT.u_seep.title, hint: QUEST_TEXT.u_seep.hint, when: (s) => s.faction === 'grimmen', done: (s) => has(s, 'seep'), focus: { build: 'seep' }, reward: 300, priority: 3 },
  { id: 'u_street', chapter: QUEST_TEXT.u_street.chapter, people: 'grimmen', title: QUEST_TEXT.u_street.title, hint: QUEST_TEXT.u_street.hint, when: (s) => s.faction === 'grimmen', done: (s) => onHills(s, 'hearth') >= 6, focus: { tool: 'zoneHearth' }, reward: 500, priority: 6 },
  { id: 'u_ward', chapter: QUEST_TEXT.u_ward.chapter, people: 'grimmen', title: QUEST_TEXT.u_ward.title, hint: QUEST_TEXT.u_ward.hint, when: (s) => s.faction === 'grimmen' && s.milestone >= 2, done: (s) => has(s, 'stoneward'), focus: { build: 'stoneward' }, reward: 500, priority: 12 },
  { id: 'u_gallery', chapter: QUEST_TEXT.u_gallery.chapter, people: 'grimmen', title: QUEST_TEXT.u_gallery.title, hint: QUEST_TEXT.u_gallery.hint, when: (s) => s.faction === 'grimmen', done: (s) => s.milestone >= 2, focus: { center: 'founding' }, reward: 800, priority: 14 },
  { id: 'u_hatch', chapter: QUEST_TEXT.u_hatch.chapter, people: 'grimmen', title: QUEST_TEXT.u_hatch.title, hint: QUEST_TEXT.u_hatch.hint, when: (s) => s.faction === 'grimmen' && s.milestone >= 4, done: (s) => s.dragons.some((d) => { const c = s.buildings.find((b) => b && b.id === d.cradleId); return !!c && c.kind === 'hatchery'; }), focus: { build: 'hatchery' }, reward: 1000, priority: 36 },
  { id: 'u_forge', chapter: QUEST_TEXT.u_forge.chapter, people: 'grimmen', title: QUEST_TEXT.u_forge.title, hint: QUEST_TEXT.u_forge.hint, when: (s) => s.faction === 'grimmen' && s.milestone >= 6, done: (s) => has(s, 'forgetemple') && s.stats.golemsBound > 0, focus: { build: 'forgetemple' }, reward: 1500, priority: 52 },
  { id: 'u_seat', chapter: QUEST_TEXT.u_seat.chapter, people: 'grimmen', title: QUEST_TEXT.u_seat.title, hint: QUEST_TEXT.u_seat.hint, when: (s) => s.faction === 'grimmen' && s.milestone >= 7, done: (s) => has(s, 'underkingseat'), focus: { build: 'underkingseat' }, reward: 5000, priority: 70 },
  // The Sable: the Veshari's own chapter
  { id: 'v_well', chapter: QUEST_TEXT.v_well.chapter, people: 'veshari', title: QUEST_TEXT.v_well.title, hint: QUEST_TEXT.v_well.hint, when: (s) => s.faction === 'veshari', done: (s) => has(s, 'tidewell'), focus: { build: 'tidewell' }, reward: 300, priority: 3 },
  { id: 'v_landings', chapter: QUEST_TEXT.v_landings.chapter, people: 'veshari', title: QUEST_TEXT.v_landings.title, hint: QUEST_TEXT.v_landings.hint, when: (s) => s.faction === 'veshari', done: (s) => moorings(s) >= 2, focus: { build: 'landing' }, reward: 400, priority: 5 },
  { id: 'v_barge', chapter: QUEST_TEXT.v_barge.chapter, people: 'veshari', title: QUEST_TEXT.v_barge.title, hint: QUEST_TEXT.v_barge.hint, when: (s) => s.faction === 'veshari', done: (s) => s.stats.bargeTrips >= 1, focus: { build: 'landing' }, reward: 500, priority: 8 },
  { id: 'v_mill', chapter: QUEST_TEXT.v_mill.chapter, people: 'veshari', title: QUEST_TEXT.v_mill.title, hint: QUEST_TEXT.v_mill.hint, when: (s) => s.faction === 'veshari' && s.milestone >= 4, done: (s) => has(s, 'torrentmill'), focus: { build: 'torrentmill' }, reward: 800, priority: 30 },
  { id: 'v_pool', chapter: QUEST_TEXT.v_pool.chapter, people: 'veshari', title: QUEST_TEXT.v_pool.title, hint: QUEST_TEXT.v_pool.hint, when: (s) => s.faction === 'veshari' && s.milestone >= 4, done: (s) => has(s, 'tidepool'), focus: { build: 'tidepool' }, reward: 800, priority: 34 },
  { id: 'v_hatch', chapter: QUEST_TEXT.v_hatch.chapter, people: 'veshari', title: QUEST_TEXT.v_hatch.title, hint: QUEST_TEXT.v_hatch.hint, when: (s) => s.faction === 'veshari' && s.milestone >= 4, done: (s) => s.dragons.some((d) => { const c = s.buildings.find((b) => b && b.id === d.cradleId); return !!c && c.kind === 'tidepool'; }), focus: { build: 'tidepool' }, reward: 1000, priority: 38 },
  { id: 'v_flood', chapter: QUEST_TEXT.v_flood.chapter, people: 'veshari', title: QUEST_TEXT.v_flood.title, hint: QUEST_TEXT.v_flood.hint, when: (s) => s.faction === 'veshari', done: (s) => s.stats.floodsWeathered >= 1, focus: { center: 'founding' }, reward: 1200, priority: 40 },
  { id: 'v_weir', chapter: QUEST_TEXT.v_weir.chapter, people: 'veshari', title: QUEST_TEXT.v_weir.title, hint: QUEST_TEXT.v_weir.hint, when: (s) => s.faction === 'veshari' && s.milestone >= 7, done: (s) => has(s, 'greatweir'), focus: { build: 'greatweir' }, reward: 5000, priority: 70 },
  // The Wick: the Tallowkin's own chapter (iteration 52)
  { id: 't_spire', chapter: QUEST_TEXT.t_spire.chapter, people: 'tallowkin', title: QUEST_TEXT.t_spire.title, hint: QUEST_TEXT.t_spire.hint, when: (s) => s.faction === 'tallowkin', done: (s) => s.buildings.some((b) => b && b.kind === 'spire' && b.state === 'ok' && b.lit), focus: { build: 'spire' }, reward: 300, priority: 3 },
  { id: 't_tower', chapter: QUEST_TEXT.t_tower.chapter, people: 'tallowkin', title: QUEST_TEXT.t_tower.title, hint: QUEST_TEXT.t_tower.hint, when: (s) => s.faction === 'tallowkin', done: (s) => s.buildings.some((b) => b && b.kind === 'wicktower' && b.state === 'ok' && b.lit), focus: { build: 'wicktower' }, reward: 300, priority: 5 },
  { id: 't_shrine', chapter: QUEST_TEXT.t_shrine.chapter, people: 'tallowkin', title: QUEST_TEXT.t_shrine.title, hint: QUEST_TEXT.t_shrine.hint, when: (s) => s.faction === 'tallowkin', done: (s) => has(s, 'candleshrine'), focus: { build: 'candleshrine' }, reward: 400, priority: 8 },
  { id: 't_half', chapter: QUEST_TEXT.t_half.chapter, people: 'tallowkin', title: QUEST_TEXT.t_half.title, hint: QUEST_TEXT.t_half.hint, when: (s) => s.faction === 'tallowkin', done: (s) => s.buildings.filter((b) => b && b.state === 'ok').length >= 20 && litShare(s) >= 0.5, focus: { overlay: 'mana' }, reward: 500, priority: 12 },
  { id: 't_vigil', chapter: QUEST_TEXT.t_vigil.chapter, people: 'tallowkin', title: QUEST_TEXT.t_vigil.title, hint: QUEST_TEXT.t_vigil.hint, when: (s) => s.faction === 'tallowkin' && s.day >= 85, done: (s) => chose(s, 'vigil', 0), reward: 600, priority: 20 },
  { id: 't_nexus', chapter: QUEST_TEXT.t_nexus.chapter, people: 'tallowkin', title: QUEST_TEXT.t_nexus.title, hint: QUEST_TEXT.t_nexus.hint, when: (s) => s.faction === 'tallowkin' && s.milestone >= 4, done: (s) => s.buildings.some((b) => b && b.kind === 'nexus' && b.state === 'ok' && b.lit), focus: { build: 'nexus' }, reward: 800, priority: 24 },
  { id: 't_hall', chapter: QUEST_TEXT.t_hall.chapter, people: 'tallowkin', title: QUEST_TEXT.t_hall.title, hint: QUEST_TEXT.t_hall.hint, when: (s) => s.faction === 'tallowkin' && s.milestone >= 5, done: (s) => has(s, 'hallofwicks'), focus: { build: 'hallofwicks' }, reward: 1500, priority: 40 },
  { id: 't_lantern', chapter: QUEST_TEXT.t_lantern.chapter, people: 'tallowkin', title: QUEST_TEXT.t_lantern.title, hint: QUEST_TEXT.t_lantern.hint, when: (s) => s.faction === 'tallowkin' && s.milestone >= 7, done: (s) => has(s, 'lanternofwicks'), focus: { build: 'lanternofwicks' }, reward: 5000, priority: 70 },
  // The Vein-Wyrm
  { id: 'v_find', chapter: QUEST_TEXT.v_find.chapter, title: QUEST_TEXT.v_find.title, hint: QUEST_TEXT.v_find.hint, when: (s) => s.wyrm.state !== 'none' && s.milestone >= 3, done: (s) => s.wyrm.waking > 0 || s.wyrm.state !== 'sleeping', focus: { center: 'wyrm' }, reward: 300, priority: 41 },
  { id: 'v_tribute', chapter: QUEST_TEXT.v_tribute.chapter, title: QUEST_TEXT.v_tribute.title, hint: QUEST_TEXT.v_tribute.hint, when: (s) => s.wyrm.state === 'awake', done: (s) => s.stats.wyrmTributes > 0, focus: { center: 'wyrm' }, reward: 500, priority: 42 },
  { id: 'v_court', chapter: QUEST_TEXT.v_court.chapter, title: QUEST_TEXT.v_court.title, hint: QUEST_TEXT.v_court.hint, when: (s) => s.wyrm.state === 'awake' && s.milestone >= 7, done: (s) => has(s, 'wyrmcourt'), focus: { build: 'wyrmcourt' }, reward: 1000, priority: 43 },
  { id: 'v_bind', chapter: QUEST_TEXT.v_bind.chapter, title: QUEST_TEXT.v_bind.title, hint: QUEST_TEXT.v_bind.hint, when: (s) => has(s, 'wyrmcourt'), done: (s) => s.wyrm.state === 'bound', focus: { center: 'wyrm' }, reward: 3000, priority: 44 },
  { id: 'v_egg', chapter: QUEST_TEXT.v_egg.chapter, title: QUEST_TEXT.v_egg.title, hint: QUEST_TEXT.v_egg.hint, when: (s) => s.wyrm.state === 'bound', done: (s) => s.dragons.some((d) => d.line === 'vein'), focus: { panel: 'wyrms' }, reward: 2000, priority: 45 },
  // Scenario goals
  { id: 'z_daily', chapter: QUEST_TEXT.z_daily.chapter, title: QUEST_TEXT.z_daily.title, hint: QUEST_TEXT.z_daily.hint, when: (s) => !!s.challenge && (s.day <= 60 || s.questsDone.includes('z_daily')), done: (s) => s.milestone >= 5 && s.day <= 60, reward: 3000, priority: 0, strict: true },
  { id: 'z_onenode', chapter: QUEST_TEXT.z_onenode.chapter, title: QUEST_TEXT.z_onenode.title, hint: QUEST_TEXT.z_onenode.hint, when: (s) => s.scenario === 'onenode', done: (s) => s.milestone >= 6, reward: 5000, priority: 0, strict: true },
  { id: 'z_island', chapter: QUEST_TEXT.z_island.chapter, title: QUEST_TEXT.z_island.title, hint: QUEST_TEXT.z_island.hint, when: (s) => s.scenario === 'island', done: (s) => s.milestone >= 4 && s.stats.gloamBurned >= 300, focus: { build: 'wardlantern' }, reward: 5000, priority: 0, strict: true },
  { id: 'z_inherited', chapter: QUEST_TEXT.z_inherited.chapter, title: QUEST_TEXT.z_inherited.title, hint: QUEST_TEXT.z_inherited.hint, when: (s) => s.scenario === 'inherited', done: (s) => s.cleanDays >= 10 && s.milestone >= 6, focus: { panel: 'budget' }, reward: 5000, priority: 0, strict: true },
  // The Crown
  { id: 'c_thorp', chapter: QUEST_TEXT.c_thorp.chapter, title: QUEST_TEXT.c_thorp.title, hint: QUEST_TEXT.c_thorp.hint, when: (s) => s.milestone === 1, done: (s) => s.milestone >= 2, reward: 0, priority: 60 },
  { id: 'c_village', chapter: QUEST_TEXT.c_village.chapter, title: QUEST_TEXT.c_village.title, hint: QUEST_TEXT.c_village.hint, when: (s) => s.milestone === 2, done: (s) => s.milestone >= 3, reward: 0, priority: 61 },
  { id: 'c_township', chapter: QUEST_TEXT.c_township.chapter, title: QUEST_TEXT.c_township.title, hint: QUEST_TEXT.c_township.hint, when: (s) => s.milestone === 3, done: (s) => s.milestone >= 4, reward: 0, priority: 62 },
  { id: 'c_market', chapter: QUEST_TEXT.c_market.chapter, title: QUEST_TEXT.c_market.title, hint: QUEST_TEXT.c_market.hint, when: (s) => s.milestone === 4, done: (s) => s.milestone >= 5, reward: 0, priority: 63 },
  { id: 'c_burgh', chapter: QUEST_TEXT.c_burgh.chapter, title: QUEST_TEXT.c_burgh.title, hint: QUEST_TEXT.c_burgh.hint, when: (s) => s.milestone === 5, done: (s) => s.milestone >= 6, reward: 0, priority: 64 },
  { id: 'c_free', chapter: QUEST_TEXT.c_free.chapter, title: QUEST_TEXT.c_free.title, hint: QUEST_TEXT.c_free.hint, when: (s) => s.milestone === 6, done: (s) => s.milestone >= 7, reward: 0, priority: 65 },
  { id: 'c_beacon', chapter: QUEST_TEXT.c_beacon.chapter, title: QUEST_TEXT.c_beacon.title, hint: QUEST_TEXT.c_beacon.hint, when: (s) => s.milestone === 7, done: (s) => s.milestone >= 8, focus: { build: 'lantern' }, reward: 0, priority: 66 },
  { id: 'c_daughter', chapter: QUEST_TEXT.c_daughter.chapter, title: QUEST_TEXT.c_daughter.title, hint: QUEST_TEXT.c_daughter.hint, when: (s) => s.milestone >= 8 && !s.daughter, done: (s) => !!s.daughter, focus: { center: 'node' }, reward: 0, priority: 70 },
  { id: 'c_twin', chapter: QUEST_TEXT.c_twin.chapter, title: QUEST_TEXT.c_twin.title, hint: QUEST_TEXT.c_twin.hint, when: (s) => !!s.daughter, done: (s) => !!s.daughter && s.daughter.twin >= 0, reward: 0, priority: 71 },
];

/** The advisor: one line about the city's worst current problem, or null. */
export function advise(s: GameState): { text: string; focus?: Focus } | null {
  const zb = zoneBuildings(s);
  if (zb.length < 4) return null;
  const u = unlit(s);
  const d = dry(s);
  if (s.wyrm.starved >= 2 && (s.wyrm.state === 'awake' || s.wyrm.state === 'sleeping')) return { text: `The wyrm has been refused ${s.wyrm.starved} times running. Refuse it once more and it comes for the Founding Stake: pay its next tribute, in crowns or goods.`, focus: { center: 'wyrm' } };
  if (s.hush.emptied.length > 0 && !s.gameOver) return { text: `The hounds have emptied ${s.hush.emptied.length} district${s.hush.emptied.length === 1 ? '' : 's'} this Hush. A third and the Long Night comes early: light and ward the dark homes near the Gloam, raise a Hunters' Lodge or a Warding Wall.`, focus: { overlay: 'ward' } };
  if (s.overdrawDays > 0) return { text: 'Mana overdrawn: a wild surge is coming. Build a Nexus or Thrum Font, or cut consumers.', focus: { build: 'nexus' } };
  if (s.treasury < 0) return { text: `The treasury is in debt, and a debt costs a crown in a hundred a day. Raise the tithe a little or cut upkeep; five days below ${Math.round(debtLine(s)).toLocaleString()} ends the Charter. The Budget panel offers the Crown's loan.`, focus: { panel: 'budget' } };
  if (u > zb.length * 0.25) return { text: `${u} buildings have no mana. Chain Ley Spires within 6 tiles of a node or another lit spire.`, focus: { overlay: 'mana' } };
  if (d > zb.length * 0.25) return { text: `${d} buildings are dry. Dig Wells or a Cistern near them.`, focus: { overlay: 'water' } };
  if (s.unquieted > 12 && !has(s, 'boneyard')) return { text: 'The dead are piling up unquieted. Build a Boneyard before they rise.', focus: { build: 'boneyard' } };
  if (s.agents.filter((a) => a.kind === AgentKind.Restless).length > 5) return { text: 'The restless walk. Watch coverage and wards lay them down.', focus: { overlay: 'watch' } };
  if (s.goodsShort > Math.max(3, zoneBuildings(s, Zone.Market).length * 0.4)) return { text: 'Markets are running dry. Zone Craft works with a road to them, or import through a Trade Depot.', focus: { overlay: 'goods' } };
  if (s.agents.some((a) => a.kind === AgentKind.Creature && a.species === 'hound') && !has(s, 'hunterslodge')) return { text: "Gloam-hounds are hunting at the edge. A Hunters' Lodge or a Warding Wall stops them.", focus: { build: 'hunterslodge' } };
  { const lair = (s.marshWyrms ?? []).find((w) => w.lair >= 0); if (lair) return { text: 'A marsh-wyrm lairs under a bridge and the carts crawl across it. A Veshari Hall that covers the bridge drives it off; a Quay within 10 keeps them away.', focus: { build: 'veshari' } }; }
  if (s.wyrm.state === 'bound' && s.wyrm.sulking > 0) return { text: 'The bound wyrm is sulking: its lair no longer wards the Gloam. Feed it 40 goods a day from the markets.', focus: { overlay: 'goods' } };
  if (s.wyrm.state === 'sleeping' && s.wyrm.waking >= 50) return { text: 'Spires near the Sleeping Wyrm are waking it. Bulldoze them, or prepare a tribute.', focus: { center: 'wyrm' } };
  if (s.gloamPressure >= 0.65) return { text: 'The Gloam is hungry: unquieted dead and the restless feed it. Quiet the dead (Boneyard, Ossuary) and spread Shrines of Aume.', focus: { build: 'boneyard' } };
  if (s.unrest > 0.35) return { text: 'Unrest is high. More Watch coverage, lower taxes, or a Night Curfew edict.', focus: { panel: 'edicts' } };
  if (s.happiness < 40) return { text: 'Folk are unhappy. Check the Happiness view (4) for the worst streets.', focus: { overlay: 'happiness' } };
  const gloamNear = zb.some((b) => s.gloamDist[b.y * s.w + b.x] < 6);
  if (gloamNear && !has(s, 'wardlantern')) return { text: 'The Gloam whispers at your buildings. Raise a Ward Lantern near the grey.', focus: { build: 'wardlantern' } };
  return null;
}
