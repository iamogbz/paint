import init, { vectorize_rgba } from "../vtracer/vtracer_wasm.js";
import { ProcessedArtwork, UsedColorStat, SvgPath } from "../types";
import { getColorProperties, hexToRgb, normalizeHex } from "./color.js";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
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

    // TODO
    // 1. turn all the strokes with >0 widths into paths, the stroke color is now the fill and the new path has no stroke
    // 2. check all the paths in the document including the strokes that just got turned to paths and divide them into unique islands until they are no overlapping paths
    // 3. make sure that the fills for all paths even if was assigned by inheritance are preserved during the previous step
    // 4. parse the generated svg and return it for processing
  }

  // assign black fill to all elements without a fill attribute
  // this solve the issue of some paths needing to be rendered as black by default
  // but introduces an issue where elements that can not be painted are added to the region count
  svgDoc.querySelectorAll("*:not([fill])").forEach((el) => {
    el.setAttribute("fill", "#000000FF");
  });

  // assign transparent fill to all elements with fill="none"
  // this solve the issue of including transparent regions as places that can be filled in
  // however when the splitting of overlapping region occurs transparent sections should not win over coloured sections
  svgDoc.querySelectorAll("[fill='none']").forEach((el) => {
    el.setAttribute("fill", "#00000000");
  });

  const svgElement = svgDoc.documentElement;

  return svgElement;
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
      maxColors: 64,
      /** If a pallete is defined maps colors to this */
      // palette: palette,
      /** Discard patches smaller than X px in size (0..=128) */
      // filterSpeckle: Math.min(Math.round(Math.max(img.width, img.height) / 1920 * 4), 128),
      /** default: 8 (best) - Significant bits per RGB channel (1..=8)  */
      colorPrecision: 8,
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
      fill = parent.getAttribute("fill") || "";
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
    if (rgba) {
      colorStats.push({
        color: { hexCode, rgba },
        count,
        percentage: Math.max(1, Math.round((count / totalRegions) * 100)),
      });
    }
  }

  // Sort by count descending
  colorStats.sort((a, b) => {
    const colorA = getColorProperties(a.color.hexCode);
    const colorB = getColorProperties(b.color.hexCode);

    if (colorA.isGray !== colorB.isGray) {
      return colorA.isGray ? 1 : -1; // Grays last
    }

    if (colorA.isGray) {
      // Both are grays. Sort by brightness (value/luminance) ascending (dark to light)
      return colorA.v - colorB.v;
    }

    // Both are chromatic colors.
    // Group by Hue in 15-degree bands for stable and smooth gradient flows
    const hueGroupA = Math.floor(colorA.h / 15);
    const hueGroupB = Math.floor(colorB.h / 15);

    if (hueGroupA !== hueGroupB) {
      return hueGroupA - hueGroupB;
    }

    // Within the same hue group, sort by Saturation descending, then Value descending
    if (Math.abs(colorA.s - colorB.s) > 0.05) {
      return colorB.s - colorA.s;
    }
    return colorB.v - colorA.v;
  });

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
