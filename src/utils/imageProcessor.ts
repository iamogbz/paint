import { FALLBACK_IMAGE_SIZE_PX, FILLABLE_SVG_ELEMENTS_SELECTOR, PAINTABLE_REGION_HEX, TRANSPARENT_HEX } from "./constants.js";
import { smoothPlanarSvgPaths } from "./svgSmoothing.js";
import { processingImageHeightSignal, processingImageWidthSignal } from "../state/store.js";
import { MutableMap, ProcessedArtwork } from "../types";
import { getHexCode, normalizeHex, rgbToHex } from "./color.js";
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
  const idData = idImgData.data;
  const origData = origImgData.data;

  // Pixel color accumulators for each 1-based region ID
  const sumR = new Float64Array(regionCount + 1);
  const sumG = new Float64Array(regionCount + 1);
  const sumB = new Float64Array(regionCount + 1);
  const pixelCounts = new Uint32Array(regionCount + 1);

  // 2. Scan pixels: accumulate colors and discover topological 4-connected adjacencies
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const idx = (rowOffset + x) * 4;
      const r = idData[idx];
      const g = idData[idx + 1];
      const b = idData[idx + 2];
      const a = idData[idx + 3];

      if (a === 0) continue;

      const regionNum = r | (g << 8) | (b << 16);
      if (regionNum > 0 && regionNum <= regionCount) {
        sumR[regionNum] += origData[idx];
        sumG[regionNum] += origData[idx + 1];
        sumB[regionNum] += origData[idx + 2];
        pixelCounts[regionNum]++;

        // Adjacency check to the right
        if (x + 1 < width) {
          const rightIdx = (rowOffset + x + 1) * 4;
          if (idData[rightIdx + 3] > 0) {
            const rightNum = idData[rightIdx] | (idData[rightIdx + 1] << 8) | (idData[rightIdx + 2] << 16);
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
          const downIdx = ((y + 1) * width + x) * 4;
          if (idData[downIdx + 3] > 0) {
            const downNum = idData[downIdx] | (idData[downIdx + 1] << 8) | (idData[downIdx + 2] << 16);
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
      const fallbackIdx = (cy * width + cx) * 4;
      r = origData[fallbackIdx];
      g = origData[fallbackIdx + 1];
      b = origData[fallbackIdx + 2];
    }
    rawRgbList.push({ id: regionId, r, g, b, count });
  }

  // 4. Color Clumping / Palette Clustering with strict Adjacency Graph Constraints
  // Convert RGB to Lab for accurate perceptual distance
  function rgbToLab(r: number, g: number, b: number): [number, number, number] {
    let rN = r / 255;
    let gN = g / 255;
    let bN = b / 255;
    rN = rN > 0.04045 ? Math.pow((rN + 0.055) / 1.055, 2.4) : rN / 12.92;
    gN = gN > 0.04045 ? Math.pow((gN + 0.055) / 1.055, 2.4) : gN / 12.92;
    bN = bN > 0.04045 ? Math.pow((bN + 0.055) / 1.055, 2.4) : bN / 12.92;

    const x = (rN * 0.4124 + gN * 0.3576 + bN * 0.1805) / 0.95047;
    const y = (rN * 0.2126 + gN * 0.7152 + bN * 0.0722) / 1.0;
    const z = (rN * 0.0193 + gN * 0.1192 + bN * 0.9505) / 1.08883;

    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const fx = f(x);
    const fy = f(y);
    const fz = f(z);

    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }

  function deltaE(lab1: [number, number, number], lab2: [number, number, number]): number {
    return Math.hypot(lab1[0] - lab2[0], lab1[1] - lab2[1], lab1[2] - lab2[2]);
  }

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
    // Smooth stair-stepped pixel paths using shared-edge planar graph smoothing (gap-free)
    smoothPlanarSvgPaths(svgDoc);
  } else if (maybeImage.type === "err") {
    console.error(maybeImage);
    throw new Error(maybeImage.format?.toString());
  }

  // Parse output SVG
  svgDoc = await transformSVGForPainting(svgDoc!);

  // all the path/region
  const regionsDrawingInfo: MutableMap<ProcessedArtwork["regionsDrawingInfo"]> = new Map();
  const colorsAssignedToRegions: ProcessedArtwork["colorsAssignedToRegions"] = new Map();
  const regionsCurrentFillInfo: ProcessedArtwork["regionsCurrentFillInfo"] = new Map();
  const colorsFilledInRegions: ProcessedArtwork["colorsFilledInRegions"] = new Map();
  /** Region ID to the elements for creating brush stroke clipping paths */
  const regionSVGElements: Map<string, SVGElement> = new Map();

  // Add transparent color default mapping
  colorsAssignedToRegions.set(TRANSPARENT_HEX, new Set());
  colorsFilledInRegions.set(TRANSPARENT_HEX, new Set());
  // Add paintable color default mapping
  colorsFilledInRegions.set(PAINTABLE_REGION_HEX, new Set());

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
    const drawingInfo = {
      id: fillRegionId,
      neighbourRegionIds: sampledData?.adjacencyGraph.get(fillRegionId) || new Set<string>(),
      boundingBox: { width, height, x, y },
    };
    if (elementFill === "none") {
      // element was specifically instructed to not have a fill
      // still we add the region and assign it a transparent target fill
      regionsDrawingInfo.set(fillRegionId, {
        ...drawingInfo,
        fillColor: TRANSPARENT_HEX,
      });
      regionsCurrentFillInfo.set(fillRegionId, TRANSPARENT_HEX);
      colorsAssignedToRegions.get(TRANSPARENT_HEX)!.add(fillRegionId);
      colorsFilledInRegions.get(TRANSPARENT_HEX)!.add(fillRegionId);
    } else {
      let fillColor: string;
      if (sampledData && sampledData.regionColors.has(fillRegionId)) {
        fillColor = sampledData.regionColors.get(fillRegionId)!;
      } else {
        fillColor = elementFill ? getHexCode(elementFill) : "#00000000";
      }

      regionsDrawingInfo.set(fillRegionId, {
        ...drawingInfo,
        fillColor,
      });
      if (!colorsAssignedToRegions.has(fillColor)) {
        colorsAssignedToRegions.set(fillColor, new Set());
      }
      regionsCurrentFillInfo.set(fillRegionId, PAINTABLE_REGION_HEX);
      colorsAssignedToRegions.get(fillColor)!.add(fillRegionId);
      colorsFilledInRegions.get(PAINTABLE_REGION_HEX)!.add(fillRegionId);
    }

    // prepare for blank rendering colors will be applied afterwards
    fillElement.setAttribute("fill", regionsCurrentFillInfo.get(fillRegionId)!);
    fillElement.setAttribute("stroke", "none");
    fillElement.setAttribute("stroke-linejoin", "round");
  });
  document.body.removeChild(hiddenContainer);

  // remove all style elements after processing of layout and colors is done.
  renderNode.querySelectorAll("style").forEach((elem) => elem.remove());
  // remove all other elements from the perserved SVG
  renderNode.querySelectorAll(`*:not([${PRESERVE_ELEMENT_MARKER}]`).forEach((elem) => elem.remove());

  const width = processingImageWidthSignal.get();
  const height = processingImageHeightSignal.get();

  if (!renderNode.hasAttribute("viewBox")) {
    renderNode.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }

  // ensure final svg scales to container;
  renderNode.setAttribute("height", "100%");
  renderNode.setAttribute("width", "100%");

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
    const regions = Array.from(regionsDrawingInfo.values()).map((r) => ({ id: r.id, boundingBox: r.boundingBox }));
    const computedNeighbours = await runInWorker("COMPUTE_NEIGHBORS", { regions, expandPx });

    for (const [id, neighbours] of computedNeighbours) {
      const region = regionsDrawingInfo.get(id);
      if (region) {
        neighbours.forEach((nId: string) => region.neighbourRegionIds.add(nId));
      }
    }
  } catch (e) {
    console.error("Failed to compute region neighbors", e);
  }

  const artwork: ProcessedArtwork = {
    id: `art-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    name: artworkName,
    originalDataUrl: imageSrc,
    cartoonDataUrl: "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgDoc.outerHTML))),
    cartoonSVG: renderNode.outerHTML,
    width,
    height,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    /** A color can existing in here without a any region e.g. custom added colors */
    colorsAssignedToRegions,
    regionsDrawingInfo,
    // TODO: write helper functions for modifying these values
    colorsFilledInRegions,
    regionsCurrentFillInfo,
    brushStrokePaths: {},
  };

  return artwork;
}

export function renderArtworkToSVG(artwork: ProcessedArtwork) {
  const svgElem = parseSVG(artwork.cartoonSVG) as SVGSVGElement;
  updateArtworkSvgWithUserPaints(svgElem, artwork);
  return svgElem;
}

export function updateArtworkSvgWithUserPaints(svgElem: SVGSVGElement, artwork: ProcessedArtwork) {
  artwork.regionsCurrentFillInfo.forEach((currentFill, regionId) => {
    const fillElem = svgElem.querySelector(`[data-region-id="${regionId}"]`) as SVGElement;
    if (!fillElem) return;
    const fill = normalizeHex(currentFill) || TRANSPARENT_HEX;
    fillElem.setAttribute("fill", fill);

    const strokesContainer = svgElem.querySelector(`#brush-strokes-${regionId}`) as SVGGElement;
    if (!strokesContainer) return;

    const strokesRecord = artwork.brushStrokePaths[regionId];
    if (!strokesRecord || Object.keys(strokesRecord).length === 0) {
      // clear all the rendered strokes
      strokesContainer.innerHTML = "";
      return;
    }

    const strokeIds = Object.keys(strokesRecord);

    // Remove any children that are no longer in the strokesRecord
    Array.from(strokesContainer.children).forEach((child) => {
      const id = child.getAttribute("id");
      if (id && id.startsWith(`stroke-${regionId}_`)) {
        const strokeId = id.split("_").pop();
        if (!strokeId || !strokesRecord[strokeId]) {
          child.remove();
        }
      }
    });

    strokeIds.forEach((strokeId) => {
      const stroke = strokesRecord[strokeId];
      if (stroke.points.length <= 0) return; // this should not happen but in case
      const strokePathElemId = `stroke-${regionId}_${strokeId}`;
      let strokePathElem = strokesContainer.querySelector(`#${strokePathElemId}`) as SVGPathElement;
      if (!strokePathElem) {
        strokePathElem = document.createElementNS(XML_NS, "path");
        strokePathElem.setAttribute("fill", "none");
        strokePathElem.setAttribute("stroke-linecap", "round");
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
