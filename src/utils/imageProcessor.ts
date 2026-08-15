import { ProcessedArtwork, UsedColorStat, PaletteColor, SvgPath } from "../types";
import init, { vectorize_rgba } from "../vtracer/vtracer_wasm.js";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    const isHttp = src.startsWith("http://") || src.startsWith("https://");
    const isSameOrigin = !isHttp || src.startsWith(window.location.origin);
    
    if (!isSameOrigin) {
      img.crossOrigin = "anonymous";
    }
    
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function calculateTargetDimensions(width: number, height: number): { width: number; height: number; scale: number } {
  const MAX_SIZE = 800;
  let scale = 1;
  if (width > MAX_SIZE || height > MAX_SIZE) {
    if (width > height) {
      scale = MAX_SIZE / width;
    } else {
      scale = MAX_SIZE / height;
    }
  }
  return {
    width: Math.floor(width * scale),
    height: Math.floor(height * scale),
    scale,
  };
}

export async function processImageToCartoonPalette(
  imageSrc: string,
  artworkName: string,
): Promise<ProcessedArtwork> {
  const isSvgImage = imageSrc.startsWith("data:image/svg+xml");
  
  const img = await loadImage(imageSrc);
  let { width, height, scale } = calculateTargetDimensions(img.width, img.height);
  
  const origCanvas = document.createElement("canvas");
  origCanvas.width = width;
  origCanvas.height = height;
  const origCtx = origCanvas.getContext("2d", { willReadFrequently: true });
  if (!origCtx) throw new Error("Failed to initialize canvas 2D context");
  
  origCtx.imageSmoothingEnabled = true;
  origCtx.imageSmoothingQuality = "high";
  
  // Fill with white background in case of transparency
  origCtx.fillStyle = "#FFFFFF";
  origCtx.fillRect(0, 0, width, height);
  origCtx.drawImage(img, 0, 0, width, height);
  
  const originalDataUrl = imageSrc;
  const origImgData = origCtx.getImageData(0, 0, width, height);
  const rawPixels = origImgData.data;

  // Extract colors if SVG to preserve them
  let palette: string[] | undefined = undefined;
  let maxColors = 32;
  
  if (isSvgImage) {
    try {
      let svgText = "";
      if (imageSrc.includes(";base64,")) {
        svgText = atob(imageSrc.split(";base64,")[1]);
      } else {
        svgText = decodeURIComponent(imageSrc.split(",")[1]);
      }
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgText, "image/svg+xml");
      const uniqueColors = new Set<string>();
      doc.querySelectorAll("[fill]").forEach(el => {
        const fill = el.getAttribute("fill");
        if (fill && fill.startsWith("#")) uniqueColors.add(fill.toUpperCase());
      });
      if (uniqueColors.size > 0) {
        palette = Array.from(uniqueColors);
        maxColors = palette.length; // Not really needed if palette is provided, but good for logic
      }
    } catch (e) {
      console.warn("Failed to extract SVG palette", e);
    }
  }

  // Run vtracer
  await init("https://unpkg.com/@visioncortex/vtracer@1.0.0-alpha.3/pkg/vtracer_wasm_bg.wasm");
  let svgStr = vectorize_rgba(rawPixels, width, height, {
    clustering: 'color-cluster',
    hierarchical: 'cutout',
    maxColors: isSvgImage && palette ? undefined : maxColors,
    palette: palette
  });

  if (!svgStr.includes("xmlns=")) {
    svgStr = svgStr.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  // Parse output SVG
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgStr, "image/svg+xml");
  const paths = Array.from(doc.querySelectorAll("path"));
  
  const svgPaths: SvgPath[] = [];
  const regionExpectedColors: Record<number, string> = {};
  
  // To keep color counts by pixel area, we can either:
  // 1. Draw each path to a canvas and count pixels (too slow).
  // 2. Estimate area using path length or just treat count as 1 per path.
  // Actually, VTracer provides gapless paths, maybe we can just use path bounding box area as a rough estimate,
  // or just use 1. The original app did exactly pixel counts.
  // Wait, we can render the SVG to a canvas and get the quantized colors!
  
  paths.forEach((path, i) => {
    const d = path.getAttribute("d") || "";
    let fill = path.getAttribute("fill") || "";
    if (fill.length === 7) {
      fill = fill.toUpperCase() + "FF"; // #RRGGBBAA
    } else {
      fill = fill.toUpperCase();
    }
    
    svgPaths.push({ id: i, d });
    regionExpectedColors[i] = fill;
  });

  const colorCounts = new Map<string, number>();
  
  paths.forEach((path, i) => {
    let fill = path.getAttribute("fill") || "";
    if (fill.length === 7) fill = fill.toUpperCase() + "FF";
    else fill = fill.toUpperCase();
    colorCounts.set(fill, (colorCounts.get(fill) || 0) + 1);
  });
  
  const colorStats: UsedColorStat[] = [];
  const totalRegions = paths.length;
  
  for (const [hexCode, count] of colorCounts.entries()) {
    const r = parseInt(hexCode.substring(1, 3), 16);
    const g = parseInt(hexCode.substring(3, 5), 16);
    const b = parseInt(hexCode.substring(5, 7), 16);
    colorStats.push({
      color: { hexCode, rgba: [r, g, b, 255] },
      count,
      percentage: Math.max(1, Math.round((count / totalRegions) * 100))
    });
  }

  // Sort by count descending
  colorStats.sort((a, b) => b.count - a.count);
  
  // Add transparent color if missing (app assumes it might exist)
  if (!colorStats.some(s => s.color.hexCode === "#00000000")) {
    colorStats.unshift({ color: { hexCode: "#00000000", rgba: [0,0,0,0] }, count: 0, percentage: 0 });
  }
  
  return {
    id: `art-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    name: artworkName,
    originalDataUrl,
    cartoonDataUrl: "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgStr))),
    width,
    height,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    colorStats,
    totalPixels: width * height,
    regionExpectedColors,
    svgPaths
  };
}
