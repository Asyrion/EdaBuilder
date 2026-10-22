// The donkey carts (iteration 57): the painted carts from inspirations/carts carry the goods and the leystone on the roads.
// Each cart keeps one painting for its life (picked by its id, so the renderer needs no rng and the sim is untouched) and
// faces the way it drives: the paintings face right, and every one has a left-facing twin `<name>_l`.

export const CART_GOODS_PREFIX = 'cartp_goods_';
export const CART_STONE_PREFIX = 'cartp_stone_';

/** True when a heading (the sim's `dir`: 0 +x, 1 +y, 2 −x, 3 −y) moves right on the screen: +x and −y both go right in the 2:1 view. */
export function facesRight(dir: number): boolean {
  return dir === 0 || dir === 3;
}

/** A stable spread of agent ids over a pool (consecutive ids land on different paintings). */
export function cartPick(id: number, n: number): number {
  return n > 0 ? (Math.imul(id + 1, 2654435761) >>> 0) % n : 0;
}

/** The sprite for a cart agent: a painted donkey cart for the goods (variants 1–2) and leystone (0) carts, facing its way;
 *  the procedural `cart_<variant>` when no painting is loaded (the floating carts and barges are parked, scope reset phase 1c). */
export function cartSpriteName(a: { id: number; variant: number; dir: number }, count: (prefix: string) => number): string {
  const prefix = a.variant === 0 ? CART_STONE_PREFIX : CART_GOODS_PREFIX;
  const n = count(prefix);
  if (!n) return `cart_${a.variant}`;
  return `${prefix}${cartPick(a.id, n)}${facesRight(a.dir) ? '' : '_l'}`;
}
