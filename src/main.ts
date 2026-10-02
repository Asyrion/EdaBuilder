import type { FactionId } from './data/factions';
import { costOf } from './data/factions';
import { QUARTER_BY_ID, districtBuildings, setQuarter } from './sim/districts';
import { SpriteAtlas } from './render/atlas';
import { Renderer, type ViewState } from './render/renderer';
import { createGame, districtName, timeOfDay } from './sim/world';
import { createScenario } from './sim/scenario';
import { canFoundDaughter, foundDaughter } from './sim/charter';
import { SOUND_CUES, type SoundCue } from './sim/hazards';
import { buySector } from './sim/sectors';
import { tileToWorld, worldToTile } from './render/iso';
import { runDev } from './sim/dev';
import { charterGuilds } from './sim/guilds';
import { createChallenge } from './sim/scenario';
import { DEFAULT_KEYS, keyFor, type KeyAction } from './ui/keys';
import type { Scenario } from './sim/types';
import { tick, recomputeAll } from './sim/sim';
import { serialize, deserialize } from './sim/save';
import { TICKS_PER_SEC, Zone, type Building, type GameState } from './sim/types';
import { Tools, toolLabel, type Tool } from './ui/tools';
import { UI } from './ui/ui';
import { Audio } from './audio/audio';
import { setTax } from './sim/actions';
import { drainEffects } from './sim/hazards';
import { nightFactor } from './render/palette';
import { BUILDING_BY_KEY, MILESTONES } from './sim/catalog';
import { bumpRoadVersion } from './sim/agents';
import { resolveEvent, maybeFireEvent, ALL_EVENTS } from './sim/events';
import { ramps } from './render/overlays';
import * as actions from './sim/actions';
import { takeSnapshot, restoreSnapshot, callRain, type Snapshot } from './sim/actions';
import { deepenNode, canDeepenNode, placeBuildingRaw } from './sim/world';
import { setTraining, setRole } from './sim/wyrmcraft';
import * as wyrm from './sim/wyrm';
import { Bot } from './sim/bot';

const SAVE_KEY = 'wardlight.save.v1';

class Game {
  state: GameState;
  renderer: Renderer;
  view: ViewState = { overlay: null, hover: null, previewTiles: [], previewZone: Zone.None, previewDistrict: -1, ghost: null, selected: null, showGrid: false };
  tools!: Tools;
  ui!: UI;
  audio = new Audio();
  speed = 1;
  paused = false;
  selected: Building | null = null;
  selectedNode = -1;
  selectedSector = -1;
  undoStack: Snapshot[] = [];
  muted = false;
  settings: { colorBlind: boolean; uiScale: number; keys: Record<KeyAction, string> } = { colorBlind: false, uiScale: 1, keys: { ...DEFAULT_KEYS } };
  perf = { fps: 60, ms: 0, drawn: 0 };
  private acc = 0;
  private last = 0;
  private uiTimer = 0;
  private frames = 0;
  private fpsTimer = 0;
  private lastDay = 0;
  private running = false;

  constructor(atlas: SpriteAtlas) {
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    canvas.tabIndex = 0;
    this.renderer = new Renderer(canvas, atlas);
    this.renderer.resize();
    window.addEventListener('resize', () => this.renderer.resize());
    this.state = createGame(1, 'Thornwick');
    this.tools = new Tools({
      state: this.state,
      view: this.view,
      canvas,
      camera: this.renderer.camera,
      onAction: (kind, msg) => this.onAction(kind, msg),
      onSelect: (b) => this.select(b),
      onSelectNode: (i) => { this.selectedNode = i; this.ui.refresh(); },
      onSelectSector: (k) => { this.selectedSector = k; this.ui.refresh(); },
      beforeAction: (label) => this.pushUndo(label),
      onKey: (k, e) => this.onKey(k, e),
      keys: () => this.settings.keys,
      refreshUI: () => {
        this.ui.refreshItems();
        this.ui.refreshViews();
        this.updateHint();
      },
    });
    const game = this;
    this.ui = new UI({
      get state() { return game.state; },
      get speed() { return game.speed; },
      get paused() { return game.paused; },
      get tool() { return game.tools.tool; },
      get overlay() { return game.view.overlay; },
      get muted() { return game.muted; },
      get selected() { return game.selected; },
      get perf() { return game.perf; },
      setSpeed: (s) => { this.speed = s; this.paused = false; this.ui.refresh(); },
      togglePause: () => { this.paused = !this.paused; this.ui.refresh(); },
      setTool: (t) => this.tools.setTool(t),
      setOverlay: (id) => { this.view.overlay = id as ViewState['overlay']; this.ui.refreshViews(); },
      newGame: (seed, name, scenario, faction) => this.newGame(seed, name, scenario, faction),
      continueGame: () => this.load(),
      hasSave: () => !!localStorage.getItem(SAVE_KEY),
      save: () => this.save(),
      exportJson: () => this.exportJson(),
      importJson: (f) => this.importJson(f),
      setMuted: (m) => { this.muted = m; this.audio.setMuted(m); },
      get musicOn() { return game.audio.musicOn; },
      setMusic: (on) => { this.audio.setMusic(on); try { localStorage.setItem('wardlight.music', on ? '1' : '0'); } catch { /* ignore */ } },
      setTax: (z, v) => setTax(this.state, z, v),
      setEdict: (k, on, district) => { if (district) this.state.districtEdicts[`${district}:${k}`] = on; else this.state.edicts[k] = on; recomputeAll(this.state); this.audio.click(); },
      get settings() { return game.settings; },
      get selectedNode() { return game.selectedNode; },
      get selectedSector() { return game.selectedSector; },
      buySector: (k) => { const why = buySector(this.state, k); if (!why) { recomputeAll(this.state); this.renderer.invalidateAll(); this.audio.milestone(); this.selectedSector = -1; } return why; },
      deepenNode: (i) => { const why = deepenNode(this.state, i); if (why) this.ui.setHint(`<span class="bad">${why}</span>`); else { recomputeAll(this.state); this.audio.spire(); } this.ui.refresh(); },
      canDeepenNode: (i) => canDeepenNode(this.state, i),
      canFoundDaughter: (i) => canFoundDaughter(this.state, i),
      foundDaughter: (i, name) => { const why = foundDaughter(this.state, i, name); if (!why) { recomputeAll(this.state); this.renderer.invalidateAll(); this.audio.milestone(); } return why; },
      setQuarter: (d, q) => { setQuarter(this.state, d, q); recomputeAll(this.state); this.renderer.overlayVersion++; this.audio.click(); },
      setPriority: (id, p) => { const b = this.state.buildings.find((x) => x && x.id === id); if (b) { b.priority = p; b.lit = true; /* a changed tier is judged afresh: the brownout darkens the already-dark first */ recomputeAll(this.state); this.audio.click(); } },
      renameDistrict: (d, name) => { this.state.districtNames[d] = name.trim().slice(0, 18); this.renderer.overlayVersion++; },
      undo: () => this.undo(),
      setTraining: (id, t) => { setTraining(this.state, id, t); this.audio.click(); },
      vent: (id) => { const b = this.state.buildings.find((x) => x && x.id === id); if (b && b.kind === 'wrightslodge' && (b.cooldown ?? 0) <= 0) { this.state.manaStorage = 0; this.state.overdrawDays = -4; this.state.stats.brownoutOpen = 0; b.cooldown = 30; recomputeAll(this.state); this.audio.spire(); } },
      replate: (id) => { const b = this.state.buildings.find((x) => x && x.id === id); if (b && b.kind === 'scaleward' && this.state.materials.scale >= 2 && (b.plate ?? 1) < 1) { this.state.materials.scale -= 2; b.plate = 1; recomputeAll(this.state); this.audio.spire(); } },
      callRain: (id) => { const r = callRain(this.state, id); if (r.ok) { recomputeAll(this.state); this.audio.spire(); this.renderer.burst('ward', this.selected?.x ?? 0, this.selected?.y ?? 0); } else this.ui.setHint(`<span class="bad">${r.reason}</span>`); this.ui.refresh(); },
      setRole: (id, role, target) => { const why = setRole(this.state, id, role, target); if (!why) { recomputeAll(this.state); this.audio.spire(); } return why; },
      get undoLabel() { return game.undoStack.length ? game.undoStack[game.undoStack.length - 1].label : null; },
      setSetting: (k, v) => game.setSetting(k, v),
      resolveEvent: (c) => { resolveEvent(this.state, c); this.audio.coin(); this.ui.refresh(); },
      centerOn: (x, y) => this.renderer.camera.centerOnTile(x, y),
      charterGuilds: (g) => { const why = charterGuilds(this.state, g); if (!why) { this.audio.coin(); this.ui.refresh(); } return why; },
      dev: (id, arg) => { const [u, v] = worldToTile(this.renderer.camera.cx, this.renderer.camera.cy); const out = runDev(this.state, id, arg, { x: Math.floor(u), y: Math.floor(v) }); recomputeAll(this.state); this.paused = true; this.ui.refresh(); return out; },
      get camera() { return game.renderer.camera; },
      select: (b) => this.select(b),
    });
    canvas.addEventListener('mousedown', () => this.audio.init(), { once: true });
    window.addEventListener('keydown', () => this.audio.init(), { once: true });
    this.loadSettings();
    try { if (localStorage.getItem('wardlight.music') === '0') this.audio.musicOn = false; } catch { /* ignore */ }
    this.ui.showTitle();
    this.ui.refresh();
    this.ui.refreshViews();
    this.updateHint();
    requestAnimationFrame((t) => this.loop(t));
  }

  private bindState(s: GameState): void {
    this.state = s;
    (this.tools as unknown as { host: { state: GameState } }).host.state = s;
    this.renderer.invalidateAll();
    this.renderer.particles.list.length = 0;
    this.undoStack = [];
    this.selectedNode = -1;
    this.select(null);
    this.tools.setTool({ kind: 'select' });
    this.view.overlay = null;
    this.lastDay = s.day;
    recomputeAll(s);
    bumpRoadVersion();
    this.renderer.camera.centerOnTile(s.founding.x + 2, s.founding.y + 2);
    this.renderer.camera.setZoom(2);
    this.ui.refreshItems();
    this.ui.refreshViews();
    this.ui.refresh();
    this.running = true;
    this.paused = false;
    this.speed = 1;
  }

  setSetting(key: 'colorBlind' | 'uiScale' | 'keys', value: boolean | number | Record<KeyAction, string>): void {
    (this.settings as any)[key] = value;
    ramps.colorBlind = this.settings.colorBlind;
    document.documentElement.style.setProperty('--ui-scale', String(this.settings.uiScale));
    this.renderer.overlayVersion++;
    try {
      localStorage.setItem('wardlight.settings', JSON.stringify(this.settings));
    } catch { /* ignore */ }
  }

  loadSettings(): void {
    try {
      const raw = localStorage.getItem('wardlight.settings');
      if (raw) Object.assign(this.settings, JSON.parse(raw));
    } catch { /* ignore */ }
    this.settings.keys = { ...DEFAULT_KEYS, ...(this.settings.keys ?? {}) };
    this.setSetting('colorBlind', this.settings.colorBlind);
  }

  newGame(seed: number, name: string, scenario: Scenario | 'daily' = 'valley', faction: FactionId = 'vellish'): void {
    this.bindState(scenario === 'daily' ? createChallenge(name) : scenario === 'valley' ? createGame(seed, name, 'valley', faction) : createScenario(seed, name, scenario, faction));
    this.audio.milestone();
  }

  save(): void {
    try {
      localStorage.setItem(SAVE_KEY, serialize(this.state));
    } catch (e) {
      console.warn('save failed', e);
    }
  }

  load(): boolean {
    const json = localStorage.getItem(SAVE_KEY);
    if (!json) return false;
    try {
      this.bindState(deserialize(json, (seed) => createGame(seed)));
      return true;
    } catch (e) {
      console.warn('load failed', e);
      this.ui.toast(`<p class="bad">Could not load the saved Charter.</p>`);
      return false;
    }
  }

  exportJson(): void {
    const blob = new Blob([serialize(this.state)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${this.state.cityName.replace(/\s+/g, '_')}_day${this.state.day}.wardlight.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  importJson(file: File): void {
    file.text().then((json) => {
      try {
        this.bindState(deserialize(json, (seed) => createGame(seed)));
        this.ui.toast('<p>Charter imported.</p>', 2500);
      } catch (e) {
        this.ui.toast(`<p class="bad">That file is not a Wardlight Charter.</p>`);
      }
    });
  }

  pushUndo(label: string): void {
    this.undoStack.push(takeSnapshot(this.state, label));
    if (this.undoStack.length > 12) this.undoStack.shift();
  }

  undo(): boolean {
    const snap = this.undoStack.pop();
    if (!snap) return false;
    restoreSnapshot(this.state, snap);
    bumpRoadVersion();
    recomputeAll(this.state);
    this.renderer.invalidateAll();
    this.renderer.overlayVersion++;
    this.select(null);
    this.audio.click();
    this.ui.toast(`<p>Undid: ${snap.label}.</p>`, 1500);
    this.ui.refresh();
    return true;
  }

  select(b: Building | null): void {
    if (b) { this.selectedNode = -1; this.selectedSector = -1; }
    this.selected = b;
    this.view.selected = b;
    this.ui.refresh();
  }

  private onAction(kind: 'road' | 'zone' | 'place' | 'bulldoze' | 'terrain' | 'error' | 'click' | 'district', msg?: string): void {
    switch (kind) {
      case 'district': {
        this.audio.zone();
        const d = Number(msg);
        if (!d) break;
        this.view.overlay = 'district';
        this.renderer.overlayVersion++;
        const bs = districtBuildings(this.state, d);
        const works = bs.filter((b) => BUILDING_BY_KEY[b.kind].zone === Zone.Craft).length;
        const q = this.state.districtQuarters[d];
        this.ui.toast(`<p><b>${districtName(this.state, d)}</b>: ${bs.length} building${bs.length === 1 ? '' : 's'}${works ? `, ${works} of them works` : ''}. ${q ? `Charter: ${QUARTER_BY_ID[q].name}.` : 'No charter yet: choose one in the Edicts panel to give the district a gift and a price.'}</p><p><button id="t-charter">Open the Edicts panel</button></p>`, 9000);
        const btn = document.getElementById('t-charter');
        if (btn) btn.onclick = () => { this.ui.edictScope = d; this.ui.toggleEdicts(true); };
        break;
      }
      case 'road': this.audio.road(); break;
      case 'zone': this.audio.zone(); break;
      case 'place': {
        const t = this.tools.tool;
        if (t.kind === 'build' && (t.key === 'spire' || t.key === 'nexus' || t.key === 'wardlantern')) this.audio.spire();
        else this.audio.place();
        break;
      }
      case 'bulldoze': this.audio.bulldoze(); break;
      case 'terrain': this.audio.bulldoze(); this.renderer.invalidateAll(); break;
      case 'click': this.audio.click(); break;
      case 'error':
        this.audio.error();
        if (msg) this.ui.setHint(`<span class="bad">${msg}</span>`);
        break;
    }
    if (kind !== 'error' && kind !== 'click') {
      recomputeAll(this.state);
      this.renderer.overlayVersion++;
    }
    this.ui.refresh();
  }

  private onKey(k: string, e: KeyboardEvent): boolean {
    if ((e.ctrlKey || e.metaKey) && k === 'z') { this.undo(); return true; }
    if (e.shiftKey && k === 'g') { this.view.showGrid = !this.view.showGrid; return true; }
    if (k === '?') { this.ui.toggleHelp(); return true; }
    if (k === '`') { this.ui.toggleDev(); return true; }
    const action = e.ctrlKey || e.metaKey ? null : keyFor(this.settings.keys, k);
    switch (action) {
      case 'pause': this.paused = !this.paused; this.ui.refresh(); return true;
      case 'slower': this.speed = Math.max(1, this.speed - 1); this.paused = false; this.ui.refresh(); return true;
      case 'faster': this.speed = Math.min(3, this.speed + 1); this.paused = false; this.ui.refresh(); return true;
      case 'help': this.ui.toggleHelp(); return true;
      case 'chronicle': this.ui.toggleChronicle(); return true;
      case 'views': this.ui.toggleBudget(false); document.getElementById('views')!.classList.toggle('hidden'); return true;
      case 'save': this.save(); this.ui.toast('<p>Charter saved.</p>', 1500); return true;
      case 'load': this.load(); return true;
      case 'cancel': {
        let handled = false;
        for (const id of ['help', 'budget', 'menu']) {
          const el = document.getElementById(id)!;
          if (!el.classList.contains('hidden')) { el.classList.add('hidden'); handled = true; }
        }
        if (!handled && this.view.overlay) { this.view.overlay = null; this.ui.refreshViews(); handled = true; }
        return handled;
      }
    }
    if (e.shiftKey && (k === '!' || k === '@' || k === '#')) {
      this.speed = k === '!' ? 1 : k === '@' ? 2 : 3;
      this.paused = false;
      this.ui.refresh();
      return true;
    }
    return false;
  }

  /** Stereo pan (-1..1) and volume (0..1) for a tile relative to the camera view; off-screen cues fade with distance. */
  private panFor(x: number, y: number): [number, number] {
    const cam = this.renderer.camera;
    const [wx, wy] = tileToWorld(x, y);
    const u = (wx - cam.left) / cam.nativeW - 0.5;
    const vv = (wy - cam.top) / cam.nativeH - 0.5;
    const pan = Math.max(-1, Math.min(1, u * 2));
    const out = Math.max(0, Math.abs(u) - 0.5) + Math.max(0, Math.abs(vv) - 0.5);
    return [pan, 1 / (1 + out * 2.5)];
  }

  private updateHint(): void {
    const t = this.tools.tool;
    let hint = `<b>${toolLabel(t)}</b> — `;
    switch (t.kind) {
      case 'select': hint += 'click a building for details. Pick a tool on the left.'; break;
      case 'road': hint += 'drag to draw. Roads over shallow water become bridges (4× cost).'; break;
      case 'zone': hint += 'drag a rectangle beside a road. Buildings grow when demand is high.'; break;
      case 'build': {
        const d = BUILDING_BY_KEY[t.key];
        hint += `${costOf(this.state, d)} crowns. ${d.desc}`;
        break;
      }
      case 'bulldoze': hint += 'click or drag to remove buildings, roads and zones.'; break;
    }
    this.ui.setHint(hint);
  }

  private loop(ts: number): void {
    const dt = Math.min(0.1, (ts - this.last) / 1000 || 0.016);
    this.last = ts;
    if (this.running) {
      // simulation
      if (!this.paused && !this.state.gameOver) {
        this.acc += dt * this.speed;
        const step = 1 / TICKS_PER_SEC;
        let n = 0;
        while (this.acc >= step && n < 12) {
          tick(this.state);
          this.acc -= step;
          n++;
        }
        if (this.acc > step * 4) this.acc = 0; // avoid spiral of death
        // sim-triggered effects
        for (const e of drainEffects()) {
          if (SOUND_CUES.includes(e.kind as SoundCue)) { const [pan, vol] = this.panFor(e.x, e.y); this.audio.cue(e.kind as SoundCue, pan, vol); continue; }
          this.renderer.burst(e.kind, e.x, e.y);
          if (e.kind === 'surge') this.audio.surge();
          else if (e.kind === 'fire' || e.kind === 'restless') this.audio.bad();
        }
        if (this.state.day !== this.lastDay) {
          const prevMilestone = this.lastDay >= 0 ? this.state.milestone : 0;
          void prevMilestone;
          this.lastDay = this.state.day;
          this.renderer.overlayVersion++;
          this.save();
          const lastMsg = this.state.messages[this.state.messages.length - 1];
          if (lastMsg && lastMsg.tick === this.state.tick && lastMsg.kind === 'milestone' && this.state.day > 0) this.audio.melody(this.state.milestone * 7 + this.state.seed);
        }
        if (this.state.tick % 50 === 0) this.renderer.overlayVersion++;
      }
      this.tools.update(dt);
      // hover preview needs refresh when the camera moves
      if (this.tools.tool.kind !== 'select') this.tools.updatePreview();
      this.renderer.render(this.state, this.view, dt);
      // ambient audio
      const tod = timeOfDay(this.state);
      const night = nightFactor(tod);
      const v = this.renderer.inView;
      this.audio.ambientMix(night, v.ley, Math.min(1, v.water + v.mills * 0.8), v.fire, v.market, v.storm, v.golems);
      if (v.rays > 0) this.audio.raysInView(v.rays);
      const danger = Math.max(v.fire, this.state.wyrm.flyover > 0 && this.state.agents.some((a) => a.kind === 3 && a.species === 'wyrm' && a.load > 0) ? 1 : 0, this.state.overdrawDays > 0 ? 1 : 0, this.state.unrest > 0.4 ? 1 : 0, this.state.agents.some((a) => a.kind === 3 && a.species === 'hound') && night > 0.3 ? 0.7 : 0);
      this.audio.setMood(night, Math.floor(this.state.day / 30) % 4, danger);
      if (this.state.gameOver && !this.paused) {
        this.paused = true;
        this.audio.bad();
        this.ui.refresh();
      }
    }
    this.frames++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 1) {
      this.perf.fps = Math.round(this.frames / this.fpsTimer);
      this.perf.ms = this.renderer.stats.ms;
      this.perf.drawn = this.renderer.stats.drawn;
      this.frames = 0;
      this.fpsTimer = 0;
    }
    this.uiTimer += dt;
    if (this.uiTimer > 0.25) {
      this.uiTimer = 0;
      if (this.running) {
        this.ui.refresh();
        this.ui.refreshBudget();
        if (!document.getElementById('wyrms')!.classList.contains('hidden') && this.state.tick % 300 === 0) this.ui.refreshWyrms();
        if ((this.tools.tool.kind === 'road' || this.tools.tool.kind === 'wall') && this.tools.previewCost > 0) this.ui.setHint(`<b>${toolLabel(this.tools.tool)}</b> — cost <span class="gold">${this.tools.previewCost} crowns</span>. Release to build.`);
        else if (this.tools.tool.kind === 'build' && this.tools.previewReason) this.ui.setHint(`<b>${toolLabel(this.tools.tool)}</b> — <span class="warn">${this.tools.previewReason}</span>`);
        else if (this.tools.tool.kind === 'build') this.updateHint();
      }
    }
    requestAnimationFrame((t) => this.loop(t));
  }
}

async function boot(): Promise<void> {
  const base = import.meta.env.BASE_URL;
  const override = await SpriteAtlas.fromOverride(base);
  const atlas = override ?? SpriteAtlas.fromGenerated();
  (window as any).__wardlight = { atlas, MILESTONES, actions, tick, recomputeAll, Bot, maybeFireEvent, resolveEvent, ALL_EVENTS, wyrm, place: placeBuildingRaw };
  const game = new Game(atlas);
  (window as any).__game = game;
}

boot();
