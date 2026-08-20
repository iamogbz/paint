import { FALLBACK_IMAGE_SIZE_PX, FILLABLE_SVG_ELEMENTS_SELECTOR, PAINTABLE_REGION_HEX, TRANSPARENT_HEX } from "./constants.js";
import { enhanceBitmapForVectorization } from "./imageFilters.js";
import { processingImageHeightSignal, processingImageWidthSignal } from "../state/store.js";
import { MutableMap, ProcessedArtwork } from "../types";
import { getHexCode, normalizeHex } from "./color.js";
import { parseSVG, XML_NS } from "./html.js";

let _worker: Worker | null = null;
let _msgId = 0;
const _callbacks = new Map<number, { resolve: Function, reject: Function }>();

function getWorker() {
  if (!_worker) {
    _worker = new Worker(new URL('./imageProcessorWorker.ts', import.meta.url), { type: 'module' });
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

function parseSvgDimension(value) {
  if (!value) return 0;

  // Handle percentage strings explicitly if needed
  if (String(value).endsWith("%")) {
    return FALLBACK_IMAGE_SIZE_PX; // since we would be scaling the SVG regardless
  }

  const num = parseFloat(value);
  return isNaN(num) ? 0 : num;
}

async function loadImage(src: string): Promise<Readonly<({ type: "err"; data: unknown } | { type: "svg"; data: SVGElement } | { type: "bin"; data: HTMLImageElement }) & { format: string }>> {
  const response = await fetch(src);
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("image/")) {
    if (contentType.includes("image/svg+xml")) {
      const text = await response.text();
      const svgElement = parseSVG(text);
      if (svgElement) {
        processingImageWidthSignal.set(parseSvgDimension(svgElement.getAttribute("width")) || FALLBACK_IMAGE_SIZE_PX);
        processingImageHeightSignal.set(parseSvgDimension(svgElement.getAttribute("height")) || FALLBACK_IMAGE_SIZE_PX);
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
function downscaleCanvasMultiStep(
  source: HTMLCanvasElement | HTMLImageElement,
  targetWidth: number,
  targetHeight: number
): HTMLCanvasElement {
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
async function transformSVGForPainting(svg: SVGElement): Promise<SVGElement> {
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

export async function processImageToCartoonPalette(imageSrc: string, artworkName: string): Promise<ProcessedArtwork> {
  const maybeImage = await loadImage(imageSrc);

  let svgDoc: SVGElement | null = null;

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

    const origImgData = origCtx.getImageData(0, 0, imgWidth, imgHeight);

    // Apply bilateral filter & thresholded unsharp mask to bitmap images prior to vectorization
    enhanceBitmapForVectorization(origImgData);

    const rawPixels = origImgData.data;

    // Run vtracer in worker with optimized parameters
    const options = {
      /** default: color-cluster for true color image */
      clustering: "color-cluster",
      /** shapes disjoint with others */
      hierarchical: "cutout",
      /** Auto-quantize target color count */
      maxColors: 24,
      /** If a pallete is defined maps colors to this */
      // palette: palette,
      /** Discard patches smaller than X px in size (0..=128) */
      filterSpeckle: 4,
      /** default: 8 (best) - Significant bits per RGB channel (1..=8)  */
      colorPrecision: 8,
      pathPrecision: 8,
      /** Color difference between gradient layers (0..=255) */
      layerDifference: 16,
      /** Method for converting in to shapes. Values below only valid in spline */
      mode: "spline",
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
    svgDoc = parseSVG(svgStr.includes("xmlns=") ? svgStr : svgStr.replace("<svg", `<svg xmlns="${XML_NS}"`));
  } else if (maybeImage.type === "err") {
    console.error(maybeImage);
    throw new Error(maybeImage.format);
  }

  // Parse output SVG
  svgDoc = await transformSVGForPainting(svgDoc);

  // all the path/region
  const regionsDrawingInfo: MutableMap<ProcessedArtwork["regionsDrawingInfo"]> = new Map();
  const colorsAssignedToRegions: ProcessedArtwork["colorsAssignedToRegions"] = new Map();
  const regionsCurrentFillInfo: ProcessedArtwork["regionsCurrentFillInfo"] = new Map();
  /** Region ID to the elements for creating brush stroke clipping paths */
  const regionSVGElements: Map<string, SVGElement> = new Map();

  // Add transparent color default mapping
  colorsAssignedToRegions.set(TRANSPARENT_HEX, new Set());

  const renderNode = svgDoc.cloneNode(true) as typeof svgDoc;
  const hiddenContainer = document.createElement("div");
  hiddenContainer.style.position = "absolute";
  hiddenContainer.style.visibility = "hidden";
  hiddenContainer.style.pointerEvents = "none";
  hiddenContainer.appendChild(renderNode);
  document.body.appendChild(hiddenContainer);

  const PRESERVE_ELEMENT_MARKER = "paint-preserve";
  const selectorNotInDefElement = `:is(${FILLABLE_SVG_ELEMENTS_SELECTOR})`;

  const preservedTreeElements = new Set<SVGElement>();
  const allFillableElements = renderNode.querySelectorAll<SVGElementTagNameMap[typeof FILLABLE_SVG_ELEMENTS_SELECTOR]>(selectorNotInDefElement);
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
    const elementFill = computedStyle.get("fill").toString();

    // skip elements in defintions
    if (fillElement.closest("defs") !== null) {
      return;
    }

    const drawingInfo = {
      id: fillRegionId,
      neighbourRegionIds: new Set<string>(),
    };
    if (elementFill === "none") {
      // element was specifically instructed to not have a fill
      // still we add the region and assign it a transparent target fill
      regionsDrawingInfo.set(fillRegionId, {
        ...drawingInfo,
        fillColor: TRANSPARENT_HEX,
        boundingBox: null,
      });
      colorsAssignedToRegions.get(TRANSPARENT_HEX).add(fillRegionId);
    } else {
      // a fill was set, normalise the hex value and add it
      // but it starts as white to be filled in
      const fillColor = getHexCode(elementFill);
      const { width, height, x, y } = fillElement.getBBox();
      regionsDrawingInfo.set(fillRegionId, {
        ...drawingInfo,
        fillColor,
        boundingBox: { width, height, x, y },
      });
      if (!colorsAssignedToRegions.has(fillColor)) {
        colorsAssignedToRegions.set(fillColor, new Set());
      }
      regionsCurrentFillInfo.set(fillRegionId, PAINTABLE_REGION_HEX);
      colorsAssignedToRegions.get(fillColor).add(fillRegionId);
    }

    // prepare for blank rendering colors will be applied afterwards
    const isTransparentRegion = regionsDrawingInfo.get(fillRegionId).fillColor === TRANSPARENT_HEX;
    const fill = regionsCurrentFillInfo.get(fillRegionId) || (isTransparentRegion ? "none" : PAINTABLE_REGION_HEX);

    fillElement.setAttribute("fill", fill);
    fillElement.setAttribute("stroke", "none");
    fillElement.setAttribute("stroke-linejoin", "round");
    // TODO: decide if transparent regions should be interactable
    // For deferring setting them as not interactable to when the svg is rendered to the user
    // fillElement.setAttribute("touch-actions", isTransparentRegion ? "none" : "all");
    // fillElement.setAttribute("pointer-events", isTransparentRegion ? "none" : "all");
  });
  document.body.removeChild(hiddenContainer);

  // remove all style elements after processing of layout and colors is done.
  renderNode.querySelectorAll("style").forEach((elem) => elem.remove());
  // remove all other elements from the perserved SVG
  renderNode.querySelectorAll(`*:not([${PRESERVE_ELEMENT_MARKER}]`).forEach((elem) => elem.remove());

  if (!renderNode.hasAttribute("viewBox")) {
    const w = renderNode.getAttribute("width") || processingImageWidthSignal.get();
    const h = renderNode.getAttribute("height") || processingImageHeightSignal.get();
    renderNode.setAttribute("viewBox", `0 0 ${parseFloat(String(w))} ${parseFloat(String(h))}`);
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
    maskElem.setAttribute("touch-actions", "none");
    maskElem.setAttribute("pointer-events", "none");
    clipPath.appendChild(maskElem);
    brushStrokeDefElem.append(clipPath);

    const brushStrokesContainer = document.createElementNS(XML_NS, "g") as SVGGElement;
    brushStrokesContainer.setAttribute("id", `brush-strokes-${regionId}`);
    brushStrokesContainer.setAttribute("clip-path", `url(#${clipMaskId})`);
    renderNode.append(brushStrokesContainer);
  });

  try {
    const imgWidth = processingImageWidthSignal.get() || FALLBACK_IMAGE_SIZE_PX;
    const imgHeight = processingImageHeightSignal.get() || FALLBACK_IMAGE_SIZE_PX;
    const maxDim = Math.max(imgWidth, imgHeight);
    const expandPx = Math.max(8, maxDim * 0.015);
    const regions = Array.from(regionsDrawingInfo.values()).map(r => ({ id: r.id, boundingBox: r.boundingBox }));
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
    width: processingImageWidthSignal.get(),
    height: processingImageHeightSignal.get(),
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    /** A color can existing in here without a any region e.g. custom added colors */
    colorsAssignedToRegions,
    regionsDrawingInfo,
    // Two maps cause what even are bidirectional maps in JS
    colorsFilledInRegions: new Map(),
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
        strokePathElem.setAttribute("touch-actions", "none");
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
