import { soundEffects } from "./soundEffects";

export async function downloadImage(dataUrl: string, filename: string): Promise<void> {
  soundEffects.playPop();

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
