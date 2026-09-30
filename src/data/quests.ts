/** The Charter's Ledger: guided goals for every mechanic. See DESIGN.md 4.27. */
import { AgentKind, Zone, type GameState } from '../sim/types';
import { BUILDING_BY_KEY } from '../sim/catalog';

export type Focus =
  | { tool: 'road' | 'zoneHearth' | 'zoneMarket' | 'zoneCraft' | 'zoneArcane' | 'wall' | 'gateBelregi' | 'district' }
  | { build: string }
  | { panel: 'edicts' | 'wyrms' | 'budget' | 'views' | 'chronicle' }
  | { overlay: string }
  | { center: 'founding' | 'gloam' | 'node' | 'cradle' | 'wyrm' | 'ruins' };

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
}

const has = (s: GameState, kind: string, n = 1) => s.buildings.filter((b) => b && b.kind === kind && b.state !== 'ruin').length >= n;
const zoned = (s: GameState, z: Zone, n: number) => { let c = 0; for (let i = 0; i < s.zone.length; i++) if (s.zone[i] === z) c++; return c >= n; };
const roads = (s: GameState) => { let c = 0; for (let i = 0; i < s.road.length; i++) if (s.road[i]) c++; return c; };
const walls = (s: GameState) => { let c = 0; for (let i = 0; i < s.wall.length; i++) if (s.wall[i] === 1) c++; return c; };
const gates = (s: GameState) => { for (let i = 0; i < s.wall.length; i++) if (s.wall[i] >= 2) return true; return false; };
const zoneBuildings = (s: GameState, z?: Zone) => s.buildings.filter((b) => b && BUILDING_BY_KEY[b.kind].category === 'zone' && b.state === 'ok' && (z === undefined || BUILDING_BY_KEY[b.kind].zone === z)) as NonNullable<GameState['buildings'][number]>[];
const unlit = (s: GameState) => zoneBuildings(s).filter((b) => !b.lit).length;
const dry = (s: GameState) => zoneBuildings(s).filter((b) => !b.watered).length;
const districts = (s: GameState) => { for (let i = 0; i < s.district.length; i++) if (s.district[i]) return true; return false; };

export const QUESTS: QuestDef[] = [
  // Founding
  { id: 'f_road', chapter: 'Founding', title: 'Draw a road from the Founding Stake', hint: 'Roads tab, then drag a Dirt Track. Everything grows beside a road.', when: () => true, done: (s) => roads(s) > 8, focus: { tool: 'road' }, reward: 0, priority: 1 },
  { id: 'f_hearth', chapter: 'Founding', title: 'Zone hearths beside the road', hint: 'Zones tab, Hearth, drag a rectangle touching the road.', when: (s) => roads(s) > 8, done: (s) => zoned(s, Zone.Hearth, 6), focus: { tool: 'zoneHearth' }, reward: 0, priority: 2 },
  { id: 'f_jobs', chapter: 'Founding', title: 'Zone Craft works and a Market', hint: 'Folk need jobs; markets need goods from the works.', when: (s) => zoned(s, Zone.Hearth, 6), done: (s) => zoned(s, Zone.Craft, 3) && zoned(s, Zone.Market, 2), focus: { tool: 'zoneCraft' }, reward: 0, priority: 3 },
  { id: 'f_spire', chapter: 'Founding', title: 'Raise a Ley Spire within 6 tiles of the node', hint: 'Ley tab. A lit spire lights 5 tiles; lit buildings light their neighbours.', when: (s) => zoned(s, Zone.Hearth, 6), done: (s) => has(s, 'spire'), focus: { build: 'spire' }, reward: 0, priority: 4 },
  { id: 'f_well', chapter: 'Founding', title: 'Dig a Well', hint: 'Water tab. Wells water 8 tiles, more near the river.', when: (s) => zoned(s, Zone.Hearth, 6), done: (s) => has(s, 'well'), focus: { build: 'well' }, reward: 0, priority: 5 },
  { id: 'f_watch', chapter: 'Founding', title: 'Build a Watch Post and a Shrine of Aume', hint: 'Services tab. The Watch calms unrest; the shrine lifts hearts.', when: (s) => s.population > 15, done: (s) => has(s, 'watchpost') && has(s, 'shrine'), focus: { build: 'watchpost' }, reward: 300, priority: 6 },
  { id: 'f_hamlet', chapter: 'Founding', title: 'Reach 40 folk: a Hamlet', hint: 'Keep zoning where the demand bars are high.', when: (s) => s.population > 15, done: (s) => s.milestone >= 1, reward: 0, priority: 7 },
  // Light and water
  { id: 'l_all', chapter: 'Light and water', title: 'Light every building', hint: 'Mana view (1) shows unlit buildings in red. Chain spires within 6 tiles of each other.', when: (s) => s.milestone >= 1 && unlit(s) > 0, done: (s) => unlit(s) === 0 && zoneBuildings(s).length > 10, focus: { overlay: 'mana' }, reward: 400, priority: 10 },
  { id: 'l_water', chapter: 'Light and water', title: 'Water every building', hint: 'Water view (2). Dry homes lose folk after two weeks.', when: (s) => s.milestone >= 1 && dry(s) > 0, done: (s) => dry(s) === 0 && zoneBuildings(s).length > 10, focus: { overlay: 'water' }, reward: 400, priority: 11 },
  { id: 'l_cistern', chapter: 'Light and water', title: 'Build a Cistern of Vesh', hint: 'Waters 12 tiles but drinks mana.', when: (s) => s.milestone >= 2, done: (s) => has(s, 'cistern'), focus: { build: 'cistern' }, reward: 500, priority: 12 },
  { id: 'l_nexus', chapter: 'Mana', title: 'Build a Ley Nexus', hint: 'Stores 120 mana to soak up peaks before they become surges.', when: (s) => s.milestone >= 4, done: (s) => has(s, 'nexus'), focus: { build: 'nexus' }, reward: 800, priority: 30 },
  { id: 'l_font', chapter: 'Mana', title: 'Raise a Thrum Font', hint: 'A bored well into a deep Vein: +40 mana anywhere.', when: (s) => s.milestone >= 4 && s.manaDemand > s.manaSupply * 0.8, done: (s) => has(s, 'font'), focus: { build: 'font' }, reward: 1000, priority: 31 },
  { id: 'l_deepen', chapter: 'Mana', title: 'Deepen the Wellspring', hint: 'Click the founding node; from Burgh it can be deepened for +45 mana.', when: (s) => s.milestone >= 6, done: (s) => s.nodes.some((n) => (n.depth ?? 0) > 0), focus: { center: 'node' }, reward: 1500, priority: 32 },
  // The dead
  { id: 'd_boneyard', chapter: 'The dead', title: 'Build a Boneyard before the dead rise', hint: 'Unquieted dead become the restless. Services tab.', when: (s) => s.milestone >= 1, done: (s) => has(s, 'boneyard'), focus: { build: 'boneyard' }, reward: 400, priority: 8 },
  { id: 'd_restless', chapter: 'The dead', title: 'Lay a restless to rest', hint: 'Watch coverage (6) and wards clear them; wisps show where they are.', when: (s) => s.agents.some((a) => a.kind === AgentKind.Restless), done: (s) => s.stats.restlessLaid > 0, focus: { build: 'watchpost' }, reward: 500, priority: 9 },
  { id: 'd_ossuary', chapter: 'The dead', title: 'Build an Ossuary', hint: 'Quiets 40 dead a day within 20 tiles.', when: (s) => s.milestone >= 5, done: (s) => has(s, 'ossuary'), focus: { build: 'ossuary' }, reward: 800, priority: 40 },
  // The grey edge
  { id: 'g_ward', chapter: 'The grey edge', title: 'Raise a Ward Lantern', hint: 'Burns back the Gloam within 10 tiles. Needs mana.', when: (s) => s.milestone >= 2, done: (s) => has(s, 'wardlantern'), focus: { build: 'wardlantern' }, reward: 500, priority: 13 },
  { id: 'g_burn', chapter: 'The grey edge', title: 'Burn back 50 tiles of Gloam', hint: 'Wards and Gloam view (g) show the grey and what holds it.', when: (s) => has(s, 'wardlantern'), done: (s) => s.stats.gloamBurned >= 50, focus: { overlay: 'ward' }, reward: 800, priority: 14 },
  { id: 'g_wall', chapter: 'The grey edge', title: 'Draw 20 tiles of Warding Wall', hint: 'Services tab. The Gloam and its hounds never cross it.', when: (s) => s.milestone >= 2 && (s.stats.houndsTotal > 0 || s.stats.gloamTiles > 2000), done: (s) => walls(s) >= 20, focus: { tool: 'wall' }, reward: 600, priority: 15 },
  { id: 'g_hounds', chapter: 'The grey edge', title: 'Kill 10 Gloam-hounds', hint: "A Hunters' Lodge hunts within 12 tiles each night.", when: (s) => s.stats.houndsTotal > 0, done: (s) => s.stats.houndsKilled >= 10, focus: { build: 'hunterslodge' }, reward: 700, priority: 16 },
  { id: 'g_gate', chapter: 'The grey edge', title: 'Raise a gate of the Pass', hint: 'A Belregi or Uzulim gate lets roads through the wall and wards the ground around it.', when: (s) => walls(s) >= 10 && s.milestone >= 3, done: (s) => gates(s), focus: { tool: 'gateBelregi' }, reward: 600, priority: 17 },
  // Goods
  { id: 'o_cart', chapter: 'Goods', title: 'See the first cart deliver', hint: 'Carts carry potions from the works to the markets by road.', when: (s) => zoneBuildings(s, Zone.Craft).length > 0 && zoneBuildings(s, Zone.Market).length > 0, done: (s) => s.stats.goodsDelivered > 0, focus: { overlay: 'goods' }, reward: 200, priority: 18 },
  { id: 'o_full', chapter: 'Goods', title: 'No market short for five days', hint: 'Goods view (o). Zone works near the markets, or build a Trade Depot and import.', when: (s) => s.goodsShort > 0, done: (s) => s.goodsShort === 0 && zoneBuildings(s, Zone.Market).length > 3 && s.day > 20, focus: { overlay: 'goods' }, reward: 600, priority: 19 },
  { id: 'o_depot', chapter: 'Goods', title: 'Build a Trade Depot', hint: 'Sells surplus goods at seasonal prices; caravans stop there.', when: (s) => s.milestone >= 3, done: (s) => has(s, 'depot'), focus: { build: 'depot' }, reward: 700, priority: 20 },
  { id: 'o_caravan', chapter: 'Goods', title: 'Sell 200 goods to a Belerial caravan', hint: 'Caravans come to the depot; choose Trade.', when: (s) => has(s, 'depot'), done: (s) => s.stats.caravanGoods >= 200, reward: 900, priority: 21 },
  // Schooling and the arcane
  { id: 'a_academy', chapter: 'The arcane', title: 'Educate a third of the folk', hint: 'An Academy of the Ley schools within 14 tiles.', when: (s) => s.milestone >= 3, done: (s) => s.educated >= 0.3, focus: { build: 'academy' }, reward: 800, priority: 22 },
  { id: 'a_arcane', chapter: 'The arcane', title: 'Grow the first Arcane building', hint: 'Arcane zones need schooling coverage to grow.', when: (s) => s.milestone >= 4, done: (s) => zoneBuildings(s, Zone.Arcane).length > 0, focus: { tool: 'zoneArcane' }, reward: 800, priority: 23 },
  { id: 'a_mine', chapter: 'The arcane', title: 'Dig a Crystal Mine', hint: 'Must be dug into hills; roads may cut through hills.', when: (s) => s.milestone >= 4, done: (s) => has(s, 'mine'), focus: { build: 'mine' }, reward: 800, priority: 24 },
  { id: 'a_artifact', chapter: 'The arcane', title: 'Sell the first artifacts', hint: 'Enchanters need leystone carted from a mine.', when: (s) => has(s, 'mine') && zoneBuildings(s, Zone.Arcane).length > 0, done: (s) => s.artifactsSold > 0, focus: { panel: 'budget' }, reward: 800, priority: 25 },
  // Districts
  { id: 'x_paint', chapter: 'Districts', title: 'Paint a district', hint: 'Districts tab. Edicts can then be set per district.', when: (s) => s.milestone >= 2, done: (s) => districts(s), focus: { tool: 'district' }, reward: 300, priority: 26 },
  { id: 'x_edict', chapter: 'Districts', title: 'Set an edict for a district', hint: 'Edicts panel, choose the district in Scope.', when: (s) => districts(s), done: (s) => Object.values(s.districtEdicts).some(Boolean), focus: { panel: 'edicts' }, reward: 400, priority: 27 },
  // Seasons
  { id: 's_hush', chapter: 'Seasons', title: 'Survive a Hush', hint: 'Long nights: hearths drink more mana, the Gloam grows bold, hounds hunt.', when: (s) => s.day >= 60, done: (s) => s.day >= 120, reward: 1500, priority: 50 },
  // Beasts
  { id: 'b_loft', chapter: 'Beasts', title: 'Build a Moth-Loft', hint: 'Glimmoths swarm lit ley at night; a loft near it gathers glim-dust for the works.', when: (s) => s.milestone >= 2, done: (s) => has(s, 'mothloft'), focus: { build: 'mothloft' }, reward: 500, priority: 28 },
  // Wyrmcraft
  { id: 'w_cradle', chapter: 'Wyrmcraft', title: 'Raise a Wyrm-Cradle and a Tamer\'s Lodge', hint: 'Cradle near a spire (it must be lit); lodge within 10 tiles.', when: (s) => s.milestone >= 4, done: (s) => has(s, 'cradle') && has(s, 'tamerslodge'), focus: { build: 'cradle' }, reward: 1000, priority: 33 },
  { id: 'w_egg', chapter: 'Wyrmcraft', title: 'Accept an egg', hint: 'The Crown sends one to your first cradle; more come from mines, boneyards, lofts and poachers.', when: (s) => has(s, 'cradle'), done: (s) => s.dragons.length > 0, focus: { panel: 'wyrms' }, reward: 0, priority: 34 },
  { id: 'w_hatch', chapter: 'Wyrmcraft', title: 'Hatch it', hint: 'Keep the cradle lit for 30 days. Then feed it from nearby markets.', when: (s) => s.dragons.length > 0, done: (s) => s.dragons.some((d) => d.stage >= 1) || s.materials.eggshell > 0, focus: { panel: 'wyrms' }, reward: 800, priority: 35 },
  { id: 'w_role', chapter: 'Wyrmcraft', title: 'Give a drake a role', hint: 'Wyrms panel: warden of a district or delver at a mine.', when: (s) => s.dragons.some((d) => d.stage >= 2), done: (s) => s.dragons.some((d) => d.role !== 'none'), focus: { panel: 'wyrms' }, reward: 1000, priority: 36 },
  { id: 'w_courier', chapter: 'Wyrmcraft', title: 'Fly goods with a wyvern courier', hint: 'Ember, vein, sky and storm lines grow wings.', when: (s) => s.dragons.some((d) => d.stage >= 3), done: (s) => s.stats.courierTrips > 0, focus: { panel: 'wyrms' }, reward: 1500, priority: 37 },
  { id: 'w_ring', chapter: 'Wyrmcraft', title: 'Win a bout in the Wyrm-Ring', hint: 'Build the Ring (Market Town) and name a champion; bouts are on day 15 of each season.', when: (s) => s.dragons.some((d) => d.stage >= 2) && s.milestone >= 5, done: (s) => s.stats.boutsWon > 0, focus: { build: 'ring' }, reward: 2000, priority: 38 },
  // Huruhui and Gekiryu craft
  { id: 'k_mill', chapter: 'The riverbank', title: 'Raise a Torrent Mill', hint: 'Ley tab, Township. On the riverbank, touching water and a road: 30 mana a day from falling water.', when: (s) => s.milestone >= 4, done: (s) => has(s, 'torrentmill'), focus: { build: 'torrentmill' }, reward: 800, priority: 29 },
  { id: 'k_glim', chapter: 'Seasons', title: 'Keep the works warm with a Glimhouse', hint: 'Services tab. Craft works within 8 ignore the Hush and make 10% more.', when: (s) => s.milestone >= 3 && zoneBuildings(s, Zone.Craft).length >= 3, done: (s) => has(s, 'glimhouse'), focus: { build: 'glimhouse' }, reward: 500, priority: 39 },
  { id: 'k_gardens', chapter: 'The riverbank', title: 'Plant Hanging Gardens against the hills', hint: 'Services tab, Township. Goods, health and light with no mana; unlocks the Glowvine Lane.', when: (s) => s.milestone >= 4, done: (s) => has(s, 'hanginggardens'), focus: { build: 'hanginggardens' }, reward: 800, priority: 46 },
  { id: 'k_glowvine', chapter: 'The riverbank', title: 'Lay 12 tiles of Glowvine Lane', hint: 'Roads tab. Lit by the vines within 12 tiles of a Hanging Gardens, no mana.', when: (s) => has(s, 'hanginggardens'), done: (s) => { let c = 0; for (let i = 0; i < s.road.length; i++) if (s.road[i] === 4) c++; return c >= 12; }, focus: { tool: 'road' }, reward: 600, priority: 47 },
  { id: 'k_obs', chapter: 'Seasons', title: 'Raise an Astral Observatory', hint: 'Services tab, Market Town. The week ahead appears in the Ledger.', when: (s) => s.milestone >= 5, done: (s) => has(s, 'observatory'), focus: { build: 'observatory' }, reward: 1000, priority: 48 },
  // Longwood and Lukuku
  { id: 'p_arch', chapter: 'The arcane', title: 'Raise a pair of Portal Arches', hint: 'Ley tab, Market Town. Both lit, 12 mana each; carts step from one to the other.', when: (s) => s.milestone >= 5, done: (s) => has(s, 'portalarch', 2), focus: { build: 'portalarch' }, reward: 1200, priority: 49 },
  { id: 'r_delve', chapter: 'The riverbank', title: 'Dig at the Ruins of Lukuku', hint: 'Flagstones in a forest, somewhere on the map. A Ruin Delve there brings up relics.', when: (s) => s.milestone >= 4 && s.terrain.some((t) => t === 8), done: (s) => has(s, 'ruindelve'), focus: { center: 'ruins' }, reward: 800, priority: 50 },
  { id: 't_plant', chapter: 'The Crown', title: 'Plant the World Tree Sapling', hint: 'Leisure tab, Free City. Twenty thousand crowns and four seasons of patience.', when: (s) => s.milestone >= 7, done: (s) => has(s, 'worldtree'), focus: { build: 'worldtree' }, reward: 2000, priority: 67 },
  { id: 't_grown', chapter: 'The Crown', title: 'See the World Tree full-grown', hint: 'Four seasons after planting its shade reaches 24 tiles.', when: (s) => has(s, 'worldtree'), done: (s) => s.buildings.some((b) => b && b.kind === 'worldtree' && b.age >= 90), reward: 3000, priority: 68 },
  // Beasts
  { id: 'e_foundry', chapter: 'Beasts', title: 'Bind a Concord Warden', hint: 'Mines wake them in the hills. A Golem Foundry (Burgh) within 12 tiles binds them into labour.', when: (s) => s.stats.golemsWoken > 0, done: (s) => s.stats.golemsBound > 0, focus: { build: 'golemfoundry' }, reward: 1500, priority: 51 },
  { id: 'e_beacon', chapter: 'Beasts', title: 'Keep a school of skyrays', hint: 'Ley tab, Burgh. A lit Ley Beacon turns a passing school in Bloom or Ember.', when: (s) => s.milestone >= 6, done: (s) => s.stats.rayscaleTotal > 0, focus: { build: 'leybeacon' }, reward: 1500, priority: 52 },
  { id: 'e_mews', chapter: 'Beasts', title: 'Stable Watch drakes', hint: 'Services tab, Burgh. A Drake Mews doubles the reach of every Watch House.', when: (s) => s.milestone >= 6 && has(s, 'watchhouse'), done: (s) => has(s, 'drakemews'), focus: { build: 'drakemews' }, reward: 800, priority: 53 },
  { id: 'e_edict', chapter: 'Beasts', title: 'Set a taming edict', hint: "Edicts panel: Beastmasters' Charter, Hunters' Bounty or Wyrm-Peace.", when: (s) => s.milestone >= 4, done: (s) => !!(s.edicts.beastmasters || s.edicts.bounty || s.edicts.wyrmpeace), focus: { panel: 'edicts' }, reward: 400, priority: 54 },
  // Vehicles
  { id: 'q_quay', chapter: 'Goods', title: 'Send a barge between two Quays', hint: 'Services tab, Village. Two quays on the same river or lake, works near one and markets near the other.', when: (s) => s.milestone >= 3 && zoneBuildings(s, Zone.Market).length > 2, done: (s) => s.stats.bargeTrips > 0, focus: { build: 'quay' }, reward: 700, priority: 55 },
  { id: 'q_float', chapter: 'The arcane', title: 'See a floating cart', hint: 'An Arcane workshop at level 3 sends two hovering carts onto the roads.', when: (s) => zoneBuildings(s, Zone.Arcane).length > 0, done: (s) => s.agents.some((a) => a.kind === 1 && a.variant === 3), reward: 600, priority: 56 },
  { id: 'q_rider', chapter: 'Beasts', title: 'A drake rider lays a restless down', hint: 'Riders fly out from a lit Drake Mews to the restless and to fires.', when: (s) => has(s, 'drakemews'), done: (s) => s.stats.riderRescues > 0, focus: { build: 'drakemews' }, reward: 800, priority: 57 },
  { id: 'q_airship', chapter: 'The Crown', title: 'Launch the airship', hint: 'Leisure tab, Beacon of Eda: the Sky-Dock. The ship leaves on day 3 of each season with your surplus.', when: (s) => s.milestone >= 8, done: (s) => s.stats.airshipVoyages > 0, focus: { build: 'skydock' }, reward: 3000, priority: 69 },
  // The Vein-Wyrm
  { id: 'v_find', chapter: 'The Vein-Wyrm', title: 'Find the Sleeping Wyrm', hint: 'One distant node is ringed with scale, not stone. Click it. Spires there would wake it.', when: (s) => s.wyrm.state !== 'none' && s.milestone >= 3, done: (s) => s.wyrm.waking > 0 || s.wyrm.state !== 'sleeping', focus: { center: 'wyrm' }, reward: 300, priority: 41 },
  { id: 'v_tribute', chapter: 'The Vein-Wyrm', title: 'Settle a tribute', hint: 'Awake, it asks each season: crowns or goods. Refuse and it burns.', when: (s) => s.wyrm.state === 'awake', done: (s) => s.stats.wyrmTributes > 0, focus: { center: 'wyrm' }, reward: 500, priority: 42 },
  { id: 'v_court', chapter: 'The Vein-Wyrm', title: 'Raise the Wyrm-Court', hint: 'Leisure tab, Free City. Needs 40 mana and a third of the folk educated for the song.', when: (s) => s.wyrm.state === 'awake' && s.milestone >= 7, done: (s) => has(s, 'wyrmcourt'), focus: { build: 'wyrmcourt' }, reward: 1000, priority: 43 },
  { id: 'v_bind', chapter: 'The Vein-Wyrm', title: 'Bind the wyrm', hint: 'When the Court is lit the singers offer the binding. A bound wyrm wards 30 tiles and eats 40 goods a day.', when: (s) => has(s, 'wyrmcourt'), done: (s) => s.wyrm.state === 'bound', focus: { center: 'wyrm' }, reward: 3000, priority: 44 },
  { id: 'v_egg', chapter: 'The Vein-Wyrm', title: 'Keep the guardian fed for a season', hint: 'Markets within reach must hold 40 goods a day. A content wyrm lays a vein egg.', when: (s) => s.wyrm.state === 'bound', done: (s) => s.firedEvents.some((f) => f.startsWith('egg_vein')), focus: { panel: 'wyrms' }, reward: 2000, priority: 45 },
  // The Crown
  { id: 'c_thorp', chapter: 'The Crown', title: 'Become a Thorp (100 folk)', hint: 'Zone, light, water; keep taxes near 10%.', when: (s) => s.milestone === 1, done: (s) => s.milestone >= 2, reward: 0, priority: 60 },
  { id: 'c_village', chapter: 'The Crown', title: 'Become a Village (220 folk)', hint: 'Healers and a Boneyard keep folk alive and quiet.', when: (s) => s.milestone === 2, done: (s) => s.milestone >= 3, reward: 0, priority: 61 },
  { id: 'c_township', chapter: 'The Crown', title: 'Become a Township (400 folk)', hint: 'Schooling unlocks the arcane.', when: (s) => s.milestone === 3, done: (s) => s.milestone >= 4, reward: 0, priority: 62 },
  { id: 'c_market', chapter: 'The Crown', title: 'Become a Market Town (650 folk)', hint: 'Markets need goods; carts need roads.', when: (s) => s.milestone === 4, done: (s) => s.milestone >= 5, reward: 0, priority: 63 },
  { id: 'c_burgh', chapter: 'The Crown', title: 'Become a Burgh (1000 folk)', hint: 'Watch the mana; a Nexus and Fonts carry a burgh.', when: (s) => s.milestone === 5, done: (s) => s.milestone >= 6, reward: 0, priority: 64 },
  { id: 'c_free', chapter: 'The Crown', title: 'Become a Free City (1500 folk)', hint: 'Deepen the Wellspring; districts and edicts keep the peace.', when: (s) => s.milestone === 6, done: (s) => s.milestone >= 7, reward: 0, priority: 65 },
  { id: 'c_beacon', chapter: 'The Crown', title: 'Become a Beacon of Eda (2200 folk)', hint: 'Raise the Lantern of Vell.', when: (s) => s.milestone === 7, done: (s) => s.milestone >= 8, reward: 0, priority: 66 },
];

/** The advisor: one line about the city's worst current problem, or null. */
export function advise(s: GameState): { text: string; focus?: Focus } | null {
  const zb = zoneBuildings(s);
  if (zb.length < 4) return null;
  const u = unlit(s);
  const d = dry(s);
  if (s.overdrawDays > 0) return { text: 'Mana overdrawn: a wild surge is coming. Build a Nexus or Thrum Font, or cut consumers.', focus: { build: 'nexus' } };
  if (s.treasury < 0) return { text: 'The treasury is in debt. Raise the tithe a little or cut upkeep; five days below −8,000 ends the Charter.', focus: { panel: 'budget' } };
  if (u > zb.length * 0.25) return { text: `${u} buildings have no mana. Chain Ley Spires within 6 tiles of a node or another lit spire.`, focus: { overlay: 'mana' } };
  if (d > zb.length * 0.25) return { text: `${d} buildings are dry. Dig Wells or a Cistern near them.`, focus: { overlay: 'water' } };
  if (s.unquieted > 12 && !has(s, 'boneyard')) return { text: 'The dead are piling up unquieted. Build a Boneyard before they rise.', focus: { build: 'boneyard' } };
  if (s.agents.filter((a) => a.kind === AgentKind.Restless).length > 5) return { text: 'The restless walk. Watch coverage and wards lay them down.', focus: { overlay: 'watch' } };
  if (s.goodsShort > Math.max(3, zoneBuildings(s, Zone.Market).length * 0.4)) return { text: 'Markets are running dry. Zone Craft works with a road to them, or import through a Trade Depot.', focus: { overlay: 'goods' } };
  if (s.agents.some((a) => a.kind === AgentKind.Creature && a.species === 'hound') && !has(s, 'hunterslodge')) return { text: "Gloam-hounds are hunting at the edge. A Hunters' Lodge or a Warding Wall stops them.", focus: { build: 'hunterslodge' } };
  if (s.wyrm.state === 'bound' && s.wyrm.sulking > 0) return { text: 'The bound wyrm is sulking: its lair no longer wards the Gloam. Feed it 40 goods a day from the markets.', focus: { overlay: 'goods' } };
  if (s.wyrm.state === 'sleeping' && s.wyrm.waking >= 50) return { text: 'Spires near the Sleeping Wyrm are waking it. Bulldoze them, or prepare a tribute.', focus: { center: 'wyrm' } };
  if (s.unrest > 0.35) return { text: 'Unrest is high. More Watch coverage, lower taxes, or a Night Curfew edict.', focus: { panel: 'edicts' } };
  if (s.happiness < 40) return { text: 'Folk are unhappy. Check the Happiness view (4) for the worst streets.', focus: { overlay: 'happiness' } };
  const gloamNear = zb.some((b) => s.gloamDist[b.y * s.w + b.x] < 6);
  if (gloamNear && !has(s, 'wardlantern')) return { text: 'The Gloam whispers at your buildings. Raise a Ward Lantern near the grey.', focus: { build: 'wardlantern' } };
  return null;
}
