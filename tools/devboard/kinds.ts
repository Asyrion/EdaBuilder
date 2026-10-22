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
  /** Text whose logic stays in code by id (iteration 89): entries are edited, never created or deleted on the board. */
  textOnly?: string;
  group: string;
}

export const KINDS: Record<string, KindDef> = {
  buildings: { title: 'Buildings', group: 'Content', sources: [{ file: 'src/data/content/buildings.json' }], shape: 'list', idKey: 'key',
    labelKey: 'name', summary: ['category', 'w', 'h', 'cost', 'upkeep', 'unlock', 'faction'], art: true },
  roads: { title: 'Roads', group: 'Content', sources: [{ file: 'src/data/content/roads.json' }], shape: 'list', idKey: 'key', labelKey: 'name',
    summary: ['cost', 'upkeep', 'speed', 'capacity', 'unlock'] },
  milestones: { title: 'Milestones', group: 'Content', sources: [{ file: 'src/data/content/milestones.json' }], shape: 'list', labelKey: 'name',
    summary: ['pop', 'grant', 'unlocks'] },
  edicts: { title: 'Edicts', group: 'Text', sources: [{ file: 'src/data/content/text/edicts.json' }], shape: 'map', labelKey: 'name',
    summary: ['desc', 'flavor'], textOnly: 'src/sim/edicts.ts' },
  quests: { title: 'Quests', group: 'Text', sources: [{ file: 'src/data/content/text/quests.json' }], shape: 'map', labelKey: 'title',
    summary: ['chapter', 'hint'], textOnly: 'src/data/quests.ts' },
  // by position: a sprite's switched-off entries (`off: true`) stay beside its live one, so names repeat
  artsources: { title: 'Art sources', group: 'Art', sources: [{ file: 'art/sources.json', path: ['sprites'] }], shape: 'list',
    labelKey: 'name', summary: ['src', 'island', 'kind', 'targetHeight', 'checked'] },
};

/** Content still written in code (text and logic together): shown read-only, scanned from the TypeScript. Empty since
    iteration 89 moved the text of edicts, events, quests and guilds to JSON; kept for any kind that comes later. `id` and `title` name the fields that start an entry and give its title; `text` its description. */
export interface CodeKind { title: string; file: string; id: string; title2: string; text: string[] }
export const CODE_KINDS: Record<string, CodeKind> = {};
