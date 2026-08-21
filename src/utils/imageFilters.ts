import {
  BILATERAL_RANGE_SIGMA,
  BILATERAL_SPATIAL_SIGMA,
  UNSHARP_MASK_AMOUNT,
  UNSHARP_MASK_THRESHOLD,
  SATURATION_BOOST_AMOUNT,
  CONTRAST_BOOST_AMOUNT,
} from "./constants.js";

/**
 * Applies a bilateral filter (edge-preserving smoothing) to ImageData in-place.
 * Smooths flat regions and reduces noise while preserving sharp boundaries between colors.
 */
export function applyBilateralFilter(
  imageData: ImageData,
  spatialSigma = BILATERAL_SPATIAL_SIGMA,
  rangeSigma = BILATERAL_RANGE_SIGMA
): void {
  const { width, height, data } = imageData;
  const radius = 2; // 5x5 kernel window
  const windowSize = 2 * radius + 1;

  // Precompute spatial weights
  const spatialWeights = new Float32Array(windowSize * windowSize);
  const twoSpatialSigmaSq = 2 * spatialSigma * spatialSigma;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const idx = (dy + radius) * windowSize + (dx + radius);
      spatialWeights[idx] = Math.exp(-(dx * dx + dy * dy) / twoSpatialSigmaSq);
    }
  }

  // Precompute range (color difference) lookup table
  // max distSq for RGB delta = 3 * 255^2 = 195075
  const maxDistSq = 3 * 255 * 255;
  const rangeLookup = new Float32Array(maxDistSq + 1);
  const twoRangeSigmaSq = 2 * rangeSigma * rangeSigma;
  for (let d = 0; d <= maxDistSq; d++) {
    rangeLookup[d] = Math.exp(-d / twoRangeSigmaSq);
  }

  const src = new Uint8ClampedArray(data);

  for (let y = 0; y < height; y++) {
    const yOffset = y * width;
    for (let x = 0; x < width; x++) {
      const centerIdx = (yOffset + x) * 4;
      const r0 = src[centerIdx];
      const g0 = src[centerIdx + 1];
      const b0 = src[centerIdx + 2];
      const a0 = src[centerIdx + 3];

      if (a0 === 0) continue;

      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sumW = 0;

      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        const nRowOffset = ny * width;
        const swRow = (dy + radius) * windowSize;

        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;

          const sw = spatialWeights[swRow + (dx + radius)];
          const nIdx = (nRowOffset + nx) * 4;
          const nr = src[nIdx];
          const ng = src[nIdx + 1];
          const nb = src[nIdx + 2];

          const dr = r0 - nr;
          const dg = g0 - ng;
          const db = b0 - nb;
          const distSq = dr * dr + dg * dg + db * db;

          const w = sw * rangeLookup[distSq];
          sumR += nr * w;
          sumG += ng * w;
          sumB += nb * w;
          sumW += w;
        }
      }

      if (sumW > 0) {
        const invW = 1.0 / sumW;
        data[centerIdx] = Math.round(sumR * invW);
        data[centerIdx + 1] = Math.round(sumG * invW);
        data[centerIdx + 2] = Math.round(sumB * invW);
      }
    }
  }
}

/**
 * Applies a thresholded unsharp mask / contrast enhancement to ImageData in-place.
 * Sharpens edges where contrast difference exceeds UNSHARP_MASK_THRESHOLD to clarify regions.
 */
export function applyThresholdedUnsharpMask(
  imageData: ImageData,
  threshold = UNSHARP_MASK_THRESHOLD,
  amount = UNSHARP_MASK_AMOUNT
): void {
  const { width, height, data } = imageData;
  const src = new Uint8ClampedArray(data);

  // Compute 3x3 box blur reference
  const blur = new Uint8ClampedArray(src.length);

  for (let y = 0; y < height; y++) {
    const yOffset = y * width;
    for (let x = 0; x < width; x++) {
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        const nRowOffset = ny * width;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const idx = (nRowOffset + nx) * 4;
          sumR += src[idx];
          sumG += src[idx + 1];
          sumB += src[idx + 2];
          count++;
        }
      }
      const outIdx = (yOffset + x) * 4;
      blur[outIdx] = Math.round(sumR / count);
      blur[outIdx + 1] = Math.round(sumG / count);
      blur[outIdx + 2] = Math.round(sumB / count);
      blur[outIdx + 3] = src[outIdx + 3];
    }
  }

  // Apply thresholded sharpening
  for (let i = 0; i < data.length; i += 4) {
    const r = src[i];
    const g = src[i + 1];
    const b = src[i + 2];

    const diffR = r - blur[i];
    const diffG = g - blur[i + 1];
    const diffB = b - blur[i + 2];

    const diffLum = 0.299 * Math.abs(diffR) + 0.587 * Math.abs(diffG) + 0.114 * Math.abs(diffB);

    if (diffLum >= threshold) {
      data[i] = Math.min(255, Math.max(0, Math.round(r + amount * diffR)));
      data[i + 1] = Math.min(255, Math.max(0, Math.round(g + amount * diffG)));
      data[i + 2] = Math.min(255, Math.max(0, Math.round(b + amount * diffB)));
    }
  }
}

/**
 * Boosts saturation and contrast to help the vectorizer clearly distinguish color regions
 * without blurring fine edges or losing original color vibrancy.
 */
export function applySaturationAndContrast(
  imageData: ImageData,
  saturationAmount = SATURATION_BOOST_AMOUNT,
  contrastAmount = CONTRAST_BOOST_AMOUNT
): void {
  const { data } = imageData;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;

    let r = data[i] / 255;
    let g = data[i + 1] / 255;
    let b = data[i + 2] / 255;

    // 1. Convert RGB to HSL
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }

    // 2. Apply Contrast to Lightness
    // Expands distance from 0.5 (mid-gray), darkening darks and brightening lights
    l = (l - 0.5) * contrastAmount + 0.5;
    l = Math.max(0, Math.min(1, l));

    // 3. Apply Saturation
    s = s * saturationAmount;
    s = Math.max(0, Math.min(1, s));

    // 4. Convert HSL back to RGB
    let fR = l, fG = l, fB = l;
    if (s !== 0) {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      fR = hue2rgb(p, q, h + 1 / 3);
      fG = hue2rgb(p, q, h);
      fB = hue2rgb(p, q, h - 1 / 3);
    }

    // 5. Assign rounded values
    data[i] = Math.round(fR * 255);
    data[i + 1] = Math.round(fG * 255);
    data[i + 2] = Math.round(fB * 255);
  }
}

/**
 * Pipeline that runs pre-processing on bitmap image data prior to vtracer vectorization.
 * Currently uses only a color vibrancy boost to ensure vectorizer receives distinct color 
 * regions without sacrificing any structural edge details.
 */
export function enhanceBitmapForVectorization(imageData: ImageData): void {
  applySaturationAndContrast(imageData);
}
