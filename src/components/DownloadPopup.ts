import { html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { SignalElement } from "../utils/SignalElement";
import { ProcessedArtwork } from "../types";
import {
  exportArtworkHighResPng,
  exportArtworkPdfDataUrl,
  downloadImage,
} from "../utils/download";
import { iconDownload, iconLoader2 } from "./icons";

@customElement("download-popup")
export class DownloadPopup extends SignalElement {
  @property({ type: Object }) artwork: ProcessedArtwork | null = null;
  @property({ type: Boolean }) isOpen = false;

  @state() private isDownloading = false;

  private close() {
    this.dispatchEvent(new CustomEvent("close"));
  }

  private downloadAsPng = async () => {
    if (!this.artwork || this.isDownloading) return;

    this.isDownloading = true;
    try {
      const highResPngDataUrl = await exportArtworkHighResPng(this.artwork);
      await downloadImage(
        highResPngDataUrl,
        `paint_by_numbers_${this.artwork.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "")}_8k.ogbizi.com.png`
      );
      this.close();
    } catch (err) {
      console.error("Download failed:", err);
      alert("Failed to generate high-resolution PNG. Please try again.");
    } finally {
      this.isDownloading = false;
    }
  };

  private downloadAsPdf = async () => {
    if (!this.artwork || this.isDownloading) return;

    this.isDownloading = true;
    try {
      const pdfDataUrl = await exportArtworkPdfDataUrl(this.artwork);
      await downloadImage(
        pdfDataUrl,
        `paint_by_numbers_${this.artwork.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "")}.ogbizi.com.pdf`
      );
      this.close();
    } catch (err) {
      console.error("Download failed:", err);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      this.isDownloading = false;
    }
  };

  render() {
    if (!this.isOpen || !this.artwork) return html``;

    return html`
      <div
        style="position: fixed; inset: 0; z-index: 15000; background-color: rgba(255, 255, 255, 0.6); backdrop-filter: blur(1rem); display: flex; align-items: center; justify-content: center; padding: 0.75rem; box-sizing: border-box;"
        @click=${this.close}
      >
        <div
          style="background-color: rgba(255, 255, 255, 0.95); backdrop-filter: blur(1rem); border: 4px solid #000000; width: 100%; max-width: 340px; border-radius: 32px; padding: 1.5rem 1.25rem; box-shadow: 10px 10px 0px 0px #000000; display: flex; flex-direction: column; gap: 1rem; position: relative;"
          @click=${(e: Event) => e.stopPropagation()}
        >
          <div style="display: flex; align-items: center; gap: 0.625rem; margin-bottom: 0.5rem;">
            <div
              style="width: 2.5rem; height: 2.5rem; border-radius: 18px; background-color: #2A9D8F; border: 3px solid #000000; display: flex; align-items: center; justify-content: center; color: #000000; box-shadow: 2px 2px 0px 0px #000000;"
            >
              ${iconDownload(20, "#000000")}
            </div>
            <div>
              <h2
                style="font-size: 1.25rem; font-weight: 900; font-style: italic; color: #4A2810; margin: 0; letter-spacing: -0.02em;"
              >
                Download
              </h2>
              <p
                style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: #4A2810; margin: 0;"
              >
                Select Format
              </p>
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 12px;">
            <button
              @click=${this.downloadAsPng}
              style="padding: 12px 16px; border: 3px solid #000000; border-radius: 16px; background: #4EA8DE; color: #FFFFFF; font-weight: 900; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; font-family: 'Plus Jakarta Sans', sans-serif; box-shadow: 4px 4px 0px 0px #000000; transition: transform 0.1s ease, box-shadow 0.1s ease;"
              onmousedown="this.style.transform='translate(2px, 2px)'; this.style.boxShadow='2px 2px 0px 0px #000000';"
              onmouseup="this.style.transform='none'; this.style.boxShadow='4px 4px 0px 0px #000000';"
              onmouseleave="this.style.transform='none'; this.style.boxShadow='4px 4px 0px 0px #000000';"
            >
              ${this.isDownloading ? iconLoader2(18, "#FFF") : ""} High-Res PNG
            </button>

            <button
              @click=${this.downloadAsPdf}
              style="padding: 12px 16px; border: 3px solid #000000; border-radius: 16px; background: #FFD166; color: #000000; font-weight: 900; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; font-family: 'Plus Jakarta Sans', sans-serif; box-shadow: 4px 4px 0px 0px #000000; transition: transform 0.1s ease, box-shadow 0.1s ease;"
              onmousedown="this.style.transform='translate(2px, 2px)'; this.style.boxShadow='2px 2px 0px 0px #000000';"
              onmouseup="this.style.transform='none'; this.style.boxShadow='4px 4px 0px 0px #000000';"
              onmouseleave="this.style.transform='none'; this.style.boxShadow='4px 4px 0px 0px #000000';"
            >
              ${this.isDownloading ? iconLoader2(18, "#000") : ""} Vector PDF
            </button>
          </div>

          <button
            @click=${this.close}
            style="margin-top: 4px; padding: 12px 16px; border: 3px solid #000000; border-radius: 16px; background: #FFFFFF; color: #000000; font-weight: 900; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; font-family: 'Plus Jakarta Sans', sans-serif; box-shadow: 4px 4px 0px 0px #000000; transition: transform 0.1s ease, box-shadow 0.1s ease;"
            onmousedown="this.style.transform='translate(2px, 2px)'; this.style.boxShadow='2px 2px 0px 0px #000000';"
            onmouseup="this.style.transform='none'; this.style.boxShadow='4px 4px 0px 0px #000000';"
            onmouseleave="this.style.transform='none'; this.style.boxShadow='4px 4px 0px 0px #000000';"
          >
            Cancel
          </button>
        </div>
      </div>
    `;
  }
}
