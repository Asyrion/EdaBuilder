/** Info-view overlays: per-tile colour functions. */
import { BUILDING_BY_KEY } from '../sim/catalog';
import { type GameState, type ServiceType } from '../sim/types';
import { computeBuildingHappiness } from '../sim/growth';

export type OverlayId = 'mana' | 'water' | 'landvalue' | 'happiness' | 'traffic' | 'watch' | 'health' | 'fire' | 'faith' | 'school' | 'death' | 'ward' | 'leisure' | 'miasma';

export interface OverlayDef {
  id: OverlayId;
  name: string;
  key: string;
  desc: string;
  legend: [string, string][]; // [colour, label]
  tile: (state: GameState, i: number, x: number, y: number) => string | null;
}

function ramp(v: number): string {
  // 0..1 -> red..yellow..green
  v = Math.max(0, Math.min(1, v));
  const r = v < 0.5 ? 255 : Math.round(255 * (1 - (v - 0.5) * 2));
  const g = v < 0.5 ? Math.round(255 * v * 2) : 255;
  return `rgba(${r},${g},60,0.55)`;
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
    id: 'mana', name: 'Mana', key: '1', desc: 'Lit tiles and unlit buildings. Spires light 5 tiles; lit buildings light their neighbours.',
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
    legend: [['rgba(255,60,60,0.55)', 'low'], ['rgba(255,255,60,0.55)', 'middling'], ['rgba(60,255,60,0.55)', 'high']],
    tile: (s, i) => (s.road[i] ? null : ramp(s.landValue[i] / 80)),
  },
  {
    id: 'happiness', name: 'Happiness', key: '4', desc: 'How content each building is. Below 15 for long, folk leave.',
    legend: [['rgba(255,60,60,0.55)', 'miserable'], ['rgba(255,255,60,0.55)', 'content'], ['rgba(60,255,60,0.55)', 'joyful']],
    tile: (s, i) => {
      const b = s.bIndex[i] >= 0 ? s.buildings[s.bIndex[i]] : null;
      if (!b || BUILDING_BY_KEY[b.kind].category !== 'zone') return null;
      const h = b.state === 'ok' ? computeBuildingHappiness(s, b) : 0;
      return ramp(h / 90);
    },
  },
  {
    id: 'traffic', name: 'Traffic', key: '5', desc: 'Road congestion relative to capacity. Red roads slow carts and annoy neighbours.',
    legend: [['rgba(60,255,60,0.55)', 'free'], ['rgba(255,255,60,0.55)', 'busy'], ['rgba(255,60,60,0.55)', 'jammed']],
    tile: (s, i) => (s.road[i] ? ramp(1 - s.trafficSmooth[i] / 255) : null),
  },
  coverageOverlay('watch', 'Watch', '6', 'watch', 'Watch coverage lowers unrest and lays the restless to rest.'),
  coverageOverlay('health', 'Healing', '7', 'health', 'Healer coverage raises health and lowers deaths.'),
  coverageOverlay('fire', 'Fire brigade', '8', 'fire', 'Veshari coverage puts out fires.'),
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
    id: 'miasma', name: 'Miasma', key: 'm', desc: 'Alchemical fog from Craft districts. Lowers health and land value.',
    legend: [['rgba(140,190,60,0.6)', 'miasma']],
    tile: (s, i) => (s.miasma[i] > 0 ? `rgba(140,190,60,${0.15 + (s.miasma[i] / 255) * 0.6})` : null),
  },
];

export const OVERLAYS: Record<OverlayId, OverlayDef> = Object.fromEntries(OVERLAY_LIST.map((o) => [o.id, o])) as Record<OverlayId, OverlayDef>;
