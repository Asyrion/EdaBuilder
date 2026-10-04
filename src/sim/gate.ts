/** The Great Gate (iteration 69, DESIGN 4.100): the gatehouse of Belregi Stone raised beside a Belregi gate in the Warding Wall, and
 *  the reaches the Heart of Belregi changes. The tales of the Heart live in events.ts (HEART_EVENTS, maybeFireHeart). */
import { idx, inBounds, type Building, type GameState } from './types';

/** A Belregi gate's faith and ward reach: alone, beside a lit Great Gate, and with the Heart set in it. */
export const BELREGI_REACH = 8;
export const BELREGI_REACH_GREAT = 12;
export const BELREGI_REACH_HEART = 16;
/** The Great Gate's own ward: its catalogue reach, and with the Heart set in the arch. */
export const GREAT_GATE_REACH = 20;
export const GREAT_GATE_REACH_HEART = 30;
/** The Gate's ward once the Heart is sold and the Guardians close the Pass. */
export const GREAT_GATE_SOLD_STRENGTH = 0.6;
/** Pilgrims of the Pass: the day of each season they come, how many, and the alms each one lodged pays. */
export const PASS_PILGRIM_DAY = 15;
export const PASS_PILGRIMS = 12;
export const PASS_ALMS = 40;
/** The High Warden comes this many days after the Gate stands lit; each later tale of the Heart waits this many days on the last. */
export const WARDEN_DAYS = 10;
export const HEART_STEP_DAYS = 20;
/** The Heart asked to hold the Gloam clears it this far round the Gate. */
export const HEART_GLOAM_REACH = 25;

/** The Great Gate when it stands (built, not burning or ruined); null otherwise. */
export function greatGateOf(s: GameState): Building | null {
  for (const b of s.buildings) if (b && b.kind === 'greatgate' && b.state === 'ok') return b;
  return null;
}

/** The Great Gate when it stands and is lit: the state its gifts need. */
export function litGreatGate(s: GameState): Building | null {
  const b = greatGateOf(s);
  return b && b.lit ? b : null;
}

/** How far every Belregi gate in the wall reaches today. */
export function belregiReach(s: GameState): number {
  if (!litGreatGate(s)) return BELREGI_REACH;
  return s.heart.held === 'set' ? BELREGI_REACH_HEART : BELREGI_REACH_GREAT;
}

/** How far the Great Gate itself wards. */
export function greatGateReach(s: GameState): number {
  return s.heart.held === 'set' ? GREAT_GATE_REACH_HEART : GREAT_GATE_REACH;
}

/** The Belregi and Uzulim gates standing in the wall. */
export function gateCounts(s: GameState): { belregi: number; uzulim: number } {
  let belregi = 0;
  let uzulim = 0;
  for (let i = 0; i < s.wall.length; i++) {
    if (s.wall[i] === 2) belregi++;
    else if (s.wall[i] === 3) uzulim++;
  }
  return { belregi, uzulim };
}

/** Does the footprint touch a Belregi gate tile? A corner counts: a gate has wall on two sides and road on the others, so the
 *  gatehouse stands in the angle between the wall and the road. The Great Gate's placement rule. */
export function touchesBelregiGate(s: GameState, x: number, y: number, w: number, h: number): boolean {
  for (let dy = -1; dy <= h; dy++)
    for (let dx = -1; dx <= w; dx++) {
      if (dx >= 0 && dx < w && dy >= 0 && dy < h) continue;
      const tx = x + dx;
      const ty = y + dy;
      if (inBounds(tx, ty) && s.wall[idx(tx, ty)] === 2) return true;
    }
  return false;
}

/** Pilgrims of the Pass this season: none without a lit Gate or once the Heart is sold; twice as many while the Guardians keep it. */
export function passPilgrims(s: GameState): number {
  if (!litGreatGate(s) || s.heart.held === 'sold') return 0;
  return s.heart.held === 'guardians' ? PASS_PILGRIMS * 2 : PASS_PILGRIMS;
}

/** Days until the next pilgrims of the Pass (0 on the day itself). */
export function pilgrimsDue(s: GameState): number {
  const d = s.day % 30;
  return d <= PASS_PILGRIM_DAY ? PASS_PILGRIM_DAY - d : 30 - d + PASS_PILGRIM_DAY;
}
