/**
 * Keyboard focus (iteration 66, DESIGN 4.97): where a game shortcut may fire, the regions F6 moves between, dialogs that take, hold
 * and give back focus, and roving focus for the toolbar's tabs and items. The pure helpers take plain shapes so the tests can hold
 * them without a DOM.
 */

/** The shape of an element the shortcut guard reads. */
export interface FocusLike {
  tagName?: string;
  id?: string;
  isContentEditable?: boolean;
  closest?: (sel: string) => unknown;
}

/** Game shortcuts and the map's keys fire only with focus on the page or the map: a focused control keeps its own keys, and a dialog
 *  keeps every key but Escape. */
export function shortcutTarget(el: FocusLike | null | undefined): boolean {
  if (!el || !el.tagName) return true;
  const tag = el.tagName.toUpperCase();
  if (tag === 'BODY' || tag === 'HTML') return true;
  if (tag === 'CANVAS' && el.id === 'game') return true;
  return false;
}

/** The regions F6 moves between, in screen order: the top bar, the toolbar, the Ledger, the building panel, the Info views, the
 *  minimap, and the map. A hidden region is skipped. */
export const REGIONS = ['topbar', 'toolbar', 'tasks', 'info', 'views', 'minimap', 'game'] as const;

/** The next visible region after `current` (−1: none), forward or back. */
export function nextRegion(current: number, visible: boolean[], back = false): number {
  const n = visible.length;
  for (let k = 1; k <= n; k++) {
    const i = (((current < 0 ? (back ? 0 : -1) : current) + (back ? -k : k)) % n + n) % n;
    if (visible[i]) return i;
  }
  return -1;
}

/** Keys a player may not bind: Tab and F6 move focus, Escape closes. */
export const UNBINDABLE = ['tab', 'f6'];

/** A saved key table from before iteration 66 bound Info views to Tab; Tab moves focus now, so it moves to V. */
export function migrateKeys<T extends Record<string, string>>(keys: T): T {
  const out = { ...keys };
  for (const k of Object.keys(out)) if (UNBINDABLE.includes(out[k])) (out as Record<string, string>)[k] = k === 'views' ? 'v' : '';
  return out;
}

// ---------- the DOM side ----------

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function shown(el: HTMLElement): boolean {
  return !el.classList.contains('hidden');
}
function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((e) => e.offsetWidth > 0 || e.offsetHeight > 0 || e === document.activeElement);
}
/** The open dialog on top: the last visible `.modal` in the page. */
export function topDialog(): HTMLElement | null {
  const open = Array.from(document.querySelectorAll<HTMLElement>('.modal')).filter((m) => !m.classList.contains('hidden'));
  return open.length ? open[open.length - 1] : null;
}

/** Dialogs take focus when they open, keep Tab inside, and give focus back to their opener when they close. One watcher for all, so
 *  the panels' own toggles need nothing. */
export function watchDialogs(root: HTMLElement): void {
  const openers = new WeakMap<HTMLElement, Element | null>();
  const enter = (m: HTMLElement) => {
    openers.set(m, document.activeElement);
    // a tale is answered by its first choice; any other dialog by its first control
    requestAnimationFrame(() => {
      if (m.classList.contains('hidden')) return;
      if (m.contains(document.activeElement)) return;
      const first = focusables(m)[0];
      if (first) first.focus();
      else { m.tabIndex = -1; m.focus(); }
    });
  };
  const leave = (m: HTMLElement) => {
    const back = openers.get(m);
    openers.delete(m);
    if (!m.contains(document.activeElement) && document.activeElement !== document.body) return;
    if (back instanceof HTMLElement && back.isConnected && back.offsetParent !== null) back.focus();
    else (document.getElementById('game') as HTMLElement | null)?.focus();
  };
  for (const m of Array.from(root.querySelectorAll<HTMLElement>('.modal'))) {
    let was = !m.classList.contains('hidden');
    if (was) enter(m);
    new MutationObserver(() => {
      const now = !m.classList.contains('hidden');
      if (now === was) {
        // a dialog that rebuilt its contents (a tale's next page, the menu's key screen) keeps focus inside
        if (now && !m.contains(document.activeElement)) { const first = focusables(m)[0]; if (first) first.focus(); }
        return;
      }
      was = now;
      if (now) enter(m);
      else leave(m);
    }).observe(m, { attributes: true, attributeFilter: ['class'], childList: true });
  }
  // Tab cycles inside the top dialog
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const m = topDialog();
    if (!m) return;
    const list = focusables(m);
    if (!list.length) { e.preventDefault(); return; }
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (i < 0 || (!e.shiftKey && i === list.length - 1) || (e.shiftKey && i === 0)) {
      e.preventDefault();
      (e.shiftKey ? list[list.length - 1] : list[0]).focus();
    }
  }, true);
}

/** F6 and Shift+F6 move between the regions; a region is entered at its first control (the map at itself). */
export function watchRegions(): void {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'F6' || topDialog()) return;
    e.preventDefault();
    const els = REGIONS.map((id) => document.getElementById(id) as HTMLElement | null);
    const visible = els.map((el) => !!el && (el.id === 'game' || (shown(el) && focusables(el).length > 0)));
    const cur = els.findIndex((el) => !!el && (el === document.activeElement || el.contains(document.activeElement)));
    const next = nextRegion(cur, visible, e.shiftKey);
    if (next < 0) return;
    const el = els[next]!;
    if (el.id === 'game') el.focus();
    else (focusables(el)[0] ?? el).focus();
  }, true);
}

/**
 * Roving focus over a row of buttons (WAI-ARIA): one tab stop, the arrows move, Home and End go to the ends. `selected` names the
 * button that holds the tab stop when focus arrives from outside. `activate` (for tabs) presses the button on arrival.
 */
export function roving(container: HTMLElement, opts: { selected: () => HTMLElement | null; activate?: boolean; grid?: boolean }): void {
  const buttons = () => Array.from(container.querySelectorAll<HTMLButtonElement>(':scope > button'));
  const settle = () => {
    const list = buttons();
    const sel = opts.selected() ?? list[0];
    for (const b of list) b.tabIndex = b === sel ? 0 : -1;
  };
  container.addEventListener('keydown', (e) => {
    const list = buttons();
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    let j = -1;
    // the items wrap in rows; Up and Down move by a row in a grid, else as Left and Right
    const cols = opts.grid ? Math.max(1, Math.round(container.clientWidth / Math.max(1, list[0].offsetWidth))) : 1;
    switch (e.key) {
      case 'ArrowRight': j = Math.min(list.length - 1, i + 1); break;
      case 'ArrowLeft': j = Math.max(0, i - 1); break;
      case 'ArrowDown': j = Math.min(list.length - 1, i + cols); break;
      case 'ArrowUp': j = Math.max(0, i - cols); break;
      case 'Home': j = 0; break;
      case 'End': j = list.length - 1; break;
      default: return;
    }
    e.preventDefault();
    e.stopPropagation();
    for (const b of list) b.tabIndex = -1;
    list[j].tabIndex = 0;
    list[j].focus();
    if (opts.activate) list[j].click();
  });
  container.addEventListener('focusout', (e) => { if (!container.contains(e.relatedTarget as Node)) settle(); });
  (container as HTMLElement & { settleRoving?: () => void }).settleRoving = settle;
  settle();
}
