// Buildings turn to their road (iteration 58). Every building sprite faces right at rest (its front on the lower-right
// face, toward +x), so a building whose road runs past its left face is drawn mirrored. Render-only: the sim never reads it.

import { inBounds, idx, type GameState } from '../sim/types';

interface Footprint { x: number; y: number; w: number; h: number }

/** True when the building should face left (be drawn mirrored): the visible front edges first (+x right, +y left), then
 *  the back edges (−y right, −x left), then the corners; on a tie, or with no road at all, it keeps facing right. */
export function faceLeft(state: Pick<GameState, 'road'>, b: Footprint): boolean {
  const road = (x: number, y: number) => (inBounds(x, y) && state.road[idx(x, y)] ? 1 : 0);
  let px = 0, py = 0, nx = 0, ny = 0;
  for (let k = 0; k < b.h; k++) { px += road(b.x + b.w, b.y + k); nx += road(b.x - 1, b.y + k); }
  for (let k = 0; k < b.w; k++) { py += road(b.x + k, b.y + b.h); ny += road(b.x + k, b.y - 1); }
  if (px || py) return py > px;
  if (nx || ny) return nx > ny;
  // corner-only roads (a road at a building's corner counts as its door, iteration 49): the left corner turns it left
  return road(b.x - 1, b.y + b.h) === 1 && road(b.x + b.w, b.y - 1) === 0;
}
