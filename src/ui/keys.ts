/** Remappable key bindings. Stored in settings; the help overlay and menu read the same table. */
export type KeyAction = 'pause' | 'slower' | 'faster' | 'help' | 'chronicle' | 'views' | 'save' | 'load' | 'select' | 'bulldoze' | 'road' | 'zone' | 'cancel';

export const KEY_ACTIONS: { id: KeyAction; name: string }[] = [
  { id: 'pause', name: 'Pause' },
  { id: 'slower', name: 'Slower' },
  { id: 'faster', name: 'Faster' },
  { id: 'select', name: 'Select tool' },
  { id: 'bulldoze', name: 'Bulldoze tool' },
  { id: 'road', name: 'Road tool (cycles)' },
  { id: 'zone', name: 'Zone tool (cycles)' },
  { id: 'views', name: 'Info views list' },
  { id: 'help', name: 'Help' },
  { id: 'chronicle', name: 'Chronicle' },
  { id: 'save', name: 'Quick save' },
  { id: 'load', name: 'Quick load' },
  { id: 'cancel', name: 'Cancel / close' },
];

export const DEFAULT_KEYS: Record<KeyAction, string> = {
  pause: ' ', slower: ',', faster: '.', select: 'x', bulldoze: 'b', road: 'r', zone: 'z', views: 'tab', help: 'h', chronicle: 'c', save: 'f5', load: 'f9', cancel: 'escape',
};

export function keyFor(keys: Record<KeyAction, string>, k: string): KeyAction | null {
  for (const a of KEY_ACTIONS) if (keys[a.id] === k) return a.id;
  return null;
}

export function keyLabel(k: string): string {
  return k === ' ' ? 'Space' : k.length === 1 ? k.toUpperCase() : k[0].toUpperCase() + k.slice(1);
}
