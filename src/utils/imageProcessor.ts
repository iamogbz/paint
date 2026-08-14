import { ProcessedArtwork, UsedColorStat, PaletteColor } from "../types";
import { generateDynamicPalette, ColorQuantizer, getPerceptualColorDistance } from "./colorUtils";

export const MIN_SIZE_PX = 400;
export const MAX_SIZE_PX = 1200;

// Base values designed for an 800px image, will be scaled relative to the actual image area
export const BASE_ISLAND_AREA = 32;
export const BASE_ISLAND_BBOX_DIM = 4; // To help eliminate thin strips

const CARDINAL_NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function calculateTargetDimensions(
  width: number,
  height: number,
): { width: number; height: number; scale: number } {
  const maxDim = Math.max(width, height);
  let scale = 1.0;

  if (maxDim > MAX_SIZE_PX) {
    scale = MAX_SIZE_PX / maxDim;
  } else if (maxDim < MIN_SIZE_PX) {
    scale = MIN_SIZE_PX / maxDim;
  }

  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    scale,
  };
}

/**
 * Fast Bilateral Filter using separable approximation and precomputed weights.
 */
function applyBilateralFilter(
  srcPixels: Uint8ClampedArray | Uint8Array,
  dstPixels: Uint8ClampedArray,
  tempPixels: Float32Array,
  width: number,
  height: number,
  r: number,
  spatialWeights: Float32Array,
  rangeWeights: Float32Array
) {
  // Horizontal pass
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const idx = (rowOffset + x) * 4;
      const cR = srcPixels[idx];
      const cG = srcPixels[idx + 1];
      const cB = srcPixels[idx + 2];
      const cA = srcPixels[idx + 3];

      let sumR = 0, sumG = 0, sumB = 0, sumW = 0;
      const xMin = Math.max(0, x - r);
      const xMax = Math.min(width - 1, x + r);

      for (let nx = xMin; nx <= xMax; nx++) {
        const nIdx = (rowOffset + nx) * 4;
        const nR = srcPixels[nIdx];
        const nG = srcPixels[nIdx + 1];
        const nB = srcPixels[nIdx + 2];

        const dR = nR - cR;
        const dG = nG - cG;
        const dB = nB - cB;
        
        const distSq = dR * dR + dG * dG + dB * dB;
        const weight = spatialWeights[nx - x + r] * rangeWeights[distSq];

        sumR += nR * weight;
        sumG += nG * weight;
        sumB += nB * weight;
        sumW += weight;
      }

      tempPixels[idx] = sumR / sumW;
      tempPixels[idx + 1] = sumG / sumW;
      tempPixels[idx + 2] = sumB / sumW;
      tempPixels[idx + 3] = cA;
    }
  }

  // Vertical pass
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const idx = (rowOffset + x) * 4;
      const cR = tempPixels[idx];
      const cG = tempPixels[idx + 1];
      const cB = tempPixels[idx + 2];
      const cA = tempPixels[idx + 3];

      let sumR = 0, sumG = 0, sumB = 0, sumW = 0;
      const yMin = Math.max(0, y - r);
      const yMax = Math.min(height - 1, y + r);

      for (let ny = yMin; ny <= yMax; ny++) {
        const nIdx = (ny * width + x) * 4;
        const nR = tempPixels[nIdx];
        const nG = tempPixels[nIdx + 1];
        const nB = tempPixels[nIdx + 2];

        const dR = nR - cR;
        const dG = nG - cG;
        const dB = nB - cB;
        
        let distSq = Math.round(dR * dR + dG * dG + dB * dB);
        if (distSq > 195075) distSq = 195075;
        if (distSq < 0) distSq = 0;

        const weight = spatialWeights[ny - y + r] * rangeWeights[distSq];

        sumR += nR * weight;
        sumG += nG * weight;
        sumB += nB * weight;
        sumW += weight;
      }

      dstPixels[idx] = sumR / sumW;
      dstPixels[idx + 1] = sumG / sumW;
      dstPixels[idx + 2] = sumB / sumW;
      dstPixels[idx + 3] = cA;
    }
  }
}

/**
 * 3x3 or larger Majority Neighborhood Filter to round jaggies and eliminate stray pixel noise.
 */
function applyMajoritySmoothing(
  colorIndices: Int16Array,
  copyIndices: Int16Array,
  width: number,
  height: number,
  r: number,
  counts: Uint16Array
) {
  copyIndices.set(colorIndices);

  for (let y = r; y < height - r; y++) {
    const rowIdx = y * width;
    for (let x = r; x < width - r; x++) {
      const idx = rowIdx + x;
      const centerVal = copyIndices[idx];
      
      let maxCount = 0;
      let dominantVal = centerVal;

      for (let dy = -r; dy <= r; dy++) {
        const nRow = (y + dy) * width;
        for (let dx = -r; dx <= r; dx++) {
          const nVal = copyIndices[nRow + (x + dx)];
          const c = counts[nVal] + 1;
          counts[nVal] = c;
          if (c > maxCount) {
            maxCount = c;
            dominantVal = nVal;
          }
        }
      }

      colorIndices[idx] = dominantVal;

      // Fast clear only the used counts
      for (let dy = -r; dy <= r; dy++) {
        const nRow = (y + dy) * width;
        for (let dx = -r; dx <= r; dx++) {
          counts[copyIndices[nRow + (x + dx)]] = 0;
        }
      }
    }
  }
}

export function eliminateSmallIslands(
  colorIndices: Int16Array,
  width: number,
  height: number,
  paletteColors: PaletteColor[],
  minArea: number,
  minBboxDim: number
) {
  const totalPixels = width * height;
  const numPaletteColors = paletteColors?.length || 0;
  const colorDistMatrix: Float32Array | null =
    numPaletteColors > 0 ? new Float32Array(numPaletteColors * numPaletteColors) : null;

  if (colorDistMatrix && paletteColors) {
    for (let i = 0; i < numPaletteColors; i++) {
      for (let j = 0; j < numPaletteColors; j++) {
        colorDistMatrix[i * numPaletteColors + j] = getPerceptualColorDistance(
          paletteColors[i].rgba,
          paletteColors[j].rgba
        );
      }
    }
  }

  for (let pass = 0; pass < 3; pass++) {
    const visited = new Uint8Array(totalPixels);
    const queue = new Int32Array(totalPixels * 2);
    const smallIslands: { colorIdx: number; area: number; pixels: Int32Array }[] = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (visited[idx]) continue;

        const colorIdx = colorIndices[idx];
        let tail = 0;
        queue[tail++] = x;
        queue[tail++] = y;
        visited[idx] = 1;

        let head = 0;
        let minX = x;
        let maxX = x;
        let minY = y;
        let maxY = y;

        while (head < tail) {
          const cx = queue[head++];
          const cy = queue[head++];

          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          for (const [dx, dy] of CARDINAL_NEIGHBORS) {
            const nx = cx + dx;
            const ny = cy + dy;

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

        // Eliminate if too small, or if extremely thin relative to its area
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
  const { width, height, scale } = calculateTargetDimensions(img.width, img.height);
  const totalPixels = width * height;

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

  // Compute adaptive radii and sigmas based on the resolution relative to 800x800
  const sizeRatio = Math.max(width, height) / 800;
  
  // High contrast and color grouping with larger radius Bilateral Filter
  const passCount = 4;
  const filterRadius = Math.max(2, Math.round(3 * sizeRatio));
  const spatialSigma = filterRadius * 0.8;
  const rangeSigma = 45; // High range sigma aggressively flattens small color variations

  const r = Math.max(1, Math.round(filterRadius));
  const twoSpatialSigmaSq = 2 * Math.max(0.1, spatialSigma) * Math.max(0.1, spatialSigma);
  const twoRangeSigmaSq = 2 * Math.max(0.1, rangeSigma) * Math.max(0.1, rangeSigma);

  const spatialWeights = new Float32Array(r * 2 + 1);
  for (let d = -r; d <= r; d++) {
    spatialWeights[d + r] = Math.exp(-(d * d) / twoSpatialSigmaSq);
  }

  const rangeWeights = new Float32Array(195076);
  for (let i = 0; i <= 195075; i++) {
    rangeWeights[i] = Math.exp(-i / twoRangeSigmaSq);
  }

  let currentPixels: Uint8ClampedArray | Uint8Array = rawPixels;
  let nextPixels = new Uint8ClampedArray(rawPixels.length);
  const tempPixels = new Float32Array(rawPixels.length);

  for (let i = 0; i < passCount; i++) {
    applyBilateralFilter(
      currentPixels,
      nextPixels,
      tempPixels,
      width,
      height,
      r,
      spatialWeights,
      rangeWeights
    );
    const t = currentPixels;
    currentPixels = nextPixels;
    nextPixels = (t === rawPixels) ? new Uint8ClampedArray(rawPixels.length) : (t as any);
  }
  const smoothedPixels = currentPixels;
  
  // Generate Dynamic Palette allowing up to 128 colors
  const generatedColors = generateDynamicPalette(smoothedPixels, 128);
  const paletteColors = [transparentColor, ...generatedColors];
  const quantizer = new ColorQuantizer(paletteColors);

  // Quantize pixels
  const colorIndices = new Int16Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    const pxIdx = i * 4;
    const r = smoothedPixels[pxIdx];
    const g = smoothedPixels[pxIdx + 1];
    const b = smoothedPixels[pxIdx + 2];
    const a = smoothedPixels[pxIdx + 3];

    colorIndices[i] = quantizer.findClosestPaletteIndexFast(r, g, b, a);
  }

  // Majority Smoothing to round jaggies and thin strips
  const smoothingPasses = 3;
  const smoothingRadius = Math.max(1, Math.round(2 * sizeRatio));
  const sr = Math.max(1, Math.round(smoothingRadius));
  const copyIndices = new Int16Array(colorIndices.length);
  const countsBuffer = new Uint16Array(256);
  
  for (let i = 0; i < smoothingPasses; i++) {
    applyMajoritySmoothing(colorIndices, copyIndices, width, height, sr, countsBuffer);
  }

  // Island Pruning: Definition of 'tiny' scales with image size squared
  const pixelRatio = totalPixels / (800 * 800);
  const scaledMinArea = Math.max(4, Math.round(BASE_ISLAND_AREA * pixelRatio));
  const scaledMinBbox = Math.max(2, Math.round(BASE_ISLAND_BBOX_DIM * Math.sqrt(pixelRatio)));

  eliminateSmallIslands(
    colorIndices,
    width,
    height,
    paletteColors,
    scaledMinArea,
    scaledMinBbox
  );

  // Render final cartoon output canvas and calculate color counts
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

  // Build connected component region map (islands)
  const regionMap = new Int32Array(totalPixels).fill(-1);
  const regionExpectedColors: Record<number, string> = {};
  const visited = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels * 2);
  let nextRegionId = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (visited[idx]) continue;

      const colorIdx = colorIndices[idx];
      const regionId = nextRegionId++;
      regionExpectedColors[regionId] = paletteColors[colorIdx].hexCode;

      let tail = 0;
      queue[tail++] = x;
      queue[tail++] = y;
      visited[idx] = 1;

      let head = 0;
      while (head < tail) {
        const qx = queue[head++];
        const qy = queue[head++];
        const qIdx = qy * width + qx;
        regionMap[qIdx] = regionId;

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
    }
  }

  // Calculate color statistics for used colors
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
    regionMapData: regionMap,
    regionExpectedColors,
  };
}
