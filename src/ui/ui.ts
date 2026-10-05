import { FACTIONS, buildsFor, canBuild, factionKey, factionOf, gateMet, milestonesOf, nextGate, specialLock, type FactionId, costOf } from '../data/factions';
/** DOM UI: top bar, toolbar, info views, demand, log, building info, modals. */
import { BUILDINGS, BUILDING_BY_KEY, ROADS, ROAD_BY_TYPE, GATE_COST, GATE_UNLOCK, WALL_COST, WALL_MANA, WALL_UNLOCK, WALL_UPKEEP, isRoadUnlocked, isZoneUnlocked, type BuildingDef } from '../sim/catalog';
import { DEBT_DAYS, FAVOUR_AUDIT, FAVOUR_NEUTRAL, FAVOUR_STEP, LEVY_FLOOR, LEVY_RATE, LOAN_INTEREST, computeLedger, debtLine, favourFactor, grantFor, levyDue, loanLimit } from '../sim/economy';
import { EDUCATED_FLOOR_CAP, HOSPICE_DRAUGHTS, capacityOf, computeBuildingHappiness, demandReasons, grandAcademyBonus, happinessTerms, idleScholars, levelUpNeeds, theftAt, workforceOf, type Term, demandExplain, type DemandZone } from '../sim/growth';
import { crewFactor, landBonusMap, landValueTerms } from '../sim/services';
import { greyInReach, wardBurnBudget } from '../sim/hazards';
import { manaUseOf } from '../sim/networks';
import { AgentKind, RoadType, Zone, cracked, idx, type Building, type GameState, type WildSpecies } from '../sim/types';
import { CLOSE_FLOOR, HUNT_REACH, LODGE_MEAT_KEEP, MARKET_MEAT_CAP, MEAT_REACH, WILD, WILD_SPECIES, herdsInGrounds, huntBlock, quarryOf, setQuarry } from '../sim/wild';
import { CITY_NAMES, NODE_DEEPEN_COST, NODE_DEEPEN_MANA, NODE_SEEP, districtName, nodeFlowOf, timeOfDay, waterRadiusOf, stakeHallName, GROWING_HALLS } from '../sim/world';
import { PORTAL_CAP, PORTAL_MANA, isLeyMember, lakeFed, loadCapOf, priorityOf, seatWarmed, waterCapAt, wicksHalved } from '../sim/networks';
import { FISH_HAPPY_REACH, FISH_MARKET_REACH, MARKET_FISH_CAP, SMOKE_KEEP, SMOKE_REACH, THATCH_FIRE, THATCH_HAPPY, WEIR_REACH, bodyOf, catchOf, ensureShoals, fishBlock, fishedOut, reedBeds, shoalCap, thatched } from '../sim/water';
import { SEAM, SPENT_RATE } from '../sim/growth';
import { GREY_DAYS, fontsRunHot } from '../sim/hazards';
import { mewsActive } from '../sim/beasts';
import { MOORINGS } from '../data/factions';
import { OVERLAY_LIST, OVERLAYS } from '../render/overlays';
import { BOON_AT, COUNCIL_SPACING, GUILDS, GUILD_IDS, CHARTER_COST, HALL_DAYS, HALL_OF, RIVAL_OF, STRIKE_AT, isChartered, guildDrivers, guildEffect, guildMood, hallActive, hasCouncil, type GuildId } from '../sim/guilds';
import { RELICS_PER_PIECE, RELIC_SETS, hasAcademy } from '../sim/relics';
import { canBreed } from '../sim/breeding';
import { WALKER_JOBS, walkersOf } from '../sim/walkers';
import { brickworksNear, builderTarget, buildersAt, construction, sites } from '../sim/construction';
import { DEV_COMMANDS, DEV_GROUPS, devNumber, devOptions, type DevArg } from '../sim/dev';
import { tradeRoutes } from '../sim/trade';
import { CARAVAN_EVERY, caravanDue, caravanSurplus, heartTrust } from '../sim/events';
import { houndLine, unitName } from '../sim/hounds';
import { PASS_ALMS, belregiReach, greatGateReach, passPilgrims, pilgrimsDue } from '../sim/gate';
import { TIPS } from '../data/flavor';
import { EDICT_BY_KEY, EDICT_MIN_DAYS, EDICT_REPEAL, districtsInUse, edictLocked, edictsFor } from '../sim/edicts';
import { CHARTER_LOCK_DAYS, DISTRICT_UNLOCK, QUARTERS, QUARTER_BY_ID, type QuarterId, districtSlots, districtInUse, districtUnlockNotes, charterCostOf, charterHeld, charterLocked, districtOpenAt } from '../sim/districts';
import { GREY_EGG_DAYS, FEED_REACH, FORGE_BURN, GREAT_CRADLE_COST, GREAT_CRADLE_MANA, GREAT_CRADLE_MILESTONE, LINE_INFO, LODGE_REACH, LODGE_SEATS, REGRESS_AFTER, STAGE_DAYS, STAGE_NAMES, MAX_STAGE_NOW, WYRMFIRE_BURN, boutOdds, cradleCapacity, delverAt, dragonsIn, eats, feedingMarkets, forgeHot, isCradle, isGreatCradle, lodgeSeats, lodgesFor, marketsInReach, nextBoutDay, ringChampion, scaleMailOn, stageCap } from '../sim/wyrmcraft';
import { BARGE_VARIANT, FLOAT_VARIANT, GOLEM_LOAD, TIDE_REACH, WYVERN_DAYS, WYVERN_LOAD, dockWyvern, swimsBarges, tideMooring } from '../sim/vehicles';
import type { Training, DragonRole } from '../sim/types';
import { DISTRICT_COLORS, ramps } from '../render/overlays';
import { marketStockCap, roadTileOf } from '../sim/agents';
import { marketRoadMultAt, marketRoadWords } from '../sim/roads';
import { craftStockCap } from '../sim/growth';
import { SEASON_NAMES, DAYS_PER_SEASON, DISTRICT_NAMES, MAX_DISTRICTS } from '../sim/types';
import type { Tool } from './tools';
import type { Camera } from '../render/camera';
import type { Scenario } from '../sim/types';
import { CHALLENGE_DAYS, SCENARIOS, challengeScore } from '../sim/scenario';
import { SECTOR, SECTORS_X, canBuySector, charteredCount, inCharter, sectorCost, sectorName } from '../sim/sectors';
import { daughterPopulation, TWIN_POP } from '../sim/charter';
import { ASPECT_INFO, AURA_INFO, WEATHER_WORD, aspectAt, aurasAt, pressureWord } from '../sim/weave';
import { KEY_ACTIONS, DEFAULT_KEYS as DEFAULT_KEYS_LOCAL, keyLabel, type KeyAction } from './keys';
import { UNBINDABLE, keepFocusThroughRebuilds, roving, watchDialogs, watchRegions } from './focus';
import { TERRAFORM, type TerraformOp } from '../sim/actions';
import { QUESTS } from '../data/quests';
import { PAL } from '../render/palette';
import { Terrain } from '../sim/types';
import { activeQuests, questProgress } from '../sim/quests';
import { advise, type Focus } from '../data/quests';
import { ANNALS, type AnnalRow } from '../data/annals';
import { WYRM_EATS, WYRM_LAIR_RADIUS, describeWyrm, wyrmEats, wyrmNode, wyrmTribute } from '../sim/wyrm';
import { forecast } from '../sim/forecast';
import { describeBeasts, boundGolems, labourGolems, wildGolems, raysLured, GOLEM_GUARD_RADIUS, GOLEM_HOUSES, GOLEM_LABOUR, GOLEM_POST_REACH, postableWorks } from '../sim/beasts';
import { HUSH_CRAFT, glimhouseNear, treeStage, TREE_LEISURE_RADIUS, TREE_WARD_RADIUS } from '../sim/growth';
import { seasonOf as seasonOfState } from '../sim/world';

export interface UiHost {
  state: GameState;
  speed: number;
  paused: boolean;
  tool: Tool;
  overlay: string | null;
  muted: boolean;
  setSpeed(s: number): void;
  togglePause(): void;
  setTool(t: Tool): void;
  setOverlay(id: string | null): void;
  newGame(seed: number, name: string, scenario: Scenario | 'daily', faction?: FactionId): void;
  continueGame(): boolean;
  hasSave(): boolean;
  save(): void;
  exportJson(): void;
  importJson(file: File): void;
  /** Replays (iteration 67): the charter's commands exported; a replay watched; the lodge's quarry as a command. */
  exportReplay(): string | null;
  watchReplay(file: File): void;
  skipReplay(): void;
  readonly replaying: boolean;
  setQuarry(id: number, q: string): void;
  setMuted(m: boolean): void;
  musicOn: boolean;
  setMusic(on: boolean): void;
  setTax(zone: keyof GameState['taxRates'], v: number): void;
  setEdict(key: string, on: boolean, district: number): string | null;
  takeLoan(): string | null;
  repayLoan(): string | null;
  setQuarter(district: number, q: QuarterId | null): string | null;
  seeLesson(id: string): void;
  setPriority(id: number, p: 0 | 1 | 2): void;
  settings: { colorBlind: boolean; uiScale: number; keys: Record<KeyAction, string> };
  setSetting(key: 'colorBlind' | 'uiScale' | 'keys', value: boolean | number | Record<KeyAction, string>): void;
  selectedNode: number;
  selectedSector: number;
  buySector(k: number): string | null;
  deepenNode(i: number): void;
  foundDaughter(i: number, name: string): string | null;
  canDeepenNode(i: number): string | null;
  canFoundDaughter(i: number): string | null;
  renameDistrict(d: number, name: string): void;
  undo(): boolean;
  undoLabel: string | null;
  setTraining(id: number, t: Training): void;
  callRain(buildingId: number): void;
  replate(buildingId: number): void;
  vent(buildingId: number): void;
  setRole(id: number, role: DragonRole, target: number): string | null;
  raiseCradle(id: number): string | null;
  lineNest(id: number): string | null;
  setBurnWyrmfire(on: boolean): void;
  toggleSluice(id: number): string | null;
  toggleSkyDock(): string | null;
  setGolemDuty(id: number, duty: 'labour' | 'guard' | 'works' | 'haul', target: number): string | null;
  scatterDust(x: number, y: number): boolean;
  resolveEvent(choice: number, amount?: number): void;
  centerOn(x: number, y: number): void;
  camera: Camera;
  selected: Building | null;
  select(b: Building | null): void;
  perf: { fps: number; ms: number; drawn: number };
  dev(id: string, arg: string): string;
  charterGuilds(g: GuildId): string | null;
}

const CATEGORIES: { id: string; name: string; filter: (d: BuildingDef) => boolean }[] = [
  { id: 'roads', name: 'Roads', filter: () => false },
  { id: 'zones', name: 'Zones', filter: () => false },
  { id: 'ley', name: 'Ley', filter: (d) => d.category === 'ley' },
  { id: 'water', name: 'Water', filter: (d) => d.category === 'water' },
  { id: 'service', name: 'Services', filter: (d) => d.category === 'service' },
  { id: 'leisure', name: 'Leisure', filter: (d) => d.category === 'leisure' || d.category === 'wonder' },
  { id: 'marvel', name: 'Marvels', filter: (d) => d.category === 'marvel' },
  { id: 'districts', name: 'Districts', filter: () => false },
  { id: 'land', name: 'Land', filter: () => false },
];


export class UI {
  root: HTMLElement;
  category = 'roads';
  private el: Record<string, HTMLElement> = {};
  private lastLogLen = -1;
  private lastLogMsg: unknown = null;
  private lastMilestone = -1;
  private toastTimer = 0;
  private tipIndex = 0;

  constructor(private host: UiHost) {
    this.root = document.getElementById('ui')!;
    this.build();
  }

  private q<T extends HTMLElement>(sel: string): T {
    return this.root.querySelector(sel) as T;
  }

  private build(): void {
    this.root.innerHTML = `
      <div id="topbar" class="panel">
        <canvas id="clock" width="34" height="34" title="Time of day"></canvas>
        <div class="stat city"><span class="v" id="tb-name"></span><span class="l" id="tb-title"></span></div>
        <span id="tb-replay" class="replay-badge hidden" title="A recorded charter playing itself: the map and the panels can be read, not changed">REPLAY <button id="tb-skip" title="Run the replay to its end and check it against its recording">Skip to end</button></span>
        <div class="stat"><span class="v" id="tb-date"></span><span class="l">day</span></div>
        <div class="stat"><span class="v gold" id="tb-gold"></span><span class="l" id="tb-net">tithe/day</span></div>
        <div class="stat"><span class="v" id="tb-pop"></span><span class="l">folk</span></div>
        <div class="stat opt"><span class="v" id="tb-jobs"></span><span class="l">jobs</span></div>
        <div class="stat"><span class="v ley" id="tb-mana"></span><span class="l">mana use / flow</span></div>
        <div class="stat"><span class="v" id="tb-happy"></span><span class="l">happiness</span></div>
        <div class="stat"><span class="v" id="tb-unrest"></span><span class="l">unrest</span></div>
        <div class="stat opt"><span class="v" id="tb-goods"></span><span class="l">goods sold / short</span></div>
        <div class="spacer"></div>
        <div class="speed">
          <button id="sp-0" title="Pause (Space)">❚❚</button>
          <button id="sp-1" title="Normal (,/.)">1×</button>
          <button id="sp-2">2×</button>
          <button id="sp-3">3×</button>
        </div>
        <button id="btn-budget" title="Tithe & budget">Budget</button>
        <button id="btn-edicts" title="City edicts (policies)">Edicts</button>
        <button id="btn-wyrms" title="Dragons, eggs and materials">Wyrms</button>
        <button id="btn-chronicle" title="Chronicle: what has happened in the world (C)">Chronicle</button>
        <button id="btn-annals" title="Annals: every counter the charter keeps (N)">Annals</button>
        <button id="btn-views" title="Info views (V)">Views</button>
        <button id="btn-help" title="Help (H)">Help</button>
        <button id="btn-menu" title="Menu">Menu</button>
      </div>
      <div id="left">
      <div id="toolbar" class="panel">
        <div class="tabs"></div>
        <div class="items"></div>
        <div class="quick">
          <button id="q-select" title="Select (X)">Select</button>
          <button id="q-bulldoze" title="Bulldoze (B)">Bulldoze</button>
          <button id="q-undo" title="Undo last action (Ctrl+Z)">Undo</button>
        </div>
        <div class="hint"></div>
      </div>
      <div id="tasks" class="panel hidden"><h3>The Charter's Ledger <span class="prog muted"></span> <button class="done" title="Completed tasks">Done</button><button class="min" title="Collapse">–</button></h3><div class="score hidden"></div><div class="advice hidden"></div><div class="forecast hidden"></div><div class="list"></div></div>
      <div id="info" class="panel hidden" role="region" aria-label="Selected"></div>
      </div>
      <div id="tooltip" class="panel hidden"></div>
      <div id="views" class="panel hidden"><h3>Info views <span class="grip" title="Drag to move">⋮⋮</span></h3><div class="list"></div><div class="legend"></div></div>
      <div id="demand" class="panel"></div>
      <div id="minimap" class="panel"><span class="grip" title="Drag to move">⋮⋮</span><button class="min" title="Collapse">–</button><canvas width="264" height="132" title="Click to jump; the box is the current view"></canvas></div>
      <div id="log" class="panel"><span class="grip" title="Drag to move">⋮⋮</span><div class="lines"></div></div>
      <div id="perf" class="panel"></div>
      <div id="toast" class="panel hidden"></div>
      <div id="lesson" class="panel hidden"></div>
      <div id="title" class="modal"></div>
      <div id="help" class="modal hidden"></div>
      <div id="budget" class="modal hidden"></div>
      <div id="menu" class="modal hidden"></div>
      <div id="gameover" class="modal hidden"></div>
      <div id="edicts" class="modal hidden"></div>
      <div id="wyrms" class="modal hidden"></div>
      <div id="event" class="modal hidden"></div>
      <div id="chronicle" class="modal hidden"></div>
      <div id="annals" class="modal hidden"></div>
      <div id="dev" class="modal hidden" role="dialog" aria-label="Dev tools"></div>
    `;
    for (const id of ['topbar', 'toolbar', 'tooltip', 'views', 'demand', 'log', 'info', 'toast', 'title', 'help', 'budget', 'menu', 'gameover', 'perf', 'clock', 'tasks', 'edicts', 'event', 'wyrms', 'chronicle', 'annals', 'minimap', 'dev', 'lesson']) this.el[id] = this.q(`#${id}`);
    for (let s = 0; s <= 3; s++) this.q(`#sp-${s}`).onclick = () => (s === 0 ? this.host.togglePause() : this.host.setSpeed(s));
    this.q('#btn-budget').onclick = () => this.toggleBudget();
    this.q('#btn-edicts').onclick = () => this.toggleEdicts();
    this.q('#btn-wyrms').onclick = () => this.toggleWyrms();
    this.q('#btn-chronicle').onclick = () => this.toggleChronicle();
    this.q('#btn-annals').onclick = () => this.toggleAnnals();
    (this.q('#tasks .min') as HTMLButtonElement).onclick = () => { this.tasksCollapsed = !this.tasksCollapsed; this.lastQuestKey = ''; this.refreshTasks(); };
    (this.q('#tasks .done') as HTMLButtonElement).onclick = () => { this.showDone = !this.showDone; this.lastQuestKey = ''; this.refreshTasks(); };
    this.q('#btn-views').onclick = () => this.el.views.classList.toggle('hidden');
    this.q('#btn-help').onclick = () => this.toggleHelp();
    this.q('#btn-menu').onclick = () => this.toggleMenu();
    this.q('#tb-skip').onclick = () => this.host.skipReplay();
    this.q('#q-select').onclick = () => this.host.setTool({ kind: 'select' });
    this.q('#q-bulldoze').onclick = () => this.host.setTool({ kind: 'bulldoze' });
    this.q('#q-undo').onclick = () => this.host.undo();
    this.makeDraggable(this.el.views, 'views');
    this.makeDraggable(this.el.minimap, 'minimap');
    this.buildMinimap();
    this.makeDraggable(this.el.log, 'log');
    this.makeDraggable(this.el.info, 'info');
    // accessibility: names for icon-only controls, roles for panels and dialogs, a live ticker
    this.root.querySelectorAll('button[title]').forEach((b) => b.setAttribute('aria-label', (b as HTMLButtonElement).title));
    this.el.toolbar.setAttribute('role', 'toolbar');
    this.el.toolbar.setAttribute('aria-label', 'Build tools');
    this.el.log.querySelector('.lines')!.setAttribute('aria-live', 'polite');
    this.root.querySelectorAll('.modal').forEach((m) => { m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); });
    this.el.minimap.setAttribute('aria-label', 'Minimap: click to move the view');
    // keyboard focus (iteration 66): regions with names, a skip link first, dialogs that hold focus, F6 between regions
    for (const [id, label] of [['topbar', 'City and speed'], ['tasks', "The Charter's Ledger"], ['views', 'Info views'], ['minimap', 'Minimap']] as [string, string][]) { this.el[id].setAttribute('role', id === 'topbar' ? 'banner' : 'region'); if (id !== 'minimap') this.el[id].setAttribute('aria-label', label); }
    const skip = document.createElement('a');
    skip.href = '#game';
    skip.className = 'skip';
    skip.textContent = 'Skip to the map';
    skip.onclick = (e) => { e.preventDefault(); (document.getElementById('game') as HTMLElement | null)?.focus(); };
    this.root.prepend(skip);
    watchDialogs(this.root);
    keepFocusThroughRebuilds(this.root);
    watchRegions();
    this.buildTabs();
    this.buildViews();
    this.buildHelp();
    this.buildTitle();
    this.buildMenu();
    this.refreshItems();
  }

  // ---------- toolbar ----------
  private buildTabs(): void {
    const tabs = this.q('#toolbar .tabs');
    tabs.innerHTML = '';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Tool categories');
    for (const c of CATEGORIES) {
      const b = document.createElement('button');
      b.textContent = c.name;
      b.dataset.cat = c.id;
      b.setAttribute('role', 'tab');
      b.onclick = () => {
        this.category = c.id;
        this.refreshItems();
      };
      tabs.appendChild(b);
    }
    // one tab stop for the categories, the arrows move between them and open each (iteration 66)
    roving(tabs as HTMLElement, { selected: () => tabs.querySelector('button.active'), activate: true });
    const items = this.q('#toolbar .items') as HTMLElement;
    items.setAttribute('role', 'group');
    items.setAttribute('aria-label', 'Tools');
    roving(items, { selected: () => items.querySelector('button.active') ?? items.querySelector('button:not(.locked)'), grid: true });
  }

  refreshItems(): void {
    const s = this.host.state;
    const items = this.q('#toolbar .items');
    // the items are rebuilt: a focused item keeps its place (iteration 66)
    const hadFocus = items.contains(document.activeElement) ? Array.from(items.children).indexOf(document.activeElement as Element) : -1;
    items.innerHTML = '';
    this.q('#toolbar .tabs').querySelectorAll('button').forEach((b) => { const on = (b as HTMLElement).dataset.cat === this.category; b.classList.toggle('active', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    ((this.q('#toolbar .tabs') as HTMLElement & { settleRoving?: () => void }).settleRoving)?.();
    const add = (label: string, cost: string, locked: boolean, active: boolean, onClick: () => void, tip: () => string) => {
      const b = document.createElement('button');
      b.innerHTML = `<span>${label}</span><span class="cost">${cost}</span>`;
      if (locked) { b.classList.add('locked'); b.setAttribute('aria-disabled', 'true'); }
      if (active) b.classList.add('active');
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
      b.setAttribute('aria-label', `${label}${cost ? `, ${cost}` : ''}${locked ? ', locked' : ''}`);
      b.onclick = onClick;
      b.onmouseenter = (e) => this.showTooltip(tip(), e.clientX, e.clientY);
      b.onmousemove = (e) => this.moveTooltip(e.clientX, e.clientY);
      b.onmouseleave = () => this.hideTooltip();
      items.appendChild(b);
    };
    const t = this.host.tool;
    if (this.category === 'roads') {
      for (const r of ROADS) {
        const locked = !isRoadUnlocked(s.milestone, r.type) || (!!r.requires && !s.buildings.some((b) => b && b.kind === r.requires && b.state === 'ok'));
        add(r.name, `${r.cost}c/tile`, locked, t.kind === 'road' && t.type === r.type, () => this.host.setTool({ kind: 'road', type: r.type }), () => `<div class="t">${r.name}</div>${r.desc}<br><span class="muted">Cost ${r.cost}/tile · upkeep ${r.upkeep}/day${r.manaUse ? ` · ${r.manaUse} mana/tile` : ''}${locked ? `<br>Unlocks at ${this.ms()[r.unlock].name}` : ''}</span>`);
      }
    } else if (this.category === 'zones') {
      const zones: [Zone, string, string][] = [
        [Zone.Hearth, 'Hearth', 'hearth'],
        [Zone.Market, 'Market', 'market'],
        [Zone.Craft, 'Craft', 'craft'],
        [Zone.Arcane, 'Arcane', 'arcane'],
      ];
      for (const [z, name, key] of zones) {
        const def = BUILDING_BY_KEY[key];
        const locked = !isZoneUnlocked(s.milestone, z);
        add(name, 'free', locked, t.kind === 'zone' && t.zone === z, () => this.host.setTool({ kind: 'zone', zone: z }), () => `<div class="t">${def.name}</div>${def.desc}<br><span class="flavor">${def.flavor}</span>${locked ? `<br><span class="muted">Unlocks at ${this.ms()[def.unlock].name}</span>` : ''}`);
      }
      add('De-zone', '', false, t.kind === 'zone' && t.zone === Zone.None, () => this.host.setTool({ kind: 'zone', zone: Zone.None }), () => `<div class="t">De-zone</div>Removes zoning (and any zoned building) from the area.`);
    } else if (this.category === 'land') {
      add('Glim-dust', '1 dust/tile', s.milestone < 2, t.kind === 'dust', () => this.host.setTool({ kind: 'dust' }), () => `<div class="t">Scatter glim-dust</div>One glim-dust lights a track or cobbled tile for a season: land value and a warm glow where no spire reaches, but it conducts no ley and lights no building. ${s.materials.glimdust.toFixed(1)} in the vault (Moth-Lofts gather it; rays over a Rayscale Mirror shed it).${s.milestone < 2 ? `<br><span class="muted">Unlocks at ${this.ms()[2].name}</span>` : ''}`);
      for (const op of (Object.keys(TERRAFORM) as TerraformOp[]).filter((k) => !TERRAFORM[k].faction || TERRAFORM[k].faction!.includes(s.faction))) {
        const d = TERRAFORM[op];
        const locked = s.milestone < d.unlock;
        add(d.name, `${d.cost}c/tile`, locked, t.kind === 'terrain' && t.op === op, () => this.host.setTool({ kind: 'terrain', op }), () => `<div class="t">${d.name}</div>${d.desc}${locked ? `<br><span class="muted">Unlocks at ${this.ms()[d.unlock].name}</span>` : ''}`);
      }
    } else if (this.category === 'districts') {
      const slots = districtSlots(s);
      for (let d = 1; d <= MAX_DISTRICTS; d++) {
        const name = districtName(s, d);
        const q = s.districtQuarters[d];
        const dLocked = d > slots && !districtInUse(s, d);
        const opensAt = this.ms()[districtOpenAt(d)].name;
        add(`<span style="color:${DISTRICT_COLORS[d - 1]}">■</span> ${name}${q ? ` <span class="muted">· ${QUARTER_BY_ID[q].name}</span>` : ''}`, dLocked ? `at the ${opensAt}` : '', dLocked, t.kind === 'district' && t.id === d, () => this.host.setTool({ kind: 'district', id: d }), () => `<div class="t">${name}${q ? ` · ${QUARTER_BY_ID[q].name}` : ''}</div>Drag a rectangle to paint this district over part of the city, then give it a <b>charter</b> in the Edicts panel (<b>E</b>): a Hearth, Craft, Market, Scholars' or Temple quarter, each with a gift and a price for the buildings inside it. Edicts can also be set for one district alone. Press <b>i</b> for the district view.${q ? `<br><span class="muted">${QUARTER_BY_ID[q].effect} ${QUARTER_BY_ID[q].cost}</span>` : ''}${dLocked ? `<br><span class="muted">Unlocks at ${this.ms()[DISTRICT_UNLOCK].name}</span>` : ''}`);
      }
      add('Clear district', '', false, t.kind === 'district' && t.id === 0, () => this.host.setTool({ kind: 'district', id: 0 }), () => `<div class="t">Clear</div>Removes district paint from the area.`);
    } else {
      const cat = CATEGORIES.find((c) => c.id === this.category)!;
      if (this.category === 'service') {
        const locked = s.milestone < WALL_UNLOCK;
        const glocked = s.milestone < GATE_UNLOCK;
        add('Belregi Gate', `${GATE_COST[2]}c`, glocked, t.kind === 'gate' && t.style === 2, () => this.host.setTool({ kind: 'gate', style: 2 }), () => `<div class="t">Belregi Gate</div>A runed arch of pale stone in the Warding Wall; roads pass through it. Faith +0.3 and ward +0.2 within 8 tiles (12 beside a lit Great Gate, 16 with the Heart of Belregi set in it).<br><span class="flavor">Blue runes that tell the history of whoever keeps them.</span>${glocked ? `<br><span class="warn">Unlocks at ${this.ms()[GATE_UNLOCK].name}</span>` : ''}`);
        add('Uzulim Gate', `${GATE_COST[3]}c`, glocked, t.kind === 'gate' && t.style === 3, () => this.host.setTool({ kind: 'gate', style: 3 }), () => `<div class="t">Uzulim Gate</div>A dark volcanic arch with crimson symbols and hooded statues; roads pass through it. Ward +0.4 and watch +0.3 within 10 tiles; unrest +2% per gate.<br><span class="flavor">The statues' eyes follow anyone who approaches.</span>${glocked ? `<br><span class="warn">Unlocks at ${this.ms()[GATE_UNLOCK].name}</span>` : ''}`);
        add('Warding Wall', `${WALL_COST}c/tile`, locked, t.kind === 'wall', () => this.host.setTool({ kind: 'wall' }), () => `<div class="t">Warding Wall</div>A line of leystone-inlaid stone. The Gloam cannot cross it and Gloam-hounds cannot pass. Drag to draw.<br><span class="muted">Cost ${WALL_COST}/tile (×2 in hills) · upkeep ${WALL_UPKEEP}/tile/day · ${WALL_MANA} mana/tile</span><br><span class="flavor">Every stone sung over once, so the grey grass forgets how to grow across it.</span>${locked ? `<br><span class="warn">Unlocks at ${this.ms()[WALL_UNLOCK].name}</span>` : ''}`);
      }
      for (const d of BUILDINGS.filter(cat.filter).filter((d) => buildsFor(factionOf(s), d))) {
        const locked = !canBuild(s, d.key);
        const mats = d.materials ? ' + ' + Object.entries(d.materials).map(([k, v]) => `${v} ${k}`).join(', ') : '';
        add(d.name, `${costOf(s, d)}c${mats}`, locked, t.kind === 'build' && t.key === d.key, () => this.host.setTool({ kind: 'build', key: d.key }), () => this.buildingTip(d, locked, costOf(s, d)));
      }
    }
    this.q('#q-select').classList.toggle('active', t.kind === 'select');
    (this.q('#q-undo') as HTMLButtonElement).disabled = !this.host.undoLabel;
    this.q('#q-undo').title = this.host.undoLabel ? `Undo ${this.host.undoLabel} (Ctrl+Z)` : 'Nothing to undo';
    this.q('#q-bulldoze').classList.toggle('active', t.kind === 'bulldoze');
    this.q('#q-select').setAttribute('aria-pressed', t.kind === 'select' ? 'true' : 'false');
    this.q('#q-bulldoze').setAttribute('aria-pressed', t.kind === 'bulldoze' ? 'true' : 'false');
    ((items as HTMLElement & { settleRoving?: () => void }).settleRoving)?.();
    if (hadFocus >= 0) { const list = items.querySelectorAll<HTMLButtonElement>('button'); const b = list[Math.min(hadFocus, list.length - 1)]; if (b) { list.forEach((x) => (x.tabIndex = -1)); b.tabIndex = 0; b.focus(); } }
  }

  private buildingTip(d: BuildingDef, locked: boolean, cost = d.cost): string {
    const bits: string[] = [];
    bits.push(`${d.w}×${d.h} · cost ${cost} · upkeep ${d.upkeep}/day`);
    if (d.manaUse) bits.push(`${d.manaUse} mana/day`);
    if (d.manaProduce) bits.push(`+${d.manaProduce} mana/day`);
    if (d.service) bits.push(`radius ${d.service.radius}`);
    if (d.waterRadius) bits.push(`waters ${d.waterRadius} tiles`);
    if (d.needsMana) bits.push('needs mana');
    return `<div class="t">${d.name}</div>${d.desc}<br><span class="muted">${bits.join(' · ')}</span><br><span class="flavor">${d.flavor}</span>${locked ? `<br><span class="warn">${d.relic && !this.host.state.relics.complete.includes(d.relic) ? `Needs ${RELIC_SETS.find((r) => r.id === d.relic)?.name} entire (Ruin Delve and Academy)` : this.host.state.milestone >= d.unlock && specialLock(this.host.state, d.key) ? specialLock(this.host.state, d.key) : `Unlocks at ${this.ms()[d.unlock].name} (${this.ms()[d.unlock].pop} folk)`}</span>` : ''}`;
  }

  showTooltip(html: string, x: number, y: number): void {
    const t = this.el.tooltip;
    t.innerHTML = html;
    t.classList.remove('hidden');
    this.moveTooltip(x, y);
  }
  moveTooltip(x: number, y: number): void {
    const t = this.el.tooltip;
    t.style.left = `${Math.min(x + 14, window.innerWidth - 310)}px`;
    t.style.top = `${Math.min(y + 14, window.innerHeight - t.offsetHeight - 10)}px`;
  }
  hideTooltip(): void {
    this.el.tooltip.classList.add('hidden');
  }

  setHint(text: string): void {
    this.q('#toolbar .hint').innerHTML = text;
  }

  // ---------- views ----------
  private buildViews(): void {
    const list = this.q('#views .list');
    list.innerHTML = '';
    const none = document.createElement('button');
    none.innerHTML = `None <kbd>Esc</kbd>`;
    none.onclick = () => this.host.setOverlay(null);
    list.appendChild(none);
    for (const o of OVERLAY_LIST) {
      const b = document.createElement('button');
      b.innerHTML = `${o.name} <kbd>${o.key}</kbd>`;
      b.dataset.id = o.id;
      b.onclick = () => this.host.setOverlay(this.host.overlay === o.id ? null : o.id);
      list.appendChild(b);
    }
  }

  refreshViews(): void {
    const ov = this.host.overlay;
    this.q('#views .list').querySelectorAll('button').forEach((b) => b.classList.toggle('active', (b.dataset.id ?? null) === ov));
    const legend = this.q('#views .legend');
    if (!ov) legend.innerHTML = '<span class="muted">Pick a view to see what the city needs.</span>';
    else {
      const o = OVERLAYS[ov as keyof typeof OVERLAYS];
      legend.innerHTML = `<div class="muted">${o.desc}</div>` + o.legend.map(([c, l]) => `<div><span class="sw" style="background:${c}"></span>${l}</div>`).join('');
      this.el.views.classList.remove('hidden');
    }
    this.q('#btn-views').classList.toggle('active', !!ov);
  }

  // ---------- refresh ----------
  refresh(): void {
    const s = this.host.state;
    const h = this.host;
    this.q('#tb-name').textContent = s.cityName;
    this.q('#tb-replay').classList.toggle('hidden', !h.replaying);
    const gate = nextGate(s);
    const tbTitle = this.q('#tb-title');
    tbTitle.textContent = `${this.ms()[s.milestone].name} · ${factionOf(s).people}${gate ? ` · next ${gate}` : ''}`;
    tbTitle.title = gate ? `Next milestone: ${gate}${gateMet(s) ? '' : ' (the people\'s condition is not met today)'}` : 'The last milestone';
    tbTitle.classList.toggle('warn', !!gate && !gateMet(s));
    const season = SEASON_NAMES[Math.floor(s.day / DAYS_PER_SEASON) % 4];
    const year = 1 + Math.floor(s.day / (DAYS_PER_SEASON * 4));
    const tbDate = this.q('#tb-date');
    tbDate.textContent = `${(s.day % DAYS_PER_SEASON) + 1} ${season}, Y${year}${s.weather ? ` · ${WEATHER_WORD[s.weather.kind]}` : ''}`;
    tbDate.title = s.weather ? `${WEATHER_WORD[s.weather.kind][0].toUpperCase() + WEATHER_WORD[s.weather.kind].slice(1)} until day ${s.weather.until}` : 'Fair weather';
    const l = computeLedger(s);
    const gold = this.q('#tb-gold');
    gold.textContent = `${Math.round(s.treasury).toLocaleString()} c`;
    gold.className = `v ${s.treasury < 0 ? 'bad' : 'gold'}`;
    const net = this.q('#tb-net');
    const perDay = l.net + l.trade; // trade is banked on the day too (iteration 54)
    net.textContent = `${perDay >= 0 ? '+' : ''}${Math.round(perDay)} / day`;
    net.className = `l ${perDay >= 0 ? 'good' : 'bad'}`;
    this.q('#tb-pop').textContent = s.population.toLocaleString();
    const wf = workforceOf(s);
    this.q('#tb-jobs').textContent = `${s.employed}/${wf}${s.jobs > wf ? ' (+' + (s.jobs - wf) + ' open)' : ''}`;
    const mana = this.q('#tb-mana');
    mana.textContent = `${Math.round(s.manaDemand)} / ${Math.round(s.manaSupply)}${s.manaStorageMax > 0 ? ` · store ${Math.round(s.manaStorage)}/${Math.round(s.manaStorageMax)}` : ''}`;
    mana.className = `v ${s.manaDemand > s.manaSupply * 1.25 ? 'bad' : s.manaDemand > s.manaSupply ? 'warn' : 'ley'}`;
    const hp = this.q('#tb-happy');
    hp.textContent = `${Math.round(s.happiness)}${s.happiness > 60 ? ' ☺' : s.happiness < 35 ? ' ☹' : ''}`;
    hp.className = `v ${s.happiness > 55 ? 'good' : s.happiness < 35 ? 'bad' : ''}`;
    const gd = this.q('#tb-goods');
    gd.textContent = `${Math.round(s.goodsSold)} / ${s.goodsShort}`;
    gd.className = `v ${s.goodsShort > 3 ? 'warn' : ''}`;
    gd.title = 'Goods delivered by cart to markets today / markets with empty shelves';
    this.refreshEvent();
    const un = this.q('#tb-unrest');
    un.textContent = `${Math.round(s.unrest * 100)}%`;
    un.className = `v ${s.unrest > 0.4 ? 'bad' : s.unrest > 0.25 ? 'warn' : ''}`;
    for (let k = 0; k <= 3; k++) this.q(`#sp-${k}`).classList.toggle('active', k === 0 ? h.paused : !h.paused && h.speed === k);
    (this.q('#q-undo') as HTMLButtonElement).disabled = !this.host.undoLabel;
    this.drawClock();
    this.refreshTasks();
    this.refreshDemand();
    this.refreshLesson();
    this.refreshLog();
    this.refreshMinimap();
    this.refreshChronicle();
    this.refreshAnnals();
    this.refreshInfo();
    this.el.perf.textContent = `${h.perf.fps} fps · render ${h.perf.ms.toFixed(1)} ms · ${h.perf.drawn} sprites · ${s.agents.length} agents · tick ${s.tick}`;
    if (s.milestone !== this.lastMilestone) {
      if (this.lastMilestone >= 0) this.toast(`<h2>${s.cityName} is now a ${this.ms()[s.milestone].name}</h2><p>${this.ms()[s.milestone].text}</p>${districtUnlockNotes(s.milestone).map((l) => `<p>${l}</p>`).join('')}<p class="muted">${grantFor(s, this.ms()[s.milestone].grant) > 0 ? `Grant: +${grantFor(s, this.ms()[s.milestone].grant).toLocaleString()} crowns.` : `The Crown's auditors hold the grant: its favour is under ${FAVOUR_AUDIT}.`} New buildings unlocked in the toolbar.</p>`, 9000);
      this.lastMilestone = s.milestone;
      this.refreshItems();
    }
    if (s.gameOver) this.showGameOver();
  }

  private tasksCollapsed = false;
  private showDone = false;
  private lastQuestKey = '';

  private refreshTasks(): void {
    const s = this.host.state;
    const el = this.el.tasks;
    // Re-evaluate at most every 20 ticks, or when a quest completes.
    const key = `${s.seed}:${s.day}:${Math.floor(s.tick / 20)}:${s.questsDone.length}:${this.tasksCollapsed}:${this.showDone}`;
    if (key === this.lastQuestKey) return;
    this.lastQuestKey = key;
    el.classList.remove('hidden');
    const prog = questProgress(s);
    el.querySelector('.prog')!.textContent = `${prog.done}/${prog.total}`;
    (el.querySelector('.min') as HTMLButtonElement).textContent = this.tasksCollapsed ? '+' : '–';
    const list = el.querySelector('.list') as HTMLElement;
    const adv = el.querySelector('.advice') as HTMLElement;
    if (this.tasksCollapsed) {
      list.innerHTML = '';
      adv.classList.add('hidden');
      return;
    }
    (el.querySelector('.done') as HTMLButtonElement).classList.toggle('active', this.showDone);
    if (this.showDone) {
      const done = new Set(s.questsDone);
      const byChapter = new Map<string, string[]>();
      for (const q of QUESTS) if (done.has(q.id)) { const l = byChapter.get(q.chapter) ?? []; l.push(q.title); byChapter.set(q.chapter, l); }
      list.innerHTML = byChapter.size ? [...byChapter].map(([ch, titles]) => `<div class="q done"><div class="t"><span class="ch">${ch}</span></div><div class="h">${titles.map((t) => `✓ ${t}`).join('<br>')}</div></div>`).join('') : '<div class="flavor">Nothing finished yet.</div>';
      adv.classList.add('hidden');
      (el.querySelector('.forecast') as HTMLElement).classList.add('hidden');
      return;
    }
    const quests = activeQuests(s, 3, this.lessonOpen ? 'Districts' : undefined);
    list.innerHTML = quests.length
      ? quests.map((q, i) => `<div class="q ${i === 0 ? 'now' : ''}"><div class="t"><span class="ch">${q.chapter}</span> ${q.title}${q.reward ? ` <span class="rw">+${q.reward}</span>` : ''}</div><div class="h">${q.hint}${q.focus ? ` <button class="show" data-q="${q.id}">Show me</button>` : ''}</div></div>`).join('')
      : '<div class="flavor">The Ledger is complete. Vell remembers your name.</div>';
    list.querySelectorAll('button.show').forEach((b) => {
      (b as HTMLButtonElement).onclick = () => {
        const q = quests.find((x) => x.id === (b as HTMLElement).dataset.q);
        if (q?.focus) this.focus(q.focus);
      };
    });
    const fc = el.querySelector('.forecast') as HTMLElement;
    const lines = forecast(s);
    const score = el.querySelector('.score') as HTMLElement;
    if (s.challenge) {
      const done = s.challengeDay >= 0;
      const failed = s.challengeDay === -2;
      const goal = this.ms()[5].name;
      const people = factionOf(s).people;
      const text = done ? `Daily challenge ${s.challenge} (${people}): ${goal} on day ${s.challengeDay}, score ${challengeScore(s)}${s.stats.devUses ? ' (dev tools used)' : ''}` : failed ? `Daily challenge ${s.challenge} (${people}): failed, no ${goal} by day ${CHALLENGE_DAYS}` : `Daily challenge ${s.challenge} (${people}): day ${s.day} of ${CHALLENGE_DAYS}, ${this.ms()[s.milestone].name}`;
      score.classList.remove('hidden');
      score.innerHTML = `<span class="lbl">${done ? 'Result' : failed ? 'Failed' : 'Challenge'}</span> <span class="${failed ? 'bad' : ''}">${text}</span>${done || failed ? ' <button class="show" id="q-copy">Copy result</button>' : ''}`;
      const cp = score.querySelector('#q-copy') as HTMLButtonElement | null;
      if (cp) cp.onclick = () => { const line = `Wardlight daily ${s.challenge} (${people}): ${done ? `${goal} on day ${s.challengeDay}, score ${challengeScore(s)}` : `failed by day ${CHALLENGE_DAYS}`} in ${s.cityName}${s.stats.devUses ? ' (dev tools used)' : ''}. https://asyrion.github.io/EdaBuilder/`; try { void navigator.clipboard.writeText(line); this.toast('<p>Result copied.</p>', 1500); } catch { this.toast(`<p>${line}</p>`, 5000); } };
    } else score.classList.add('hidden');
    fc.classList.toggle('hidden', !lines.length);
    if (lines.length) fc.innerHTML = `<span class="lbl">Forecast</span>${lines.map((f) => `<div class="${f.kind}">✦ ${f.text}</div>`).join('')}`;
    const a = advise(s);
    adv.classList.toggle('hidden', !a);
    if (a) {
      adv.innerHTML = `<span class="lbl">Advisor</span> ${a.text}${a.focus ? ' <button class="show">Show me</button>' : ''}`;
      const b = adv.querySelector('button.show') as HTMLButtonElement | null;
      if (b && a.focus) b.onclick = () => this.focus(a.focus!);
    }
  }

  /** Carry out a quest or advisor focus: pick a tool, open a panel, switch a view or move the camera. */
  focus(f: Focus): void {
    const s = this.host.state;
    if ('tool' in f) {
      const t = f.tool;
      const tool: Tool =
        t === 'road' ? { kind: 'road', type: RoadType.Track }
        : t === 'zoneHearth' ? { kind: 'zone', zone: Zone.Hearth }
        : t === 'zoneMarket' ? { kind: 'zone', zone: Zone.Market }
        : t === 'zoneCraft' ? { kind: 'zone', zone: Zone.Craft }
        : t === 'zoneArcane' ? { kind: 'zone', zone: Zone.Arcane }
        : t === 'wall' ? { kind: 'wall' }
        : t === 'gateBelregi' ? { kind: 'gate', style: 2 }
        : { kind: 'district', id: 1 };
      this.category = tool.kind === 'road' ? 'roads' : tool.kind === 'zone' ? 'zones' : tool.kind === 'district' ? 'districts' : 'service';
      this.refreshItems();
      this.host.setTool(tool);
      if (t === 'road' || t === 'zoneHearth') this.host.centerOn(s.founding.x, s.founding.y);
    } else if ('build' in f) {
      const key = factionKey(s, f.build); // a people's replacement (a Seep for a well)
      const def = BUILDING_BY_KEY[key];
      if (!def) return;
      const cat = CATEGORIES.find((c) => c.filter(def));
      if (cat) this.category = cat.id;
      this.refreshItems();
      if (canBuild(s, key)) this.host.setTool({ kind: 'build', key });
      else this.toast(`<p>${def.name} unlocks at ${this.ms()[def.unlock].name}.</p>`, 2500);
    } else if ('panel' in f) {
      if (f.panel === 'edicts') this.toggleEdicts(true);
      else if (f.panel === 'wyrms') this.toggleWyrms(true);
      else if (f.panel === 'budget') this.toggleBudget(true);
      else if (f.panel === 'chronicle') this.toggleChronicle(true);
      else this.el.views.classList.remove('hidden');
    } else if ('overlay' in f) {
      this.host.setOverlay(f.overlay);
      this.el.views.classList.remove('hidden');
    } else if ('center' in f) {
      if (f.center === 'founding') this.host.centerOn(s.founding.x, s.founding.y);
      else if (f.center === 'node') { const n = s.nodes[0]; if (n) this.host.centerOn(n.x, n.y); }
      else if (f.center === 'greatgate') { const g = s.buildings.find((b) => b && b.kind === 'greatgate'); if (g) this.host.centerOn(g.x + 1, g.y + 1); }
      else if (f.center === 'cradle') { const c = s.buildings.find((b) => b && isCradle(b.kind)); if (c) this.host.centerOn(c.x, c.y); }
      else if (f.center === 'wyrm') { const n = wyrmNode(s); if (n) this.host.centerOn(n.x, n.y); }
      else if (f.center === 'ruins') { for (let i = 0; i < s.terrain.length; i++) if (s.terrain[i] === 8) { this.host.centerOn(i % s.w, (i / s.w) | 0); break; } }
      else if (f.center === 'cart') {
        // A donkey cart on the road (iteration 57): one carrying goods to a market if any, else any road cart; with none yet, the goods view.
        const road = s.agents.filter((a) => a.kind === AgentKind.Cart && a.variant !== FLOAT_VARIANT && a.variant !== BARGE_VARIANT);
        const c = road.find((a) => a.load > 0 && a.targetId !== -1) ?? road[0];
        if (c) { if (this.host.camera.zoom < 2) this.host.camera.setZoom(2); this.host.centerOn(Math.floor(c.x), Math.floor(c.y)); }
        else { this.host.setOverlay('goods'); this.el.views.classList.remove('hidden'); }
      } else if (f.center === 'gloam') {
        // Nearest Gloam tile to the founding stake.
        let best = -1, bd = 1e9;
        for (let i = 0; i < s.gloam.length; i++) if (s.gloam[i]) { const x = i % s.w, y = (i / s.w) | 0; const d = Math.abs(x - s.founding.x) + Math.abs(y - s.founding.y); if (d < bd) { bd = d; best = i; } }
        if (best >= 0) this.host.centerOn(best % s.w, (best / s.w) | 0);
      }
    }
  }

  // ---------- chronicle ----------
  private chronicleFilter: 'all' | 'good' | 'bad' | 'milestone' = 'all';
  private lastChronicleLen = -1;

  toggleChronicle(show?: boolean): void {
    const el = this.el.chronicle;
    const sh = show ?? el.classList.contains('hidden');
    el.classList.toggle('hidden', !sh);
    if (sh) { this.lastChronicleLen = -1; this.refreshChronicle(); }
  }

  refreshChronicle(): void {
    const el = this.el.chronicle;
    if (el.classList.contains('hidden')) return;
    const s = this.host.state;
    // keyed on the length and the newest line: at its 200-line cap the length stops changing (iteration 55)
    const key = s.chronicle.length * 1000003 + (s.chronicle.length ? s.chronicle[s.chronicle.length - 1].day * 31 + s.chronicle[s.chronicle.length - 1].text.length : 0);
    if (key === this.lastChronicleLen) return;
    this.lastChronicleLen = key;
    const f = this.chronicleFilter;
    const entries = s.chronicle.filter((e) => f === 'all' || (f === 'bad' ? e.kind === 'bad' || e.kind === 'warn' : e.kind === f)).slice(-120).reverse();
    const filters: [typeof f, string][] = [['all', 'All'], ['milestone', 'Milestones'], ['good', 'Good tidings'], ['bad', 'Ill tidings']];
    el.innerHTML = `<div class="box panel">
      <h2>The Chronicle of ${s.cityName}</h2>
      <p class="muted">What has happened in the world, day by day. Only real events are written here; the Ledger's advice is not.</p>
      <div class="filters">${filters.map(([k, n]) => `<button data-f="${k}" class="${k === f ? 'active' : ''}">${n}</button>`).join('')}</div>
      <div class="entries">${entries.length ? entries.map((e) => `<div class="e ${e.kind}"><span class="d">Day ${e.day}</span><span class="tx">${e.text}</span>${e.x !== undefined ? `<button class="jump" data-x="${e.x}" data-y="${e.y}" title="Go there">⌖</button>` : ''}</div>`).join('') : '<p class="flavor">Nothing yet. The Stake is new and the Chronicle is blank.</p>'}</div>
      <div style="text-align:right"><button id="ch-close">Close</button></div>
    </div>`;
    el.querySelectorAll('button[data-f]').forEach((b) => {
      (b as HTMLButtonElement).onclick = () => { this.chronicleFilter = (b as HTMLElement).dataset.f as typeof f; this.lastChronicleLen = -1; this.refreshChronicle(); };
    });
    el.querySelectorAll('button.jump').forEach((b) => {
      (b as HTMLButtonElement).onclick = () => { const d = (b as HTMLElement).dataset; this.host.centerOn(Number(d.x), Number(d.y)); this.toggleChronicle(false); };
    });
    el.querySelector('#ch-close')!.addEventListener('click', () => this.toggleChronicle(false));
  }

  // ---------- the Annals (iteration 55) ----------
  private lastAnnalsKey = '';

  toggleAnnals(show?: boolean): void {
    const el = this.el.annals;
    const sh = show ?? el.classList.contains('hidden');
    el.classList.toggle('hidden', !sh);
    if (sh) { this.lastAnnalsKey = ''; this.refreshAnnals(); }
  }

  /** Every counter by chapter; refreshed once a day while open. */
  refreshAnnals(): void {
    const el = this.el.annals;
    if (el.classList.contains('hidden')) return;
    const s = this.host.state;
    const key = `${s.day}:${s.stats.devUses}`;
    if (key === this.lastAnnalsKey) return;
    this.lastAnnalsKey = key;
    const val = (r: AnnalRow) => (r.stat ? Math.round(s.stats[r.stat] as number).toLocaleString() : String(r.value!(s)));
    el.innerHTML = `<div class="box panel annals">
      <h2>The Annals of ${s.cityName}</h2>
      <p class="muted">Every count the charter keeps, day ${s.day}. Hover a line for what it counts.</p>
      <div class="chapters">${ANNALS.map((c) => `<section><h3>${c.chapter}</h3>${c.rows.map((r) => `<div class="arow" title="${r.note.replace(/"/g, '&quot;')}"><span class="al">${r.label}</span><span class="av">${val(r)}</span></div>`).join('')}</section>`).join('')}</div>
      <div style="text-align:right"><button id="an-close">Close</button></div>
    </div>`;
    el.querySelector('#an-close')!.addEventListener('click', () => this.toggleAnnals(false));
  }

  private drawClock(): void {
    const c = this.el.clock as HTMLCanvasElement;
    const ctx = c.getContext('2d')!;
    const t = timeOfDay(this.host.state);
    ctx.clearRect(0, 0, 34, 34);
    ctx.beginPath();
    ctx.arc(17, 17, 15, 0, Math.PI * 2);
    ctx.fillStyle = t > 0.25 && t < 0.78 ? '#7fb2d8' : '#1d1a3a';
    ctx.fill();
    ctx.strokeStyle = '#4b3a5a';
    ctx.stroke();
    const a = t * Math.PI * 2 + Math.PI / 2;
    const x = 17 + Math.cos(a) * 10;
    const y = 17 + Math.sin(a) * 10;
    ctx.fillStyle = t > 0.25 && t < 0.78 ? '#ffd166' : '#e8dfcf';
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  private refreshDemand(): void {
    const s = this.host.state;
    const d = s.demand;
    const bars: [string, number, string, DemandZone][] = [['H', d.hearth, '#5ee36f', 'hearth'], ['M', d.market, '#5aa8ff', 'market'], ['C', d.craft, '#ffb347', 'craft'], ['A', d.arcane, '#c58cff', 'arcane']];
    const el = this.el.demand;
    if (!el.children.length) {
      el.innerHTML = `<div class="col"><div class="lbl muted" style="width:60px">Demand <button class="help" id="demand-help" title="What the bars mean" aria-label="What the demand bars mean">?</button></div></div>` + bars.map(([l, , c, z]) => `<div class="col" data-zone="${z}"><div class="bar"><div style="background:${c}"></div></div><div class="lbl" style="color:${c}">${l}</div><div class="sign muted">–</div></div>`).join('');
      el.querySelectorAll('.col[data-zone]').forEach((col) => {
        const zone = (col as HTMLElement).dataset.zone as DemandZone;
        const tip = () => { const x = demandExplain(s, zone); return `<div class="t">${x.headline}</div>${x.detail}<br><span class="muted">${x.advice}</span>`; };
        (col as HTMLElement).onmouseenter = (e) => this.showTooltip(tip(), e.clientX, e.clientY);
        (col as HTMLElement).onmousemove = (e) => this.moveTooltip(e.clientX, e.clientY);
        (col as HTMLElement).onmouseleave = () => this.hideTooltip();
      });
      (el.querySelector('#demand-help') as HTMLButtonElement).onclick = () => this.toast('<h2>The demand bars</h2><p>Each bar is how much the folk want more of a zone: Hearths (homes), Markets, Craft works, Arcane shops. A bar above the line means zoned lots of that kind will grow; at or below it, nothing of that kind grows, however much you paint. Hover a bar for the numbers behind it and what to do.</p>', 12000);
    }
    const fills = el.querySelectorAll('.bar div');
    const signs = el.querySelectorAll('.sign');
    bars.forEach(([, v, , zone], i) => {
      const f = fills[i] as HTMLElement;
      if (v >= 0) {
        f.style.top = `${30 - v * 30}px`;
        f.style.bottom = '30px';
      } else {
        f.style.top = '30px';
        f.style.bottom = `${30 + v * 30}px`;
      }
      const sg = signs[i] as HTMLElement;
      const x = demandExplain(s, zone);
      const word = x.sign === '+' ? '▲ more' : x.sign === '−' ? '▼ fewer' : '– even';
      if (sg.textContent !== word) { sg.textContent = word; sg.className = `sign ${x.sign === '+' ? 'good' : x.sign === '−' ? 'bad' : 'muted'}`; }
    });
  }

  private refreshLog(): void {
    const s = this.host.state;
    const newest = s.messages[s.messages.length - 1];
    if (s.messages.length === this.lastLogLen && newest === this.lastLogMsg && this.el.log.querySelector('.lines')!.children.length) return;
    this.lastLogLen = s.messages.length;
    this.lastLogMsg = newest;
    const last = s.messages.slice(-7).reverse();
    (this.el.log.querySelector('.lines') as HTMLElement).innerHTML = last.map((m) => `<div class="m ${m.kind}"><span class="d">d${Math.floor(m.tick / 900)}</span>${m.text}</div>`).join('');
  }

  private lvBonus: { day: number; n: number; map: Float32Array } | null = null;
  /** The land-value bonus map, recomputed once a day (and when the building count changes). */
  private landBonus(s: GameState): Float32Array {
    const n = s.buildings.length;
    if (!this.lvBonus || this.lvBonus.day !== s.day || this.lvBonus.n !== n) this.lvBonus = { day: s.day, n, map: landBonusMap(s) };
    return this.lvBonus.map;
  }
  private refreshInfo(): void {
    const b = this.host.selected;
    const el = this.el.info;
    if (!b) {
      if (this.host.selectedNode >= 0) {
        this.refreshNodeInfo(this.host.selectedNode);
        return;
      }
      if (this.host.selectedSector >= 0) {
        this.refreshSectorInfo(this.host.selectedSector);
        return;
      }
      el.classList.add('hidden');
      return;
    }
    const s = this.host.state;
    if (!s.buildings.includes(b)) {
      this.host.select(null);
      return;
    }
    el.classList.remove('hidden');
    const def = BUILDING_BY_KEY[b.kind];
    const rows: string[] = [];
    const cov = s.coverage;
    const i = idx(b.x, b.y);
    const problems: string[] = [];
    if (def.category === 'zone') {
      const cap = capacityOf(b, s);
      rows.push(row('Level', `${b.level} / 3`));
      if (def.zone === Zone.Hearth) rows.push(row('Residents', `${b.residents} / ${cap}`));
      else rows.push(row('Workers', `${b.workers} / ${cap}`));
      const hp = b.state === 'ok' ? computeBuildingHappiness(s, b) : 0;
      rows.push(row('Happiness', `${Math.round(hp)}`));
      if (b.state === 'ok') rows.push(`<div class="why muted">${whyLine(happinessTerms(s, b))}</div>`);
      rows.push(row('Land value', `${s.landValue[i]}`));
      rows.push(`<div class="why muted">${whyLine(landValueTerms(s, i, this.landBonus(s)))}</div>`);
      rows.push(row('Level-up progress', `${Math.max(0, Math.round(b.progress))}%`));
      { const needs = levelUpNeeds(s, b); if (needs.length) rows.push(`<div class="why muted">Level ${b.level + 1} needs: ${needs.map((n) => `<span class="${n.met ? 'good' : 'warn'}">${n.met ? '✓' : '✗'} ${n.text}</span>`).join(' · ')}</div>`); }
      if (def.zone === Zone.Market) rows.push(row('Goods on the shelves', `${Math.round(b.stock)} / ${marketStockCap(b)}`));
      if (def.zone === Zone.Market) { const door = roadTileOf(s, b); const f = marketRoadMultAt(s, door); rows.push(row('Road', `<span class="${f < 1 ? 'warn' : f > 1 ? 'good' : ''}">at the door, ${marketRoadWords(s, door)}</span>`)); if (f < 1 && door >= 0) problems.push('A dirt track at the door: cobble it and the market trades in full.'); }
      if (def.zone === Zone.Market && ((b.meat ?? 0) > 0 || s.buildings.some((l) => l && l.kind === 'hunterslodge' && Math.hypot(l.x + 1 - b.x, l.y + 1 - b.y) <= MEAT_REACH))) rows.push(row('Meat on the shelves', `${Math.round(b.meat ?? 0)} / ${MARKET_MEAT_CAP}${(b.meat ?? 0) >= 1 ? ': hearths within 10 are happier' : ' (a lodge within 16 hunting game fills it)'}`));
      if (def.zone === Zone.Market && ((b.fish ?? 0) > 0 || s.buildings.some((h) => h && (h.kind === 'fishershut' || h.kind === 'smokehouse') && Math.hypot(h.x - b.x, h.y - b.y) <= FISH_MARKET_REACH))) rows.push(row('Fish on the shelves', `${Math.round(b.fish ?? 0)} / ${MARKET_FISH_CAP}${(b.fish ?? 0) >= 1 ? `: hearths within ${FISH_HAPPY_REACH} are happier` : ` (a Fishers' Hut within ${FISH_MARKET_REACH} fills it)`}`));
      if (def.zone === Zone.Hearth && b.level === 1) rows.push(row('Roof', thatched(s, b) ? `thatched for ${(b.thatchUntil ?? 0) - s.day} more days: +${THATCH_HAPPY} happiness, catches fire ×${THATCH_FIRE}` : 'sod and turf (Reed-Cutters within 10 would thatch it)'));
      if (def.zone === Zone.Market && theftAt(s, b)) problems.push(`Theft: a tenth of the shelves a night. Watch here ${Math.round((s.coverage.watch[i] / 255) * 100)} %, unrest ${Math.round(s.unrest * 100)} %: a Watch Post over the market, or less unrest, stops it.`);
      if (def.zone === Zone.Market && s.fenNex > 0 && s.district[i] === s.fenNex) rows.push(row('Fen-Nex quarter', 'no tithe, double shelves'));
      if (def.zone === Zone.Craft) rows.push(row('Goods awaiting carts', `${Math.round(b.stock)} / ${craftStockCap(b)}`));
      if (def.zone === Zone.Craft && seasonOfState(s) === 3) rows.push(row('The Hush', glimhouseNear(s, b) ? 'warmed by a Glimhouse' : `output ×${HUSH_CRAFT}`));
      if (roadTileOf(s, b) < 0) problems.push('No road at its door: draw a road beside it (a corner counts); nobody can come or go.');
      if (b.lit && (b.relit ?? -1) >= s.day) rows.push(row('Mana', 'lit by a lamplighter\'s candle today'));
      if (!b.lit) problems.push('No mana: build a Ley Spire within 5 tiles or next to a lit building.');
      if (!b.watered) problems.push(b.dryBy === 'overdrawn' ? 'No water: the nearest well is overdrawn. Dig another well nearby.' : 'No water: build a Well or Cistern nearby.');
      if (b.greyDays) problems.push(`The grey is at the door: light it or ward it, ${Math.max(0, GREY_DAYS - b.greyDays)} day${GREY_DAYS - b.greyDays === 1 ? '' : 's'} left before the Gloam takes it.`);
      if (s.miasma[i] > 60) problems.push('Choking on miasma from nearby Craft works.');
      if (s.gloamDist[i] < 6) problems.push('The Gloam whispers nearby. Raise a Ward Lantern.');
      if (cov.death[i] < 30 && def.zone === Zone.Hearth) problems.push('No Boneyard covers this home; its dead will not rest.');
      if (s.trafficSmooth[i] > 170) problems.push('Traffic jam outside.');
      if (def.zone === Zone.Market && b.stock <= 0.5 && b.age > 3) problems.push('Empty shelves: no carts are bringing goods. Zone Craft works with a road to this market.');
      if (def.zone === Zone.Craft && b.stock >= craftStockCap(b) * 0.95) problems.push('Nobody is buying: goods pile up. Zone Markets reachable by road.');
      if (b.state === 'abandoned') problems.push('Abandoned. Fix the problems and folk will return, or bulldoze it.');
      if (b.state === 'burning') problems.push('ON FIRE! Veshari Hall coverage puts it out.');
      if (b.state === 'ruin') problems.push('A ruin. It will be cleared in a few days, or bulldoze it for free.');
      if (def.zone === Zone.Hearth && s.employed < workforceOf(s) * 0.85) problems.push('Not enough jobs in the city.');
    } else {
      rows.push(row('Upkeep', `${def.upkeep} c/day`));
      if (GROWING_HALLS.includes(b.kind)) rows.push(row('Hall', `${stakeHallName(s)} (grows with the city)`));
      if (def.manaUse) rows.push(row('Mana', seatWarmed(s, b) ? `none: warmed by the Underking's Seat (${manaUseOf(b)} without it)` : `${manaUseOf(b)} / day${b.lit ? '' : ' (unlit!)'}`));
      if (isCradle(b.kind)) {
        rows.push(row('Nests', `${dragonsIn(s, b.id).length} / ${cradleCapacity(b)}${isGreatCradle(b) ? ' (a Great Cradle)' : ''}`));
        if (b.grey) { const eggs = dragonsIn(s, b.id).filter((d) => d.stage === 0 && d.line !== 'grey').length; rows.push(row('The Gloam', `<span class="bad">at the door ${b.grey} day${b.grey === 1 ? '' : 's'}${eggs ? `: the ${eggs === 1 ? 'egg turns' : 'eggs turn'} grey in ${Math.max(0, GREY_EGG_DAYS - b.grey)} day${GREY_EGG_DAYS - b.grey === 1 ? '' : 's'}` : ' (no eggs to grey)'}</span>`)); if (eggs) problems.push('The Gloam at the door: cut it back (a Ward Lantern, the wards) before the eggs turn grey.'); }
        const mk = marketsInReach(s, b);
        rows.push(row(`Markets within ${FEED_REACH}`, mk.length ? `${mk.length}, ${Math.round(mk.reduce((n, m) => n + m.stock, 0))} goods on their shelves` : '<span class="bad">none: its dragons will starve</span>'));
        const lg = lodgesFor(s, b);
        rows.push(row('Lodge seats', lg.length ? `${lg.length * LODGE_SEATS} at ${lg.length} lodge${lg.length === 1 ? '' : 's'} within ${LODGE_REACH} (shared with other cradles in their reach)` : `<span class="bad">no Tamer's Lodge within ${LODGE_REACH}</span>`));
      }
      if (b.kind === 'mine') rows.push(row('Concord Wardens', delverAt(s, b) ? 'a delver drake works the seam: they wake half as often' : 'the digging may wake one; a delver drake would halve the chance'));
      if (b.kind === 'ring') { const ch = ringChampion(s); rows.push(row('Next bout', `day ${nextBoutDay(s)}`)); rows.push(row('Champion', ch ? `${ch.name} the ${STAGE_NAMES[ch.stage]}: odds ${Math.round(boutOdds(s, ch, nextBoutDay(s)).chance * 100)} % against a challenger of its weight` : 'none named (Wyrms panel)')); }
      if (b.kind === 'wyrmforge') rows.push(row('Fire', forgeHot(s) ? `hot: burns ${FORGE_BURN} wyrmfire a day (${s.materials.wyrmfire.toFixed(1)} in the vault)` : '<span class="bad">cold: no wyrmfire in the vault; the works near it lose their quarter</span>'));
      if (b.kind === 'greatweir') rows.push(row('Sluice', b.sluice ? 'open: 90 mana a day; the bank within 30 floods in the Thaw' : 'closed: 45 mana a day'));
      if (b.kind === 'corelantern') rows.push(row('Cores', cracked(b) ? `<span class="bad">cracked: dark for ${b.broken} more day${b.broken === 1 ? '' : 's'}</span>` : 'whole: takes the first 30 overdraw of a surge, then cracks for 10 days'));
      if (b.kind === 'wyrmcourt') { rows.push(row('The wyrm', describeWyrm(s))); rows.push(row('Appetite', s.wyrm.state === 'bound' ? `${wyrmEats(s)} goods a day${b.lit ? ' (halved while the Court is lit)' : ` (dark: the full ${WYRM_EATS}; ${s.wyrm.courted ? `${s.wyrm.courtDark} dark day${s.wyrm.courtDark === 1 ? '' : 's'}, it sulks at 2` : 'two dark days and it sulks'})`}` : 'none bound yet')); }
      if (GOLEM_HOUSES.includes(b.kind)) {
        const gs = s.agents.filter((a) => a.kind === AgentKind.Creature && a.species === 'golem' && a.load > 0 && a.homeId === b.id);
        const works = postableWorks(s, b);
        rows.push(row('Wardens', gs.length ? `${gs.length} bound here: labour (12 hands each), guard (a ward of ${GOLEM_GUARD_RADIUS} around the foundry), posted to a works within ${GOLEM_POST_REACH}, or in harness hauling from one (${GOLEM_LOAD} goods a trip, slow, tireless, afraid of no hound)` : 'none bound here yet'));
        for (const g of gs) rows.push(row(`Warden ${g.id}`, `<select data-golem="${g.id}"><option value="labour" ${!g.duty ? 'selected' : ''}>labour: 12 hands for the city</option><option value="guard" ${g.duty === 'guard' ? 'selected' : ''}>guard: ward ${GOLEM_GUARD_RADIUS} here</option>${works.map((w) => `<option value="works:${w.id}" ${g.duty === 'works' && g.targetId === w.id ? 'selected' : ''}>at the works (${w.x},${w.y}): 12 hands at its bench</option>`).join('')}${works.map((w) => `<option value="haul:${w.id}" ${g.duty === 'haul' && g.targetId === w.id ? 'selected' : ''}>haul from (${w.x},${w.y}): ${GOLEM_LOAD} a trip, slow, tireless, fears no hound</option>`).join('')}</select>`));
        const hauls = s.stats.golemHauls;
        if (hauls || gs.some((g) => g.duty === 'haul')) rows.push(row('Hauled', `${Math.round(hauls)} goods by wardens in harness${s.stats.cartsBalked ? `; the donkey carts have balked at hounds ${s.stats.cartsBalked} times` : ''}`));
      }
      if (def.service) rows.push(row('Radius', `${b.kind === 'watchhouse' && mewsActive(s) ? `${def.service.radius * 2} tiles (the Drake Mews doubles it)` : `${def.service.radius} tiles`}`));
      if (def.waterRadius) {
        const wr = waterRadiusOf(s, b);
        const near = wr > 0 && def.waterNearBonus && s.waterDist[idx(b.x, b.y)] <= 3 ? def.waterNearBonus : 0;
        const why = wr === 0 ? ' (fouled by the flood)' : b.kind === 'well' && s.waterDist[idx(b.x, b.y)] > 8 ? ' (far from water: a Cistern lifts it further)' : b.kind === 'seep' && wr !== def.waterRadius ? (wr > def.waterRadius ? ' (the Thaw swells it)' : ' (the Ember shrinks it)') : near ? ' (dug near water)' : wr > def.waterRadius ? ' (Tide ley)' : '';
        rows.push(row('Waters', `${wr + near} tiles${why}`));
        if (b.load !== undefined && wr > 0) { rows.push(row('Drawn', `${b.load} / ${waterCapAt(s, b)} levels of homes and works${lakeFed(s, b) ? ' (the lake feeds it: half again)' : ''}`)); if (b.load > waterCapAt(s, b)) problems.push('Overdrawn: its farthest homes are dry. Dig another well among them.'); }
        if (wr === 0) problems.push('Fouled: the flood is in the shaft; it waters nothing until the river falls.');
      }
      if (b.kind === 'torrentmill' && b.load !== undefined) rows.push(row('Output', `${Math.round(b.load)} mana / day${s.buildings.some((o) => o && o !== b && o.kind === 'torrentmill' && o.state === 'ok' && o.id < b.id && Math.abs(o.x - b.x) <= 8 && Math.abs(o.y - b.y) <= 8) ? ' (shares the river with an older mill: ×0.6)' : ''}`));
      if (b.kind === 'font' && (b.flare ?? 0) > 0) problems.push(`Bore flare: the yard smokes for ${b.flare} more day${b.flare === 1 ? '' : 's'} (miasma 6 within 4).`);
      if (b.kind === 'font' && fontsRunHot(s)) problems.push('Running hot: past nine tenths of the flow a Font may flare (one chance in fifty a day). Raise the flow or cut consumers.');
      if (def.capacity) {
        rows.push(row(def.service ? 'Crew' : 'Workers', `${b.workers} / ${capacityOf(b, s)}`));
        if (def.service && crewFactor(b, s) < 0.8) problems.push(`Short-handed: its coverage is at ${Math.round(crewFactor(b, s) * 100)} %. More folk, or fewer works competing for them.`);
      }
      if (def.service?.type === 'ward') {
        rows.push(row('Burns', b.kind === 'stoneward' ? 'nothing: it holds the grey; its stone-sexton cuts two a day' : `${wardBurnBudget(s, b)} grey tiles a day, the nearest first`));
        rows.push(row('Grey in reach', `${greyInReach(s, b)} tiles`));
        if (b.kind === 'scaleward') rows.push(row('Plating', `${Math.round((b.plate ?? 1) * 100)} % (wears a tenth a season)`));
      }
      if (b.kind === 'saltfont') rows.push(row('Relic in the font', (b.cooldown ?? 0) > 0 ? `${b.cooldown} day${b.cooldown === 1 ? '' : 's'} left: quiets twice as many` : s.relicStock >= 1 ? 'a loose relic goes in tomorrow' : 'none: no loose relic in the camp'));
      if (def.goodsRate) rows.push(row('Carts', String(s.agents.filter((a) => a.kind === AgentKind.Cart && a.homeId === b.id).length)));
      if (def.needsMana && !b.lit) problems.push('Unlit: this building needs mana to work at full strength.');
      if (b.kind === 'spire' && !b.lit) problems.push('Not linked: a spire must be within 6 tiles of a ley node or a lit spire.');
      if (isLeyMember(b) && b.lit && b.load !== undefined) { rows.push(row('Load', `${Math.round(b.load)} / ${loadCapOf(b)} mana of buildings${wicksHalved(s, b) ? ' (halved by the Lantern of Wicks)' : ''}`)); if (b.load > loadCapOf(b)) problems.push('Overloaded: its farthest buildings go dark. Raise another spire among them.'); }
    }
    { const au = aurasAt(s, b.x + (b.w - 1) / 2, b.y + (b.h - 1) / 2); if (au.length) rows.push(row('Dragon auras', au.map((a) => `<b>${LINE_INFO[a.line].name}</b> (${a.names.join(', ')}): ${AURA_INFO[a.line]}`).join('; '))); }
    if (def.manaUse > 0 && !isLeyMember(b)) { const p = priorityOf(b); rows.push(row('Brownout', `<span class="prio">${[['Essential', 0], ['Normal', 1], ['Dim', 2]].map(([n, v]) => `<button data-prio="${v}" class="${p === v ? 'active' : ''}" title="When the ley runs short, Dim buildings go dark first, then Normal, then Essential">${n}</button>`).join(' ')}</span>`)); }
    if (def.zone === Zone.Arcane) rows.push(row('Leystone in the workshop', `${Math.round(b.stock)} / ${20 * b.level}`));
    if (def.leystone) {
      rows.push(row('Leystone awaiting carts', `${Math.round(b.stock)} / 60`));
      const seam = b.seam ?? SEAM;
      rows.push(row('Seam', seam > 0 ? `${Math.round((seam / SEAM) * 100)} % (${Math.round(seam)} leystone left)` : 'cut out'));
      if (seam <= 0) problems.push(`Spent: ${SPENT_RATE} a day of dust; the empty shaft wakes wardens three times as often. Bulldoze it or move on.`);
    }
    if (def.goodsRate) rows.push(row('Goods awaiting carts', `${Math.round(b.stock)} / ${craftStockCap(b)}`));
    if (b.kind === 'observatory') rows.push(...(b.lit ? forecast(s) : [{ text: 'Unlit: the dome is dark and reads nothing.', kind: 'warn' as const }]).map((f) => `<div class="fc ${f.kind}">✦ ${f.text}</div>`));
    if (b.kind === 'worldtree') {
      const st = treeStage(b);
      rows.push(row('Growth', st >= 3 ? 'full-grown' : `stage ${st + 1} of 4, ${30 - (b.age % 30)} days to the next`));
      rows.push(row('Shade', `${TREE_LEISURE_RADIUS[st]} tiles of leisure; roots hold the Gloam for ${TREE_WARD_RADIUS[st]}`));
    }
    { const ws = walkersOf(s, b); if (ws.length) { const job = WALKER_JOBS[ws[0].job!]; rows.push(row('Walkers', `${ws.length} ${ws.length === 1 ? job.name : job.plural} on patrol`)); for (const line of ws.flatMap((w) => w.log ?? []).slice(-3)) rows.push(`<div class="fc good">✦ ${line}</div>`); } else if (Object.values(WALKER_JOBS).some((j) => j.from.includes(b.kind) && j.count(s, b) > 0) && b.state === 'ok') problems.push('No walker: the building needs a road at its door to send one out.'); }
    if (b.kind === 'ruindelve') {
      rows.push(row('Relics brought up', `${s.stats.relics} (a set piece every ${RELICS_PER_PIECE})`));
      for (const set of RELIC_SETS) rows.push(row(set.name, s.relics.complete.includes(set.id) ? `<span class="good">entire: ${set.bonus}</span>` : `${s.relics.pieces[set.id] ?? 0} of 3`));
      if (s.relics.uncatalogued > 0) (hasAcademy(s) ? rows : problems).push(hasAcademy(s) ? row('Awaiting the Academy', `${s.relics.uncatalogued} piece(s)`) : `${s.relics.uncatalogued} piece(s) lie uncatalogued: an Academy would name them.`);
    }
    if (b.kind === 'hospice') { rows.push(row('Draughts', `${Math.round(b.stock)} / ${HOSPICE_DRAUGHTS} (2 goods a day from the fullest market within 16)`)); if (b.stock <= 0) problems.push('No draughts: with no goods on the shelf it heals at six tenths. A market within 16 tiles.'); }
    if (b.kind === 'shrine' || b.kind === 'candleshrine') rows.push(row('Consecrated', (b.blessed ?? -1) >= s.day ? `${b.blessed! - s.day} day${b.blessed! - s.day === 1 ? '' : 's'}: reaches half again as far` : 'no: a pilgrim of this shrine who prays at a Temple consecrates it for 10 days'));
    { const hl = houndLine(s, b); if (hl) { if (b.fled !== undefined) problems.push(`Fled from the hounds: three nights of Gloam-hounds at the door drove its folk out, and it stands empty until the Thaw.`); else rows.push(row('Hounds at the door', `<span class="warn">${hl}</span>`)); } }
    if (b.kind === 'greatgate') {
      const held = { none: 'not yet brought: the High Warden comes ten days after the Gate stands lit', set: 'set in the keystone: the Gate wards 30, every Belregi gate 16', guardians: 'kept by the Guardians in the Pass: twice the pilgrims', sold: 'sold to the Crown: the Pass is closed, and the Gate wards at six tenths', shared: 'shared with the Uzulim: their gates add no unrest' }[s.heart.held];
      rows.push(row('The Heart of Belregi', held));
      rows.push(row('Reaches', `ward ${greatGateReach(s)} tiles · Belregi gates ${belregiReach(s)} (8 without a lit Great Gate)`));
      const n = passPilgrims(s);
      rows.push(row('Pilgrims of the Pass', n ? `${n} in ${pilgrimsDue(s)} day${pilgrimsDue(s) === 1 ? '' : 's'} (the 15th of each season), ${PASS_ALMS} crowns of alms each · ${s.stats.gatePilgrims} lodged so far` : s.heart.held === 'sold' ? 'none: the Guardians closed the Pass' : 'none while the Gate is dark'));
      const t = heartTrust(s);
      rows.push(row('Record at the gates', `${t >= 0 ? '+' : ''}${t}${t < 0 ? ' <span class="warn">(the Heart would wake cold)</span>' : ''}`));
    }
    if (b.kind === 'temple') rows.push(row('Consecrates', 'the shrines whose pilgrims pray here reach half again as far for 10 days'));
    if (b.kind === 'veshari' && !b.watered) problems.push('Dry: a fire hall without water fights at half strength. A well within reach.');
    if (b.kind === 'academy' || b.kind === 'grandacademy') rows.push(row('Relics studied', `${Math.round(b.progress)} here · educated floor +${Math.round(s.educatedFloor * 100)} % (a loose relic every 5 days while lit, up to ${EDUCATED_FLOOR_CAP * 100} %)`));
    if (b.kind === 'grandacademy') rows.push(row('Artifact prices', `${grandAcademyBonus(s) > 1 ? `+${Math.round((grandAcademyBonus(s) - 1) * 100)} %` : 'no bonus yet'} (+5 % per tenth of the city educated above four tenths; educated ${Math.round(s.educated * 100)} %)`));
    if (b.kind === 'hunterslodge') {
      const q = quarryOf(b);
      const why = huntBlock(s, b);
      rows.push(row('Quarry', q === 'hounds' ? 'Gloam-hounds within 12 (24 under the Bounty)' : why ? `${WILD[q].plural}: idle, ${why}` : `${WILD[q].plural} within ${HUNT_REACH}; hounds at half the chance while the hunters are out`));
      rows.push(row('In the salting shed', `${Math.round(b.stock)} hides · ${Math.round(b.meat ?? 0)} meat (over ${LODGE_MEAT_KEEP} goes salted to the Gloam road) · ${b.trophies ?? 0} trophies`));
      if (b.took !== undefined && b.tookSp) rows.push(row('Last kill', `${s.day - b.took === 0 ? 'today' : `${s.day - b.took} day${s.day - b.took === 1 ? '' : 's'} ago`}: a ${WILD[b.tookSp as WildSpecies]?.name ?? b.tookSp}`));
      const grounds = WILD_SPECIES.map((sp) => ({ sp, herds: herdsInGrounds(s, b, sp) })).filter((g) => g.herds.length);
      rows.push(row('The grounds', grounds.length ? grounds.map((g) => { const head = g.herds.reduce((a, h) => a + h.head, 0); const cap = g.herds.reduce((a, h) => a + h.cap, 0); return `${WILD[g.sp].plural} ${g.herds.length} ${WILD[g.sp].group}${g.herds.length === 1 ? '' : 's'}, ${Math.floor(head)} head${head < cap * 0.5 ? ' <span class="warn">(thin)</span>' : ''}`; }).join(' · ') : `no game within ${HUNT_REACH} tiles`));
      if (q !== 'hounds' && grounds.some((g) => g.sp === q && g.herds.some((h) => h.head < CLOSE_FLOOR)) && !s.edicts.closeseason) problems.push(`A ${WILD[q].group} in the grounds is under ${CLOSE_FLOOR} head: hunted to the last, it is gone for good. The Close Season edict keeps a floor.`);
      rows.push(row('Hides and pelts', `${s.stats.hides + s.stats.pelts} this charter · ${s.stats.trophies} trophies · ${s.stats.huntCrowns} crowns on the Gloam road`));
    }
    if (b.kind === 'fishershut') {
      const body = bodyOf(s, b);
      const why = fishBlock(s, b);
      const w = ensureShoals(s);
      rows.push(row('Fishing', why ? `idle: ${why}` : `${(b.caught ?? 0)} landed today, about ${catchOf(s, b).toFixed(1)} a day as the shoal stands`));
      rows.push(row('On the racks', `${Math.round(b.fish ?? 0)} fresh · ${Math.round(b.fishOld ?? 0)} a day old (spoils tonight) · ${Math.round(b.spoiled ?? 0)} spoiled last night`));
      if (body >= 0) rows.push(row('The shoal', `${Math.round(s.water.fish[body])} / ${Math.round(shoalCap(w, body))} fish in this ${w.open.some((o, k) => o && w.body[k] === body) ? 'lake' : 'river'}${fishedOut(s, body) ? ' <span class="warn">(fished out)</span>' : ''}`));
      if ((b.spoiled ?? 0) >= 2) problems.push(`Fish spoil on the racks: a market within ${FISH_MARKET_REACH} or a Smokehouse within ${SMOKE_REACH} would take them.`);
      if (body >= 0 && fishedOut(s, body)) problems.push('The shoal is fished out: fewer huts on this water, a Weir, or the Close Season lets it recover.');
    }
    if (b.kind === 'smokehouse') rows.push(row('Smoked fish', `${Math.round(b.stock)} in the smoke-loft (over ${SMOKE_KEEP} goes down the Gloam road) · ${s.stats.fishSmoked} smoked this charter`));
    if (b.kind === 'reedcutters') rows.push(row('Reeds', `${reedBeds(s, b)} reed beds in reach · ${Math.round(b.stock)} bundles · ${b.caught ?? 0} cut today${seasonOfState(s) === 3 ? ' (none cut in the Hush)' : ''} · ${s.stats.homesThatched} homes thatched this charter`));
    if (b.kind === 'weir') rows.push(row('The pool', `fords within ${WEIR_REACH} stay open at high water; this water\'s shoal regrows twice as fast`));
    if (b.kind === 'mothloft') rows.push(row('Glim-dust', `${aspectAt(s, b.x, b.y) === 'glim' ? '0.6' : '0.3'} a day while lit${aspectAt(s, b.x, b.y) === 'glim' ? ' (Glim ley: doubled)' : ''}`));
    if (b.kind === 'wrightslodge') { rows.push(row('Store', `40 mana of Nexus store and a surge line of 1.4× while the guild is pleased`)); rows.push(row('Vent', (b.cooldown ?? 0) > 0 ? `ready in ${b.cooldown} day${b.cooldown === 1 ? '' : 's'}` : 'ready: empties the store and resets the surge count (30-day cooldown)')); }
    if (b.kind === 'cartersyard') rows.push(row('Roads', `congestion within 10 tiles smoothed by a fifth while the guild is pleased`));
    if (b.kind === 'academy' || b.kind === 'grandacademy') rows.push(row('Relic sets', s.relics.complete.length ? s.relics.complete.map((id) => RELIC_SETS.find((r) => r.id === id)!.name).join(', ') : 'none catalogued yet'));
    { const gid = (Object.keys(HALL_OF) as GuildId[]).find((k) => HALL_OF[k] === b.kind); if (gid) { rows.push(row('Guild', `${GUILDS[gid].name}, ${guildMood(s.guilds.standing[gid])} (${Math.round(s.guilds.standing[gid])})`)); if (!hallActive(s, b.kind)) problems.push('Locked: the guild is on strike. Raise its standing above 25 to reopen the hall.'); } }
    if (b.kind === 'guildhall') { for (const id of GUILD_IDS) rows.push(row(GUILDS[id].name, `${guildMood(s.guilds.standing[id])} (${Math.round(s.guilds.standing[id])})`)); if (!b.lit) problems.push('Unlit: the council does not sit.'); else { rows.push(row('Council', `${s.stats.councils} petitions heard; see the Edicts panel`)); const low = [...GUILD_IDS].sort((p, q) => s.guilds.standing[p] - s.guilds.standing[q])[0]; const inDays = Math.max(0, COUNCIL_SPACING - (s.day - s.guilds.lastCouncil)); rows.push(row('Next petition', `in ${inDays} day${inDays === 1 ? '' : 's'}, from the ${GUILDS[low].name} (standing ${Math.round(s.guilds.standing[low])})${s.guilds.standing[low] >= 60 ? ': content, so none' : ''}`)); } }
    if (b.kind === 'depot') {
      if (s.merchant.visits) rows.push(row('The Wandering Merchant', `${s.merchant.visits} visit${s.merchant.visits === 1 ? '' : 's'}, ${s.merchant.spent.toLocaleString()} crowns spent, ${s.merchant.eggs} egg${s.merchant.eggs === 1 ? '' : 's'}${s.merchant.talks ? `, ${s.merchant.talks} evening${s.merchant.talks === 1 ? '' : 's'} of stories${s.merchant.talks >= 2 ? ' (a favour owed)' : ''}` : ''}`));
      const rt = tradeRoutes(s); rows.push(row('Routes', rt.filter((r) => r.open).map((r) => r.name).join(', ') || 'none')); const tw = rt.find((r) => r.kind === 'twin'); if (tw && !tw.open) problems.push(tw.note);
      const due = caravanDue(s);
      rows.push(row('Caravan', due === null ? `halts here once the depot stands, from the Village on, every ${CARAVAN_EVERY} days` : due === 0 ? 'at the gate: answer the tale (Trade sells the works\' surplus)' : `next in ${due} day${due === 1 ? '' : 's'} (every ${CARAVAN_EVERY}); ${caravanSurplus(s)} surplus goods to sell at 1.5× price; ${s.stats.caravanGoods.toLocaleString()} sold so far for ${s.stats.caravanCrowns.toLocaleString()} crowns`));
    }
    if (b.kind === 'golemfoundry' || b.kind === 'forgetemple') { rows.push(row('Wardens bound', `${boundGolems(s)} (${labourGolems(s) * GOLEM_LABOUR} hands of labour)`)); if (b.kind === 'forgetemple') rows.push(row('The forge', b.lit ? 'a Warden woken within 20 tiles climbs out bound' : 'unlit: the hammers are still')); if (wildGolems(s)) problems.push(`${wildGolems(s)} wild warden(s) walk the map; they bind within 12 tiles of a lit ${b.kind === 'forgetemple' ? 'Forge-Temple' : 'foundry'}.`); }
    if (b.kind === 'leybeacon') rows.push(row('Skyrays', raysLured(s) ? 'circling the beacon' : b.lit ? 'none in reach; schools cross in Bloom and Ember' : 'unlit: the beacon is silent'));
    if (b.kind === 'drakemews') { rows.push(row('Patrols', b.lit ? 'Watch Houses reach twice as far' : 'unlit: the drakes sleep')); rows.push(row('Riders', `${s.agents.filter((a) => a.kind === 3 && a.species === 'rider' && a.anchorId === b.id).length} aloft · ${s.stats.riderRescues} rescues`)); }
    if (MOORINGS.includes(b.kind)) { const qn = s.buildings.filter((o) => o && MOORINGS.includes(o.kind) && o.state === 'ok').length; rows.push(row('Barges sent', `${s.stats.bargeTrips}`)); rows.push(row('Moorings', `${qn} on the map`)); if (qn < 2) problems.push('A single mooring has nowhere to send a barge: build another on the same water.'); }
    if (b.kind === 'skydock') {
      const air = s.airship;
      const wy = (air.wyvernId ?? -1) >= 0 ? s.dragons.find((d) => d.id === air.wyvernId) : null;
      rows.push(row(wy ? 'Wyvern' : 'Airship', air.status === 'away' ? `${wy ? `${wy.name} is ` : ''}away, back in ${Math.max(0, (wy ? WYVERN_DAYS : 10) - (s.day - air.since))} days with ${Math.round(air.goods)} goods` : air.status === 'docked' ? `docked; ${air.wyvern ? `a wyvern leaves on day 3 of the season with up to ${WYVERN_LOAD} goods, no mana asked${dockWyvern(s) ? '' : ' (none at home: the airship goes instead, if the Dock is lit)'}` : 'the airship leaves on day 3 of the season'}` : 'none'));
      rows.push(row('Voyages', `${s.stats.airshipVoyages} by airship, ${s.stats.wyvernVoyages} by wyvern · ${s.stats.airshipCrowns} crowns earned`));
    }
    if (b.kind === 'portalarch') {
      const other = s.buildings.filter((o) => o && o.kind === 'portalarch' && o !== b) as Building[];
      rows.push(row('Paired', other.length ? (other[0].lit && b.lit ? `with the arch at (${other[0].x},${other[0].y}), open` : 'yes, but an arch is unlit') : 'no: raise a second arch'));
      rows.push(row('Trips through the arches', `${s.stats.portalTrips}`));
      rows.push(row('Crossings today', `${b.load ?? 0} / ${PORTAL_CAP} (each draws ${PORTAL_MANA} mana)`));
      if ((b.load ?? 0) > PORTAL_CAP) problems.push('Crowded: past 60 crossings a day the jump costs the carts like a jammed road.');
    }
    if (b.kind === 'stormpeak') {
      rows.push(row('Cooldown', b.cooldown > 0 ? `${b.cooldown} day(s)` : 'ready'));
    }
    if (isCradle(b.kind)) {
      const inside = dragonsIn(s, b.id);
      rows.push(row('Eggs and young', `${inside.length} / ${cradleCapacity(b)}`));
      for (const d of inside) rows.push(row(d.name, `${LINE_INFO[d.line].name}${d.second ? `-${LINE_INFO[d.second].name}` : ''} ${STAGE_NAMES[d.stage]}, mood ${Math.round(d.mood)}`));
      const bc = canBreed(s, b);
      rows.push(row('Breeding', bc.ok ? `<span class="good">${bc.why}</span>` : bc.why));
      if (!b.lit) problems.push('Unlit: the eggs are going cold. A spire within 6 tiles keeps the cradle warm.');
    }
    const dist = s.district[i];
    if (dist) rows.push(row('District', `<span style="color:${DISTRICT_COLORS[dist - 1]}">${districtName(s, dist)}</span>`));
    if (def.zone === Zone.Arcane && b.stock <= 0.5 && b.age > 3) problems.push('No leystone: build a Crystal Mine in the hills with a road to this district.');
    rows.push(row('Mana', b.lit ? '<span class="ley">lit</span>' : '<span class="bad">unlit</span>'));
    rows.push(row('Water', b.watered ? '<span class="good">watered</span>' : '<span class="bad">dry</span>'));
    if (b.state === 'building') { const ba = buildersAt(s, b); rows.push(row('Construction', `${Math.round((1 - b.work / Math.max(1, b.workTotal)) * 100)}% · ${ba.present} builder${ba.present === 1 ? '' : 's'} at work${ba.assigned > ba.present ? `, ${ba.assigned - ba.present} on the way` : ''}${brickworksNear(s, b) ? ' · bricks from the Brickworks (half again as fast)' : ''}`)); if (def.category === 'zone') rows.pop(), rows.push(row('Construction', `${Math.round((1 - b.work / Math.max(1, b.workTotal)) * 100)}% · raised by the folk who will live here`)); else if (!ba.assigned && builderTarget(s) > 0) problems.push('No builder can reach this site by road from the Founding Stake; the folk raise it themselves at a quarter pace.'); }
    el.innerHTML = `<button class="close">✕</button><h2>${def.name}</h2><div class="muted">(${b.x},${b.y}) · ${b.w}×${b.h} · ${b.state}${def.category === 'zone' ? ` · age ${b.age}d` : ''}</div>${rows.join('')}<div class="problems">${problems.map((p) => `<div>⚠ ${p}</div>`).join('')}</div><p class="flavor">${def.flavor}</p>`;
    el.querySelector('.close')!.addEventListener('click', () => this.host.select(null));
    if (b.kind === 'stormpeak') {
      const btn = document.createElement('button');
      btn.textContent = b.cooldown > 0 ? `Call rain (ready in ${b.cooldown} day${b.cooldown === 1 ? '' : 's'})` : 'Call rain over the city (300 crowns)';
      btn.disabled = b.cooldown > 0;
      btn.style.width = '100%';
      btn.onclick = () => this.host.callRain(b.id);
      el.appendChild(btn);
    }
    if (b.kind === 'wrightslodge') {
      const btn = document.createElement('button');
      btn.textContent = (b.cooldown ?? 0) > 0 ? `Vent the store (ready in ${b.cooldown} day${b.cooldown === 1 ? '' : 's'})` : 'Vent the store: empty it, reset the surge count';
      btn.disabled = (b.cooldown ?? 0) > 0;
      btn.style.width = '100%';
      btn.onclick = () => { this.host.vent(b.id); this.refreshInfo(); };
      el.appendChild(btn);
    }
    if (b.kind === 'scaleward') {
      const btn = document.createElement('button');
      const worn = (b.plate ?? 1) < 1;
      btn.textContent = `Re-plate (2 scale; ${Math.round(s.materials.scale)} in the vault)`;
      btn.disabled = !worn || s.materials.scale < 2;
      btn.style.width = '100%';
      btn.onclick = () => { this.host.replate(b.id); this.refreshInfo(); };
      el.appendChild(btn);
    }
    if (isCradle(b.kind) && !isGreatCradle(b) && b.state === 'ok') {
      const btn = document.createElement('button');
      const early = s.milestone < GREAT_CRADLE_MILESTONE;
      btn.textContent = `Raise to a Great Cradle (${GREAT_CRADLE_COST} crowns): four nests, +${GREAT_CRADLE_MANA} mana${early ? ` (from ${this.ms()[GREAT_CRADLE_MILESTONE].name})` : ''}`;
      btn.disabled = early || s.treasury < GREAT_CRADLE_COST;
      btn.style.width = '100%';
      btn.onclick = () => { const why = this.host.raiseCradle(b.id); if (why) this.toast(`<p class="bad">${why}</p>`, 2000); this.refreshInfo(); };
      el.appendChild(btn);
    }
    if (b.kind === 'hunterslodge' && b.state === 'ok') {
      // the quarry: hounds, or any game in the grounds (iteration 58)
      const bar = document.createElement('div');
      bar.className = 'quarry';
      const opts: ('hounds' | WildSpecies)[] = ['hounds', ...WILD_SPECIES.filter((sp) => herdsInGrounds(s, b, sp).length > 0)];
      for (const q of opts) {
        const btn = document.createElement('button');
        btn.textContent = q === 'hounds' ? 'Hounds' : WILD[q].plural[0].toUpperCase() + WILD[q].plural.slice(1);
        btn.dataset.quarry = q;
        btn.disabled = quarryOf(b) === q;
        btn.title = q === 'hounds' ? 'Guard the edge: hounds at full chance' : `${WILD[q].meat} meat, ${WILD[q].hides} hides a head${WILD[q].trophy ? `, ${WILD[q].trophyName} now and then` : ''}`;
        btn.onclick = () => { this.host.setQuarry(b.id, q); this.refreshInfo(); };
        bar.appendChild(btn);
      }
      el.appendChild(bar);
    }
    if (b.kind === 'greatweir' && b.state === 'ok') {
      const btn = document.createElement('button');
      btn.textContent = b.sluice ? 'Close the sluice (45 mana a day, the bank stays dry)' : 'Open the sluice (90 mana a day; floods the bank within 30 in the Thaw)';
      btn.style.width = '100%';
      btn.onclick = () => { const why = this.host.toggleSluice(b.id); if (why) this.toast(`<p class="bad">${why}</p>`, 2000); this.refreshInfo(); };
      el.appendChild(btn);
    }
    if (b.kind === 'skydock' && b.state === 'ok') {
      const btn = document.createElement('button');
      const w = dockWyvern(s);
      btn.textContent = s.airship.wyvern ? 'Send the airship again (200 goods, 10 days, needs the Dock lit)' : `Send a wyvern instead (${WYVERN_LOAD} goods, ${WYVERN_DAYS} days, no mana${w ? `: ${w.name} would go` : '; none at home to send yet'})`;
      btn.style.width = '100%';
      btn.onclick = () => { const why = this.host.toggleSkyDock(); if (why) this.toast(`<p class="bad">${why}</p>`, 2000); this.refreshInfo(); };
      el.appendChild(btn);
    }
    el.querySelectorAll('select[data-golem]').forEach((sel) => {
      (sel as HTMLSelectElement).onchange = () => {
        const [duty, target] = (sel as HTMLSelectElement).value.split(':');
        const why = this.host.setGolemDuty(Number((sel as HTMLElement).dataset.golem), duty as 'labour' | 'guard' | 'works' | 'haul', Number(target ?? -1));
        if (why) this.toast(`<p class="bad">${why}</p>`, 2000);
        this.refreshInfo();
      };
    });
    el.querySelectorAll('button[data-prio]').forEach((pb) => { (pb as HTMLButtonElement).onclick = () => { this.host.setPriority(b.id, Number((pb as HTMLElement).dataset.prio) as 0 | 1 | 2); this.refreshInfo(); }; });
  }

  private nodeShown = -1;

  private sectorShown = -1;
  private refreshSectorInfo(k: number): void {
    const s = this.host.state;
    const el = this.el.info;
    if (this.sectorShown === k && !el.classList.contains('hidden') && s.tick % 30 !== 0) return;
    this.sectorShown = k;
    this.nodeShown = -1;
    el.classList.remove('hidden');
    const why = canBuySector(s, k);
    const cost = sectorCost(s, k);
    let gloam = 0;
    const x0 = (k % SECTORS_X) * SECTOR;
    const y0 = Math.floor(k / SECTORS_X) * SECTOR;
    for (let y = y0; y < y0 + SECTOR; y++) for (let x = x0; x < x0 + SECTOR; x++) if (s.gloam[idx(x, y)]) gloam++;
    el.innerHTML = `<button class="close">✕</button><h2>Beyond the Charter</h2><div class="muted">${sectorName(k)[0].toUpperCase() + sectorName(k).slice(1)} · ${SECTOR}×${SECTOR} tiles</div>
      ${row('Price', `${cost} crowns`)}${row('Gloam inside', `${gloam} tiles${gloam ? ' (drawn back on purchase)' : ''}`)}${row('Chartered', `${charteredCount(s)} of ${s.sectors.length} sectors`)}
      <p class="muted">Nothing can be built, zoned or paved beyond the Charter. Buying a sector that touches it extends the Charter; the Crown's surveyors ward the ground and the Gloam inside draws back to the map's rim. Prices rise with distance and with every sector bought.</p>
      <button id="sec-buy" ${why ? 'disabled' : ''}>Extend the Charter (${cost} crowns)</button>
      ${why ? `<div class="muted" style="margin-top:4px">${why}</div>` : ''}
      <p class="flavor">The old maps end at the Charter line. Past it the cartographers wrote "here the lantern does not reach".</p>`;
    el.querySelector('.close')!.addEventListener('click', () => { (this.host as { selectedSector: number }).selectedSector = -1; el.classList.add('hidden'); });
    (el.querySelector('#sec-buy') as HTMLButtonElement).onclick = () => { const w = this.host.buySector(k); if (w) this.toast(`<p class="bad">${w}</p>`, 2500); else { this.toast(`<h2>The Charter grows</h2><p>${sectorName(k)[0].toUpperCase() + sectorName(k).slice(1)} is yours to build.</p>`, 5000); el.classList.add('hidden'); } };
  }

  private refreshNodeInfo(i: number): void {
    const s = this.host.state;
    const n = s.nodes[i];
    const el = this.el.info;
    if (!n) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    const depth = n.depth ?? 0;
    const why = this.host.canDeepenNode(i);
    const founding = n.x === s.founding.x && n.y === s.founding.y;
    const isWyrm = i === s.wyrm.node && s.wyrm.state !== 'none';
    const asp = n.aspect ? ASPECT_INFO[n.aspect] : null;
    const rows = [
      row('Flow', `${Math.round(nodeFlowOf(s, i) * factionOf(s).rules.nodeMana)} mana / day`),
      row('Linked', s.nodeLinked[i] === false ? `<span class="warn">no: it seeps ${Math.round(90 * NODE_SEEP * factionOf(s).rules.nodeMana)} into the ground; a lit spire, stake or hall within 6 tiles draws the rest (and its depth)</span>` : 'yes: a lit spire, stake or hall within 6 tiles draws its full flow'),
      row('Deepened', `${depth} / ${NODE_DEEPEN_COST.length}`),
      row('City mana', `${Math.round(s.manaDemand)} / ${Math.round(s.manaSupply)}`),
    ];
    if (asp) rows.push(row('Aspect', `<span style="color:${asp.color}">${asp.name} ley</span>`), `<div class="muted" style="margin:2px 0 6px">${asp.desc[0].toUpperCase() + asp.desc.slice(1)}. A cradle here attunes ${asp.name} eggs.</div>`);
    if (isWyrm) {
      const w = s.wyrm;
      rows.push(row('The wyrm', w.state === 'sleeping' ? (w.waking > 0 ? 'stirring' : 'asleep') : w.state));
      if (w.state === 'sleeping') rows.push(`<div class="meter" title="Waking"><div style="width:${Math.round(w.waking)}%"></div></div>`);
      if (w.state === 'awake') rows.push(row('Tribute', `${wyrmTribute(s)} crowns / season`));
      if (w.state === 'bound') rows.push(row('Fed', w.sulking > 0 ? `<span class="bad">sulking ${w.sulking}d</span>` : `${w.fedDays} days running`));
    }
    const canDaughterWhy = this.host.canFoundDaughter(i);
    const canDaughter = canDaughterWhy === null ? true : canDaughterWhy;
    const title = isWyrm ? (s.wyrm.state === 'sleeping' ? 'The Sleeping Wyrm' : s.wyrm.state === 'dead' ? "The Wyrm's Bones" : 'The Vein-Wyrm') : founding ? 'The Founding Wellspring' : s.daughter && s.daughter.node === i ? `${s.daughter.name}'s Wellspring` : 'Ley Node';
    el.innerHTML = `<button class="close">✕</button><h2>${title}</h2><div class="muted">(${n.x},${n.y}) · ${isWyrm ? 'a Vein with a wyrm coiled on it' : 'a Vein breaking the surface'}</div>${rows.join('')}
      ${isWyrm ? `<p class="${s.wyrm.state === 'sleeping' && s.wyrm.waking > 0 ? 'warn' : 'muted'}">${describeWyrm(s)}</p>` : ''}
      <p class="muted">${isWyrm && s.wyrm.state === 'sleeping' ? `Spires within 6 tiles drink from the wyrm and wake it (about ${Math.round(100 / 3)} days per spire). Deepening this node wakes it at once. Awake, it wants tribute each season, or it burns; a Wyrm-Court (Free City) can bind it as the city's guardian: wards ${WYRM_LAIR_RADIUS} tiles, no hounds, happiness +10, eats 40 goods a day (20 while the Court is lit).` : `Ley Spires within 6 tiles of a node drink from it. Deepening the Wellspring (from Burgh) adds ${NODE_DEEPEN_MANA} mana a day, twice at most.`}</p>
      <button id="n-deepen" ${why ? 'disabled' : ''}>${isWyrm && s.wyrm.state === 'sleeping' ? 'Deepen and wake the wyrm' : 'Deepen the Wellspring'} (${depth < NODE_DEEPEN_COST.length ? NODE_DEEPEN_COST[depth] + ' crowns' : 'done'})</button>
      ${why ? `<div class="muted" style="margin-top:4px">${why}</div>` : ''}
      ${!founding && !isWyrm && s.milestone >= 8 && !s.daughter ? `<div class="drow" style="margin-top:8px"><input id="n-dname" type="text" value="${CITY_NAMES[(i * 3) % CITY_NAMES.length]}" maxlength="18" style="width:120px"> <button id="n-daughter" ${canDaughter === true ? '' : 'disabled'}>Found a daughter wardlight</button>${canDaughter === true ? '' : `<div class="muted">${canDaughter}</div>`}</div>` : ''}
      ${s.daughter && s.daughter.node === i ? `<div class="good">${s.daughter.name}, daughter wardlight: ${daughterPopulation(s)} folk within 30 tiles${s.daughter.twin >= 0 ? ' · Twin Beacon' : ` (${TWIN_POP} for the Twin Beacon)`}</div>` : ''}
      <p class="flavor">${isWyrm ? 'The stones here are not stones. Put your hand on one and it is warm, and it breathes.' : founding ? 'The first light of the valley. It hums a half-tone flat when the dead are restless.' : 'Grass grows in spirals here. Children are told not to sleep within a stone\'s throw of it, and do anyway.'}</p>`;
    el.querySelector('.close')!.addEventListener('click', () => { this.host.select(null); (this.host as { selectedNode: number }).selectedNode = -1; el.classList.add('hidden'); });
    (el.querySelector('#n-deepen') as HTMLButtonElement).onclick = () => this.host.deepenNode(i);
    const db = el.querySelector('#n-daughter') as HTMLButtonElement | null;
    if (db) db.onclick = () => { const nm = (el.querySelector('#n-dname') as HTMLInputElement).value.trim() || 'Newlight'; const why = this.host.foundDaughter(i, nm); if (why) this.toast(`<p class="bad">${why}</p>`, 2500); else this.toast(`<h2>${nm} is founded</h2><p>A daughter wardlight of ${s.cityName}. Grow it to 500 folk for the Twin Beacons.</p>`, 7000); this.nodeShown = -1; this.refresh(); };
    this.nodeShown = i;
  }

  // ---------- minimap ----------
  private miniImg: ImageData | null = null;
  private miniTick = -1;
  private miniCollapsed = false;
  private miniOff: HTMLCanvasElement | null = null;

  private buildMinimap(): void {
    const el = this.el.minimap;
    const c = el.querySelector('canvas') as HTMLCanvasElement;
    (el.querySelector('.min') as HTMLButtonElement).onclick = () => {
      this.miniCollapsed = !this.miniCollapsed;
      c.style.display = this.miniCollapsed ? 'none' : '';
      (el.querySelector('.min') as HTMLButtonElement).textContent = this.miniCollapsed ? '+' : '–';
    };
    const jump = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      const mx = ((e.clientX - r.left) / r.width) * 256;
      const my = ((e.clientY - r.top) / r.height) * 128;
      const cam = this.host.camera;
      cam.cx = (mx - 128) * 16;
      cam.cy = my * 16;
      cam.clamp();
    };
    let down = false;
    c.addEventListener('pointerdown', (e) => { down = true; c.setPointerCapture(e.pointerId); jump(e); e.stopPropagation(); });
    c.addEventListener('pointermove', (e) => { if (down) jump(e); });
    c.addEventListener('pointerup', () => { down = false; });
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.host.camera.setZoom(this.host.camera.zoom + (e.deltaY < 0 ? 1 : -1)); }, { passive: false });
  }

  /** Rebuild the 256x128 iso image every 30 ticks; draw it with the view box every refresh. */
  private refreshMinimap(): void {
    if (this.miniCollapsed) return;
    const s = this.host.state;
    const c = this.el.minimap.querySelector('canvas') as HTMLCanvasElement;
    if (!this.miniImg || s.tick - this.miniTick >= 30 || s.tick < this.miniTick) {
      this.miniTick = s.tick;
      const img = this.miniImg ?? new ImageData(256, 128);
      const d = img.data;
      d.fill(0);
      const put = (x: number, y: number, hex: string, a = 255) => {
        const px = x - y + 128;
        const py = (x + y) >> 1;
        if (px < 0 || px >= 256 || py < 0 || py >= 128) return;
        const i = (py * 256 + px) * 4;
        d[i] = parseInt(hex.slice(1, 3), 16);
        d[i + 1] = parseInt(hex.slice(3, 5), 16);
        d[i + 2] = parseInt(hex.slice(5, 7), 16);
        d[i + 3] = a;
      };
      const terrainCol = (t: number, x = 0, y = 0): string => {
        switch (t) {
          case Terrain.DeepWater: return PAL.water1;
          case Terrain.Water: return PAL.water2;
          case Terrain.Shore: return PAL.sand;
          case Terrain.Meadow: return PAL.meadow;
          case Terrain.Forest: return PAL.forestFloor;
          case Terrain.Hills: return PAL.hillGrass;
          case Terrain.LeyNode: { const nd = s.nodes.find((n) => n.x === x && n.y === y); return nd?.aspect ? ASPECT_INFO[nd.aspect].color : PAL.ley1; }
          case Terrain.Ruins: return PAL.stone2;
          default: return PAL.grass2;
        }
      };
      for (let y = 0; y < s.h; y++)
        for (let x = 0; x < s.w; x++) {
          const i = y * s.w + x;
          let col = s.gloam[i] ? PAL.gloam1 : terrainCol(s.terrain[i], x, y);
          const dim = !inCharter(s, x, y);
          if (s.road[i]) col = s.road[i] === 3 ? PAL.lanternLight : s.road[i] === 4 ? PAL.glimleaf : PAL.dirt2;
          if (s.wall[i]) col = PAL.stone3;
          const bi = s.bIndex[i];
          if (bi >= 0) {
            const b = s.buildings[bi];
            if (b) {
              const def = BUILDING_BY_KEY[b.kind];
              col = b.state === 'burning' ? PAL.fire1 : b.state === 'ruin' ? PAL.stone1 : def.zone === Zone.Hearth ? PAL.zoneHearth : def.zone === Zone.Market ? PAL.zoneMarket : def.zone === Zone.Craft ? PAL.zoneCraft : def.zone === Zone.Arcane ? PAL.zoneArcane : def.category === 'ley' ? PAL.ley2 : PAL.whitewash;
            }
          }
          put(x, y, col, dim ? 110 : 255);
        }
      const wn = s.wyrm.node >= 0 ? s.nodes[s.wyrm.node] : null;
      if (wn && s.wyrm.state !== 'none') put(wn.x, wn.y, s.wyrm.state === 'awake' ? PAL.fire1 : PAL.leyGlow);
      this.miniImg = img;
      if (!this.miniOff) { this.miniOff = document.createElement('canvas'); this.miniOff.width = 256; this.miniOff.height = 128; }
      this.miniOff.getContext('2d')!.putImageData(img, 0, 0);
    }
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0b0912';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(this.miniOff!, 0, 0, c.width, c.height);
    // the view box
    const cam = this.host.camera;
    const kx = c.width / 256;
    const ky = c.height / 128;
    const vx = (cam.left / 16 + 128) * kx;
    const vy = (cam.top / 16) * ky;
    const vw = (cam.nativeW / 16) * kx;
    const vh = (cam.nativeH / 16) * ky;
    ctx.strokeStyle = PAL.gold;
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(vx) + 0.5, Math.round(vy) + 0.5, Math.round(vw), Math.round(vh));
  }

  /** Drag a floating panel by its .grip (or its heading); position is remembered per panel. */
  private makeDraggable(el: HTMLElement, key: string): void {
    const saved = (() => { try { return JSON.parse(localStorage.getItem(`wardlight.panel.${key}`) || 'null'); } catch { return null; } })() as { l: number; t: number } | null;
    const apply = (l: number, t: number) => {
      const w = el.offsetWidth || 200;
      const h = el.offsetHeight || 100;
      l = Math.max(0, Math.min(window.innerWidth - w, l));
      t = Math.max(40, Math.min(window.innerHeight - Math.min(h, 60), t));
      el.style.left = `${l}px`;
      el.style.top = `${t}px`;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    };
    if (saved) apply(saved.l, saved.t);
    el.addEventListener('pointerdown', (e) => {
      const target = e.target as HTMLElement;
      const handle = target.closest('.grip, h3, h2');
      if (!handle || !el.contains(handle) || target.closest('button:not(.grip)')) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const ox = e.clientX - r.left;
      const oy = e.clientY - r.top;
      const move = (ev: PointerEvent) => apply(ev.clientX - ox, ev.clientY - oy);
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        try { localStorage.setItem(`wardlight.panel.${key}`, JSON.stringify({ l: parseFloat(el.style.left), t: parseFloat(el.style.top) })); } catch { /* ignore */ }
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }

  /** The districts lesson: a card at the Hamlet, once, until closed; its three steps each have a Show me. */
  private lessonOpen = false;
  private lessonDrawn = false;
  refreshLesson(): void {
    const s = this.host.state;
    const el = this.el.lesson;
    const seen = s.lessonsSeen.includes('districts');
    const due = s.milestone >= DISTRICT_UNLOCK && !seen;
    if (due && districtsInUse(s).length > 0 && s.milestone > DISTRICT_UNLOCK) { this.host.seeLesson('districts'); } // an older city already past it
    const open = due && !(districtsInUse(s).length > 0 && s.milestone > DISTRICT_UNLOCK);
    if (open !== this.lessonOpen) { this.lessonOpen = open; this.lastQuestKey = ''; this.refreshTasks(); }
    if (!open) { el.classList.add('hidden'); this.lessonDrawn = false; return; }
    const painted = districtsInUse(s).length > 0;
    const chartered = Object.values(s.districtQuarters).some(Boolean);
    const ruled = Object.values(s.districtEdicts).some(Boolean);
    const step = (n: number, done: boolean, title: string, text: string, id: string) => `<div class="step ${done ? 'done' : ''}"><b>${done ? '✓' : n}. ${title}</b> ${text} <button class="show" data-step="${id}">Show me</button></div>`;
    const html = `<h2>Districts are yours</h2><p class="muted">Two districts open at the Hamlet, more as the city grows. A district is a place you can charter and rule apart.</p>
      ${step(1, painted, 'Paint one', 'Districts tab: drag a rectangle over part of the city.', 'paint')}
      ${step(2, chartered, 'Charter it', 'Edicts panel: a Hearth or Craft quarter, each a gift and a price.', 'charter')}
      ${step(3, ruled, 'Rule it', 'Edicts panel: set an edict for that district alone.', 'rule')}
      <div style="text-align:right"><button id="lesson-close">${painted && chartered ? 'Done' : 'Close'}</button></div>`;
    if (!this.lessonDrawn || el.dataset.state !== `${painted}${chartered}${ruled}`) {
      el.innerHTML = html;
      el.dataset.state = `${painted}${chartered}${ruled}`;
      this.lessonDrawn = true;
      el.querySelectorAll('button[data-step]').forEach((b) => { (b as HTMLButtonElement).onclick = () => this.lessonStep((b as HTMLElement).dataset.step!); });
      el.querySelector('#lesson-close')!.addEventListener('click', () => { this.host.seeLesson('districts'); this.refreshLesson(); });
    }
    el.classList.remove('hidden');
  }
  private lessonStep(id: string): void {
    const s = this.host.state;
    if (id === 'paint') { this.focus({ tool: 'district' }); return; }
    const d = districtsInUse(s)[0];
    if (!d) { this.toast('<p>Paint a district first: Districts tab, drag a rectangle.</p>', 2500); this.focus({ tool: 'district' }); return; }
    this.edictScope = d;
    this.toggleEdicts(true);
  }

  toast(html: string, ms = 6000): void {
    const t = this.el.toast;
    t.innerHTML = html;
    t.classList.remove('hidden');
    t.style.opacity = '1';
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      t.style.opacity = '0';
      setTimeout(() => t.classList.add('hidden'), 500);
    }, ms);
  }

  // ---------- modals ----------
  private buildHelp(): void {
    this.el.help.innerHTML = `<div class="box panel">
      <h2>How to be a Warden-Reeve</h2>
      <div class="cols">
        <div>
          <h3>Controls</h3>
          <ul>
            <li><kbd>Left click / drag</kbd> use tool</li>
            <li><kbd>Right / middle drag</kbd> pan · <kbd>W A S D</kbd> / arrows pan</li>
            <li><kbd>Wheel</kbd> zoom (integer steps) · <kbd>Shift</kbd>+<kbd>+</kbd>/<kbd>-</kbd></li>
            <li><kbd>Right click</kbd> / <kbd>Esc</kbd> cancel tool · <kbd>X</kbd> select</li>
            <li><kbd>R</kbd> road (again: next type) · <kbd>Z</kbd> zone (again: next zone)</li>
            <li><kbd>B</kbd> bulldoze · <kbd>Shift</kbd>+<kbd>G</kbd> grid · <kbd>C</kbd> Chronicle · <kbd>N</kbd> Annals · <kbd>H</kbd> this help · keys can be rebound in Menu → Key bindings</li>
            <li>The map beyond the <b>Charter</b> is dimmed: click it to see the price and extend the Charter (from Hamlet). The Gloam inside a bought sector draws back.</li>
            <li>The <b>Land</b> tab clears forest, plants glimwood and levels hills, one tile at a time. The title screen's <b>Today's challenge</b> is the same valley and the same people for everyone, drawn from the date: the fifth milestone by day ${CHALLENGE_DAYS}, failed on day ${CHALLENGE_DAYS + 1}, scored by the days to spare and a point a thousand crowns.</li>
            <li><b>Replays</b>: the Menu's <b>Export replay</b> saves every command of this charter since it was founded (a charter loaded from a save starts none); the title screen's <b>Watch a replay</b> plays such a file again. The map and panels can be read but not changed; <b>Skip to end</b> runs it to its last day and says whether it matches its recording.</li>
            <li><kbd>Space</kbd> pause · <kbd>,</kbd> <kbd>.</kbd> slower / faster</li>
            <li><kbd>1</kbd>–<kbd>0</kbd> <kbd>-</kbd> <kbd>=</kbd> <kbd>G</kbd> <kbd>M</kbd> info views · <kbd>V</kbd> view list</li>
            <li><b>Keyboard:</b> <kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> move between controls · <kbd>F6</kbd> jumps between the top bar, the toolbar, the Ledger, the panels and the map · the arrows move along the toolbar's tabs and items, <kbd>Enter</kbd> picks · <kbd>Esc</kbd> closes a panel · the first <kbd>Tab</kbd> offers <b>Skip to the map</b>; the shortcuts and the map keys work while the map has focus</li>
            <li><kbd>F5</kbd> quick save · <kbd>F9</kbd> quick load · <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo</li>
          </ul>
        </div>
        <div>
          <h3>The loop</h3>
          <ol>
            <li><b>Draw roads</b> from the Founding Stake. Everything grows beside a road.</li>
            <li><b>Zone</b> Hearth (homes), Market, Craft (alchemy works) beside a road (a corner counts) where the demand bars ask: a bar above the line grows, at or below it nothing of that zone grows (hover a bar for why).</li>
            <li><b>Light</b> them: Ley Spires within 6 tiles of a node light 5 tiles; lit buildings light their neighbours. An unlinked node seeps half its flow; a spire within 6 tiles draws the rest. A spire carries 80 mana of buildings (a Nexus 200) and its farthest go dark over that. When the ley runs short, lantern-ways dim first, then buildings by their Brownout tier (set it in a building's panel).</li>
            <li><b>Water</b> them with Wells.</li>
            <li><b>Serve</b>: Watch, Healers, Veshari (fire), Boneyard (the dead!), Wards (the Gloam!).</li>
            <li>Watch the <b>tithe</b>. Raise taxes carefully. Hit population milestones to unlock more.</li>
            <li><b>Goods</b>: Craft works fill donkey carts; the carts feed Markets by road (the mines' carts carry leystone). A market trades by the road at its door: a cobbled road in full, a dirt track a tenth less (a fifth in the mud of the Thaw and the Hush), a lit Lantern-way or a Glowvine Lane a tenth more. Empty shelves and idle stills both hurt.</li>
            <li>The <b>Charter's Ledger</b> (left) lists the next three tasks with a hint and a <b>Show me</b> button; the <b>Advisor</b> line names the worst problem right now. The <b>Chronicle</b> (top bar, <kbd>C</kbd>) records what has actually happened in the world, with a ⌖ to go there. The <b>Annals</b> (top bar, <kbd>N</kbd>) keep every count of the charter by chapter: riots and levies, rain days and hound raids, bouts, relics, walkers' rounds.</li>
            <li><b>Edicts</b> (top bar) are policies with daily costs. <b>Events</b> pause the game and ask you to choose.</li>
            <li><b>Seasons</b> last 30 days. The Hush brings long nights, hungrier hearths and a bolder Gloam. Festivals ask for choices on fixed days.</li>
            <li><b>Click a ley node</b> to see its flow; from Burgh you can deepen it for more mana. A <b>Trade Depot</b> sells surplus goods, and every 12 days the Belerial caravan halts there to buy the works' surplus at 1.5× (the Budget counts its take).</li>
            <li><b>Dragons</b>: build a Wyrm-Cradle (Township) near ley and a Tamer's Lodge (it seats four); eggs arrive through events. Raise them in the <b>Wyrms</b> panel and give drakes a role. Dragons eat from markets within 12 of the cradle (a warden from its district); ten unfed days cost a stage, and a dragon that leaves comes back after a season to ask a tribute. A cradle becomes a <b>Great Cradle</b> (four nests) from the Burgh; the Ring shows a champion's odds before each bout.</li>
            <li><b>Huruhui and Gekiryu craft</b>: a <b>Torrent Mill</b> on the riverbank makes mana from falling water; <b>Hanging Gardens</b> against hills make goods, health and light with no mana, and unlock the <b>Glowvine Lane</b>; a <b>Glimhouse</b> keeps Craft works warm through the Hush; the <b>Astral Observatory</b> forecasts the week in the Ledger.</li>
            <li><b>Longwood and Lukuku</b>: a pair of <b>Portal Arches</b> (Market Town) lets carts step across the map; a <b>Ruin Delve</b> on the Ruins of Lukuku (flagstones in a forest) brings up relics and old stories; the <b>World Tree Sapling</b> wonder (Free City) grows over four seasons into shade that holds the Gloam.</li>
            <li><b>Longwood and the Fen-Nex</b>: big forests hide <b>war-tigers</b> that hunt hearths by night (hunters, strong Watch or warden drakes kill them); the <b>Fen-Nex</b> fox-folk trade honestly half the time and may take a quarter of the city; a wild surge can leave a drifting <b>mana-storm</b> that warps buildings until wards dissolve it; the <b>Font of Quieting</b> (Free City) makes the dead easy to lay down.</li>
            <li><b>Vehicles</b>: level-3 Arcane workshops put <b>floating carts</b> on the roads (no congestion, 1 mana while moving); two <b>Quays</b> on the same water trade goods by <b>barge</b>; a lit <b>Drake Mews</b> sends <b>drake riders</b> to the restless and to fires; the <b>Sky-Dock</b> (Beacon of Eda) launches an <b>airship</b> each season with the city's surplus, or, from its panel, a <b>wyvern</b> of the city's own: half the load, back in five days, no mana, and one time in two it brings a rival wardlight's egg offer or a challenge for the Ring. Once a <b>Wyrm-Court</b> stands, a drake may be a <b>mount</b>: a Watch rider across the whole map. A cradle with the Gloam at its door three days running sees its <b>eggs go grey</b>; the <b>Wandering Merchant</b> remembers every visit (the egg on offer changes, bought eggs cut her prices, two evenings of stories are a favour owed); <b>sextons</b> walk to a guild brawl on the square and can part it.</li>
            <li><b>Beasts of the Concord and the sky</b>: mining wakes <b>Concord Wardens</b> in the hills (a delver drake halves it); a <b>Golem Foundry</b> (Burgh) binds them and its panel sets each one to labour, to guard the foundry, to work a Craft bench or to <b>haul</b> from one: a stone cart of 30 goods, slow and tireless, that fears no hound (the donkey carts balk and stand when Gloam-hounds come within 4 tiles). A <b>Ley Beacon</b> keeps a school of <b>skyrays</b> for a season (happiness, rayscale; a <b>Rayscale Mirror</b> gets glim-dust instead). A <b>Drake Mews</b> doubles Watch House reach. Three taming edicts trade one beast for another.</li>
            <li><b>The ley-weave</b>: every node has an aspect (Ember, Bone, Glim, Vein, Sky, Grey, Tide, Storm) that changes the rules within 10 tiles; a cradle there attunes matching eggs; grown dragons radiate their line's aura (an Ember drake lifts Craft a tenth, a Sky wyvern speeds the carts, a Tide drake swims a barge a day) and every building in one names it; rare goods build the <b>Marvels</b> tab and have sinks of their own (the <b>Scale-Mail</b> edict, the Forge's fire, an eggshell-lined nest, glim-dust scattered on a dark lane from the Land tab, the caravan's share); the Gloam's pressure rises with the dead and falls with faith.</li>
            <li><b>The Sleeping Wyrm</b> coils around one distant node. Spires there wake it; awake, it wants tribute each season or it burns. A <b>Wyrm-Court</b> (Free City, once a wyrm is awake) binds it as the city's guardian: lit, it halves the wyrm's appetite; dark two days, the wyrm sulks. Every lit <b>wonder hall</b> delights the city (+5) and lifts the next grant a tenth; the <b>Lantern of the Cores</b> takes the first 30 of a surge and cracks for 10 days.</li>
            <li><b>Walkers</b>: Watch Houses send watchmen, Boneyards sextons, Healer's Shrines healers, spires Tallowkin wardens (under their edict), Academies scholars to the delve, Tamer's Lodges tamers to the cradles, and shrines pilgrims to the temple. The streets they walk count as covered, and each does its job where it goes.</li>
            <li>The <b>Weave</b> view (<kbd>W</kbd>) paints ley aspects and dragon auras; the Edicts panel seats the <b>guild council</b> once a Guildhall is lit; the Ledger lists every <b>trade route</b>.</li>
            <li>Panels: the <b>Info views</b>, <b>minimap</b> and message ticker can be dragged by their ⋮⋮ grip. Click or drag on the <b>minimap</b> to jump there; scroll on it to zoom.</li>
            <li><b>Unrest</b> above half for five days brings a riot to the least-watched market (the Watch holds it at half coverage, or pay the Crown 600); an unwatched market loses a tenth of its shelves a night while unrest is over 30 %. While placing a spire, a well or a service hall, the reach of the ones already standing is drawn, so you can see where the new one links or where the gaps are. Selecting a building rings everything it reaches, labelled (its water, watch or light, and the rest: a cradle's feeding markets, the Hospice's draughts, a quay's works, the Seat's warmth), above the houses and through the night, with its kin's reach faint around it.</li>
            <li><b>Districts</b> open in steps: two at the Hamlet, four at the Village, six at the Market Town, all eight at the Burgh; charters the same way (Hearth and Craft first, Market at the Village, Scholars' at the Township, Temple at the Market Town). A charter costs a crown a building a day and holds ${CHARTER_LOCK_DAYS} days; a Craft quarter's smoke drifts four tiles past its edge, a Temple quarter takes a tenth of the city's market tithe. An <b>edict</b> holds ${EDICT_MIN_DAYS} days and costs ${EDICT_REPEAL} crowns to repeal. A road at a building's corner counts as its door.</li>
            <li><b>Weather</b> is written in the seed: Bloom rain (fewer fires, more craft, less miasma), an Ember drought (more fires, wells reach less, the gardens and the World Tree wait) and a Hush blizzard (hearths burn more mana, the hounds stay in). The top bar names it; the Observatory sees it coming.</li>
            <li><b>The Crown</b> levies 5 % of the treasury above 10,000 each Thaw, lends 10,000 a milestone at half a percent a day (Ledger), and charges 1 % a day on a debt. Its <b>favour</b> (50 is neutral) moves sector prices and the levy by 0.3 % a point; under ${FAVOUR_AUDIT} the auditors hold the next grant. The top bar names the <b>next gate</b>: the Vellish need happiness 45 + 3 × the milestone, the Tallowkin must hold their light three days.</li>
            <li><b>The wild</b>: herds of deer and elk graze the meadows by day and bed down in the woods at night, and run from lit ground; boar keep the forests, goats the hills, otters and herons the banks. A herd breeds in Bloom and thins where the city builds within two tiles of its ground; a ward or a lit Glimhouse helps it recover. A <b>Hunters' Lodge</b> hunts the <b>quarry</b> its panel names within 16 tiles: hides, meat and trophies (antlers, tusks, plumes, wolf heads) for the Gloam road at their own prices, and meat for the markets within 16, where it makes the hearths within 10 happier. Hunters after game kill hounds at half the chance; a herd hunted to the last is gone. <b>The Close Season</b> edict closes the chase in Bloom and keeps six head in every herd. In the Hush <b>wolves</b> leave the forest at night to take hens from the dark, unwatched hearths at the edge.</li>
            <li><b>The water</b>: every river and lake holds a shoal. A <b>Fishers' Hut</b> on the bank puts boats out and lands fish as the shoal allows; fish spoil in two days unless a market within 12 or a <b>Smokehouse</b> within 6 takes them, and a market with fish makes the hearths within 10 happier. Too many huts on one water fish it out; a <b>Weir</b> doubles its regrowth and keeps the fords near it open. <b>Reed-Cutters</b> on the shore thatch the level-1 homes (+3 happiness, but thatch burns). The <b>lake</b> (open water) lifts the land within 4, its wells serve half again, and the <b>Water Garden</b> stands on its shore. A Dirt Track over a narrow river is a <b>ford</b>: cheap, but under water in the Thaw's first ten days.</li>
            <li><b>The Great Gate</b> (Burgh): the gatehouse of the Pass of Buluiain, raised in the angle between a <b>Belregi gate</b> and its road. Lit, it wards 20 tiles, every Belregi gate reaches 12 instead of 8, three pilgrims walk from it, and on the 15th of each season <b>pilgrims of the Pass</b> lodge in empty homes and pay 40 crowns of alms. Ten days on, the <b>High Warden of Belregi</b> brings the <b>Heart</b>: set it in the arch (wards 30, gates 16), leave it with the Guardians (twice the pilgrims), or sell it (6,000 crowns; the Pass closes). She recites what you did at the gates before: the pilgrims of Aume, the Lantern Fair, the poachers, your Belregi and Uzulim gates. With an Uzulim gate in the wall, its wardens come for a share; in the Hush the Heart wakes and grants one favour, by half if your record at the gates is poor.</li>
            <li><b>Two ways to lose</b> beyond the Gloam, the restless and the Crown. <b>The wyrm</b> remembers refusals in a row: the first is forgiven, the second brings a warning, and the third brings it down on the Founding Stake, which ends the charter unless a great wyrm of your own rises to meet it. Any tribute paid starts the count again. <b>The hounds</b>: in the Hush, three nights of Gloam-hounds at the door of a dark, unwarded home drive its folk out until the Thaw. A district with half its homes fled (homes in no district count by their march) is emptied, and three emptied in one Hush bring the Long Night early. Light, wards, the Watch, Hunters' Lodges and the Warding Wall keep them from the doors.</li>
          </ol>
          <h3>Ways to lose</h3>
          <ul>
            <li>Treasury below −8,000 × (1 + milestone ÷ 2) for ${DEBT_DAYS} days.</li>
            <li>The Gloam reaches the founding ley node.</li>
            <li>Forty restless dead walk your streets.</li>
          </ul>
        </div>
      </div>
      <p class="muted">${TIPS[0]}</p>
      <div style="text-align:right"><button id="help-close">Back to the valley</button></div>
    </div>`;
    this.el.help.querySelector('#help-close')!.addEventListener('click', () => this.toggleHelp(false));
  }

  toggleHelp(show?: boolean): void {
    const h = this.el.help;
    const s = show ?? h.classList.contains('hidden');
    h.classList.toggle('hidden', !s);
    if (s) {
      const p = h.querySelector('p.muted')!;
      p.textContent = TIPS[this.tipIndex++ % TIPS.length];
    }
  }

  private buildTitle(): void {
    const names = CITY_NAMES.map((n) => `<button data-name="${n}">${n}</button>`).join('');
    this.el.title.innerHTML = `<div class="box panel">
      <canvas id="sigil" width="96" height="64"></canvas>
      <h1>WARDLIGHT</h1>
      <div class="muted" style="margin-bottom:10px">a city of Eda</div>
      <p class="lore">Three hundred years after the Hollowing, the world of Eda is islands of light in a grey sea. The Ashen Crown of Vell has surveyed a young ley node in a river valley at the edge of the Gloam, and granted you a Charter: <i>light it, hold it, and make it pay.</i> Draw roads, zone hearths and markets, raise spires to carry the ley, and keep the dead quiet. Grow a camp into a Beacon of Eda.</p>
      <div class="row"><label>Valley name</label><input type="text" id="t-name" value="${CITY_NAMES[Math.floor(Math.random() * CITY_NAMES.length)]}"><label>Seed</label><input type="number" id="t-seed" value="${Math.floor(Math.random() * 99999)}" style="width:100px"></div>
      <div class="names">${names}</div>
      <div class="peoples">${Object.values(FACTIONS).map((fd) => `<button data-fac="${fd.id}" class="${fd.id === 'vellish' ? 'active' : ''}" ${fd.playable ? '' : 'disabled'} title="${fd.lore}"><b>${fd.name}</b><span>${fd.playable ? fd.lore : 'Coming in a later iteration.'}</span></button>`).join('')}</div>
      <div class="scenarios">${SCENARIOS.map((sc, i) => `<button data-sc="${sc.id}" class="${i === 0 ? 'active' : ''}" title="${sc.goal}"><b>${sc.name}</b><span>${sc.blurb}</span><em>Goal: ${sc.goal}</em></button>`).join('')}</div>
      <div class="row"><button id="t-new">Found a new wardlight</button><button id="t-daily" title="The same valley and people for everyone today; the fifth milestone by day ${CHALLENGE_DAYS}, scored">Today's challenge</button><button id="t-continue">Continue</button><button id="t-import">Import Charter (.json)</button><button id="t-replay" title="Watch a charter played again from its replay file">Watch a replay</button></div><input type="file" id="t-rfile" accept=".json" class="hidden">
      <input type="file" id="t-file" accept=".json" class="hidden">
      <p class="muted" style="font-size:11px">Runs entirely in your browser. Autosaves every day to this browser. Press <b>H</b> in game for help.</p>
    </div>`;
    const t = this.el.title;
    let scenario: Scenario = 'valley';
    let faction: FactionId = 'vellish';
    t.querySelectorAll('.peoples button').forEach((b) => ((b as HTMLButtonElement).onclick = () => { faction = (b as HTMLElement).dataset.fac as FactionId; t.querySelectorAll('.peoples button').forEach((o) => o.classList.toggle('active', o === b)); }));
    t.querySelectorAll('.scenarios button').forEach((b) => ((b as HTMLButtonElement).onclick = () => { scenario = (b as HTMLElement).dataset.sc as Scenario; t.querySelectorAll('.scenarios button').forEach((o) => o.classList.toggle('active', o === b)); }));
    t.querySelectorAll('.names button').forEach((b) => ((b as HTMLButtonElement).onclick = () => ((t.querySelector('#t-name') as HTMLInputElement).value = (b as HTMLElement).dataset.name!)));
    (t.querySelector('#t-new') as HTMLButtonElement).onclick = () => {
      const name = (t.querySelector('#t-name') as HTMLInputElement).value.trim() || 'Thornwick';
      const seed = Number((t.querySelector('#t-seed') as HTMLInputElement).value) || 1;
      this.host.newGame(seed >>> 0, name, scenario, faction);
      t.classList.add('hidden');
      this.toggleHelp(true);
    };
    (t.querySelector('#t-daily') as HTMLButtonElement).onclick = () => {
      const name = (t.querySelector('#t-name') as HTMLInputElement).value.trim() || 'Thornwick';
      this.host.newGame(0, name, 'daily');
      t.classList.add('hidden');
      this.toggleHelp(true);
    };
    const cont = t.querySelector('#t-continue') as HTMLButtonElement;
    cont.disabled = !this.host.hasSave();
    cont.onclick = () => {
      if (this.host.continueGame()) t.classList.add('hidden');
    };
    const rfile = t.querySelector('#t-rfile') as HTMLInputElement;
    (t.querySelector('#t-replay') as HTMLButtonElement).onclick = () => rfile.click();
    rfile.onchange = () => { if (rfile.files?.[0]) { this.host.watchReplay(rfile.files[0]); t.classList.add('hidden'); } };
    const file = t.querySelector('#t-file') as HTMLInputElement;
    (t.querySelector('#t-import') as HTMLButtonElement).onclick = () => file.click();
    file.onchange = () => {
      if (file.files?.[0]) {
        this.host.importJson(file.files[0]);
        t.classList.add('hidden');
      }
    };
  }

  private sigilTimer = 0;

  showTitle(): void {
    (this.el.title.querySelector('#t-continue') as HTMLButtonElement).disabled = !this.host.hasSave();
    this.el.title.classList.remove('hidden');
    this.animateSigil();
  }

  /** The Charter sigil: a lantern-core over a ley node, drawn in code from the palette. */
  private animateSigil(): void {
    const c = this.el.title.querySelector('#sigil') as HTMLCanvasElement | null;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const draw = (t: number) => {
      if (this.el.title.classList.contains('hidden')) return;
      ctx.clearRect(0, 0, 96, 64);
      ctx.imageSmoothingEnabled = false;
      // ground diamond
      ctx.fillStyle = '#2aa6d8';
      ctx.beginPath(); ctx.moveTo(48, 40); ctx.lineTo(80, 56); ctx.lineTo(48, 64); ctx.lineTo(16, 56); ctx.fill();
      ctx.fillStyle = '#4fe3ff';
      ctx.beginPath(); ctx.moveTo(48, 46); ctx.lineTo(68, 56); ctx.lineTo(48, 62); ctx.lineTo(28, 56); ctx.fill();
      // standing stones
      ctx.fillStyle = '#8a8894';
      for (const [x, y, h] of [[24, 54, 10], [72, 54, 10], [36, 60, 6], [60, 60, 6]] as number[][]) { ctx.fillRect(x - 2, y - h, 4, h); ctx.fillStyle = '#ffd98a'; ctx.fillRect(x - 1, y - h / 2, 2, 2); ctx.fillStyle = '#8a8894'; }
      // spire
      ctx.fillStyle = '#7fd6ea';
      ctx.beginPath(); ctx.moveTo(48, 6); ctx.lineTo(54, 46); ctx.lineTo(48, 52); ctx.lineTo(42, 46); ctx.fill();
      ctx.fillStyle = '#b7f7ff'; ctx.fillRect(47, 8, 2, 40);
      // floating ring
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + t / 900;
        ctx.fillStyle = k % 2 ? '#4fe3ff' : '#ffd98a';
        ctx.fillRect(Math.round(48 + Math.cos(a) * 16) - 1, Math.round(30 + Math.sin(a) * 6) - 1, 3, 3);
      }
      // glow
      const g = ctx.createRadialGradient(48, 8, 0, 48, 8, 22);
      g.addColorStop(0, `rgba(183,247,255,${0.5 + 0.2 * Math.sin(t / 300)})`);
      g.addColorStop(1, 'rgba(183,247,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 96, 40);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(47, 4, 2, 4);
      this.sigilTimer = requestAnimationFrame(draw);
    };
    cancelAnimationFrame(this.sigilTimer);
    this.sigilTimer = requestAnimationFrame(draw);
  }

  private buildMenu(): void {
    this.el.menu.innerHTML = `<div class="box panel" style="width:360px">
      <h2>Menu</h2>
      <div class="row" style="display:flex;flex-direction:column;gap:6px">
        <button id="m-save">Save Charter (browser)</button>
        <button id="m-export">Export Charter as .json</button>
        <button id="m-import">Import Charter from .json</button>
        <button id="m-replay" title="The commands of this charter since it was founded, to watch again or share; a charter loaded from a save cannot be replayed">Export replay</button>
        <button id="m-mute">Sound: on</button>
        <button id="m-music">Music: on</button>
        <button id="m-cb">Colour-blind overlay ramps: off</button>
        <button id="m-scale">UI scale: 100%</button>
        <button id="m-keys">Key bindings…</button>
        <button id="m-dev">Dev tools… <kbd>&#96;</kbd></button>
        <button id="m-title">Back to title (autosaves)</button>
        <button id="m-close">Close</button>
      </div>
      <input type="file" id="m-file" accept=".json" class="hidden">
    </div>`;
    const m = this.el.menu;
    (m.querySelector('#m-save') as HTMLButtonElement).onclick = () => {
      this.host.save();
      this.toggleMenu(false);
      this.toast('<p>Charter saved to this browser.</p>', 2500);
    };
    (m.querySelector('#m-export') as HTMLButtonElement).onclick = () => this.host.exportJson();
    (m.querySelector('#m-replay') as HTMLButtonElement).onclick = () => { const why = this.host.exportReplay(); this.toast(why ? `<p class="warn">${why}</p>` : '<p>Replay exported: watch it from the title screen, or check it with <code>npx tsx scripts/replay.ts</code>.</p>', 5000); };
    const file = m.querySelector('#m-file') as HTMLInputElement;
    (m.querySelector('#m-import') as HTMLButtonElement).onclick = () => file.click();
    file.onchange = () => {
      if (file.files?.[0]) {
        this.host.importJson(file.files[0]);
        this.toggleMenu(false);
      }
    };
    (m.querySelector('#m-mute') as HTMLButtonElement).onclick = () => {
      this.host.setMuted(!this.host.muted);
      (m.querySelector('#m-mute') as HTMLButtonElement).textContent = `Sound: ${this.host.muted ? 'off' : 'on'}`;
    };
    const mu = m.querySelector('#m-music') as HTMLButtonElement;
    mu.textContent = `Music: ${this.host.musicOn ? 'on' : 'off'}`;
    mu.onclick = () => { this.host.setMusic(!this.host.musicOn); mu.textContent = `Music: ${this.host.musicOn ? 'on' : 'off'}`; };
    const cb = m.querySelector('#m-cb') as HTMLButtonElement;
    (m.querySelector('#m-keys') as HTMLButtonElement).onclick = () => this.showKeys();
    (m.querySelector('#m-dev') as HTMLButtonElement).onclick = () => { this.toggleMenu(false); this.toggleDev(true); };
    const sc = m.querySelector('#m-scale') as HTMLButtonElement;
    const syncA11y = () => {
      cb.textContent = `Colour-blind overlay ramps: ${this.host.settings.colorBlind ? 'on' : 'off'}`;
      sc.textContent = `UI scale: ${Math.round(this.host.settings.uiScale * 100)}%`;
    };
    cb.onclick = () => { this.host.setSetting('colorBlind', !this.host.settings.colorBlind); syncA11y(); this.refreshViews(); };
    sc.onclick = () => { const steps = [0.85, 1, 1.15, 1.3]; const i = steps.indexOf(this.host.settings.uiScale); this.host.setSetting('uiScale', steps[(i + 1) % steps.length]); syncA11y(); };
    syncA11y();
    (m.querySelector('#m-title') as HTMLButtonElement).onclick = () => {
      this.host.save();
      this.toggleMenu(false);
      this.showTitle();
    };
    (m.querySelector('#m-close') as HTMLButtonElement).onclick = () => this.toggleMenu(false);
  }

  toggleMenu(show?: boolean): void {
    const s = show ?? this.el.menu.classList.contains('hidden');
    this.el.menu.classList.toggle('hidden', !s);
  }

  toggleBudget(show?: boolean): void {
    const s = show ?? this.el.budget.classList.contains('hidden');
    this.el.budget.classList.toggle('hidden', !s);
    if (s) this.refreshBudget();
  }

  private budgetBuilt = false;

  refreshBudget(): void {
    if (this.el.budget.classList.contains('hidden')) return;
    const st = this.host.state;
    const l = computeLedger(st);
    if (!this.budgetBuilt) {
      const tax = (key: keyof GameState['taxRates'], label: string) => `<div class="tax"><label>${label}</label><input type="range" min="0" max="30" value="${st.taxRates[key]}" data-zone="${key}"><output>${st.taxRates[key]}%</output></div>`;
      this.el.budget.innerHTML = `<div class="box panel">
        <h2>Tithe &amp; Budget</h2>
        <table>
          <tr><td>Hearth tithe</td><td class="r good" data-k="taxHearth"></td></tr>
          <tr><td>Market tithe</td><td class="r good" data-k="taxMarket"></td></tr>
          <tr><td>Craft tithe</td><td class="r good" data-k="taxCraft"></td></tr>
          <tr><td>Arcane tithe</td><td class="r good" data-k="taxArcane"></td></tr>
          <tr><td>Artifacts sold</td><td class="r good" data-k="artifacts"></td></tr>
          <tr><td>Exports (banked on the day)</td><td class="r good" data-k="trade"></td></tr>
          <tr><td>The hunt's goods sold today</td><td class="r good" data-k="hunt"></td></tr>
          <tr><td>Smoked fish sold today</td><td class="r good" data-k="fish"></td></tr>
          <tr><td>The Belerial caravan (every ${CARAVAN_EVERY} days)</td><td class="r good" data-k="caravan"></td></tr>
          <tr><td>Road upkeep</td><td class="r bad" data-k="upkeepRoads"></td></tr>
          <tr><td>Building upkeep</td><td class="r bad" data-k="upkeepBuildings"></td></tr>
          <tr><td>Edicts</td><td class="r bad" data-k="upkeepEdicts"></td></tr>
          <tr><td>Charters (a crown a building)</td><td class="r bad" data-k="upkeepCharters"></td></tr>
          <tr><td>Temple quarter's share of the market tithe</td><td class="r bad" data-k="charterTithe"></td></tr>
          <tr><td>Interest (debt, the Crown's loan)</td><td class="r bad" data-k="interest"></td></tr>
          <tr><td><b>Net per day</b></td><td class="r" data-k="net"></td></tr>
          <tr><td>Treasury</td><td class="r gold" data-k="treasury"></td></tr>
          <tr><td>Grants today</td><td class="r good" data-k="grants"></td></tr>
          <tr><td>The Crown's Thaw levy (next, as the treasury stands)</td><td class="r bad" data-k="levy"></td></tr>
          <tr><td>The Crown's favour</td><td class="r" data-k="favour"></td></tr>
          <tr><td>The Crown's loan</td><td class="r" data-k="loan"></td></tr>
        </table>
        <h3 style="margin-top:10px">Tax rates (10% is what folk expect)</h3>
        ${tax('hearth', 'Hearth')}${tax('market', 'Market')}${tax('craft', 'Craft')}${tax('arcane', 'Arcane')}
        <p class="muted" data-k="social"></p>
        <p class="muted" data-k="history"></p>
        <div class="routes" data-k="routes"></div>
        <div style="text-align:right"><button id="b-close">Close</button></div>
      </div>`;
      this.el.budget.querySelectorAll('input[type=range]').forEach((inp) => {
        (inp as HTMLInputElement).oninput = () => {
          const z = (inp as HTMLInputElement).dataset.zone as keyof GameState['taxRates'];
          this.host.setTax(z, Number((inp as HTMLInputElement).value));
          (inp.nextElementSibling as HTMLOutputElement).textContent = `${(inp as HTMLInputElement).value}%`;
        };
      });
      this.el.budget.querySelector('#b-close')!.addEventListener('click', () => this.toggleBudget(false));
      this.budgetBuilt = true;
    }
    const set = (k: string, v: string) => {
      const el = this.el.budget.querySelector(`[data-k="${k}"]`) as HTMLElement | null;
      if (el) el.textContent = v;
    };
    set('taxHearth', `+${l.taxHearth.toFixed(0)}`);
    set('taxMarket', `+${l.taxMarket.toFixed(0)}`);
    set('taxCraft', `+${l.taxCraft.toFixed(0)}`);
    set('taxArcane', `+${l.taxArcane.toFixed(0)}`);
    set('artifacts', `+${l.artifacts.toFixed(0)}`);
    set('trade', `+${l.trade.toFixed(0)}${st.trade.imported ? ` · imported ${st.trade.imported} for ${Math.round(st.trade.importCost)}` : ''}`);
    set('hunt', st.trade.priceHides !== undefined ? `${st.trade.hidesSold ?? 0} hides at ${st.trade.priceHides} · ${st.trade.meatSold ?? 0} salted meat at ${st.trade.priceMeat} · ${st.trade.trophiesSold ?? 0} trophies at ${st.trade.priceTrophy}` : 'none');
    set('fish', st.trade.priceFish !== undefined ? `${st.trade.fishSold ?? 0} at ${st.trade.priceFish}` : 'none');
    // the caravan pays at its halt, not by the day: the last take and the charter's total (iteration 63)
    {
      const due = caravanDue(st);
      const c = st.stats;
      set('caravan', due === null ? 'halts once a depot stands (from the Village)' : c.caravanCrowns > 0 || c.lastCaravanCrowns > 0 ? `last: +${c.lastCaravanCrowns.toLocaleString()} on day ${c.lastCaravanDay} · this charter: +${c.caravanCrowns.toLocaleString()} · next in ${due} day${due === 1 ? '' : 's'}` : `first halt in ${due} day${due === 1 ? '' : 's'}: ${caravanSurplus(st)} surplus goods at 1.5× price`);
    }
    set('upkeepRoads', `−${l.upkeepRoads.toFixed(0)}`);
    set('upkeepBuildings', `−${l.upkeepBuildings.toFixed(0)}`);
    set('upkeepEdicts', `−${l.upkeepEdicts.toFixed(0)}`);
    set('upkeepCharters', `−${l.upkeepCharters.toFixed(0)}`);
    set('charterTithe', `−${l.charterTithe.toFixed(0)}`);
    set('interest', `−${l.interest.toFixed(0)}`);
    const net = this.el.budget.querySelector('[data-k="net"]') as HTMLElement;
    net.innerHTML = `<b>${l.net >= 0 ? '+' : ''}${l.net.toFixed(0)}</b>`;
    net.className = `r ${l.net >= 0 ? 'good' : 'bad'}`;
    set('treasury', `${Math.round(st.treasury)}`);
    set('grants', `+${Math.round(st.ledger.grants)}`);
    const nextThaw = DAYS_PER_SEASON * 4 - (st.day % (DAYS_PER_SEASON * 4));
    const levy = levyDue(st);
    set('levy', levy > 0 ? `−${levy.toLocaleString()} in ${nextThaw} day${nextThaw === 1 ? '' : 's'}` : `0 (${Math.round(LEVY_RATE * 100)} % above ${LEVY_FLOOR.toLocaleString()}, in ${nextThaw} days)`);
    const favEl = this.el.budget.querySelector('[data-k="favour"]') as HTMLElement;
    const ff = favourFactor(st);
    favEl.textContent = `${Math.round(st.crownFavour)} / 100${ff !== 1 ? ` · sectors and the levy ${ff < 1 ? '−' : '+'}${Math.round(Math.abs(1 - ff) * 100)} %` : ''}${st.crownFavour < FAVOUR_AUDIT ? ' · grants withheld' : ''}`;
    favEl.className = `r ${st.crownFavour < FAVOUR_AUDIT ? 'bad' : st.crownFavour > FAVOUR_NEUTRAL ? 'good' : ''}`;
    favEl.title = `Relics sold to the Crown and the collector paid raise it; a pleading costs 10. Each point from ${FAVOUR_NEUTRAL} is ${FAVOUR_STEP * 100} % on sector prices and the Thaw levy; under ${FAVOUR_AUDIT} the auditors hold the next grant.`;
    const loanEl = this.el.budget.querySelector('[data-k="loan"]') as HTMLElement;
    loanEl.innerHTML = st.loan > 0 ? `${Math.round(st.loan).toLocaleString()} out at ${LOAN_INTEREST * 100} %/day <button class="show" id="b-repay">Repay</button>` : `none <button class="show" id="b-loan">Take ${loanLimit(st).toLocaleString()}</button>`;
    loanEl.className = `r ${st.loan > 0 ? 'warn' : ''}`;
    const loanBtn = loanEl.querySelector('#b-loan') as HTMLButtonElement | null;
    if (loanBtn) loanBtn.onclick = () => { const why = this.host.takeLoan(); if (why) this.toast(`<p class="bad">${why}</p>`, 2500); this.refreshBudget(); this.refresh(); };
    const repayBtn = loanEl.querySelector('#b-repay') as HTMLButtonElement | null;
    if (repayBtn) repayBtn.onclick = () => { const why = this.host.repayLoan(); if (why) this.toast(`<p class="bad">${why}</p>`, 2500); this.refreshBudget(); this.refresh(); };
    set('social', `Unrest ${Math.round(st.unrest * 100)}% cuts yields. Happiness ${Math.round(st.happiness)}. Health ${Math.round(st.health * 100)}%. Educated ${Math.round(st.educated * 100)}%. Unquieted dead: ${Math.round(st.unquieted)}. Dead today ${st.deathsToday} · quieted ${Math.round(st.quietedToday)} / capacity ${Math.round(st.quietCap)} · waiting ${Math.round(st.waitingDead)}.${idleScholars(st) ? ' Idle scholars: more than half the city is schooled with little Arcane work, +5 unrest.' : ''}${st.unrestHigh > 0 ? ` Unrest above half for ${st.unrestHigh} day${st.unrestHigh === 1 ? '' : 's'} (a riot at 5).` : ''}${st.stats.goodsStolen > 0 ? ` Stolen from unwatched shelves: ${Math.round(st.stats.goodsStolen)} goods.` : ''}`);
    set('history', `Last 10 days net, exports included: ${st.ledgerHistory.slice(-10).map((v) => (v >= 0 ? '+' : '') + v).join(', ') || 'n/a'}. The Charter is revoked after ${DEBT_DAYS} days under ${debtLine(st).toLocaleString()} crowns; debt pays 1 % a day.`);
    const routes = tradeRoutes(st);
    const rEl = this.el.budget.querySelector('[data-k="routes"]') as HTMLElement;
    rEl.innerHTML = routes.length ? `<h3 style="margin-top:10px">Trade routes</h3>${routes.map((r) => `<div class="route ${r.open ? '' : 'muted'}"><span class="${r.open ? 'good' : 'warn'}">${r.open ? '●' : '○'}</span> <b>${r.name}</b> <span class="muted">${r.note}</span> <button class="show" data-x="${r.at.x}" data-y="${r.at.y}">Show</button></div>`).join('')}` : '<p class="muted">No trade routes yet: a Trade Depot opens the Gloam road; two quays, two lit arches, a Sky-Dock or a daughter wardlight open more.</p>';
    rEl.querySelectorAll('button[data-x]').forEach((b) => { (b as HTMLButtonElement).onclick = () => { this.host.centerOn(Number((b as HTMLElement).dataset.x), Number((b as HTMLElement).dataset.y)); this.toggleBudget(false); }; });
    // sync sliders if taxes changed elsewhere (load)
    this.el.budget.querySelectorAll('input[type=range]').forEach((inp) => {
      const z = (inp as HTMLInputElement).dataset.zone as keyof GameState['taxRates'];
      if (document.activeElement !== inp && Number((inp as HTMLInputElement).value) !== st.taxRates[z]) {
        (inp as HTMLInputElement).value = String(st.taxRates[z]);
        (inp.nextElementSibling as HTMLOutputElement).textContent = `${st.taxRates[z]}%`;
      }
    });
  }

  /** Key bindings: click a row, press a key. */
  private showKeys(): void {
    const m = this.el.menu;
    const keys = { ...this.host.settings.keys };
    let refused = '';
    let lastRow: KeyAction | null = null;
    const render = (waiting: KeyAction | null) => {
      m.innerHTML = `<div class="box panel" style="width:380px">
        <h2>Key bindings</h2>
        <p class="muted">Click an action, then press the key for it. Ctrl+Z undo, Shift+G grid and the view keys 1–0 are fixed.</p>
        ${KEY_ACTIONS.map((a) => `<button class="keyrow ${waiting === a.id ? 'waiting' : ''}" data-k="${a.id}" aria-label="${a.name}: ${waiting === a.id ? 'press a key' : keyLabel(keys[a.id]) || 'unbound'}"><span>${a.name}</span><kbd>${waiting === a.id ? 'press a key…' : keyLabel(keys[a.id])}</kbd></button>`).join('')}
        ${refused ? `<p class="bad">${refused}</p>` : ''}
        <div class="row"><button id="k-reset">Reset to defaults</button><button id="k-done">Done</button></div>
      </div>`;
      m.querySelectorAll('.keyrow').forEach((r) => ((r as HTMLElement).onclick = () => { lastRow = (r as HTMLElement).dataset.k as KeyAction; render(lastRow); }));
      // the rows are rebuilt: the keyboard stays on the row being bound (iteration 66)
      if (lastRow) (m.querySelector(`[data-k="${lastRow}"]`) as HTMLElement | null)?.focus();
      (m.querySelector('#k-reset') as HTMLButtonElement).onclick = () => { for (const a of KEY_ACTIONS) keys[a.id] = DEFAULT_KEYS_LOCAL[a.id]; render(null); };
      (m.querySelector('#k-done') as HTMLButtonElement).onclick = () => { this.host.setSetting('keys', keys); window.removeEventListener('keydown', onKey, true); this.buildMenu(); this.toggleMenu(false); };
    };
    let waitingFor: KeyAction | null = null;
    const onKey = (e: KeyboardEvent) => {
      const row = m.querySelector('.keyrow.waiting') as HTMLElement | null;
      if (!row) return;
      e.preventDefault();
      e.stopPropagation();
      const k = e.key.toLowerCase();
      const id = row.dataset.k as KeyAction;
      // Tab and F6 move focus and Escape closes: they cannot be bound (iteration 66)
      if (UNBINDABLE.includes(k) || k === 'escape') { refused = k === 'escape' ? '' : `${keyLabel(k)} moves the keyboard focus and cannot be bound.`; render(null); return; }
      refused = '';
      for (const a of KEY_ACTIONS) if (keys[a.id] === k && a.id !== id) keys[a.id] = '';
      keys[id] = k;
      waitingFor = null;
      render(waitingFor);
    };
    window.addEventListener('keydown', onKey, true);
    render(null);
  }

  toggleWyrms(show?: boolean): void {
    const el = this.el.wyrms;
    const sh = show ?? el.classList.contains('hidden');
    el.classList.toggle('hidden', !sh);
    if (sh) this.refreshWyrms();
  }

  refreshWyrms(): void {
    const st = this.host.state;
    if (this.el.wyrms.classList.contains('hidden')) return;
    const cradles = st.buildings.filter((b) => b && isCradle(b.kind)) as NonNullable<typeof st.buildings[number]>[];
    const slots = cradles.reduce((n, c) => n + cradleCapacity(c), 0);
    const mines = st.buildings.filter((b) => b && b.kind === 'mine') as NonNullable<typeof st.buildings[number]>[];
    const districts = districtsInUse(st);
    const seats = lodgeSeats(st);
    const champ = ringChampion(st);
    const rows = st.dragons.map((d) => {
      const stageMax = STAGE_DAYS[d.stage];
      const pct = d.stage >= stageCap(d) ? 100 : Math.min(100, Math.round((d.days / stageMax) * 100));
      const hasRing = st.buildings.some((b) => b && b.kind === 'ring');
      const cradle = st.buildings.find((b) => b && b.id === d.cradleId) ?? null;
      const seat = seats.get(d.id) ?? null;
      const bits: string[] = [];
      if (d.stage === 0) bits.push(d.lined ? 'nest lined with eggshell: hatches a quarter faster' : `<button data-line="${d.id}" ${st.materials.eggshell >= 1 ? '' : 'disabled'} title="One eggshell: the egg warms a quarter faster">Line the nest (1 eggshell)</button>`);
      if (d.stage >= 1) bits.push(seat ? `seat at the lodge (${seat.x},${seat.y})` : `<span class="bad">no lodge seat${d.stage === 1 ? ': it will not grow' : ': grows at half pace' + (d.training === 'hard' ? ', scorches thrice as often' : '')}</span>`);
      if (d.voyage !== undefined) bits.push(`<b>away on the Sky-Dock's run</b>, back on day ${d.voyage}`);
      if (d.role === 'mount') bits.push(`a Watch rider on its back: flies to the restless and to fires anywhere on the map (${st.stats.mountRescues} rescues by mounts)`);
      if (d.stage >= 1 && cradle) {
        const mk = feedingMarkets(st, d, cradle);
        bits.push(d.role === 'warden' && d.roleTarget > 0 ? `eats ${eats(d)} a day from the ${mk.length} market${mk.length === 1 ? '' : 's'} of its district` : `eats ${eats(d)} a day from ${mk.length} market${mk.length === 1 ? '' : 's'} within ${FEED_REACH} of its cradle`);
        if (d.hungry > 0) bits.push(`<span class="bad">hungry ${d.hungry} day${d.hungry === 1 ? '' : 's'}${d.stage >= 2 ? ` (a stage lost at ${REGRESS_AFTER})` : ''}</span>`);
      }
      if (swimsBarges(d)) { const q = tideMooring(st, d); bits.push(q ? `swims a barge a day from the quay at (${q.x},${q.y})` : `no mooring within ${TIDE_REACH} of its cradle to swim a barge from`); }
      if (d.role === 'courier') bits.push(d.lastTrip ? `last trip: ${d.lastTrip.goods} goods from (${d.lastTrip.fx},${d.lastTrip.fy}) to (${d.lastTrip.tx},${d.lastTrip.ty}) on day ${d.lastTrip.day}` : 'no trip yet');
      if (d.role === 'champion' && d.stage >= 2) { const o = boutOdds(st, d, nextBoutDay(st)); bits.push(`<b>odds ${Math.round(o.chance * 100)} %</b> at the bout on day ${nextBoutDay(st)}${champ && champ.id !== d.id ? ` (${champ.name} fights first)` : ''}`); }
      const roleSel = d.stage >= 2
        ? `<select data-role="${d.id}"><option value="none" ${d.role === 'none' ? 'selected' : ''}>No role</option>${d.stage >= 3 ? `<option value="courier:-1" ${d.role === 'courier' ? 'selected' : ''}>Courier (flies goods to empty markets)</option>` : ''}${hasRing ? `<option value="champion:-1" ${d.role === 'champion' ? 'selected' : ''}>Champion of the Wyrm-Ring</option>` : ''}${st.buildings.some((b) => b && b.kind === 'wyrmcourt' && b.state === 'ok') ? `<option value="mount:-1" ${d.role === 'mount' ? 'selected' : ''}>Mount: a Watch rider across the map</option>` : ''}${districts.map((k) => `<option value="warden:${k}" ${d.role === 'warden' && d.roleTarget === k ? 'selected' : ''}>Warden of ${(st.districtNames[k] || DISTRICT_NAMES[k - 1])}</option>`).join('')}${mines.map((m) => `<option value="delver:${m.id}" ${d.role === 'delver' && d.roleTarget === m.id ? 'selected' : ''}>Delver at mine (${m.x},${m.y})</option>`).join('')}</select>`
        : `<span class="muted">${d.stage === 0 ? 'in the egg' : 'too young for a role'}</span>`;
      return `<div class="dragon">
        <div><b>${d.name}</b> <span class="muted">the ${d.second ? `${LINE_INFO[d.line].name}-${LINE_INFO[d.second].name} ${d.trueblood ? 'trueblood' : 'crossed'}` : LINE_INFO[d.line].name} ${STAGE_NAMES[d.stage]}</span> · mood <span class="${d.mood < 30 ? 'bad' : d.mood > 60 ? 'good' : ''}">${Math.round(d.mood)}</span>${d.hungry >= 2 ? ' <span class="bad">hungry</span>' : ''}</div>
        <div class="muted">${LINE_INFO[d.line].desc}. ${d.stage >= 2 && (d.role === 'none' || d.role === 'warden') ? `<span class="good">Aura: ${AURA_INFO[d.line]}${d.second ? `; and, fainter, ${AURA_INFO[d.second]}` : ''}.</span> ` : ''}${(() => { const c = st.buildings.find((b) => b && b.id === d.cradleId); return c && aspectAt(st, c.x, c.y) === d.line ? '<span class="good">Attuned to its node.</span> ' : ''; })()}${d.stage >= stageCap(d) ? (d.stage >= 4 ? 'A great wyrm: auras half again as wide, the Gloam shrinks from it.' : d.stage >= 3 ? 'A grown wyvern.' : 'Grown as far as its line allows on the ground.') : `Growth ${pct}% toward ${STAGE_NAMES[d.stage + 1]}${d.trueblood && d.stage === 3 ? ' (a trueblood may become a great wyrm)' : ''}.`}</div>
        ${bits.length ? `<div class="muted">${bits.join(' · ')}</div>` : ''}
        <div class="drow">Training: <select data-train="${d.id}"><option value="gentle" ${d.training === 'gentle' ? 'selected' : ''}>gentle (slow, safe)</option><option value="hard" ${d.training === 'hard' ? 'selected' : ''}>hard (fast, mishaps)</option><option value="wild" ${d.training === 'wild' ? 'selected' : ''}>wild (fastest, may leave)</option></select> Role: ${roleSel}</div>
      </div>`;
    });
    const m = st.materials;
    const great = cradles.filter((c) => isGreatCradle(c)).length;
    const forges = st.buildings.filter((b) => b && b.kind === 'wyrmforge' && b.state === 'ok' && b.lit).length;
    const departed = st.departed.filter((e) => !e.returned);
    this.el.wyrms.innerHTML = `<div class="box panel">
      <h2>Wyrmcraft</h2>
      <p class="muted">Cradles: ${cradles.length} (${st.dragons.length} / ${slots} nests${great ? `, ${great} Great` : ''}). Eggs come from events: a warm seam in a mine, a quiet boneyard with an Ossuary, an old Moth-Loft, poachers. A cradle needs ley within 6 tiles and 8 mana a day (a Great Cradle, raised from its panel at ${this.ms()[GREAT_CRADLE_MILESTONE].name}, has four nests for 4 more); each Tamer's Lodge within ${LODGE_REACH} seats ${LODGE_SEATS}; dragons eat from markets within ${FEED_REACH} of the cradle (a warden from its district), and ${REGRESS_AFTER} unfed days cost a stage. A dragon that leaves comes back after a season to ask a tribute.</p>
      <p class="muted">Ring: ${st.stats.boutsWon} won, ${st.stats.boutsLost} lost${champ ? `; ${champ.name} fights next on day ${nextBoutDay(st)} at ${Math.round(boutOdds(st, champ, nextBoutDay(st)).chance * 100)} %` : ''}. Materials: scale ${m.scale.toFixed(1)}${scaleMailOn(st) ? ' <span class="good">(Scale-Mail: unrest −5 %, 0.05 a day)</span>' : ''} · wyrmfire ${m.wyrmfire.toFixed(1)} <label title="Burns ${WYRMFIRE_BURN} a day while there is any"><input type="checkbox" id="w-burn" ${st.burnWyrmfire ? 'checked' : ''}> burn it for Craft +15 %</label>${forges ? ` (${forges} Forge${forges === 1 ? '' : 's'} burn${forges === 1 ? 's' : ''} ${FORGE_BURN} a day${forgeHot(st) ? '' : ': <span class="bad">cold</span>'})` : ''} · eggshell ${m.eggshell.toFixed(1)} (lines a nest; the Font costs 3) · rayscale ${m.rayscale.toFixed(1)} · glim-dust ${m.glimdust.toFixed(1)} (the Land tab scatters it on a dark lane for a season) <span class="muted">(the Marvels tab spends them; the caravan buys the share you set)</span></p>
      ${departed.length ? `<p class="warn">Departed: ${departed.map((e) => `${e.name} the ${LINE_INFO[e.line].name} ${STAGE_NAMES[e.stage]} (left day ${e.day}; returns from day ${e.day + 30})`).join('; ')}.</p>` : ''}
      <p class="muted">The Gloam is <b>${pressureWord(st.gloamPressure)}</b> (${Math.round(st.gloamPressure * 100)}%): the dead, the restless, overdraw and wild beasts press it; faith, the wyrm, the Tree and Grey ley hold it back.</p>
      <p class="muted">Beasts: ${describeBeasts(st)}</p>
      ${st.wyrm.state !== 'none' ? `<div class="wyrmrow"><b>The Vein-Wyrm</b> <span class="muted">at (${wyrmNode(st)!.x},${wyrmNode(st)!.y})</span><div class="${st.wyrm.state === 'bound' && st.wyrm.sulking === 0 ? 'good' : st.wyrm.state === 'awake' || st.wyrm.sulking > 0 ? 'warn' : 'muted'}">${describeWyrm(st)}</div><button id="w-goto">Show me</button></div>` : ''}
      ${rows.length ? rows.join('') : '<p class="flavor">No dragons yet. Build a Wyrm-Cradle and wait for the Veins to offer an egg.</p>'}
      <div style="text-align:right"><button id="w-close">Close</button></div>
    </div>`;
    const burn = this.el.wyrms.querySelector('#w-burn') as HTMLInputElement | null;
    if (burn) burn.onchange = () => { this.host.setBurnWyrmfire(burn.checked); this.refreshWyrms(); };
    this.el.wyrms.querySelectorAll('button[data-line]').forEach((btn) => {
      (btn as HTMLButtonElement).onclick = () => { const why = this.host.lineNest(Number((btn as HTMLElement).dataset.line)); if (why) this.toast(`<p class="bad">${why}</p>`, 2000); this.refreshWyrms(); };
    });
    this.el.wyrms.querySelectorAll('select[data-train]').forEach((sel) => {
      (sel as HTMLSelectElement).onchange = () => this.host.setTraining(Number((sel as HTMLElement).dataset.train), (sel as HTMLSelectElement).value as Training);
    });
    this.el.wyrms.querySelectorAll('select[data-role]').forEach((sel) => {
      (sel as HTMLSelectElement).onchange = () => {
        const v = (sel as HTMLSelectElement).value;
        const [role, target] = v.split(':');
        const why = this.host.setRole(Number((sel as HTMLElement).dataset.role), role as DragonRole, Number(target ?? -1));
        if (why) this.toast(`<p class="bad">${why}</p>`, 2000);
        this.refreshWyrms();
      };
    });
    this.el.wyrms.querySelector('#w-close')!.addEventListener('click', () => this.toggleWyrms(false));
    const gt = this.el.wyrms.querySelector('#w-goto') as HTMLButtonElement | null;
    if (gt) gt.onclick = () => { const n = wyrmNode(st); if (n) this.host.centerOn(n.x, n.y); this.toggleWyrms(false); };
  }

  toggleEdicts(show?: boolean): void {
    const el = this.el.edicts;
    const s = show ?? el.classList.contains('hidden');
    el.classList.toggle('hidden', !s);
    if (s) this.refreshEdicts();
  }

  edictScope = 0; // 0 = city, else district id

  refreshEdicts(): void {
    const st = this.host.state;
    const inUse = districtsInUse(st);
    if (this.edictScope && !inUse.includes(this.edictScope)) this.edictScope = 0;
    const scopeSel = `<select id="e-scope"><option value="0">City-wide</option>${inUse.map((d) => `<option value="${d}" ${d === this.edictScope ? 'selected' : ''}>${districtName(st, d)}</option>`).join('')}</select>`;
    let stats = '';
    if (this.edictScope) {
      const d = this.edictScope;
      let pop = 0, jobs = 0, happy = 0, hw = 0, tiles = 0, bld = 0, income = 0;
      for (let i = 0; i < st.district.length; i++) if (st.district[i] === d) tiles++;
      const l = computeLedger(st);
      void l;
      for (const b of st.buildings) {
        if (!b || st.district[idx(b.x, b.y)] !== d) continue;
        bld++;
        const def = BUILDING_BY_KEY[b.kind];
        if (def.category !== 'zone' || b.state !== 'ok') continue;
        if (def.zone === Zone.Hearth) pop += b.residents; else jobs += b.workers;
        const w = Math.max(1, def.zone === Zone.Hearth ? b.residents : b.workers);
        happy += b.happiness * w; hw += w;
        const occ = def.zone === Zone.Hearth ? b.residents : b.workers;
        income += occ * (def.tax ?? 0) * (1 + (b.level - 1) * 0.35) * (0.6 + (b.happiness / 100) * 0.6);
      }
      const cur = st.districtQuarters[d];
      const held = charterHeld(st, d);
      const quarters = `<div class="quarters"><span class="muted">Charter:</span> ${QUARTERS.map((q) => { const lock = charterLocked(st, q.id) ?? (cur !== q.id ? held : null); return `<button data-quarter="${q.id}" class="${cur === q.id ? 'active' : ''}${lock ? ' locked' : ''}" ${lock ? 'disabled' : ''} title="${lock ? `${lock}. ` : ''}${q.effect} ${q.cost}">${q.name}${lock ? ` <span class="muted">(${lock.toLowerCase()})</span>` : ''}</button>`; }).join(' ')} <button data-quarter="" class="${cur ? '' : 'active'}" ${held ? 'disabled' : ''} title="${held ? `${held}. ` : ''}No charter: the district is only a scope for edicts.">None</button>${cur ? `<div class="muted">${QUARTER_BY_ID[cur].effect} ${QUARTER_BY_ID[cur].cost} The Crown takes ${charterCostOf(st, d)} crown${charterCostOf(st, d) === 1 ? '' : 's'} a day for it (one a building)${held ? `; ${held.toLowerCase()}` : `; it may be changed (a charter holds ${CHARTER_LOCK_DAYS} days once given)`}.</div><div class="flavor">${QUARTER_BY_ID[cur].flavor}</div>` : `<div class="muted">A charter gives every building in the district a gift and a price: a crown a building a day, and it holds ${CHARTER_LOCK_DAYS} days once given. Pick one.</div>`}</div>`;
      stats = `<div class="dstats"><input type="text" id="e-rename" value="${districtName(st, d)}" maxlength="18" title="Rename district"> <span class="muted">${tiles} tiles · ${bld} buildings · ${pop} folk · ${jobs} jobs · happiness ${hw ? Math.round(happy / hw) : '–'} · ~${Math.round(income)} c/day tithe</span></div>${quarters}`;
    }
    const rows = edictsFor(st).filter((e) => !this.edictScope || !e.cityOnly).map((e) => {
      const locked = st.milestone < e.unlock;
      const on = this.edictScope ? !!st.districtEdicts[`${this.edictScope}:${e.key}`] : !!st.edicts[e.key];
      const cityOn = this.edictScope ? !!st.edicts[e.key] : false;
      const hold = on ? edictLocked(st, e.key, this.edictScope) : null;
      const run = on ? (hold ? `runs ${hold.match(/\d+/)![0]} more day${hold.startsWith('Runs 1 ') ? '' : 's'}` : `repeal ${EDICT_REPEAL} c`) : '';
      return `<div class="edict ${locked ? 'locked' : ''}">
        <label><input type="checkbox" data-key="${e.key}" ${on || cityOn ? 'checked' : ''} ${locked || cityOn ? 'disabled' : ''}> <b>${e.name}</b> <span class="muted">(${e.costPerDay(st)} c/day${this.edictScope ? ', scaled to the district' : ''}${run ? `, ${run}` : ''})</span>${cityOn ? ' <span class="muted">city-wide</span>' : ''}</label>
        <div class="muted">${e.desc}${e.key === 'scalemail' ? ` <span class="${st.materials.scale > 0 ? 'good' : 'warn'}">${st.materials.scale > 0 ? `${st.materials.scale.toFixed(1)} scale in the vault.` : 'Idle: no scale in the vault.'}</span>` : ''}${locked ? ` <span class="warn">Unlocks at ${this.ms()[e.unlock].name}.</span>` : ''}</div>
        <div class="flavor">${e.flavor}</div>
      </div>`;
    });
    const mods = st.modifiers.filter((m) => m.until > st.day).map((m) => `<li>${m.label} (${m.until - st.day} days left)</li>`).join('');
    this.el.edicts.innerHTML = `<div class="box panel">
      <h2>Edicts of the Warden-Reeve</h2>
      <p class="muted">Edicts take effect immediately and cost their upkeep every day; an edict holds ${EDICT_MIN_DAYS} days once made and costs ${EDICT_REPEAL} crowns to repeal. Scope: ${scopeSel}${inUse.length ? '' : ' <span class="muted">(paint districts from the toolbar to set edicts per district)</span>'}</p>
      ${stats}
      ${rows.join('')}
      ${this.councilHtml(st)}
      ${mods ? `<h3 style="margin-top:8px">Active effects</h3><ul class="muted">${mods}</ul>` : ''}
      <div style="text-align:right"><button id="e-close">Close</button></div>
    </div>`;
    this.el.edicts.querySelectorAll('input[type=checkbox]').forEach((inp) => {
      (inp as HTMLInputElement).onchange = () => {
        const why = this.host.setEdict((inp as HTMLInputElement).dataset.key!, (inp as HTMLInputElement).checked, this.edictScope);
        if (why) this.toast(`<p class="bad">${why}</p>`, 2500);
        this.refreshEdicts();
      };
    });
    const ren = this.el.edicts.querySelector('#e-rename') as HTMLInputElement | null;
    if (ren) ren.onchange = () => { this.host.renameDistrict(this.edictScope, ren.value); this.refreshEdicts(); };
    (this.el.edicts.querySelector('#e-scope') as HTMLSelectElement).onchange = (ev) => {
      this.edictScope = Number((ev.target as HTMLSelectElement).value);
      this.refreshEdicts();
    };
    this.el.edicts.querySelector('#e-close')!.addEventListener('click', () => this.toggleEdicts(false));
    this.el.edicts.querySelectorAll('button[data-quarter]').forEach((b) => { (b as HTMLButtonElement).onclick = () => { const why = this.host.setQuarter(this.edictScope, ((b as HTMLElement).dataset.quarter || null) as QuarterId | null); if (why) this.toast(`<p class="bad">${why}</p>`, 2500); this.refreshEdicts(); this.refresh(); }; });
    this.el.edicts.querySelectorAll('button[data-charter]').forEach((b) => { (b as HTMLButtonElement).onclick = () => { const why = this.host.charterGuilds((b as HTMLElement).dataset.charter as GuildId); if (why) this.toast(`<p class="bad">${why}</p>`, 2500); this.refreshEdicts(); }; });
  }

  /** The guild council block: standings, moods, today's drivers and the open petition. */
  private councilHtml(st: GameState): string {
    const council = hasCouncil(st);
    const g = st.guilds;
    const rows = GUILD_IDS.map((id) => {
      const d = GUILDS[id];
      const v = Math.round(g.standing[id]);
      const eff = guildEffect(st, id);
      const drivers = council ? guildDrivers(st, id).map((x) => `${x.value > 0 ? '+' : ''}${x.value.toFixed(1)} ${x.text}`).join(', ') : '';
      const hall = st.buildings.some((b) => b && b.kind === HALL_OF[id] && b.state === 'ok');
      const hallText = hall ? `${BUILDING_BY_KEY[HALL_OF[id]].name} stands${eff < 0 ? ' (locked by the strike)' : ''}.` : eff > 0 ? `Pleased ${g.pleasedDays[id]} of ${HALL_DAYS} days toward raising ${BUILDING_BY_KEY[HALL_OF[id]].name}.` : '';
      return `<div class="guild"><div><b>${d.name}</b> <span class="${eff > 0 ? 'good' : eff < 0 ? 'bad' : 'muted'}">${guildMood(v)}</span> <span class="muted">(${v})</span><div class="bar"><span style="width:${v}%"></span></div></div>
        <div class="muted">${d.desc} Pleased at ${BOON_AT}: ${d.boon}. Striking under ${STRIKE_AT}: ${d.strike}. Rival: ${GUILDS[RIVAL_OF[id]].name}${isChartered(st, id) ? ' (chartered: no grudge)' : ''}. ${hallText}${drivers ? ` <i>Today: ${drivers}.</i>` : ''}</div></div>`;
    }).join('');
    const dm = g.demand;
    const demand = dm && dm.until > st.day ? `<p class="muted">Granted petition: keep <b>${EDICT_BY_KEY[GUILDS[dm.guild].edict]?.name}</b> on for ${GUILDS[dm.guild].name} (${dm.until - st.day} days left; turning it off costs 2 standing a day).</p>` : '';
    const charters = council ? (['carters', 'alchemists'] as GuildId[]).filter((p) => !st.guilds.charters.includes(p)).map((p) => `<button class="show" data-charter="${p}" ${st.treasury < CHARTER_COST ? 'disabled' : ''}>Charter ${GUILDS[p].name.replace('The ', 'the ')} and ${GUILDS[RIVAL_OF[p]].name.replace('The ', 'the ')} (${CHARTER_COST} crowns)</button>`).join(' ') : '';
    return `<h3 style="margin-top:8px">The guild council</h3>
      <p class="muted">${council ? `The four guilds sit at the Guildhall. Every ${COUNCIL_SPACING} days the least pleased of them petitions for an edict. ${st.stats.councils} petition${st.stats.councils === 1 ? '' : 's'} heard.` : 'No lit Guildhall: the guilds have no seat and no voice. Build one (Leisure tab) to hear petitions and earn their boons.'}</p>
      ${demand}${rows}${charters ? `<p class="muted">A charter ends a rivalry for good: both guilds +10, no more drag, sting or brawls. ${charters}</p>` : ''}`;
  }

  /** Dev tools: grouped commands with a live status line. */
  toggleDev(show?: boolean): void {
    const el = this.el.dev;
    const sh = show ?? el.classList.contains('hidden');
    el.classList.toggle('hidden', !sh);
    if (sh) this.renderDev('');
  }

  private renderDev(last: string): void {
    const s = this.host.state;
    const el = this.el.dev;
    const stand = GUILD_IDS.map((g) => `${GUILDS[g].name.replace('The ', '').split(' ')[0]} ${Math.round(s.guilds.standing[g])}`).join(' · ');
    const status = `Day ${s.day} tick ${s.tick} · ${s.population} folk · ${Math.round(s.treasury)} crowns · mana ${Math.round(s.manaSupply)}/${Math.round(s.manaDemand)} · pressure ${Math.round(s.gloamPressure * 100)}% · ${sites(s).length} sites, ${s.agents.filter((a) => a.kind === 4).length} builders · ${s.dragons.length} dragons · ${stand} · relics ${s.relics.complete.length}/4 · instant build ${construction.instant ? 'on' : 'off'} · dev uses ${s.stats.devUses}`;
    // an argument is a list or a number (iteration 55); a second one rides beside the first and both go as `first:second`
    const input = (a: DevArg | undefined, id: string, attr: string) => !a ? '' : a.kind === 'select' ? `<select ${attr}="${id}">${devOptions(a, s).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>` : `<input type="number" ${attr}="${id}" min="${a.min}" max="${a.max}" value="${devNumber(a, s)}">`;
    const groups = DEV_GROUPS.map((g) => `<h3>${g}</h3><div class="devgrid">${DEV_COMMANDS.filter((c) => c.group === g).map((c) => `<div class="devcmd"><button data-id="${c.id}" title="${c.desc}">${c.name}</button>${input(c.arg, c.id, 'data-arg')}${input(c.arg2, c.id, 'data-arg2')}</div>`).join('')}</div>`).join('');
    el.innerHTML = `<div class="box panel" style="width:760px">
      <h2>Dev tools <span class="muted" style="font-size:12px">for playtesting; every use is counted and marks the daily result</span></h2>
      <p class="muted devstatus">${status}</p>
      ${last ? `<p class="good">${last}</p>` : ''}
      ${groups}
      <div class="row"><button id="dev-dump">Copy state summary</button><button id="dev-close">Close</button></div>
    </div>`;
    el.querySelectorAll('button[data-id]').forEach((b) => { (b as HTMLButtonElement).onclick = () => { const id = (b as HTMLElement).dataset.id!; const sel = el.querySelector(`[data-arg="${id}"]`) as HTMLInputElement | HTMLSelectElement | null; const sel2 = el.querySelector(`[data-arg2="${id}"]`) as HTMLInputElement | HTMLSelectElement | null; const out = this.host.dev(id, sel2 ? `${sel ? sel.value : ''}:${sel2.value}` : sel ? sel.value : ''); this.renderDev(`${(b as HTMLElement).textContent}: ${out}`); }; });
    (el.querySelector('#dev-dump') as HTMLButtonElement).onclick = () => { const line = `${s.cityName} seed ${s.seed} day ${s.day}: ${status}`; try { void navigator.clipboard.writeText(line); this.toast('<p>Summary copied.</p>', 1500); } catch { this.toast(`<p>${line}</p>`, 5000); } };
    (el.querySelector('#dev-close') as HTMLButtonElement).onclick = () => this.toggleDev(false);
  }

  private ms() { return milestonesOf(this.host.state); }

  private eventShownId: string | null = null;

  refreshEvent(): void {
    const pe = this.host.state.pendingEvent;
    const el = this.el.event;
    if (!pe) {
      el.classList.add('hidden');
      this.eventShownId = null;
      return;
    }
    if (this.eventShownId === pe.id && !el.classList.contains('hidden')) return;
    this.eventShownId = pe.id;
    el.innerHTML = `<div class="box panel" style="border-color:var(--gold)">
      <h2>${pe.title}</h2>
      <p>${pe.text}</p>
      <div class="choices">${pe.choices.map((c, i) => `${c.slider ? `<div class="tax" style="margin:4px 0 0"><label>${c.slider.label}</label><input type="range" min="0" max="${c.slider.max}" value="${c.slider.max}" data-slider="${i}"><output>${c.slider.max} %</output></div>` : ''}<button data-i="${i}"><b>${c.label}</b><br><span class="muted">${c.desc}</span></button>`).join('')}</div>
    </div>`;
    el.classList.remove('hidden');
    el.querySelectorAll('input[data-slider]').forEach((inp) => { (inp as HTMLInputElement).oninput = () => { (inp.nextElementSibling as HTMLOutputElement).textContent = `${(inp as HTMLInputElement).value} %`; }; });
    el.querySelectorAll('button').forEach((b) => (b.onclick = () => { const i = Number((b as HTMLElement).dataset.i); const sl = el.querySelector(`input[data-slider="${i}"]`) as HTMLInputElement | null; this.host.resolveEvent(i, sl ? Number(sl.value) : undefined); }));
  }

  showGameOver(): void {
    const s = this.host.state;
    if (!this.el.gameover.classList.contains('hidden')) return;
    // every loss names its cause (iteration 70): a title, and the numbers that brought it
    const title = { wyrm: 'The valley belongs to the wyrm', hounds: 'The Long Night comes early', restless: 'The Long Night', gloam: 'The Gloam takes the node', crown: 'The Charter is revoked' }[s.lostTo ?? 'gloam'] ?? 'The light goes out';
    const cause = s.lostTo === 'wyrm' ? `Refusals in a row: ${s.wyrm.starved} (tributes paid over the charter: ${s.stats.wyrmTributes}). The Founding Stake burned on day ${s.day}.`
      : s.lostTo === 'hounds' ? `Districts emptied this Hush: ${s.hush.emptied.map((u) => unitName(s, u)).join(', ')}. Homes fled from the hounds over the charter: ${s.stats.houndFled}.`
      : s.lostTo === 'restless' ? `The restless walking: ${s.agents.filter((a) => a.kind === 2).length}.` : '';
    this.el.gameover.innerHTML = `<div class="box panel">
      <h2>${title}</h2>
      <p>${s.gameOver}</p>${cause ? `\n      <p>${cause}</p>` : ''}
      <p class="muted">${s.cityName} reached ${this.ms()[s.milestone].name} with a peak of ${s.stats.peakPopulation} folk over ${s.day} days. Fires: ${s.stats.firesTotal}. Surges: ${s.stats.surgesTotal}. Restless risen: ${s.stats.restlessTotal}.</p>
      <div style="text-align:right"><button id="go-title">Found another wardlight</button></div>
    </div>`;
    this.el.gameover.classList.remove('hidden');
    this.el.gameover.querySelector('#go-title')!.addEventListener('click', () => {
      this.el.gameover.classList.add('hidden');
      this.showTitle();
    });
  }
}

/** The three largest terms each way, for a panel's why-line. */
function whyLine(terms: Term[]): string {
  const t = terms.filter((x) => x.label !== 'base');
  const plus = t.filter((x) => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 3);
  const minus = t.filter((x) => x.v < 0).sort((a, b) => a.v - b.v).slice(0, 3);
  const f = (x: Term) => `${x.v > 0 ? '+' : ''}${Math.round(x.v)} ${x.label}`;
  return `${plus.map(f).join(' · ') || 'nothing for it'}${minus.length ? ` <span class="warn">| ${minus.map(f).join(' · ')}</span>` : ''}`;
}
function row(k: string, v: string): string {
  return `<div class="row"><span class="muted">${k}</span><span>${v}</span></div>`;
}

export { ROAD_BY_TYPE, RoadType };
