import {
  COLOR_COLLAPSE_DELTA_E_THRESHOLD,
  FALLBACK_IMAGE_SIZE_PX,
  FILLABLE_SVG_ELEMENTS_SELECTOR,
  MIN_REGION_BBOX_FILL_RATIO,
  MIN_REGION_DIMENSION_PX,
  MIN_REGION_DIMENSION_RATIO,
  PAINTABLE_REGION_HEX,
  SMALL_REGION_SURFACE_AREA_RATIO,
  TINY_REGION_SURFACE_AREA,
  TRANSPARENT_HEX,
  TRUE_BLACK_HEX,
} from "./constants.js";
import { processingImageHeightSignal, processingImageWidthSignal } from "../state/store.js";
import { ProcessedArtwork } from "../types";
import { deltaE, getHexCode, hexToRgb, normalizeHex, rgbToHex, rgbToLab } from "./color.js";
import { cleanSvgStr, getSvgDimensions, parseSVG, SVGFillableElement, XML_NS } from "./html.js";
import { Options } from "@visioncortex/vtracer";

let _worker: Worker | null = null;
let _msgId = 0;
const _callbacks = new Map<number, { resolve: Function; reject: Function }>();

function getWorker() {
  if (!_worker) {
    _worker = new Worker(new URL("./imageProcessorWorker.ts", import.meta.url), { type: "module" });
    _worker.onmessage = (e) => {
      const { id, type, payload } = e.data;
      const cb = _callbacks.get(id);
      if (cb) {
        if (type === "SUCCESS") cb.resolve(payload);
        else cb.reject(new Error(payload));
        _callbacks.delete(id);
      }
    };
    _worker.onerror = (err) => {
      console.error("Worker error encountered:", err);
      _callbacks.forEach((cb) => cb.reject(new Error("Worker error occurred during image processing")));
      _callbacks.clear();
      _worker?.terminate();
      _worker = null;
    };
  }
  return _worker;
}

function runInWorker(type: string, payload: any, transferList?: Transferable[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = ++_msgId;
    _callbacks.set(id, { resolve, reject });
    try {
      const worker = getWorker();
      if (transferList && transferList.length > 0) {
        worker.postMessage({ id, type, payload }, transferList);
      } else {
        worker.postMessage({ id, type, payload });
      }
    } catch (err) {
      _callbacks.delete(id);
      reject(err);
    }
  });
}

async function loadImage(src: string): Promise<Readonly<{ data: HTMLImageElement | null; format: string | null }>> {
  const response = await fetch(src);
  const contentType = response.headers.get("content-type");
  let blob: Blob | null = null;
  if (contentType && contentType.includes("image/")) {
    const isSvg = contentType.includes("image/svg+xml");
    if (isSvg) {
      const svgElement = parseSVG<SVGSVGElement>(await response.text());
      if (svgElement) {
        const dimensions = getSvgDimensions(svgElement);
        // scale to fixed resolution values
        const scale = FALLBACK_IMAGE_SIZE_PX / Math.min(dimensions.width, dimensions.height);
        const targetWidth = dimensions.width * scale;
        const targetHeight = dimensions.height * scale;
        svgElement.setAttribute("width", targetWidth.toString());
        svgElement.setAttribute("height", targetHeight.toString());
        processingImageWidthSignal.set(targetWidth);
        processingImageHeightSignal.set(targetHeight);
        blob = new Blob([svgElement.outerHTML], { type: contentType });
      }
    } else {
      blob = await response.blob();
    }
    if (!blob) {
      return {
        format: contentType,
        data: null,
      } as const;
    }

    const validBlob = blob;
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      const objectUrl = URL.createObjectURL(validBlob);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        let targetWidth = FALLBACK_IMAGE_SIZE_PX;
        let targetHeight = FALLBACK_IMAGE_SIZE_PX;

        if (!isSvg) {
          targetWidth = img.naturalWidth;
          targetHeight = img.naturalHeight;
          const maxDim = Math.max(targetWidth, targetHeight);
          if (maxDim > FALLBACK_IMAGE_SIZE_PX) {
            const scale = FALLBACK_IMAGE_SIZE_PX / maxDim;
            targetWidth = targetWidth * scale;
            targetHeight = targetHeight * scale;
          }
          processingImageWidthSignal.set(targetWidth);
          processingImageHeightSignal.set(targetHeight);
        }

        resolve({
          format: contentType,
          data: img,
        } as const);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        processingImageWidthSignal.set(FALLBACK_IMAGE_SIZE_PX);
        processingImageHeightSignal.set(FALLBACK_IMAGE_SIZE_PX);
        resolve({
          format: contentType,
          data: null,
        } as const);
      };
      img.src = objectUrl;
    });
  } else {
    return {
      format: contentType,
      data: null,
    } as const;
  }
}

/**
 * Multi-step halving downscaler to target dimensions (capped at FALLBACK_IMAGE_SIZE_PX).
 * Downscaling incrementally in halves prevents aliasing, blur, and pixelation artifacts.
 */
function downscaleCanvasMultiStep(source: HTMLCanvasElement | HTMLImageElement, targetWidth: number, targetHeight: number): HTMLCanvasElement {
  let currentWidth = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  let currentHeight = source instanceof HTMLImageElement ? source.naturalHeight : source.height;

  let currentCanvas = document.createElement("canvas");
  currentCanvas.width = currentWidth;
  currentCanvas.height = currentHeight;
  let ctx = currentCanvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Fill canvas with white background for bitmap images in case of transparency
  ctx.fillStyle = PAINTABLE_REGION_HEX;
  ctx.fillRect(0, 0, currentWidth, currentHeight);
  ctx.drawImage(source, 0, 0);

  // Halving loop when current size is > 1.5x target
  while (currentWidth > targetWidth * 1.5 || currentHeight > targetHeight * 1.5) {
    const nextWidth = Math.max(targetWidth, Math.floor(currentWidth / 2));
    const nextHeight = Math.max(targetHeight, Math.floor(currentHeight / 2));

    const nextCanvas = document.createElement("canvas");
    nextCanvas.width = nextWidth;
    nextCanvas.height = nextHeight;
    const nextCtx = nextCanvas.getContext("2d", { willReadFrequently: true })!;
    nextCtx.imageSmoothingEnabled = true;
    nextCtx.imageSmoothingQuality = "high";
    nextCtx.drawImage(currentCanvas, 0, 0, currentWidth, currentHeight, 0, 0, nextWidth, nextHeight);

    // Free previous canvas backing buffer immediately
    currentCanvas.width = 0;
    currentCanvas.height = 0;

    currentWidth = nextWidth;
    currentHeight = nextHeight;
    currentCanvas = nextCanvas;
  }

  // Final scale step if dimensions don't match target exact
  if (currentWidth !== targetWidth || currentHeight !== targetHeight) {
    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = targetWidth;
    finalCanvas.height = targetHeight;
    const finalCtx = finalCanvas.getContext("2d", { willReadFrequently: true })!;
    finalCtx.imageSmoothingEnabled = true;
    finalCtx.imageSmoothingQuality = "high";
    finalCtx.drawImage(currentCanvas, 0, 0, currentWidth, currentHeight, 0, 0, targetWidth, targetHeight);

    // Free intermediate canvas backing buffer
    currentCanvas.width = 0;
    currentCanvas.height = 0;

    return finalCanvas;
  }

  return currentCanvas;
}

/**
 * Samples pixel colors from the original bitmap for each SVG region using an offscreen ID-map pass,
 * detects direct topological adjacency (touching boundaries), and clusters perceptually similar colors
 * while strictly ensuring that directly adjacent regions receive distinct palette colors.
 */
function sampleAndClusterRegionColors(
  origImgData: ImageData,
  width: number,
  height: number,
  fillableElements: SVGFillableElement[]
): {
  regionColors: Map<string, string>;
  adjacencyGraph: Map<string, Set<string>>;
  regionPixelCounts: Map<string, number>;
} {
  const regionCount = fillableElements.length;
  const regionColors = new Map<string, string>();
  const adjacencyGraph = new Map<string, Set<string>>();
  const regionPixelCounts = new Map<string, number>();

  fillableElements.forEach((_, idx) => {
    adjacencyGraph.set(`region-${idx}`, new Set<string>());
  });

  if (regionCount === 0) {
    return { regionColors, adjacencyGraph, regionPixelCounts };
  }

  // 1. Offscreen ID-map rendering canvas
  const idCanvas = document.createElement("canvas");
  idCanvas.width = width;
  idCanvas.height = height;
  const idCtx = idCanvas.getContext("2d", { willReadFrequently: true });
  if (!idCtx) throw new Error("Failed to create offscreen ID canvas context");

  idCtx.imageSmoothingEnabled = false;

  // Render each fillable path into the ID canvas with its 1-based index encoded as RGB
  fillableElements.forEach((elem, idx) => {
    const regionNum = idx + 1; // 1-based ID
    const r = regionNum & 0xff;
    const g = (regionNum >> 8) & 0xff;
    const b = (regionNum >> 16) & 0xff;
    const colorStr = `rgb(${r},${g},${b})`;

    const tag = elem.tagName.toLowerCase();
    if (tag === "path") {
      const d = elem.getAttribute("d");
      if (d) {
        const path2d = new Path2D(d);
        const fillRule = elem.getAttribute("fill-rule") === "evenodd" ? "evenodd" : "nonzero";
        idCtx.fillStyle = colorStr;
        idCtx.fill(path2d, fillRule);
      }
    } else if (tag === "rect") {
      const x = parseFloat(elem.getAttribute("x") || "0") || 0;
      const y = parseFloat(elem.getAttribute("y") || "0") || 0;
      const w = parseFloat(elem.getAttribute("width") || "0") || 0;
      const h = parseFloat(elem.getAttribute("height") || "0") || 0;
      if (w > 0 && h > 0) {
        idCtx.fillStyle = colorStr;
        idCtx.fillRect(x, y, w, h);
      }
    } else if (tag === "circle") {
      const cx = parseFloat(elem.getAttribute("cx") || "0") || 0;
      const cy = parseFloat(elem.getAttribute("cy") || "0") || 0;
      const rVal = parseFloat(elem.getAttribute("r") || "0") || 0;
      if (rVal > 0) {
        idCtx.fillStyle = colorStr;
        idCtx.beginPath();
        idCtx.arc(cx, cy, rVal, 0, Math.PI * 2);
        idCtx.fill();
      }
    } else if (tag === "ellipse") {
      const cx = parseFloat(elem.getAttribute("cx") || "0") || 0;
      const cy = parseFloat(elem.getAttribute("cy") || "0") || 0;
      const rx = parseFloat(elem.getAttribute("rx") || "0") || 0;
      const ry = parseFloat(elem.getAttribute("ry") || "0") || 0;
      if (rx > 0 && ry > 0) {
        idCtx.fillStyle = colorStr;
        idCtx.beginPath();
        idCtx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        idCtx.fill();
      }
    } else if (tag === "polygon" || tag === "polyline") {
      const pointsAttr = elem.getAttribute("points");
      if (pointsAttr) {
        const nums = pointsAttr
          .trim()
          .split(/[\s,]+/)
          .map(Number)
          .filter((n) => !isNaN(n));
        if (nums.length >= 4) {
          idCtx.fillStyle = colorStr;
          idCtx.beginPath();
          idCtx.moveTo(nums[0], nums[1]);
          for (let p = 2; p < nums.length; p += 2) {
            idCtx.lineTo(nums[p], nums[p + 1]);
          }
          idCtx.closePath();
          idCtx.fill();
        }
      }
    }
  });

  const idImgData = idCtx.getImageData(0, 0, width, height);
  // Free offscreen canvas memory immediately after extracting pixel buffer
  idCanvas.width = 0;
  idCanvas.height = 0;

  const id32 = new Uint32Array(idImgData.data.buffer);
  const orig32 = new Uint32Array(origImgData.data.buffer);

  // Pixel color accumulators for each 1-based region ID
  const sumR = new Float64Array(regionCount + 1);
  const sumG = new Float64Array(regionCount + 1);
  const sumB = new Float64Array(regionCount + 1);
  const pixelCounts = new Uint32Array(regionCount + 1);
  const touchingPairs = new Set<number>();

  // 2. Scan pixels: accumulate colors and discover topological 4-connected adjacencies
  const totalPixels = width * height;
  for (let idx = 0; idx < totalPixels; idx++) {
    const idPixel = id32[idx];
    const alpha = idPixel >>> 24;
    if (alpha < 128) continue;

    const regionNum = idPixel & 0x00ffffff;
    if (regionNum > 0 && regionNum <= regionCount) {
      const origPixel = orig32[idx];
      sumR[regionNum] += origPixel & 0xff;
      sumG[regionNum] += (origPixel >> 8) & 0xff;
      sumB[regionNum] += (origPixel >> 16) & 0xff;
      pixelCounts[regionNum]++;

      const x = idx % width;
      // Adjacency check to the right
      if (x + 1 < width) {
        const rightPixel = id32[idx + 1];
        if (rightPixel >>> 24 >= 128) {
          const rightNum = rightPixel & 0x00ffffff;
          if (rightNum > 0 && rightNum <= regionCount && rightNum !== regionNum) {
            const minNum = regionNum < rightNum ? regionNum : rightNum;
            const maxNum = regionNum < rightNum ? rightNum : regionNum;
            touchingPairs.add(minNum * 1000000 + maxNum);
          }
        }
      }

      // Adjacency check downwards
      const downIdx = idx + width;
      if (downIdx < totalPixels) {
        const downPixel = id32[downIdx];
        if (downPixel >>> 24 >= 128) {
          const downNum = downPixel & 0x00ffffff;
          if (downNum > 0 && downNum <= regionCount && downNum !== regionNum) {
            const minNum = regionNum < downNum ? regionNum : downNum;
            const maxNum = regionNum < downNum ? downNum : regionNum;
            touchingPairs.add(minNum * 1000000 + maxNum);
          }
        }
      }
    }
  }

  // Populate adjacency graph from unique touching pairs
  touchingPairs.forEach((packed) => {
    const minNum = Math.floor(packed / 1000000);
    const maxNum = packed % 1000000;
    const idA = `region-${minNum - 1}`;
    const idB = `region-${maxNum - 1}`;
    adjacencyGraph.get(idA)?.add(idB);
    adjacencyGraph.get(idB)?.add(idA);
  });

  // 3. Compute base sampled representative color for each region
  const rawRgbList: Array<{ id: string; r: number; g: number; b: number; count: number }> = [];

  for (let i = 1; i <= regionCount; i++) {
    const count = pixelCounts[i];
    const regionId = `region-${i - 1}`;
    regionPixelCounts.set(regionId, count);
    let r: number, g: number, b: number;

    if (count > 0) {
      r = Math.round(sumR[i] / count);
      g = Math.round(sumG[i] / count);
      b = Math.round(sumB[i] / count);
    } else {
      // Fallback for sub-pixel / thin vector paths: check element's existing fill first
      const elem = fillableElements[i - 1];
      const existingFill = elem.getAttribute("fill");
      let fallbackRgb: readonly [number, number, number, number] | null = null;
      if (existingFill && existingFill !== "none") {
        fallbackRgb = hexToRgb(getHexCode(existingFill));
      }

      if (fallbackRgb && fallbackRgb[3] > 0) {
        r = fallbackRgb[0];
        g = fallbackRgb[1];
        b = fallbackRgb[2];
      } else {
        let cx = Math.floor(width / 2);
        let cy = Math.floor(height / 2);
        try {
          const bbox = elem.getBBox();
          cx = Math.max(0, Math.min(width - 1, Math.floor(bbox.x + bbox.width / 2)));
          cy = Math.max(0, Math.min(height - 1, Math.floor(bbox.y + bbox.height / 2)));
        } catch (_) {}
        const fallbackIdx = cy * width + cx;
        const fallbackPixel = orig32[fallbackIdx];
        r = fallbackPixel & 0xff;
        g = (fallbackPixel >> 8) & 0xff;
        b = (fallbackPixel >> 16) & 0xff;
      }
    }
    rawRgbList.push({ id: regionId, r, g, b, count });
  }

  // 4. Color Clumping / Palette Clustering
  const regionLabs = rawRgbList.map((item) => rgbToLab(item.r, item.g, item.b));

  interface Cluster {
    rSum: number;
    gSum: number;
    bSum: number;
    totalPixels: number;
    avgR: number;
    avgG: number;
    avgB: number;
    avgLab: [number, number, number];
    assignedRegionIds: Set<string>;
  }

  const clusters: Cluster[] = [];
  const CLUSTER_DELTA_E_THRESHOLD = 9.0; // Perceptually similar colors cluster together

  // Sort regions by pixel count descending so larger key regions establish initial palette anchors
  const sortedIndices = rawRgbList.map((_, idx) => idx).sort((a, b) => rawRgbList[b].count - rawRgbList[a].count);

  for (const idx of sortedIndices) {
    const item = rawRgbList[idx];
    const lab = regionLabs[idx];

    let bestCluster: Cluster | null = null;
    let minDiff = Infinity;

    for (const cluster of clusters) {
      const diff = deltaE(lab, cluster.avgLab);
      if (diff < CLUSTER_DELTA_E_THRESHOLD && diff < minDiff) {
        minDiff = diff;
        bestCluster = cluster;
      }
    }

    const weight = Math.max(1, item.count);
    if (bestCluster) {
      bestCluster.assignedRegionIds.add(item.id);
      bestCluster.rSum += item.r * weight;
      bestCluster.gSum += item.g * weight;
      bestCluster.bSum += item.b * weight;
      bestCluster.totalPixels += weight;
      bestCluster.avgR = Math.round(bestCluster.rSum / bestCluster.totalPixels);
      bestCluster.avgG = Math.round(bestCluster.gSum / bestCluster.totalPixels);
      bestCluster.avgB = Math.round(bestCluster.bSum / bestCluster.totalPixels);
      bestCluster.avgLab = rgbToLab(bestCluster.avgR, bestCluster.avgG, bestCluster.avgB);
    } else {
      clusters.push({
        rSum: item.r * weight,
        gSum: item.g * weight,
        bSum: item.b * weight,
        totalPixels: weight,
        avgR: item.r,
        avgG: item.g,
        avgB: item.b,
        avgLab: lab,
        assignedRegionIds: new Set([item.id]),
      });
    }
  }

  // 5. Strict Pairwise Color Collapse: Unconditionally merge ALL clusters within COLOR_COLLAPSE_DELTA_E_THRESHOLD
  let merged = true;
  while (merged) {
    merged = false;
    let bestI = -1;
    let bestJ = -1;
    let minDistance = Infinity;

    for (let i = 0; i < clusters.length; i++) {
      const clusterA = clusters[i];
      for (let j = i + 1; j < clusters.length; j++) {
        const clusterB = clusters[j];
        const dist = deltaE(clusterA.avgLab, clusterB.avgLab);
        if (dist < minDistance && dist < COLOR_COLLAPSE_DELTA_E_THRESHOLD) {
          minDistance = dist;
          bestI = i;
          bestJ = j;
        }
      }
    }

    if (bestI !== -1) {
      const clusterA = clusters[bestI];
      const clusterB = clusters[bestJ];
      clusterA.rSum += clusterB.rSum;
      clusterA.gSum += clusterB.gSum;
      clusterA.bSum += clusterB.bSum;
      clusterA.totalPixels += clusterB.totalPixels;
      clusterA.avgR = Math.round(clusterA.rSum / clusterA.totalPixels);
      clusterA.avgG = Math.round(clusterA.gSum / clusterA.totalPixels);
      clusterA.avgB = Math.round(clusterA.bSum / clusterA.totalPixels);
      clusterA.avgLab = rgbToLab(clusterA.avgR, clusterA.avgG, clusterA.avgB);

      clusterB.assignedRegionIds.forEach((id) => clusterA.assignedRegionIds.add(id));
      clusters.splice(bestJ, 1);
      merged = true;
    }
  }

  // Update regionColors with collapsed average hex values
  for (const cluster of clusters) {
    const hex = rgbToHex(cluster.avgR, cluster.avgG, cluster.avgB);
    for (const regionId of cluster.assignedRegionIds) {
      regionColors.set(regionId, hex);
    }
  }

  return { regionColors, adjacencyGraph, regionPixelCounts };
}

function absolutizePathStart(d: string): string {
  d = d.trim();
  if (!d) return d;

  const firstChar = d.charAt(0);
  if (firstChar.toLowerCase() !== "m" && /[a-zA-Z]/.test(firstChar)) {
    d = "M" + d.substring(1);
  }

  if (!d.startsWith("m")) return d;

  // match 'm' followed by two floats.
  const match = d.match(/^m\s*([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s*(?:,|\s+)?\s*([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)([\s\S]*)$/);
  if (match) {
    let rest = match[3];
    // if rest doesn't start with a letter, insert relative lineto command
    if (rest.trim().length > 0 && !/^[a-zA-Z]/.test(rest.trim())) {
      rest = " l " + rest;
    }
    return `M ${match[1]} ${match[2]}${rest}`;
  }
  return d;
}

function mergeRegions(
  sourceId: string,
  targetId: string,
  regionsToRemove: Set<string>,
  regionBoundsMap: Map<string, { width: number; height: number; x: number; y: number }>,
  regionSVGElements: Map<string, SVGElement>,
  sampledData: any,
  regionPixelAreaMap: Map<string, number>
) {
  const el = regionSVGElements.get(sourceId);
  const targetEl = regionSVGElements.get(targetId);
  if (!el || !targetEl) return;

  const dA = absolutizePathStart(el.getAttribute("d") || "");
  const dB = absolutizePathStart(targetEl.getAttribute("d") || "");
  targetEl.setAttribute("d", `${dB} ${dA}`);

  // Update target bounding box in O(1)
  const b1 = regionBoundsMap.get(sourceId);
  const b2 = regionBoundsMap.get(targetId);
  if (b1 && b2) {
    const minX = Math.min(b1.x, b2.x);
    const minY = Math.min(b1.y, b2.y);
    const maxX = Math.max(b1.x + b1.width, b2.x + b2.width);
    const maxY = Math.max(b1.y + b1.height, b2.y + b2.height);
    b2.x = minX;
    b2.y = minY;
    b2.width = maxX - minX;
    b2.height = maxY - minY;
    targetEl.setAttribute("data-bbox", `${b2.width.toFixed(2)},${b2.height.toFixed(2)},${b2.x.toFixed(2)},${b2.y.toFixed(2)}`);
  }

  // Update target pixel surface area
  const srcPixelArea = regionPixelAreaMap.get(sourceId) || 0;
  const tgtPixelArea = regionPixelAreaMap.get(targetId) || 0;
  regionPixelAreaMap.set(targetId, srcPixelArea + tgtPixelArea);
  regionPixelAreaMap.delete(sourceId);

  // Remove small region
  el.remove();
  regionSVGElements.delete(sourceId);
  regionsToRemove.add(sourceId);
  regionBoundsMap.delete(sourceId);

  // Update adjacency graph
  if (sampledData && sampledData.adjacencyGraph && sampledData.adjacencyGraph.has(sourceId)) {
    const neighbors = sampledData.adjacencyGraph.get(sourceId)!;
    const targetNeighbors = sampledData.adjacencyGraph.get(targetId);
    if (targetNeighbors) {
      neighbors.forEach((n: string) => {
        if (n !== targetId && n !== sourceId && !regionsToRemove.has(n)) targetNeighbors.add(n);
      });
    }
    // Remove from other neighbors and redirect to target
    sampledData.adjacencyGraph.forEach((ns: Set<string>, nid: string) => {
      if (ns.has(sourceId)) {
        ns.delete(sourceId);
        if (nid !== targetId && !regionsToRemove.has(nid)) {
          ns.add(targetId);
        }
      }
    });
    sampledData.adjacencyGraph.delete(sourceId);
  }
}

export async function processImageToCartoonPalette(imageSrc: string, artworkName: string): Promise<ProcessedArtwork> {
  const maybeImage = await loadImage(imageSrc);

  let svgDoc: SVGSVGElement | null = null;
  let origImgDataForSampling: ImageData | null = null;
  // vtracer options for line/boundary extraction
  const options: Options = {
    /** default: color-cluster */
    clustering: "watershed",
    /** shapes disjoint with others */
    hierarchical: "cutout",
    /** Auto-quantize target color count */
    // maxColors: 24,
    watershedDetail: 255,
    /** If a pallete is defined maps colors to this */
    // palette: palette,
    /** Discard patches smaller than X px in size (0..=128) */
    filterSpeckle: 2,
    /** default: 8 (best) - Significant bits per RGB channel (1..=8)  */
    colorPrecision: 8,
    pathPrecision: 8,
    /** Color difference between gradient layers (0..=255) */
    // layerDifference: 16,
    /** Method for converting in to shapes. Values below only valid in spline */
    mode: "pixel",
    /** default: 60, Minimum Momentary Angle (in degrees) to be considered a corner (to be kept after smoothing) - Higher = smoother */
    cornerThreshold: 60,
    /** default: 4, Perform Iterative Subdivide Smooth until all segments are shorter than this length <3.5..=10> */
    lengthThreshold: 4.0,
    /** default: 45, Minimum Angle Displacement (in degrees) to be considered a cutting point between curves <0..=180> */
    spliceThreshold: 45,
    /** default: off, Simplify curves: fewest cubics within this tolerance in px (try 1–2.5) */
    simplify: 2,
    maxIterations: 10,
  };

  if (maybeImage.data) {
    const img = maybeImage.data;
    const imgWidth = processingImageWidthSignal.get();
    const imgHeight = processingImageHeightSignal.get();

    // Multi-step downscale to target dimensions
    const origCanvas = downscaleCanvasMultiStep(img, imgWidth, imgHeight);
    const origCtx = origCanvas.getContext("2d", { willReadFrequently: true });
    if (!origCtx) throw new Error("Failed to initialize canvas 2D context");

    const rawPixels = origCtx.getImageData(0, 0, imgWidth, imgHeight).data;
    const svgStr = await runInWorker("VECTORIZE", { rawPixels, imgWidth, imgHeight, options }, [rawPixels.buffer]);
    svgDoc = parseSVG<SVGSVGElement>(cleanSvgStr(svgStr));

    // Obtain pristine downscaled image data for sampling and free canvas memory
    origImgDataForSampling = origCtx.getImageData(0, 0, imgWidth, imgHeight);
    origCanvas.width = 0;
    origCanvas.height = 0;
  } else {
    console.error(maybeImage);
    throw new Error(maybeImage.format?.toString());
  }

  /** Region ID to the elements for creating brush stroke clipping paths */
  const regionSVGElements: Map<string, SVGElement> = new Map();
  const regionBoundsMap: Map<string, { width: number; height: number; x: number; y: number }> = new Map();

  const renderNode = svgDoc!.cloneNode(true) as NonNullable<typeof svgDoc>;
  const hiddenContainer = document.createElement("div");
  hiddenContainer.style.position = "absolute";
  hiddenContainer.style.visibility = "hidden";
  hiddenContainer.style.pointerEvents = "none";
  hiddenContainer.appendChild(renderNode);
  document.body.appendChild(hiddenContainer);

  const PRESERVE_ELEMENT_MARKER = "paint-preserve";
  const isFillableElemSelector = `:is(${FILLABLE_SVG_ELEMENTS_SELECTOR})` as typeof FILLABLE_SVG_ELEMENTS_SELECTOR;

  const preservedTreeElements = new Set<SVGElement>();
  const allFillableElements = Array.from(renderNode.querySelectorAll(isFillableElemSelector)).filter(
    (elem) => elem.closest("defs") === null
  ) as SVGFillableElement[];

  // Cache getBBox calls once to prevent repeated layout reflows during sorting
  const cachedBBoxes = new Map<SVGFillableElement, { width: number; height: number; x: number; y: number }>();
  allFillableElements.forEach((elem) => {
    try {
      const { width, height, x, y } = elem.getBBox();
      cachedBBoxes.set(elem, { width, height, x, y });
    } catch (_) {
      cachedBBoxes.set(elem, { width: 0, height: 0, x: 0, y: 0 });
    }
  });

  // Sort fillable elements so larger regions are background and smaller regions are on top for sampling and rendering
  allFillableElements.sort((a, b) => {
    const bA = cachedBBoxes.get(a)!;
    const bB = cachedBBoxes.get(b)!;
    return bB.width * bB.height - bA.width * bA.height;
  });
  allFillableElements.forEach((elem) => elem.parentElement?.appendChild(elem));

  // Determine fill colors: if bitmap, sample directly from pristine pixels with graph adjacency-constrained palette clumping
  const sampledData = origImgDataForSampling !== null ? sampleAndClusterRegionColors(origImgDataForSampling, processingImageWidthSignal.get(), processingImageHeightSignal.get(), allFillableElements) : null;
  origImgDataForSampling = null;

  const regionPixelAreaMap: Map<string, number> = new Map();

  allFillableElements.forEach((fillElement, key) => {
    const fillRegionId = `region-${key}`;
    fillElement.setAttribute("data-region-id", fillRegionId);
    fillElement.setAttribute(PRESERVE_ELEMENT_MARKER, "true");
    regionSVGElements.set(fillRegionId, fillElement);

    // preserve the tree of this path
    let topElem = fillElement.parentElement;
    while (topElem !== null && topElem instanceof SVGElement) {
      if (preservedTreeElements.has(topElem)) break;
      if (!topElem.hasAttribute(PRESERVE_ELEMENT_MARKER)) {
        topElem.setAttribute(PRESERVE_ELEMENT_MARKER, "true");
      }
      preservedTreeElements.add(topElem);
      topElem = topElem.parentElement;
    }

    const elementFill = fillElement.getAttribute("fill") || fillElement.computedStyleMap?.().get("fill")?.toString();
    const bbox = cachedBBoxes.get(fillElement) || { width: 0, height: 0, x: 0, y: 0 };
    regionBoundsMap.set(fillRegionId, { ...bbox });
    fillElement.setAttribute("data-bbox", `${bbox.width.toFixed(2)},${bbox.height.toFixed(2)},${bbox.x.toFixed(2)},${bbox.y.toFixed(2)}`);

    const pixelArea = sampledData?.regionPixelCounts?.get(fillRegionId) ?? bbox.width * bbox.height;
    regionPixelAreaMap.set(fillRegionId, pixelArea);

    if (elementFill === "none") {
      fillElement.setAttribute("assigned-fill", TRANSPARENT_HEX);
      fillElement.setAttribute("fill", TRANSPARENT_HEX);
    } else {
      const fillColor = sampledData && sampledData.regionColors.has(fillRegionId) ? sampledData.regionColors.get(fillRegionId)! : elementFill ? getHexCode(elementFill) : TRUE_BLACK_HEX;

      fillElement.setAttribute("assigned-fill", fillColor);
      fillElement.setAttribute("fill", PAINTABLE_REGION_HEX);
    }

    fillElement.setAttribute("stroke", "none");
    fillElement.setAttribute("stroke-linejoin", "round");
    fillElement.removeAttribute("style");
  });
  if (hiddenContainer.parentElement) {
    hiddenContainer.replaceChildren();
    hiddenContainer.parentElement.removeChild(hiddenContainer);
  }

  const imgW = processingImageWidthSignal.get();
  const imgH = processingImageHeightSignal.get();
  const totalImageSurfaceArea = imgW * imgH;
  const minRegionPixelArea = Math.max(TINY_REGION_SURFACE_AREA, totalImageSurfaceArea * SMALL_REGION_SURFACE_AREA_RATIO);
  const minRegionWidth = Math.max(MIN_REGION_DIMENSION_PX, imgW * MIN_REGION_DIMENSION_RATIO);
  const minRegionHeight = Math.max(MIN_REGION_DIMENSION_PX, imgH * MIN_REGION_DIMENSION_RATIO);

  // Helper to get LAB color with cache
  const colorLabCache = new Map<string, readonly [number, number, number]>();
  const getLabForHex = (hex: string) => {
    let lab = colorLabCache.get(hex);
    if (!lab) {
      const rgb = hexToRgb(hex);
      lab = rgb ? rgbToLab(rgb[0], rgb[1], rgb[2]) : [0, 0, 0];
      colorLabCache.set(hex, lab);
    }
    return lab;
  };

  // Helper to determine if a region is thin or small based on 4 criteria:
  // 1. Height is less than image-relative height threshold
  // 2. Width is less than image-relative width threshold
  // 3. Surface area is less than image-relative surface area threshold
  // 4. Surface area is less than fill ratio relative to the region's bounding box area
  const isRegionThinOrSmall = (id: string, pixelArea: number) => {
    const bbox = regionBoundsMap.get(id);
    if (!bbox) return false;
    if (bbox.height <= minRegionHeight) return true;
    if (bbox.width <= minRegionWidth) return true;
    if (pixelArea < minRegionPixelArea) return true;
    const bboxArea = bbox.width * bbox.height;
    if (bboxArea > 0 && pixelArea / bboxArea < MIN_REGION_BBOX_FILL_RATIO) return true;
    return false;
  };

  // Recursively eliminate ALL thin and small regions until none remain, merging each with its closest-color neighbor
  let hasRemainingThinRegions = true;
  let eliminationPasses = 0;
  const maxPasses = Math.max(100, regionPixelAreaMap.size * 2);

  while (hasRemainingThinRegions && eliminationPasses < maxPasses) {
    eliminationPasses++;
    hasRemainingThinRegions = false;
    const regionsToRemove = new Set<string>();

    if (regionPixelAreaMap.size <= 1) break;

    // Collect and sort candidate thin regions so thinnest/smallest merge first
    const candidateRegions = Array.from(regionPixelAreaMap.entries())
      .filter(([id, pixelArea]) => isRegionThinOrSmall(id, pixelArea))
      .map(([id, pixelArea]) => {
        const bbox = regionBoundsMap.get(id) || { width: 0, height: 0, x: 0, y: 0 };
        const maxDim = Math.max(bbox.width, bbox.height, 1);
        const thickness = Math.min(bbox.width, bbox.height, pixelArea / maxDim);
        return { id, pixelArea, thickness };
      })
      .sort((a, b) => a.thickness - b.thickness || a.pixelArea - b.pixelArea);

    if (candidateRegions.length === 0) break;

    for (let i = 0; i < candidateRegions.length; i++) {
      const region = candidateRegions[i];
      if (regionsToRemove.has(region.id)) continue;

      const currentArea = regionPixelAreaMap.get(region.id);
      if (currentArea === undefined) continue;
      if (!isRegionThinOrSmall(region.id, currentArea)) continue;

      const el = regionSVGElements.get(region.id);
      if (!el || el.tagName.toLowerCase() !== "path") continue;

      const assignedColor = el.getAttribute("assigned-fill");
      if (!assignedColor || assignedColor === TRANSPARENT_HEX) continue;

      const candidateNeighbors: string[] = [];

      // 1. Check topological adjacency graph for direct physical pixel contact only
      if (sampledData && sampledData.adjacencyGraph && sampledData.adjacencyGraph.has(region.id)) {
        const neighbors = sampledData.adjacencyGraph.get(region.id)!;
        for (const n of neighbors) {
          if (!regionsToRemove.has(n) && n !== region.id && regionSVGElements.has(n)) {
            candidateNeighbors.push(n);
          }
        }
      }

      if (candidateNeighbors.length === 0) continue;

      const sourceLab = getLabForHex(assignedColor);
      let bestNeighborId: string | null = null;
      let bestDeltaE = Infinity;

      for (const n of candidateNeighbors) {
        const nEl = regionSVGElements.get(n);
        if (!nEl || nEl.tagName.toLowerCase() !== "path") continue;

        const nColor = nEl.getAttribute("assigned-fill");
        if (!nColor || nColor === TRANSPARENT_HEX) continue;

        const nLab = getLabForHex(nColor);
        const dist = deltaE(sourceLab, nLab);

        if (dist < bestDeltaE) {
          bestDeltaE = dist;
          bestNeighborId = n;
        }
      }

      // Merge with closest color neighbor amongst direct pixel adjacent neighbors
      if (bestNeighborId) {
        mergeRegions(region.id, bestNeighborId, regionsToRemove, regionBoundsMap, regionSVGElements, sampledData, regionPixelAreaMap);
        hasRemainingThinRegions = true;
      }
    }
  }

  // Merge adjacent regions that have the same assigned color
  let mergedSameColor = true;
  while (mergedSameColor) {
    mergedSameColor = false;
    const regionsToRemove = new Set<string>();
    const currentRegionIds = Array.from(regionPixelAreaMap.keys());

    for (let i = 0; i < currentRegionIds.length; i++) {
      const regionId = currentRegionIds[i];
      if (regionsToRemove.has(regionId)) continue;

      const el = regionSVGElements.get(regionId);
      if (!el || el.tagName.toLowerCase() !== "path") continue;

      const assignedColor = el.getAttribute("assigned-fill");
      if (!assignedColor) continue;

      let targetId: string | null = null;

      // Find an adjacent region with the same assigned color using the adjacency graph
      if (sampledData && sampledData.adjacencyGraph && sampledData.adjacencyGraph.has(regionId)) {
        const neighbors = sampledData.adjacencyGraph.get(regionId)!;
        for (const n of neighbors) {
          const nEl = regionSVGElements.get(n);
          if (!regionsToRemove.has(n) && nEl && nEl.tagName.toLowerCase() === "path") {
            const nAssignedColor = nEl.getAttribute("assigned-fill");
            if (nAssignedColor === assignedColor) {
              targetId = n;
              break;
            }
          }
        }
      }

      if (targetId) {
        mergeRegions(regionId, targetId, regionsToRemove, regionBoundsMap, regionSVGElements, sampledData, regionPixelAreaMap);
        mergedSameColor = true;
      }
    }
  }

  // Sort remaining elements in DOM so smaller paths render above larger ones (using pixel surface area)
  const finalSortedRegionBounds = Array.from(regionPixelAreaMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => ({ id, boundingBox: regionBoundsMap.get(id)! }));

  finalSortedRegionBounds.forEach(({ id }) => {
    const el = regionSVGElements.get(id);
    if (el && el.parentElement) {
      el.parentElement.appendChild(el);
    }
  });

  // remove all style elements after processing of layout and colors is done.
  renderNode.querySelectorAll("style").forEach((elem) => elem.remove());
  // remove all other elements from the perserved SVG
  renderNode.querySelectorAll(`*:not([${PRESERVE_ELEMENT_MARKER}]`).forEach((elem) => elem.remove());

  const width = processingImageWidthSignal.get();
  const height = processingImageHeightSignal.get();

  if (!renderNode.hasAttribute("viewBox")) {
    renderNode.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }

  // set full width and height on cartoonSVG
  renderNode.setAttribute("width", width.toString());
  renderNode.setAttribute("height", height.toString());

  // add clip paths and containers for brush strokes
  const brushStrokeDefElem = document.createElement("defs");
  renderNode.prepend(brushStrokeDefElem);
  regionSVGElements.forEach((regionSVG, regionId) => {
    const clipMaskId = `mask-${regionId}`;
    const clipPath = document.createElementNS(XML_NS, "clipPath") as SVGClipPathElement;
    clipPath.setAttribute("id", clipMaskId);
    const maskElem = regionSVG.cloneNode() as SVGElement;
    maskElem.removeAttribute("id");
    maskElem.removeAttribute("class");
    maskElem.removeAttribute("data-region-id");
    maskElem.setAttribute("fill", "none");
    maskElem.setAttribute("stroke", "none");
    maskElem.setAttribute("touch-action", "none");
    maskElem.setAttribute("pointer-events", "none");
    clipPath.appendChild(maskElem);
    brushStrokeDefElem.append(clipPath);

    const brushStrokesContainer = document.createElementNS(XML_NS, "g") as SVGGElement;
    brushStrokesContainer.setAttribute("id", `brush-strokes-${regionId}`);
    brushStrokesContainer.setAttribute("clip-path", `url(#${clipMaskId})`);
    regionSVG.after(brushStrokesContainer);
  });

  try {
    const maxDim = Math.max(width, height);
    const expandPx = Math.max(8, maxDim * 0.015);
    const computedNeighbours = await runInWorker("COMPUTE_NEIGHBORS", { regions: finalSortedRegionBounds, expandPx });

    for (const [id, neighbours] of computedNeighbours) {
      const el = regionSVGElements.get(id);
      if (el && neighbours && neighbours.length > 0) {
        el.setAttribute("data-neighbors", neighbours.join(","));
      }
    }
  } catch (e) {
    console.error("Failed to compute region neighbors", e);
  }

  const artworkId = `art-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const now = Date.now();

  renderNode.setAttribute("data-id", artworkId);
  renderNode.setAttribute("data-name", artworkName);
  renderNode.setAttribute("data-created-at", now.toString());
  renderNode.setAttribute("data-modified-at", now.toString());

  const cartoonDataUrl = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgDoc!.outerHTML)));
  return hydrateArtworkFromSvg(renderNode.outerHTML, {
    originalDataUrl: imageSrc,
    cartoonDataUrl,
  });
}

export function renderArtworkToSVG(artwork: ProcessedArtwork, fillEdges = false) {
  const svgElem = parseSVG(artwork.cartoonSVG) as SVGSVGElement;
  updateArtworkSvgWithUserPaints(svgElem, artwork);
  if (artwork.width) svgElem.setAttribute("width", artwork.width.toString());
  if (artwork.height) svgElem.setAttribute("height", artwork.height.toString());
  const artSurfaceArea = artwork.height * artwork.width;
  if (fillEdges) {
    svgElem.querySelectorAll(`[fill]`).forEach((elem) => {
      elem.setAttribute("stroke", elem.getAttribute("fill")!);
      elem.setAttribute("stroke-width", (artSurfaceArea / 10000000).toString());
    });
  }
  return svgElem;
}

export function serializeArtworkToSvg(artwork: ProcessedArtwork): string {
  const svgElem = renderArtworkToSVG(artwork);
  return svgElem.outerHTML;
}

export function hydrateArtworkFromSvg(svgString: string, fallback?: Partial<ProcessedArtwork>): ProcessedArtwork {
  const svgElem = parseSVG(svgString) as SVGSVGElement;
  const viewBox = svgElem.viewBox?.baseVal;
  const widthAttr = parseFloat(svgElem.getAttribute("width") || "");
  const heightAttr = parseFloat(svgElem.getAttribute("height") || "");

  const width = (!isNaN(widthAttr) && widthAttr > 0 ? widthAttr : viewBox?.width) || fallback?.width || FALLBACK_IMAGE_SIZE_PX;
  const height = (!isNaN(heightAttr) && heightAttr > 0 ? heightAttr : viewBox?.height) || fallback?.height || FALLBACK_IMAGE_SIZE_PX;

  const id = fallback?.id || svgElem.getAttribute("data-id") || `art-${Date.now()}`;
  const name = fallback?.name || svgElem.getAttribute("data-name") || "Untitled";
  const createdAt = fallback?.createdAt || Number(svgElem.getAttribute("data-created-at")) || Date.now();
  const modifiedAt = fallback?.modifiedAt || Number(svgElem.getAttribute("data-modified-at")) || Date.now();
  const originalDataUrl = fallback?.originalDataUrl || "";
  const cartoonDataUrl = fallback?.cartoonDataUrl || "";

  const colorsAssignedToRegions = new Map<string, Set<string>>();
  const colorsFilledInRegions = new Map<string, Set<string>>();
  const regionsCurrentFillInfo = new Map<string, string>();
  const regionsDrawingInfo = new Map<string, any>();
  const brushStrokePaths: ProcessedArtwork["brushStrokePaths"] = {};

  colorsAssignedToRegions.set(TRANSPARENT_HEX, new Set());
  colorsFilledInRegions.set(TRANSPARENT_HEX, new Set());
  colorsFilledInRegions.set(PAINTABLE_REGION_HEX, new Set());

  const fillableElements = Array.from(svgElem.querySelectorAll(`[data-region-id], :is(${FILLABLE_SVG_ELEMENTS_SELECTOR})`));

  fillableElements.forEach((el, index) => {
    if (el.closest("defs")) return;

    const regionId = el.getAttribute("data-region-id") || el.getAttribute("id") || `region-${index}`;
    const fallbackDrawingInfo = fallback?.regionsDrawingInfo;
    const fallbackRegion = fallbackDrawingInfo instanceof Map ? fallbackDrawingInfo.get(regionId) : (fallbackDrawingInfo as any)?.[regionId];
    const fallbackAssigned = fallbackRegion?.fillColor;
    const assignedFill = el.getAttribute("assigned-fill") || el.getAttribute("data-assigned-fill") || fallbackAssigned || TRANSPARENT_HEX;
    const normalizedAssigned = normalizeHex(assignedFill) || TRANSPARENT_HEX;

    const fallbackCurrentFillInfo = fallback?.regionsCurrentFillInfo;
    const fallbackCurrent = fallbackCurrentFillInfo instanceof Map ? fallbackCurrentFillInfo.get(regionId) : (fallbackCurrentFillInfo as any)?.[regionId];
    const currentFill = el.getAttribute("fill") || fallbackCurrent || (normalizedAssigned === TRANSPARENT_HEX ? TRANSPARENT_HEX : PAINTABLE_REGION_HEX);
    const normalizedCurrent = normalizeHex(currentFill) || PAINTABLE_REGION_HEX;

    let boundingBox: any = null;
    const bboxAttr = el.getAttribute("data-bbox");
    if (bboxAttr) {
      const [w, h, x, y] = bboxAttr.split(",").map(Number);
      if (!isNaN(w) && !isNaN(h) && !isNaN(x) && !isNaN(y)) {
        boundingBox = { width: w, height: h, x, y };
      }
    }
    if (!boundingBox && fallbackRegion?.boundingBox) {
      boundingBox = fallbackRegion.boundingBox;
    }

    let neighbourRegionIds = new Set<string>();
    const neighborsAttr = el.getAttribute("data-neighbors");
    if (neighborsAttr) {
      neighborsAttr
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((nId) => neighbourRegionIds.add(nId));
    } else if (fallbackRegion?.neighbourRegionIds) {
      const nIds = fallbackRegion.neighbourRegionIds;
      if (nIds instanceof Set) {
        nIds.forEach((nId: string) => neighbourRegionIds.add(nId));
      } else if (Array.isArray(nIds)) {
        nIds.forEach((nId: string) => neighbourRegionIds.add(nId));
      }
    }

    regionsDrawingInfo.set(regionId, {
      id: regionId,
      fillColor: normalizedAssigned,
      neighbourRegionIds,
      boundingBox,
    });

    regionsCurrentFillInfo.set(regionId, normalizedCurrent);

    if (!colorsAssignedToRegions.has(normalizedAssigned)) {
      colorsAssignedToRegions.set(normalizedAssigned, new Set());
    }
    colorsAssignedToRegions.get(normalizedAssigned)!.add(regionId);

    if (!colorsFilledInRegions.has(normalizedCurrent)) {
      colorsFilledInRegions.set(normalizedCurrent, new Set());
    }
    colorsFilledInRegions.get(normalizedCurrent)!.add(regionId);
  });

  // Reconstruct brush strokes from <g id="brush-strokes-${regionId}">
  const brushContainers = Array.from(svgElem.querySelectorAll('g[id^="brush-strokes-"]'));
  brushContainers.forEach((container) => {
    const regionId = container.id.replace("brush-strokes-", "");
    const strokePaths = Array.from(container.querySelectorAll("path"));
    if (strokePaths.length === 0) return;

    brushStrokePaths[regionId] = {};
    const prefix = `stroke-${regionId}_`;
    strokePaths.forEach((pathElem, idx) => {
      const strokeId = pathElem.id && pathElem.id.startsWith(prefix) ? pathElem.id.substring(prefix.length) : pathElem.id || `stroke-${idx}`;
      const stroke = pathElem.getAttribute("stroke") || "#000000";
      const strokeWidth = parseFloat(pathElem.getAttribute("stroke-width") || "4") || 4;
      const d = pathElem.getAttribute("d") || "";

      const points: Array<{ x: number; y: number }> = [];
      const commands = d.match(/[ML]\s*[-+]?[0-9]*\.?[0-9]+\s+[-+]?[0-9]*\.?[0-9]+/gi);
      if (commands) {
        commands.forEach((cmd) => {
          const parts = cmd.substring(1).trim().split(/\s+/).map(Number);
          if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            points.push({ x: parts[0], y: parts[1] });
          }
        });
      }

      if (points.length > 0) {
        brushStrokePaths[regionId][strokeId] = {
          points,
          stroke,
          strokeWidth,
        };
      }
    });
  });

  return {
    id,
    name,
    originalDataUrl,
    cartoonDataUrl,
    cartoonSVG: svgString,
    width,
    height,
    createdAt,
    modifiedAt,
    colorsAssignedToRegions,
    colorsFilledInRegions,
    regionsCurrentFillInfo,
    regionsDrawingInfo,
    brushStrokePaths,
  };
}

export function updateArtworkSvgWithUserPaints(svgElem: SVGSVGElement, artwork: ProcessedArtwork) {
  if (artwork.id) svgElem.setAttribute("data-id", artwork.id);
  if (artwork.name) svgElem.setAttribute("data-name", artwork.name);
  if (artwork.createdAt) svgElem.setAttribute("data-created-at", artwork.createdAt.toString());
  if (artwork.modifiedAt) svgElem.setAttribute("data-modified-at", artwork.modifiedAt.toString());
  svgElem.setAttribute("width", "100%");
  svgElem.setAttribute("height", "100%");

  artwork.regionsCurrentFillInfo.forEach((currentFill, regionId) => {
    const fillElem = svgElem.querySelector(`[data-region-id="${regionId}"]`) as SVGElement;
    if (!fillElem) return;
    const fill = normalizeHex(currentFill) || TRANSPARENT_HEX;
    fillElem.setAttribute("fill", fill);

    const assigned = artwork.regionsDrawingInfo?.get(regionId)?.fillColor;
    if (assigned && !fillElem.hasAttribute("assigned-fill")) {
      fillElem.setAttribute("assigned-fill", assigned);
    }

    const strokesContainer = svgElem.querySelector(`#brush-strokes-${regionId}`) as SVGGElement;
    if (!strokesContainer) return;

    const strokesRecord = artwork.brushStrokePaths[regionId];
    if (!strokesRecord || Object.keys(strokesRecord).length === 0) {
      // clear all the rendered strokes
      strokesContainer.innerHTML = "";
      return;
    }

    const strokeIds = Object.keys(strokesRecord);
    const prefix = `stroke-${regionId}_`;

    // Remove any children that are no longer in the strokesRecord
    Array.from(strokesContainer.children).forEach((child) => {
      const id = child.getAttribute("id");
      if (id && id.startsWith(prefix)) {
        const strokeId = id.substring(prefix.length);
        if (!strokeId || !strokesRecord[strokeId]) {
          child.remove();
        }
      } else {
        child.remove();
      }
    });

    strokeIds.forEach((strokeId) => {
      const stroke = strokesRecord[strokeId];
      if (!stroke || stroke.points.length <= 0) return; // this should not happen but in case
      const strokePathElemId = `${prefix}${strokeId}`;
      let strokePathElem = Array.from(strokesContainer.children).find((c) => c.getAttribute("id") === strokePathElemId) as SVGPathElement | undefined;
      if (!strokePathElem) {
        strokePathElem = document.createElementNS(XML_NS, "path");
        strokePathElem.setAttribute("fill", "none");
        strokePathElem.setAttribute("stroke-linecap", "butt");
        strokePathElem.setAttribute("stroke-linejoin", "round");
        strokePathElem.setAttribute("pointer-events", "none");
        strokePathElem.setAttribute("touch-action", "none");
        strokesContainer.append(strokePathElem);
      }
      strokePathElem.setAttribute("id", strokePathElemId);
      strokePathElem.setAttribute("stroke", stroke.stroke);
      strokePathElem.setAttribute("stroke-width", stroke.strokeWidth.toString());
      const strokePathStr = stroke.points.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
      strokePathElem.setAttribute("d", strokePathStr);
    });
  });
}
