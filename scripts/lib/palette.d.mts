export type Rgb = [number, number, number];
export interface PaletteColour { h: string; rgb: Rgb; lab: Rgb; ramp: string }
export interface Palette { json: { ramps: { id: string; colors: string[] }[]; snap?: { chroma?: number } }; colors: PaletteColour[]; chroma: number }
export interface Img { w: number; h: number; data: Uint8ClampedArray }
export function oklab(rgb: Rgb): Rgb;
export function fromOklab(lab: Rgb): Rgb;
export function dE(p: Rgb, q: Rgb): number;
export function hex(rgb: Rgb): string;
export function rgbOf(h: string): Rgb;
export function loadPalette(path?: string | URL): Palette;
export function nearest(rgb: Rgb, colors: PaletteColour[], chroma?: number): { c: PaletteColour; d: number };
export function snapImage(img: Img, pal?: Palette, memo?: Map<number, { c: PaletteColour; d: number }>): { img: Img; mean: number; worst: number };
