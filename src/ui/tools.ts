/** Mouse/keyboard input → tool state → sim actions. */
import { buildRoad, bulldoze, paintDistrict, paintZone, placeBuilding, previewRoad, roadPath, roadTileCost } from '../sim/actions';
import { BUILDING_BY_KEY, isBuildingUnlocked } from '../sim/catalog';
import { DISTRICT_NAMES, MAP_W, RoadType, Zone, idx, inBounds, type Building, type GameState } from '../sim/types';
import { buildingAt, canPlaceBuilding } from '../sim/world';
import { bumpRoadVersion } from '../sim/agents';
import type { ViewState } from '../render/renderer';
import type { OverlayId } from '../render/overlays';
import { OVERLAY_LIST } from '../render/overlays';

export type Tool =
  | { kind: 'select' }
  | { kind: 'road'; type: RoadType }
  | { kind: 'zone'; zone: Zone }
  | { kind: 'build'; key: string }
  | { kind: 'district'; id: number }
  | { kind: 'bulldoze' };

export interface ToolHost {
  state: GameState;
  view: ViewState;
  canvas: HTMLCanvasElement;
  camera: { screenToTile(sx: number, sy: number): [number, number]; pan(dx: number, dy: number): void; setZoom(z: number, ax?: number, ay?: number): void; zoom: number };
  onAction: (kind: 'road' | 'zone' | 'place' | 'bulldoze' | 'error' | 'click', msg?: string) => void;
  onSelect: (b: Building | null) => void;
  onKey: (key: string, ev: KeyboardEvent) => boolean;
  refreshUI: () => void;
}

export class Tools {
  tool: Tool = { kind: 'select' };
  private dragStart: [number, number] | null = null;
  private dragButton = -1;
  private panLast: [number, number] | null = null;
  private lastMouse: [number, number] = [0, 0];
  private keys = new Set<string>();
  private bulldozed = new Set<number>();

  constructor(private host: ToolHost) {
    const c = host.canvas;
    c.addEventListener('mousedown', (e) => this.mouseDown(e));
    window.addEventListener('mousemove', (e) => this.mouseMove(e));
    window.addEventListener('mouseup', (e) => this.mouseUp(e));
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      host.camera.setZoom(host.camera.zoom + (e.deltaY < 0 ? 1 : -1), e.clientX, e.clientY);
    }, { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.keyDown(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  setTool(t: Tool): void {
    this.tool = t;
    this.dragStart = null;
    this.host.view.previewTiles = [];
    this.host.view.ghost = null;
    if (t.kind !== 'select') this.host.onSelect(null);
    this.host.refreshUI();
    this.updatePreview();
  }

  cancel(): void {
    if (this.tool.kind === 'select') this.host.onSelect(null);
    this.setTool({ kind: 'select' });
  }

  /** Camera keyboard panning; call every frame. */
  update(dt: number): void {
    const sp = 600 * dt;
    let dx = 0;
    let dy = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) dy += sp;
    if (this.keys.has('s') || this.keys.has('arrowdown')) dy -= sp;
    if (this.keys.has('a') || this.keys.has('arrowleft')) dx += sp;
    if (this.keys.has('d') || this.keys.has('arrowright')) dx -= sp;
    if (dx || dy) this.host.camera.pan(dx, dy);
  }

  private tileAt(e: MouseEvent): [number, number] {
    return this.host.camera.screenToTile(e.clientX, e.clientY);
  }

  private mouseDown(e: MouseEvent): void {
    this.host.canvas.focus();
    if (e.button === 1 || e.button === 2) {
      this.panLast = [e.clientX, e.clientY];
      this.dragButton = e.button;
      return;
    }
    if (e.button !== 0) return;
    const t = this.tileAt(e);
    this.dragButton = 0;
    switch (this.tool.kind) {
      case 'road':
      case 'zone':
      case 'district':
        this.dragStart = t;
        break;
      case 'bulldoze':
        this.bulldozed.clear();
        this.doBulldoze(t);
        break;
      case 'build':
        this.doBuild(t);
        break;
      case 'select': {
        const b = buildingAt(this.host.state, t[0], t[1]);
        this.host.onSelect(b);
        this.host.onAction('click');
        break;
      }
    }
    this.updatePreview();
  }

  private mouseMove(e: MouseEvent): void {
    this.lastMouse = [e.clientX, e.clientY];
    if (this.panLast) {
      this.host.camera.pan(e.clientX - this.panLast[0], e.clientY - this.panLast[1]);
      this.panLast = [e.clientX, e.clientY];
      return;
    }
    const t = this.tileAt(e);
    this.host.view.hover = t;
    if (this.tool.kind === 'bulldoze' && this.dragButton === 0 && e.buttons & 1) this.doBulldoze(t);
    this.updatePreview();
  }

  private mouseUp(e: MouseEvent): void {
    if (this.panLast && (e.button === 1 || e.button === 2)) {
      const moved = Math.hypot(e.clientX - this.panLast[0], e.clientY - this.panLast[1]);
      this.panLast = null;
      if (e.button === 2 && moved < 3 && this.tool.kind !== 'select') this.cancel();
      return;
    }
    if (e.button !== 0) return;
    this.dragButton = -1;
    if (!this.dragStart) return;
    const start = this.dragStart;
    const end = this.tileAt(e);
    this.dragStart = null;
    const s = this.host.state;
    if (this.tool.kind === 'road') {
      const tiles = this.roadTiles(start, end);
      const r = buildRoad(s, this.tool.type, tiles);
      if (r.ok) {
        bumpRoadVersion();
        this.host.onAction('road');
      } else this.host.onAction('error', r.reason);
    } else if (this.tool.kind === 'zone') {
      const r = paintZone(s, this.tool.zone, start[0], start[1], end[0], end[1]);
      if (r.ok) this.host.onAction('zone');
      else this.host.onAction('error', r.reason);
    } else if (this.tool.kind === 'district') {
      const r = paintDistrict(s, this.tool.id, start[0], start[1], end[0], end[1]);
      if (r.ok) this.host.onAction('zone');
      else this.host.onAction('error', r.reason);
    }
    this.updatePreview();
  }

  private roadTiles(a: [number, number], b: [number, number]): number[] {
    const vertical = Math.abs(b[1] - a[1]) > Math.abs(b[0] - a[0]);
    return roadPath(a[0], a[1], b[0], b[1], vertical);
  }

  private doBulldoze(t: [number, number]): void {
    if (!inBounds(t[0], t[1])) return;
    const i = idx(t[0], t[1]);
    if (this.bulldozed.has(i)) return;
    this.bulldozed.add(i);
    const r = bulldoze(this.host.state, t[0], t[1]);
    if (r.ok) {
      bumpRoadVersion();
      this.host.onAction('bulldoze');
    } else if (r.reason) this.host.onAction('error', r.reason);
  }

  private doBuild(t: [number, number]): void {
    if (this.tool.kind !== 'build') return;
    const def = BUILDING_BY_KEY[this.tool.key];
    const x = t[0] - Math.floor((def.w - 1) / 2);
    const y = t[1] - Math.floor((def.h - 1) / 2);
    const r = placeBuilding(this.host.state, this.tool.key, x, y);
    if (r.ok) {
      bumpRoadVersion();
      this.host.onAction('place');
      if (def.wonder) this.setTool({ kind: 'select' });
    } else this.host.onAction('error', r.reason);
  }

  updatePreview(): void {
    const v = this.host.view;
    const s = this.host.state;
    v.previewTiles = [];
    v.ghost = null;
    v.previewZone = Zone.None;
    v.previewDistrict = this.tool.kind === 'district' ? this.tool.id : -1;
    const hover = v.hover;
    if (!hover) return;
    if (this.tool.kind === 'road') {
      const start = this.dragStart ?? hover;
      const tiles = this.roadTiles(start, hover);
      const pv = previewRoad(s, this.tool.type, tiles);
      v.previewTiles = tiles.map((i, k) => ({ i, ok: pv.valid[k] }));
      this.previewCost = pv.cost;
    } else if (this.tool.kind === 'zone') {
      const start = this.dragStart ?? hover;
      const x0 = Math.min(start[0], hover[0]);
      const x1 = Math.max(start[0], hover[0]);
      const y0 = Math.min(start[1], hover[1]);
      const y1 = Math.max(start[1], hover[1]);
      v.previewZone = this.tool.zone;
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          if (!inBounds(x, y)) continue;
          const i = idx(x, y);
          v.previewTiles.push({ i, ok: !s.road[i] && s.bIndex[i] < 0 && roadTileCost(s, RoadType.Track, i) >= 0 });
        }
    } else if (this.tool.kind === 'district') {
      const start = this.dragStart ?? hover;
      const x0 = Math.min(start[0], hover[0]);
      const x1 = Math.max(start[0], hover[0]);
      const y0 = Math.min(start[1], hover[1]);
      const y1 = Math.max(start[1], hover[1]);
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) if (inBounds(x, y)) v.previewTiles.push({ i: idx(x, y), ok: true });
    } else if (this.tool.kind === 'build') {
      const def = BUILDING_BY_KEY[this.tool.key];
      const x = hover[0] - Math.floor((def.w - 1) / 2);
      const y = hover[1] - Math.floor((def.h - 1) / 2);
      const why = canPlaceBuilding(s, this.tool.key, x, y);
      const radius = def.service?.radius ?? def.waterRadius ?? (this.tool.key === 'spire' ? 5 : this.tool.key === 'nexus' ? 9 : 0);
      v.ghost = { key: this.tool.key, x, y, ok: !why && isBuildingUnlocked(s.milestone, this.tool.key) && def.cost <= s.treasury, radius };
      this.previewReason = why;
    } else if (this.tool.kind === 'bulldoze') {
      if (inBounds(hover[0], hover[1])) v.previewTiles = [{ i: idx(hover[0], hover[1]), ok: false }];
    }
  }
  previewCost = 0;
  previewReason: string | null = null;

  private keyDown(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    this.keys.add(k);
    if (this.host.onKey(k, e)) {
      e.preventDefault();
      return;
    }
    switch (k) {
      case 'escape':
        this.cancel();
        break;
      case 'x':
        this.setTool({ kind: 'select' });
        break;
      case 'b':
        this.setTool({ kind: 'bulldoze' });
        break;
      case 'r':
        if (this.tool.kind === 'road') this.setTool({ kind: 'road', type: (this.tool.type % 3) + 1 });
        else this.setTool({ kind: 'road', type: RoadType.Track });
        break;
      case 'z':
        if (this.tool.kind === 'zone') this.setTool({ kind: 'zone', zone: (this.tool.zone % 4) + 1 });
        else this.setTool({ kind: 'zone', zone: Zone.Hearth });
        break;
      case '+':
      case '=':
        if (e.shiftKey || k === '+') this.host.camera.setZoom(this.host.camera.zoom + 1, this.lastMouse[0], this.lastMouse[1]);
        break;
      case '-':
        if (e.shiftKey) this.host.camera.setZoom(this.host.camera.zoom - 1, this.lastMouse[0], this.lastMouse[1]);
        break;
    }
    // overlays
    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
      const ov = OVERLAY_LIST.find((o) => o.key === k);
      if (ov) {
        this.host.view.overlay = this.host.view.overlay === ov.id ? null : (ov.id as OverlayId);
        this.host.refreshUI();
      }
    }
  }
}

export function toolLabel(t: Tool): string {
  switch (t.kind) {
    case 'select': return 'Select';
    case 'road': return `Road: ${['', 'Dirt Track', 'Cobbled Road', 'Lantern-way'][t.type]}`;
    case 'zone': return `Zone: ${['De-zone', 'Hearth', 'Market', 'Craft', 'Arcane'][t.zone]}`;
    case 'build': return `Build: ${BUILDING_BY_KEY[t.key].name}`;
    case 'district': return t.id === 0 ? 'District: clear' : `District: ${DISTRICT_NAMES[t.id - 1]}`;
    case 'bulldoze': return 'Bulldoze';
  }
}

export function tileIndexToXY(i: number): [number, number] {
  return [i % MAP_W, (i / MAP_W) | 0];
}
