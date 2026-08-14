import { ProcessedArtwork, UsedColorStat, PaletteColor } from "../types";
import { generateDynamicPalette, ColorQuantizer, getPerceptualColorDistance } from "./colorUtils";

export const MIN_ISLAND_AREA = 32;
export const MIN_ISLAND_BBOX_DIM = 0;
export const MAX_ISLAND_PRUNING_PASSES = 50;

const CARDINAL_NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

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
 * Prunes connected sets of pixels (islands) that meet any of the conditions:
 * - Surface area < minArea (default 256)
 * - Bounding box width < minBboxDim OR height < minBboxDim (default 8px)
 *
 * To preserve detail, small islands merge into the color in their surrounding
 * that is perceptually closest to their own color.
 * Passes continue iteratively until there are no islands meeting the conditions.
 */
export function eliminateSmallIslands(
  colorIndices: Int16Array,
  width: number,
  height: number,
  paletteColors?: PaletteColor[],
  minArea = MIN_ISLAND_AREA,
  minBboxDim = MIN_ISLAND_BBOX_DIM,
  maxPasses = MAX_ISLAND_PRUNING_PASSES
) {
  const totalPixels = width * height;
  const visited = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels * 2);

  const numPaletteColors = paletteColors?.length || 0;
  const colorDistMatrix: Float32Array | null =
    numPaletteColors > 0 ? new Float32Array(numPaletteColors * numPaletteColors) : null;

  if (colorDistMatrix && paletteColors) {
    for (let i = 0; i < numPaletteColors; i++) {
      for (let j = i; j < numPaletteColors; j++) {
        const dist = getPerceptualColorDistance(
          paletteColors[i].rgba,
          paletteColors[j].rgba
        );
        colorDistMatrix[i * numPaletteColors + j] = dist;
        colorDistMatrix[j * numPaletteColors + i] = dist;
      }
    }
  }

  for (let pass = 0; pass < maxPasses; pass++) {
    visited.fill(0);
    const smallIslands: Array<{
      colorIdx: number;
      area: number;
      pixels: Int32Array;
    }> = [];

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

        let minX = x;
        let maxX = x;
        let minY = y;
        let maxY = y;

        while (head < tail) {
          const qx = queue[head++];
          const qy = queue[head++];

          if (qx < minX) minX = qx;
          if (qx > maxX) maxX = qx;
          if (qy < minY) minY = qy;
          if (qy > maxY) maxY = qy;

          for (const [dx, dy] of CARDINAL_NEIGHBORS) {
            const nx = qx + dx;
            const ny = qy + dy;
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

        const area = tail / 2;
        const bboxWidth = maxX - minX + 1;
        const bboxHeight = maxY - minY + 1;

        if (area < minArea || bboxWidth < minBboxDim || bboxHeight < minBboxDim) {
          const pixels = new Int32Array(tail);
          for (let i = 0; i < tail; i++) {
            pixels[i] = queue[i];
          }
          smallIslands.push({ colorIdx, area, pixels });
        }
      }
    }

    if (smallIslands.length === 0) {
      break;
    }

    // Sort small islands by area ascending so smaller fragments merge into larger structures first
    smallIslands.sort((a, b) => a.area - b.area);

    let prunedCount = 0;

    for (const isl of smallIslands) {
      const tail = isl.pixels.length;
      const islandPixelIndices = new Set<number>();
      for (let i = 0; i < tail; i += 2) {
        islandPixelIndices.add(isl.pixels[i + 1] * width + isl.pixels[i]);
      }

      const surroundingColorCounts = new Map<number, number>();

      for (let i = 0; i < tail; i += 2) {
        const rx = isl.pixels[i];
        const ry = isl.pixels[i + 1];

        for (const [dx, dy] of CARDINAL_NEIGHBORS) {
          const nx = rx + dx;
          const ny = ry + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nIdx = ny * width + nx;
            if (!islandPixelIndices.has(nIdx)) {
              const extColor = colorIndices[nIdx];
              if (extColor !== isl.colorIdx) {
                surroundingColorCounts.set(
                  extColor,
                  (surroundingColorCounts.get(extColor) || 0) + 1
                );
              }
            }
          }
        }
      }

      if (surroundingColorCounts.size === 0) {
        continue;
      }

      // Pick the surrounding color closest to the island's color to preserve detail
      let bestColor = -1;
      let minDistance = Infinity;
      let maxCount = -1;

      for (const [extColor, count] of surroundingColorCounts.entries()) {
        let dist = 0;
        if (colorDistMatrix && isl.colorIdx < numPaletteColors && extColor < numPaletteColors) {
          dist = colorDistMatrix[isl.colorIdx * numPaletteColors + extColor];
        }

        if (dist < minDistance - 1e-4) {
          minDistance = dist;
          bestColor = extColor;
          maxCount = count;
        } else if (Math.abs(dist - minDistance) <= 1e-4 && count > maxCount) {
          bestColor = extColor;
          maxCount = count;
        }
      }

      if (bestColor !== -1) {
        prunedCount++;
        for (let i = 0; i < tail; i += 2) {
          const rx = isl.pixels[i];
          const ry = isl.pixels[i + 1];
          colorIndices[ry * width + rx] = bestColor;
        }
      }
    }

    if (prunedCount === 0) {
      break;
    }
  }
}

export async function processImageToCartoonPalette(
  imageSrc: string,
  artworkName: string
): Promise<ProcessedArtwork> {

  const transparentColor: PaletteColor = { hexCode: "#00000000", rgba: [0, 0, 0, 0] };


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
  // multiple passes with stronger spatial and range sigmas to aggressively
  // flatten noise while preserving sharp, crisp object boundaries.
  let smoothedPixels = rawPixels;
  const passCount = 4;
  for (let i = 0; i < passCount; i++) {
    smoothedPixels = applyBilateralFilter(smoothedPixels, width, height, 2, 25, 2);
  }

    // 3.5 Generate Dynamic Palette
  const generatedColors = generateDynamicPalette(smoothedPixels, 24);
  const paletteColors = [transparentColor, ...generatedColors];
  const quantizer = new ColorQuantizer(paletteColors);

  // 4. Quantize pixels to nearest Oklab palette color
  const totalPixels = width * height;
  const colorIndices = new Int16Array(totalPixels);

  for (let i = 0; i < totalPixels; i++) {
    const pxIdx = i * 4;
    const r = smoothedPixels[pxIdx];
    const g = smoothedPixels[pxIdx + 1];
    const b = smoothedPixels[pxIdx + 2];
    const a = smoothedPixels[pxIdx + 3];

    const closest = quantizer.findClosestPaletteColorFast(r, g, b, a);
    const palIdx = paletteColors.findIndex((c) => c.hexCode === closest.hexCode);
    colorIndices[i] = palIdx >= 0 ? palIdx : 0;
  }

  // 5. Apply Majority Smoothing passes to round staircases and clean noise
  const smoothingPasses = 2;
  for (let i = 0; i < smoothingPasses; i++) {
    applyMajoritySmoothing(colorIndices, width, height);
  }

  // 6. Connected Island Pruning (continues passes until no small islands remain)
  eliminateSmallIslands(
    colorIndices,
    width,
    height,
    paletteColors,
    MIN_ISLAND_AREA,
    MIN_ISLAND_BBOX_DIM
  );

  // 7. Render final cartoon output canvas and calculate color counts
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = width;
  outputCanvas.height = height;
  const outputCtx = outputCanvas.getContext("2d");
  if (!outputCtx) throw new Error("Failed to initialize output canvas context");

  const cartoonImgData = outputCtx.createImageData(width, height);
  const cartoonPixels = cartoonImgData.data;
  const colorCounts = new Array(paletteColors.length).fill(0);

  for (let i = 0; i < totalPixels; i++) {
    const palIdx = colorIndices[i];
    const pxIdx = i * 4;

    colorCounts[palIdx]++;
    const palColor = paletteColors[palIdx];

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
      regionExpectedColors[regionId] = paletteColors[colorIdx].hexCode;
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
  const colorStats: UsedColorStat[] = paletteColors.map((color, index) => {
    const count = colorCounts[index];
    const percentage = Math.ceil((count / totalPixels) * 100);
    return {
      color,
      count,
      percentage,
    };
  })

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
