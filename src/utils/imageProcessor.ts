import {
  PALETTE_COLOR,
  PALETTE_COLORS,
  ProcessedArtwork,
  UsedColorStat,
} from "../types";
import {
  clearColorCache,
  findClosestPaletteColorFast,
  getPerceptualColorDistance,
} from "./colorUtils";

/**
 * Asynchronously loads an image from a URL or DataURL into an HTMLImageElement
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
 * Calculates target canvas dimensions maintaining aspect ratio with max dimension (default 800px)
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
 * Edge-preserving Bilateral Filter to smooth photographic noise while keeping crisp object borders.
 */
function applyBilateralFilter(
  srcPixels: Uint8ClampedArray,
  width: number,
  height: number,
  spatialSigma = 3.0,
  rangeSigma = 45.0,
  radius = 3 // 7x7 window
): Uint8ClampedArray {
  const dstPixels = new Uint8ClampedArray(srcPixels.length);
  const twoSpatialSigmaSq = 2 * spatialSigma * spatialSigma;
  const twoRangeSigmaSq = 2 * rangeSigma * rangeSigma;

  // Precompute spatial weights
  const spatialWeights: number[][] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    spatialWeights[dy + radius] = [];
    for (let dx = -radius; dx <= radius; dx++) {
      spatialWeights[dy + radius][dx + radius] = Math.exp(
        -(dx * dx + dy * dy) / twoSpatialSigmaSq
      );
    }
  }

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const centerIdx = (rowOffset + x) * 4;
      const cR = srcPixels[centerIdx];
      const cG = srcPixels[centerIdx + 1];
      const cB = srcPixels[centerIdx + 2];
      const cA = srcPixels[centerIdx + 3];

      if (cA < 10) {
        dstPixels[centerIdx + 3] = 0;
        continue;
      }

      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sumW = 0;

      const yMin = Math.max(0, y - radius);
      const yMax = Math.min(height - 1, y + radius);
      const xMin = Math.max(0, x - radius);
      const xMax = Math.min(width - 1, x + radius);

      for (let ny = yMin; ny <= yMax; ny++) {
        const sWeightY = spatialWeights[ny - y + radius];
        const nRowOffset = ny * width;

        for (let nx = xMin; nx <= xMax; nx++) {
          const nIdx = (nRowOffset + nx) * 4;
          const nR = srcPixels[nIdx];
          const nG = srcPixels[nIdx + 1];
          const nB = srcPixels[nIdx + 2];
          const nA = srcPixels[nIdx + 3];

          if (nA < 10) continue;

          const dR = cR - nR;
          const dG = cG - nG;
          const dB = cB - nB;
          const rangeWeight = Math.exp(
            -(dR * dR + dG * dG + dB * dB) / twoRangeSigmaSq
          );
          const weight = sWeightY[nx - x + radius] * rangeWeight;

          sumR += nR * weight;
          sumG += nG * weight;
          sumB += nB * weight;
          sumW += weight;
        }
      }

      if (sumW > 0) {
        dstPixels[centerIdx] = Math.round(sumR / sumW);
        dstPixels[centerIdx + 1] = Math.round(sumG / sumW);
        dstPixels[centerIdx + 2] = Math.round(sumB / sumW);
        dstPixels[centerIdx + 3] = cA;
      } else {
        dstPixels[centerIdx] = cR;
        dstPixels[centerIdx + 1] = cG;
        dstPixels[centerIdx + 2] = cB;
        dstPixels[centerIdx + 3] = cA;
      }
    }
  }

  return dstPixels;
}

/**
 * 3x3 Majority Neighborhood Filter to round jaggies and eliminate stray pixel noise.
 */
function applyMajoritySmoothing(
  colorIndices: Int16Array,
  width: number,
  height: number
) {
  const copy = new Int16Array(colorIndices);

  for (let y = 1; y < height - 1; y++) {
    const rowIdx = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = rowIdx + x;
      const centerVal = copy[idx];

      const counts: Record<number, number> = {};
      let maxCount = 0;
      let dominantVal = centerVal;

      for (let dy = -1; dy <= 1; dy++) {
        const nRow = (y + dy) * width;
        for (let dx = -1; dx <= 1; dx++) {
          const nVal = copy[nRow + (x + dx)];
          counts[nVal] = (counts[nVal] || 0) + 1;
          if (counts[nVal] > maxCount) {
            maxCount = counts[nVal];
            dominantVal = nVal;
          }
        }
      }

      if (maxCount >= 5) {
        colorIndices[idx] = dominantVal;
      }
    }
  }
}

/**
 * Remaps rare/isolated palette colors (< 0.25% of total image) to the closest frequent color in the artwork.
 */
function removeRareColors(
  colorIndices: Int16Array,
  totalPixels: number,
  minRatio = 0.0025
) {
  const threshold = Math.round(totalPixels * minRatio);
  const transparentIdx = PALETTE_COLORS.findIndex(
    (c) => c.id === PALETTE_COLOR.transparent.id
  );

  const counts = new Array(PALETTE_COLORS.length).fill(0);
  for (let i = 0; i < colorIndices.length; i++) {
    counts[colorIndices[i]]++;
  }

  const rareIndices: number[] = [];
  const frequentIndices: number[] = [];

  for (let i = 0; i < PALETTE_COLORS.length; i++) {
    if (i === transparentIdx) continue;
    if (counts[i] > 0) {
      if (counts[i] < threshold) {
        rareIndices.push(i);
      } else {
        frequentIndices.push(i);
      }
    }
  }

  if (rareIndices.length === 0 || frequentIndices.length === 0) return;

  const remapTable = new Map<number, number>();
  for (const rareIdx of rareIndices) {
    const rareColor = PALETTE_COLORS[rareIdx];
    let bestFrequent = frequentIndices[0];
    let minD = Infinity;

    for (const freqIdx of frequentIndices) {
      const freqColor = PALETTE_COLORS[freqIdx];
      const d = getPerceptualColorDistance(rareColor.rgba, freqColor.rgba);
      if (d < minD) {
        minD = d;
        bestFrequent = freqIdx;
      }
    }
    remapTable.set(rareIdx, bestFrequent);
  }

  for (let i = 0; i < colorIndices.length; i++) {
    const remapped = remapTable.get(colorIndices[i]);
    if (remapped !== undefined) {
      colorIndices[i] = remapped;
    }
  }
}

/**
 * Eliminates small isolated regions (islands) by merging them into their dominant neighboring color.
 */
function eliminateSmallIslands(
  colorIndices: Int16Array,
  width: number,
  height: number,
  minRegionSize: number
) {
  const totalPixels = width * height;
  const visited = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels * 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const startIdx = y * width + x;
      if (visited[startIdx]) continue;

      const colorIdx = colorIndices[startIdx];
      let head = 0;
      let tail = 0;

      queue[tail++] = x;
      queue[tail++] = y;
      visited[startIdx] = 1;

      while (head < tail) {
        const qx = queue[head++];
        const qy = queue[head++];

        const neighbors = [
          [qx + 1, qy],
          [qx - 1, qy],
          [qx, qy + 1],
          [qx, qy - 1],
        ];

        for (const [nx, ny] of neighbors) {
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nIdx = ny * width + nx;
            if (!visited[nIdx] && colorIndices[nIdx] === colorIdx) {
              visited[nIdx] = 1;
              queue[tail++] = nx;
              queue[tail++] = ny;
            }
          }
        }
      }

      const regionSize = tail / 2;
      if (regionSize < minRegionSize) {
        const neighborCounts = new Map<number, number>();
        let maxCount = 0;
        let dominantNeighbor = -1;

        for (let i = 0; i < tail; i += 2) {
          const rx = queue[i];
          const ry = queue[i + 1];
          const neighbors = [
            [rx + 1, ry],
            [rx - 1, ry],
            [rx, ry + 1],
            [rx, ry - 1],
            [rx + 1, ry + 1],
            [rx - 1, ry - 1],
            [rx - 1, ry + 1],
            [rx + 1, ry - 1]
          ];
          for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const nIdx = ny * width + nx;
              const nColor = colorIndices[nIdx];
              if (nColor !== colorIdx) {
                const count = (neighborCounts.get(nColor) || 0) + 1;
                neighborCounts.set(nColor, count);
                if (count > maxCount) {
                  maxCount = count;
                  dominantNeighbor = nColor;
                }
              }
            }
          }
        }

        if (dominantNeighbor !== -1) {
          for (let i = 0; i < tail; i += 2) {
            const rx = queue[i];
            const ry = queue[i + 1];
            colorIndices[ry * width + rx] = dominantNeighbor;
          }
        }
      }
    }
  }
}

/**
 * Main Image Processing Pipeline:
 * Takes original image source, scales to max 800px, applies bilateral painterly smoothing,
 * Oklab palette quantization, majority curve smoothing, and color statistics computation.
 */

/**
 * Applies a mode filter (most frequent color in neighborhood) to remove thin lines and noise.
 */
function applyModeFilter(
  colorIndices: Int16Array,
  width: number,
  height: number,
  radius: number
) {
  const copy = new Int16Array(colorIndices);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      
      const counts = new Map<number, number>();
      let maxCount = 0;
      let dominantVal = copy[idx];

      const minY = Math.max(0, y - radius);
      const maxY = Math.min(height - 1, y + radius);
      const minX = Math.max(0, x - radius);
      const maxX = Math.min(width - 1, x + radius);

      for (let ny = minY; ny <= maxY; ny++) {
        const nRow = ny * width;
        for (let nx = minX; nx <= maxX; nx++) {
          const nVal = copy[nRow + nx];
          const c = (counts.get(nVal) || 0) + 1;
          counts.set(nVal, c);
          if (c > maxCount) {
            maxCount = c;
            dominantVal = nVal;
          }
        }
      }
      colorIndices[idx] = dominantVal;
    }
  }
}

export async function processImageToCartoonPalette(
  imageSrc: string,
  artworkName: string
): Promise<ProcessedArtwork> {
  clearColorCache();

  // 1. Load original image and calculate canvas dimensions
  const img = await loadImage(imageSrc);
  const { width, height } = calculateTargetDimensions(img.width, img.height, 800);

  // 2. Render scaled original to canvas and extract raw pixels
  const origCanvas = document.createElement("canvas");
  origCanvas.width = width;
  origCanvas.height = height;
  const origCtx = origCanvas.getContext("2d", { willReadFrequently: true });
  if (!origCtx) throw new Error("Failed to initialize canvas 2D context");

  origCtx.imageSmoothingEnabled = true;
  origCtx.imageSmoothingQuality = "high";
  origCtx.drawImage(img, 0, 0, width, height);
  const originalDataUrl = origCanvas.toDataURL("image/png");

  const origImgData = origCtx.getImageData(0, 0, width, height);
  const rawPixels = origImgData.data;

  // 3. Apply Bilateral Painterly Filter for noise reduction & smooth color fields
  let smoothedPixels = applyBilateralFilter(rawPixels, width, height, 3.0, 45.0, 3);
  smoothedPixels = applyBilateralFilter(smoothedPixels, width, height, 3.0, 45.0, 3);

  // 4. Quantize pixels to nearest Oklab palette color
  const totalPixels = width * height;
  const colorIndices = new Int16Array(totalPixels);

  for (let i = 0; i < totalPixels; i++) {
    const pxIdx = i * 4;
    const r = smoothedPixels[pxIdx];
    const g = smoothedPixels[pxIdx + 1];
    const b = smoothedPixels[pxIdx + 2];
    const a = smoothedPixels[pxIdx + 3];

    const closest = findClosestPaletteColorFast(r, g, b, a);
    const palIdx = PALETTE_COLORS.findIndex((c) => c.id === closest.id);
    colorIndices[i] = palIdx >= 0 ? palIdx : 0;
  }

  // 5. Apply Mode Filter to remove thin lines and strips
  applyModeFilter(colorIndices, width, height, 2);

  // 5b. Apply Majority Smoothing passes to round staircases and clean noise
  const smoothingPasses = 5;
  for (let i = 0; i < smoothingPasses; i++) {
    applyMajoritySmoothing(colorIndices, width, height);
  }

  // 6. Clean up rare isolated micro-colors
  removeRareColors(colorIndices, totalPixels, 0.0025);

  // 6b. Eliminate small isolated islands (noise) under 50 pixels
  eliminateSmallIslands(colorIndices, width, height, 50);

  // 7. Render final cartoon output canvas and calculate color counts
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = width;
  outputCanvas.height = height;
  const outputCtx = outputCanvas.getContext("2d");
  if (!outputCtx) throw new Error("Failed to initialize output canvas context");

  const cartoonImgData = outputCtx.createImageData(width, height);
  const cartoonPixels = cartoonImgData.data;
  const colorCounts = new Array(PALETTE_COLORS.length).fill(0);

  for (let i = 0; i < totalPixels; i++) {
    const palIdx = colorIndices[i];
    const pxIdx = i * 4;

    colorCounts[palIdx]++;
    const palColor = PALETTE_COLORS[palIdx];

    cartoonPixels[pxIdx] = palColor.rgba[0];
    cartoonPixels[pxIdx + 1] = palColor.rgba[1];
    cartoonPixels[pxIdx + 2] = palColor.rgba[2];
    cartoonPixels[pxIdx + 3] = palColor.rgba[3];
  }

  outputCtx.putImageData(cartoonImgData, 0, 0);
  const cartoonDataUrl = outputCanvas.toDataURL("image/png");

  // 8. Build connected component region map (islands)
  const regionMap = new Int32Array(totalPixels).fill(-1);
  const regionExpectedColors: Record<number, string> = {};
  const visited = new Uint8Array(totalPixels);
  let nextRegionId = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (visited[idx]) continue;

      const colorIdx = colorIndices[idx];
      const regionId = nextRegionId++;
      regionExpectedColors[regionId] = PALETTE_COLORS[colorIdx].hexCode;
      const queue = [x, y];
      visited[idx] = 1;

      let head = 0;
      while (head < queue.length) {
        const qx = queue[head++];
        const qy = queue[head++];
        const qIdx = qy * width + qx;
        regionMap[qIdx] = regionId;

        const neighbors = [
          [qx + 1, qy],
          [qx - 1, qy],
          [qx, qy + 1],
          [qx, qy - 1],
        ];

        for (const [nx, ny] of neighbors) {
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nIdx = ny * width + nx;
            if (!visited[nIdx] && colorIndices[nIdx] === colorIdx) {
              visited[nIdx] = 1;
              queue.push(nx, ny);
            }
          }
        }
      }
    }
  }

  // 9. Calculate color statistics for used colors
  const colorStats: UsedColorStat[] = PALETTE_COLORS.map((color, index) => {
    const count = colorCounts[index];
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
    regionMapData: Array.from(regionMap),
    regionExpectedColors,
  };
}
