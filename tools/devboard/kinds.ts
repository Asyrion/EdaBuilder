/* What the dev board shows: every kind of content in src/data/content/, as one declarative table. A new kind is one entry
   here (and its hints in hints.json), never new code. `path` finds the collection inside the file; a collection is a list
   (entries found by `idKey`, or by position when they have no id) or a map (entries are its members, keyed by id). */

export interface Source { file: string; path?: string[]; label?: string }
export interface KindDef {
  title: string;
  sources: Source[];
  shape: 'list' | 'map';
  /** The id field of a list's entries; none for lists whose entries are known by position (milestones). */
  idKey?: string;
  /** The field shown as the entry's name. */
  labelKey?: string;
  /** A label for entries without a name field (`{n}` the 1-based position, `{field}` a field's value). */
  labelFmt?: string;
  /** Map members that are notes, not entries. */
  skip?: string[];
  /** The fields shown on the entry's card. */
  summary: string[];
  /** Cards show the entry's sprite and art status (buildings). */
  art?: boolean;
  group: string;
}

export const KINDS: Record<string, KindDef> = {
  buildings: { title: 'Buildings', group: 'Content', sources: [{ file: 'src/data/content/buildings.json' }], shape: 'list', idKey: 'key',
    labelKey: 'name', summary: ['category', 'w', 'h', 'cost', 'upkeep', 'unlock', 'faction'], art: true },
  roads: { title: 'Roads', group: 'Content', sources: [{ file: 'src/data/content/roads.json' }], shape: 'list', idKey: 'key', labelKey: 'name',
    summary: ['cost', 'upkeep', 'speed', 'capacity', 'unlock'] },
  milestones: { title: 'Milestones', group: 'Content', sources: [{ file: 'src/data/content/milestones.json' }], shape: 'list', labelKey: 'name',
    summary: ['pop', 'grant', 'unlocks'] },
  relics: { title: 'Relic sets', group: 'Content', sources: [{ file: 'src/data/content/relics.json' }], shape: 'list', idKey: 'id', labelKey: 'name',
    summary: ['pieces', 'bonus'] },
};

/** Content still written in code (text and logic together): shown read-only, scanned from the TypeScript (iteration 89 moves
    their text to JSON). `id` and `title` name the fields that start an entry and give its title; `text` its description. */
export interface CodeKind { title: string; file: string; id: string; title2: string; text: string[] }
export const CODE_KINDS: Record<string, CodeKind> = {
  edicts: { title: 'Edicts', file: 'src/sim/edicts.ts', id: 'key', title2: 'name', text: ['desc'] },
  events: { title: 'Events', file: 'src/sim/events.ts', id: 'id', title2: 'title', text: ['text'] },
  quests: { title: 'Quests', file: 'src/data/quests.ts', id: 'id', title2: 'title', text: ['hint'] },
  guilds: { title: 'Guilds', file: 'src/sim/guilds.ts', id: 'id', title2: 'name', text: ['desc', 'boon'] },
};
