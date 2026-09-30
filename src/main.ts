import { SpriteAtlas } from './render/atlas';
import { Renderer, type ViewState } from './render/renderer';
import { createGame, timeOfDay } from './sim/world';
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
import * as actions from './sim/actions';

const SAVE_KEY = 'wardlight.save.v1';

class Game {
  state: GameState;
  renderer: Renderer;
  view: ViewState = { overlay: null, hover: null, previewTiles: [], previewZone: Zone.None, ghost: null, selected: null, showGrid: false };
  tools!: Tools;
  ui!: UI;
  audio = new Audio();
  speed = 1;
  paused = false;
  selected: Building | null = null;
  muted = false;
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
      onKey: (k, e) => this.onKey(k, e),
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
      newGame: (seed, name) => this.newGame(seed, name),
      continueGame: () => this.load(),
      hasSave: () => !!localStorage.getItem(SAVE_KEY),
      save: () => this.save(),
      exportJson: () => this.exportJson(),
      importJson: (f) => this.importJson(f),
      setMuted: (m) => { this.muted = m; this.audio.setMuted(m); },
      setTax: (z, v) => setTax(this.state, z, v),
      centerOn: (x, y) => this.renderer.camera.centerOnTile(x, y),
      select: (b) => this.select(b),
    });
    canvas.addEventListener('mousedown', () => this.audio.init(), { once: true });
    window.addEventListener('keydown', () => this.audio.init(), { once: true });
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

  newGame(seed: number, name: string): void {
    this.bindState(createGame(seed, name));
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

  select(b: Building | null): void {
    this.selected = b;
    this.view.selected = b;
    this.ui.refresh();
  }

  private onAction(kind: 'road' | 'zone' | 'place' | 'bulldoze' | 'error' | 'click', msg?: string): void {
    switch (kind) {
      case 'road': this.audio.road(); break;
      case 'zone': this.audio.zone(); break;
      case 'place': {
        const t = this.tools.tool;
        if (t.kind === 'build' && (t.key === 'spire' || t.key === 'nexus' || t.key === 'wardlantern')) this.audio.spire();
        else this.audio.place();
        break;
      }
      case 'bulldoze': this.audio.bulldoze(); break;
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
    switch (k) {
      case ' ': this.paused = !this.paused; this.ui.refresh(); return true;
      case ',': this.speed = Math.max(1, this.speed - 1); this.paused = false; this.ui.refresh(); return true;
      case '.': this.speed = Math.min(3, this.speed + 1); this.paused = false; this.ui.refresh(); return true;
      case 'h': case '?': this.ui.toggleHelp(); return true;
      case 'tab': this.ui.toggleBudget(false); document.getElementById('views')!.classList.toggle('hidden'); return true;
      case 'g': if (e.shiftKey) { this.view.showGrid = !this.view.showGrid; return true; } return false;
      case 'f5': this.save(); this.ui.toast('<p>Charter saved.</p>', 1500); return true;
      case 'f9': this.load(); return true;
      case 'escape': {
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

  private updateHint(): void {
    const t = this.tools.tool;
    let hint = `<b>${toolLabel(t)}</b> — `;
    switch (t.kind) {
      case 'select': hint += 'click a building for details. Pick a tool on the left.'; break;
      case 'road': hint += 'drag to draw. Roads over shallow water become bridges (4× cost).'; break;
      case 'zone': hint += 'drag a rectangle beside a road. Buildings grow when demand is high.'; break;
      case 'build': {
        const d = BUILDING_BY_KEY[t.key];
        hint += `${d.cost} crowns. ${d.desc}`;
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
          this.renderer.burst(e.kind, e.x, e.y);
          if (e.kind === 'surge') this.audio.surge();
          else if (e.kind === 'fire' || e.kind === 'restless') this.audio.bad();
        }
        if (this.state.day !== this.lastDay) {
          const prevMilestone = this.lastDay >= 0 ? this.state.milestone : 0;
          void prevMilestone;
          this.lastDay = this.state.day;
          this.renderer.overlayVersion++;
          if (this.state.day % 3 === 0) this.save();
          const lastMsg = this.state.messages[this.state.messages.length - 1];
          if (lastMsg && lastMsg.tick === this.state.tick && lastMsg.kind === 'milestone' && this.state.day > 0) this.audio.milestone();
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
      const lit = Math.min(1, this.state.manaDemand / 80);
      this.audio.ambientMix(night, lit);
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
        if (this.tools.tool.kind === 'road' && this.tools.previewCost > 0) this.ui.setHint(`<b>${toolLabel(this.tools.tool)}</b> — cost <span class="gold">${this.tools.previewCost} crowns</span>. Release to build.`);
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
  (window as any).__wardlight = { atlas, MILESTONES, actions, tick, recomputeAll };
  const game = new Game(atlas);
  (window as any).__game = game;
}

boot();
