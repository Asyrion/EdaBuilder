/** Canvas2D renderer: chunk-cached ground, depth-sorted objects, light map, glow, particles. */
import { treeStage } from '../sim/growth';
import { SOUND_CUES, type EffectKind, type SoundCue } from '../sim/hazards';
import { inCharter } from '../sim/sectors';
import { BUILDING_BY_KEY, ROAD_BY_TYPE } from '../sim/catalog';
import { AgentKind, DISTRICT_NAMES, MAP_H, MAP_W, RoadType, Terrain, Zone, idx, inBounds, isWater, type Building, type GameState } from '../sim/types';
import { CHUNK, CHUNKS_X, CHUNKS_Y, timeOfDay } from '../sim/world';
import { SpriteAtlas, type SpriteRect } from './atlas';
import { Camera } from './camera';
import { tileToWorld } from './iso';
import { lightSprite } from './lights';
import { PAL, ambientFor, nightFactor } from './palette';
import { Particles } from './particles';
import { TILE_H, TILE_W } from './sprites';
import { h2 } from './painter';
import { DISTRICT_COLORS, OVERLAYS, type OverlayId } from './overlays';

export interface PreviewTile {
  i: number;
  ok: boolean;
}

export interface ViewState {
  overlay: OverlayId | null;
  hover: [number, number] | null;
  previewTiles: PreviewTile[]; // road/zone/bulldoze preview
  previewZone: Zone;
  previewDistrict: number; // -1 none, 0 clear, 1..8 paint
  ghost: { key: string; x: number; y: number; ok: boolean; radius: number } | null;
  selected: Building | null;
  showGrid: boolean;
}

const CHUNK_W = CHUNK * TILE_W;
const CHUNK_H = CHUNK * TILE_H + TILE_H;

interface Prop {
  name: string;
  wx: number;
  wy: number;
  d: number;
  sway: number; // 0..1 sway weight
}

interface ChunkCache {
  canvas: HTMLCanvasElement;
  hasWater: boolean;
  waterFrame: number;
  props: Prop[];
  lights: { x: number; y: number; r: number; c: string; i: number }[]; // static lights (ley nodes)
}

export class Renderer {
  screen: HTMLCanvasElement;
  sctx: CanvasRenderingContext2D;
  back: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  light: HTMLCanvasElement;
  lctx: CanvasRenderingContext2D;
  atlas: SpriteAtlas;
  camera = new Camera();
  particles = new Particles();
  chunks = new Map<number, ChunkCache>();
  overlayChunks = new Map<number, HTMLCanvasElement>();
  overlayVersion = 0;
  private lightDiv = 2;
  private bloom: HTMLCanvasElement | null = null;
  private overlayBuiltVersion = -1;
  private overlayBuiltId: string | null = null;
  time = 0; // seconds of real time for animation
  frame = 0;
  wind = 0.5;
  stats = { drawn: 0, ms: 0, ground: 0, objects: 0, sort: 0, particles: 0, lighting: 0, blit: 0 };
  /** What the camera currently sees, for the ambient audio mix (0..1). */
  inView = { water: 0, fire: 0, market: 0, ley: 0, mills: 0, rays: 0, storm: 0, golems: 0 };

  constructor(screen: HTMLCanvasElement, atlas: SpriteAtlas) {
    this.screen = screen;
    this.sctx = screen.getContext('2d')!;
    this.back = document.createElement('canvas');
    this.ctx = this.back.getContext('2d')!;
    this.light = document.createElement('canvas');
    this.lctx = this.light.getContext('2d')!;
    this.atlas = atlas;
  }

  resize(): void {
    const dpr = 1; // integer scaling only; ignore devicePixelRatio for crispness
    this.screen.width = Math.floor(window.innerWidth * dpr);
    this.screen.height = Math.floor(window.innerHeight * dpr);
    this.camera.viewW = this.screen.width;
    this.camera.viewH = this.screen.height;
  }

  invalidateAll(): void {
    this.chunks.clear();
    this.overlayChunks.clear();
  }

  // ---------- sprites ----------
  private draw(s: SpriteRect | null, wx: number, wy: number, alpha = 1): void {
    if (!s) return;
    const ctx = this.ctx;
    const x = Math.round(wx - s.ax - this.camera.left);
    const y = Math.round(wy - s.ay - this.camera.top);
    if (x + s.w < 0 || y + s.h < 0 || x > this.back.width || y > this.back.height) return;
    if (alpha !== 1) ctx.globalAlpha = alpha;
    ctx.drawImage(this.atlas.image, s.x, s.y, s.w, s.h, x, y, s.w, s.h);
    if (alpha !== 1) ctx.globalAlpha = 1;
    this.stats.drawn++;
  }
  private drawGlow(s: SpriteRect | null, wx: number, wy: number, alpha: number): void {
    if (!s || !s.glow) return;
    const ctx = this.ctx;
    const x = Math.round(wx - s.ax - this.camera.left);
    const y = Math.round(wy - s.ay - this.camera.top);
    if (x + s.w < 0 || y + s.h < 0 || x > this.back.width || y > this.back.height) return;
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.atlas.image, s.glow.x, s.glow.y, s.w, s.h, x, y, s.w, s.h);
    ctx.globalAlpha = 1;
  }

  // ---------- ground chunks ----------
  private terrainSprite(state: GameState, i: number, x: number, y: number, waterFrame: number): SpriteRect | null {
    if (state.gloam[i]) return this.atlas.get(`gloam_${Math.floor(h2(x, y, 6) * 3)}`);
    const t = state.terrain[i];
    switch (t) {
      case Terrain.DeepWater: return this.atlas.get(`deep_${waterFrame}`);
      case Terrain.Water: return this.atlas.get(`water_${waterFrame}`);
      case Terrain.Shore: return this.atlas.get(`shore_${Math.floor(h2(x, y, 5) * 2)}`);
      case Terrain.Grass: return this.atlas.get(`grass_${Math.floor(h2(x, y, 1) * 4)}`);
      case Terrain.Meadow: return this.atlas.get(`meadow_${Math.floor(h2(x, y, 2) * 3)}`);
      case Terrain.Forest: return this.atlas.get(`forest_${Math.floor(h2(x, y, 3) * 3)}`);
      case Terrain.Hills: return this.atlas.get(`hills_${Math.floor(h2(x, y, 4) * 3)}`);
      case Terrain.LeyNode: return this.atlas.get('grass_1');
      case Terrain.Ruins: return this.atlas.get(`ruins_${Math.floor(h2(x, y, 8) * 3)}`);
    }
    return null;
  }

  private roadMask(state: GameState, x: number, y: number): number {
    let m = 0;
    if (y > 0 && state.road[idx(x, y - 1)]) m |= 1;
    if (x < MAP_W - 1 && state.road[idx(x + 1, y)]) m |= 2;
    if (y < MAP_H - 1 && state.road[idx(x, y + 1)]) m |= 4;
    if (x > 0 && state.road[idx(x - 1, y)]) m |= 8;
    return m;
  }

  private buildChunk(state: GameState, ci: number, waterFrame: number): ChunkCache {
    const cx = ci % CHUNKS_X;
    const cy = (ci / CHUNKS_X) | 0;
    let cache = this.chunks.get(ci);
    if (!cache) {
      const canvas = document.createElement('canvas');
      canvas.width = CHUNK_W;
      canvas.height = CHUNK_H;
      cache = { canvas, hasWater: false, waterFrame: -1, props: [], lights: [] };
      this.chunks.set(ci, cache);
    }
    cache.props = [];
    cache.lights = [];
    const ctx = cache.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, CHUNK_W, CHUNK_H);
    const [ox, oy] = this.chunkOrigin(cx, cy);
    let hasWater = false;
    const img = this.atlas.image;
    for (let ty = 0; ty < CHUNK; ty++)
      for (let tx = 0; tx < CHUNK; tx++) {
        const x = cx * CHUNK + tx;
        const y = cy * CHUNK + ty;
        const i = idx(x, y);
        const [wx, wy] = tileToWorld(x, y);
        const dx = wx - ox;
        const dy = wy - oy;
        const t = state.terrain[i];
        if (isWater(t) && !state.gloam[i]) hasWater = true;
        let s = this.terrainSprite(state, i, x, y, waterFrame);
        if (s) ctx.drawImage(img, s.x, s.y, s.w, s.h, dx - s.ax, dy - s.ay, s.w, s.h);
        if (!inCharter(state, x, y)) {
          // beyond the Charter: dimmed, with a surveyor's hatch
          ctx.fillStyle = (x + y) % 4 === 0 ? 'rgba(10,8,16,0.55)' : 'rgba(10,8,16,0.42)';
          ctx.beginPath();
          ctx.moveTo(dx, dy);
          ctx.lineTo(dx + 16, dy + 8);
          ctx.lineTo(dx, dy + 16);
          ctx.lineTo(dx - 16, dy + 8);
          ctx.fill();
        }
        const r = state.road[i];
        if (r) {
          const key = r === RoadType.Track ? 'track' : r === RoadType.Cobble ? 'cobble' : r === RoadType.Glowvine ? 'glowvine' : 'lantern';
          s = this.atlas.get(`road_${key}_${this.roadMask(state, x, y)}`);
          if (s) {
            if (isWater(t)) {
              // bridge: draw plank base
              ctx.fillStyle = PAL.wood1;
              ctx.beginPath();
              ctx.moveTo(dx, dy + 1);
              ctx.lineTo(dx + 16, dy + 9);
              ctx.lineTo(dx, dy + 17);
              ctx.lineTo(dx - 16, dy + 9);
              ctx.fill();
            }
            ctx.drawImage(img, s.x, s.y, s.w, s.h, dx - s.ax, dy - s.ay, s.w, s.h);
          }
        } else if (state.wall[i] === 1) {
          let m = 0;
          if (y > 0 && state.wall[idx(x, y - 1)]) m |= 1;
          if (x < MAP_W - 1 && state.wall[idx(x + 1, y)]) m |= 2;
          if (y < MAP_H - 1 && state.wall[idx(x, y + 1)]) m |= 4;
          if (x > 0 && state.wall[idx(x - 1, y)]) m |= 8;
          s = this.atlas.get(`wall_${m}`);
          if (s) ctx.drawImage(img, s.x, s.y, s.w, s.h, dx - s.ax, dy - s.ay, s.w, s.h);
        } else if (state.zone[i] && state.bIndex[i] < 0) {
          const z = state.zone[i];
          const key = z === Zone.Hearth ? 'hearth' : z === Zone.Market ? 'market' : z === Zone.Craft ? 'craft' : 'arcane';
          s = this.atlas.get(`zone_${key}`);
          if (s) ctx.drawImage(img, s.x, s.y, s.w, s.h, dx - s.ax, dy - s.ay, s.w, s.h);
        }
      }
    // props (trees, rocks, bushes, dead trees) are cached per chunk and drawn per frame
    for (let ty = 0; ty < CHUNK; ty++)
      for (let tx = 0; tx < CHUNK; tx++) {
        const x = cx * CHUNK + tx;
        const y = cy * CHUNK + ty;
        const i = idx(x, y);
        if (state.wall[i] >= 2) {
          const [gx, gy] = tileToWorld(x, y);
          cache.props.push({ name: `gate_${state.wall[i]}`, wx: gx, wy: gy + 8, d: x + y + 0.5, sway: 0 });
          continue;
        }
        if (state.bIndex[i] >= 0 || state.road[i]) continue;
        const t = state.terrain[i];
        const [wx, wy] = tileToWorld(x, y);
        if (state.gloam[i]) {
          const r = h2(x, y, 11);
          if (r < 0.22) cache.props.push({ name: `gloamtree_${Math.floor(h2(x, y, 14) * 2)}`, wx: wx + (h2(x, y, 12) - 0.5) * 14, wy: wy + 8 + (h2(x, y, 13) - 0.5) * 6, d: x + y, sway: 0 });
          else if (r < 0.3) cache.props.push({ name: 'deadtree', wx: wx + (h2(x, y, 12) - 0.5) * 14, wy: wy + 8 + (h2(x, y, 13) - 0.5) * 6, d: x + y, sway: 0 });
          continue;
        }
        if (t === Terrain.Forest) {
          const n = 1 + (h2(x, y, 20) < 0.5 ? 1 : 0);
          let nearNode = false;
          for (const nd of state.nodes) if (Math.hypot(nd.x - x, nd.y - y) < 9) nearNode = true;
          for (let k = 0; k < n; k++) {
            const v = Math.floor(h2(x, y, 21 + k) * 4);
            const py = wy + 8 + (h2(x, y, 23 + k) - 0.5) * 8;
            const glim = nearNode && h2(x, y, 33 + k) < 0.6;
            cache.props.push({ name: glim ? `glimwood_${v % 2}` : h2(x, y, 30 + k) < 0.08 ? 'tree_autumn' : `tree_${v}`, wx: wx + (h2(x, y, 22 + k) - 0.5) * 16, wy: py, d: x + y + (py - wy) / 16, sway: h2(x, y, 40 + k) });
          }
          if (h2(x, y, 44) < 0.12) cache.props.push({ name: `mushroom_${Math.floor(h2(x, y, 45) * 2)}`, wx: wx + (h2(x, y, 46) - 0.5) * 18, wy: wy + 12, d: x + y - 0.1, sway: 0 });
        } else if (t === Terrain.Hills) {
          if (h2(x, y, 24) < 0.35) cache.props.push({ name: `rock_${Math.floor(h2(x, y, 25) * 3)}`, wx: wx + (h2(x, y, 26) - 0.5) * 12, wy: wy + 10, d: x + y, sway: 0 });
        } else if (t === Terrain.Ruins && state.bIndex[i] < 0 && !state.road[i]) {
          const r = h2(x, y, 50);
          if (r < 0.3) cache.props.push({ name: 'ruin', wx, wy, d: x + y, sway: 0 });
          else if (r < 0.42) cache.props.push({ name: 'deadtree', wx: wx + (h2(x, y, 51) - 0.5) * 10, wy: wy + 8, d: x + y, sway: 0 });
          else if (r < 0.5) cache.props.push({ name: `rock_${Math.floor(h2(x, y, 52) * 3)}`, wx: wx + (h2(x, y, 53) - 0.5) * 12, wy: wy + 10, d: x + y, sway: 0 });
        } else if ((t === Terrain.Grass || t === Terrain.Meadow) && !state.zone[i]) {
          if (h2(x, y, 27) < 0.05) cache.props.push({ name: 'bush', wx: wx + (h2(x, y, 28) - 0.5) * 12, wy: wy + 10, d: x + y, sway: 0 });
        } else if (t === Terrain.LeyNode) {
          cache.lights.push({ x: wx, y: wy + 8, r: 70, c: PAL.ley1, i: 0.9 });
          cache.props.push({ name: 'leynode', wx, wy, d: x + y + 0.4, sway: 0 });
          const wn = state.wyrm && state.wyrm.node >= 0 ? state.nodes[state.wyrm.node] : null;
          if (wn && wn.x === x && wn.y === y && state.wyrm.state !== 'none' && !(state.wyrm.flyover > 0)) {
            const st = state.wyrm.state === 'bound' ? 'awake' : state.wyrm.state;
            cache.props.push({ name: `wyrm_${st}_back`, wx, wy, d: x + y + 0.3, sway: 0 });
            cache.props.push({ name: `wyrm_${st}_front`, wx, wy, d: x + y + 0.9, sway: 0 });
            if (st !== 'dead') cache.lights.push({ x: wx, y: wy + 8, r: 90, c: PAL.ley2, i: 0.5 });
          }
        }
      }
    cache.hasWater = hasWater;
    cache.waterFrame = waterFrame;
    return cache;
  }

  private chunkOrigin(cx: number, cy: number): [number, number] {
    const [lx] = tileToWorld(cx * CHUNK, cy * CHUNK + CHUNK - 1);
    const [, ty] = tileToWorld(cx * CHUNK, cy * CHUNK);
    return [lx - TILE_W / 2, ty];
  }

  // ---------- overlays ----------
  private buildOverlayChunk(state: GameState, ci: number, id: OverlayId): HTMLCanvasElement {
    const cx = ci % CHUNKS_X;
    const cy = (ci / CHUNKS_X) | 0;
    let canvas = this.overlayChunks.get(ci);
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = CHUNK_W;
      canvas.height = CHUNK_H;
      this.overlayChunks.set(ci, canvas);
    }
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, CHUNK_W, CHUNK_H);
    const [ox, oy] = this.chunkOrigin(cx, cy);
    const ov = OVERLAYS[id];
    for (let ty = 0; ty < CHUNK; ty++)
      for (let tx = 0; tx < CHUNK; tx++) {
        const x = cx * CHUNK + tx;
        const y = cy * CHUNK + ty;
        const i = idx(x, y);
        const c = ov.tile(state, i, x, y);
        if (!c) continue;
        const [wx, wy] = tileToWorld(x, y);
        const dx = wx - ox;
        const dy = wy - oy;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(dx, dy);
        ctx.lineTo(dx + 16, dy + 8);
        ctx.lineTo(dx, dy + 16);
        ctx.lineTo(dx - 16, dy + 8);
        ctx.fill();
      }
    return canvas;
  }

  // ---------- main ----------
  render(state: GameState, view: ViewState, dt: number): void {
    const t0 = performance.now();
    this.stats.drawn = 0;
    this.time += dt;
    this.frame++;
    const cam = this.camera;
    const nw = cam.nativeW;
    const nh = cam.nativeH;
    const lightDiv = cam.zoom === 1 ? 4 : 2;
    if (this.back.width !== nw || this.back.height !== nh || this.lightDiv !== lightDiv) {
      this.back.width = nw;
      this.back.height = nh;
      this.lightDiv = lightDiv;
      this.light.width = Math.ceil(nw / lightDiv);
      this.light.height = Math.ceil(nh / lightDiv);
    }
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0b0912';
    ctx.fillRect(0, 0, nw, nh);

    const tod = timeOfDay(state);
    const night = view.overlay ? 0 : nightFactor(tod);
    const waterFrame = Math.floor(this.time * 3) % 4;

    // dirty chunks from sim
    if (state.dirtyChunks && state.dirtyChunks.size) {
      for (const ci of state.dirtyChunks) this.chunks.delete(ci);
      state.dirtyChunks.clear();
    }

    // visible chunk range (world bbox)
    const left = cam.left;
    const top = cam.top;
    const right = left + nw;
    const bottom = top + nh;
    const visible: number[] = [];
    for (let cy = 0; cy < CHUNKS_Y; cy++)
      for (let cx = 0; cx < CHUNKS_X; cx++) {
        const [ox, oy] = this.chunkOrigin(cx, cy);
        if (ox + CHUNK_W < left || ox > right || oy + CHUNK_H < top || oy > bottom) continue;
        visible.push(cy * CHUNKS_X + cx);
      }
    // ground
    for (const ci of visible) {
      let c = this.chunks.get(ci);
      if (!c || (c.hasWater && c.waterFrame !== waterFrame)) c = this.buildChunk(state, ci, waterFrame);
      const [ox, oy] = this.chunkOrigin(ci % CHUNKS_X, (ci / CHUNKS_X) | 0);
      ctx.drawImage(c.canvas, Math.round(ox - left), Math.round(oy - top));
    }
    const tGround = performance.now();
    // visible tile bounds (generous)
    const tl = cam.screenToTile(0, 0);
    const tr = cam.screenToTile(cam.viewW, 0);
    const bl = cam.screenToTile(0, cam.viewH);
    const br = cam.screenToTile(cam.viewW, cam.viewH);
    const minX = Math.max(0, Math.min(tl[0], bl[0]) - 2);
    const maxX = Math.min(MAP_W - 1, Math.max(tr[0], br[0]) + 3);
    const minY = Math.max(0, Math.min(tl[1], tr[1]) - 2);
    const maxY = Math.min(MAP_H - 1, Math.max(bl[1], br[1]) + 3);

    // overlay ground tint
    if (view.overlay) {
      if (this.overlayBuiltId !== view.overlay || this.overlayBuiltVersion !== this.overlayVersion) {
        this.overlayChunks.clear();
        this.overlayBuiltId = view.overlay;
        this.overlayBuiltVersion = this.overlayVersion;
      }
      ctx.fillStyle = 'rgba(20,16,30,0.45)';
      ctx.fillRect(0, 0, nw, nh);
      for (const ci of visible) {
        let c = this.overlayChunks.get(ci);
        if (!c) c = this.buildOverlayChunk(state, ci, view.overlay);
        const [ox, oy] = this.chunkOrigin(ci % CHUNKS_X, (ci / CHUNKS_X) | 0);
        ctx.drawImage(c, Math.round(ox - left), Math.round(oy - top));
      }
    }

    // rune rings under lit spires and wards
    if (night > 0.15) this.drawRuneRings(state, night, minX, maxX, minY, maxY);
    // grid
    if (view.showGrid) this.drawGrid(minX, maxX, minY, maxY);

    // preview tiles (under objects)
    this.drawPreviews(state, view);

    // objects: props, buildings, agents
    const items: { d: number; y: number; fn: () => void }[] = [];
    const sky: { s: SpriteRect | null; x: number; y: number; alt: number; line: number }[] = [];
    const icons: { x: number; y: number; name: string }[] = [];
    const lights: { x: number; y: number; r: number; c: string; i: number }[] = [];
    const glows: { s: SpriteRect; x: number; y: number; a: number }[] = [];
    const sway = Math.sin(this.time * 1.3) * 1;
    const useSway = cam.zoom > 1;
    for (const ci of visible) {
      const c = this.chunks.get(ci)!;
      for (const p of c.props) {
        const s = this.atlas.get(p.name);
        const sw = useSway && p.sway ? Math.round(sway * p.sway) : 0;
        items.push({ d: p.d, y: p.wy, fn: () => this.draw(s, p.wx + sw, p.wy) });
        if (s && s.glow && night > 0.05) glows.push({ s, x: p.wx + sw, y: p.wy, a: p.name === 'leynode' || p.name.startsWith('wyrm_') ? 0.6 + 0.3 * Math.sin(this.time * 2 + p.wx) : 0.7 });
      }
      for (const l of c.lights) {
        lights.push(l);
        if (Math.random() < 0.15) this.particles.emit({ x: l.x + (Math.random() - 0.5) * 10, y: l.y, vx: (Math.random() - 0.5) * 4, vy: -8 - Math.random() * 8, maxLife: 2, size: 1, color: PAL.leyGlow, glow: true, kind: 'spark' });
      }
    }
    // buildings
    const flameFrame = Math.floor(this.time * 8) % 3;
    let fireSeen = 0;
    let millSeen = 0;
    let raySeen = 0;
    let golemSeen = 0;
    let marketSeen = 0;
    let leySeen = 0;
    let waterSeen = 0;
    for (const ci of visible) {
      const c = this.chunks.get(ci)!;
      if (c.hasWater) waterSeen++;
      leySeen += c.lights.length;
    }
    for (const b of state.buildings) {
      if (!b) continue;
      if (b.x + b.w - 1 < minX || b.x > maxX || b.y + b.h - 1 < minY || b.y > maxY) continue;
      const [wx, wy] = tileToWorld(b.x, b.y);
      const def = BUILDING_BY_KEY[b.kind];
      const name = this.spriteNameFor(b);
      const s = this.atlas.get(name);
      const d = b.x + b.w - 1 + b.y + b.h - 1 + 0.5;
      const abandoned = b.state === 'abandoned';
      const burning = b.state === 'burning';
      if (burning) fireSeen++;
      if (def.zone === Zone.Market && b.state === 'ok') marketSeen++;
      if (b.lit && (b.kind === 'spire' || b.kind === 'nexus' || b.kind === 'font' || b.kind === 'lantern')) leySeen++;
      if (b.kind === 'torrentmill' && b.state === 'ok') millSeen++;
      items.push({ d, y: wy, fn: () => {
        this.draw(s, wx, wy, abandoned ? 0.55 : 1);
        if (burning) {
          const f = this.atlas.get(`flame_${(flameFrame + b.id) % 3}`);
          const [bx, by] = tileToWorld(b.x + b.w - 1, b.y + b.h - 1);
          this.draw(f, bx - 4, by + 4);
          this.draw(f, wx + 4, wy + 6);
        }
      } });
      // icons
      if (def.category === 'zone' && b.state === 'ok' && cam.zoom >= 2) {
        if (!b.lit && b.problemDays >= 2) icons.push({ x: wx, y: wy - 10, name: 'icon_nomana' });
        else if (!b.watered && b.problemDays >= 2) icons.push({ x: wx, y: wy - 10, name: 'icon_nowater' });
        else if (b.happiness < 25 && b.unhappyDays >= 2) icons.push({ x: wx, y: wy - 10, name: 'icon_unhappy' });
        else if (def.zone === Zone.Market && b.stock <= 0.5 && b.age > 3) icons.push({ x: wx, y: wy - 10, name: 'icon_nogoods' });
      }
      if (abandoned) icons.push({ x: wx, y: wy - 10, name: 'icon_abandoned' });
      if (burning) icons.push({ x: wx, y: wy - 14, name: 'icon_fire' });
      // lights & glow
      const cx = wx + ((b.w - b.h) * TILE_W) / 4;
      const cy = wy + ((b.w + b.h) * TILE_H) / 4;
      if (burning) {
        lights.push({ x: cx, y: cy, r: 40 + Math.random() * 6, c: PAL.ember, i: 1 });
        if (Math.random() < 0.6) this.particles.emit({ x: cx + (Math.random() - 0.5) * 16, y: cy - 6, vx: (Math.random() - 0.5) * 6, vy: -14 - Math.random() * 10, maxLife: 1.2, size: 1, color: Math.random() < 0.5 ? PAL.fire1 : PAL.ember, glow: true, kind: 'ember' });
        if (Math.random() < 0.3) this.particles.emit({ x: cx, y: cy - 10, vx: 0, vy: -10, maxLife: 3, size: 2, color: PAL.smoke, glow: false, kind: 'smoke' });
      } else if (b.lit && b.state === 'ok') {
        const ley = b.kind === 'spire' || b.kind === 'nexus' || b.kind === 'font' || b.kind === 'wardlantern' || b.kind === 'lantern' || def.zone === Zone.Arcane;
        if (ley) lights.push({ x: cx, y: cy - 8, r: b.kind === 'lantern' ? 120 : b.kind === 'spire' ? 34 : 46, c: PAL.ley1, i: 0.8 });
        else if ((def.category === 'zone' && (cam.zoom > 1 || (b.x + b.y) % 3 === 0)) || def.category === 'service' || def.category === 'leisure' || def.category === 'special') lights.push({ x: cx, y: cy - 4, r: 14 + b.level * 4 + (b.w - 1) * 12, c: PAL.lampWarm, i: 0.55 });
        if (s && s.glow) glows.push({ s, x: wx, y: wy, a: 0.9 });
        // spire sparkles
        if ((b.kind === 'spire' || b.kind === 'nexus') && Math.random() < 0.08) this.particles.emit({ x: cx + (Math.random() - 0.5) * 6, y: cy - 20 - Math.random() * 10, vx: (Math.random() - 0.5) * 6, vy: -4, maxLife: 1.5, size: 1, color: PAL.leyGlow, glow: true, kind: 'spark' });
        if (b.kind === 'wardlantern' && Math.random() < 0.1) this.particles.emit({ x: cx + (Math.random() - 0.5) * 20, y: cy - 8 - Math.random() * 16, vx: (Math.random() - 0.5) * 8, vy: -3, maxLife: 2, size: 1, color: PAL.ley1, glow: true, kind: 'ward' });
        // chimney smoke
        if (b.kind === 'torrentmill' && cam.zoom >= 2 && Math.random() < 0.5) this.particles.emit({ x: wx - 8 + (Math.random() - 0.5) * 6, y: wy + 6, vx: (Math.random() - 0.5) * 10, vy: -10 - Math.random() * 12, maxLife: 0.5, size: 1, color: PAL.waterHi, glow: false, kind: 'mote' });
        if (def.category === 'zone' && (def.zone === Zone.Hearth || def.zone === Zone.Craft) && (b.level >= 2 || b.variant % 2 === 0) && Math.random() < 0.035 && cam.zoom >= 2) {
          const craft = def.zone === Zone.Craft;
          this.particles.emit({ x: wx - 4 + (Math.random() - 0.5) * 4, y: wy - (4 + b.level * 4), vx: 0, vy: -4, maxLife: 2.5 + Math.random(), size: craft ? 2 : 1, color: craft ? '#8fa08a' : PAL.smoke, glow: false, kind: 'smoke' });
        }
      }
      if (b.kind === 'wardlantern' && b.lit) lights.push({ x: cx, y: cy - 20, r: 60, c: PAL.ley1, i: 0.6 });
    }
    this.inView.fire = Math.min(1, fireSeen / 3);
    this.inView.mills = Math.min(1, millSeen / 2);
    this.inView.rays = Math.min(1, raySeen / 3);
    this.inView.golems = Math.min(1, golemSeen / 2);
    this.inView.storm = state.storms.some((st) => st.x >= minX - 6 && st.x <= maxX + 6 && st.y >= minY - 6 && st.y <= maxY + 6) ? 1 : 0;
    this.inView.market = Math.min(1, marketSeen / 12);
    this.inView.ley = Math.min(1, leySeen / 6);
    this.inView.water = Math.min(1, waterSeen / Math.max(6, visible.length * 0.5));
    // agents
    const walkFrame = Math.floor(this.time * 8) % 4;
    for (const a of state.agents) {
      if (a.x < minX || a.x > maxX + 1 || a.y < minY || a.y > maxY + 1) continue;
      if (a.kind === AgentKind.Creature && a.species === 'skyray') raySeen++;
      if (a.kind === AgentKind.Creature && a.species === 'golem' && a.path.length) golemSeen++;
      if (a.timer > 0 && a.kind !== AgentKind.Restless && a.kind !== AgentKind.Creature) continue; // resting inside a building
      const [wx, wy] = tileToWorld(a.x - 0.5, a.y - 0.5);
      if (a.kind === AgentKind.Creature) {
        const sp = a.species;
        if (sp === 'glimmoth') {
          const s = this.atlas.get(`glimmoth_${Math.floor(this.time * 10 + a.id) % 2}`);
          const bob = Math.sin(this.time * 4 + a.id) * 2 - 14;
          items.push({ d: a.x + a.y + 0.6, y: wy, fn: () => this.draw(s, wx, wy + 8 + bob) });
          if (s) glows.push({ s, x: wx, y: wy + 8 + bob, a: 0.9 });
          if (night > 0.2 && Math.random() < 0.03) this.particles.emit({ x: wx, y: wy + 8 + bob, vx: (Math.random() - 0.5) * 3, vy: 2, maxLife: 1.5, size: 1, color: PAL.glimleaf, glow: true, kind: 'spark' });
        } else if (sp === 'thrumhare') {
          const s = this.atlas.get(`thrumhare_${a.path.length ? Math.floor(this.time * 8) % 2 : 0}`);
          items.push({ d: a.x + a.y - 0.2, y: wy, fn: () => this.draw(s, wx, wy + 8) });
        } else if (sp === 'wyvern' || sp === 'wyrm') {
          const alt = a.alt ?? 0;
          const big = sp === 'wyrm';
          const s = this.atlas.get(big ? `wyrm_fly_${Math.floor(this.time * 4 + a.id) % 2}` : `wyvern_${a.variant}_${Math.floor(this.time * 7 + a.id) % 2}`);
          // ground shadow, in the depth-sorted pass
          items.push({ d: a.x + a.y - 0.3, y: wy, fn: () => {
            const ctx2 = this.ctx;
            ctx2.fillStyle = `rgba(10,8,16,${(big ? 0.45 : 0.35) - alt / 160})`;
            ctx2.beginPath();
            ctx2.ellipse(Math.round(wx - left), Math.round(wy + 8 - top), big ? 26 : 10, big ? 10 : 4, 0, 0, Math.PI * 2);
            ctx2.fill();
          } });
          if (big && a.load > 0 && Math.random() < 0.3) this.particles.emit({ x: wx + (Math.random() - 0.5) * 20, y: wy + 6 - alt, vx: (Math.random() - 0.5) * 6, vy: 6, maxLife: 0.9, size: 1, color: PAL.ember, glow: true, kind: 'ember' });
          sky.push({ s, x: wx, y: wy + 8 - alt, alt, line: a.variant });
          if (a.variant === 0 && Math.random() < 0.1) this.particles.emit({ x: wx, y: wy + 4 - alt, vx: (Math.random() - 0.5) * 4, vy: 2, maxLife: 0.8, size: 1, color: PAL.ember, glow: true, kind: 'ember' });
          if (a.variant === 4 && Math.random() < 0.2) this.particles.emit({ x: wx - 8, y: wy + 6 - alt, vx: -20, vy: 0, maxLife: 0.6, size: 1, color: PAL.flower3, glow: false, kind: 'mote' });
        } else if (sp === 'drake') {
          const d = state.dragons.find((x) => x.id === a.dragonId);
          const stage = d && d.stage >= 2 ? 2 : 1;
          const s = this.atlas.get(`dragon_${a.variant}_${stage}_${a.path.length ? Math.floor(this.time * 6 + a.id) % 2 : 0}`);
          items.push({ d: a.x + a.y, y: wy, fn: () => this.draw(s, wx, wy + 8) });
          if (s && s.glow) glows.push({ s, x: wx, y: wy + 8, a: 0.9 });
          if (a.variant === 0 && Math.random() < 0.08) this.particles.emit({ x: wx + 6, y: wy + 2, vx: (Math.random() - 0.5) * 4, vy: -8, maxLife: 1, size: 1, color: PAL.ember, glow: true, kind: 'ember' });
          if (a.variant === 2) lights.push({ x: wx, y: wy + 4, r: 22, c: PAL.lampWarm, i: 0.6 });
          if (a.variant === 1 && Math.random() < 0.05) this.particles.emit({ x: wx + (Math.random() - 0.5) * 8, y: wy + 2, vx: 0, vy: -4, maxLife: 1.5, size: 1, color: PAL.restless, glow: true, kind: 'restless' });
        } else if (sp === 'hound') {
          const s = this.atlas.get(`hound_${a.timer > 0 ? 0 : Math.floor(this.time * 8 + a.id) % 2}`);
          items.push({ d: a.x + a.y - 0.1, y: wy, fn: () => this.draw(s, wx, wy + 8) });
          if (s) glows.push({ s, x: wx, y: wy + 8, a: 0.9 });
          if (Math.random() < 0.05) this.particles.emit({ x: wx + (Math.random() - 0.5) * 8, y: wy + 6, vx: (Math.random() - 0.5) * 3, vy: -3, maxLife: 2, size: 1, color: PAL.gloam3, glow: false, kind: 'mote' });
        } else if (sp === 'golem') {
          const s = this.atlas.get(`golem_${a.path.length ? Math.floor(this.time * 3 + a.id) % 2 : 0}`);
          items.push({ d: a.x + a.y + 0.1, y: wy, fn: () => this.draw(s, wx, wy + 8) });
          if (s && s.glow && a.load > 0) glows.push({ s, x: wx, y: wy + 8, a: 0.8 });
          if (a.path.length && Math.random() < 0.15) this.particles.emit({ x: wx + (Math.random() - 0.5) * 8, y: wy + 8, vx: (Math.random() - 0.5) * 6, vy: -4, maxLife: 0.8, size: 1, color: PAL.stone3, glow: false, kind: 'mote' });
        } else if (sp === 'tiger') {
          const s = this.atlas.get(`tiger_${a.path.length ? Math.floor(this.time * 8 + a.id) % 2 : 0}`);
          items.push({ d: a.x + a.y - 0.1, y: wy, fn: () => this.draw(s, wx, wy + 8) });
          if (s && s.glow) glows.push({ s, x: wx, y: wy + 8, a: 0.9 });
        } else if (sp === 'rider' || sp === 'airship') {
          const alt = a.alt ?? 0;
          const big = sp === 'airship';
          const s = this.atlas.get(big ? `airship_${Math.floor(this.time * 2) % 2}` : `rider_${Math.floor(this.time * 6 + a.id) % 2}`);
          items.push({ d: a.x + a.y - 0.3, y: wy, fn: () => {
            const ctx2 = this.ctx;
            ctx2.fillStyle = `rgba(10,8,16,${(big ? 0.4 : 0.3) - alt / 220})`;
            ctx2.beginPath();
            ctx2.ellipse(Math.round(wx - left), Math.round(wy + 8 - top), big ? 20 : 8, big ? 8 : 3, 0, 0, Math.PI * 2);
            ctx2.fill();
          } });
          sky.push({ s, x: wx, y: wy + 8 - alt, alt, line: 4 });
          if (big && Math.random() < 0.3) this.particles.emit({ x: wx - 14, y: wy + 6 - alt, vx: -8, vy: -2, maxLife: 1.2, size: 1, color: PAL.smoke, glow: false, kind: 'smoke' });
        } else if (sp === 'skyray') {
          const alt = a.alt ?? 0;
          const s = this.atlas.get(`skyray_${Math.floor(this.time * 1.5 + a.id) % 2}`);
          items.push({ d: a.x + a.y - 0.3, y: wy, fn: () => {
            const ctx2 = this.ctx;
            ctx2.fillStyle = 'rgba(10,8,16,0.22)';
            ctx2.beginPath();
            ctx2.ellipse(Math.round(wx - left), Math.round(wy + 8 - top), 16, 6, 0, 0, Math.PI * 2);
            ctx2.fill();
          } });
          sky.push({ s, x: wx, y: wy + 8 - alt, alt, line: 4 });
        } else if (sp === 'wisp') {
          const s = this.atlas.get(`wisp_${Math.floor(this.time * 3 + a.id) % 2}`);
          const bob = Math.sin(this.time * 2 + a.id) * 3 - 10;
          items.push({ d: a.x + a.y + 0.5, y: wy, fn: () => this.draw(s, wx, wy + 8 + bob, 0.85) });
          if (s) glows.push({ s, x: wx, y: wy + 8 + bob, a: 0.8 });
          lights.push({ x: wx, y: wy + bob, r: 14, c: PAL.restless, i: 0.4 });
        }
        continue;
      }
      let name: string;
      if (a.kind === AgentKind.Citizen) name = `cit_${a.variant}_${walkFrame}`;
      else if (a.kind === AgentKind.Cart) name = `cart_${a.variant}`;
      else name = `restless_${Math.floor(this.time * 2 + a.id) % 2}`;
      const s = this.atlas.get(name);
      const floating = a.kind === AgentKind.Cart && a.variant === 3;
      const bob = a.kind === AgentKind.Restless ? Math.sin(this.time * 3 + a.id) * 2 - 3 : floating ? Math.sin(this.time * 2.5 + a.id) * 1.5 - 5 : 0;
      if (floating && s && s.glow && night > 0.05) glows.push({ s, x: wx, y: wy + 8 + bob, a: 0.8 });
      if (floating && Math.random() < 0.2) this.particles.emit({ x: wx + (Math.random() - 0.5) * 8, y: wy + 10, vx: 0, vy: 3, maxLife: 0.5, size: 1, color: PAL.arcane2, glow: true, kind: 'spark' });
      if (a.kind === AgentKind.Cart && a.variant === 4 && a.pathIdx < a.path.length && Math.random() < 0.3) this.particles.emit({ x: wx + (Math.random() - 0.5) * 6, y: wy + 10, vx: (Math.random() - 0.5) * 6, vy: -1, maxLife: 0.7, size: 1, color: PAL.waterHi, glow: false, kind: 'mote' });
      items.push({ d: a.x + a.y - 0.2, y: wy, fn: () => this.draw(s, wx, wy + 8 + bob) });
      if (a.kind === AgentKind.Restless) {
        if (s) glows.push({ s, x: wx, y: wy + 8 + bob, a: 0.8 });
        lights.push({ x: wx, y: wy + 4, r: 18, c: PAL.restless, i: 0.5 });
        if (Math.random() < 0.1) this.particles.emit({ x: wx + (Math.random() - 0.5) * 6, y: wy + 4, vx: (Math.random() - 0.5) * 3, vy: -5, maxLife: 1.5, size: 1, color: PAL.restless, glow: true, kind: 'restless' });
      }
    }
    // ghost building
    if (view.ghost) {
      const g = view.ghost;
      const def = BUILDING_BY_KEY[g.key];
      const [wx, wy] = tileToWorld(g.x, g.y);
      const s = this.atlas.get(def.category === 'zone' ? `${g.key}_l1_v0` : `b_${g.key}`);
      items.push({ d: g.x + def.w - 1 + g.y + def.h - 1 + 0.6, y: wy, fn: () => this.draw(s, wx, wy, 0.6) });
    }
    const tSort = performance.now();
    items.sort((p, q) => p.d - q.d || p.y - q.y);
    const tObjects = performance.now();
    for (const it of items) it.fn();
    const tParticles = performance.now();

    // particles
    this.particles.update(dt, this.wind);
    this.emitAmbient(state, minX, maxX, minY, maxY, night);
    for (const p of this.particles.list) {
      if (p.glow && night < 0.05 && p.kind !== 'ember' && p.kind !== 'surge') continue;
      const a = Math.min(1, p.life / p.maxLife * 1.5);
      ctx.globalAlpha = p.kind === 'smoke' ? a * 0.5 : a;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x - left), Math.round(p.y - top), p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // warding wall inlays glow
    if (night > 0.05) {
      for (let y = minY; y <= maxY; y++)
        for (let x = minX; x <= maxX; x++) {
          const i = idx(x, y);
          if (state.wall[i] !== 1) continue;
          const [wx, wy] = tileToWorld(x, y);
          const s = this.atlas.get(`wall_${(y > 0 && state.wall[idx(x, y - 1)] ? 1 : 0) | (x < MAP_W - 1 && state.wall[idx(x + 1, y)] ? 2 : 0) | (y < MAP_H - 1 && state.wall[idx(x, y + 1)] ? 4 : 0) | (x > 0 && state.wall[idx(x - 1, y)] ? 8 : 0)}`);
          if (s) glows.push({ s, x: wx, y: wy, a: 0.6 });
          if ((x + y) % 3 === 0) lights.push({ x: wx, y: wy + 8, r: 16, c: PAL.ley1, i: 0.3 });
        }
    }
    // lantern-way road lights
    if (night > 0.05) {
      for (let y = minY; y <= maxY; y++)
        for (let x = minX; x <= maxX; x++) {
          const i = idx(x, y);
          if (state.road[i] === RoadType.Lantern && state.lit[i] && (x + y) % 2 === 0) {
            const [wx, wy] = tileToWorld(x, y);
            lights.push({ x: wx, y: wy + 8, r: 22, c: PAL.lanternLight, i: 0.6 });
          } else if (state.road[i] === RoadType.Glowvine && state.lit[i]) {
            const [wx, wy] = tileToWorld(x, y);
            lights.push({ x: wx, y: wy + 8, r: 18, c: PAL.glimleaf, i: 0.45 + 0.1 * Math.sin(this.time * 1.5 + x * 0.7 + y) });
          }
        }
    }

    // overlay tint on top of objects (readability)
    if (view.overlay) {
      ctx.globalAlpha = 0.35;
      for (const ci of visible) {
        const c = this.overlayChunks.get(ci);
        if (!c) continue;
        const [ox, oy] = this.chunkOrigin(ci % CHUNKS_X, (ci / CHUNKS_X) | 0);
        ctx.drawImage(c, Math.round(ox - left), Math.round(oy - top));
      }
      ctx.globalAlpha = 1;
    }

    // district labels
    if (view.overlay === 'district') this.drawDistrictLabels(state, minX, maxX, minY, maxY);
    // lighting
    const tLight = performance.now();
    if (night > 0.01) this.applyLighting(tod, night, lights, glows);
    else this.applyDayTint(tod);
    // ley lines shimmer above the lit scene at night
    if (night > 0.05) this.drawLeyLines(state, night);
    const tBlit = performance.now();

    // sky layer: flying things above the lit scene
    for (const f of sky) {
      this.draw(f.s, f.x, f.y);
      if (f.s && f.s.glow && night > 0.05) { ctx.globalCompositeOperation = 'lighter'; this.drawGlow(f.s, f.x, f.y, 0.9 * night); ctx.globalCompositeOperation = 'source-over'; }
    }
    // mana-storms: a pocket of wild ley
    for (const st of state.storms) {
      if (st.x < minX - 6 || st.x > maxX + 6 || st.y < minY - 6 || st.y > maxY + 6) continue;
      const [sx, sy] = tileToWorld(st.x, st.y);
      lights.push({ x: sx, y: sy + 8, r: 90, c: PAL.arcane2, i: 0.5 + 0.2 * Math.sin(this.time * 3) });
      for (let k = 0; k < 3; k++) {
        const ang = Math.random() * Math.PI * 2;
        const rr = Math.random() * 5;
        const [px, py] = tileToWorld(st.x + Math.cos(ang) * rr, st.y + Math.sin(ang) * rr);
        this.particles.emit({ x: px, y: py - Math.random() * 20, vx: (Math.random() - 0.5) * 10, vy: -6 - Math.random() * 8, maxLife: 1.2, size: 1, color: Math.random() < 0.5 ? PAL.arcane2 : PAL.ley1, glow: true, kind: 'surge' });
      }
    }
    // icons (always on top, bobbing)
    const bobY = Math.round(Math.sin(this.time * 4) * 1.5);
    for (const ic of icons) this.draw(this.atlas.get(ic.name), ic.x, ic.y + bobY);

    // hover cursor
    if (view.hover) {
      const [hx, hy] = view.hover;
      if (inBounds(hx, hy)) {
        const [wx, wy] = tileToWorld(hx, hy);
        this.draw(this.atlas.get('cursor'), wx, wy, 0.8);
      }
    }
    // selected
    if (view.selected) {
      const b = view.selected;
      ctx.strokeStyle = PAL.gold;
      ctx.lineWidth = 1;
      this.strokeFootprint(b.x, b.y, b.w, b.h);
    }

    // blit to screen
    const sctx = this.sctx;
    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(this.back, 0, 0, nw, nh, 0, 0, nw * cam.zoom, nh * cam.zoom);
    const tEnd = performance.now();
    this.stats.ms = tEnd - t0;
    this.stats.ground = tGround - t0;
    this.stats.sort = tObjects - tSort;
    this.stats.objects = tParticles - tObjects;
    this.stats.particles = tLight - tParticles;
    this.stats.lighting = tBlit - tLight;
    this.stats.blit = tEnd - tBlit;
  }

  private spriteNameFor(b: Building): string {
    const def = BUILDING_BY_KEY[b.kind];
    if (b.state === 'ruin') return def.w === 1 ? 'ruin' : def.w === 2 ? 'ruin2' : 'ruin3';
    if (def.category === 'zone') return `${b.kind}_l${b.level}_v${b.variant % 4}`;
    if (b.kind === 'worldtree') return `b_worldtree_${treeStage(b)}`;
    return `b_${b.kind}`;
  }

  private strokeFootprint(x: number, y: number, w: number, h: number): void {
    const ctx = this.ctx;
    const [tx, ty] = tileToWorld(x, y);
    const [rx, ry] = tileToWorld(x + w, y);
    const [bx, by] = tileToWorld(x + w, y + h);
    const [lx, ly] = tileToWorld(x, y + h);
    const L = this.camera.left;
    const T = this.camera.top;
    ctx.beginPath();
    ctx.moveTo(tx - L + 0.5, ty - T + 0.5);
    ctx.lineTo(rx - L + 0.5, ry - T + 0.5);
    ctx.lineTo(bx - L + 0.5, by - T + 0.5);
    ctx.lineTo(lx - L + 0.5, ly - T + 0.5);
    ctx.closePath();
    ctx.stroke();
  }

  private drawRuneRings(state: GameState, night: number, minX: number, maxX: number, minY: number, maxY: number): void {
    const ctx = this.ctx;
    const L = this.camera.left;
    const T = this.camera.top;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 1;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 1.5);
    for (const b of state.buildings) {
      if (!b || !b.lit || b.state !== 'ok') continue;
      if (b.kind !== 'spire' && b.kind !== 'nexus' && b.kind !== 'wardlantern' && b.kind !== 'font' && b.kind !== 'lantern') continue;
      if (b.x + b.w < minX || b.x > maxX || b.y + b.h < minY || b.y > maxY) continue;
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const r = b.kind === 'spire' ? 1.6 : b.kind === 'wardlantern' ? 2.2 : 2.6;
      ctx.strokeStyle = `rgba(79,227,255,${(0.18 + 0.12 * pulse) * night})`;
      ctx.beginPath();
      for (let k = 0; k <= 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        const [wx, wy] = tileToWorld(cx + Math.cos(a) * r - 0.5, cy + Math.sin(a) * r - 0.5);
        if (k === 0) ctx.moveTo(wx - L, wy - T + 8);
        else ctx.lineTo(wx - L, wy - T + 8);
      }
      ctx.closePath();
      ctx.stroke();
      // glyph dots on the ring
      ctx.fillStyle = `rgba(255,217,138,${(0.5 + 0.4 * pulse) * night})`;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + this.time * 0.3;
        const [wx, wy] = tileToWorld(cx + Math.cos(a) * r - 0.5, cy + Math.sin(a) * r - 0.5);
        ctx.fillRect(Math.round(wx - L), Math.round(wy - T + 8), 1, 1);
      }
    }
    ctx.restore();
  }

  private drawDistrictLabels(state: GameState, minX: number, maxX: number, minY: number, maxY: number): void {
    const sums = new Map<number, { x: number; y: number; n: number }>();
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        const d = state.district[idx(x, y)];
        if (!d) continue;
        let e = sums.get(d);
        if (!e) sums.set(d, (e = { x: 0, y: 0, n: 0 }));
        e.x += x;
        e.y += y;
        e.n++;
      }
    // per-district problems: unlit, dry, empty shelves
    const prob = new Map<number, { unlit: number; dry: number; empty: number }>();
    for (const b of state.buildings) {
      if (!b || b.state !== 'ok') continue;
      const def = BUILDING_BY_KEY[b.kind];
      if (def.category !== 'zone') continue;
      const d = state.district[idx(b.x, b.y)];
      if (!d) continue;
      let p = prob.get(d);
      if (!p) prob.set(d, (p = { unlit: 0, dry: 0, empty: 0 }));
      if (!b.lit) p.unlit++;
      if (!b.watered) p.dry++;
      if (def.zone === Zone.Market && b.stock <= 0.5 && b.age > 3) p.empty++;
    }
    const ctx = this.ctx;
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    for (const [d, e] of sums) {
      if (e.n < 4) continue;
      const p = prob.get(d);
      const bits: string[] = [];
      if (p?.unlit) bits.push(`${p.unlit} unlit`);
      if (p?.dry) bits.push(`${p.dry} dry`);
      if (p?.empty) bits.push(`${p.empty} empty`);
      const [wx, wy] = tileToWorld(e.x / e.n, e.y / e.n);
      const sx = Math.round(wx - this.camera.left);
      const sy = Math.round(wy - this.camera.top);
      const name = state.districtNames[d] || DISTRICT_NAMES[d - 1];
      const w = ctx.measureText(name).width + 6;
      ctx.fillStyle = 'rgba(10,8,16,0.75)';
      ctx.fillRect(sx - w / 2, sy - 7, w, 11);
      ctx.fillStyle = DISTRICT_COLORS[d - 1];
      ctx.fillText(name, sx, sy + 2);
      if (bits.length) {
        const line = bits.join(' · ');
        ctx.font = '8px sans-serif';
        const w2 = ctx.measureText(line).width + 6;
        ctx.fillStyle = 'rgba(10,8,16,0.75)';
        ctx.fillRect(sx - w2 / 2, sy + 5, w2, 10);
        ctx.fillStyle = PAL.fire2;
        ctx.fillText(line, sx, sy + 13);
        ctx.font = 'bold 9px sans-serif';
      }
    }
    ctx.textAlign = 'left';
  }

  private drawGrid(minX: number, maxX: number, minY: number, maxY: number): void {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    const L = this.camera.left;
    const T = this.camera.top;
    ctx.beginPath();
    for (let x = minX; x <= maxX + 1; x++) {
      const [ax, ay] = tileToWorld(x, minY);
      const [bx, by] = tileToWorld(x, maxY + 1);
      ctx.moveTo(ax - L, ay - T);
      ctx.lineTo(bx - L, by - T);
    }
    for (let y = minY; y <= maxY + 1; y++) {
      const [ax, ay] = tileToWorld(minX, y);
      const [bx, by] = tileToWorld(maxX + 1, y);
      ctx.moveTo(ax - L, ay - T);
      ctx.lineTo(bx - L, by - T);
    }
    ctx.stroke();
  }

  private drawPreviews(state: GameState, view: ViewState): void {
    const ctx = this.ctx;
    const L = this.camera.left;
    const T = this.camera.top;
    const zoneName = view.previewZone === Zone.Hearth ? 'hearth' : view.previewZone === Zone.Market ? 'market' : view.previewZone === Zone.Craft ? 'craft' : view.previewZone === Zone.Arcane ? 'arcane' : null;
    for (const p of view.previewTiles) {
      const x = p.i % MAP_W;
      const y = (p.i / MAP_W) | 0;
      const [wx, wy] = tileToWorld(x, y);
      if (view.previewDistrict >= 0) {
        ctx.fillStyle = view.previewDistrict === 0 ? 'rgba(255,255,255,0.25)' : DISTRICT_COLORS[view.previewDistrict - 1] + '88';
        ctx.beginPath();
        ctx.moveTo(wx - L, wy - T);
        ctx.lineTo(wx - L + 16, wy - T + 8);
        ctx.lineTo(wx - L, wy - T + 16);
        ctx.lineTo(wx - L - 16, wy - T + 8);
        ctx.fill();
      } else if (zoneName && p.ok) this.draw(this.atlas.get(`zone_${zoneName}`), wx, wy, 0.9);
      else this.draw(this.atlas.get(p.ok ? 'cursor_ok' : 'cursor_bad'), wx, wy, 0.9);
    }
    if (view.ghost) {
      const g = view.ghost;
      const def = BUILDING_BY_KEY[g.key];
      for (let dy = 0; dy < def.h; dy++)
        for (let dx = 0; dx < def.w; dx++) {
          const [wx, wy] = tileToWorld(g.x + dx, g.y + dy);
          this.draw(this.atlas.get(g.ok ? 'cursor_ok' : 'cursor_bad'), wx, wy, 0.9);
        }
      if (g.radius > 0) {
        // radius ring
        const cx = g.x + (def.w - 1) / 2;
        const cy = g.y + (def.h - 1) / 2;
        ctx.fillStyle = 'rgba(120,220,255,0.12)';
        ctx.strokeStyle = 'rgba(120,220,255,0.5)';
        ctx.beginPath();
        const steps = 48;
        for (let k = 0; k <= steps; k++) {
          const a = (k / steps) * Math.PI * 2;
          const tx = cx + 0.5 + Math.cos(a) * g.radius;
          const ty = cy + 0.5 + Math.sin(a) * g.radius;
          const [wx, wy] = tileToWorld(tx, ty);
          if (k === 0) ctx.moveTo(wx - L, wy - T);
          else ctx.lineTo(wx - L, wy - T);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  private drawLeyLines(state: GameState, night: number): void {
    const ctx = this.ctx;
    const L = this.camera.left;
    const T = this.camera.top;
    const sources: { x: number; y: number; link: number }[] = state.nodes.map((n) => ({ x: n.x + 0.5, y: n.y + 0.5, link: 6.5 }));
    const spires: { x: number; y: number; link: number }[] = [];
    for (const b of state.buildings) {
      if (!b || !b.lit) continue;
      if (b.kind === 'spire' || b.kind === 'nexus' || b.kind === 'lantern' || b.kind === 'stake') spires.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, link: b.kind === 'spire' ? 6.5 : b.kind === 'stake' ? 4.5 : 9.5 });
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(79,227,255,${0.55 * night})`;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.lineDashOffset = -this.time * 12;
    ctx.beginPath();
    for (const s of spires) {
      // link to the nearest source (node or another spire) within link range
      let best: { x: number; y: number } | null = null;
      let bd = Infinity;
      for (const src of [...sources, ...spires]) {
        if (src === s) continue;
        const d = Math.hypot(src.x - s.x, src.y - s.y);
        if (d < bd && d <= s.link) {
          bd = d;
          best = src;
        }
      }
      if (!best) continue;
      const [ax, ay] = tileToWorld(s.x - 0.5, s.y - 0.5);
      const [bx, by] = tileToWorld(best.x - 0.5, best.y - 0.5);
      ctx.moveTo(ax - L, ay - T + 8);
      ctx.lineTo(bx - L, by - T + 8);
    }
    ctx.stroke();
    ctx.restore();
  }

  private emitAmbient(state: GameState, minX: number, maxX: number, minY: number, maxY: number, night: number): void {
    const area = (maxX - minX + 1) * (maxY - minY + 1);
    const tries = Math.min(6, Math.ceil(area / 400));
    for (let k = 0; k < tries; k++) {
      const x = minX + Math.floor(Math.random() * (maxX - minX + 1));
      const y = minY + Math.floor(Math.random() * (maxY - minY + 1));
      if (!inBounds(x, y)) continue;
      const i = idx(x, y);
      const [wx, wy] = tileToWorld(x, y);
      const t = state.terrain[i];
      if (state.gloam[i]) {
        this.particles.emit({ x: wx + (Math.random() - 0.5) * 24, y: wy + 8 + (Math.random() - 0.5) * 10, vx: (Math.random() - 0.5) * 3, vy: -3, maxLife: 3, size: 1, color: PAL.gloam3, glow: false, kind: 'mote' });
      } else if (t === Terrain.Forest && Math.random() < 0.5) {
        this.particles.emit({ x: wx + (Math.random() - 0.5) * 24, y: wy - 6, vx: 0, vy: 8, maxLife: 2.5, size: 1, color: Math.random() < 0.3 ? PAL.leafAutumn : PAL.leaf3, glow: false, kind: 'leaf' });
      } else if (night > 0.4 && (t === Terrain.Meadow || (t === Terrain.Grass && state.bIndex[i] < 0 && Math.random() < 0.3))) {
        this.particles.emit({ x: wx + (Math.random() - 0.5) * 24, y: wy + 4 + (Math.random() - 0.5) * 10, vx: 0, vy: 0, maxLife: 4, size: 1, color: PAL.flower1, glow: true, kind: 'firefly' });
      }
    }
  }

  private applyDayTint(tod: number): void {
    const a = ambientFor(tod);
    if (a[0] > 250 && a[1] > 250 && a[2] > 245) return;
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})`;
    ctx.fillRect(0, 0, this.back.width, this.back.height);
    ctx.globalCompositeOperation = 'source-over';
  }

  private applyLighting(tod: number, night: number, lights: { x: number; y: number; r: number; c: string; i: number }[], glows: { s: SpriteRect; x: number; y: number; a: number }[]): void {
    const l = this.lctx;
    const a = ambientFor(tod);
    l.globalCompositeOperation = 'source-over';
    l.fillStyle = `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})`;
    l.fillRect(0, 0, this.light.width, this.light.height);
    l.globalCompositeOperation = 'lighter';
    const L = this.camera.left;
    const T = this.camera.top;
    const tf = this.time;
    const zoom1 = this.camera.zoom === 1;
    const dv = this.lightDiv;
    for (const lt of lights) {
      if (zoom1 && lt.r < 20) continue;
      const r = Math.max(4, Math.round(lt.r / dv));
      // gentle candle flicker, out of phase per light so the scene never pulses as a whole
      const phase = (lt.x * 0.37 + lt.y * 0.91) % 6.283;
      const flicker = 0.96 + Math.sin(tf * 5 + phase) * 0.025 + Math.sin(tf * 11 + phase * 2) * 0.015;
      const spr = lightSprite(r, lt.c, Math.round(Math.min(1, lt.i * night * flicker) * 20) / 20);
      l.drawImage(spr, Math.round((lt.x - L) / dv - r), Math.round((lt.y - T) / dv - r));
    }
    // particles as light too (glow ones), budgeted
    // budget: a stable subset of glow particles casts light (never frame-strobed)
    const plist = this.particles.list;
    const stride = Math.max(1, Math.ceil(plist.length / 160));
    for (let k = 0; k < plist.length; k++) {
      const p = plist[k];
      if (!p.glow || p.seed % stride !== 0) continue;
      const pr = dv === 2 ? 6 : 3;
      const spr = lightSprite(pr, p.color, 0.6 * Math.min(1, p.life / p.maxLife));
      l.drawImage(spr, Math.round((p.x - L) / dv - pr), Math.round((p.y - T) / dv - pr));
    }
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'multiply';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.light, 0, 0, this.light.width, this.light.height, 0, 0, this.back.width, this.back.height);
    ctx.imageSmoothingEnabled = false;
    // emissive glow, drawn twice: once soft (bloom) and once crisp
    if (!this.bloom) {
      this.bloom = document.createElement('canvas');
    }
    const bw = Math.ceil(this.back.width / 4);
    const bh = Math.ceil(this.back.height / 4);
    if (this.bloom.width !== bw || this.bloom.height !== bh) {
      this.bloom.width = bw;
      this.bloom.height = bh;
    }
    const bctx = this.bloom.getContext('2d')!;
    bctx.globalCompositeOperation = 'source-over';
    bctx.clearRect(0, 0, bw, bh);
    bctx.imageSmoothingEnabled = true;
    bctx.globalCompositeOperation = 'lighter';
    for (const g of glows) {
      const gs = g.s;
      if (!gs.glow) continue;
      const x = (g.x - gs.ax - L) / 4;
      const y = (g.y - gs.ay - T) / 4;
      if (x + gs.w / 4 < 0 || y + gs.h / 4 < 0 || x > bw || y > bh) continue;
      bctx.globalAlpha = Math.min(1, g.a * night) * 0.9;
      bctx.drawImage(this.atlas.image, gs.glow.x, gs.glow.y, gs.w, gs.h, x, y, gs.w / 4, gs.h / 4);
    }
    bctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.55;
    ctx.drawImage(this.bloom, 0, 0, bw, bh, -2, -2, this.back.width + 4, this.back.height + 4);
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
    for (const g of glows) this.drawGlow(g.s, g.x, g.y, Math.min(1, g.a * night));
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Burst effects triggered by the sim. */
  burst(kind: EffectKind, x: number, y: number): void {
    if (SOUND_CUES.includes(kind as SoundCue)) return;
    const [wx, wy] = tileToWorld(x, y);
    const n = kind === 'surge' ? 60 : kind === 'portal' ? 14 : 20;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 20 + Math.random() * 60;
      this.particles.emit({
        x: wx,
        y: wy + 8,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.5 - 10,
        maxLife: 1 + Math.random(),
        size: kind === 'surge' ? 2 : 1,
        color: kind === 'surge' ? PAL.ley1 : kind === 'fire' ? PAL.ember : kind === 'restless' ? PAL.restless : kind === 'gloam' ? PAL.gloamEye : kind === 'portal' ? PAL.arcane2 : PAL.leyGlow,
        glow: true,
        kind: 'surge',
      });
    }
  }
}
