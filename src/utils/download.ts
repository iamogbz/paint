import { ProcessedArtwork } from "../types";

export function exportArtworkCleanDataUrl(artwork: ProcessedArtwork): string {
  if (artwork.svgPaths) {
    const w = artwork.width;
    const h = artwork.height;
    const paintedState = artwork.paintedRegionsState || {};

    let svgContent = `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;

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
