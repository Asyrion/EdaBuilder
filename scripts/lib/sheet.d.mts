export interface Img { w: number; h: number; data: Uint8ClampedArray }
export interface ManifestEntry { file: string; w: number; h: number; ax: number; ay: number; glow?: string; sheet?: number; sx?: number; sy?: number; gsheet?: number; gx?: number; gy?: number; gw?: number; gh?: number }
export interface Manifest { sheets?: { file: string; w: number; h: number; hash: string }[]; sprites: Record<string, ManifestEntry> }
export function readManifest(root: string): Manifest | null;
export function spriteImage(root: string, manifest: Manifest | null, entry: ManifestEntry | undefined, glow?: boolean): Img | null;
export function spritePng(root: string, name: string, glow?: boolean): Buffer | null;
