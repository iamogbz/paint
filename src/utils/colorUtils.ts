import { PALETTE_COLOR, PALETTE_COLORS, PaletteColor } from "../types";

/**
 * Converts sRGB channel [0-255] to linear sRGB [0-1].
 */
function srgbToLinear(c: number): number {
  const clamped = Math.max(0, Math.min(255, c));
  const v = clamped / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/**
 * Converts sRGB (0-255) to Oklab coordinates [L, a, b].
 */
export function rgbToOklab(
  r: number,
  g: number,
  b: number
): [number, number, number] {
  const rLin = srgbToLinear(r);
  const gLin = srgbToLinear(g);
  const bLin = srgbToLinear(b);

  const l = 0.4122214708 * rLin + 0.5363325363 * gLin + 0.0514459929 * bLin;
  const m = 0.2119034982 * rLin + 0.6806995451 * gLin + 0.1073969566 * bLin;
  const s = 0.0883024619 * rLin + 0.2817188376 * gLin + 0.6299787005 * bLin;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  const okL = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720403 * s_;
  const okA = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const okB = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757968 * s_;

  return [okL, okA, okB];
}

/**
 * Fast cached version of rgbToOklab for 8-bit RGB values.
 */
const oklabCache = new Map<number, [number, number, number]>();

export function rgbToOklabCached(
  r: number,
  g: number,
  b: number
): [number, number, number] {
  const rInt = Math.max(0, Math.min(255, Math.round(r)));
  const gInt = Math.max(0, Math.min(255, Math.round(g)));
  const bInt = Math.max(0, Math.min(255, Math.round(b)));
  const key = (rInt << 16) | (gInt << 8) | bInt;

  let cached = oklabCache.get(key);
  if (!cached) {
    cached = rgbToOklab(rInt, gInt, bInt);
    oklabCache.set(key, cached);
  }
  return cached;
}

/**
 * Converts RGBA to Oklab with linear sRGB compositing over white for semi-transparent pixels.
 */
export function rgbaToOklabLinearComposite(
  r: number,
  g: number,
  b: number,
  a: number = 255
): [number, number, number] {
  if (a >= 255) {
    return rgbToOklabCached(r, g, b);
  }
  const normA = Math.max(0, Math.min(255, a)) / 255;
  if (normA === 0) {
    return [1.0, 0, 0];
  }

  const rLin = srgbToLinear(r) * normA + (1.0 - normA);
  const gLin = srgbToLinear(g) * normA + (1.0 - normA);
  const bLin = srgbToLinear(b) * normA + (1.0 - normA);

  const l = 0.4122214708 * rLin + 0.5363325363 * gLin + 0.0514459929 * bLin;
  const m = 0.2119034982 * rLin + 0.6806995451 * gLin + 0.1073969566 * bLin;
  const s = 0.0883024619 * rLin + 0.2817188376 * gLin + 0.6299787005 * bLin;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  const okL = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720403 * s_;
  const okA = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const okB = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757968 * s_;

  return [okL, okA, okB];
}

// Pre-computed Oklab entries for all non-transparent palette colors
interface PaletteOklabEntry {
  color: PaletteColor;
  oklab: [number, number, number];
  chroma: number;
}

const PALETTE_OKLAB_ENTRIES: PaletteOklabEntry[] = PALETTE_COLORS.filter(
  (c) => c.id !== PALETTE_COLOR.transparent.id
).map((color) => {
  const oklab = rgbaToOklabLinearComposite(
    color.rgba[0],
    color.rgba[1],
    color.rgba[2],
    color.rgba[3] ?? 255
  );
  const chroma = Math.sqrt(oklab[1] * oklab[1] + oklab[2] * oklab[2]);
  return { color, oklab, chroma };
});

const LIGHTNESS_WEIGHT = 1.25;

/**
 * Calculates perceptual color distance in Oklab uniform color space.
 * Priorities:
 * 1. Maintaining contrast (Lightness L weighted 1.25x)
 * 2. Color vibrancy and accuracy (a, b chromaticity with vibrancy protection)
 */
export function getPerceptualColorDistance(
  color1: readonly [number, number, number, number],
  color2: readonly [number, number, number, number]
): number {
  const [r1, g1, b1, a1 = 255] = color1;
  const [r2, g2, b2, a2 = 255] = color2;

  // Transparent pixel boundaries
  if (a1 < 10 && a2 < 10) return 0;
  if (a1 < 10 || a2 < 10) return 10.0;

  const [L1, okA1, okB1] = rgbaToOklabLinearComposite(r1, g1, b1, a1);
  const [L2, okA2, okB2] = rgbaToOklabLinearComposite(r2, g2, b2, a2);

  const dL = L1 - L2;
  const da = okA1 - okA2;
  const db = okB1 - okB2;
  const dAlpha = (a1 - a2) / 255;

  const C1 = Math.sqrt(okA1 * okA1 + okB1 * okB1);
  const C2 = Math.sqrt(okA2 * okA2 + okB2 * okB2);

  // Vibrancy protection: if input color has chroma and target candidate is neutral gray, add small penalty
  let vibrancyPenalty = 0;
  if (C1 > 0.03 && C2 < 0.015) {
    vibrancyPenalty = 0.05 + (C1 - C2) * 0.5;
  }

  const distSq =
    dL * dL * LIGHTNESS_WEIGHT +
    da * da +
    db * db +
    dAlpha * dAlpha * 0.25;

  return Math.sqrt(distSq) + vibrancyPenalty;
}

/**
 * Finds the closest palette color for any given RGBA tuple using balanced Oklab space.
 */
export function findClosestPaletteColor(
  r: number,
  g: number,
  b: number,
  a: number = 255
): PaletteColor {
  if (a < 10) {
    return PALETTE_COLOR.transparent;
  }

  const targetRgba: [number, number, number, number] = [r, g, b, a];
  let minDistance = Infinity;
  let closestColor: PaletteColor = PALETTE_OKLAB_ENTRIES[0].color;

  for (let i = 0; i < PALETTE_OKLAB_ENTRIES.length; i++) {
    const entry = PALETTE_OKLAB_ENTRIES[i];
    const dist = getPerceptualColorDistance(targetRgba, entry.color.rgba);

    if (dist < minDistance) {
      minDistance = dist;
      closestColor = entry.color;
    }
  }

  return closestColor;
}

/**
 * Fast color lookup cache using 5-bit color precision per channel.
 */
const lookupCache = new Map<number, PaletteColor>();

export function findClosestPaletteColorFast(
  r: number,
  g: number,
  b: number,
  a: number = 255
): PaletteColor {
  const r5 = Math.max(0, Math.min(31, r >> 3));
  const g5 = Math.max(0, Math.min(31, g >> 3));
  const b5 = Math.max(0, Math.min(31, b >> 3));
  const a5 = Math.max(0, Math.min(31, a >> 3));
  const key = (r5 << 15) | (g5 << 10) | (b5 << 5) | a5;

  let cached = lookupCache.get(key);
  if (!cached) {
    cached = findClosestPaletteColor(r, g, b, a);
    lookupCache.set(key, cached);
  }
  return cached;
}

export function clearColorCache(): void {
  lookupCache.clear();
  oklabCache.clear();
}
