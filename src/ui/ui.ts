import { FACTIONS, buildsFor, canBuild, factionKey, factionOf, milestonesOf, type FactionId } from '../data/factions';
/** DOM UI: top bar, toolbar, info views, demand, log, building info, modals. */
import { BUILDINGS, BUILDING_BY_KEY, ROADS, ROAD_BY_TYPE, GATE_COST, GATE_UNLOCK, WALL_COST, WALL_MANA, WALL_UNLOCK, WALL_UPKEEP, isRoadUnlocked, isZoneUnlocked, type BuildingDef } from '../sim/catalog';
import { computeLedger } from '../sim/economy';
import { capacityOf, computeBuildingHappiness, workforceOf } from '../sim/growth';
import { manaUseOf } from '../sim/networks';
import { AgentKind, RoadType, Zone, idx, type Building, type GameState } from '../sim/types';
import { CITY_NAMES, NODE_DEEPEN_COST, NODE_DEEPEN_MANA, districtName, timeOfDay } from '../sim/world';
import { OVERLAY_LIST, OVERLAYS } from '../render/overlays';
import { BOON_AT, COUNCIL_SPACING, GUILDS, GUILD_IDS, CHARTER_COST, HALL_DAYS, HALL_OF, RIVAL_OF, STRIKE_AT, isChartered, guildDrivers, guildEffect, guildMood, hallActive, hasCouncil, type GuildId } from '../sim/guilds';
import { RELICS_PER_PIECE, RELIC_SETS, hasAcademy } from '../sim/relics';
import { canBreed } from '../sim/breeding';
import { WALKER_JOBS, walkersOf } from '../sim/walkers';
import { builderTarget, buildersAt, construction, sites } from '../sim/construction';
import { DEV_COMMANDS, DEV_GROUPS } from '../sim/dev';
import { tradeRoutes } from '../sim/trade';
import { TIPS } from '../data/flavor';
import { EDICT_BY_KEY, districtsInUse, edictsFor } from '../sim/edicts';
import { LINE_INFO, STAGE_DAYS, STAGE_NAMES, MAX_STAGE_NOW, dragonsIn, cradleCapacity, isCradle, stageCap } from '../sim/wyrmcraft';
import type { Training, DragonRole } from '../sim/types';
import { DISTRICT_COLORS, ramps } from '../render/overlays';
import { marketStockCap } from '../sim/agents';
import { craftStockCap } from '../sim/growth';
import { SEASON_NAMES, DAYS_PER_SEASON, DISTRICT_NAMES, MAX_DISTRICTS } from '../sim/types';
import type { Tool } from './tools';
import type { Camera } from '../render/camera';
import type { Scenario } from '../sim/types';
import { SCENARIOS } from '../sim/scenario';
import { SECTOR, SECTORS_X, canBuySector, charteredCount, inCharter, sectorCost, sectorName } from '../sim/sectors';
import { daughterPopulation, TWIN_POP } from '../sim/charter';
import { ASPECT_INFO, AURA_INFO, aspectAt, pressureWord } from '../sim/weave';
import { KEY_ACTIONS, DEFAULT_KEYS as DEFAULT_KEYS_LOCAL, keyLabel, type KeyAction } from './keys';
import { TERRAFORM, type TerraformOp } from '../sim/actions';
import { QUESTS } from '../data/quests';
import { PAL } from '../render/palette';
import { Terrain } from '../sim/types';
import { activeQuests, questProgress } from '../sim/quests';
import { advise, type Focus } from '../data/quests';
import { WYRM_LAIR_RADIUS, describeWyrm, wyrmNode, wyrmTribute } from '../sim/wyrm';
import { forecast } from '../sim/forecast';
import { describeBeasts, boundGolems, wildGolems, raysLured, GOLEM_LABOUR } from '../sim/beasts';
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
  setMuted(m: boolean): void;
  musicOn: boolean;
  setMusic(on: boolean): void;
  setTax(zone: keyof GameState['taxRates'], v: number): void;
  setEdict(key: string, on: boolean, district: number): void;
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
  setRole(id: number, role: DragonRole, target: number): string | null;
  resolveEvent(choice: number): void;
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
        <button id="btn-views" title="Info views (Tab)">Views</button>
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
      </div>
      <div id="tooltip" class="panel hidden"></div>
      <div id="views" class="panel hidden"><h3>Info views <span class="grip" title="Drag to move">⋮⋮</span></h3><div class="list"></div><div class="legend"></div></div>
      <div id="demand" class="panel"></div>
      <div id="minimap" class="panel"><span class="grip" title="Drag to move">⋮⋮</span><button class="min" title="Collapse">–</button><canvas width="264" height="132" title="Click to jump; the box is the current view"></canvas></div>
      <div id="log" class="panel"><span class="grip" title="Drag to move">⋮⋮</span><div class="lines"></div></div>
      <div id="info" class="panel hidden"></div>
      <div id="perf" class="panel"></div>
      <div id="toast" class="panel hidden"></div>
      <div id="title" class="modal"></div>
      <div id="help" class="modal hidden"></div>
      <div id="budget" class="modal hidden"></div>
      <div id="menu" class="modal hidden"></div>
      <div id="gameover" class="modal hidden"></div>
      <div id="edicts" class="modal hidden"></div>
      <div id="wyrms" class="modal hidden"></div>
      <div id="event" class="modal hidden"></div>
      <div id="chronicle" class="modal hidden"></div>
      <div id="dev" class="modal hidden" role="dialog" aria-label="Dev tools"></div>
    `;
    for (const id of ['topbar', 'toolbar', 'tooltip', 'views', 'demand', 'log', 'info', 'toast', 'title', 'help', 'budget', 'menu', 'gameover', 'perf', 'clock', 'tasks', 'edicts', 'event', 'wyrms', 'chronicle', 'minimap', 'dev']) this.el[id] = this.q(`#${id}`);
    for (let s = 0; s <= 3; s++) this.q(`#sp-${s}`).onclick = () => (s === 0 ? this.host.togglePause() : this.host.setSpeed(s));
    this.q('#btn-budget').onclick = () => this.toggleBudget();
    this.q('#btn-edicts').onclick = () => this.toggleEdicts();
    this.q('#btn-wyrms').onclick = () => this.toggleWyrms();
    this.q('#btn-chronicle').onclick = () => this.toggleChronicle();
    (this.q('#tasks .min') as HTMLButtonElement).onclick = () => { this.tasksCollapsed = !this.tasksCollapsed; this.lastQuestKey = ''; this.refreshTasks(); };
    (this.q('#tasks .done') as HTMLButtonElement).onclick = () => { this.showDone = !this.showDone; this.lastQuestKey = ''; this.refreshTasks(); };
    this.q('#btn-views').onclick = () => this.el.views.classList.toggle('hidden');
    this.q('#btn-help').onclick = () => this.toggleHelp();
    this.q('#btn-menu').onclick = () => this.toggleMenu();
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
    for (const c of CATEGORIES) {
      const b = document.createElement('button');
      b.textContent = c.name;
      b.dataset.cat = c.id;
      b.onclick = () => {
        this.category = c.id;
        this.refreshItems();
      };
      tabs.appendChild(b);
    }
  }

  refreshItems(): void {
    const s = this.host.state;
    const items = this.q('#toolbar .items');
    items.innerHTML = '';
    this.q('#toolbar .tabs').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.cat === this.category));
    const add = (label: string, cost: string, locked: boolean, active: boolean, onClick: () => void, tip: () => string) => {
      const b = document.createElement('button');
      b.innerHTML = `<span>${label}</span><span class="cost">${cost}</span>`;
      if (locked) b.classList.add('locked');
      if (active) b.classList.add('active');
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
      for (const op of (Object.keys(TERRAFORM) as TerraformOp[]).filter((k) => !TERRAFORM[k].faction || TERRAFORM[k].faction!.includes(s.faction))) {
        const d = TERRAFORM[op];
        const locked = s.milestone < d.unlock;
        add(d.name, `${d.cost}c/tile`, locked, t.kind === 'terrain' && t.op === op, () => this.host.setTool({ kind: 'terrain', op }), () => `<div class="t">${d.name}</div>${d.desc}${locked ? `<br><span class="muted">Unlocks at ${this.ms()[d.unlock].name}</span>` : ''}`);
      }
    } else if (this.category === 'districts') {
      for (let d = 1; d <= MAX_DISTRICTS; d++) {
        const name = DISTRICT_NAMES[d - 1];
        add(`<span style="color:${DISTRICT_COLORS[d - 1]}">■</span> ${name}`, '', false, t.kind === 'district' && t.id === d, () => this.host.setTool({ kind: 'district', id: d }), () => `<div class="t">${name}</div>Drag to paint this district. Edicts can then be applied to it alone from the Edicts panel. Press <b>i</b> for the district view.`);
      }
      add('Clear district', '', false, t.kind === 'district' && t.id === 0, () => this.host.setTool({ kind: 'district', id: 0 }), () => `<div class="t">Clear</div>Removes district paint from the area.`);
    } else {
      const cat = CATEGORIES.find((c) => c.id === this.category)!;
      if (this.category === 'service') {
        const locked = s.milestone < WALL_UNLOCK;
        const glocked = s.milestone < GATE_UNLOCK;
        add('Belregi Gate', `${GATE_COST[2]}c`, glocked, t.kind === 'gate' && t.style === 2, () => this.host.setTool({ kind: 'gate', style: 2 }), () => `<div class="t">Belregi Gate</div>A runed arch of pale stone in the Warding Wall; roads pass through it. Faith +0.3 and ward +0.2 within 8 tiles.<br><span class="flavor">Blue runes that tell the history of whoever keeps them.</span>${glocked ? `<br><span class="warn">Unlocks at ${this.ms()[GATE_UNLOCK].name}</span>` : ''}`);
        add('Uzulim Gate', `${GATE_COST[3]}c`, glocked, t.kind === 'gate' && t.style === 3, () => this.host.setTool({ kind: 'gate', style: 3 }), () => `<div class="t">Uzulim Gate</div>A dark volcanic arch with crimson symbols and hooded statues; roads pass through it. Ward +0.4 and watch +0.3 within 10 tiles; unrest +2% per gate.<br><span class="flavor">The statues' eyes follow anyone who approaches.</span>${glocked ? `<br><span class="warn">Unlocks at ${this.ms()[GATE_UNLOCK].name}</span>` : ''}`);
        add('Warding Wall', `${WALL_COST}c/tile`, locked, t.kind === 'wall', () => this.host.setTool({ kind: 'wall' }), () => `<div class="t">Warding Wall</div>A line of leystone-inlaid stone. The Gloam cannot cross it and Gloam-hounds cannot pass. Drag to draw.<br><span class="muted">Cost ${WALL_COST}/tile (×2 in hills) · upkeep ${WALL_UPKEEP}/tile/day · ${WALL_MANA} mana/tile</span><br><span class="flavor">Every stone sung over once, so the grey grass forgets how to grow across it.</span>${locked ? `<br><span class="warn">Unlocks at ${this.ms()[WALL_UNLOCK].name}</span>` : ''}`);
      }
      for (const d of BUILDINGS.filter(cat.filter).filter((d) => buildsFor(factionOf(s), d))) {
        const locked = !canBuild(s, d.key);
        const mats = d.materials ? ' + ' + Object.entries(d.materials).map(([k, v]) => `${v} ${k}`).join(', ') : '';
        add(d.name, `${d.cost}c${mats}`, locked, t.kind === 'build' && t.key === d.key, () => this.host.setTool({ kind: 'build', key: d.key }), () => this.buildingTip(d, locked));
      }
    }
    this.q('#q-select').classList.toggle('active', t.kind === 'select');
    (this.q('#q-undo') as HTMLButtonElement).disabled = !this.host.undoLabel;
    this.q('#q-undo').title = this.host.undoLabel ? `Undo ${this.host.undoLabel} (Ctrl+Z)` : 'Nothing to undo';
    this.q('#q-bulldoze').classList.toggle('active', t.kind === 'bulldoze');
  }

  private buildingTip(d: BuildingDef, locked: boolean): string {
    const bits: string[] = [];
    bits.push(`${d.w}×${d.h} · cost ${d.cost} · upkeep ${d.upkeep}/day`);
    if (d.manaUse) bits.push(`${d.manaUse} mana/day`);
    if (d.manaProduce) bits.push(`+${d.manaProduce} mana/day`);
    if (d.service) bits.push(`radius ${d.service.radius}`);
    if (d.waterRadius) bits.push(`waters ${d.waterRadius} tiles`);
    if (d.needsMana) bits.push('needs mana');
    return `<div class="t">${d.name}</div>${d.desc}<br><span class="muted">${bits.join(' · ')}</span><br><span class="flavor">${d.flavor}</span>${locked ? `<br><span class="warn">${d.relic && !this.host.state.relics.complete.includes(d.relic) ? `Needs ${RELIC_SETS.find((r) => r.id === d.relic)?.name} entire (Ruin Delve and Academy)` : `Unlocks at ${this.ms()[d.unlock].name} (${this.ms()[d.unlock].pop} folk)`}</span>` : ''}`;
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
    this.q('#tb-title').textContent = `${this.ms()[s.milestone].name} · ${factionOf(s).people}`;
    const season = SEASON_NAMES[Math.floor(s.day / DAYS_PER_SEASON) % 4];
    const year = 1 + Math.floor(s.day / (DAYS_PER_SEASON * 4));
    this.q('#tb-date').textContent = `${(s.day % DAYS_PER_SEASON) + 1} ${season}, Y${year}`;
    const l = computeLedger(s);
    const gold = this.q('#tb-gold');
    gold.textContent = `${Math.round(s.treasury).toLocaleString()} c`;
    gold.className = `v ${s.treasury < 0 ? 'bad' : 'gold'}`;
    const net = this.q('#tb-net');
    net.textContent = `${l.net >= 0 ? '+' : ''}${Math.round(l.net)} / day`;
    net.className = `l ${l.net >= 0 ? 'good' : 'bad'}`;
    this.q('#tb-pop').textContent = s.population.toLocaleString();
    const wf = workforceOf(s);
    this.q('#tb-jobs').textContent = `${s.employed}/${wf}${s.jobs > wf ? ' (+' + (s.jobs - wf) + ' open)' : ''}`;
    const mana = this.q('#tb-mana');
    mana.textContent = `${Math.round(s.manaDemand)} / ${Math.round(s.manaSupply)}`;
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
    this.refreshLog();
    this.refreshMinimap();
    this.refreshChronicle();
    this.refreshInfo();
    this.el.perf.textContent = `${h.perf.fps} fps · render ${h.perf.ms.toFixed(1)} ms · ${h.perf.drawn} sprites · ${s.agents.length} agents · tick ${s.tick}`;
    if (s.milestone !== this.lastMilestone) {
      if (this.lastMilestone >= 0) this.toast(`<h2>${s.cityName} is now a ${this.ms()[s.milestone].name}</h2><p>${this.ms()[s.milestone].text}</p><p class="muted">Grant: +${this.ms()[s.milestone].grant} crowns. New buildings unlocked in the toolbar.</p>`, 9000);
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
    const quests = activeQuests(s, 3);
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
      const text = done ? `Daily challenge ${s.challenge}: Market Town on day ${s.challengeDay}${s.stats.devUses ? ' (dev tools used)' : ''}` : `Daily challenge ${s.challenge}: day ${s.day} of 60, ${this.ms()[s.milestone].name}`;
      score.classList.remove('hidden');
      score.innerHTML = `<span class="lbl">${done ? 'Result' : 'Challenge'}</span> ${text}${done ? ' <button class="show" id="q-copy">Copy result</button>' : ''}`;
      const cp = score.querySelector('#q-copy') as HTMLButtonElement | null;
      if (cp) cp.onclick = () => { const line = `Wardlight daily ${s.challenge}: Market Town on day ${s.challengeDay} in ${s.cityName}${s.stats.devUses ? ' (dev tools used)' : ''}. https://asyrion.github.io/EdaBuilder/`; try { void navigator.clipboard.writeText(line); this.toast('<p>Result copied.</p>', 1500); } catch { this.toast(`<p>${line}</p>`, 5000); } };
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
      const id = f.overlay === 'watch' ? 'ward' : f.overlay;
      this.host.setOverlay(id);
      this.el.views.classList.remove('hidden');
    } else if ('center' in f) {
      if (f.center === 'founding') this.host.centerOn(s.founding.x, s.founding.y);
      else if (f.center === 'node') { const n = s.nodes[0]; if (n) this.host.centerOn(n.x, n.y); }
      else if (f.center === 'cradle') { const c = s.buildings.find((b) => b && isCradle(b.kind)); if (c) this.host.centerOn(c.x, c.y); }
      else if (f.center === 'wyrm') { const n = wyrmNode(s); if (n) this.host.centerOn(n.x, n.y); }
      else if (f.center === 'ruins') { for (let i = 0; i < s.terrain.length; i++) if (s.terrain[i] === 8) { this.host.centerOn(i % s.w, (i / s.w) | 0); break; } }
      else if (f.center === 'gloam') {
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
    if (s.chronicle.length === this.lastChronicleLen) return;
    this.lastChronicleLen = s.chronicle.length;
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
    const d = this.host.state.demand;
    const bars: [string, number, string][] = [['H', d.hearth, '#5ee36f'], ['M', d.market, '#5aa8ff'], ['C', d.craft, '#ffb347'], ['A', d.arcane, '#c58cff']];
    const el = this.el.demand;
    if (!el.children.length) {
      el.innerHTML = `<div class="col"><div class="lbl muted" style="width:60px">Demand</div></div>` + bars.map(([l, , c]) => `<div class="col"><div class="bar"><div style="background:${c}"></div></div><div class="lbl" style="color:${c}">${l}</div></div>`).join('');
      el.title = 'Zone demand: Hearth (homes), Market, Craft, Arcane. Paint zones where the bars are high.';
    }
    const fills = el.querySelectorAll('.bar div');
    bars.forEach(([, v], i) => {
      const f = fills[i] as HTMLElement;
      if (v >= 0) {
        f.style.top = `${30 - v * 30}px`;
        f.style.bottom = '30px';
      } else {
        f.style.top = '30px';
        f.style.bottom = `${30 + v * 30}px`;
      }
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
      rows.push(row('Land value', `${s.landValue[i]}`));
      rows.push(row('Level-up progress', `${Math.max(0, Math.round(b.progress))}%`));
      if (def.zone === Zone.Market) rows.push(row('Goods on the shelves', `${Math.round(b.stock)} / ${marketStockCap(b)}`));
      if (def.zone === Zone.Market && s.fenNex > 0 && s.district[i] === s.fenNex) rows.push(row('Fen-Nex quarter', 'no tithe, double shelves'));
      if (def.zone === Zone.Craft) rows.push(row('Goods awaiting carts', `${Math.round(b.stock)} / ${craftStockCap(b)}`));
      if (def.zone === Zone.Craft && seasonOfState(s) === 3) rows.push(row('The Hush', glimhouseNear(s, b) ? 'warmed by a Glimhouse' : `output ×${HUSH_CRAFT}`));
      if (!b.lit) problems.push('No mana: build a Ley Spire within 5 tiles or next to a lit building.');
      if (!b.watered) problems.push('No water: build a Well or Cistern nearby.');
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
      if (def.manaUse) rows.push(row('Mana', `${manaUseOf(b)} / day${b.lit ? '' : ' (unlit!)'}`));
      if (def.service) rows.push(row('Radius', `${def.service.radius} tiles`));
      if (def.waterRadius) rows.push(row('Waters', `${def.waterRadius} tiles`));
      if (def.capacity) rows.push(row('Workers', `${b.workers} / ${capacityOf(b, s)}`));
      if (def.goodsRate) rows.push(row('Carts', String(s.agents.filter((a) => a.kind === AgentKind.Cart && a.homeId === b.id).length)));
      if (def.needsMana && !b.lit) problems.push('Unlit: this building needs mana to work at full strength.');
      if (b.kind === 'spire' && !b.lit) problems.push('Not linked: a spire must be within 6 tiles of a ley node or a lit spire.');
    }
    if (def.zone === Zone.Arcane) rows.push(row('Leystone in the workshop', `${Math.round(b.stock)} / ${20 * b.level}`));
    if (def.leystone) rows.push(row('Leystone awaiting carts', `${Math.round(b.stock)} / 60`));
    if (def.goodsRate) rows.push(row('Goods awaiting carts', `${Math.round(b.stock)} / ${craftStockCap(b)}`));
    if (b.kind === 'observatory') rows.push(...(b.lit ? forecast(s) : [{ text: 'Unlit: the dome is dark and reads nothing.', kind: 'warn' as const }]).map((f) => `<div class="fc ${f.kind}">✦ ${f.text}</div>`));
    if (b.kind === 'worldtree') {
      const st = treeStage(b);
      rows.push(row('Growth', st >= 3 ? 'full-grown' : `stage ${st + 1} of 4, ${30 - (b.age % 30)} days to the next`));
      rows.push(row('Shade', `${TREE_LEISURE_RADIUS[st]} tiles of leisure; roots hold the Gloam for ${TREE_WARD_RADIUS[st]}`));
    }
    { const ws = walkersOf(s, b); if (ws.length) { const job = WALKER_JOBS[ws[0].job!]; rows.push(row('Walkers', `${ws.length} ${ws.length === 1 ? job.name : job.plural} on patrol`)); for (const line of ws.flatMap((w) => w.log ?? []).slice(-3)) rows.push(`<div class="fc good">✦ ${line}</div>`); } else if (Object.values(WALKER_JOBS).some((j) => j.from.includes(b.kind)) && b.state === 'ok') problems.push('No walker: the building needs a road at its door to send one out.'); }
    if (b.kind === 'ruindelve') {
      rows.push(row('Relics brought up', `${s.stats.relics} (a set piece every ${RELICS_PER_PIECE})`));
      for (const set of RELIC_SETS) rows.push(row(set.name, s.relics.complete.includes(set.id) ? `<span class="good">entire: ${set.bonus}</span>` : `${s.relics.pieces[set.id] ?? 0} of 3`));
      if (s.relics.uncatalogued > 0) (hasAcademy(s) ? rows : problems).push(hasAcademy(s) ? row('Awaiting the Academy', `${s.relics.uncatalogued} piece(s)`) : `${s.relics.uncatalogued} piece(s) lie uncatalogued: an Academy would name them.`);
    }
    if (b.kind === 'academy' || b.kind === 'grandacademy') rows.push(row('Relic sets', s.relics.complete.length ? s.relics.complete.map((id) => RELIC_SETS.find((r) => r.id === id)!.name).join(', ') : 'none catalogued yet'));
    { const gid = (Object.keys(HALL_OF) as GuildId[]).find((k) => HALL_OF[k] === b.kind); if (gid) { rows.push(row('Guild', `${GUILDS[gid].name}, ${guildMood(s.guilds.standing[gid])} (${Math.round(s.guilds.standing[gid])})`)); if (!hallActive(s, b.kind)) problems.push('Locked: the guild is on strike. Raise its standing above 25 to reopen the hall.'); } }
    if (b.kind === 'guildhall') { for (const id of GUILD_IDS) rows.push(row(GUILDS[id].name, `${guildMood(s.guilds.standing[id])} (${Math.round(s.guilds.standing[id])})`)); if (!b.lit) problems.push('Unlit: the council does not sit.'); else rows.push(row('Council', `${s.stats.councils} petitions heard; see the Edicts panel`)); }
    if (b.kind === 'depot') { const rt = tradeRoutes(s); rows.push(row('Routes', rt.filter((r) => r.open).map((r) => r.name).join(', ') || 'none')); const tw = rt.find((r) => r.kind === 'twin'); if (tw && !tw.open) problems.push(tw.note); }
    if (b.kind === 'golemfoundry' || b.kind === 'forgetemple') { rows.push(row('Wardens bound', `${boundGolems(s)} (${boundGolems(s) * GOLEM_LABOUR} hands)`)); if (b.kind === 'forgetemple') rows.push(row('The forge', b.lit ? 'a Warden woken within 20 tiles climbs out bound' : 'unlit: the hammers are still')); if (wildGolems(s)) problems.push(`${wildGolems(s)} wild warden(s) walk the map; they bind within 12 tiles of a lit ${b.kind === 'forgetemple' ? 'Forge-Temple' : 'foundry'}.`); }
    if (b.kind === 'leybeacon') rows.push(row('Skyrays', raysLured(s) ? 'circling the beacon' : b.lit ? 'none in reach; schools cross in Bloom and Ember' : 'unlit: the beacon is silent'));
    if (b.kind === 'drakemews') { rows.push(row('Patrols', b.lit ? 'Watch Houses reach twice as far' : 'unlit: the drakes sleep')); rows.push(row('Riders', `${s.agents.filter((a) => a.kind === 3 && a.species === 'rider' && a.anchorId === b.id).length} aloft · ${s.stats.riderRescues} rescues`)); }
    if (b.kind === 'quay') { const qn = s.buildings.filter((o) => o && o.kind === 'quay').length; rows.push(row('Barges sent', `${s.stats.bargeTrips}`)); if (qn < 2) problems.push('A single quay has nowhere to send a barge: build another on the same water.'); }
    if (b.kind === 'skydock') { const air = s.airship; rows.push(row('Airship', air.status === 'away' ? `away, back in ${Math.max(0, 10 - (s.day - air.since))} days with ${Math.round(air.goods)} goods` : air.status === 'docked' ? `docked; leaves on day 3 of the season` : 'none')); rows.push(row('Voyages', `${s.stats.airshipVoyages} · ${s.stats.airshipCrowns} crowns earned`)); }
    if (b.kind === 'portalarch') {
      const other = s.buildings.filter((o) => o && o.kind === 'portalarch' && o !== b) as Building[];
      rows.push(row('Paired', other.length ? (other[0].lit && b.lit ? `with the arch at (${other[0].x},${other[0].y}), open` : 'yes, but an arch is unlit') : 'no: raise a second arch'));
      rows.push(row('Trips through the arches', `${s.stats.portalTrips}`));
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
    if (b.state === 'building') { const ba = buildersAt(s, b); rows.push(row('Construction', `${Math.round((1 - b.work / Math.max(1, b.workTotal)) * 100)}% · ${ba.present} builder${ba.present === 1 ? '' : 's'} at work${ba.assigned > ba.present ? `, ${ba.assigned - ba.present} on the way` : ''}`)); if (def.category === 'zone') rows.pop(), rows.push(row('Construction', `${Math.round((1 - b.work / Math.max(1, b.workTotal)) * 100)}% · raised by the folk who will live here`)); else if (!ba.assigned && builderTarget(s) > 0) problems.push('No builder can reach this site by road from the Founding Stake; the folk raise it themselves at a quarter pace.'); }
    el.innerHTML = `<button class="close">✕</button><h2>${def.name}</h2><div class="muted">(${b.x},${b.y}) · ${b.w}×${b.h} · ${b.state}${def.category === 'zone' ? ` · age ${b.age}d` : ''}</div>${rows.join('')}<div class="problems">${problems.map((p) => `<div>⚠ ${p}</div>`).join('')}</div><p class="flavor">${def.flavor}</p>`;
    el.querySelector('.close')!.addEventListener('click', () => this.host.select(null));
    if (b.kind === 'stormpeak') {
      const btn = document.createElement('button');
      btn.textContent = b.cooldown > 0 ? `Call rain (ready in ${b.cooldown} day${b.cooldown === 1 ? '' : 's'})` : 'Call rain over the district (300 crowns)';
      btn.disabled = b.cooldown > 0;
      btn.style.width = '100%';
      btn.onclick = () => this.host.callRain(b.id);
      el.appendChild(btn);
    }
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
      row('Flow', `${90 + depth * NODE_DEEPEN_MANA} mana / day`),
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
      <p class="muted">${isWyrm && s.wyrm.state === 'sleeping' ? `Spires within 6 tiles drink from the wyrm and wake it (about ${Math.round(100 / 3)} days per spire). Deepening this node wakes it at once. Awake, it wants tribute each season, or it burns; a Wyrm-Court (Free City) can bind it as the city's guardian: wards ${WYRM_LAIR_RADIUS} tiles, no hounds, happiness +10, eats 40 goods a day.` : `Ley Spires within 6 tiles of a node drink from it. Deepening the Wellspring (from Burgh) adds ${NODE_DEEPEN_MANA} mana a day, twice at most.`}</p>
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
            <li><kbd>B</kbd> bulldoze · <kbd>Shift</kbd>+<kbd>G</kbd> grid · <kbd>C</kbd> Chronicle · <kbd>H</kbd> this help · keys can be rebound in Menu → Key bindings</li>
            <li>The map beyond the <b>Charter</b> is dimmed: click it to see the price and extend the Charter (from Hamlet). The Gloam inside a bought sector draws back.</li>
            <li>The <b>Land</b> tab clears forest, plants glimwood and levels hills, one tile at a time. The title screen's <b>Today's challenge</b> is the same valley for everyone, Market Town by day 60.</li>
            <li><kbd>Space</kbd> pause · <kbd>,</kbd> <kbd>.</kbd> slower / faster</li>
            <li><kbd>1</kbd>–<kbd>0</kbd> <kbd>-</kbd> <kbd>=</kbd> <kbd>G</kbd> <kbd>M</kbd> info views · <kbd>Tab</kbd> view list</li>
            <li><kbd>F5</kbd> quick save · <kbd>F9</kbd> quick load · <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo</li>
          </ul>
        </div>
        <div>
          <h3>The loop</h3>
          <ol>
            <li><b>Draw roads</b> from the Founding Stake. Everything grows beside a road.</li>
            <li><b>Zone</b> Hearth (homes), Market, Craft (alchemy works) where the demand bars ask.</li>
            <li><b>Light</b> them: Ley Spires within 6 tiles of a node light 5 tiles; lit buildings light their neighbours.</li>
            <li><b>Water</b> them with Wells.</li>
            <li><b>Serve</b>: Watch, Healers, Veshari (fire), Boneyard (the dead!), Wards (the Gloam!).</li>
            <li>Watch the <b>tithe</b>. Raise taxes carefully. Hit population milestones to unlock more.</li>
            <li><b>Goods</b>: Craft works fill carts; carts feed Markets by road. Empty shelves and idle stills both hurt.</li>
            <li>The <b>Charter's Ledger</b> (left) lists the next three tasks with a hint and a <b>Show me</b> button; the <b>Advisor</b> line names the worst problem right now. The <b>Chronicle</b> (top bar, <kbd>C</kbd>) records what has actually happened in the world, with a ⌖ to go there.</li>
            <li><b>Edicts</b> (top bar) are policies with daily costs. <b>Events</b> pause the game and ask you to choose.</li>
            <li><b>Seasons</b> last 30 days. The Hush brings long nights, hungrier hearths and a bolder Gloam. Festivals ask for choices on fixed days.</li>
            <li><b>Click a ley node</b> to see its flow; from Burgh you can deepen it for more mana. A <b>Trade Depot</b> sells surplus goods.</li>
            <li><b>Dragons</b>: build a Wyrm-Cradle (Township) near ley and a Tamer's Lodge; eggs arrive through events. Raise them in the <b>Wyrms</b> panel and give drakes a role.</li>
            <li><b>Huruhui and Gekiryu craft</b>: a <b>Torrent Mill</b> on the riverbank makes mana from falling water; <b>Hanging Gardens</b> against hills make goods, health and light with no mana, and unlock the <b>Glowvine Lane</b>; a <b>Glimhouse</b> keeps Craft works warm through the Hush; the <b>Astral Observatory</b> forecasts the week in the Ledger.</li>
            <li><b>Longwood and Lukuku</b>: a pair of <b>Portal Arches</b> (Market Town) lets carts step across the map; a <b>Ruin Delve</b> on the Ruins of Lukuku (flagstones in a forest) brings up relics and old stories; the <b>World Tree Sapling</b> wonder (Free City) grows over four seasons into shade that holds the Gloam.</li>
            <li><b>Longwood and the Fen-Nex</b>: big forests hide <b>war-tigers</b> that hunt hearths by night (hunters, strong Watch or warden drakes kill them); the <b>Fen-Nex</b> fox-folk trade honestly half the time and may take a quarter of the city; a wild surge can leave a drifting <b>mana-storm</b> that warps buildings until wards dissolve it; the <b>Font of Quieting</b> (Free City) makes the dead easy to lay down.</li>
            <li><b>Vehicles</b>: level-3 Arcane workshops put <b>floating carts</b> on the roads (no congestion, 1 mana while moving); two <b>Quays</b> on the same water trade goods by <b>barge</b>; a lit <b>Drake Mews</b> sends <b>drake riders</b> to the restless and to fires; the <b>Sky-Dock</b> (Beacon of Eda) launches an <b>airship</b> each season with the city's surplus.</li>
            <li><b>Beasts of the Concord and the sky</b>: mining wakes <b>Concord Wardens</b> in the hills; a <b>Golem Foundry</b> (Burgh) binds them into tireless labour that drinks mana. A <b>Ley Beacon</b> keeps a school of <b>skyrays</b> for a season (happiness, rayscale). A <b>Drake Mews</b> doubles Watch House reach. Three taming edicts trade one beast for another.</li>
            <li><b>The ley-weave</b>: every node has an aspect (Ember, Bone, Glim, Vein, Sky, Grey, Tide, Storm) that changes the rules within 10 tiles; a cradle there attunes matching eggs; grown dragons radiate their line's aura; rare goods build the <b>Marvels</b> tab; the Gloam's pressure rises with the dead and falls with faith.</li>
            <li><b>The Sleeping Wyrm</b> coils around one distant node. Spires there wake it; awake, it wants tribute each season or it burns. A <b>Wyrm-Court</b> (Free City) binds it as the city's guardian, if you feed it.</li>
            <li><b>Walkers</b>: Watch Houses send watchmen, Boneyards sextons, Healer's Shrines healers, spires Tallowkin wardens (under their edict), Academies scholars to the delve, Tamer's Lodges tamers to the cradles, and shrines pilgrims to the temple. The streets they walk count as covered, and each does its job where it goes.</li>
            <li>The <b>Weave</b> view (<kbd>W</kbd>) paints ley aspects and dragon auras; the Edicts panel seats the <b>guild council</b> once a Guildhall is lit; the Ledger lists every <b>trade route</b>.</li>
            <li>Panels: the <b>Info views</b>, <b>minimap</b> and message ticker can be dragged by their ⋮⋮ grip. Click or drag on the <b>minimap</b> to jump there; scroll on it to zoom.</li>
          </ol>
          <h3>Ways to lose</h3>
          <ul>
            <li>Treasury below −8,000 for 5 days.</li>
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
      <div class="row"><button id="t-new">Found a new wardlight</button><button id="t-daily" title="The same valley for everyone today; Market Town by day 60">Today's challenge</button><button id="t-continue">Continue</button><button id="t-import">Import Charter (.json)</button></div>
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
          <tr><td>Road upkeep</td><td class="r bad" data-k="upkeepRoads"></td></tr>
          <tr><td>Building upkeep</td><td class="r bad" data-k="upkeepBuildings"></td></tr>
          <tr><td>Edicts</td><td class="r bad" data-k="upkeepEdicts"></td></tr>
          <tr><td><b>Net per day</b></td><td class="r" data-k="net"></td></tr>
          <tr><td>Treasury</td><td class="r gold" data-k="treasury"></td></tr>
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
    set('upkeepRoads', `−${l.upkeepRoads.toFixed(0)}`);
    set('upkeepBuildings', `−${l.upkeepBuildings.toFixed(0)}`);
    set('upkeepEdicts', `−${l.upkeepEdicts.toFixed(0)}`);
    const net = this.el.budget.querySelector('[data-k="net"]') as HTMLElement;
    net.innerHTML = `<b>${l.net >= 0 ? '+' : ''}${l.net.toFixed(0)}</b>`;
    net.className = `r ${l.net >= 0 ? 'good' : 'bad'}`;
    set('treasury', `${Math.round(st.treasury)}`);
    set('social', `Unrest ${Math.round(st.unrest * 100)}% cuts yields. Happiness ${Math.round(st.happiness)}. Health ${Math.round(st.health * 100)}%. Educated ${Math.round(st.educated * 100)}%. Unquieted dead: ${Math.round(st.unquieted)}.`);
    set('history', `Last 10 days net: ${st.ledgerHistory.slice(-10).map((v) => (v >= 0 ? '+' : '') + v).join(', ') || 'n/a'}`);
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
    const render = (waiting: KeyAction | null) => {
      m.innerHTML = `<div class="box panel" style="width:380px">
        <h2>Key bindings</h2>
        <p class="muted">Click an action, then press the key for it. Ctrl+Z undo, Shift+G grid and the view keys 1–0 are fixed.</p>
        ${KEY_ACTIONS.map((a) => `<div class="keyrow ${waiting === a.id ? 'waiting' : ''}" data-k="${a.id}"><span>${a.name}</span><kbd>${waiting === a.id ? 'press a key…' : keyLabel(keys[a.id])}</kbd></div>`).join('')}
        <div class="row"><button id="k-reset">Reset to defaults</button><button id="k-done">Done</button></div>
      </div>`;
      m.querySelectorAll('.keyrow').forEach((r) => ((r as HTMLElement).onclick = () => render((r as HTMLElement).dataset.k as KeyAction)));
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
    const rows = st.dragons.map((d) => {
      const stageMax = STAGE_DAYS[d.stage];
      const pct = d.stage >= MAX_STAGE_NOW ? 100 : Math.min(100, Math.round((d.days / stageMax) * 100));
      const hasRing = st.buildings.some((b) => b && b.kind === 'ring');
      const roleSel = d.stage >= 2
        ? `<select data-role="${d.id}"><option value="none" ${d.role === 'none' ? 'selected' : ''}>No role</option>${d.stage >= 3 ? `<option value="courier:-1" ${d.role === 'courier' ? 'selected' : ''}>Courier (flies goods to empty markets)</option>` : ''}${hasRing ? `<option value="champion:-1" ${d.role === 'champion' ? 'selected' : ''}>Champion of the Wyrm-Ring</option>` : ''}${districts.map((k) => `<option value="warden:${k}" ${d.role === 'warden' && d.roleTarget === k ? 'selected' : ''}>Warden of ${(st.districtNames[k] || DISTRICT_NAMES[k - 1])}</option>`).join('')}${mines.map((m) => `<option value="delver:${m.id}" ${d.role === 'delver' && d.roleTarget === m.id ? 'selected' : ''}>Delver at mine (${m.x},${m.y})</option>`).join('')}</select>`
        : `<span class="muted">${d.stage === 0 ? 'in the egg' : 'too young for a role'}</span>`;
      return `<div class="dragon">
        <div><b>${d.name}</b> <span class="muted">the ${d.second ? `${LINE_INFO[d.line].name}-${LINE_INFO[d.second].name} ${d.trueblood ? 'trueblood' : 'crossed'}` : LINE_INFO[d.line].name} ${STAGE_NAMES[d.stage]}</span> · mood <span class="${d.mood < 30 ? 'bad' : d.mood > 60 ? 'good' : ''}">${Math.round(d.mood)}</span>${d.hungry >= 2 ? ' <span class="bad">hungry</span>' : ''}</div>
        <div class="muted">${LINE_INFO[d.line].desc}. ${d.stage >= 2 && (d.role === 'none' || d.role === 'warden') ? `<span class="good">Aura: ${AURA_INFO[d.line]}${d.second ? `; and, fainter, ${AURA_INFO[d.second]}` : ''}.</span> ` : ''}${(() => { const c = st.buildings.find((b) => b && b.id === d.cradleId); return c && aspectAt(st, c.x, c.y) === d.line ? '<span class="good">Attuned to its node.</span> ' : ''; })()}${d.stage >= stageCap(d) ? (d.stage >= 4 ? 'A great wyrm: auras half again as wide, the Gloam shrinks from it.' : d.stage >= 3 ? 'A grown wyvern.' : 'Grown as far as its line allows on the ground.') : `Growth ${pct}% toward ${STAGE_NAMES[d.stage + 1]}${d.trueblood && d.stage === 3 ? ' (a trueblood may become a great wyrm)' : ''}.`}</div>
        <div class="drow">Training: <select data-train="${d.id}"><option value="gentle" ${d.training === 'gentle' ? 'selected' : ''}>gentle (slow, safe)</option><option value="hard" ${d.training === 'hard' ? 'selected' : ''}>hard (fast, mishaps)</option><option value="wild" ${d.training === 'wild' ? 'selected' : ''}>wild (fastest, may leave)</option></select> Role: ${roleSel}</div>
      </div>`;
    });
    const m = st.materials;
    this.el.wyrms.innerHTML = `<div class="box panel">
      <h2>Wyrmcraft</h2>
      <p class="muted">Cradles: ${cradles.length} (${st.dragons.length} / ${slots} slots). Eggs come from events: a warm seam in a mine, a quiet boneyard with an Ossuary, an old Moth-Loft, poachers. A cradle needs ley within 6 tiles and 8 mana a day; hatchlings need a Tamer's Lodge within 10 tiles and food from nearby markets.</p>
      <p class="muted">Ring: ${st.stats.boutsWon} won, ${st.stats.boutsLost} lost. Materials: scale ${Math.round(m.scale)} · wyrmfire ${m.wyrmfire.toFixed(1)}${m.wyrmfire > 0 ? ' (Craft +15%)' : ''} · eggshell ${m.eggshell.toFixed(1)} · rayscale ${m.rayscale.toFixed(1)} · glim-dust ${m.glimdust.toFixed(1)} <span class="muted">(the Marvels tab spends them; caravans buy them)</span></p>
      <p class="muted">The Gloam is <b>${pressureWord(st.gloamPressure)}</b> (${Math.round(st.gloamPressure * 100)}%): the dead, the restless, overdraw and wild beasts press it; faith, the wyrm, the Tree and Grey ley hold it back.</p>
      <p class="muted">Beasts: ${describeBeasts(st)}</p>
      ${st.wyrm.state !== 'none' ? `<div class="wyrmrow"><b>The Vein-Wyrm</b> <span class="muted">at (${wyrmNode(st)!.x},${wyrmNode(st)!.y})</span><div class="${st.wyrm.state === 'bound' && st.wyrm.sulking === 0 ? 'good' : st.wyrm.state === 'awake' || st.wyrm.sulking > 0 ? 'warn' : 'muted'}">${describeWyrm(st)}</div><button id="w-goto">Show me</button></div>` : ''}
      ${rows.length ? rows.join('') : '<p class="flavor">No dragons yet. Build a Wyrm-Cradle and wait for the Veins to offer an egg.</p>'}
      <div style="text-align:right"><button id="w-close">Close</button></div>
    </div>`;
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
      stats = `<div class="dstats"><input type="text" id="e-rename" value="${districtName(st, d)}" maxlength="18" title="Rename district"> <span class="muted">${tiles} tiles · ${bld} buildings · ${pop} folk · ${jobs} jobs · happiness ${hw ? Math.round(happy / hw) : '–'} · ~${Math.round(income)} c/day tithe</span></div>`;
    }
    const rows = edictsFor(st).map((e) => {
      const locked = st.milestone < e.unlock;
      const on = this.edictScope ? !!st.districtEdicts[`${this.edictScope}:${e.key}`] : !!st.edicts[e.key];
      const cityOn = this.edictScope ? !!st.edicts[e.key] : false;
      return `<div class="edict ${locked ? 'locked' : ''}">
        <label><input type="checkbox" data-key="${e.key}" ${on || cityOn ? 'checked' : ''} ${locked || cityOn ? 'disabled' : ''}> <b>${e.name}</b> <span class="muted">(${e.costPerDay(st)} c/day${this.edictScope ? ', scaled to the district' : ''})</span>${cityOn ? ' <span class="muted">city-wide</span>' : ''}</label>
        <div class="muted">${e.desc}${locked ? ` <span class="warn">Unlocks at ${this.ms()[e.unlock].name}.</span>` : ''}</div>
        <div class="flavor">${e.flavor}</div>
      </div>`;
    });
    const mods = st.modifiers.filter((m) => m.until > st.day).map((m) => `<li>${m.label} (${m.until - st.day} days left)</li>`).join('');
    this.el.edicts.innerHTML = `<div class="box panel">
      <h2>Edicts of the Warden-Reeve</h2>
      <p class="muted">Edicts take effect immediately and cost their upkeep every day. Scope: ${scopeSel}${inUse.length ? '' : ' <span class="muted">(paint districts from the toolbar to set edicts per district)</span>'}</p>
      ${stats}
      ${rows.join('')}
      ${this.councilHtml(st)}
      ${mods ? `<h3 style="margin-top:8px">Active effects</h3><ul class="muted">${mods}</ul>` : ''}
      <div style="text-align:right"><button id="e-close">Close</button></div>
    </div>`;
    this.el.edicts.querySelectorAll('input[type=checkbox]').forEach((inp) => {
      (inp as HTMLInputElement).onchange = () => {
        this.host.setEdict((inp as HTMLInputElement).dataset.key!, (inp as HTMLInputElement).checked, this.edictScope);
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
    const groups = DEV_GROUPS.map((g) => `<h3>${g}</h3><div class="devgrid">${DEV_COMMANDS.filter((c) => c.group === g).map((c) => `<div class="devcmd"><button data-id="${c.id}" title="${c.desc}">${c.name}</button>${c.arg ? `<select data-arg="${c.id}">${c.arg.options.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>` : ''}</div>`).join('')}</div>`).join('');
    el.innerHTML = `<div class="box panel" style="width:760px">
      <h2>Dev tools <span class="muted" style="font-size:12px">for playtesting; every use is counted and marks the daily result</span></h2>
      <p class="muted devstatus">${status}</p>
      ${last ? `<p class="good">${last}</p>` : ''}
      ${groups}
      <div class="row"><button id="dev-dump">Copy state summary</button><button id="dev-close">Close</button></div>
    </div>`;
    el.querySelectorAll('button[data-id]').forEach((b) => { (b as HTMLButtonElement).onclick = () => { const id = (b as HTMLElement).dataset.id!; const sel = el.querySelector(`select[data-arg="${id}"]`) as HTMLSelectElement | null; const out = this.host.dev(id, sel ? sel.value : ''); this.renderDev(`${(b as HTMLElement).textContent}: ${out}`); }; });
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
      <div class="choices">${pe.choices.map((c, i) => `<button data-i="${i}"><b>${c.label}</b><br><span class="muted">${c.desc}</span></button>`).join('')}</div>
    </div>`;
    el.classList.remove('hidden');
    el.querySelectorAll('button').forEach((b) => (b.onclick = () => this.host.resolveEvent(Number((b as HTMLElement).dataset.i))));
  }

  showGameOver(): void {
    const s = this.host.state;
    if (!this.el.gameover.classList.contains('hidden')) return;
    this.el.gameover.innerHTML = `<div class="box panel">
      <h2>The light goes out</h2>
      <p>${s.gameOver}</p>
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

function row(k: string, v: string): string {
  return `<div class="row"><span class="muted">${k}</span><span>${v}</span></div>`;
}

export { ROAD_BY_TYPE, RoadType };
