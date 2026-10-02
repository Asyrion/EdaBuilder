/** Map sectors: the Charter covers part of the map; buy sectors to extend it, and the Gloam draws back. See DESIGN.md 4.43. */
import { favourFactor } from './economy';
import { MAP_H, MAP_W, idx, type GameState } from './types';
import { markAllDirty, pushMessage } from './world';
import { relicDone } from './relics';

export const SECTOR = 32; // tiles per side
export const SECTORS_X = MAP_W / SECTOR;
export const SECTORS_Y = MAP_H / SECTOR;
export const SECTOR_BASE_COST = 2500;
export const SECTOR_UNLOCK = 1; // Hamlet

const NAMES_X = ['western', 'west-middle', 'east-middle', 'eastern'];
const NAMES_Y = ['northern', 'north-middle', 'south-middle', 'southern'];

export function sectorOf(x: number, y: number): number {
  return Math.floor(y / SECTOR) * SECTORS_X + Math.floor(x / SECTOR);
}
export function sectorName(k: number): string {
  const sx = k % SECTORS_X;
  const sy = Math.floor(k / SECTORS_X);
  return `the ${NAMES_Y[sy]} ${NAMES_X[sx]} march`;
}
export function inCharter(s: GameState, x: number, y: number): boolean {
  return s.sectors[sectorOf(x, y)] === 1;
}
/** New game: the founding sector and every sector whose edge is within 18 tiles of the founding node. */
export function initialSectors(founding: { x: number; y: number }): Uint8Array {
  const out = new Uint8Array(SECTORS_X * SECTORS_Y);
  for (let k = 0; k < out.length; k++) {
    const x0 = (k % SECTORS_X) * SECTOR;
    const y0 = Math.floor(k / SECTORS_X) * SECTOR;
    const dx = Math.max(x0 - founding.x, 0, founding.x - (x0 + SECTOR - 1));
    const dy = Math.max(y0 - founding.y, 0, founding.y - (y0 + SECTOR - 1));
    if (Math.hypot(dx, dy) <= 18) out[k] = 1;
  }
  return out;
}
export function charteredCount(s: GameState): number {
  let n = 0;
  for (let k = 0; k < s.sectors.length; k++) n += s.sectors[k];
  return n;
}
export function adjacentToCharter(s: GameState, k: number): boolean {
  const sx = k % SECTORS_X;
  const sy = Math.floor(k / SECTORS_X);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = sx + dx;
    const ny = sy + dy;
    if (nx < 0 || ny < 0 || nx >= SECTORS_X || ny >= SECTORS_Y) continue;
    if (s.sectors[ny * SECTORS_X + nx]) return true;
  }
  return false;
}
/** Price rises with distance from the founding sector and with every sector already bought. */
export function sectorCost(s: GameState, k: number): number {
  const fk = sectorOf(s.founding.x, s.founding.y);
  const d = Math.abs((k % SECTORS_X) - (fk % SECTORS_X)) + Math.abs(Math.floor(k / SECTORS_X) - Math.floor(fk / SECTORS_X));
  const bought = Math.max(0, charteredCount(s) - 4);
  return Math.round(SECTOR_BASE_COST * (1 + d * 0.6) * (1 + bought * 0.2) * (relicDone(s, 'concordcharts') ? 0.8 : 1) * favourFactor(s)); // the Crown's favour moves the price (iteration 54)
}
export function canBuySector(s: GameState, k: number): string | null {
  if (k < 0 || k >= s.sectors.length) return 'No such sector';
  if (s.sectors[k]) return 'Already within the Charter';
  if (s.milestone < SECTOR_UNLOCK) return 'Unlocks at Hamlet';
  if (!adjacentToCharter(s, k)) return 'Must touch the Charter';
  if (s.treasury < sectorCost(s, k)) return `Not enough crowns (${sectorCost(s, k)})`;
  return null;
}
/** Buy: pay, charter, and the Gloam inside the sector draws back except the map rim. */
export function buySector(s: GameState, k: number): string | null {
  const why = canBuySector(s, k);
  if (why) return why;
  const cost = sectorCost(s, k);
  s.treasury -= cost;
  s.sectors[k] = 1;
  const x0 = (k % SECTORS_X) * SECTOR;
  const y0 = Math.floor(k / SECTORS_X) * SECTOR;
  let burned = 0;
  for (let y = y0; y < y0 + SECTOR; y++)
    for (let x = x0; x < x0 + SECTOR; x++) {
      const edge = Math.min(x, y, MAP_W - 1 - x, MAP_H - 1 - y);
      const i = idx(x, y);
      if (s.gloam[i] && edge >= 4) { s.gloam[i] = 0; burned++; }
    }
  s.stats.sectorsBought++; // the surveyors' wards are the Crown's; the Charter's burn count is the city's
  markAllDirty(s);
  pushMessage(s, `The Crown extends the Charter to ${sectorName(k)} for ${cost} crowns.${burned ? ` The Gloam draws back from ${burned} tiles as the surveyors' wards go in.` : ''}`, 'milestone', true, { x: x0 + SECTOR / 2, y: y0 + SECTOR / 2 });
  return null;
}
