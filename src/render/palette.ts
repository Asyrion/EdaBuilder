/**
 * The single Wardlight palette. Every procedural sprite and every tint in the game
 * uses only these colours. Names describe role, not hue, so a repaint stays coherent.
 */
export const PAL = {
  outline: '#1a1420',
  shadow: '#0e0a14',
  // ground
  grass1: '#4f8a3e',
  grass2: '#5d9a48',
  grass3: '#6faa52',
  meadow: '#86b35a',
  meadow2: '#97c264',
  flower1: '#e9d66b',
  flower2: '#d96a8a',
  flower3: '#e8f0f5',
  forestFloor: '#3f6f37',
  leaf1: '#2f6b3a',
  leaf2: '#3f8446',
  leaf3: '#58a04e',
  leafAutumn: '#c8853a',
  trunk: '#5a3d2b',
  rock1: '#7b7a75',
  rock2: '#94928c',
  rock3: '#5f5e5a',
  hillGrass: '#6f8f4a',
  sand: '#c9b47a',
  sand2: '#b8a36a',
  // water
  water1: '#2b5787',
  water2: '#3a78a8',
  water3: '#5aa0c8',
  waterHi: '#a8dcef',
  // ley
  ley1: '#4fe3ff',
  ley2: '#2aa6d8',
  ley3: '#1a5f8a',
  leyGlow: '#b7f7ff',
  leyStone: '#7fd6ea',
  // materials
  wood1: '#7a4e32',
  wood2: '#a87a4a',
  wood3: '#c49a5c',
  sod: '#6b6a3c',
  sod2: '#8a8a4c',
  stone1: '#5e5c66',
  stone2: '#8a8894',
  stone3: '#b3b1ba',
  whitewash: '#d9d2c0',
  whitewash2: '#b9b2a2',
  // roofs
  thatch1: '#b9924a',
  thatch2: '#8f6d34',
  shingle1: '#7a4b3a',
  shingle2: '#5c3a2c',
  slate1: '#4e5d75',
  slate2: '#3a4658',
  tile1: '#a8503c',
  tile2: '#7d3a2c',
  arcane1: '#6b4f9e',
  arcane2: '#4b3671',
  arcane3: '#9a7cd0',
  green1: '#3f7a4a',
  green2: '#2c5a36',
  // lights and fire
  windowDark: '#2a2438',
  windowLit: '#ffcf6b',
  lampWarm: '#ffb85c',
  ember: '#ff8a3c',
  fire1: '#ffd166',
  fire2: '#e0463c',
  smoke: '#8c8a94',
  // gloam
  gloam1: '#3d3a4c',
  gloam2: '#54506a',
  gloam3: '#6a6482',
  gloamGrass: '#5f5d68',
  gloamEye: '#b48cff',
  // roads
  dirt1: '#9a7b56',
  dirt2: '#866948',
  dirt3: '#ad8d66',
  cobble1: '#8e8a86',
  cobble2: '#6f6b68',
  cobble3: '#a6a29d',
  lantern1: '#a39ca0',
  lantern2: '#7f787c',
  lanternLight: '#ffd98a',
  // zones
  zoneHearth: '#5ee36f',
  zoneMarket: '#5aa8ff',
  zoneCraft: '#ffb347',
  zoneArcane: '#c58cff',
  // misc
  bone: '#e6e0cf',
  gold: '#e9c25b',
  skin: '#e2b48c',
  skinGrey: '#a9a6b3',
  cloth1: '#7a4d8c',
  cloth2: '#b53f3f',
  cloth3: '#3f6bb5',
  cloth4: '#4f8a3e',
  cloth5: '#c9a54a',
  cartWood: '#a87a4a',
  banner: '#b53f3f',
  restless: '#9fe3d8',
  // fantasy accents (art pass)
  copper: '#c47a3a',
  copper2: '#8a4f24',
  verdigris: '#4fa89a',
  glass: '#7ee0b8',
  glassGlow: '#b8ffd8',
  rune: '#ffd98a',
  runeViolet: '#d8a0ff',
  ironDark: '#3a3742',
  moss: '#5f8a3c',
  parchment: '#e8d9b0',
  crystalPink: '#ff9ad6',
  deepPurple: '#2e2140',
  mushroom: '#d9b0ff',
  glimleaf: '#7ff0e0',
  plaster: '#e2c98f',
  plaster2: '#c4a86e',
  bluewash: '#8fa3c8',
  bluewash2: '#6b7fa6',
  mossRoof: '#6f8f3a',
  mossRoof2: '#4f6a2a',
  copperRoof: '#4fa89a',
  copperRoof2: '#2f7a6e',
  // red brick, for the paintings redrawn in code (iteration 79)
  brick1: '#a8503a',
  brick2: '#7e3a2a',
} as const;

export type PalName = keyof typeof PAL;

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Day/night ambient colour ramp: returns [r,g,b] multiplier (0..255) for a time-of-day in [0,1). */
export function ambientFor(t: number): [number, number, number] {
  // keyframes: midnight, dawn, morning, noon, evening, dusk, night
  const keys: [number, [number, number, number]][] = [
    [0.0, [58, 66, 120]],
    [0.2, [66, 72, 126]],
    [0.27, [200, 150, 120]],
    [0.35, [250, 240, 225]],
    [0.5, [255, 255, 250]],
    [0.68, [255, 240, 215]],
    [0.76, [235, 160, 110]],
    [0.83, [110, 90, 140]],
    [0.9, [62, 68, 122]],
    [1.0, [58, 66, 120]],
  ];
  for (let i = 0; i < keys.length - 1; i++) {
    const [ta, ca] = keys[i];
    const [tb, cb] = keys[i + 1];
    if (t >= ta && t <= tb) {
      const u = (t - ta) / (tb - ta);
      const s = u * u * (3 - 2 * u);
      return [ca[0] + (cb[0] - ca[0]) * s, ca[1] + (cb[1] - ca[1]) * s, ca[2] + (cb[2] - ca[2]) * s];
    }
  }
  return [255, 255, 255];
}

/** 0 = full day, 1 = full night. */
export function nightFactor(t: number): number {
  const a = ambientFor(t);
  const lum = (a[0] * 0.3 + a[1] * 0.59 + a[2] * 0.11) / 255;
  return Math.max(0, Math.min(1, (0.95 - lum) / 0.65));
}
