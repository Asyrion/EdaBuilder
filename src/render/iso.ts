import { TILE_H, TILE_W } from './sprites';

/** Tile (x,y) -> screen-space position of the tile's top corner, in native pixels (world space). */
export function tileToWorld(x: number, y: number): [number, number] {
  return [(x - y) * (TILE_W / 2), (x + y) * (TILE_H / 2)];
}

/** World pixel -> fractional tile coords. */
export function worldToTile(wx: number, wy: number): [number, number] {
  const u = wx / TILE_W + wy / TILE_H;
  const v = wy / TILE_H - wx / TILE_W;
  return [u, v];
}
