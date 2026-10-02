export interface RgbaImage { w: number; h: number; data: Uint8ClampedArray }
export function decodePng(buf: Uint8Array): RgbaImage;
export function encodePng(img: RgbaImage): Uint8Array;
