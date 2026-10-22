// The paintings live in eda-lore (scope reset 1d-2, RESET_PLAN §9.8): a sibling checkout, `EDA_LORE` or `../eda-lore`.
// An entry's `src` ("inspirations/…") is a path inside it. Only the art tools read it; the build and the tests do not.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** The eda-lore checkout: $EDA_LORE, else ../eda-lore next to the repository at `root`. */
export const loreRoot = (root = '.') => resolve(process.env.EDA_LORE || join(root, '../eda-lore'));

/** The file of a painting `src` ("inspirations/…"). */
export const paintingFile = (root, src) => join(loreRoot(root), src);

/** The checkout, or a clear abort when it is missing. */
export function needLore(root = '.') {
  const dir = loreRoot(root);
  if (!existsSync(join(dir, 'inspirations'))) {
    console.error(`The paintings are in eda-lore: no ${join(dir, 'inspirations')}.\n` +
      'Clone Asyrion/eda-lore next to this repository (../eda-lore) or set EDA_LORE to its checkout, then run again.');
    process.exit(2);
  }
  return dir;
}
