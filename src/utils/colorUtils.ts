import { PALETTE_COLORS, PaletteColor } from "../types";

/**
 * Calculates weighted perceptual color distance between two RGBA tuples.
 * Humans are most sensitive to green, then red, then blue.
 */
export function getPerceptualColorDistance(
  r1: number,
  g1: number,
  b1: number,
  a1: number = 255,
  r2: number,
  g2: number,
  b2: number,
  a2: number = 255
): number {
  const rmean = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  const da = a1 - a2;

  // Weight formula based on red mean to approximate CIE76 + alpha distance
  const weightR = 2 + rmean / 256;
  const weightG = 4.0;
  const weightB = 2 + (255 - rmean) / 256;
  const weightA = 3.0;

  return Math.sqrt(
    weightR * dr * dr +
      weightG * dg * dg +
      weightB * db * db +
      weightA * da * da
  );
}

/**
 * Finds the closest palette color for any given RGBA tuple.
 */
export function findClosestPaletteColor(
  r: number,
  g: number,
  b: number,
  a: number = 255
): PaletteColor {
  let minDistance = Infinity;
  let closestColor: PaletteColor = PALETTE_COLORS[0];

  for (let i = 0; i < PALETTE_COLORS.length; i++) {
    const pal = PALETTE_COLORS[i];
    const dist = getPerceptualColorDistance(
      r,
      g,
      b,
      a,
      pal.rgba[0],
      pal.rgba[1],
      pal.rgba[2],
      pal.rgba[3] ?? 255
    );
    if (dist < minDistance) {
      minDistance = dist;
      closestColor = pal;
    }
  }

  return closestColor;
}

/**
 * Precomputed color lookup map cache to make quantization blazingly fast.
 * Quantizes RGBA to 5-bit precision (32x32x32x32 = 1,048,576 keys max).
 */
const lookupCache = new Map<number, PaletteColor>();

export function findClosestPaletteColorFast(
  r: number,
  g: number,
  b: number,
  a: number = 255
): PaletteColor {
  // Quantize RGBA to 5-bit (32 values each) for cache key
  const r5 = r >> 3;
  const g5 = g >> 3;
  const b5 = b >> 3;
  const a5 = a >> 3;
  const key = (r5 << 15) | (g5 << 10) | (b5 << 5) | a5;

  let cached = lookupCache.get(key);
  if (!cached) {
    cached = findClosestPaletteColor(r, g, b, a);
    lookupCache.set(key, cached);
  }
  return cached;
}

export function clearColorCache() {
  lookupCache.clear();
}
