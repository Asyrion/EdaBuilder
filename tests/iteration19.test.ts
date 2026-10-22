import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYS, keyFor } from '../src/ui/keys';

describe('Key bindings', () => {
  it('have defaults and resolve a bound key to its action', () => {
    expect(keyFor(DEFAULT_KEYS, ' ')).toBe('pause');
    expect(keyFor(DEFAULT_KEYS, 'b')).toBe('bulldoze');
    expect(keyFor({ ...DEFAULT_KEYS, bulldoze: 'q' }, 'q')).toBe('bulldoze');
    expect(keyFor({ ...DEFAULT_KEYS, bulldoze: 'q' }, 'b')).toBeNull();
  });
});
