import init, { vectorize_rgba } from "../vtracer/vtracer_wasm.js";
import { ProcessedArtwork, UsedColorStat, SvgPath } from "../types";
import { hexToRgb, normalizeHex } from "./color.js";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function resolveAttribute(
  element: Element,
  attrName: string,
  svgDoc: Document
): string | null {
  let curr: Element | null = element;
  while (curr && curr.tagName.toLowerCase() !== "svg") {
    const val = curr.getAttribute(attrName);
    if (val) return val;
    curr = curr.parentElement;
  }
  return svgDoc.documentElement.getAttribute(attrName);
}

function elementToPathD(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (tag === "path") {
    return el.getAttribute("d") || "";
  }
  if (tag === "rect") {
    const x = parseFloat(el.getAttribute("x") || "0");
    const y = parseFloat(el.getAttribute("y") || "0");
    const w = parseFloat(el.getAttribute("width") || "0");
    const h = parseFloat(el.getAttribute("height") || "0");
    return `M ${x} ${y} h ${w} v ${h} h ${-w} z`;
  }
  if (tag === "circle") {
    const cx = parseFloat(el.getAttribute("cx") || "0");
    const cy = parseFloat(el.getAttribute("cy") || "0");
    const r = parseFloat(el.getAttribute("r") || "0");
    return `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0 z`;
  }
  if (tag === "ellipse") {
    const cx = parseFloat(el.getAttribute("cx") || "0");
    const cy = parseFloat(el.getAttribute("cy") || "0");
    const rx = parseFloat(el.getAttribute("rx") || "0");
    const ry = parseFloat(el.getAttribute("ry") || "0");
    return `M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${rx * 2} 0 a ${rx} ${ry} 0 1 0 ${-rx * 2} 0 z`;
  }
  if (tag === "line") {
    const x1 = parseFloat(el.getAttribute("x1") || "0");
    const y1 = parseFloat(el.getAttribute("y1") || "0");
    const x2 = parseFloat(el.getAttribute("x2") || "0");
    const y2 = parseFloat(el.getAttribute("y2") || "0");
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }
  if (tag === "polygon" || tag === "polyline") {
    const pointsStr = el.getAttribute("points") || "";
    const coords = pointsStr
      .trim()
      .split(/[\s,]+/)
      .map(parseFloat)
      .filter((v) => !isNaN(v));
    if (coords.length < 4) return "";
    let path = `M ${coords[0]} ${coords[1]}`;
    for (let i = 2; i < coords.length; i += 2) {
      path += ` L ${coords[i]} ${coords[i + 1]}`;
    }
    if (tag === "polygon") path += " Z";
    return path;
  }
  return "";
}

const DX = [0, 1, 1, 1, 0, -1, -1, -1];
const DY = [-1, -1, 0, 1, 1, 1, 0, -1];

function traceContour(
  startX: number,
  startY: number,
  id: number,
  width: number,
  height: number,
  data32: Uint32Array,
  visited: Uint8Array
): Array<{ x: number; y: number }> | null {
  const points: Array<{ x: number; y: number }> = [];

  let x = startX;
  let y = startY;
  let backtrackDir = 6; // West

  const firstX = startX;
  const firstY = startY;

  let iter = 0;
  const maxIterations = 50000;
  const pathSet = new Set<string>();

  while (iter++ < maxIterations) {
    points.push({ x, y });
    visited[y * width + x] = 1;

    let foundNext = false;
    let nextX = -1;
    let nextY = -1;
    let nextDir = -1;

    const searchStart = (backtrackDir + 1) % 8;
    for (let i = 0; i < 8; i++) {
      const dir = (searchStart + i) % 8;
      const nx = x + DX[dir];
      const ny = y + DY[dir];

      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const val = data32[ny * width + nx] & 0x00ffffff;
        if (val === id) {
          nextX = nx;
          nextY = ny;
          nextDir = dir;
          foundNext = true;
          break;
        }
      }
    }

    if (!foundNext) {
      break;
    }

    if (nextX === firstX && nextY === firstY && points.length > 1) {
      break;
    }

    backtrackDir = (nextDir + 4) % 8;
    x = nextX;
    y = nextY;

    const coordKey = `${x},${y}`;
    if (pathSet.has(coordKey) && x === firstX && y === firstY) {
      break;
    }
    pathSet.add(coordKey);
  }

  return points;
}

function getOrthogonalDistance(
  p: { x: number; y: number },
  lineStart: { x: number; y: number },
  lineEnd: { x: number; y: number }
): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;

  const mag = Math.sqrt(dx * dx + dy * dy);
  if (mag === 0) {
    return Math.sqrt((p.x - lineStart.x) ** 2 + (p.y - lineStart.y) ** 2);
  }

  return (
    Math.abs(
      dy * p.x -
        dx * p.y +
        lineEnd.x * lineStart.y -
        lineEnd.y * lineStart.x
    ) / mag
  );
}

function simplifyPath(
  points: Array<{ x: number; y: number }>,
  epsilon: number
): Array<{ x: number; y: number }> {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let index = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const dist = getOrthogonalDistance(points[i], points[0], points[end]);
    if (dist > maxDist) {
      index = i;
      maxDist = dist;
    }
  }

  if (maxDist > epsilon) {
    const results1 = simplifyPath(points.slice(0, index + 1), epsilon);
    const results2 = simplifyPath(points.slice(index), epsilon);
    return results1.slice(0, results1.length - 1).concat(results2);
  } else {
    return [points[0], points[end]];
  }
}

interface TracedContour {
  pathD: string;
  points: Array<{ x: number; y: number }>;
}

function isPointInPolygon(
  p: { x: number; y: number },
  polygon: Array<{ x: number; y: number }>
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;

    const intersect =
      yi > p.y !== yj > p.y &&
      p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

interface ContourGroup {
  outer: TracedContour;
  holes: TracedContour[];
}

function groupContoursByHierarchy(contours: TracedContour[]): ContourGroup[] {
  const getArea = (pts: Array<{ x: number; y: number }>) => {
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    }
    return Math.abs(area) / 2;
  };

  const contoursWithArea = contours.map((c) => ({
    contour: c,
    area: getArea(c.points),
  }));
  contoursWithArea.sort((a, b) => b.area - a.area);

  const groups: ContourGroup[] = [];

  for (const item of contoursWithArea) {
    const c = item.contour;
    let parentGroup: ContourGroup | null = null;

    for (const g of groups) {
      if (isPointInPolygon(c.points[0], g.outer.points)) {
        parentGroup = g;
      }
    }

    if (parentGroup) {
      parentGroup.holes.push(c);
    } else {
      groups.push({ outer: c, holes: [] });
    }
  }

  return groups;
}

function findAndTraceContours(
  id: number,
  width: number,
  height: number,
  data32: Uint32Array,
  scale: number
): TracedContour[] {
  const contours: TracedContour[] = [];
  const visited = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const pixel = data32[idx] & 0x00ffffff;

      if (pixel === id && visited[idx] === 0) {
        let isBoundary = false;
        if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
          isBoundary = true;
        } else {
          if (
            (data32[idx - 1] & 0x00ffffff) !== id ||
            (data32[idx + 1] & 0x00ffffff) !== id ||
            (data32[idx - width] & 0x00ffffff) !== id ||
            (data32[idx + width] & 0x00ffffff) !== id
          ) {
            isBoundary = true;
          }
        }

        if (isBoundary) {
          const points = traceContour(x, y, id, width, height, data32, visited);
          if (points && points.length > 2) {
            const scaledPoints = points.map((p) => ({
              x: p.x / scale,
              y: p.y / scale,
            }));

            const simplified = simplifyPath(scaledPoints, 0.4);

            if (simplified.length > 2) {
              const pathD =
                simplified
                  .map(
                    (p, idx) =>
                      `${idx === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(
                        2
                      )}`
                  )
                  .join(" ") + " Z";
              contours.push({ pathD, points: simplified });
            }
          }
        }
      }
    }
  }

  return contours;
}

interface DrawAction {
  type: "fill" | "stroke";
  pathD: string;
  color: string;
  strokeWidth: number;
  lineCap: string;
  lineJoin: string;
}

/**
 * Turns svg outlines into paths and fragments overlapping shapes into non-overlapping islands.
 */
async function transformSVGForPainting(
  rawSvgString: string
): Promise<SVGElement> {
  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(rawSvgString, "image/svg+xml");

  if (!(svgDoc.documentElement instanceof SVGElement)) {
    const errorMsg = "Failed to parse SVG document";
    console.error(errorMsg, svgDoc.documentElement);
    throw Error(errorMsg);
  }

  // 1. Resolve ViewBox and base dimensions
  let viewBoxWidth = 800;
  let viewBoxHeight = 800;
  const viewBox = svgDoc.documentElement.getAttribute("viewBox");
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/);
    if (parts.length === 4) {
      viewBoxWidth = parseFloat(parts[2]);
      viewBoxHeight = parseFloat(parts[3]);
    }
  } else {
    const wAttr = svgDoc.documentElement.getAttribute("width");
    const hAttr = svgDoc.documentElement.getAttribute("height");
    if (wAttr) viewBoxWidth = parseFloat(wAttr);
    if (hAttr) viewBoxHeight = parseFloat(hAttr);
  }

  // 2. Setup Ultra High-Resolution Canvas
  const TARGET_MAX_DIM = 2400;
  const scale = Math.max(
    1,
    TARGET_MAX_DIM / Math.max(viewBoxWidth, viewBoxHeight)
  );
  const canvasWidth = Math.round(viewBoxWidth * scale);
  const canvasHeight = Math.round(viewBoxHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("Failed to initialize canvas 2D context");
  }
  ctx.imageSmoothingEnabled = false;

  // Clear to fully transparent
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // 3. Traverse all renderable vector elements sequentially to preserve DOM order
  const elements = Array.from(
    svgDoc.querySelectorAll("path, polygon, polyline, rect, circle, ellipse, line")
  );

  const drawActions: DrawAction[] = [];
  elements.forEach((el) => {
    const pathD = elementToPathD(el);
    if (!pathD) return;

    // Resolve Fill style
    let fill = resolveAttribute(el, "fill", svgDoc);
    if (fill === "none") fill = "#00000000";
    if (!fill) fill = "#000000FF"; // Default SVG fill

    // Resolve Stroke style
    let stroke = resolveAttribute(el, "stroke", svgDoc);
    if (stroke === "none") stroke = "";
    const strokeWidthAttr = resolveAttribute(el, "stroke-width", svgDoc);
    const strokeWidth = strokeWidthAttr ? parseFloat(strokeWidthAttr) : 0;
    const lineCap = resolveAttribute(el, "stroke-linecap", svgDoc) || "butt";
    const lineJoin = resolveAttribute(el, "stroke-linejoin", svgDoc) || "miter";

    // Fill Action
    const normalizedFill = normalizeHex(fill);
    if (normalizedFill && normalizedFill !== "#00000000") {
      drawActions.push({
        type: "fill",
        pathD,
        color: normalizedFill,
        strokeWidth: 0,
        lineCap: "butt",
        lineJoin: "miter",
      });
    }

    // Stroke Action
    if (stroke && strokeWidth > 0) {
      const normalizedStroke = normalizeHex(stroke);
      if (normalizedStroke && normalizedStroke !== "#00000000") {
        drawActions.push({
          type: "stroke",
          pathD,
          color: normalizedStroke,
          strokeWidth,
          lineCap,
          lineJoin,
        });
      }
    }
  });

  // 4. Render Draw Actions to High-Res Canvas using unique ID colors
  const actionColors: string[] = []; // index maps to original color hex
  ctx.save();
  ctx.scale(scale, scale);

  drawActions.forEach((action, i) => {
    const actionId = i + 1; // 1-indexed (0 is transparent background)
    actionColors[actionId] = action.color;

    const r = actionId & 0xff;
    const g = (actionId >> 8) & 0xff;
    const b = (actionId >> 16) & 0xff;
    const idColorStr = `rgb(${r},${g},${b})`;

    ctx.fillStyle = idColorStr;
    ctx.strokeStyle = idColorStr;

    const path2d = new Path2D(action.pathD);

    if (action.type === "fill") {
      ctx.fill(path2d);
      // Symmetrically dilate by 1.0px to close any hairline gaps between adjacent regions
      ctx.lineWidth = 1.0;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke(path2d);
    } else {
      ctx.lineWidth = action.strokeWidth;
      ctx.lineCap = action.lineCap as CanvasLineCap;
      ctx.lineJoin = action.lineJoin as CanvasLineJoin;
      ctx.stroke(path2d);
    }
  });

  ctx.restore();

  // 5. Read back pixel buffer to find and trace visible regions
  const imgData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
  const buf = new ArrayBuffer(imgData.data.length);
  const buf8 = new Uint8ClampedArray(buf);
  const data32 = new Uint32Array(buf);
  buf8.set(imgData.data);

  // Find all unique visible action IDs
  const visibleIdsSet = new Set<number>();
  for (let i = 0; i < data32.length; i++) {
    const val = data32[i] & 0x00ffffff;
    if (val !== 0) {
      visibleIdsSet.add(val);
    }
  }

  // 6. Trace contours and construct final flattened SVG
  const resultSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  resultSvg.setAttribute("viewBox", `0 0 ${viewBoxWidth} ${viewBoxHeight}`);
  resultSvg.setAttribute("width", viewBoxWidth.toString());
  resultSvg.setAttribute("height", viewBoxHeight.toString());

  const sortedIds = Array.from(visibleIdsSet).sort((a, b) => a - b);

  sortedIds.forEach((id) => {
    const originalColor = actionColors[id];
    if (!originalColor) return;

    // Trace contours of this ID
    const contours = findAndTraceContours(
      id,
      canvasWidth,
      canvasHeight,
      data32,
      scale
    );

    // Group contours hierarchically so isolated islands are split into individual paths,
    // while holes are properly combined inside their outer shapes using evenodd.
    const groups = groupContoursByHierarchy(contours);

    groups.forEach((g) => {
      const subpaths = [g.outer.pathD];
      g.holes.forEach((h) => {
        subpaths.push(h.pathD);
      });

      const pathEl = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );
      pathEl.setAttribute("d", subpaths.join(" "));
      pathEl.setAttribute("fill", originalColor);
      if (g.holes.length > 0) {
        pathEl.setAttribute("fill-rule", "evenodd");
      }
      resultSvg.appendChild(pathEl);
    });
  });

  return resultSvg;
}

export async function processImageToCartoonPalette(
  imageSrc: string,
  artworkName: string
): Promise<ProcessedArtwork> {
  const isSvgImage = imageSrc.startsWith("data:image/svg+xml");
  const defaultDimensionPx = "800";

  let svgStr = "";

  if (isSvgImage) {
    if (imageSrc.includes(";base64,")) {
      svgStr = atob(imageSrc.split(";base64,")[1]);
    } else {
      svgStr = decodeURIComponent(imageSrc.split(",")[1]);
    }
  } else {
    const img = await loadImage(imageSrc);

    const origCanvas = document.createElement("canvas");
    origCanvas.width = img.width;
    origCanvas.height = img.height;
    const origCtx = origCanvas.getContext("2d", { willReadFrequently: true });
    if (!origCtx) throw new Error("Failed to initialize canvas 2D context");

    origCtx.imageSmoothingEnabled = false;
    origCtx.imageSmoothingQuality = "high";

    // Fill with white background in case of transparency
    origCtx.fillStyle = "#FFFFFF";
    origCtx.fillRect(0, 0, img.width, img.height);
    origCtx.drawImage(img, 0, 0, img.width, img.height);

    const origImgData = origCtx.getImageData(0, 0, img.width, img.height);
    const rawPixels = origImgData.data;

    // Run vtracer
    await init(
      "https://unpkg.com/@visioncortex/vtracer@1.0.0-alpha.3/pkg/vtracer_wasm_bg.wasm"
    );
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
      // filterSpeckle: Math.min(Math.round(Math.max(img.width, img.height) / 1920 * 4), 128),
      /** default: 8 (best) - Significant bits per RGB channel (1..=8)  */
      // colorPrecision: 8,
      /** Color difference between gradient layers (0..=255) */
      // layerDifference: 48,
      /** Method for converting in to shapes. Values below only valid in spline */
      // mode: 'spline',
      /** default: 60, Minimum Momentary Angle (in degrees) to be considered a corner (to be kept after smoothing) */
      // cornerThreshold: 60,
      /** default: 4, Perform Iterative Subdivide Smooth until all segments are shorter than this length <3.5..=10> */
      // lengthThreshold: 4,
      /** default: 45, Minimum Angle Displacement (in degrees) to be considered a cutting point between curves <0..=180> */
      // spliceThreshold: 45, // default: 45
      /** default: off, Simplify curves: fewest cubics within this tolerance in px (try 1–2.5) */
      // simplify: 2,
    };
    svgStr = vectorize_rgba(rawPixels, img.width, img.height, options);

    if (!svgStr.includes("xmlns=")) {
      svgStr = svgStr.replace(
        "<svg",
        '<svg xmlns="http://www.w3.org/2000/svg"'
      );
    }
  }

  // Parse output SVG
  const svgDoc = await transformSVGForPainting(svgStr);

  const uniqueColors = new Set<string>();
  svgDoc.querySelectorAll("[fill]").forEach((el) => {
    const fill = el.getAttribute("fill");
    if (fill && fill.startsWith("#")) uniqueColors.add(fill.toUpperCase());
  });

  const svgPaths: SvgPath[] = [];
  const regionExpectedColors: Record<number, string> = {};
  const colorCounts = new Map<string, number>();

  const paths = Array.from(svgDoc.querySelectorAll("path"));
  paths.forEach((path, i) => {
    const d = path.getAttribute("d") || "";
    let fill = path.getAttribute("fill") || "";

    let parent = path.parentElement;
    while ((!fill || fill === "none") && parent) {
      fill = parent.getAttribute("fill");
      parent = parent.tagName === "svg" ? null : parent.parentElement;
    }

    const finalFill = normalizeHex(fill);
    // this is a safety check to ensure that we only include paths with valid fill colors
    // should not happen but just in case
    if (finalFill) {
      svgPaths.push({ id: i, d });
      regionExpectedColors[i] = finalFill;
      colorCounts.set(finalFill, (colorCounts.get(finalFill) || 0) + 1);
    }
  });

  const colorStats: UsedColorStat[] = [];
  const totalRegions = paths.length;

  for (const [hexCode, count] of colorCounts.entries()) {
    const rgba = hexToRgb(hexCode);
    colorStats.push({
      color: { hexCode, rgba },
      count,
      percentage: Math.max(1, Math.round((count / totalRegions) * 100)),
    });
  }

  // Sort by count descending
  colorStats.sort((a, b) => b.count - a.count);

  // Add transparent color if missing (app assumes it might exist)
  if (!colorStats.some((s) => s.color.hexCode === "#00000000")) {
    colorStats.unshift({
      color: { hexCode: "#00000000", rgba: [0, 0, 0, 0] },
      count: 0,
      percentage: 0,
    });
  }

  const width = parseInt(svgDoc.getAttribute("width") || defaultDimensionPx);
  const height = parseInt(svgDoc.getAttribute("height") || defaultDimensionPx);

  return {
    id: `art-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    name: artworkName,
    originalDataUrl: imageSrc,
    cartoonDataUrl:
      "data:image/svg+xml;base64," +
      btoa(unescape(encodeURIComponent(svgDoc.outerHTML))),
    width,
    height,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    colorStats,
    regionExpectedColors,
    svgPaths,
  };
}
