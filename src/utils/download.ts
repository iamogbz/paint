import { ProcessedArtwork } from "../types";
import { soundEffects } from "./soundEffects";

export function exportArtworkCleanDataUrl(artwork: ProcessedArtwork): string {
  if (artwork.paintedCanvasDataUrl) {
    return artwork.paintedCanvasDataUrl;
  }

  const w = artwork.width;
  const h = artwork.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return artwork.cartoonDataUrl;

  const imgData = ctx.createImageData(w, h);
  const pixels = imgData.data;
  const paintedState = artwork.paintedRegionsState || {};
  const regionMap = artwork.regionMapData;

  if (regionMap && regionMap.length === w * h) {
    for (let i = 0; i < w * h; i++) {
      const pxIdx = i * 4;
      const regionId = regionMap[i];
      const colorHex = paintedState[regionId];

      if (colorHex && colorHex.startsWith("#")) {
        let hex = colorHex.slice(1);
        if (hex.length === 3 || hex.length === 4) {
          hex = hex.split("").map((c) => c + c).join("");
        }
        pixels[pxIdx] = parseInt(hex.slice(0, 2), 16) || 0;
        pixels[pxIdx + 1] = parseInt(hex.slice(2, 4), 16) || 0;
        pixels[pxIdx + 2] = parseInt(hex.slice(4, 6), 16) || 0;
        pixels[pxIdx + 3] = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255;
      } else {
        // Unpainted island is clean white
        pixels[pxIdx] = 255;
        pixels[pxIdx + 1] = 255;
        pixels[pxIdx + 2] = 255;
        pixels[pxIdx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL("image/png");
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
    const extension = mimeType.split("/")[1] || "png";
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
