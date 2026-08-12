import {
  PALETTE_COLOR,
  PALETTE_COLORS,
  ProcessedArtwork,
  UsedColorStat,
} from "../types";
import {
  findClosestPaletteColorFast,
  getPerceptualColorDistance,
} from "./colorUtils";

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
 * Iteratively removes any color constituting less than 4% of total composition.
 * Starts with the lowest count color and maps its pixels to the perceptually closest
 * remaining color, repeating until no non-transparent color is below 4%.
 */
function removeSubFourPercentColors(
  colorIndices: Int16Array,
  totalPixels: number
) {
  const threshold = 0.04 * totalPixels;
  const removedSet = new Set<number>();

  const transparentIdx = PALETTE_COLORS.findIndex(
    (c) => c.id === PALETTE_COLOR.transparent.id
  );

  while (true) {
    // 1. Calculate current counts
    const counts = new Array(PALETTE_COLORS.length).fill(0);
    for (let i = 0; i < colorIndices.length; i++) {
      const idx = colorIndices[i];
      if (idx >= 0 && idx < PALETTE_COLORS.length) {
        counts[idx]++;
      }
    }

    // 2. Find the lowest count color that is < 4% (threshold)
    let minIdx = -1;
    let minCount = Infinity;

    for (let i = 0; i < PALETTE_COLORS.length; i++) {
      if (i === transparentIdx || removedSet.has(i)) continue;
      const count = counts[i];
      if (count > 0 && count < threshold) {
        if (count < minCount) {
          minCount = count;
          minIdx = i;
        }
      }
    }

    // If no color is below 4%, we are finished
    if (minIdx === -1) {
      break;
    }

    // 3. Find closest target color excluding minIdx, transparent, and removed colors
    const sourceColor = PALETTE_COLORS[minIdx];
    let targetIdx = -1;
    let minDistance = Infinity;

    // First try active colors (count > 0)
    for (let i = 0; i < PALETTE_COLORS.length; i++) {
      if (i === minIdx || i === transparentIdx || removedSet.has(i)) continue;
      if (counts[i] === 0) continue;

      const candidateColor = PALETTE_COLORS[i];
      const dist = getPerceptualColorDistance(
        sourceColor.rgba[0],
        sourceColor.rgba[1],
        sourceColor.rgba[2],
        sourceColor.rgba[3] ?? 255,
        candidateColor.rgba[0],
        candidateColor.rgba[1],
        candidateColor.rgba[2],
        candidateColor.rgba[3] ?? 255
      );

      if (dist < minDistance) {
        minDistance = dist;
        targetIdx = i;
      }
    }

    // Fallback to any non-removed palette color if no active color was found
    if (targetIdx === -1) {
      for (let i = 0; i < PALETTE_COLORS.length; i++) {
        if (i === minIdx || i === transparentIdx || removedSet.has(i)) continue;

        const candidateColor = PALETTE_COLORS[i];
        const dist = getPerceptualColorDistance(
          sourceColor.rgba[0],
          sourceColor.rgba[1],
          sourceColor.rgba[2],
          sourceColor.rgba[3] ?? 255,
          candidateColor.rgba[0],
          candidateColor.rgba[1],
          candidateColor.rgba[2],
          candidateColor.rgba[3] ?? 255
        );

        if (dist < minDistance) {
          minDistance = dist;
          targetIdx = i;
        }
      }
    }

    // If still no valid target found, stop
    if (targetIdx === -1) {
      break;
    }

    // 4. Remap all pixels of minIdx to targetIdx
    for (let i = 0; i < colorIndices.length; i++) {
      if (colorIndices[i] === minIdx) {
        colorIndices[i] = targetIdx;
      }
    }

    // Mark minIdx as removed so it cannot be selected or remapped to again
    removedSet.add(minIdx);
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
    const r = smoothedPixels[pxIdx];
    const g = smoothedPixels[pxIdx + 1];
    const b = smoothedPixels[pxIdx + 2];
    const a = smoothedPixels[pxIdx + 3];

    // Match closest palette color including alpha channel
    const closest = findClosestPaletteColorFast(r, g, b, a);
    const palIdx = PALETTE_COLORS.findIndex((c) => c.id === closest.id);
    colorIndices[i] = palIdx;
  }

  // Jaggie Curve Smoothing (Majority neighborhood filter)
  const smoothingPasses = 0; // More passes for ultra smooth curves
  for (let pass = 0; pass < smoothingPasses; pass++) {
    applyMajorityCurveSmoothing(colorIndices, width, height);
  }

  // Remove colors constituting < 4% of total composition iteratively
  removeSubFourPercentColors(colorIndices, width * height);

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

    if (palIdx === -1) {
      cartoonPixels[pxIdx] = 0;
      cartoonPixels[pxIdx + 1] = 0;
      cartoonPixels[pxIdx + 2] = 0;
      cartoonPixels[pxIdx + 3] = 0; // Fully transparent
    } else {
      colorCounts[palIdx]++;
      const palColor = PALETTE_COLORS[palIdx];
      cartoonPixels[pxIdx] = palColor.rgba[0];
      cartoonPixels[pxIdx + 1] = palColor.rgba[1];
      cartoonPixels[pxIdx + 2] = palColor.rgba[2];
      cartoonPixels[pxIdx + 3] = Math.min(palColor.rgba[3] ?? 255, origAlpha); // Respect palette color alpha and image transparency
    }
  }

  outputCtx.putImageData(cartoonImgData, 0, 0);
  const cartoonDataUrl = outputCanvas.toDataURL("image/png");

  // Compute color statistics with exact ratios based on previous counts
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
    modifiedAt: Date.now(),
    colorStats,
    totalPixels,
  };
}
