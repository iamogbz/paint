import {
  PALETTE_COLOR,
  PALETTE_COLORS,
  ProcessedArtwork,
  ProcessingSettings,
  UsedColorStat,
} from "../types";
import { findClosestPaletteColorFast } from "./colorUtils";

export const DEFAULT_SETTINGS: ProcessingSettings = {
  smoothness: 3, // 1 (mild) to 5 (strong painterly)
  outlineStrength: 2, // 0 (none) to 4 (bold cartoon)
  outlineColorHex: "#000000",
  cleanJaggies: true,
};

/**
 * Loads an image from File or URL into an HTMLImageElement
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

/**
 * Resizes image dimensions to fit within maxDim (800px max width or height)
 */
export function calculateTargetDimensions(
  width: number,
  height: number,
  maxDim = 800
): { width: number; height: number } {
  if (width <= maxDim && height <= maxDim) {
    return { width, height };
  }
  if (width > height) {
    const newWidth = maxDim;
    const newHeight = Math.round((height * maxDim) / width);
    return { width: newWidth, height: newHeight };
  } else {
    const newHeight = maxDim;
    const newWidth = Math.round((width * maxDim) / height);
    return { width: newWidth, height: newHeight };
  }
}

/**
 * Applies Kuwahara filter to smooth textures into painterly blocks while preserving major edges.
 */
function applyKuwaharaFilter(
  srcData: Uint8ClampedArray,
  dstData: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number
) {
  const windowSize = radius * 2 + 1;

  for (let y = radius; y < height - radius; y++) {
    for (let x = radius; x < width - radius; x++) {
      // 4 sub-regions around (x, y)
      // Region 1: [x-radius, x] x [y-radius, y]
      // Region 2: [x, x+radius] x [y-radius, y]
      // Region 3: [x-radius, x] x [y, y+radius]
      // Region 4: [x, x+radius] x [y, y+radius]

      let minVariance = Infinity;
      let bestR = 0,
        bestG = 0,
        bestB = 0;

      const subRegions = [
        { xStart: x - radius, xEnd: x, yStart: y - radius, yEnd: y },
        { xStart: x, xEnd: x + radius, yStart: y - radius, yEnd: y },
        { xStart: x - radius, xEnd: x, yStart: y, yEnd: y + radius },
        { xStart: x, xEnd: x + radius, yStart: y, yEnd: y + radius },
      ];

      for (let s = 0; s < 4; s++) {
        const reg = subRegions[s];
        let sumR = 0,
          sumG = 0,
          sumB = 0;
        let sumSqR = 0,
          sumSqG = 0,
          sumSqB = 0;
        let count = 0;

        for (let ry = reg.yStart; ry <= reg.yEnd; ry++) {
          for (let rx = reg.xStart; rx <= reg.xEnd; rx++) {
            const idx = (ry * width + rx) * 4;
            const r = srcData[idx];
            const g = srcData[idx + 1];
            const b = srcData[idx + 2];

            sumR += r;
            sumG += g;
            sumB += b;
            sumSqR += r * r;
            sumSqG += g * g;
            sumSqB += b * b;
            count++;
          }
        }

        const meanR = sumR / count;
        const meanG = sumG / count;
        const meanB = sumB / count;

        const varR = sumSqR / count - meanR * meanR;
        const varG = sumSqG / count - meanG * meanG;
        const varB = sumSqB / count - meanB * meanB;
        const totalVariance = varR + varG + varB;

        if (totalVariance < minVariance) {
          minVariance = totalVariance;
          bestR = meanR;
          bestG = meanG;
          bestB = meanB;
        }
      }

      const dstIdx = (y * width + x) * 4;
      dstData[dstIdx] = bestR;
      dstData[dstIdx + 1] = bestG;
      dstData[dstIdx + 2] = bestB;
      dstData[dstIdx + 3] = srcData[dstIdx + 3]; // Alpha
    }
  }
}

/**
 * Detects cartoon outlines using Sobel operator.
 */
function detectSobelEdges(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number
): Uint8Array {
  const edges = new Uint8Array(width * height);
  if (threshold <= 0) return edges;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      // Luminance values around pixel
      const getLum = (px: number, py: number) => {
        const idx = (py * width + px) * 4;
        return (
          0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
        );
      };

      const g00 = getLum(x - 1, y - 1);
      const g01 = getLum(x, y - 1);
      const g02 = getLum(x + 1, y - 1);
      const g10 = getLum(x - 1, y);
      const g12 = getLum(x + 1, y);
      const g20 = getLum(x - 1, y + 1);
      const g21 = getLum(x, y + 1);
      const g22 = getLum(x + 1, y + 1);

      const gx = -g00 + g02 - 2 * g10 + 2 * g12 - g20 + g22;
      const gy = -g00 - 2 * g01 - g02 + g20 + 2 * g21 + g22;
      const mag = Math.sqrt(gx * gx + gy * gy);

      if (mag > threshold) {
        edges[y * width + x] = 1;
      }
    }
  }

  return edges;
}

/**
 * 3x3 Majority filter to clean jaggies and round corners into smooth curves.
 */
function applyMajorityCurveSmoothing(
  colorIndices: Int16Array,
  width: number,
  height: number
) {
  const copy = new Int16Array(colorIndices);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const currentVal = copy[idx];

      // Count neighbor palette frequencies
      const counts: Record<number, number> = {};
      let maxCount = 0;
      let dominantVal = currentVal;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nVal = copy[(y + dy) * width + (x + dx)];
          counts[nVal] = (counts[nVal] || 0) + 1;
          if (counts[nVal] > maxCount) {
            maxCount = counts[nVal];
            dominantVal = nVal;
          }
        }
      }

      // If 5 or more of 9 pixels share same color, smooth this pixel to that color
      if (maxCount >= 5) {
        colorIndices[idx] = dominantVal;
      }
    }
  }
}

/**
 * Main Image Processing Pipeline:
 * Takes original image source, scales to max 800px, applies painterly smoothing,
 * edge outline detection, palette quantization, curve smoothing, and color ratio computation.
 */
export async function processImageToCartoonPalette(
  imageSrc: string,
  settings: ProcessingSettings = DEFAULT_SETTINGS,
  artworkName = "Cartoon Artwork"
): Promise<ProcessedArtwork> {
  const img = await loadImage(imageSrc);
  const { width, height } = calculateTargetDimensions(
    img.width,
    img.height,
    800
  );

  // Canvas for scaling original image
  const origCanvas = document.createElement("canvas");
  origCanvas.width = width;
  origCanvas.height = height;
  const origCtx = origCanvas.getContext("2d");
  if (!origCtx) throw new Error("Could not create canvas context");

  // Draw scaled original
  origCtx.imageSmoothingEnabled = true;
  origCtx.imageSmoothingQuality = "high";
  origCtx.drawImage(img, 0, 0, width, height);
  const originalDataUrl = origCanvas.toDataURL("image/png");

  // Source pixel data
  const origImgData = origCtx.getImageData(0, 0, width, height);
  const rawPixels = origImgData.data;

  // 1. Painterly smoothing pass (Kuwahara filter)
  const smoothedCanvas = document.createElement("canvas");
  smoothedCanvas.width = width;
  smoothedCanvas.height = height;
  const smoothedCtx = smoothedCanvas.getContext("2d");
  if (!smoothedCtx) throw new Error("Could not create canvas context");

  const smoothedImgData = smoothedCtx.createImageData(width, height);
  const smoothedPixels = smoothedImgData.data;

  // Copy raw as fallback base
  smoothedPixels.set(rawPixels);

  if (settings.smoothness > 0) {
    const radius = Math.min(Math.max(1, settings.smoothness), 4);
    applyKuwaharaFilter(rawPixels, smoothedPixels, width, height, radius);
  }

  // 2. Cartoon Edge Detection (Sobel)
  const edgeThresholds = [200, 150, 110, 80, 50]; // mapping outlineStrength 0..4
  const edgeThreshold = edgeThresholds[Math.min(settings.outlineStrength, 4)];
  const edgeMask =
    settings.outlineStrength > 0
      ? detectSobelEdges(smoothedPixels, width, height, edgeThreshold)
      : new Uint8Array(width * height);

  // Outline color mapping
  const outlinePaletteColor =
    PALETTE_COLORS.find(
      (c) => c.hexCode.toUpperCase() === settings.outlineColorHex.toUpperCase()
    ) || PALETTE_COLORS.find((c) => c.id === PALETTE_COLOR.pure_black.id)!;

  // 3. Palette Quantization
  const colorIndices = new Int16Array(width * height);
  const colorCounts = new Array(PALETTE_COLORS.length).fill(0);

  for (let i = 0; i < width * height; i++) {
    if (edgeMask[i] === 1) {
      // Outline pixel
      const outlineIndex = PALETTE_COLORS.findIndex(
        (c) => c.id === outlinePaletteColor.id
      );
      colorIndices[i] = outlineIndex;
    } else {
      const pxIdx = i * 4;
      const r = smoothedPixels[pxIdx];
      const g = smoothedPixels[pxIdx + 1];
      const b = smoothedPixels[pxIdx + 2];

      const closest = findClosestPaletteColorFast(r, g, b);
      const palIdx = PALETTE_COLORS.findIndex((c) => c.id === closest.id);
      colorIndices[i] = palIdx;
    }
  }

  // 4. Jaggie Curve Smoothing (Majority neighborhood filter)
  if (settings.cleanJaggies) {
    applyMajorityCurveSmoothing(colorIndices, width, height);
    if (settings.smoothness >= 3) {
      // Second pass for ultra smooth curves
      applyMajorityCurveSmoothing(colorIndices, width, height);
    }
  }

  // 5. Render quantized cartoon pixels to output canvas & compute ratios
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = width;
  outputCanvas.height = height;
  const outputCtx = outputCanvas.getContext("2d");
  if (!outputCtx) throw new Error("Could not create output canvas");

  const cartoonImgData = outputCtx.createImageData(width, height);
  const cartoonPixels = cartoonImgData.data;

  const totalPixels = width * height;

  for (let i = 0; i < totalPixels; i++) {
    const palIdx = colorIndices[i];
    colorCounts[palIdx]++;

    const palColor = PALETTE_COLORS[palIdx];
    const pxIdx = i * 4;

    cartoonPixels[pxIdx] = palColor.rgb[0];
    cartoonPixels[pxIdx + 1] = palColor.rgb[1];
    cartoonPixels[pxIdx + 2] = palColor.rgb[2];
    cartoonPixels[pxIdx + 3] = 255; // Fully opaque
  }

  outputCtx.putImageData(cartoonImgData, 0, 0);
  const cartoonDataUrl = outputCanvas.toDataURL("image/png");

  // Compute color statistics with exact ratios
  const colorStats: UsedColorStat[] = PALETTE_COLORS.map((color, index) => {
    const count = colorCounts[index];
    // Exact percentage rounded to 1 decimal place or whole number
    const percentage = Math.round((count / totalPixels) * 100);
    return {
      color,
      count,
      percentage,
    };
  });

  return {
    id: `art-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    name: artworkName,
    originalDataUrl,
    cartoonDataUrl,
    width,
    height,
    createdAt: Date.now(),
    colorStats,
    totalPixels,
    settingsUsed: { ...settings },
  };
}
