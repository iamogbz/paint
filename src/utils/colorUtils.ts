
import { PaletteColor } from "../types";

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

const LIGHTNESS_WEIGHT = 1.25;

export function getPerceptualColorDistance(
  color1: readonly [number, number, number, number?],
  color2: readonly [number, number, number, number?]
): number {
  const [r1, g1, b1, a1 = 255] = color1;
  const [r2, g2, b2, a2 = 255] = color2;

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

function toHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0").toUpperCase()).join("");
}

export function generateDynamicPalette(pixels: Uint8ClampedArray, maxColors: number = 24): PaletteColor[] {
  
  const opaquePixels: [number, number, number][] = [];
  
  // Sample up to 5000 opaque pixels
  const step = Math.max(1, Math.floor((pixels.length / 4) / 5000));
  for (let i = 0; i < pixels.length; i += 4 * step) {
    if (pixels[i + 3] > 128) {
      opaquePixels.push([pixels[i], pixels[i+1], pixels[i+2]]);
    }
  }
  
  if (opaquePixels.length === 0) return [];
  if (opaquePixels.length <= maxColors) {
    const unique = new Map<string, [number, number, number]>();
    for (const p of opaquePixels) {
      unique.set(toHex(p[0], p[1], p[2]), p);
    }
    return Array.from(unique.values()).map(p => ({ hexCode: toHex(p[0], p[1], p[2]), rgba: [p[0], p[1], p[2], 255] }));
  }

  const centroids: [number, number, number][] = [];
  const firstIdx = Math.floor(Math.random() * opaquePixels.length);
  centroids.push(opaquePixels[firstIdx]);
  
  const oklabs = opaquePixels.map(p => rgbToOklabCached(p[0], p[1], p[2]));
  const centroidOklabs: [number, number, number][] = [oklabs[firstIdx]];
  const minDists = new Float32Array(opaquePixels.length).fill(Infinity);
  
  // Adaptive threshold for distinct colors (squared Oklab distance ~0.0015)
  // Ensures we only add colors if they represent meaningful detail.
  const MIN_DIST_SQ = 0.0015;
  
  for (let k = 1; k < maxColors; k++) {
    let maxDist = -1;
    let nextIdx = 0;
    const lastCentroidOklab = centroidOklabs[centroidOklabs.length - 1];
    
    for (let i = 0; i < opaquePixels.length; i++) {
      const pOk = oklabs[i];
      const dL = pOk[0] - lastCentroidOklab[0];
      const da = pOk[1] - lastCentroidOklab[1];
      const db = pOk[2] - lastCentroidOklab[2];
      const dSq = dL*dL*LIGHTNESS_WEIGHT + da*da + db*db;
      
      if (dSq < minDists[i]) minDists[i] = dSq;
      if (minDists[i] > maxDist) {
        maxDist = minDists[i];
        nextIdx = i;
      }
    }
    
    if (maxDist < MIN_DIST_SQ) {
      break;
    }
    
    centroids.push(opaquePixels[nextIdx]);
    centroidOklabs.push(oklabs[nextIdx]);
  }
  
  const actualColors = centroids.length;
  const assignments = new Int32Array(opaquePixels.length);
  for (let iter = 0; iter < 5; iter++) {
    for (let i = 0; i < opaquePixels.length; i++) {
      let bestD = Infinity;
      let bestC = 0;
      const pOk = oklabs[i];
      for (let c = 0; c < actualColors; c++) {
        const cOk = centroidOklabs[c];
        const dL = pOk[0] - cOk[0];
        const da = pOk[1] - cOk[1];
        const db = pOk[2] - cOk[2];
        const dSq = dL*dL*LIGHTNESS_WEIGHT + da*da + db*db;
        if (dSq < bestD) { bestD = dSq; bestC = c; }
      }
      assignments[i] = bestC;
    }
    
    const sums = Array.from({length: actualColors}, () => [0,0,0]);
    const counts = new Int32Array(actualColors);
    for (let i = 0; i < opaquePixels.length; i++) {
      const c = assignments[i];
      sums[c][0] += opaquePixels[i][0];
      sums[c][1] += opaquePixels[i][1];
      sums[c][2] += opaquePixels[i][2];
      counts[c]++;
    }
    
    for (let c = 0; c < actualColors; c++) {
      if (counts[c] > 0) {
        const meanR = sums[c][0] / counts[c];
        const meanG = sums[c][1] / counts[c];
        const meanB = sums[c][2] / counts[c];
        
        let bestSnapD = Infinity;
        let bestSnapP = centroids[c];
        let bestSnapOk = centroidOklabs[c];
        for (let i = 0; i < opaquePixels.length; i++) {
          if (assignments[i] === c) {
            const r = opaquePixels[i][0], g = opaquePixels[i][1], b = opaquePixels[i][2];
            const dSq = (r-meanR)**2 + (g-meanG)**2 + (b-meanB)**2;
            if (dSq < bestSnapD) {
              bestSnapD = dSq;
              bestSnapP = opaquePixels[i];
              bestSnapOk = oklabs[i];
            }
          }
        }
        centroids[c] = bestSnapP;
        centroidOklabs[c] = bestSnapOk;
      }
    }
  }
  
  const palette: PaletteColor[] = centroids.map(c => ({
    hexCode: toHex(c[0], c[1], c[2]),
    rgba: [c[0], c[1], c[2], 255]
  }));
  
  const uniqueMap = new Map<string, PaletteColor>();
  for (const color of palette) {
    if (!uniqueMap.has(color.hexCode)) {
      uniqueMap.set(color.hexCode, color);
    }
  }
  
  return Array.from(uniqueMap.values());
}

export class ColorQuantizer {
  private palette: PaletteColor[];
  private lookupCache: Uint16Array;
  private initialized: Uint8Array;

  constructor(paletteColors: PaletteColor[]) {
    this.palette = paletteColors;
    this.lookupCache = new Uint16Array(1048576);
    this.initialized = new Uint8Array(1048576);
  }
  
  findClosestPaletteIndexFast(r: number, g: number, b: number, a: number = 255): number {
    if (a < 10) {
      return 0; // Transparent
    }
    const r5 = Math.max(0, Math.min(31, r >> 3));
    const g5 = Math.max(0, Math.min(31, g >> 3));
    const b5 = Math.max(0, Math.min(31, b >> 3));
    const a5 = Math.max(0, Math.min(31, a >> 3));
    const key = (r5 << 15) | (g5 << 10) | (b5 << 5) | a5;
    
    if (this.initialized[key]) {
      return this.lookupCache[key];
    }
    
    const idx = this._findClosestIndex(r, g, b, a);
    this.lookupCache[key] = idx;
    this.initialized[key] = 1;
    return idx;
  }
  
  private _findClosestIndex(r: number, g: number, b: number, a: number): number {
    const targetRgba: [number, number, number, number] = [r, g, b, a];
    let minDistance = Infinity;
    let closestIndex = 1;
    const startIdx = (this.palette[0] && this.palette[0].hexCode === "#00000000") ? 1 : 0;
    
    for (let i = startIdx; i < this.palette.length; i++) {
      const entry = this.palette[i];
      const dist = getPerceptualColorDistance(targetRgba, entry.rgba);
      if (dist < minDistance) {
        minDistance = dist;
        closestIndex = i;
      }
    }
    return closestIndex;
  }
}

const oppositeHueCache = new Map<number, [number, number, number, number]>();

/**
 * Calculates the opposite hue color with high contrast against the input RGBA color.
 * For achromatic pixels (black, white, grays), returns contrasting solid black or white.
 * For chromatic pixels, rotates the hue by 180° with vivid saturation and contrast-adjusted lightness.
 */
export function getOppositeHueRGBA(
  r: number,
  g: number,
  b: number,
  a: number = 255
): [number, number, number, number] {
  if (a < 10) {
    return [0, 0, 0, 255];
  }

  const rInt = Math.max(0, Math.min(255, Math.round(r)));
  const gInt = Math.max(0, Math.min(255, Math.round(g)));
  const bInt = Math.max(0, Math.min(255, Math.round(b)));
  const key = (rInt << 16) | (gInt << 8) | bInt;

  const cached = oppositeHueCache.get(key);
  if (cached) {
    return cached;
  }

  const rNorm = rInt / 255;
  const gNorm = gInt / 255;
  const bNorm = bInt / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;
  const l = (max + min) / 2;

  // Achromatic (grayscale / neutral white / black / low saturation)
  if (delta < 0.06) {
    const result: [number, number, number, number] =
      l > 0.5 ? [0, 0, 0, 255] : [255, 255, 255, 255];
    oppositeHueCache.set(key, result);
    return result;
  }

  // Calculate Hue in [0, 360)
  let h = 0;
  if (max === rNorm) {
    h = ((gNorm - bNorm) / delta + (gNorm < bNorm ? 6 : 0)) / 6;
  } else if (max === gNorm) {
    h = ((bNorm - rNorm) / delta + 2) / 6;
  } else {
    h = ((rNorm - gNorm) / delta + 4) / 6;
  }

  const hDeg = h * 360;
  const oppH = (hDeg + 180) % 360;
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  const oppS = Math.max(0.85, Math.min(1.0, s));
  const oppL = l > 0.5 ? 0.35 : 0.70;

  // Convert HSL back to RGB
  const c = (1 - Math.abs(2 * oppL - 1)) * oppS;
  const x = c * (1 - Math.abs(((oppH / 60) % 2) - 1));
  const m = oppL - c / 2;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (oppH < 60) {
    rPrime = c;
    gPrime = x;
    bPrime = 0;
  } else if (oppH < 120) {
    rPrime = x;
    gPrime = c;
    bPrime = 0;
  } else if (oppH < 180) {
    rPrime = 0;
    gPrime = c;
    bPrime = x;
  } else if (oppH < 240) {
    rPrime = 0;
    gPrime = x;
    bPrime = c;
  } else if (oppH < 300) {
    rPrime = x;
    gPrime = 0;
    bPrime = c;
  } else {
    rPrime = c;
    gPrime = 0;
    bPrime = x;
  }

  const result: [number, number, number, number] = [
    Math.max(0, Math.min(255, Math.round((rPrime + m) * 255))),
    Math.max(0, Math.min(255, Math.round((gPrime + m) * 255))),
    Math.max(0, Math.min(255, Math.round((bPrime + m) * 255))),
    255,
  ];

  oppositeHueCache.set(key, result);
  return result;
}

