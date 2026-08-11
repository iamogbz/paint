import { PALETTE_COLORS, PaletteColor } from '../types';

/**
 * Calculates weighted perceptual color distance between two RGB triples.
 * Humans are most sensitive to green, then red, then blue.
 */
export function getPerceptualColorDistance(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number
): number {
  const rmean = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  
  // Weight formula based on red mean to approximate CIE76
  const weightR = 2 + rmean / 256;
  const weightG = 4.0;
  const weightB = 2 + (255 - rmean) / 256;

  return Math.sqrt(weightR * dr * dr + weightG * dg * dg + weightB * db * db);
}

/**
 * Finds the closest palette color for any given RGB tuple.
 */
export function findClosestPaletteColor(r: number, g: number, b: number): PaletteColor {
  let minDistance = Infinity;
  let closestColor = PALETTE_COLORS[0];

  for (let i = 0; i < PALETTE_COLORS.length; i++) {
    const pal = PALETTE_COLORS[i];
    const dist = getPerceptualColorDistance(r, g, b, pal.rgb[0], pal.rgb[1], pal.rgb[2]);
    if (dist < minDistance) {
      minDistance = dist;
      closestColor = pal;
    }
  }

  return closestColor;
}

/**
 * Precomputed color lookup map cache to make quantization blazingly fast.
 * Quantizes RGB to 5-bit precision (32x32x32 = 32,768 keys max).
 */
const lookupCache = new Map<number, PaletteColor>();

export function findClosestPaletteColorFast(r: number, g: number, b: number): PaletteColor {
  // Quantize RGB to 5-bit (32 values each) for cache key
  const r5 = r >> 3;
  const g5 = g >> 3;
  const b5 = b >> 3;
  const key = (r5 << 10) | (g5 << 5) | b5;

  let cached = lookupCache.get(key);
  if (!cached) {
    cached = findClosestPaletteColor(r, g, b);
    lookupCache.set(key, cached);
  }
  return cached;
}

export function clearColorCache() {
  lookupCache.clear();
}
