import { buildsFor, canBuild, factionKey, factionOf, gateMet, milestonesOf, nextGate, specialLock, costOf } from '../data/factions';
/** DOM UI: top bar, toolbar, info views, demand, log, building info, modals. */
import { BUILDINGS, BUILDING_BY_KEY, ROADS, ROAD_BY_TYPE, isDepot, isRoadUnlocked, isZoneUnlocked, type BuildingDef } from '../sim/catalog';
import { DEBT_DAYS, FAVOUR_AUDIT, FAVOUR_NEUTRAL, FAVOUR_STEP, LEVY_FLOOR, LEVY_RATE, LOAN_INTEREST, computeLedger, debtLine, favourFactor, grantFor, levyDue, loanLimit } from '../sim/economy';
import { HOSPICE_DRAUGHTS, capacityOf, computeBuildingHappiness, grandAcademyBonus, happinessTerms, idleScholars, levelUpNeeds, theftAt, workforceOf, type Term, demandExplain, type DemandZone } from '../sim/growth';
import { crewFactor, landBonusMap, landValueTerms } from '../sim/services';
import { greyInReach, wardBurnBudget } from '../sim/hazards';
import { manaUseOf } from '../sim/networks';
import { AgentKind, RoadType, Zone, idx, type Building, type GameState } from '../sim/types';
import { CITY_NAMES, NODE_DEEPEN_COST, NODE_DEEPEN_MANA, NODE_SEEP, districtName, nodeFlowOf, timeOfDay, waterRadiusOf, stakeHallName, GROWING_HALLS } from '../sim/world';
import { isLeyMember, lakeFed, loadCapOf, priorityOf, waterCapAt } from '../sim/networks';
import { SEAM, SPENT_RATE } from '../sim/growth';
import { GREY_DAYS, fontsRunHot } from '../sim/hazards';
import { OVERLAY_LIST, OVERLAYS } from '../render/overlays';
import { builderTarget, buildersAt, construction, sites } from '../sim/construction';
import { DEV_COMMANDS, DEV_GROUPS, devNumber, devOptions, type DevArg } from '../sim/dev';
import { tradeRoutes } from '../sim/trade';
import { TIPS } from '../data/flavor';
import { EDICT_MIN_DAYS, EDICT_REPEAL, districtsInUse, edictLocked, edictsFor } from '../sim/edicts';
import { CHARTER_LOCK_DAYS, DISTRICT_UNLOCK, QUARTERS, QUARTER_BY_ID, type QuarterId, districtSlots, districtInUse, districtUnlockNotes, charterCostOf, charterHeld, charterLocked, districtOpenAt } from '../sim/districts';
import { DISTRICT_COLORS } from '../render/overlays';
import { marketStockCap, roadTileOf } from '../sim/agents';
import { marketRoadMultAt, marketRoadWords } from '../sim/roads';
import { craftStockCap } from '../sim/growth';
import { SEASON_NAMES, DAYS_PER_SEASON, MAX_DISTRICTS } from '../sim/types';
import type { Tool } from './tools';
import type { Camera } from '../render/camera';
import { SECTOR, SECTORS_X, canBuySector, charteredCount, inCharter, sectorCost, sectorName } from '../sim/sectors';
import { KEY_ACTIONS, DEFAULT_KEYS as DEFAULT_KEYS_LOCAL, keyLabel, type KeyAction } from './keys';
import { UNBINDABLE, keepFocusThroughRebuilds, roving, watchDialogs, watchRegions } from './focus';
import { QUESTS, questStatus } from '../data/quests';
import { PAL } from '../render/palette';
import { Terrain } from '../sim/types';
import { activeQuests, questProgress } from '../sim/quests';
import { advise, type Focus } from '../data/quests';
import { HUSH_CRAFT } from '../sim/growth';
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
  newGame(seed: number, name: string): void;
  continueGame(): boolean;
  hasSave(): boolean;
  save(): void;
  exportJson(): void;
  importJson(file: File): void;
  /** Replays (iteration 67): the charter's commands exported; a replay watched. */
  exportReplay(): string | null;
  watchReplay(file: File): void;
  skipReplay(): void;
  readonly replaying: boolean;
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
  canDeepenNode(i: number): string | null;
  renameDistrict(d: number, name: string): void;
  undo(): boolean;
  undoLabel: string | null;
  centerOn(x: number, y: number): void;
  camera: Camera;
  selected: Building | null;
  select(b: Building | null): void;
  perf: { fps: number; ms: number; drawn: number };
  dev(id: string, arg: string): string;
}

const CATEGORIES: { id: string; name: string; filter: (d: BuildingDef) => boolean }[] = [
  { id: 'roads', name: 'Roads', filter: () => false },
  { id: 'zones', name: 'Zones', filter: () => false },
  { id: 'ley', name: 'Ley', filter: (d) => d.category === 'ley' },
  { id: 'water', name: 'Water', filter: (d) => d.category === 'water' },
  { id: 'service', name: 'Services', filter: (d) => d.category === 'service' },
  { id: 'leisure', name: 'Leisure', filter: (d) => d.category === 'leisure' || d.category === 'wonder' },
  { id: 'districts', name: 'Districts', filter: () => false },
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
        <button id="btn-chronicle" title="Chronicle: what has happened in the world (C)">Chronicle</button>
        <button id="btn-views" title="Info views (V)">Views</button>
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
      <div id="tasks" class="panel hidden"><h3>The Charter's Ledger <span class="prog muted"></span> <button class="done" title="Completed tasks">Done</button><button class="min" title="Collapse">–</button></h3><div class="score hidden"></div><div class="advice hidden"></div><div class="list"></div></div>
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
      <div id="chronicle" class="modal hidden"></div>
      <div id="dev" class="modal hidden" role="dialog" aria-label="Dev tools"></div>
    `;
    for (const id of ['topbar', 'toolbar', 'tooltip', 'views', 'demand', 'log', 'info', 'toast', 'title', 'help', 'budget', 'menu', 'gameover', 'perf', 'clock', 'tasks', 'edicts', 'chronicle', 'minimap', 'dev', 'lesson']) this.el[id] = this.q(`#${id}`);
    for (let s = 0; s <= 3; s++) this.q(`#sp-${s}`).onclick = () => (s === 0 ? this.host.togglePause() : this.host.setSpeed(s));
    this.q('#btn-budget').onclick = () => this.toggleBudget();
    this.q('#btn-edicts').onclick = () => this.toggleEdicts();
    this.q('#btn-chronicle').onclick = () => this.toggleChronicle();
    (this.q('#tasks .min') as HTMLButtonElement).onclick = () => { this.tasksCollapsed = !this.tasksCollapsed; this.lastQuestKey = ''; this.refreshTasks(); };
    (this.q('#tasks .done') as HTMLButtonElement).onclick = () => { this.showDone = !this.showDone; this.lastQuestKey = ''; this.refreshTasks(); };
    this.q('#btn-views').onclick = () => this.el.views.classList.toggle('hidden');
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
      for (const d of BUILDINGS.filter(cat.filter).filter((d) => buildsFor(factionOf(s), d))) {
        const locked = !canBuild(s, d.key);
        add(d.name, `${costOf(s, d)}c`, locked, t.kind === 'build' && t.key === d.key, () => this.host.setTool({ kind: 'build', key: d.key }), () => this.buildingTip(d, locked, costOf(s, d)));
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
    return `<div class="t">${d.name}</div>${d.desc}<br><span class="muted">${bits.join(' · ')}</span><br><span class="flavor">${d.flavor}</span>${locked ? `<br><span class="warn">${this.host.state.milestone >= d.unlock && specialLock(this.host.state, d.key) ? specialLock(this.host.state, d.key) : `Unlocks at ${this.ms()[d.unlock].name} (${this.ms()[d.unlock].pop} folk)`}</span>` : ''}`;
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
    tbTitle.textContent = `${this.ms()[s.milestone].name}${gate ? ` · next ${gate}` : ''}`;
    tbTitle.title = gate ? `Next milestone: ${gate}${gateMet(s) ? '' : ' (the happiness gate is not met today)'}` : 'The last milestone';
    tbTitle.classList.toggle('warn', !!gate && !gateMet(s));
    const season = SEASON_NAMES[Math.floor(s.day / DAYS_PER_SEASON) % 4];
    const year = 1 + Math.floor(s.day / (DAYS_PER_SEASON * 4));
    const tbDate = this.q('#tb-date');
    tbDate.textContent = `${(s.day % DAYS_PER_SEASON) + 1} ${season}, Y${year}`;
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
    // Re-evaluate at most every 20 ticks, when a quest completes, or on a change the player made while paused (a building
    // placed, a road or zone paid for): the status lines must not lag behind (iteration 93).
    const key = `${s.seed}:${s.day}:${Math.floor(s.tick / 20)}:${s.questsDone.length}:${this.tasksCollapsed}:${this.showDone}:${s.buildings.length}:${Math.round(s.treasury)}`;
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
      return;
    }
    const quests = activeQuests(s, 3, this.lessonOpen ? 'Districts' : undefined);
    list.innerHTML = quests.length
      ? quests.map((q, i) => `<div class="q ${i === 0 ? 'now' : ''}"><div class="t"><span class="ch">${q.chapter}</span> ${q.title}${q.reward ? ` <span class="rw">+${q.reward}</span>` : ''}</div><div class="h">${q.hint}${q.focus ? ` <button class="show" data-q="${q.id}">Show me</button>` : ''}</div>${((st) => (st ? `<div class="st">◦ ${st}</div>` : ''))(questStatus(s, q))}</div>`).join('')
      : '<div class="flavor">The Ledger is complete. Vell remembers your name.</div>';
    list.querySelectorAll('button.show').forEach((b) => {
      (b as HTMLButtonElement).onclick = () => {
        const q = quests.find((x) => x.id === (b as HTMLElement).dataset.q);
        if (q?.focus) this.focus(q.focus);
      };
    });
    (el.querySelector('.score') as HTMLElement).classList.add('hidden'); // the daily challenge's score line (parked, scope reset phase 1c)
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
      else if (f.panel === 'budget') this.toggleBudget(true);
      else if (f.panel === 'chronicle') this.toggleChronicle(true);
      else this.el.views.classList.remove('hidden');
    } else if ('overlay' in f) {
      this.host.setOverlay(f.overlay);
      this.el.views.classList.remove('hidden');
    } else if ('center' in f) {
      if (f.center === 'founding') this.host.centerOn(s.founding.x, s.founding.y);
      else if (f.center === 'node') { const n = s.nodes[0]; if (n) this.host.centerOn(n.x, n.y); }
      else if (f.center === 'ruins') { for (let i = 0; i < s.terrain.length; i++) if (s.terrain[i] === 8) { this.host.centerOn(i % s.w, (i / s.w) | 0); break; } }
      else if (f.center === 'cart') {
        // A donkey cart on the road (iteration 57): one carrying goods to a market if any, else any road cart; with none yet, the goods view.
        const road = s.agents.filter((a) => a.kind === AgentKind.Cart);
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
      if (def.zone === Zone.Market) rows.push(row('Goods on the shelves', `${Math.round(b.stock)} / ${marketStockCap(s, b)}`));
      if (def.zone === Zone.Market) { const door = roadTileOf(s, b); const f = marketRoadMultAt(s, door); rows.push(row('Road', `<span class="${f < 1 ? 'warn' : f > 1 ? 'good' : ''}">at the door, ${marketRoadWords(s, door)}</span>`)); if (f < 1 && door >= 0) problems.push('A dirt track at the door: cobble it and the market trades in full.'); }
      if (def.zone === Zone.Market && theftAt(s, b)) problems.push(`Theft: a tenth of the shelves a night. Watch here ${Math.round((s.coverage.watch[i] / 255) * 100)} %, unrest ${Math.round(s.unrest * 100)} %: a Watch Post over the market, or less unrest, stops it.`);
      if (def.zone === Zone.Craft) rows.push(row('Goods awaiting carts', `${Math.round(b.stock)} / ${craftStockCap(b)}`));
      if (def.zone === Zone.Craft && seasonOfState(s) === 3) rows.push(row('The Hush', `output ×${HUSH_CRAFT}`));
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
      if (b.state === 'burning') problems.push('ON FIRE! Water-Mages\' Hall coverage puts it out.');
      if (b.state === 'ruin') problems.push('A ruin. It will be cleared in a few days, or bulldoze it for free.');
      if (def.zone === Zone.Hearth && s.employed < workforceOf(s) * 0.85) problems.push('Not enough jobs in the city.');
    } else {
      rows.push(row('Upkeep', `${def.upkeep} c/day`));
      if (GROWING_HALLS.includes(b.kind)) rows.push(row('Hall', `${stakeHallName(s)} (grows with the city)`));
      if (def.manaUse) rows.push(row('Mana', `${manaUseOf(b)} / day${b.lit ? '' : ' (unlit!)'}`));
      if (def.service) rows.push(row('Radius', `${def.service.radius} tiles`));
      if (def.waterRadius) {
        const wr = waterRadiusOf(s, b);
        const near = wr > 0 && def.waterNearBonus && s.waterDist[idx(b.x, b.y)] <= 3 ? def.waterNearBonus : 0;
        const why = b.kind === 'well' && s.waterDist[idx(b.x, b.y)] > 8 ? ' (far from water: a Cistern lifts it further)' : near ? ' (dug near water)' : '';
        rows.push(row('Waters', `${wr + near} tiles${why}`));
        if (b.load !== undefined && wr > 0) { rows.push(row('Drawn', `${b.load} / ${waterCapAt(s, b)} levels of homes and works${lakeFed(s, b) ? ' (the lake feeds it: half again)' : ''}`)); if (b.load > waterCapAt(s, b)) problems.push('Overdrawn: its farthest homes are dry. Dig another well among them.'); }
      }
      if (b.kind === 'font' && (b.flare ?? 0) > 0) problems.push(`Bore flare: the yard smokes for ${b.flare} more day${b.flare === 1 ? '' : 's'} (miasma 6 within 4).`);
      if (b.kind === 'font' && fontsRunHot(s)) problems.push('Running hot: past nine tenths of the flow a Font may flare (one chance in fifty a day). Raise the flow or cut consumers.');
      if (def.capacity) {
        rows.push(row(def.service ? 'Crew' : 'Workers', `${b.workers} / ${capacityOf(b, s)}`));
        if (def.service && crewFactor(b, s) < 0.8) problems.push(`Short-handed: its coverage is at ${Math.round(crewFactor(b, s) * 100)} %. More folk, or fewer works competing for them.`);
      }
      if (def.service?.type === 'ward') {
        rows.push(row('Burns', `${wardBurnBudget(s, b)} grey tiles a day, the nearest first`));
        rows.push(row('Grey in reach', `${greyInReach(s, b)} tiles`));
      }
      if (def.goodsRate) rows.push(row('Carts', String(s.agents.filter((a) => a.kind === AgentKind.Cart && a.homeId === b.id).length)));
      if (def.needsMana && !b.lit) problems.push('Unlit: this building needs mana to work at full strength.');
      if (b.kind === 'spire' && !b.lit) problems.push('Not linked: a spire must be within 6 tiles of a ley node or a lit spire.');
      if (isLeyMember(b) && b.lit && b.load !== undefined) { rows.push(row('Load', `${Math.round(b.load)} / ${loadCapOf(b)} mana of buildings`)); if (b.load > loadCapOf(b)) problems.push('Overloaded: its farthest buildings go dark. Raise another spire among them.'); }
    }
    if (def.manaUse > 0 && !isLeyMember(b)) { const p = priorityOf(b); rows.push(row('Brownout', `<span class="prio">${[['Essential', 0], ['Normal', 1], ['Dim', 2]].map(([n, v]) => `<button data-prio="${v}" class="${p === v ? 'active' : ''}" title="When the ley runs short, Dim buildings go dark first, then Normal, then Essential">${n}</button>`).join(' ')}</span>`)); }
    if (def.zone === Zone.Arcane) rows.push(row('Leystone in the workshop', `${Math.round(b.stock)} / ${20 * b.level}`));
    if (def.leystone) {
      rows.push(row('Leystone awaiting carts', `${Math.round(b.stock)} / 60`));
      const seam = b.seam ?? SEAM;
      rows.push(row('Seam', seam > 0 ? `${Math.round((seam / SEAM) * 100)} % (${Math.round(seam)} leystone left)` : 'cut out'));
      if (seam <= 0) problems.push(`Spent: ${SPENT_RATE} a day of dust; the empty shaft wakes wardens three times as often. Bulldoze it or move on.`);
    }
    if (def.goodsRate) rows.push(row('Goods awaiting carts', `${Math.round(b.stock)} / ${craftStockCap(b)}`));
    if (b.kind === 'hospice') { rows.push(row('Draughts', `${Math.round(b.stock)} / ${HOSPICE_DRAUGHTS} (2 goods a day from the fullest market within 16)`)); if (b.stock <= 0) problems.push('No draughts: with no goods on the shelf it heals at six tenths. A market within 16 tiles.'); }
    if (b.kind === 'veshari' && !b.watered) problems.push('Dry: a fire hall without water fights at half strength. A well within reach.');
    if (b.kind === 'grandacademy') rows.push(row('Artifact prices', `${grandAcademyBonus(s) > 1 ? `+${Math.round((grandAcademyBonus(s) - 1) * 100)} %` : 'no bonus yet'} (+5 % per tenth of the city educated above four tenths; educated ${Math.round(s.educated * 100)} %)`));
    if (isDepot(b.kind)) {
      const rt = tradeRoutes(s); rows.push(row('Routes', rt.filter((r) => r.open).map((r) => r.name).join(', ') || 'none'));
    }
    const dist = s.district[i];
    if (dist) rows.push(row('District', `<span style="color:${DISTRICT_COLORS[dist - 1]}">${districtName(s, dist)}</span>`));
    if (def.zone === Zone.Arcane && b.stock <= 0.5 && b.age > 3) problems.push('No leystone: build a Crystal Mine in the hills with a road to this district.');
    rows.push(row('Mana', b.lit ? '<span class="ley">lit</span>' : '<span class="bad">unlit</span>'));
    rows.push(row('Water', b.watered ? '<span class="good">watered</span>' : '<span class="bad">dry</span>'));
    if (b.state === 'building') { const ba = buildersAt(s, b); rows.push(row('Construction', `${Math.round((1 - b.work / Math.max(1, b.workTotal)) * 100)}% · ${ba.present} builder${ba.present === 1 ? '' : 's'} at work${ba.assigned > ba.present ? `, ${ba.assigned - ba.present} on the way` : ''}`)); if (def.category === 'zone') rows.pop(), rows.push(row('Construction', `${Math.round((1 - b.work / Math.max(1, b.workTotal)) * 100)}% · raised by the folk who will live here`)); else if (!ba.assigned && builderTarget(s) > 0) problems.push('No builder can reach this site by road from the Founding Stake; the folk raise it themselves at a quarter pace.'); }
    el.innerHTML = `<button class="close">✕</button><h2>${def.name}</h2><div class="muted">(${b.x},${b.y}) · ${b.w}×${b.h} · ${b.state}${def.category === 'zone' ? ` · age ${b.age}d` : ''}</div>${rows.join('')}<div class="problems">${problems.map((p) => `<div>⚠ ${p}</div>`).join('')}</div><p class="flavor">${def.flavor}</p>`;
    el.querySelector('.close')!.addEventListener('click', () => this.host.select(null));
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
    const rows = [
      row('Flow', `${Math.round(nodeFlowOf(s, i) * factionOf(s).rules.nodeMana)} mana / day`),
      row('Linked', s.nodeLinked[i] === false ? `<span class="warn">no: it seeps ${Math.round(90 * NODE_SEEP * factionOf(s).rules.nodeMana)} into the ground; a lit spire, stake or hall within 6 tiles draws the rest (and its depth)</span>` : 'yes: a lit spire, stake or hall within 6 tiles draws its full flow'),
      row('Deepened', `${depth} / ${NODE_DEEPEN_COST.length}`),
      row('City mana', `${Math.round(s.manaDemand)} / ${Math.round(s.manaSupply)}`),
    ];
    const title = founding ? 'The Founding Wellspring' : 'Ley Node';
    el.innerHTML = `<button class="close">✕</button><h2>${title}</h2><div class="muted">(${n.x},${n.y}) · a Vein breaking the surface</div>${rows.join('')}
      <p class="muted">Ley Spires within 6 tiles of a node drink from it. Deepening the Wellspring (from Burgh) adds ${NODE_DEEPEN_MANA} mana a day, twice at most.</p>
      <button id="n-deepen" ${why ? 'disabled' : ''}>Deepen the Wellspring (${depth < NODE_DEEPEN_COST.length ? NODE_DEEPEN_COST[depth] + ' crowns' : 'done'})</button>
      ${why ? `<div class="muted" style="margin-top:4px">${why}</div>` : ''}
      <p class="flavor">${founding ? 'The first light of the valley. It hums a half-tone flat when the dead are restless.' : 'Grass grows in spirals here. Children are told not to sleep within a stone\'s throw of it, and do anyway.'}</p>`;
    el.querySelector('.close')!.addEventListener('click', () => { this.host.select(null); (this.host as { selectedNode: number }).selectedNode = -1; el.classList.add('hidden'); });
    (el.querySelector('#n-deepen') as HTMLButtonElement).onclick = () => this.host.deepenNode(i);
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
          case Terrain.LeyNode: return PAL.ley1;
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
            <li><kbd>B</kbd> bulldoze · <kbd>Shift</kbd>+<kbd>G</kbd> grid · <kbd>C</kbd> Chronicle · <kbd>H</kbd> this help · keys can be rebound in Menu → Key bindings</li>
            <li><b>The Charter's Ledger</b> (top left) lists your next tasks. Under most, a blue line says what it still needs right now: not built yet, being built and how far, built but unlit, or a count against its target.</li>
            <li>The map beyond the <b>Charter</b> is dimmed: click it to see the price and extend the Charter (from Hamlet). The Gloam inside a bought sector draws back.</li>
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
            <li><b>Serve</b>: Watch, Healers, Water-Mages\' Hall (fire), Boneyard (the dead!), Wards (the Gloam!).</li>
            <li>Watch the <b>tithe</b>. Raise taxes carefully. Hit population milestones to unlock more.</li>
            <li><b>Goods</b>: Craft works fill donkey carts; the carts feed Markets by road (the mines' carts carry leystone). A market trades by the road at its door: a cobbled road in full, a dirt track a tenth less (a fifth in the mud of the Thaw and the Hush), a lit Lantern-way or a Glowvine Lane a tenth more. Empty shelves and idle stills both hurt.</li>
            <li>The <b>Charter's Ledger</b> (left) lists the next three tasks with a hint and a <b>Show me</b> button; the <b>Advisor</b> line names the worst problem right now. The <b>Chronicle</b> (top bar, <kbd>C</kbd>) records what has actually happened in the world, with a ⌖ to go there.</li>
            <li><b>Edicts</b> (top bar) are policies with daily costs.</li>
            <li><b>Seasons</b> last 30 days. The Hush brings long nights, hungrier hearths and a bolder Gloam.</li>
            <li><b>Click a ley node</b> to see its flow; from Burgh you can deepen it for more mana. A <b>Trade Depot</b> sells surplus goods on the Gloam road at the season's price.</li>
            <li><b>The Gloam's pressure</b> rises with the dead and falls with faith.</li>
            <li>Every lit <b>wonder hall</b> delights the city (+5) and lifts the next grant a tenth.</li>
            <li>The Ledger lists every <b>trade route</b>.</li>
            <li>Panels: the <b>Info views</b>, <b>minimap</b> and message ticker can be dragged by their ⋮⋮ grip. Click or drag on the <b>minimap</b> to jump there; scroll on it to zoom.</li>
            <li><b>Unrest</b>: an unwatched market loses a tenth of its shelves a night while unrest is over 30 %. While placing a spire, a well or a service hall, the reach of the ones already standing is drawn, so you can see where the new one links or where the gaps are. Selecting a building rings everything it reaches, labelled (its water, watch or light, and the rest: the Hospice's draughts, a quay's works, a lodge's hunting grounds), above the houses and through the night, with its kin's reach faint around it.</li>
            <li><b>Districts</b> open in steps: two at the Hamlet, four at the Village, six at the Market Town, all eight at the Burgh; charters the same way (Hearth and Craft first, Market at the Village, Scholars' at the Township, Temple at the Market Town). A charter costs a crown a building a day and holds ${CHARTER_LOCK_DAYS} days; a Craft quarter's smoke drifts four tiles past its edge, a Temple quarter takes a tenth of the city's market tithe. An <b>edict</b> holds ${EDICT_MIN_DAYS} days and costs ${EDICT_REPEAL} crowns to repeal. A road at a building's corner counts as its door.</li>
            <li><b>The Crown</b> levies 5 % of the treasury above 10,000 each Thaw, lends 10,000 a milestone at half a percent a day (Ledger), and charges 1 % a day on a debt. Its <b>favour</b> (50 is neutral) moves sector prices and the levy by 0.3 % a point; under ${FAVOUR_AUDIT} the auditors hold the next grant. The top bar names the <b>next gate</b>: happiness 45 + 3 × the milestone, and for the Beacon the Lantern of Vell lit.</li>
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
      <div class="row"><button id="t-new">Found a new wardlight</button><button id="t-continue">Continue</button><button id="t-import">Import Charter (.json)</button><button id="t-replay" title="Watch a charter played again from its replay file">Watch a replay</button></div><input type="file" id="t-rfile" accept=".json" class="hidden">
      <input type="file" id="t-file" accept=".json" class="hidden">
      <p class="muted" style="font-size:11px">Runs entirely in your browser. Autosaves every day to this browser. Press <b>H</b> in game for help.</p>
    </div>`;
    const t = this.el.title;
    t.querySelectorAll('.names button').forEach((b) => ((b as HTMLButtonElement).onclick = () => ((t.querySelector('#t-name') as HTMLInputElement).value = (b as HTMLElement).dataset.name!)));
    (t.querySelector('#t-new') as HTMLButtonElement).onclick = () => {
      const name = (t.querySelector('#t-name') as HTMLInputElement).value.trim() || 'Thornwick';
      const seed = Number((t.querySelector('#t-seed') as HTMLInputElement).value) || 1;
      this.host.newGame(seed >>> 0, name);
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
        <button id="m-help">Help <kbd>H</kbd></button>
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
    (m.querySelector('#m-help') as HTMLButtonElement).onclick = () => { this.toggleMenu(false); this.toggleHelp(true); };
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
    set('trade', `${l.trade >= 0 ? '+' : ''}${l.trade.toFixed(0)}${st.trade.imported ? ` · imported ${st.trade.imported} for ${Math.round(st.trade.importCost)}` : ''}`);
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
    favEl.title = `The Crown's favour (nothing moves it since the tales and the relics are parked). Each point from ${FAVOUR_NEUTRAL} is ${FAVOUR_STEP * 100} % on sector prices and the Thaw levy; under ${FAVOUR_AUDIT} the auditors hold the next grant.`;
    const loanEl = this.el.budget.querySelector('[data-k="loan"]') as HTMLElement;
    loanEl.innerHTML = st.loan > 0 ? `${Math.round(st.loan).toLocaleString()} out at ${LOAN_INTEREST * 100} %/day <button class="show" id="b-repay">Repay</button>` : `none <button class="show" id="b-loan">Take ${loanLimit(st).toLocaleString()}</button>`;
    loanEl.className = `r ${st.loan > 0 ? 'warn' : ''}`;
    const loanBtn = loanEl.querySelector('#b-loan') as HTMLButtonElement | null;
    if (loanBtn) loanBtn.onclick = () => { const why = this.host.takeLoan(); if (why) this.toast(`<p class="bad">${why}</p>`, 2500); this.refreshBudget(); this.refresh(); };
    const repayBtn = loanEl.querySelector('#b-repay') as HTMLButtonElement | null;
    if (repayBtn) repayBtn.onclick = () => { const why = this.host.repayLoan(); if (why) this.toast(`<p class="bad">${why}</p>`, 2500); this.refreshBudget(); this.refresh(); };
    set('social', `Unrest ${Math.round(st.unrest * 100)}% cuts yields. Happiness ${Math.round(st.happiness)}. Health ${Math.round(st.health * 100)}%. Educated ${Math.round(st.educated * 100)}%. Unquieted dead: ${Math.round(st.unquieted)}. Dead today ${st.deathsToday} · quieted ${Math.round(st.quietedToday)} / capacity ${Math.round(st.quietCap)} · waiting ${Math.round(st.waitingDead)}.${idleScholars(st) ? ' Idle scholars: more than half the city is schooled with little Arcane work, +5 unrest.' : ''}${st.stats.goodsStolen > 0 ? ` Stolen from unwatched shelves: ${Math.round(st.stats.goodsStolen)} goods.` : ''}`);
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
        <div class="muted">${e.desc}${locked ? ` <span class="warn">Unlocks at ${this.ms()[e.unlock].name}.</span>` : ''}</div>
        <div class="flavor">${e.flavor}</div>
      </div>`;
    });
    this.el.edicts.innerHTML = `<div class="box panel">
      <h2>Edicts of the Warden-Reeve</h2>
      <p class="muted">Edicts take effect immediately and cost their upkeep every day; an edict holds ${EDICT_MIN_DAYS} days once made and costs ${EDICT_REPEAL} crowns to repeal. Scope: ${scopeSel}${inUse.length ? '' : ' <span class="muted">(paint districts from the toolbar to set edicts per district)</span>'}</p>
      ${stats}
      ${rows.join('')}
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
    const status = `Day ${s.day} tick ${s.tick} · ${s.population} folk · ${Math.round(s.treasury)} crowns · mana ${Math.round(s.manaSupply)}/${Math.round(s.manaDemand)} · pressure ${Math.round(s.gloamPressure * 100)}% · ${sites(s).length} sites, ${s.agents.filter((a) => a.kind === 4).length} builders · favour ${Math.round(s.crownFavour)} · instant build ${construction.instant ? 'on' : 'off'} · dev uses ${s.stats.devUses}`;
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

  showGameOver(): void {
    const s = this.host.state;
    if (!this.el.gameover.classList.contains('hidden')) return;
    // every loss names its cause (iteration 70): a title, and the numbers that brought it
    const title = { restless: 'The Long Night', gloam: 'The Gloam takes the node', crown: 'The Charter is revoked' }[s.lostTo ?? 'gloam'] ?? 'The light goes out';
    const cause = s.lostTo === 'restless' ? `The restless walking: ${s.agents.filter((a) => a.kind === 2).length}.` : '';
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
