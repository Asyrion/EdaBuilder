/** Info-view overlays: per-tile colour functions. */
import { BUILDING_BY_KEY } from '../sim/catalog';
import { DISTRICT_NAMES, type GameState, type ServiceType } from '../sim/types';
import { computeBuildingHappiness, growthBlock } from '../sim/growth';
import { FIRE_BASE, fireRisk } from '../sim/hazards';

export type OverlayId = 'growth' | 'mana' | 'water' | 'landvalue' | 'happiness' | 'traffic' | 'watch' | 'health' | 'fire' | 'faith' | 'school' | 'death' | 'ward' | 'leisure' | 'miasma' | 'goods' | 'district';

/** The Growth view's colours, by growthBlock. */
export const GROWTH_COLOURS: Record<'ok' | 'noRoad' | 'noMana' | 'noWater' | 'noDemand' | 'gloam' | 'noSchool' | 'landValue' | 'climbing', string> = {
  ok: 'rgba(60,240,90,0.8)', noRoad: 'rgba(255,55,55,0.8)', noMana: 'rgba(30,40,95,0.85)', noWater: 'rgba(90,225,235,0.8)', noDemand: 'rgba(175,175,190,0.75)', gloam: 'rgba(175,90,235,0.8)',
  noSchool: 'rgba(60,130,255,0.8)', landValue: 'rgba(255,140,20,0.75)', climbing: 'rgba(150,255,170,0.45)',
};

/** The Fire brigade view's colours. */
export const FIRE_COLOURS = { covered: 'rgba(80,220,120,0.6)', burning: 'rgb(255,170,0)', ruin: 'rgb(20,14,18)', high: 'rgb(255,30,30)', low: 'rgba(255,150,120,0.8)' };

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

/** An uncovered building in a service view: full strength, since the tint lies over the sprites at 35 % and a red roof
 *  read the same as the old half-strength red (phase 2-10, the hand walk). */
const UNCOVERED = 'rgb(240,50,50)';
function coverageOverlay(id: OverlayId, name: string, key: string, type: ServiceType, desc: string): OverlayDef {
  return {
    id,
    name,
    key,
    desc,
    legend: [['rgba(80,220,120,0.7)', 'covered'], [UNCOVERED, 'uncovered buildings']],
    tile: (s, i) => {
      const c = s.coverage[type][i] / 255;
      const b = s.bIndex[i] >= 0 ? s.buildings[s.bIndex[i]] : null;
      if (c > 0) return `rgba(80,220,120,${0.15 + c * 0.5})`;
      if (b && BUILDING_BY_KEY[b.kind].category === 'zone') return UNCOVERED;
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
    id: 'happiness', name: 'Happiness', key: '4', desc: 'How content each building is. Below 15 for long, folk leave. It starts at 50 and moves in six groups: place, light & water, services, nuisances, the city (tithe, edicts, unrest) and work & trade. Select a building for its list; hover the top bar\'s happiness for the city\'s.',
    get legend() { return rampLegend(); },
    tile: (s, i) => {
      const b = s.bIndex[i] >= 0 ? s.buildings[s.bIndex[i]] : null;
      if (!b || BUILDING_BY_KEY[b.kind].category !== 'zone') return null;
      const h = b.state === 'ok' ? computeBuildingHappiness(s, b) : 0;
      return ramp(h / 90);
    },
  },
  {
    id: 'traffic', name: 'Traffic', key: '5', desc: 'Road congestion relative to capacity. Red roads slow carts and annoy neighbours, and carts route round yesterday\'s jams where another way is near as quick.',
    get legend() { return rampLegend().slice().reverse() as [string, string][]; },
    tile: (s, i) => (s.road[i] ? ramp(1 - s.trafficSmooth[i] / 255) : null),
  },
  coverageOverlay('watch', 'Watch', '6', 'watch', 'Watch coverage lowers unrest and lays the restless to rest.'),
  coverageOverlay('health', 'Healing', '7', 'health', 'Healer coverage raises health and lowers deaths.'),
  {
    // the fire's view (phase 2-8): the hall's reach, what burns and what is left, and where a fire would start unchecked
    id: 'fire', name: 'Fire brigade', key: '8',
    desc: 'The Water-Mages\' Hall puts out fires in its reach. Outside it a fire burns down in two days and may catch its neighbours. Uncovered buildings show their risk: Craft and level 1 burn most, and Ember is the dry season.',
    legend: [[FIRE_COLOURS.covered, 'in a hall\'s reach'], [FIRE_COLOURS.burning, 'burning'], [FIRE_COLOURS.ruin, 'ruin'], [FIRE_COLOURS.high, 'uncovered, high risk'], [FIRE_COLOURS.low, 'uncovered']],
    tile: (s, i) => {
      const b = s.bIndex[i] >= 0 ? s.buildings[s.bIndex[i]] : null;
      if (b?.state === 'burning') return FIRE_COLOURS.burning;
      if (b?.state === 'ruin') return FIRE_COLOURS.ruin;
      const c = s.coverage.fire[i] / 255;
      if (c > 0) return `rgba(80,220,120,${0.15 + c * 0.5})`;
      if (!b) return null;
      const p = fireRisk(s, b);
      if (p <= 0) return null;
      return p >= FIRE_BASE * 2 ? FIRE_COLOURS.high : FIRE_COLOURS.low;
    },
  },
  coverageOverlay('school', 'Schooling', '9', 'school', 'Schooling makes educated folk: needed for Arcane districts and level 3.'),
  coverageOverlay('death', 'Deathcare', '0', 'death', 'Boneyard coverage quiets the dead. Uncovered homes breed the restless.'),
  coverageOverlay('faith', 'Faith', '-', 'faith', 'Shrines and temples raise happiness and land value.'),
  coverageOverlay('leisure', 'Leisure', '=', 'leisure', 'Gardens and squares raise land value and joy.'),
  {
    id: 'growth', name: 'Growth', key: 'n', desc: 'Why each zoned lot does or does not grow (scope reset phase 2-1). Empty lots: green can grow; red no road touches it (a corner counts); navy no light reaches it; cyan no well waters it; grey its demand bar is at or below the line; violet the Gloam; blue an Arcane lot without schooling. Zone buildings: yellow cannot climb a level (hover one for the need), pale green climbing.',
    legend: [[GROWTH_COLOURS.ok, 'can grow'], [GROWTH_COLOURS.noRoad, 'no road'], [GROWTH_COLOURS.noMana, 'no light'], [GROWTH_COLOURS.noWater, 'no water'], [GROWTH_COLOURS.noDemand, 'no demand'], [GROWTH_COLOURS.gloam, 'Gloam'], [GROWTH_COLOURS.noSchool, 'no schooling'], [GROWTH_COLOURS.landValue, 'cannot level up'], [GROWTH_COLOURS.climbing, 'climbing a level']],
    tile: (s, i) => {
      const g = growthBlock(s, i);
      if (g === 'none' || g === 'top') return null;
      if (s.bIndex[i] >= 0) return g === 'ok' ? GROWTH_COLOURS.climbing : GROWTH_COLOURS.landValue;
      return g in GROWTH_COLOURS ? GROWTH_COLOURS[g as keyof typeof GROWTH_COLOURS] : null;
    },
  },
  {
    id: 'ward', name: 'Wards & Gloam', key: 'g', desc: 'Ward coverage burns back the Gloam. Grey = Gloam, purple = whispering range, pink = a dark building the grey waits at: light it or ward it, or the Gloam takes it in three days. If the Gloam reaches the founding node, the charter is lost.',
    legend: [['rgba(79,227,255,0.6)', 'warded'], ['rgba(120,100,160,0.6)', 'gloam nearby'], ['rgba(40,30,60,0.8)', 'Gloam'], ['rgba(255,60,200,0.85)', 'grey at the door']],
    tile: (s, i) => {
      if (s.gloam[i]) return 'rgba(40,30,60,0.8)';
      const b = s.bIndex[i] >= 0 ? s.buildings[s.bIndex[i]] : null;
      if (b && (b.greyDays ?? 0) > 0) return 'rgba(255,60,200,0.85)'; // the grey waits at its door: light or ward it
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
    id: 'miasma', name: 'Miasma', key: 'm', desc: 'Alchemical fog from Craft districts. Lowers health and land value.',
    legend: [['rgba(140,190,60,0.6)', 'miasma']],
    tile: (s, i) => (s.miasma[i] > 0 ? `rgba(140,190,60,${0.15 + (s.miasma[i] / 255) * 0.6})` : null),
  },
];

export const OVERLAYS: Record<OverlayId, OverlayDef> = Object.fromEntries(OVERLAY_LIST.map((o) => [o.id, o])) as Record<OverlayId, OverlayDef>;
