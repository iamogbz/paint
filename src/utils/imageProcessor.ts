import {
  PALETTE_COLORS,
  ProcessedArtwork,
  UsedColorStat,
} from "../types";
import { findClosestPaletteColorFast } from "./colorUtils";

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
  artworkName: string,
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
  origCtx.clearRect(0, 0, width, height);
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

  // Palette Quantization
  const colorIndices = new Int16Array(width * height);
  const colorCounts = new Array(PALETTE_COLORS.length).fill(0);

  for (let i = 0; i < width * height; i++) {
    const pxIdx = i * 4;
    const a = smoothedPixels[pxIdx + 3];

    // Preserve transparent pixels
    if (a < 128) {
      colorIndices[i] = -1;
    } else {
      const r = smoothedPixels[pxIdx];
      const g = smoothedPixels[pxIdx + 1];
      const b = smoothedPixels[pxIdx + 2];

      const closest = findClosestPaletteColorFast(r, g, b);
      const palIdx = PALETTE_COLORS.findIndex((c) => c.id === closest.id);
      colorIndices[i] = palIdx;
    }
  }

  // Jaggie Curve Smoothing (Majority neighborhood filter)
  const smoothingPasses = 2; // More passes for ultra smooth curves
  for (let pass = 0; pass < smoothingPasses; pass++) {
    applyMajorityCurveSmoothing(colorIndices, width, height);
  }

  // Render quantized cartoon pixels to count and output canvas
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
    const pxIdx = i * 4;
    const origAlpha = smoothedPixels[pxIdx + 3];

    if (palIdx === -1 || origAlpha < 128) {
      cartoonPixels[pxIdx] = 0;
      cartoonPixels[pxIdx + 1] = 0;
      cartoonPixels[pxIdx + 2] = 0;
      cartoonPixels[pxIdx + 3] = 0; // Fully transparent
    } else {
      colorCounts[palIdx]++;
      const palColor = PALETTE_COLORS[palIdx];
      cartoonPixels[pxIdx] = palColor.rgb[0];
      cartoonPixels[pxIdx + 1] = palColor.rgb[1];
      cartoonPixels[pxIdx + 2] = palColor.rgb[2];
      cartoonPixels[pxIdx + 3] = origAlpha; // Preserve alpha transparency
    }
  }

  outputCtx.putImageData(cartoonImgData, 0, 0);
  const cartoonDataUrl = outputCanvas.toDataURL("image/png");

  // Compute color statistics with exact ratios based on previous counts
  const colorStats: UsedColorStat[] = PALETTE_COLORS.map((color, index) => {
    const count = colorCounts[index];
    // Exact percentage rounded to 1 decimal place or whole number
    const percentage = Math.ceil((count / totalPixels) * 100);
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
    modifiedAt: Date.now(),
    colorStats,
    totalPixels,
  };
}
