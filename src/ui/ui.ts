/** DOM UI: top bar, toolbar, info views, demand, log, building info, modals. */
import { BUILDINGS, BUILDING_BY_KEY, MILESTONES, ROADS, ROAD_BY_TYPE, isBuildingUnlocked, isRoadUnlocked, isZoneUnlocked, type BuildingDef } from '../sim/catalog';
import { computeLedger } from '../sim/economy';
import { capacityOf, computeBuildingHappiness, workforceOf } from '../sim/growth';
import { manaUseOf } from '../sim/networks';
import { RoadType, Zone, idx, type Building, type GameState } from '../sim/types';
import { CITY_NAMES, timeOfDay } from '../sim/world';
import { OVERLAY_LIST, OVERLAYS } from '../render/overlays';
import { TIPS } from '../data/flavor';
import type { Tool } from './tools';

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
  setMuted(m: boolean): void;
  setTax(zone: keyof GameState['taxRates'], v: number): void;
  centerOn(x: number, y: number): void;
  selected: Building | null;
  select(b: Building | null): void;
  perf: { fps: number; ms: number; drawn: number };
}

const CATEGORIES: { id: string; name: string; filter: (d: BuildingDef) => boolean }[] = [
  { id: 'roads', name: 'Roads', filter: () => false },
  { id: 'zones', name: 'Zones', filter: () => false },
  { id: 'ley', name: 'Ley', filter: (d) => d.category === 'ley' },
  { id: 'water', name: 'Water', filter: (d) => d.category === 'water' },
  { id: 'service', name: 'Services', filter: (d) => d.category === 'service' },
  { id: 'leisure', name: 'Leisure', filter: (d) => d.category === 'leisure' || d.category === 'wonder' },
];

const SEASONS = ['Thaw', 'Bloom', 'Ember', 'Hush'];

export class UI {
  root: HTMLElement;
  category = 'roads';
  private el: Record<string, HTMLElement> = {};
  private lastLogLen = -1;
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
        <div class="stat"><span class="v" id="tb-jobs"></span><span class="l">jobs</span></div>
        <div class="stat"><span class="v ley" id="tb-mana"></span><span class="l">mana use / flow</span></div>
        <div class="stat"><span class="v" id="tb-happy"></span><span class="l">happiness</span></div>
        <div class="stat"><span class="v" id="tb-unrest"></span><span class="l">unrest</span></div>
        <div class="spacer"></div>
        <div class="speed">
          <button id="sp-0" title="Pause (Space)">❚❚</button>
          <button id="sp-1" title="Normal (,/.)">1×</button>
          <button id="sp-2">2×</button>
          <button id="sp-3">3×</button>
        </div>
        <button id="btn-budget" title="Tithe & budget">Budget</button>
        <button id="btn-views" title="Info views (Tab)">Views</button>
        <button id="btn-help" title="Help (H)">Help</button>
        <button id="btn-menu" title="Menu">Menu</button>
      </div>
      <div id="toolbar" class="panel">
        <div class="tabs"></div>
        <div class="items"></div>
        <div class="quick">
          <button id="q-select" title="Select (X)">Select</button>
          <button id="q-bulldoze" title="Bulldoze (B)">Bulldoze</button>
        </div>
        <div class="hint"></div>
      </div>
      <div id="tooltip" class="panel hidden"></div>
      <div id="views" class="panel hidden"><h3>Info views</h3><div class="list"></div><div class="legend"></div></div>
      <div id="demand" class="panel"></div>
      <div id="log" class="panel"></div>
      <div id="info" class="panel hidden"></div>
      <div id="perf" class="panel"></div>
      <div id="toast" class="panel hidden"></div>
      <div id="title" class="modal"></div>
      <div id="help" class="modal hidden"></div>
      <div id="budget" class="modal hidden"></div>
      <div id="menu" class="modal hidden"></div>
      <div id="gameover" class="modal hidden"></div>
    `;
    for (const id of ['topbar', 'toolbar', 'tooltip', 'views', 'demand', 'log', 'info', 'toast', 'title', 'help', 'budget', 'menu', 'gameover', 'perf', 'clock']) this.el[id] = this.q(`#${id}`);
    for (let s = 0; s <= 3; s++) this.q(`#sp-${s}`).onclick = () => (s === 0 ? this.host.togglePause() : this.host.setSpeed(s));
    this.q('#btn-budget').onclick = () => this.toggleBudget();
    this.q('#btn-views').onclick = () => this.el.views.classList.toggle('hidden');
    this.q('#btn-help').onclick = () => this.toggleHelp();
    this.q('#btn-menu').onclick = () => this.toggleMenu();
    this.q('#q-select').onclick = () => this.host.setTool({ kind: 'select' });
    this.q('#q-bulldoze').onclick = () => this.host.setTool({ kind: 'bulldoze' });
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
        const locked = !isRoadUnlocked(s.milestone, r.type);
        add(r.name, `${r.cost}c/tile`, locked, t.kind === 'road' && t.type === r.type, () => this.host.setTool({ kind: 'road', type: r.type }), () => `<div class="t">${r.name}</div>${r.desc}<br><span class="muted">Cost ${r.cost}/tile · upkeep ${r.upkeep}/day${r.manaUse ? ` · ${r.manaUse} mana/tile` : ''}${locked ? `<br>Unlocks at ${MILESTONES[r.unlock].name}` : ''}</span>`);
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
        add(name, 'free', locked, t.kind === 'zone' && t.zone === z, () => this.host.setTool({ kind: 'zone', zone: z }), () => `<div class="t">${def.name}</div>${def.desc}<br><span class="flavor">${def.flavor}</span>${locked ? `<br><span class="muted">Unlocks at ${MILESTONES[def.unlock].name}</span>` : ''}`);
      }
      add('De-zone', '', false, t.kind === 'zone' && t.zone === Zone.None, () => this.host.setTool({ kind: 'zone', zone: Zone.None }), () => `<div class="t">De-zone</div>Removes zoning (and any zoned building) from the area.`);
    } else {
      const cat = CATEGORIES.find((c) => c.id === this.category)!;
      for (const d of BUILDINGS.filter(cat.filter)) {
        const locked = !isBuildingUnlocked(s.milestone, d.key);
        add(d.name, `${d.cost}c`, locked, t.kind === 'build' && t.key === d.key, () => this.host.setTool({ kind: 'build', key: d.key }), () => this.buildingTip(d, locked));
      }
    }
    this.q('#q-select').classList.toggle('active', t.kind === 'select');
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
    return `<div class="t">${d.name}</div>${d.desc}<br><span class="muted">${bits.join(' · ')}</span><br><span class="flavor">${d.flavor}</span>${locked ? `<br><span class="warn">Unlocks at ${MILESTONES[d.unlock].name} (${MILESTONES[d.unlock].pop} folk)</span>` : ''}`;
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
    this.q('#tb-title').textContent = MILESTONES[s.milestone].name;
    const season = SEASONS[Math.floor(s.day / 90) % 4];
    const year = 1 + Math.floor(s.day / 360);
    this.q('#tb-date').textContent = `${(s.day % 90) + 1} ${season}, Y${year}`;
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
    const un = this.q('#tb-unrest');
    un.textContent = `${Math.round(s.unrest * 100)}%`;
    un.className = `v ${s.unrest > 0.4 ? 'bad' : s.unrest > 0.25 ? 'warn' : ''}`;
    for (let k = 0; k <= 3; k++) this.q(`#sp-${k}`).classList.toggle('active', k === 0 ? h.paused : !h.paused && h.speed === k);
    this.drawClock();
    this.refreshDemand();
    this.refreshLog();
    this.refreshInfo();
    this.el.perf.textContent = `${h.perf.fps} fps · render ${h.perf.ms.toFixed(1)} ms · ${h.perf.drawn} sprites · ${s.agents.length} agents · tick ${s.tick}`;
    if (s.milestone !== this.lastMilestone) {
      if (this.lastMilestone >= 0) this.toast(`<h2>${s.cityName} is now a ${MILESTONES[s.milestone].name}</h2><p>${MILESTONES[s.milestone].text}</p><p class="muted">Grant: +${MILESTONES[s.milestone].grant} crowns. New buildings unlocked in the toolbar.</p>`, 9000);
      this.lastMilestone = s.milestone;
      this.refreshItems();
    }
    if (s.gameOver) this.showGameOver();
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
    if (s.messages.length === this.lastLogLen && this.el.log.children.length) return;
    this.lastLogLen = s.messages.length;
    const last = s.messages.slice(-7).reverse();
    this.el.log.innerHTML = last.map((m) => `<div class="m ${m.kind}"><span class="d">d${Math.floor(m.tick / 900)}</span>${m.text}</div>`).join('');
  }

  private refreshInfo(): void {
    const b = this.host.selected;
    const el = this.el.info;
    if (!b) {
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
      const cap = capacityOf(b);
      rows.push(row('Level', `${b.level} / 3`));
      if (def.zone === Zone.Hearth) rows.push(row('Residents', `${b.residents} / ${cap}`));
      else rows.push(row('Workers', `${b.workers} / ${cap}`));
      const hp = b.state === 'ok' ? computeBuildingHappiness(s, b) : 0;
      rows.push(row('Happiness', `${Math.round(hp)}`));
      rows.push(row('Land value', `${s.landValue[i]}`));
      rows.push(row('Level-up progress', `${Math.max(0, Math.round(b.progress))}%`));
      if (!b.lit) problems.push('No mana: build a Ley Spire within 5 tiles or next to a lit building.');
      if (!b.watered) problems.push('No water: build a Well or Cistern nearby.');
      if (s.miasma[i] > 60) problems.push('Choking on miasma from nearby Craft works.');
      if (s.gloamDist[i] < 6) problems.push('The Gloam whispers nearby. Raise a Ward Lantern.');
      if (cov.death[i] < 30 && def.zone === Zone.Hearth) problems.push('No Boneyard covers this home; its dead will not rest.');
      if (s.trafficSmooth[i] > 170) problems.push('Traffic jam outside.');
      if (b.state === 'abandoned') problems.push('Abandoned. Fix the problems and folk will return, or bulldoze it.');
      if (b.state === 'burning') problems.push('ON FIRE! Veshari Hall coverage puts it out.');
      if (b.state === 'ruin') problems.push('A ruin. It will be cleared in a few days, or bulldoze it for free.');
      if (def.zone === Zone.Hearth && s.employed < workforceOf(s) * 0.85) problems.push('Not enough jobs in the city.');
    } else {
      rows.push(row('Upkeep', `${def.upkeep} c/day`));
      if (def.manaUse) rows.push(row('Mana', `${manaUseOf(b)} / day${b.lit ? '' : ' (unlit!)'}`));
      if (def.service) rows.push(row('Radius', `${def.service.radius} tiles`));
      if (def.waterRadius) rows.push(row('Waters', `${def.waterRadius} tiles`));
      if (def.needsMana && !b.lit) problems.push('Unlit: this building needs mana to work at full strength.');
      if (b.kind === 'spire' && !b.lit) problems.push('Not linked: a spire must be within 6 tiles of a ley node or a lit spire.');
    }
    rows.push(row('Mana', b.lit ? '<span class="ley">lit</span>' : '<span class="bad">unlit</span>'));
    rows.push(row('Water', b.watered ? '<span class="good">watered</span>' : '<span class="bad">dry</span>'));
    el.innerHTML = `<button class="close">✕</button><h2>${def.name}</h2><div class="muted">(${b.x},${b.y}) · ${b.w}×${b.h} · ${b.state}${def.category === 'zone' ? ` · age ${b.age}d` : ''}</div>${rows.join('')}<div class="problems">${problems.map((p) => `<div>⚠ ${p}</div>`).join('')}</div><p class="flavor">${def.flavor}</p>`;
    el.querySelector('.close')!.addEventListener('click', () => this.host.select(null));
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
            <li><kbd>B</kbd> bulldoze · <kbd>G</kbd> grid · <kbd>H</kbd> this help</li>
            <li><kbd>Space</kbd> pause · <kbd>,</kbd> <kbd>.</kbd> slower / faster</li>
            <li><kbd>1</kbd>–<kbd>0</kbd> <kbd>-</kbd> <kbd>=</kbd> <kbd>G</kbd> <kbd>M</kbd> info views · <kbd>Tab</kbd> view list</li>
            <li><kbd>F5</kbd> quick save · <kbd>F9</kbd> quick load</li>
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
      <h1>WARDLIGHT</h1>
      <div class="muted" style="margin-bottom:10px">a city of Eda</div>
      <p class="lore">Three hundred years after the Hollowing, the world of Eda is islands of light in a grey sea. The Ashen Crown of Vell has surveyed a young ley node in a river valley at the edge of the Gloam, and granted you a Charter: <i>light it, hold it, and make it pay.</i> Draw roads, zone hearths and markets, raise spires to carry the ley, and keep the dead quiet. Grow a camp into a Beacon of Eda.</p>
      <div class="row"><label>Valley name</label><input type="text" id="t-name" value="${CITY_NAMES[Math.floor(Math.random() * CITY_NAMES.length)]}"><label>Seed</label><input type="number" id="t-seed" value="${Math.floor(Math.random() * 99999)}" style="width:100px"></div>
      <div class="names">${names}</div>
      <div class="row"><button id="t-new">Found a new wardlight</button><button id="t-continue">Continue</button><button id="t-import">Import Charter (.json)</button></div>
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
    const file = t.querySelector('#t-file') as HTMLInputElement;
    (t.querySelector('#t-import') as HTMLButtonElement).onclick = () => file.click();
    file.onchange = () => {
      if (file.files?.[0]) {
        this.host.importJson(file.files[0]);
        t.classList.add('hidden');
      }
    };
  }

  showTitle(): void {
    (this.el.title.querySelector('#t-continue') as HTMLButtonElement).disabled = !this.host.hasSave();
    this.el.title.classList.remove('hidden');
  }

  private buildMenu(): void {
    this.el.menu.innerHTML = `<div class="box panel" style="width:360px">
      <h2>Menu</h2>
      <div class="row" style="display:flex;flex-direction:column;gap:6px">
        <button id="m-save">Save Charter (browser)</button>
        <button id="m-export">Export Charter as .json</button>
        <button id="m-import">Import Charter from .json</button>
        <button id="m-mute">Sound: on</button>
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

  refreshBudget(): void {
    if (this.el.budget.classList.contains('hidden')) return;
    const st = this.host.state;
    const l = computeLedger(st);
    const tax = (key: keyof GameState['taxRates'], label: string) => `<div class="tax"><label>${label}</label><input type="range" min="0" max="30" value="${st.taxRates[key]}" data-zone="${key}"><output>${st.taxRates[key]}%</output></div>`;
    this.el.budget.innerHTML = `<div class="box panel">
      <h2>Tithe &amp; Budget</h2>
      <table>
        <tr><td>Hearth tithe</td><td class="r good">+${l.taxHearth.toFixed(0)}</td></tr>
        <tr><td>Market tithe</td><td class="r good">+${l.taxMarket.toFixed(0)}</td></tr>
        <tr><td>Craft tithe</td><td class="r good">+${l.taxCraft.toFixed(0)}</td></tr>
        <tr><td>Arcane tithe</td><td class="r good">+${l.taxArcane.toFixed(0)}</td></tr>
        <tr><td>Road upkeep</td><td class="r bad">−${l.upkeepRoads.toFixed(0)}</td></tr>
        <tr><td>Building upkeep</td><td class="r bad">−${l.upkeepBuildings.toFixed(0)}</td></tr>
        <tr><td><b>Net per day</b></td><td class="r ${l.net >= 0 ? 'good' : 'bad'}"><b>${l.net >= 0 ? '+' : ''}${l.net.toFixed(0)}</b></td></tr>
        <tr><td>Treasury</td><td class="r gold">${Math.round(st.treasury)}</td></tr>
      </table>
      <h3 style="margin-top:10px">Tax rates (10% is what folk expect)</h3>
      ${tax('hearth', 'Hearth')}${tax('market', 'Market')}${tax('craft', 'Craft')}${tax('arcane', 'Arcane')}
      <p class="muted">Unrest ${Math.round(st.unrest * 100)}% cuts yields. Happiness ${Math.round(st.happiness)}. Health ${Math.round(st.health * 100)}%. Educated ${Math.round(st.educated * 100)}%. Unquieted dead: ${Math.round(st.unquieted)}.</p>
      <p class="muted">Last 10 days net: ${st.ledgerHistory.slice(-10).map((v) => (v >= 0 ? '+' : '') + v).join(', ') || 'n/a'}</p>
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
  }

  showGameOver(): void {
    const s = this.host.state;
    if (!this.el.gameover.classList.contains('hidden')) return;
    this.el.gameover.innerHTML = `<div class="box panel">
      <h2>The light goes out</h2>
      <p>${s.gameOver}</p>
      <p class="muted">${s.cityName} reached ${MILESTONES[s.milestone].name} with a peak of ${s.stats.peakPopulation} folk over ${s.day} days. Fires: ${s.stats.firesTotal}. Surges: ${s.stats.surgesTotal}. Restless risen: ${s.stats.restlessTotal}.</p>
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
