import { FISH_MARKET_REACH, bodyOf, isFordTile } from '../sim/water';
/** The Charter's Ledger: guided goals for every mechanic. See DESIGN.md 4.27. */
import { AgentKind, DAYS_PER_SEASON, Terrain, Zone, idx, type GameState } from '../sim/types';
import { hasCouncil } from '../sim/guilds';
import { ATOLL_ISLES, SETTLED_BUILDINGS, isleBuildings, settledIsles } from '../sim/isles';
import { canBuild, milestonesOf, nextGate } from './factions';
import { HUNT_REACH, MEAT_REACH, huntBlock, quarryOf } from '../sim/wild';
import { BUILDING_BY_KEY } from '../sim/catalog';
import { factionKey, type FactionId } from './factions';
import { chose } from '../sim/events';
import { aspectAt } from '../sim/weave';
import { debtLine } from '../sim/economy';
import QUEST_TEXT from './content/text/quests.json';

export type Focus =
  | { tool: 'road' | 'zoneHearth' | 'zoneMarket' | 'zoneCraft' | 'zoneArcane' | 'district' }
  | { build: string }
  | { panel: 'edicts' | 'budget' | 'views' | 'chronicle' }
  | { overlay: string }
  | { center: 'founding' | 'gloam' | 'node' | 'ruins' | 'cart' };

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
  people?: FactionId; // a people's own chapter: shown and paid for that people only (none since the scope reset, phase 1a)
  strict?: boolean; // completes only while `when` holds (a scenario's goal never pays in another game)
  /** What the task still needs, read from the city (iteration 93): shown under the hint in the Ledger. See questStatus. */
  status?: (s: GameState) => string;
}

/** Counts this people's building for a Vellish key (a Seep for 'well'), so the Charter's goals read for every people. */
const has = (s: GameState, kind0: string, n = 1) => { const kind = factionKey(s, kind0); return s.buildings.filter((b) => b && b.kind === kind && b.state !== 'ruin' && b.state !== 'building').length >= n; };
const zoned = (s: GameState, z: Zone, n: number) => { let c = 0; for (let i = 0; i < s.zone.length; i++) if (s.zone[i] === z) c++; return c >= n; };
const roads = (s: GameState) => { let c = 0; for (let i = 0; i < s.road.length; i++) if (s.road[i]) c++; return c; };
const zoneBuildings = (s: GameState, z?: Zone) => s.buildings.filter((b) => b && BUILDING_BY_KEY[b.kind].category === 'zone' && b.state === 'ok' && (z === undefined || BUILDING_BY_KEY[b.kind].zone === z)) as NonNullable<GameState['buildings'][number]>[];
const unlit = (s: GameState) => zoneBuildings(s).filter((b) => !b.lit).length;
const dry = (s: GameState) => zoneBuildings(s).filter((b) => !b.watered).length;
/** The guild council sits once a lit Guildhall stands, petition or none (iteration 92: a contented council never petitions). */
const councilSeated = (s: GameState) => hasCouncil(s) || s.stats.councils > 0;
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
  // Goods
  { id: 'o_cart', chapter: QUEST_TEXT.o_cart.chapter, title: QUEST_TEXT.o_cart.title, hint: QUEST_TEXT.o_cart.hint, when: (s) => zoneBuildings(s, Zone.Craft).length > 0 && zoneBuildings(s, Zone.Market).length > 0, done: (s) => s.stats.goodsDelivered > 0, focus: { center: 'cart' }, reward: 200, priority: 18 },
  { id: 'o_full', chapter: QUEST_TEXT.o_full.chapter, title: QUEST_TEXT.o_full.title, hint: QUEST_TEXT.o_full.hint, when: (s) => s.goodsShort > 0 || zoneBuildings(s, Zone.Market).length > 3, done: (s) => s.stats.fullDays >= 5 && zoneBuildings(s, Zone.Market).length > 3 && s.day > 20, focus: { overlay: 'goods' }, reward: 600, priority: 19 },
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
  { id: 's_hush', chapter: QUEST_TEXT.s_hush.chapter, title: QUEST_TEXT.s_hush.title, hint: QUEST_TEXT.s_hush.hint, when: (s) => s.day >= 60, done: (s) => s.day >= 120, reward: 1500, priority: 50 },
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
  // Vehicles
  { id: 'q_quay', chapter: QUEST_TEXT.q_quay.chapter, title: QUEST_TEXT.q_quay.title, hint: QUEST_TEXT.q_quay.hint, when: (s) => s.milestone >= 3 && zoneBuildings(s, Zone.Market).length > 2, done: (s) => s.stats.bargeTrips > 0, focus: { build: 'quay' }, reward: 700, priority: 55 },
  { id: 'q_float', chapter: QUEST_TEXT.q_float.chapter, title: QUEST_TEXT.q_float.title, hint: QUEST_TEXT.q_float.hint, when: (s) => zoneBuildings(s, Zone.Arcane).length > 0, done: (s) => s.agents.some((a) => a.kind === 1 && a.variant === 3), reward: 600, priority: 56 },
  { id: 'q_airship', chapter: QUEST_TEXT.q_airship.chapter, title: QUEST_TEXT.q_airship.title, hint: QUEST_TEXT.q_airship.hint, when: (s) => s.milestone >= 8, done: (s) => s.stats.airshipVoyages > 0, focus: { build: 'skydock' }, reward: 3000, priority: 69 },
  { id: 'w_meat', chapter: QUEST_TEXT.w_meat.chapter, title: QUEST_TEXT.w_meat.title, hint: QUEST_TEXT.w_meat.hint, when: (s) => s.milestone >= 2 && s.wild.herds.length > 0, done: (s) => s.wild.meatAt.length > 0, focus: { build: 'hunterslodge' }, reward: 600, priority: 57 },
  // the water (iteration 60)
  { id: 'w_fish', chapter: QUEST_TEXT.w_fish.chapter, title: QUEST_TEXT.w_fish.title, hint: QUEST_TEXT.w_fish.hint, when: (s) => s.milestone >= 1, done: (s) => s.water.fishAt.length > 0, focus: { build: 'fishershut' }, reward: 400, priority: 57 },
  { id: 'w_thatch', chapter: QUEST_TEXT.w_thatch.chapter, title: QUEST_TEXT.w_thatch.title, hint: QUEST_TEXT.w_thatch.hint, when: (s) => s.milestone >= 1, done: (s) => s.stats.homesThatched >= 10, focus: { build: 'reedcutters' }, reward: 400, priority: 58 },
  { id: 'w_ford', chapter: QUEST_TEXT.w_ford.chapter, title: QUEST_TEXT.w_ford.title, hint: QUEST_TEXT.w_ford.hint, when: (s) => s.milestone >= 1 && s.day >= 5, done: (s) => { for (let i = 0; i < s.road.length; i++) if (s.road[i] && isFordTile(s, i)) return true; return false; }, focus: { tool: 'road' }, reward: 300, priority: 58 },
  // The Font of Quieting
  { id: 'n_font', chapter: QUEST_TEXT.n_font.chapter, title: QUEST_TEXT.n_font.title, hint: QUEST_TEXT.n_font.hint, when: (s) => s.milestone >= 7, done: (s) => has(s, 'fontquieting'), focus: { build: 'fontquieting' }, reward: 1500, priority: 59 },
  // The ley-weave
  { id: 'y_quiet', chapter: QUEST_TEXT.y_quiet.chapter, title: QUEST_TEXT.y_quiet.title, hint: QUEST_TEXT.y_quiet.hint, when: (s) => s.day >= 60, done: (s) => s.stats.quietHush > 0, focus: { build: 'shrine' }, reward: 1500, priority: 42 },
  // The guilds, the feast and the routes
  { id: 'k_council', chapter: QUEST_TEXT.k_council.chapter, title: QUEST_TEXT.k_council.title, hint: QUEST_TEXT.k_council.hint, when: (s) => s.milestone >= 5, done: (s) => councilSeated(s), focus: { build: 'guildhall' }, reward: 500, priority: 50 },
  { id: 'k_boon', chapter: QUEST_TEXT.k_boon.chapter, title: QUEST_TEXT.k_boon.title, hint: QUEST_TEXT.k_boon.hint, when: (s) => councilSeated(s), done: (s) => Object.values(s.guilds.standing).some((v) => v >= 70), focus: { panel: 'edicts' }, reward: 1000, priority: 51 },
  { id: 'k_feast', chapter: QUEST_TEXT.k_feast.chapter, title: QUEST_TEXT.k_feast.title, hint: QUEST_TEXT.k_feast.hint, when: (s) => s.day >= 100, done: (s) => s.stats.feastGoods >= 10, focus: { tool: 'zoneMarket' }, reward: 600, priority: 52 },
  { id: 'k_twinroad', chapter: QUEST_TEXT.k_twinroad.chapter, title: QUEST_TEXT.k_twinroad.title, hint: QUEST_TEXT.k_twinroad.hint, when: (s) => !!s.daughter, done: (s) => s.stats.twinGoods > 0, focus: { build: 'depot' }, reward: 1500, priority: 53 },
  { id: 'k_hall', chapter: QUEST_TEXT.k_hall.chapter, title: QUEST_TEXT.k_hall.title, hint: QUEST_TEXT.k_hall.hint, when: (s) => councilSeated(s), done: (s) => s.stats.guildHalls > 0, focus: { panel: 'edicts' }, reward: 1200, priority: 54 },
  { id: 'k_relics', chapter: QUEST_TEXT.k_relics.chapter, title: QUEST_TEXT.k_relics.title, hint: QUEST_TEXT.k_relics.hint, when: (s) => s.stats.relics >= 12, done: (s) => s.relics.complete.length > 0, focus: { build: 'academy' }, reward: 2000, priority: 56 },
  { id: 'k_relicbuild', chapter: QUEST_TEXT.k_relicbuild.chapter, title: QUEST_TEXT.k_relicbuild.title, hint: QUEST_TEXT.k_relicbuild.hint, when: (s) => s.relics.complete.length > 0, done: (s) => s.buildings.some((b) => !!b && !!BUILDING_BY_KEY[b.kind].relic && b.state === 'ok'), focus: { build: 'corelantern' }, reward: 1500, priority: 58 },
  { id: 'k_assessor', chapter: QUEST_TEXT.k_assessor.chapter, title: QUEST_TEXT.k_assessor.title, hint: QUEST_TEXT.k_assessor.hint, when: (s) => s.relicStock >= 6, done: (s) => s.stats.relicsSold > 0, focus: { build: 'depot' }, reward: 800, priority: 60 },
  { id: 'k_charter', chapter: QUEST_TEXT.k_charter.chapter, title: QUEST_TEXT.k_charter.title, hint: QUEST_TEXT.k_charter.hint, when: (s) => s.stats.guildWars > 0 || s.stats.councils >= 3, done: (s) => s.stats.guildCharters > 0, focus: { panel: 'edicts' }, reward: 1500, priority: 61 },
  { id: 'w_patrol', chapter: QUEST_TEXT.w_patrol.chapter, title: QUEST_TEXT.w_patrol.title, hint: QUEST_TEXT.w_patrol.hint, when: (s) => has(s, 'watchhouse') || has(s, 'watchpost'), done: (s) => s.stats.watchRounds > 0, focus: { overlay: 'watch' }, reward: 400, priority: 24 },
  { id: 'w_sexton', chapter: QUEST_TEXT.w_sexton.chapter, title: QUEST_TEXT.w_sexton.title, hint: QUEST_TEXT.w_sexton.hint, when: (s) => has(s, 'boneyard') || has(s, 'ossuary'), done: (s) => s.stats.sextonRounds > 0, focus: { overlay: 'death' }, reward: 400, priority: 25 },
  { id: 'w_healer', chapter: QUEST_TEXT.w_healer.chapter, title: QUEST_TEXT.w_healer.title, hint: QUEST_TEXT.w_healer.hint, when: (s) => has(s, 'healer') || has(s, 'hospice'), done: (s) => s.stats.healerVisits > 0, focus: { overlay: 'health' }, reward: 400, priority: 26 },
  { id: 'w_warden', chapter: QUEST_TEXT.w_warden.chapter, title: QUEST_TEXT.w_warden.title, hint: QUEST_TEXT.w_warden.hint, when: (s) => s.milestone >= 2 && s.buildings.filter((b) => b && (b.kind === 'spire' || b.kind === 'nexus')).length >= 2, done: (s) => s.stats.wardenRounds > 0, focus: { panel: 'edicts' }, reward: 600, priority: 27 },
  { id: 'w_scholar', chapter: QUEST_TEXT.w_scholar.chapter, title: QUEST_TEXT.w_scholar.title, hint: QUEST_TEXT.w_scholar.hint, when: (s) => (has(s, 'academy') || has(s, 'grandacademy')) && has(s, 'ruindelve'), done: (s) => s.stats.scholarTrips > 0, focus: { build: 'academy' }, reward: 600, priority: 51 },
  { id: 'w_pilgrim', chapter: QUEST_TEXT.w_pilgrim.chapter, title: QUEST_TEXT.w_pilgrim.title, hint: QUEST_TEXT.w_pilgrim.hint, when: (s) => s.buildings.filter((b) => b && (b.kind === 'shrine' || b.kind === 'temple') && b.state === 'ok').length >= 2, done: (s) => s.stats.pilgrimPrayers > 0, focus: { overlay: 'faith' }, reward: 400, priority: 28 },
  // Scenario goals
  { id: 'z_daily', chapter: QUEST_TEXT.z_daily.chapter, title: QUEST_TEXT.z_daily.title, hint: QUEST_TEXT.z_daily.hint, when: (s) => !!s.challenge && (s.day <= 60 || s.questsDone.includes('z_daily')), done: (s) => s.milestone >= 5 && s.day <= 60, reward: 3000, priority: 0, strict: true },
  { id: 'z_onenode', chapter: QUEST_TEXT.z_onenode.chapter, title: QUEST_TEXT.z_onenode.title, hint: QUEST_TEXT.z_onenode.hint, when: (s) => s.scenario === 'onenode', done: (s) => s.milestone >= 6, reward: 5000, priority: 0, strict: true },
  { id: 'z_island', chapter: QUEST_TEXT.z_island.chapter, title: QUEST_TEXT.z_island.title, hint: QUEST_TEXT.z_island.hint, when: (s) => s.scenario === 'island', done: (s) => s.milestone >= 4 && s.stats.gloamBurned >= 300, focus: { build: 'wardlantern' }, reward: 5000, priority: 0, strict: true },
  { id: 'z_atoll', chapter: QUEST_TEXT.z_atoll.chapter, title: QUEST_TEXT.z_atoll.title, hint: QUEST_TEXT.z_atoll.hint, when: (s) => s.scenario === 'atoll', done: (s) => s.milestone >= 6 && settledIsles(s) >= ATOLL_ISLES, focus: { center: 'founding' }, reward: 5000, priority: 0, strict: true },
  { id: 'z_inherited', chapter: QUEST_TEXT.z_inherited.chapter, title: QUEST_TEXT.z_inherited.title, hint: QUEST_TEXT.z_inherited.hint, when: (s) => s.scenario === 'inherited', done: (s) => s.cleanDays >= 10 && s.milestone >= 6, focus: { panel: 'budget' }, reward: 5000, priority: 0, strict: true },
  // The Crown
  { id: 'c_thorp', chapter: QUEST_TEXT.c_thorp.chapter, title: QUEST_TEXT.c_thorp.title, hint: QUEST_TEXT.c_thorp.hint, when: (s) => s.milestone === 1, done: (s) => s.milestone >= 2, reward: 0, priority: 60 },
  { id: 'c_village', chapter: QUEST_TEXT.c_village.chapter, title: QUEST_TEXT.c_village.title, hint: QUEST_TEXT.c_village.hint, when: (s) => s.milestone === 2, done: (s) => s.milestone >= 3, reward: 0, priority: 61 },
  { id: 'c_township', chapter: QUEST_TEXT.c_township.chapter, title: QUEST_TEXT.c_township.title, hint: QUEST_TEXT.c_township.hint, when: (s) => s.milestone === 3, done: (s) => s.milestone >= 4, reward: 0, priority: 62 },
  { id: 'c_market', chapter: QUEST_TEXT.c_market.chapter, title: QUEST_TEXT.c_market.title, hint: QUEST_TEXT.c_market.hint, when: (s) => s.milestone === 4, done: (s) => s.milestone >= 5, reward: 0, priority: 63 },
  { id: 'c_burgh', chapter: QUEST_TEXT.c_burgh.chapter, title: QUEST_TEXT.c_burgh.title, hint: QUEST_TEXT.c_burgh.hint, when: (s) => s.milestone === 5, done: (s) => s.milestone >= 6, reward: 0, priority: 64 },
  { id: 'c_free', chapter: QUEST_TEXT.c_free.chapter, title: QUEST_TEXT.c_free.title, hint: QUEST_TEXT.c_free.hint, when: (s) => s.milestone === 6, done: (s) => s.milestone >= 7, reward: 0, priority: 65 },
  { id: 'c_beacon', chapter: QUEST_TEXT.c_beacon.chapter, title: QUEST_TEXT.c_beacon.title, hint: QUEST_TEXT.c_beacon.hint, when: (s) => s.milestone === 7, done: (s) => s.milestone >= 8, reward: 0, priority: 66 },
  { id: 'c_daughter', chapter: QUEST_TEXT.c_daughter.chapter, title: QUEST_TEXT.c_daughter.title, hint: QUEST_TEXT.c_daughter.hint, when: (s) => s.milestone >= 8 && !s.daughter, done: (s) => !!s.daughter, focus: { center: 'node' }, reward: 0, priority: 70 },
  { id: 'c_twin', chapter: QUEST_TEXT.c_twin.chapter, title: QUEST_TEXT.c_twin.title, hint: QUEST_TEXT.c_twin.hint, when: (s) => !!s.daughter, done: (s) => !!s.daughter && s.daughter.twin >= 0, reward: 0, priority: 71 },
];

/** The advisor: one line about the city's worst current problem, or null. */
export function advise(s: GameState): { text: string; focus?: Focus } | null {
  const zb = zoneBuildings(s);
  if (zb.length < 4) return null;
  const u = unlit(s);
  const d = dry(s);
  if (s.overdrawDays > 0) return { text: 'Mana overdrawn: a wild surge is coming. Build a Nexus or Thrum Font, or cut consumers.', focus: { build: 'nexus' } };
  if (s.treasury < 0) return { text: `The treasury is in debt, and a debt costs a crown in a hundred a day. Raise the tithe a little or cut upkeep; five days below ${Math.round(debtLine(s)).toLocaleString()} ends the Charter. The Budget panel offers the Crown's loan.`, focus: { panel: 'budget' } };
  if (u > zb.length * 0.25) return { text: `${u} buildings have no mana. Chain Ley Spires within 6 tiles of a node or another lit spire.`, focus: { overlay: 'mana' } };
  if (d > zb.length * 0.25) return { text: `${d} buildings are dry. Dig Wells or a Cistern near them.`, focus: { overlay: 'water' } };
  if (s.unquieted > 12 && !has(s, 'boneyard')) return { text: 'The dead are piling up unquieted. Build a Boneyard before they rise.', focus: { build: 'boneyard' } };
  if (s.agents.filter((a) => a.kind === AgentKind.Restless).length > 5) return { text: 'The restless walk. Watch coverage and wards lay them down.', focus: { overlay: 'watch' } };
  if (s.goodsShort > Math.max(3, zoneBuildings(s, Zone.Market).length * 0.4)) return { text: 'Markets are running dry. Zone Craft works with a road to them, or import through a Trade Depot.', focus: { overlay: 'goods' } };
  if (s.gloamPressure >= 0.65) return { text: 'The Gloam is hungry: unquieted dead and the restless feed it. Quiet the dead (Boneyard, Ossuary) and spread Shrines of Aume.', focus: { build: 'boneyard' } };
  if (s.unrest > 0.35) return { text: 'Unrest is high. More Watch coverage, lower taxes, or a Night Curfew edict.', focus: { panel: 'edicts' } };
  if (s.happiness < 40) return { text: 'Folk are unhappy. Check the Happiness view (4) for the worst streets.', focus: { overlay: 'happiness' } };
  const gloamNear = zb.some((b) => s.gloamDist[b.y * s.w + b.x] < 6);
  if (gloamNear && !has(s, 'wardlantern')) return { text: 'The Gloam whispers at your buildings. Raise a Ward Lantern near the grey.', focus: { build: 'wardlantern' } };
  return null;
}

// ---- What a task still needs (iteration 93, DESIGN 4.124) ----
// The hint says once what to do; the status line says, every time the Ledger is drawn, what is missing now: a building not
// yet raised, still rising, unlit or in ruins, or a counter against its target. Computed from the city, so it stays in code
// beside the condition it mirrors.

const n0 = (v: number) => Math.floor(v).toLocaleString();
const of = (have: number, need: number, what: string) => `${n0(Math.min(have, need))} of ${n0(need)} ${what}.`;
const zonedCount = (s: GameState, z: Zone) => { let c = 0; for (let i = 0; i < s.zone.length; i++) if (s.zone[i] === z) c++; return c; };

/** A building task's line: not built (or still locked), being built, burning, in ruins, built but unlit, or built. */
export function buildStatus(s: GameState, key0: string, n = 1, showMe = true): string {
  const key = factionKey(s, key0);
  const def = BUILDING_BY_KEY[key];
  if (!def) return '';
  const all = s.buildings.filter((b) => b && b.kind === key) as NonNullable<GameState['buildings'][number]>[];
  const standing = all.filter((b) => b.state !== 'ruin' && b.state !== 'building');
  const count = n > 1 ? ` (${Math.min(standing.length, n)} of ${n})` : '';
  if (standing.length >= n) {
    if (def.needsMana && !standing.some((b) => b.lit)) return `Built, but unlit: the ${def.name} needs mana. Chain a Ley Spire within reach of it (Mana view, 1).`;
    if (standing.some((b) => b.state === 'burning')) return `The ${def.name} is burning: a Fire Watch in reach puts it out.`;
    return `Built${count}.`;
  }
  const site = all.find((b) => b.state === 'building');
  if (site) {
    const pct = site.workTotal ? Math.round(100 * (1 - site.work / site.workTotal)) : 0;
    return `${standing.length ? `${standing.length} of ${n} standing; the next is being built` : 'Being built'}: ${Math.max(0, Math.min(99, pct))} %. Builders walk from the Founding Stake by road.`;
  }
  if (all.some((b) => b.state === 'ruin')) return `The ${def.name} lies in ruins: bulldoze it and build again.`;
  if (!canBuild(s, key)) {
    const MS = milestonesOf(s);
    return def.unlock > s.milestone && MS[def.unlock] ? `Not built yet: the ${def.name} unlocks at ${MS[def.unlock].name}.` : `Not built yet: the ${def.name} cannot be raised yet (its card in the build menu says why).`;
  }
  return showMe ? `Not built yet${count}: pick the ${def.name} with Show me and place it.` : `Not built yet${count}: the ${def.name} is in the build menu.`;
}

/** A task that wants the building lit, not only standing. */
function litStatus(s: GameState, key: string): string {
  const b = s.buildings.find((x) => x && x.kind === key && x.state === 'ok');
  return b && !b.lit ? `Built, but unlit: it needs a lit node or spire within reach.` : buildStatus(s, key);
}

/** First the building (until it stands, and is lit if it needs mana), then what the task asks of it. */
const after = (key: string, then: (s: GameState) => string, n = 1) => (s: GameState) => {
  const k = factionKey(s, key);
  const def = BUILDING_BY_KEY[k];
  const standing = s.buildings.filter((b) => b && b.kind === k && b.state !== 'ruin' && b.state !== 'building');
  return standing.length >= n && (!def?.needsMana || standing.some((b) => b!.lit)) ? then(s) : buildStatus(s, key, n);
};
const walkersOut = (s: GameState, job: string) => s.agents.filter((a) => a.kind === AgentKind.Walker && a.job === job).length;
const anyOf = (s: GameState, keys: string[]) => keys.some((k) => has(s, k));

const STATUS: Record<string, (s: GameState) => string> = {
  f_road: (s) => of(roads(s), 9, 'road tiles'),
  f_hearth: (s) => of(zonedCount(s, Zone.Hearth), 6, 'Hearth tiles zoned'),
  f_jobs: (s) => `Craft ${n0(Math.min(zonedCount(s, Zone.Craft), 3))} of 3 tiles, Market ${n0(Math.min(zonedCount(s, Zone.Market), 2))} of 2 tiles zoned.`,
  f_watch: (s) => `Watch Post: ${buildStatus(s, 'watchpost')} Shrine: ${buildStatus(s, 'shrine', 1, false)}`,
  f_hamlet: (s) => `${n0(s.population)} folk. Next: ${nextGate(s) ?? 'the last gate is reached'}.`,
  f_sector: () => 'No sector bought yet: click the dimmed land beyond the Charter line.',
  l_all: (s) => { const u = unlit(s); return u ? `${u} building${u === 1 ? '' : 's'} unlit: the Mana view (1) shows them in red.` : `All lit; it needs more than 10 buildings (${zoneBuildings(s).length} now).`; },
  l_water: (s) => { const d = dry(s); return d ? `${d} building${d === 1 ? '' : 's'} without water: the Water view shows them.` : `All watered; it needs more than 10 buildings (${zoneBuildings(s).length} now).`; },
  l_deepen: (s) => `No node deepened yet (${s.nodes.length} node${s.nodes.length === 1 ? '' : 's'}): click a ley node and Deepen the Wellspring.`,
  l_font: after('font', () => 'Built.'),
  d_restless: (s) => `Restless out now: ${s.agents.filter((a) => a.kind === AgentKind.Restless).length}. A Watch or a sexton lays them.`,
  g_burn: after('wardlantern', (s) => of(s.stats.gloamBurned, 50, 'tiles of Gloam burned back')), // an unlit lantern burns nothing: say so first
  o_cart: (s) => `${zoneBuildings(s, Zone.Craft).length} working Craft, ${zoneBuildings(s, Zone.Market).length} Market: a cart sets out once both stand on one road.`,
  o_full: (s) => `${n0(Math.min(s.stats.fullDays, 5))} of 5 days with every shelf stocked; ${n0(Math.min(zoneBuildings(s, Zone.Market).length, 4))} of 4 markets${s.day <= 20 ? '; from day 21' : ''}.`,
  o_caravan: (s) => of(s.stats.caravanGoods, 200, 'goods sold to the caravan'),
  a_academy: (s) => `${anyOf(s, ['academy', 'grandacademy']) ? '' : `${buildStatus(s, 'academy')} `}${Math.floor(s.educated * 100)} % of the folk educated, of 30 %.`,
  a_arcane: (s) => {
    const z = zonedCount(s, Zone.Arcane);
    if (!z) return 'No Arcane zoned yet: zone Arcane beside a road, within an Academy\'s reach.';
    let schooled = 0;
    for (let i = 0; i < s.zone.length; i++) if (s.zone[i] === Zone.Arcane && s.coverage.school[i] >= 40) schooled++;
    return schooled ? `${schooled} of ${z} Arcane tiles have schooling; one grows when demand calls for it (lit and watered).` : `${z} Arcane tiles zoned, none in an Academy's reach: Arcane grows only with schooling (the Education view).`;
  },
  a_artifact: () => 'No artifacts sold yet: a working Arcane building fed with leystone makes them.',
  x_paint: () => 'No district yet: Districts tab, paint one.',
  x_charter: () => 'No charter yet: open the Edicts panel and charter the district.',
  x_pay: (s) => of(s.stats.quarterDays, 2, 'days with a chartered district'),
  x_edict: () => 'No district edict yet: Edicts panel, choose the district, set one.',
  x_rename: () => 'Not named yet: open the Edicts panel, pick the district in Scope and type a name.',
  s_brownout: (s) => (s.overdrawDays > 0 ? `The spires flicker: day ${s.overdrawDays} of 5. Bring the demand under the flow before the fifth day (cut consumers, raise a Thrum Font or a Nexus).` : 'No brownout under way.'),
  k_glowvine: (s) => { let c = 0; for (let i = 0; i < s.road.length; i++) if (s.road[i] === 4) c++; return of(c, 12, 'tiles of Glowvine Lane'); },
  p_arch: after('portalarch', () => 'Built.', 2),
  t_grown: (s) => { const t = s.buildings.find((b) => b && b.kind === 'worldtree'); return t ? of(t.age, 90, 'days grown') : buildStatus(s, 'worldtree'); },
  w_thatch: after('reedcutters', (s) => of(s.stats.homesThatched, 10, 'homes thatched')),
  w_meat: after('hunterslodge', (s) => {
    const lodges = s.buildings.filter((b) => b && b.kind === 'hunterslodge' && b.state === 'ok') as NonNullable<GameState['buildings'][number]>[];
    const hunting = lodges.filter((l) => quarryOf(s, l));
    if (!hunting.length) return `No game in the grounds: a Hunters\' Lodge hunts within ${HUNT_REACH} tiles of a herd.`;
    const block = hunting.map((l) => huntBlock(s, l)).find(Boolean);
    if (block && hunting.every((l) => huntBlock(s, l))) return block;
    const near = hunting.some((l) => zoneBuildings(s, Zone.Market).some((m) => Math.abs(m.x - l.x) <= MEAT_REACH && Math.abs(m.y - l.y) <= MEAT_REACH));
    return near ? 'The hunters are out: meat reaches the shelves after a kill.' : `No market within ${MEAT_REACH} tiles of a hunting lodge.`;
  }),
  w_fish: after('fishershut', (s) => {
    const huts = s.buildings.filter((b) => b && b.kind === 'fishershut' && b.state === 'ok') as NonNullable<GameState['buildings'][number]>[];
    const wet = huts.filter((h) => bodyOf(s, h) >= 0);
    if (!wet.length) return 'The hut must touch river or lake water.';
    const near = wet.some((h) => zoneBuildings(s, Zone.Market).some((m) => Math.abs(m.x - h.x) <= FISH_MARKET_REACH && Math.abs(m.y - h.y) <= FISH_MARKET_REACH));
    return near ? 'Fish reach the shelves the morning after a catch.' : `No market within ${FISH_MARKET_REACH} tiles of the hut.`;
  }),
  q_quay: after('quay', () => 'Two Quays stand, no barge yet: one needs Craft works holding goods within 8 tiles, the other Markets with room within 8, on the same water.', 2),
  w_patrol: (s) => {
    if (!anyOf(s, ['watchpost', 'watchhouse'])) return buildStatus(s, 'watchpost');
    const out = walkersOut(s, 'watchman');
    return out ? `${out} watchman out on patrol: the task completes when a round is walked.` : 'No watchman out yet: the post needs a road at its door, and it sends one out each morning.';
  },
  w_sexton: (s) => {
    if (!anyOf(s, ['boneyard', 'ossuary'])) return buildStatus(s, 'boneyard');
    const out = walkersOut(s, 'sexton');
    return out ? `${out} sexton out on the rounds: the task completes when a round is walked.` : 'No sexton out yet: the Boneyard needs a road at its door, and it sends one out each morning.';
  },
  w_healer: (s) => (walkersOut(s, 'healer') ? 'A healer is out: the task completes at the first visit.' : 'No healer out yet: the building needs a road at its door.'),
  w_pilgrim: () => 'No prayers yet: pilgrims walk to shrines along the roads.',
  k_council: (s) => { const hall = s.buildings.find((b) => b && b.kind === 'guildhall' && b.state === 'ok'); return hall && !hall.lit ? 'Built, but unlit: the council sits only in a lit Guildhall. Chain a Ley Spire within reach (Mana view, 1).' : buildStatus(s, 'guildhall'); },
  k_boon: (s) => { const best = Math.max(0, ...Object.values(s.guilds?.standing ?? {})); return `The best-pleased guild stands at ${Math.floor(best)}, of 70.`; },
  k_feast: (s) => of(s.stats.feastGoods, 10, 'goods at the Thaw feast'),
  y_quiet: () => 'Not yet: keep the Gloam from pressing through a whole Hush.',
  w_scholar: after('ruindelve', (s) => (s.buildings.some((b) => b && (b.kind === 'academy' || b.kind === 'grandacademy') && b.state === 'ok' && b.lit) ? (walkersOut(s, 'scholar') ? 'A scholar is on the road to the delve.' : 'No scholar out yet: the Academy needs a road at its door, within 60 tiles of the delve.') : 'The Academy is unlit: it sends a scholar only while lit.')),
  q_airship: after('skydock', () => 'No voyage yet.'),
  s_hush: (s) => `Day ${n0(Math.min(s.day, 120))} of 120.`,
  s_vigil: () => 'The vigil is a festival on the first night of the Hush: choose to keep it when it asks.',
  s_feast: () => 'The Thaw feast comes as a festival on Thaw-day: choose to hold it when it asks.',
  r_delve: (s) => buildStatus(s, 'ruindelve'),
  w_ford: () => 'No ford yet: draw a Dirt Track across shallow river water.',
  k_hall: () => 'No guild hall earned yet: keep one guild pleased (70 or more) for a season.',
  k_relics: (s) => `${n0(s.stats.relics)} relics found; ${s.relics.complete.length} sets complete. The Academy names them by set.`,
  w_warden: (s) => (walkersOut(s, 'warden') ? 'A warden is out on the rounds.' : 'No warden out yet: a spire on a road sends one.'),
  z_daily: (s) => `Day ${n0(s.day)} of 60; ${milestonesOf(s)[s.milestone].name}, the fifth milestone is ${milestonesOf(s)[Math.min(5, milestonesOf(s).length - 1)].name}.`,
  c_daughter: () => 'No daughter founded yet: a far ley node can take a daughter charter (click it).',
  z_atoll: (s) => {
    const have = isleBuildings(s);
    const settled = have.filter((c) => c >= SETTLED_BUILDINGS).length;
    return `${settled} of ${ATOLL_ISLES} isles settled (${SETTLED_BUILDINGS} homes, markets, crafts or arcane houses each; now ${have.slice(0, 6).join(', ')}, the great isle first); ${milestonesOf(s)[Math.min(6, milestonesOf(s).length - 1)].name} ${s.milestone >= 6 ? 'reached' : `not yet: ${n0(s.population)} folk`}.`;
  },
  z_island: (s) => `Burned back ${n0(Math.min(s.stats.gloamBurned, 300))} of 300; ${milestonesOf(s)[Math.min(4, milestonesOf(s).length - 1)].name} ${s.milestone >= 4 ? 'reached' : 'not yet'}.`,
};
for (const id of ['c_thorp', 'c_village', 'c_township', 'c_market', 'c_burgh', 'c_free', 'c_beacon', 'z_onenode']) STATUS[id] = (s) => `${n0(s.population)} folk. Next: ${nextGate(s) ?? 'every gate is reached'}.`;

/** "Build X" tasks whose goal is more than that building standing: their line must not say "Built." while they are open.
 *  A test holds this list to the conditions (a plain `has(s, key)` done is the generic case). */
export const NOT_PLAIN_BUILD = new Set(['f_watch', 'd_restless', 'a_academy', 's_brownout', 'p_arch', 'q_quay', 'q_airship', 'w_meat', 'w_fish', 'w_thatch', 'y_quiet', 'k_council', 'k_twinroad', 'k_relics', 'k_relicbuild', 'k_assessor', 'w_scholar', 'z_island']);

/** The task's status line: its own, else the generic one for a "build X" task whose goal is that building; else none. */
export function questStatus(s: GameState, q: QuestDef): string | null {
  const own = q.status ?? STATUS[q.id];
  if (own) return own(s) || null;
  if (q.focus && 'build' in q.focus && !NOT_PLAIN_BUILD.has(q.id)) return buildStatus(s, q.focus.build) || null;
  return null;
}
