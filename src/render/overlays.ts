/** Info-view overlays: per-tile colour functions. */
import { BUILDING_BY_KEY } from '../sim/catalog';
import { DISTRICT_NAMES, type GameState, type ServiceType } from '../sim/types';
import { computeBuildingHappiness } from '../sim/growth';
import { ASPECTS, ASPECT_INFO, ASPECT_RADIUS, dragonAuras } from '../sim/weave';

function hex(c: string, a: number): string {
  const n = parseInt(c.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a.toFixed(2)})`;
}

export type OverlayId = 'mana' | 'water' | 'landvalue' | 'happiness' | 'traffic' | 'watch' | 'health' | 'fire' | 'faith' | 'school' | 'death' | 'ward' | 'leisure' | 'miasma' | 'goods' | 'district' | 'weave';

export const DISTRICT_COLORS = ['#ff8a5c', '#5ee36f', '#5aa8ff', '#ffd166', '#c58cff', '#4fe3ff', '#ff6fa8', '#b9c46a'];

/** Colour-blind-safe ramps (blue → white → orange) can replace red/yellow/green. */
export const ramps = { colorBlind: false };

export interface OverlayDef {
  id: OverlayId;
  name: string;
  key: string;
  desc: string;
  legend: [string, string][]; // [colour, label]
  tile: (state: GameState, i: number, x: number, y: number) => string | null;
}

function ramp(v: number): string {
  v = Math.max(0, Math.min(1, v));
  if (ramps.colorBlind) {
    // orange (bad) -> pale -> blue (good)
    const t = v;
    const r = Math.round(230 - t * 180);
    const g = Math.round(120 + t * 60);
    const b = Math.round(40 + t * 215);
    return `rgba(${r},${g},${b},0.6)`;
  }
  // 0..1 -> red..yellow..green
  const r = v < 0.5 ? 255 : Math.round(255 * (1 - (v - 0.5) * 2));
  const g = v < 0.5 ? Math.round(255 * v * 2) : 255;
  return `rgba(${r},${g},60,0.55)`;
}

function rampLegend(): [string, string][] {
  return ramps.colorBlind
    ? [['rgba(230,120,40,0.6)', 'low'], ['rgba(140,150,150,0.6)', 'middling'], ['rgba(50,180,255,0.6)', 'high']]
    : [['rgba(255,60,60,0.55)', 'low'], ['rgba(255,255,60,0.55)', 'middling'], ['rgba(60,255,60,0.55)', 'high']];
}

function coverageOverlay(id: OverlayId, name: string, key: string, type: ServiceType, desc: string): OverlayDef {
  return {
    id,
    name,
    key,
    desc,
    legend: [['rgba(80,220,120,0.7)', 'covered'], ['rgba(230,80,80,0.6)', 'uncovered buildings']],
    tile: (s, i) => {
      const c = s.coverage[type][i] / 255;
      const b = s.bIndex[i] >= 0 ? s.buildings[s.bIndex[i]] : null;
      if (c > 0) return `rgba(80,220,120,${0.15 + c * 0.5})`;
      if (b && BUILDING_BY_KEY[b.kind].category === 'zone') return 'rgba(230,80,80,0.6)';
      return null;
    },
  };
}

export const OVERLAY_LIST: OverlayDef[] = [
  {
    id: 'mana', name: 'Mana', key: '1', desc: 'Lit tiles and unlit buildings. Spires light 5 tiles; lit buildings light their neighbours. An unlinked node seeps half its flow and a spire within 6 draws the rest; a spire carries 80 mana of buildings and its farthest go dark over that.',
    legend: [['rgba(79,227,255,0.6)', 'lit by ley'], ['rgba(230,80,80,0.6)', 'building without mana']],
    tile: (s, i) => {
      const b = s.bIndex[i] >= 0 ? s.buildings[s.bIndex[i]] : null;
      if (b && !b.lit && BUILDING_BY_KEY[b.kind].manaUse > 0) return 'rgba(230,80,80,0.6)';
      if (s.lit[i]) return 'rgba(79,227,255,0.45)';
      return null;
    },
  },
  {
    id: 'water', name: 'Water', key: '2', desc: 'Watered tiles from wells and cisterns.',
    legend: [['rgba(90,160,220,0.6)', 'watered'], ['rgba(230,80,80,0.6)', 'dry building']],
    tile: (s, i) => {
      const b = s.bIndex[i] >= 0 ? s.buildings[s.bIndex[i]] : null;
      if (b && !b.watered && BUILDING_BY_KEY[b.kind].category === 'zone') return 'rgba(230,80,80,0.6)';
      if (s.watered[i]) return 'rgba(90,160,220,0.45)';
      return null;
    },
  },
  {
    id: 'landvalue', name: 'Land value', key: '3', desc: 'Roads, water, parks, shrines and services raise it; miasma, gloam and traffic lower it.',
    get legend() { return rampLegend(); },
    tile: (s, i) => (s.road[i] ? null : ramp(s.landValue[i] / 80)),
  },
  {
    id: 'happiness', name: 'Happiness', key: '4', desc: 'How content each building is. Below 15 for long, folk leave.',
    get legend() { return rampLegend(); },
    tile: (s, i) => {
      const b = s.bIndex[i] >= 0 ? s.buildings[s.bIndex[i]] : null;
      if (!b || BUILDING_BY_KEY[b.kind].category !== 'zone') return null;
      const h = b.state === 'ok' ? computeBuildingHappiness(s, b) : 0;
      return ramp(h / 90);
    },
  },
  {
    id: 'traffic', name: 'Traffic', key: '5', desc: 'Road congestion relative to capacity. Red roads slow carts and annoy neighbours.',
    get legend() { return rampLegend().slice().reverse() as [string, string][]; },
    tile: (s, i) => (s.road[i] ? ramp(1 - s.trafficSmooth[i] / 255) : null),
  },
  coverageOverlay('watch', 'Watch', '6', 'watch', 'Watch coverage lowers unrest and lays the restless to rest.'),
  coverageOverlay('health', 'Healing', '7', 'health', 'Healer coverage raises health and lowers deaths.'),
  coverageOverlay('fire', 'Fire brigade', '8', 'fire', 'The Water-Mages\' Hall puts out fires.'),
  coverageOverlay('school', 'Schooling', '9', 'school', 'Schooling makes educated folk: needed for Arcane districts and level 3.'),
  coverageOverlay('death', 'Deathcare', '0', 'death', 'Boneyard coverage quiets the dead. Uncovered homes breed the restless.'),
  coverageOverlay('faith', 'Faith', '-', 'faith', 'Shrines and temples raise happiness and land value.'),
  coverageOverlay('leisure', 'Leisure', '=', 'leisure', 'Gardens, squares and guildhalls raise land value and joy.'),
  {
    id: 'ward', name: 'Wards & Gloam', key: 'g', desc: 'Ward coverage burns back the Gloam. Grey = Gloam, purple = whispering range.',
    legend: [['rgba(79,227,255,0.6)', 'warded'], ['rgba(120,100,160,0.6)', 'gloam nearby'], ['rgba(40,30,60,0.8)', 'Gloam']],
    tile: (s, i) => {
      if (s.gloam[i]) return 'rgba(40,30,60,0.8)';
      const c = s.coverage.ward[i] / 255;
      if (c > 0) return `rgba(79,227,255,${0.15 + c * 0.45})`;
      if (s.gloamDist[i] < 7) return `rgba(120,100,160,${0.5 - s.gloamDist[i] * 0.06})`;
      return null;
    },
  },
  {
    id: 'goods', name: 'Goods', key: 'o', desc: 'Market shelves and enchanter leystone: full to empty. Works and mines show how much awaits carts.',
    get legend() { return rampLegend(); },
    tile: (s, i) => {
      const b = s.bIndex[i] >= 0 ? s.buildings[s.bIndex[i]] : null;
      if (!b || b.state !== 'ok') return null;
      const def = BUILDING_BY_KEY[b.kind];
      if (def.zone === 2) return ramp(b.stock / (20 * b.level));
      if (def.zone === 4) return ramp(b.stock / (20 * b.level));
      if (def.zone === 3) return ramp(1 - b.stock / (30 * b.level));
      if (def.leystone) return ramp(1 - b.stock / 60);
      return null;
    },
  },
  {
    id: 'district', name: 'Districts', key: 'i', desc: 'Painted districts. Edicts can be applied per district from the Edicts panel.',
    legend: DISTRICT_COLORS.map((c, k) => [c + 'aa', DISTRICT_NAMES[k]] as [string, string]),
    tile: (s, i) => (s.district[i] ? DISTRICT_COLORS[s.district[i] - 1] + '66' : null),
  },
  {
    id: 'weave', name: 'The Weave', key: 'w', desc: 'Ley aspects around each node (10 tiles) and the auras of grown dragons. Build to the ley: Craft on Ember, deathcare on Bone, a Nexus on Vein, wells on Tide.',
    legend: [...ASPECTS.map((a) => [hex(ASPECT_INFO[a].color, 0.55), `${ASPECT_INFO[a].name} ley`] as [string, string]), ['rgba(255,255,255,0.35)', 'dragon aura']],
    tile: (s, i, x, y) => {
      for (const a of dragonAuras(s)) {
        const d = Math.max(Math.abs(a.x - x), Math.abs(a.y - y));
        if (d <= a.r) return hex(ASPECT_INFO[a.line].color, 0.62 - (d / a.r) * 0.2);
      }
      let best = ASPECT_RADIUS + 1;
      let line: string | null = null;
      for (const n of s.nodes) {
        const d = Math.max(Math.abs(n.x - x), Math.abs(n.y - y));
        if (d < best && n.aspect) { best = d; line = ASPECT_INFO[n.aspect].color; }
      }
      if (!line || best > ASPECT_RADIUS) return s.gloam[i] ? 'rgba(40,30,60,0.5)' : null;
      return hex(line, 0.45 - (best / ASPECT_RADIUS) * 0.25);
    },
  },
  {
    id: 'miasma', name: 'Miasma', key: 'm', desc: 'Alchemical fog from Craft districts, and the marsh\'s own. Lowers health and land value.',
    legend: [['rgba(140,190,60,0.6)', 'miasma']],
    tile: (s, i) => (s.miasma[i] > 0 ? `rgba(140,190,60,${0.15 + (s.miasma[i] / 255) * 0.6})` : null),
  },
];

export const OVERLAYS: Record<OverlayId, OverlayDef> = Object.fromEntries(OVERLAY_LIST.map((o) => [o.id, o])) as Record<OverlayId, OverlayDef>;
