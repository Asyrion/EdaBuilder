/** Iteration 66 (keyboard focus): where a shortcut may fire, the regions F6 moves between, the key table that frees Tab, and the
 *  keys a player may not bind. The DOM side (dialogs holding focus, roving focus in the toolbar) is held by scripts/playtest66.mjs. */
import { describe, expect, it } from 'vitest';
import { REGIONS, UNBINDABLE, migrateKeys, nextRegion, shortcutTarget } from '../src/ui/focus';
import { DEFAULT_KEYS, KEY_ACTIONS } from '../src/ui/keys';

describe('Where a shortcut may fire', () => {
  it('on the page and on the map, and nowhere a control or a dialog has focus', () => {
    expect(shortcutTarget(null)).toBe(true);
    expect(shortcutTarget({ tagName: 'BODY' })).toBe(true);
    expect(shortcutTarget({ tagName: 'CANVAS', id: 'game' })).toBe(true);
    expect(shortcutTarget({ tagName: 'CANVAS', id: 'clock' })).toBe(false); // the top bar's clock is not the map
    for (const tagName of ['BUTTON', 'SELECT', 'INPUT', 'A', 'DIV']) expect(shortcutTarget({ tagName })).toBe(false);
  });
});

describe('The regions', () => {
  it('run in screen order and end at the map', () => {
    expect(REGIONS[0]).toBe('topbar');
    expect(REGIONS[1]).toBe('toolbar');
    expect(REGIONS[REGIONS.length - 1]).toBe('game');
  });
  it('F6 moves forward, Shift+F6 back, both wrap and skip a hidden region', () => {
    const all = REGIONS.map(() => true);
    expect(nextRegion(-1, all)).toBe(0);
    expect(nextRegion(0, all)).toBe(1);
    expect(nextRegion(REGIONS.length - 1, all)).toBe(0);
    expect(nextRegion(0, all, true)).toBe(REGIONS.length - 1);
    const someHidden = all.map((v, i) => i !== 2 && i !== 3); // the Ledger and the building panel closed
    expect(nextRegion(1, someHidden)).toBe(4);
    expect(nextRegion(4, someHidden, true)).toBe(1);
    expect(nextRegion(0, all.map(() => false))).toBe(-1);
  });
});

describe('The key table', () => {
  it('Info views is V: Tab moves focus again', () => {
    expect(DEFAULT_KEYS.views).toBe('v');
    for (const k of UNBINDABLE) expect(Object.values(DEFAULT_KEYS)).not.toContain(k);
  });
  it('a saved table from before binds Info views to V, and an unbindable key elsewhere is cleared', () => {
    const old = { ...DEFAULT_KEYS, views: 'tab' };
    expect(migrateKeys(old).views).toBe('v');
    expect(migrateKeys({ ...DEFAULT_KEYS, help: 'f6' }).help).toBe('');
    expect(migrateKeys({ ...DEFAULT_KEYS })).toEqual(DEFAULT_KEYS);
  });
  it('no two actions share a key, and every action has one', () => {
    const vals = KEY_ACTIONS.map((a) => DEFAULT_KEYS[a.id]);
    expect(new Set(vals).size).toBe(vals.length);
    expect(vals.every(Boolean)).toBe(true);
  });
});
