import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { SignalElement } from "../utils/SignalElement";
import {
  PALETTE_COLOR,
  PaletteColor,
  UsedColorStat,
} from "../types";
import {
  selectedCategorySignal,
  activeHighlightColorSignal,
  copiedHexSignal,
  artworksSignal,
  currentArtworkSignal,
  isProcessingSignal,
  isGalleryOpenSignal,
  zoomScaleSignal,
} from "../state/store";
import {
  iconPalette,
  iconPaintBucket,
  iconPaintbrush,
  iconCheck,
  iconFolderOpen,
  iconDownload,
  iconImage,
  iconZoomIn,
  iconZoomOut,
  iconRotateCcw,
} from "./icons";
import { transparentImgCss } from "./constants";
import { soundEffects } from "../utils/soundEffects";
import { downloadImage } from "../utils/download";

const PALETTE_CATEGORIES_ALL = "All";
const PALETTE_CATEGORIES_USED = "Used Only";

@customElement("painting-controls")
export class PaintingControls extends SignalElement {
  @property({ type: Array }) colorStats: UsedColorStat[] = [];

  private timeoutId?: number;

  private handleColorClick = (color: PaletteColor) => {
    soundEffects.playPop();
    const active = activeHighlightColorSignal.get();

    if (active?.id === color.id) {
      activeHighlightColorSignal.set(null);
    } else {
      window.clearTimeout(this.timeoutId);
      activeHighlightColorSignal.set(color);

      navigator.clipboard
        .writeText(color.hexCode)
        .then(() => {
          copiedHexSignal.set(color.hexCode);
          this.timeoutId = window.setTimeout(() => {
            copiedHexSignal.set(null);
          }, 1500);
        })
        .catch(() => {});
    }
  };

  private handleDownload = () => {
    const artwork = currentArtworkSignal.get();
    if (!artwork) return;

    const canvas = document.querySelector<HTMLCanvasElement>("#artboard-canvas");
    if (canvas) {
      const dataUrl = canvas.toDataURL("image/png");
      downloadImage(dataUrl, `${artwork.name}-painting.png`);
    } else {
      downloadImage(artwork.cartoonDataUrl, `${artwork.name}-palette-cartoon.png`);
    }
  };

  private triggerFilePicker = () => {
    soundEffects.playPop();
    const input = document.getElementById("easel-file-input") as HTMLInputElement;
    if (input) {
      input.value = "";
      input.click();
    } else {
      const easel = document.querySelector("easel-board") as any;
      if (easel?.triggerFilePicker) {
        easel.triggerFilePicker();
      }
    }
  };

  render() {
    const selectedCat = selectedCategorySignal.get();
    const activeColor = activeHighlightColorSignal.get();
    const copiedHex = copiedHexSignal.get();
    const currentArtwork = currentArtworkSignal.get();
    const hasArtworks = artworksSignal.get().length > 0;
    const isProcessing = isProcessingSignal.get();
    const zoomScale = zoomScaleSignal.get();

    const showPhotoControls = Boolean(currentArtwork && !isProcessing);

    // If there is no active photo and no gallery artworks, hide the entire controls bar
    if (!showPhotoControls && !hasArtworks) {
      return html``;
    }

    // Map stats by color ID
    const statsMap = new Map<string, UsedColorStat>();
    (this.colorStats || []).forEach((stat) => statsMap.set(stat.color.id, stat));

    const allColors = Object.values(PALETTE_COLOR);
    const filteredColors = allColors.filter((color) => {
      const stat = statsMap.get(color.id);
      const isUsed = stat?.count > 0;

      if (selectedCat === PALETTE_CATEGORIES_USED) return isUsed;
      return true;
    });

    const categories = [PALETTE_CATEGORIES_ALL, PALETTE_CATEGORIES_USED];

    const containerStyle = {
      position: "fixed" as const,
      bottom: "0",
      left: "0",
      right: "0",
      width: "100%",
      backgroundColor: "rgba(255, 255, 255, 0.92)",
      backdropFilter: "blur(16px)",
      borderTop: "4px solid #000000",
      borderTopLeftRadius: "24px",
      borderTopRightRadius: "24px",
      boxShadow: "0px -6px 20px rgba(0, 0, 0, 0.2)",
      zIndex: 1000,
      boxSizing: "border-box" as const,
      display: "flex",
      flexDirection: "column" as const,
      justifyContent: "flex-start",
    };

    const headerStyle = {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "0.5rem",
      padding: "0.75rem 1.25rem",
      borderBottom: showPhotoControls ? "2px solid rgba(0, 0, 0, 0.15)" : "none",
      flexShrink: 0,
    };

    const actionBtnStyle = (bgColor: string) => ({
      width: "36px",
      height: "36px",
      borderRadius: "50%",
      backgroundColor: bgColor,
      border: "2.5px solid #000000",
      boxShadow: "2px 2px 0px 0px #000000",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      padding: "0",
      transition: "transform 0.15s ease, box-shadow 0.15s ease",
    });

    const galleryBtnStyle = {
      width: "36px",
      height: "36px",
      borderRadius: "50%",
      backgroundColor: "#FFD166",
      border: "2.5px solid #000000",
      boxShadow: "2px 2px 0px 0px #000000",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      padding: "0",
      transition: "transform 0.15s ease, box-shadow 0.15s ease",
    };

    const scrollRowStyle = {
      display: "flex",
      flexDirection: "row" as const,
      alignItems: "center",
      gap: "0.75rem",
      overflowX: "auto" as const,
      overflowY: "hidden" as const,
      width: "100%",
      padding: "0.25rem 0.25rem 0.75rem 0.25rem",
      boxSizing: "border-box" as const,
      scrollBehavior: "smooth" as const,
      WebkitOverflowScrolling: "touch" as const,
    };

    return html`
      <div id="color-palette-section" style=${this.renderStyleObject(containerStyle)}>
        <!-- Header Controls: Action Buttons (Left), Zoom (Middle) & Category Toggles (Right) -->
        <div style=${this.renderStyleObject(headerStyle)}>
          <!-- Left Group: Action Buttons -->
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            ${hasArtworks
              ? html`
                  <button
                    title="Open Gallery"
                    @click=${() => {
                      soundEffects.playPop();
                      isGalleryOpenSignal.set(true);
                    }}
                    id="view-other-artworks-btn"
                    style=${this.renderStyleObject(galleryBtnStyle)}
                  >
                    ${iconFolderOpen(18, "#000000")}
                  </button>
                `
              : ""}
            ${showPhotoControls
              ? html`
                  <button
                    title="Save Painting to Device"
                    @click=${this.handleDownload}
                    style=${this.renderStyleObject(actionBtnStyle("#2A9D8F"))}
                  >
                    ${iconDownload(18, "#FFFFFF")}
                  </button>

                  <button
                    title="Change Photo"
                    @click=${this.triggerFilePicker}
                    style=${this.renderStyleObject(actionBtnStyle("#FFFFFF"))}
                  >
                    ${iconImage(18, "#000000")}
                  </button>
                `
              : ""}
          </div>

          <!-- Middle Group: Canvas Zoom Controls (Only when image is loaded) -->
          ${showPhotoControls
            ? html`
                <div
                  style="display: flex; align-items: center; gap: 0.25rem; background: rgba(255, 255, 255, 0.95); border: 2.5px solid #000000; border-radius: 9999px; padding: 0.25rem 0.5rem; box-shadow: 2px 2px 0px 0px #000000;"
                >
                  <button
                    title="Zoom Out"
                    @click=${() => {
                      soundEffects.playPop();
                      window.dispatchEvent(new CustomEvent("easel-zoom-out"));
                    }}
                    style="display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; border: none; background: transparent; cursor: pointer; color: #000000; padding: 0;"
                  >
                    ${iconZoomOut(16, "#000000")}
                  </button>
                  <button
                    title="Reset Zoom"
                    @click=${() => {
                      soundEffects.playPop();
                      window.dispatchEvent(new CustomEvent("easel-zoom-reset"));
                    }}
                    style="font-size: 0.75rem; font-weight: 900; color: #000000; padding: 0 4px; display: flex; align-items: center; gap: 2px; border: none; background: transparent; cursor: pointer;"
                  >
                    ${Math.round(zoomScale * 100)}%
                    ${zoomScale > 1.05 ? iconRotateCcw(12, "#E63946") : ""}
                  </button>
                  <button
                    title="Zoom In"
                    @click=${() => {
                      soundEffects.playPop();
                      window.dispatchEvent(new CustomEvent("easel-zoom-in"));
                    }}
                    style="display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; border: none; background: transparent; cursor: pointer; color: #000000; padding: 0;"
                  >
                    ${iconZoomIn(16, "#000000")}
                  </button>
                </div>
              `
            : ""}

          <!-- Right Group: Color Category Buttons (Only when image is loaded) -->
          ${showPhotoControls
            ? html`
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                  ${categories.map((cat) => {
                    const isSel = selectedCat === cat;
                    const btnStyle = {
                      fontSize: "0.75rem",
                      padding: "0.375rem 0.875rem",
                      borderRadius: "9999px",
                      fontWeight: "900",
                      textTransform: "uppercase" as const,
                      letterSpacing: "0.05em",
                      transition: "all 0.15s ease",
                      border: "2.5px solid #000000",
                      cursor: "pointer",
                      backgroundColor: isSel ? "#000000" : "rgba(255, 255, 255, 0.8)",
                      color: isSel ? "#FFFFFF" : "#000000",
                      boxShadow: isSel ? "2px 2px 0px 0px rgba(0, 0, 0, 0.3)" : "none",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.25rem",
                    };

                    return html`
                      <button
                        @click=${() => {
                          soundEffects.playPop();
                          selectedCategorySignal.set(cat);
                        }}
                        style=${this.renderStyleObject(btnStyle)}
                      >
                        ${cat === PALETTE_CATEGORIES_ALL
                          ? iconPaintBucket(18, isSel ? "#FFFFFF" : "#000000")
                          : iconPalette(18, isSel ? "#FFFFFF" : "#000000")}
                      </button>
                    `;
                  })}
                </div>
              `
            : ""}
        </div>

        <!-- Color Swatches Single Row (Only when image is loaded) -->
        ${showPhotoControls
          ? html`
              <div style=${this.renderStyleObject(scrollRowStyle)}>
                ${filteredColors.map((color) => {
                  const stat = statsMap.get(color.id);
                  const isUsed = stat?.count > 0;
                  const isSelected = activeColor?.id === color.id;
                  const isCopied = copiedHex === color.hexCode;

                  const colorCardStyle = {
                    flex: "0 0 auto",
                    width: "82px",
                    display: "flex",
                    flexDirection: "column" as const,
                    alignItems: "center",
                    padding: "0.375rem",
                    borderRadius: "1rem",
                    transition: "all 0.15s ease",
                    cursor: "pointer",
                    border: isSelected ? "3px solid #E63946" : "2.5px solid transparent",
                    backgroundColor: isSelected ? "rgba(254, 243, 199, 0.95)" : "rgba(255, 255, 255, 0.5)",
                    boxShadow: isSelected ? "3px 3px 0px 0px #E63946" : "0px 0px 0px 0px rgba(0,0,0,0.08)",
                    transform: isSelected ? "scale(1.05)" : "scale(1)",
                    opacity: isSelected ? "1" : "0.85",
                  };

                  const circleStyle = {
                    width: "3.25rem",
                    height: "3.25rem",
                    borderRadius: "9999px",
                    border: "3px solid #000000",
                    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative" as const,
                    backgroundColor: color.hexCode,
                    backgroundSize: '1.5rem 1.5rem',
                    backgroundRepeat: 'repeat',
                    backgroundImage: color.id === PALETTE_COLOR.transparent.id
                      ? transparentImgCss
                      : color.hexCode,
                    transition: "transform 0.15s ease",
                  };

                  return html`
                    <button
                      @click=${() => this.handleColorClick(color)}
                      style=${this.renderStyleObject(colorCardStyle)}
                    >
                      <!-- Color Circle -->
                      <div style=${this.renderStyleObject(circleStyle)}>
                        ${isUsed
                          ? html`
                              <div
                                style="position: absolute; top: -4px; right: -4px; width: 20px; height: 20px; background-color: #000000; border-radius: 9999px; border: 2px solid #FFFFFF; display: flex; align-items: center; justify-content: center; color: #FFFFFF;"
                              >
                                ${iconCheck(12, "#FFFFFF")}
                              </div>
                            `
                          : ""}

                        <!-- Copied Feedback -->
                        <div
                          style="position: absolute; inset: 0; width: 50%; height: 50%; margin: auto; background-color: #FFFFFF; border-radius: 9999px; display: flex; align-items: center; justify-content: center; opacity: ${isCopied ? 1 : 0}; transition: opacity 0.3s;"
                        >
                          ${iconPaintbrush(14, "#000000")}
                        </div>
                      </div>

                      <!-- Color Label -->
                      <span
                        style="font-size: 0.6875rem; font-weight: 900; color: #3D2314; margin-top: 0.375rem; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; line-height: 1.2;"
                      >
                        ${color.name}
                      </span>

                      <!-- Percentage -->
                      <span
                        style="font-size: 0.75rem; font-weight: ${isUsed ? "900" : "700"}; color: ${isUsed ? "#000000" : "#6B7280"};"
                      >
                        ${stat?.percentage ?? 0}%
                      </span>
                    </button>
                  `;
                })}
              </div>
            `
          : ""}
      </div>
    `;
  }

  private renderStyleObject(styleObj: Record<string, string | number>): string {
    return Object.entries(styleObj)
      .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}: ${v};`)
      .join(" ");
  }
}
