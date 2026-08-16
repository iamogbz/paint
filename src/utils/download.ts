import { jsPDF } from "jspdf";
import "svg2pdf.js";
import { ProcessedArtwork } from "../types";

export function exportArtworkCleanDataUrl(artwork: ProcessedArtwork, overrideWidth?: number, overrideHeight?: number): string {
  if (artwork.svgPaths) {
    const originalW = artwork.width;
    const originalH = artwork.height;
    const w = overrideWidth || originalW;
    const h = overrideHeight || originalH;
    const paintedState = artwork.paintedRegionsState || {};

    let svgContent = `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${originalW} ${originalH}">`;

    const hasBrushStrokes = artwork.brushStrokePaths && Object.values(artwork.brushStrokePaths).some(
      (strokes) => strokes && strokes.length > 0
    );

    if (hasBrushStrokes) {
      svgContent += "<defs>";
      for (const path of artwork.svgPaths) {
        svgContent += `<clipPath id="mask-${path.id}"><path d="${path.d}" /></clipPath>`;
      }
      svgContent += "</defs>";
    }

    for (const path of artwork.svgPaths) {
        const paintedColor = paintedState[path.id];
        const expectedColor = artwork.regionExpectedColors?.[path.id];
        let fill = paintedColor;
        if (!fill) {
            fill = expectedColor === "#00000000" ? "none" : "#FFFFFF";
        }
        svgContent += `<path xmlns="http://www.w3.org/2000/svg" d="${path.d}" fill="${fill}" />`;
    }

    if (hasBrushStrokes && artwork.brushStrokePaths) {
      for (const path of artwork.svgPaths) {
        const strokes = artwork.brushStrokePaths[path.id] || [];
        const validStrokes = strokes.filter((s) => s.points && s.points.length > 0);
        if (validStrokes.length > 0) {
          svgContent += `<g clip-path="url(#mask-${path.id})">`;
          for (const stroke of validStrokes) {
            const dStr = stroke.points
              .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
              .join(" ");
            svgContent += `<path d="${dStr}" fill="none" stroke="${stroke.stroke}" stroke-width="${stroke.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />`;
          }
          svgContent += "</g>";
        }
      }
    }

    svgContent += `</svg>`;
    return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgContent)));
  }
  return artwork.cartoonDataUrl;
}
export async function downloadImage(dataUrl: string, filename: string): Promise<void> {
  if (!dataUrl) return;

  try {
    // 1. Convert base64 data URL to Blob & File
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const mimeType = blob.type || "image/png";
    const extension = mimeType.includes("svg") ? "svg" : (mimeType.split("/")[1] || "png");
    const fullFilename = filename.endsWith(`.${extension}`) ? filename : `${filename}.${extension}`;
    const file = new File([blob], fullFilename, { type: mimeType });

    // 2. Try Web Share API (Mobile Safari / Android Chrome share sheet - allows direct saving to Photos)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: fullFilename,
        });
        return;
      } catch (shareErr: any) {
        // If user cancelled the share dialog (AbortError), don't trigger error fallback
        if (shareErr?.name === "AbortError") {
          return;
        }
        console.warn("Web Share failed, falling back to Blob URL download:", shareErr);
      }
    }

    // 3. Try Blob URL download (DOM link click)
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = fullFilename;
    link.target = "_blank";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  } catch (err) {
    console.warn("Blob/Fetch conversion failed, attempting direct link click:", err);
    try {
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = filename;
      link.target = "_blank";
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (directErr) {
      console.error("Direct link click download failed:", directErr);
    }
  }
}

export async function exportArtworkHighResPng(artwork: ProcessedArtwork): Promise<string> {
  const TARGET_LONGEST_SIDE = 8192; // 8K resolution minimum
  const aspect = artwork.width / artwork.height;
  let targetWidth, targetHeight;
  
  if (artwork.width > artwork.height) {
    targetWidth = TARGET_LONGEST_SIDE;
    targetHeight = Math.round(TARGET_LONGEST_SIDE / aspect);
  } else {
    targetHeight = TARGET_LONGEST_SIDE;
    targetWidth = Math.round(TARGET_LONGEST_SIDE * aspect);
  }

  // Generate SVG with the target high-resolution dimensions
  const svgDataUrl = exportArtworkCleanDataUrl(artwork, targetWidth, targetHeight);
  
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }
      
      ctx.fillStyle = "#FFFFFF"; // Ensure white background
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      
      try {
        const pngDataUrl = canvas.toDataURL("image/png");
        resolve(pngDataUrl);
      } catch (err) {
        reject(err);
      }
    };
    
    img.onerror = () => {
      reject(new Error("Failed to load SVG into image for rendering"));
    };
    
    img.src = svgDataUrl;
  });
}




export async function exportArtworkPdfDataUrl(artwork: ProcessedArtwork): Promise<string> {
  // Use exact SVG dimensions
  const w = artwork.width;
  const h = artwork.height;
  
  // Create jsPDF instance with exact points
  // 'pt' unit means 1 point = 1 pixel at 72dpi. 
  // Custom format using the exact dimensions of the artwork
  const doc = new jsPDF({
    orientation: w > h ? "landscape" : "portrait",
    unit: "px", // Use pixels as units so it maps 1:1 with SVG
    format: [w, h]
  });

  // Get raw SVG
  const svgDataUrl = exportArtworkCleanDataUrl(artwork);
  // Decode base64 to get string
  const base64Str = svgDataUrl.split(",")[1];
  const svgString = decodeURIComponent(escape(atob(base64Str)));
  
  // Parse into DOM element
  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(svgString, "image/svg+xml");
  const svgElement = svgDoc.documentElement;

  // Render SVG to PDF
  await doc.svg(svgElement, {
    x: 0,
    y: 0,
    width: w,
    height: h
  });

  return doc.output("dataurlstring");
}
