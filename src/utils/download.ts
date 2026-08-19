import { jsPDF } from "jspdf";
import "svg2pdf.js";
import { ProcessedArtwork } from "../types";
import { renderArtworkToSVG } from "./imageProcessor";
import { TRANSPARENT_HEX } from "./constants";

export async function downloadImage(dataUrl: string, filename: string): Promise<void> {
  if (!dataUrl) return;

  try {
    // 1. Convert base64 data URL to Blob & File
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const mimeType = blob.type || "image/png";
    const extension = mimeType.includes("svg") ? "svg" : mimeType.split("/")[1] || "png";
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

export function exportArtworkSvgDataUrl(artwork: ProcessedArtwork, overrideWidth?: number, overrideHeight?: number): string {
  const originalW = artwork.width;
  const originalH = artwork.height;
  const w = `${overrideWidth || originalW}`;
  const h = `${overrideHeight || originalH}`;

  const artworkSVG = renderArtworkToSVG(artwork);

  if (!artworkSVG) {
    return artwork.cartoonDataUrl;
  }

  artworkSVG.setAttribute("width", w);
  artworkSVG.setAttribute("height", h);

  return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(artworkSVG.outerHTML)));
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
  const svgDataUrl = exportArtworkSvgDataUrl(artwork, targetWidth, targetHeight);

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

      ctx.fillStyle = TRANSPARENT_HEX; // PNGs can be transparent
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
    format: [w, h],
  });

  // Get svg element
  const svgElement = renderArtworkToSVG(artwork);

  // Render SVG to PDF
  await doc.svg(svgElement, {
    x: 0,
    y: 0,
    width: w,
    height: h,
  });

  return doc.output("dataurlstring");
}
