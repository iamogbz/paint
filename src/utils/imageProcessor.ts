import { COLOR_COLLAPSE_DELTA_E_THRESHOLD, FALLBACK_IMAGE_SIZE_PX, FILLABLE_SVG_ELEMENTS_SELECTOR, PAINTABLE_REGION_HEX, TRANSPARENT_HEX } from "./constants.js";
import { processingImageHeightSignal, processingImageWidthSignal } from "../state/store.js";
import { ProcessedArtwork } from "../types";
import { deltaE, getHexCode, normalizeHex, rgbToHex, rgbToLab } from "./color.js";
import { getSvgDimensions, parseSVG, SVGFillableElement, XML_NS } from "./html.js";
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
  }
  return _worker;
}

function runInWorker(type: string, payload: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = ++_msgId;
    _callbacks.set(id, { resolve, reject });
    getWorker().postMessage({ id, type, payload });
  });
}

async function loadImage(src: string): Promise<Readonly<({ type: "err"; data: unknown } | { type: "svg"; data: SVGSVGElement } | { type: "bin"; data: HTMLImageElement }) & { format: string | null }>> {
  const response = await fetch(src);
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("image/")) {
    if (contentType.includes("image/svg+xml")) {
      const text = await response.text();
      const svgElement = parseSVG<SVGSVGElement>(text);
      if (svgElement) {
        const dimensions = getSvgDimensions(svgElement);
        processingImageWidthSignal.set(dimensions.width);
        processingImageHeightSignal.set(dimensions.height);
        return {
          type: "svg",
          format: contentType,
          data: svgElement,
        } as const;
      }
      return {
        type: "err",
        format: contentType,
        data: text,
      } as const;
    } else {
      const blob = await response.blob();
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        const objectUrl = URL.createObjectURL(blob);
        img.onload = () => {
          URL.revokeObjectURL(objectUrl);
          let targetWidth = img.naturalWidth || FALLBACK_IMAGE_SIZE_PX;
          let targetHeight = img.naturalHeight || FALLBACK_IMAGE_SIZE_PX;
          const maxDim = Math.max(targetWidth, targetHeight);

          if (maxDim > FALLBACK_IMAGE_SIZE_PX) {
            const scale = FALLBACK_IMAGE_SIZE_PX / maxDim;
            targetWidth = Math.round(targetWidth * scale);
            targetHeight = Math.round(targetHeight * scale);
          }

          processingImageWidthSignal.set(targetWidth);
          processingImageHeightSignal.set(targetHeight);
          resolve({
            type: "bin",
            format: contentType,
            data: img,
          } as const);
        };
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          processingImageWidthSignal.set(FALLBACK_IMAGE_SIZE_PX);
          processingImageHeightSignal.set(FALLBACK_IMAGE_SIZE_PX);
          resolve({
            type: "err",
            format: contentType,
            data: blob,
          } as const);
        };
        img.src = objectUrl;
      });
    }
  } else {
    return {
      type: "err",
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
    return finalCanvas;
  }

  return currentCanvas;
}

/**
 * Turns svg outlines into paths and fragments overlapping shapes into non-overlapping islands.
 */
async function transformSVGForPainting(svg: SVGSVGElement) {
  // TODO
  // 1. turn all the strokes with >0 widths into paths, the stroke color is now the fill and the new path has no stroke
  // 2. check all the paths in the document including the strokes that just got turned to paths and divide them into unique islands until they are no overlapping paths
  // 3. make sure that the fills for all paths even if was assigned by inheritance are preserved during the previous step
  // 4. parse the generated svg and return it for processing

  // assign black fill to all elements without a fill attribute
  // this solve the issue of some paths needing to be rendered as black by default
  // but introduces an issue where elements that can not be painted are added to the region count
  svg.querySelectorAll(`:is(${FILLABLE_SVG_ELEMENTS_SELECTOR}):not([fill])`).forEach((el) => {
    el.setAttribute("fill", "#000000FF");
  });

  // assign transparent fill to all elements with fill="none"
  // this solve the issue of including transparent regions as places that can be filled in
  // however when the splitting of overlapping region occurs transparent sections should not win over coloured sections
  svg.querySelectorAll(`[fill="none"]`).forEach((el) => {
    el.setAttribute("fill", TRANSPARENT_HEX);
  });

  return svg;
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
} {
  const regionCount = fillableElements.length;
  const regionColors = new Map<string, string>();
  const adjacencyGraph = new Map<string, Set<string>>();

  fillableElements.forEach((_, idx) => {
    adjacencyGraph.set(`region-${idx}`, new Set<string>());
  });

  if (regionCount === 0) {
    return { regionColors, adjacencyGraph };
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

    if (elem instanceof SVGPathElement) {
      const d = elem.getAttribute("d");
      if (d) {
        const path2d = new Path2D(d);
        idCtx.fillStyle = colorStr;
        idCtx.fill(path2d);
      }
    }
  });

  const idImgData = idCtx.getImageData(0, 0, width, height);
  const id32 = new Uint32Array(idImgData.data.buffer);
  const orig32 = new Uint32Array(origImgData.data.buffer);

  // Pixel color accumulators for each 1-based region ID
  const sumR = new Float64Array(regionCount + 1);
  const sumG = new Float64Array(regionCount + 1);
  const sumB = new Float64Array(regionCount + 1);
  const pixelCounts = new Uint32Array(regionCount + 1);

  // 2. Scan pixels: accumulate colors and discover topological 4-connected adjacencies
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x;
      const idPixel = id32[idx];

      if (idPixel >>> 24 === 0) continue;

      const regionNum = idPixel & 0x00ffffff;
      if (regionNum > 0 && regionNum <= regionCount) {
        const origPixel = orig32[idx];
        sumR[regionNum] += origPixel & 0xff;
        sumG[regionNum] += (origPixel >> 8) & 0xff;
        sumB[regionNum] += (origPixel >> 16) & 0xff;
        pixelCounts[regionNum]++;

        // Adjacency check to the right
        if (x + 1 < width) {
          const rightPixel = id32[idx + 1];
          if (rightPixel >>> 24 > 0) {
            const rightNum = rightPixel & 0x00ffffff;
            if (rightNum > 0 && rightNum <= regionCount && rightNum !== regionNum) {
              const idA = `region-${regionNum - 1}`;
              const idB = `region-${rightNum - 1}`;
              adjacencyGraph.get(idA)?.add(idB);
              adjacencyGraph.get(idB)?.add(idA);
            }
          }
        }

        // Adjacency check downwards
        if (y + 1 < height) {
          const downPixel = id32[idx + width];
          if (downPixel >>> 24 > 0) {
            const downNum = downPixel & 0x00ffffff;
            if (downNum > 0 && downNum <= regionCount && downNum !== regionNum) {
              const idA = `region-${regionNum - 1}`;
              const idB = `region-${downNum - 1}`;
              adjacencyGraph.get(idA)?.add(idB);
              adjacencyGraph.get(idB)?.add(idA);
            }
          }
        }
      }
    }
  }

  // 3. Compute base sampled representative color for each region
  const rawRgbList: Array<{ id: string; r: number; g: number; b: number; count: number }> = [];

  for (let i = 1; i <= regionCount; i++) {
    const count = pixelCounts[i];
    const regionId = `region-${i - 1}`;
    let r: number, g: number, b: number;

    if (count > 0) {
      r = Math.round(sumR[i] / count);
      g = Math.round(sumG[i] / count);
      b = Math.round(sumB[i] / count);
    } else {
      // Fallback for sub-pixel / thin vector paths: sample centroid from bounding box
      const elem = fillableElements[i - 1];
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
    rawRgbList.push({ id: regionId, r, g, b, count });
  }

  // 4. Color Clumping / Palette Clustering with strict Adjacency Graph Constraints
  const regionLabs = rawRgbList.map((item) => rgbToLab(item.r, item.g, item.b));

  // Build cluster representatives (palette swatches)
  interface Cluster {
    r: number;
    g: number;
    b: number;
    lab: [number, number, number];
    hex: string;
    totalPixels: number;
    assignedRegionIds: Set<string>;
  }

  const clusters: Cluster[] = [];
  const CLUSTER_DELTA_E_THRESHOLD = 9.0; // Perceptually similar colors cluster together

  // Sort regions by pixel count descending so larger key regions establish initial palette anchors
  const sortedIndices = rawRgbList.map((_, idx) => idx).sort((a, b) => rawRgbList[b].count - rawRgbList[a].count);

  for (const idx of sortedIndices) {
    const item = rawRgbList[idx];
    const lab = regionLabs[idx];
    const neighbors = adjacencyGraph.get(item.id) || new Set<string>();

    // Find best cluster candidate where no adjacent neighbor is already assigned this cluster's color
    let bestCluster: Cluster | null = null;
    let minDiff = Infinity;

    for (const cluster of clusters) {
      // Check for direct topological adjacency conflict
      let hasAdjacencyConflict = false;
      for (const assignedId of cluster.assignedRegionIds) {
        if (neighbors.has(assignedId)) {
          hasAdjacencyConflict = true;
          break;
        }
      }

      if (hasAdjacencyConflict) continue;

      const diff = deltaE(lab, cluster.lab);
      if (diff < CLUSTER_DELTA_E_THRESHOLD && diff < minDiff) {
        minDiff = diff;
        bestCluster = cluster;
      }
    }

    if (bestCluster) {
      // Assign to existing non-conflicting cluster
      bestCluster.assignedRegionIds.add(item.id);
      regionColors.set(item.id, bestCluster.hex);
    } else {
      // Create new distinct palette cluster
      const hex = rgbToHex(item.r, item.g, item.b);
      const newCluster: Cluster = {
        r: item.r,
        g: item.g,
        b: item.b,
        lab,
        hex,
        totalPixels: item.count,
        assignedRegionIds: new Set([item.id]),
      };
      clusters.push(newCluster);
      regionColors.set(item.id, hex);
    }
  }

  // 5. Collapse colors within perceptual distance threshold (< 1.0) into their average
  interface MergeGroup {
    originalColors: Array<{ r: number; g: number; b: number; lab: [number, number, number] }>;
    avgR: number;
    avgG: number;
    avgB: number;
    avgLab: [number, number, number];
    assignedRegionIds: Set<string>;
  }

  const mergeGroups: MergeGroup[] = clusters.map((c) => ({
    originalColors: [{ r: c.r, g: c.g, b: c.b, lab: c.lab }],
    avgR: c.r,
    avgG: c.g,
    avgB: c.b,
    avgLab: c.lab,
    assignedRegionIds: new Set(c.assignedRegionIds),
  }));

  let merged = true;
  while (merged) {
    merged = false;
    let bestPair: [number, number] | null = null;
    let minDistance = Infinity;

    for (let i = 0; i < mergeGroups.length; i++) {
      for (let j = i + 1; j < mergeGroups.length; j++) {
        const groupA = mergeGroups[i];
        const groupB = mergeGroups[j];
        const dist = deltaE(groupA.avgLab, groupB.avgLab);

        if (dist < minDistance) {
          const combinedOriginals = [...groupA.originalColors, ...groupB.originalColors];
          const count = combinedOriginals.length;
          const sumR = combinedOriginals.reduce((acc, col) => acc + col.r, 0);
          const sumG = combinedOriginals.reduce((acc, col) => acc + col.g, 0);
          const sumB = combinedOriginals.reduce((acc, col) => acc + col.b, 0);
          const avgR = Math.round(sumR / count);
          const avgG = Math.round(sumG / count);
          const avgB = Math.round(sumB / count);
          const avgLab = rgbToLab(avgR, avgG, avgB);

          const allWithinThreshold = combinedOriginals.every((col) => deltaE(col.lab, avgLab) < COLOR_COLLAPSE_DELTA_E_THRESHOLD);

          if (allWithinThreshold) {
            minDistance = dist;
            bestPair = [i, j];
          }
        }
      }
    }

    if (bestPair !== null) {
      const [i, j] = bestPair;
      const groupA = mergeGroups[i];
      const groupB = mergeGroups[j];
      const combinedOriginals = [...groupA.originalColors, ...groupB.originalColors];
      const count = combinedOriginals.length;
      const avgR = Math.round(combinedOriginals.reduce((acc, col) => acc + col.r, 0) / count);
      const avgG = Math.round(combinedOriginals.reduce((acc, col) => acc + col.g, 0) / count);
      const avgB = Math.round(combinedOriginals.reduce((acc, col) => acc + col.b, 0) / count);
      const avgLab = rgbToLab(avgR, avgG, avgB);

      groupA.originalColors = combinedOriginals;
      groupA.avgR = avgR;
      groupA.avgG = avgG;
      groupA.avgB = avgB;
      groupA.avgLab = avgLab;
      groupB.assignedRegionIds.forEach((id) => groupA.assignedRegionIds.add(id));

      mergeGroups.splice(j, 1);
      merged = true;
    }
  }

  // Update regionColors with collapsed average hex values
  for (const group of mergeGroups) {
    const hex = rgbToHex(group.avgR, group.avgG, group.avgB);
    for (const regionId of group.assignedRegionIds) {
      regionColors.set(regionId, hex);
    }
  }

  return { regionColors, adjacencyGraph };
}

export async function processImageToCartoonPalette(imageSrc: string, artworkName: string): Promise<ProcessedArtwork> {
  const maybeImage = await loadImage(imageSrc);

  let svgDoc: SVGSVGElement | null = null;
  let origImgDataForSampling: ImageData | null = null;

  if (maybeImage.type === "svg") {
    svgDoc = maybeImage.data;
  } else if (maybeImage.type === "bin") {
    const img = maybeImage.data;
    const imgWidth = processingImageWidthSignal.get();
    const imgHeight = processingImageHeightSignal.get();

    // Multi-step downscale to target dimensions
    const origCanvas = downscaleCanvasMultiStep(img, imgWidth, imgHeight);
    const origCtx = origCanvas.getContext("2d", { willReadFrequently: true });
    if (!origCtx) throw new Error("Failed to initialize canvas 2D context");

    // Retain pristine downscaled image for true pixel color sampling
    origImgDataForSampling = origCtx.getImageData(0, 0, imgWidth, imgHeight);

    const rawPixels = origImgDataForSampling.data;

    // Run vtracer in worker solely for line/boundary extraction
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
    const svgStr = await runInWorker("VECTORIZE", { rawPixels, imgWidth, imgHeight, options });
    let cleanSvgStr = svgStr.includes("xmlns=") ? svgStr : svgStr.replace("<svg", `<svg xmlns="${XML_NS}"`);
    cleanSvgStr = cleanSvgStr.replaceAll(` d="L`, ` d="M`);
    svgDoc = parseSVG<SVGSVGElement>(cleanSvgStr);
  } else if (maybeImage.type === "err") {
    console.error(maybeImage);
    throw new Error(maybeImage.format?.toString());
  }

  // Parse output SVG
  svgDoc = await transformSVGForPainting(svgDoc!);

  /** Region ID to the elements for creating brush stroke clipping paths */
  const regionSVGElements: Map<string, SVGElement> = new Map();
  const regionBounds: Array<{ id: string; boundingBox: { width: number; height: number; x: number; y: number } }> = [];

  const renderNode = svgDoc.cloneNode(true) as typeof svgDoc;
  const hiddenContainer = document.createElement("div");
  hiddenContainer.style.position = "absolute";
  hiddenContainer.style.visibility = "hidden";
  hiddenContainer.style.pointerEvents = "none";
  hiddenContainer.appendChild(renderNode);
  document.body.appendChild(hiddenContainer);

  const PRESERVE_ELEMENT_MARKER = "paint-preserve";
  const isFillableElemSelector = `:is(${FILLABLE_SVG_ELEMENTS_SELECTOR})` as typeof FILLABLE_SVG_ELEMENTS_SELECTOR;

  const preservedTreeElements = new Set<SVGElement>();
  const allFillableElements = Array.from(renderNode.querySelectorAll(isFillableElemSelector));

  // Determine fill colors: if bitmap, sample directly from pristine pixels with graph adjacency-constrained palette clumping
  const sampledData = origImgDataForSampling !== null ? sampleAndClusterRegionColors(origImgDataForSampling, processingImageWidthSignal.get(), processingImageHeightSignal.get(), allFillableElements) : null;

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

    const computedStyle = fillElement.computedStyleMap();
    const elementFill = computedStyle.get("fill")?.toString();

    // skip elements in defintions
    if (fillElement.closest("defs") !== null) {
      return;
    }

    const { width, height, x, y } = fillElement.getBBox();
    regionBounds.push({ id: fillRegionId, boundingBox: { width, height, x, y } });
    fillElement.setAttribute("data-bbox", `${width.toFixed(2)},${height.toFixed(2)},${x.toFixed(2)},${y.toFixed(2)}`);

    if (elementFill === "none") {
      fillElement.setAttribute("assigned-fill", TRANSPARENT_HEX);
      fillElement.setAttribute("fill", TRANSPARENT_HEX);
    } else {
      const fillColor = sampledData && sampledData.regionColors.has(fillRegionId)
        ? sampledData.regionColors.get(fillRegionId)!
        : (elementFill ? getHexCode(elementFill) : "#00000000");

      fillElement.setAttribute("assigned-fill", fillColor);
      fillElement.setAttribute("fill", PAINTABLE_REGION_HEX);
    }

    fillElement.setAttribute("stroke", "none");
    fillElement.setAttribute("stroke-linejoin", "round");
    fillElement.removeAttribute("style");
  });
  document.body.removeChild(hiddenContainer);

  // Merge small regions (width < 2 || height < 2 || area < 8)
  let mergedAny = true;
  while (mergedAny) {
    mergedAny = false;
    const regionsToRemove = new Set<string>();

    for (let i = 0; i < regionBounds.length; i++) {
      const region = regionBounds[i];
      if (regionsToRemove.has(region.id)) continue;

      const el = regionSVGElements.get(region.id);
      if (!el || el.tagName.toLowerCase() !== "path") continue;

      const w = region.boundingBox.width;
      const h = region.boundingBox.height;
      if (w < 2 || h < 2 || w * h < 8) {
        // Find a neighbor
        let targetId: string | null = null;

        // Prefer topological adjacency graph if available
        if (sampledData && sampledData.adjacencyGraph.has(region.id)) {
          const neighbors = sampledData.adjacencyGraph.get(region.id)!;
          for (const n of neighbors) {
            const nEl = regionSVGElements.get(n);
            if (!regionsToRemove.has(n) && nEl && nEl.tagName.toLowerCase() === "path") {
              targetId = n;
              break;
            }
          }
        }

        // Fallback to bounding box overlap/proximity
        if (!targetId) {
          for (let j = 0; j < regionBounds.length; j++) {
            if (i === j || regionsToRemove.has(regionBounds[j].id)) continue;
            const r2 = regionBounds[j];
            const nEl = regionSVGElements.get(r2.id);
            if (!nEl || nEl.tagName.toLowerCase() !== "path") continue;

            // check if boxes overlap or touch (with 1px tolerance)
            const b1 = region.boundingBox;
            const b2 = r2.boundingBox;
            if (!(b1.x > b2.x + b2.width + 1 ||
                  b1.x + b1.width + 1 < b2.x ||
                  b1.y > b2.y + b2.height + 1 ||
                  b1.y + b1.height + 1 < b2.y)) {
              targetId = r2.id;
              break;
            }
          }
        }

        if (targetId) {
          const targetEl = regionSVGElements.get(targetId)!;
          const dA = el.getAttribute("d") || "";
          const dB = targetEl.getAttribute("d") || "";
          targetEl.setAttribute("d", `${dB} ${dA}`);

          // Update target bounding box
          const b1 = region.boundingBox;
          const b2 = regionBounds.find(r => r.id === targetId)!.boundingBox;
          const minX = Math.min(b1.x, b2.x);
          const minY = Math.min(b1.y, b2.y);
          const maxX = Math.max(b1.x + b1.width, b2.x + b2.width);
          const maxY = Math.max(b1.y + b1.height, b2.y + b2.height);
          b2.x = minX;
          b2.y = minY;
          b2.width = maxX - minX;
          b2.height = maxY - minY;
          targetEl.setAttribute("data-bbox", `${b2.width.toFixed(2)},${b2.height.toFixed(2)},${b2.x.toFixed(2)},${b2.y.toFixed(2)}`);

          // Remove small region
          el.remove();
          regionSVGElements.delete(region.id);
          regionsToRemove.add(region.id);
          mergedAny = true;

          // Update adjacency graph
          if (sampledData && sampledData.adjacencyGraph.has(region.id)) {
            const neighbors = sampledData.adjacencyGraph.get(region.id)!;
            const targetNeighbors = sampledData.adjacencyGraph.get(targetId);
            if (targetNeighbors) {
              neighbors.forEach(n => {
                if (n !== targetId) targetNeighbors.add(n);
              });
            }
            // Remove from other neighbors and redirect to target
            sampledData.adjacencyGraph.forEach((ns, nid) => {
              if (ns.has(region.id)) {
                ns.delete(region.id);
                if (nid !== targetId && !regionsToRemove.has(nid)) {
                  ns.add(targetId!);
                }
              }
            });
            sampledData.adjacencyGraph.delete(region.id);
          }
        }
      }
    }

    if (mergedAny) {
      // Filter out removed regions from regionBounds
      for (let i = regionBounds.length - 1; i >= 0; i--) {
        if (regionsToRemove.has(regionBounds[i].id)) {
          regionBounds.splice(i, 1);
        }
      }
    }
  }

  // Merge adjacent regions that have the same assigned color
  let mergedSameColor = true;
  while (mergedSameColor) {
    mergedSameColor = false;
    const regionsToRemove = new Set<string>();

    for (let i = 0; i < regionBounds.length; i++) {
      const region = regionBounds[i];
      if (regionsToRemove.has(region.id)) continue;

      const el = regionSVGElements.get(region.id);
      if (!el || el.tagName.toLowerCase() !== "path") continue;

      const assignedColor = el.getAttribute("assigned-fill");
      if (!assignedColor) continue;

      let targetId: string | null = null;

      // Find an adjacent region with the same assigned color using the adjacency graph
      if (sampledData && sampledData.adjacencyGraph.has(region.id)) {
        const neighbors = sampledData.adjacencyGraph.get(region.id)!;
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
        const targetEl = regionSVGElements.get(targetId)!;
        const dA = el.getAttribute("d") || "";
        const dB = targetEl.getAttribute("d") || "";
        targetEl.setAttribute("d", `${dB} ${dA}`);

        // Update target bounding box
        const b1 = region.boundingBox;
        const b2 = regionBounds.find((r) => r.id === targetId)!.boundingBox;
        const minX = Math.min(b1.x, b2.x);
        const minY = Math.min(b1.y, b2.y);
        const maxX = Math.max(b1.x + b1.width, b2.x + b2.width);
        const maxY = Math.max(b1.y + b1.height, b2.y + b2.height);
        b2.x = minX;
        b2.y = minY;
        b2.width = maxX - minX;
        b2.height = maxY - minY;
        targetEl.setAttribute(
          "data-bbox",
          `${b2.width.toFixed(2)},${b2.height.toFixed(2)},${b2.x.toFixed(2)},${b2.y.toFixed(2)}`
        );

        // Remove the swallowed region
        el.remove();
        regionSVGElements.delete(region.id);
        regionsToRemove.add(region.id);
        mergedSameColor = true;

        // Update adjacency graph
        if (sampledData && sampledData.adjacencyGraph.has(region.id)) {
          const neighbors = sampledData.adjacencyGraph.get(region.id)!;
          const targetNeighbors = sampledData.adjacencyGraph.get(targetId);
          if (targetNeighbors) {
            neighbors.forEach((n) => {
              if (n !== targetId) targetNeighbors.add(n);
            });
          }
          // Remove from other neighbors and redirect to target
          sampledData.adjacencyGraph.forEach((ns, nid) => {
            if (ns.has(region.id)) {
              ns.delete(region.id);
              if (nid !== targetId && !regionsToRemove.has(nid)) {
                ns.add(targetId!);
              }
            }
          });
          sampledData.adjacencyGraph.delete(region.id);
        }
      }
    }

    if (mergedSameColor) {
      // Filter out removed regions from regionBounds
      for (let i = regionBounds.length - 1; i >= 0; i--) {
        if (regionsToRemove.has(regionBounds[i].id)) {
          regionBounds.splice(i, 1);
        }
      }
    }
  }

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
    const computedNeighbours = await runInWorker("COMPUTE_NEIGHBORS", { regions: regionBounds, expandPx });

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

  const cartoonDataUrl = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgDoc.outerHTML)));
  return hydrateArtworkFromSvg(renderNode.outerHTML, {
    originalDataUrl: imageSrc,
    cartoonDataUrl,
  });
}

export function renderArtworkToSVG(artwork: ProcessedArtwork) {
  const svgElem = parseSVG(artwork.cartoonSVG) as SVGSVGElement;
  updateArtworkSvgWithUserPaints(svgElem, artwork);
  if (artwork.width) svgElem.setAttribute("width", artwork.width.toString());
  if (artwork.height) svgElem.setAttribute("height", artwork.height.toString());
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
      neighborsAttr.split(",").map((s) => s.trim()).filter(Boolean).forEach((nId) => neighbourRegionIds.add(nId));
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
