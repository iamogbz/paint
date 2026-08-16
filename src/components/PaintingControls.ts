import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { SignalElement } from "../utils/SignalElement";
import { PaletteColor, UsedColorStat } from "../types";
import {
  activeHighlightColorSignal,
  copiedHexSignal,
  artworksSignal,
  currentArtworkSignal,
  isProcessingSignal,
  isGalleryOpenSignal,
  isColorPickerOpenSignal,
  zoomScaleSignal,
  draggedColorSignal,
  draggedPositionSignal,
  undoStackSignal,
  handleUndo,
  handleDeleteSwatchColor,
  isBrushModeSignal,
} from "../state/store";
import {
  iconPaintBucket,
  iconPaintbrush,
  iconCheck,
  iconFolderOpen,
  iconDownload,
  iconZoomIn,
  iconZoomOut,
  iconRotateCcw,
  iconMove,
  iconTrash2,
} from "./icons";
import { transparentImgCss } from "./constants";
import { soundEffects } from "../utils/soundEffects";
import { downloadImage, exportArtworkCleanDataUrl } from "../utils/download";
import { hexToRgb, rgbToHsv } from "../utils/color";

@customElement("painting-controls")
export class PaintingControls extends SignalElement {
  @property({ type: Array }) colorStats: UsedColorStat[] = [];

  private timeoutId?: number;
  private panAnimationFrame: number | null = null;
  private isPanning = false;

  private handlePanPointerDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();

    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    const startX = e.clientX;
    const startY = e.clientY;
    let hasDragged = false;
    let currentDx = 0;
    let currentDy = 0;

    const cleanup = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      target.releasePointerCapture(e.pointerId);
      if (this.panAnimationFrame !== null) {
        cancelAnimationFrame(this.panAnimationFrame);
        this.panAnimationFrame = null;
      }
      this.isPanning = false;
    };

    const panLoop = () => {
      if (!this.isPanning) return;
      if (hasDragged) {
        const speedFactor = 0.1;
        window.dispatchEvent(
          new CustomEvent("easel-pan-delta", {
            detail: {
              dx: currentDx * speedFactor,
              dy: currentDy * speedFactor,
            },
          })
        );
      }
      this.panAnimationFrame = requestAnimationFrame(panLoop);
    };

    const onPointerMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      currentDx = dx;
      currentDy = dy;
      if (!hasDragged && Math.hypot(dx, dy) > 5) {
        hasDragged = true;
        this.isPanning = true;
        this.panAnimationFrame = requestAnimationFrame(panLoop);
      }
    };

    const onPointerUp = () => {
      cleanup();
      if (!hasDragged) {
        const currentScale = zoomScaleSignal.get();
        const nextScale = currentScale === 1 ? 2 : 1;
        window.dispatchEvent(
          new CustomEvent("easel-zoom-set", { detail: { scale: nextScale } })
        );
      }
    };

    const onPointerCancel = () => cleanup();

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
  };

  private handleColorClick = (color: PaletteColor) => {
    soundEffects.playPop();
    const active = activeHighlightColorSignal.get();

    if (active?.hexCode === color.hexCode) {
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

  private handleSwatchPointerDown = (e: PointerEvent, color: PaletteColor) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;

    const activeColor = activeHighlightColorSignal.get();
    const isActive = activeColor?.hexCode === color.hexCode;

    const startX = e.clientX;
    const startY = e.clientY;
    let isDragging = false;

    const cleanup = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
    };

    const onPointerMove = (moveEvent: PointerEvent) => {
      // Only allow drag initiation if it's the active color
      if (!isActive) return;

      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      if (!isDragging && Math.hypot(dx, dy) > 10) {
        isDragging = true;
        draggedColorSignal.set(color.hexCode);
        activeHighlightColorSignal.set(color);
      }

      if (isDragging) {
        // offset by certain amount on the Y axis for better visibility
        draggedPositionSignal.set({
          x: moveEvent.clientX,
          y: moveEvent.clientY - 60,
        });
        const moveEvt = new CustomEvent("color-drag-move", {
          detail: { x: moveEvent.clientX, y: moveEvent.clientY },
        });
        window.dispatchEvent(moveEvt);
      }
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      cleanup();

      if (isDragging) {
        const dropEvent = new CustomEvent("color-drop", {
          detail: {
            x: upEvent.clientX,
            y: upEvent.clientY,
            color: color.hexCode,
          },
        });
        window.dispatchEvent(dropEvent);

        draggedColorSignal.set(null);
        draggedPositionSignal.set(null);
      } else {
        this.handleColorClick(color);
      }
    };

    const onPointerCancel = () => {
      cleanup();
      if (isDragging) {
        draggedColorSignal.set(null);
        draggedPositionSignal.set(null);
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
  };

  private handleDownload = () => {
    const artwork = currentArtworkSignal.get();
    if (!artwork) return;
    const cleanDataUrl = exportArtworkCleanDataUrl(artwork);
    downloadImage(
      cleanDataUrl,
      `paint_by_numbers_${artwork.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")}_paint.ogbizi.com.svg`
    );
  };

  render() {
    const activeColor = activeHighlightColorSignal.get();
    const copiedHex = copiedHexSignal.get();
    const currentArtwork = currentArtworkSignal.get();
    const canUndo = undoStackSignal.get().length > 0;
    const hasArtworks = artworksSignal.get().length > 0;
    const isProcessing = isProcessingSignal.get();
    const zoomScale = zoomScaleSignal.get();
    const isBrushMode = isBrushModeSignal.get();

    const showPhotoControls = Boolean(currentArtwork && !isProcessing);

    // If there is no active photo and no gallery artworks, hide the entire controls bar
    if (!showPhotoControls && !hasArtworks) {
      return html``;
    }

    // Map stats by color ID
    const statsMap = new Map<string, UsedColorStat>();
    (this.colorStats || []).forEach((stat) =>
      statsMap.set(stat.color.hexCode, stat)
    );

    // Check which colors are fully painted
    const paintedRegionsState = currentArtwork?.paintedRegionsState || {};
    const expectedColorStatus = new Map<
      string,
      { total: number; painted: number }
    >();

    if (currentArtwork?.regionExpectedColors) {
      for (const [regionIdStr, expectedHex] of Object.entries(
        currentArtwork.regionExpectedColors
      )) {
        if (!expectedColorStatus.has(expectedHex)) {
          expectedColorStatus.set(expectedHex, { total: 0, painted: 0 });
        }
        const status = expectedColorStatus.get(expectedHex)!;
        status.total += 1;

        const regionId = parseInt(regionIdStr, 10);
        if (paintedRegionsState[regionId] === expectedHex) {
          status.painted += 1;
        }
      }
    }

    const transparent = { hexCode: "#00000000", rgba: [0, 0, 0, 0] as const };
    const nonTransparentStats = (this.colorStats || []).filter(
      (s) => s.color.hexCode !== transparent.hexCode
    );

    const regionedStats: UsedColorStat[] = [];
    const nonRegionedStats: UsedColorStat[] = [];

    // use the stat count directly since painting in the image does not change this value
    for (const stat of nonTransparentStats) {
      if (stat?.count > 0) {
        regionedStats.push(stat);
      } else {
        nonRegionedStats.push(stat);
      }
    }

    const getColorProperties = (hexCode: string) => {
      const rgb = hexToRgb(hexCode);
      if (!rgb) return { isGray: true, h: 0, s: 0, v: 0 };
      const [h, s, v] = rgbToHsv(rgb[0], rgb[1], rgb[2]);
      
      // A color is considered grayscale/achromatic if:
      // - saturation is extremely low (s < 0.08)
      // - or it's extremely dark (v < 0.08)
      // - or it's very pale/light (s < 0.15 and v > 0.9)
      const isGray = s < 0.08 || v < 0.08 || (s < 0.15 && v > 0.9);
      return { isGray, h, s, v };
    };

    // Sort regioned colors by hue, saturation, and luminance starting with red degrees (0 to 360) and keeping shades of gray cleanly grouped
    regionedStats.sort((sa, sb) => {
      const colorA = getColorProperties(sa.color.hexCode);
      const colorB = getColorProperties(sb.color.hexCode);

      if (colorA.isGray !== colorB.isGray) {
        return colorA.isGray ? -1 : 1; // Grays first, then chromatic colors
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

    // Un-regioned colors maintain their preserved order
    const allColorsExceptTransparent = [
      ...regionedStats.map((s) => s.color),
      ...nonRegionedStats.map((s) => s.color),
    ];
    const allColors = [transparent, ...allColorsExceptTransparent];

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
      // this is to provide a buffer for end of page rendering scroll up
      paddingBottom: "10vh",
      marginBottom: "-10vh",
    };

    const headerStyle = {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "0.5rem",
      padding: "0.5rem",
      borderBottom: showPhotoControls
        ? "2px solid rgba(0, 0, 0, 0.15)"
        : "none",
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
      gap: "0",
      overflowX: "auto" as const,
      overflowY: "hidden" as const,
      width: "100%",
      padding: "0.5rem 0.25rem",
      boxSizing: "border-box" as const,
      scrollBehavior: "smooth" as const,
      WebkitOverflowScrolling: "touch" as const,
      touchAction: "pan-x" as const,
    };

    return html`
      <div
        id="color-palette-section"
        style=${this.renderStyleObject(containerStyle)}
      >
        <!-- Header Controls: Action Buttons (Left), Zoom (Middle) & Category Toggles (Right) -->
        <div style=${this.renderStyleObject(headerStyle)}>
          <!-- Left Group: Action Buttons -->
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            ${hasArtworks
              ? html`
                  <button
                    title="Open Gallery"
                    @click=${() => {
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
                    id="save-painting-btn"
                    title="Save Painting to Device"
                    @click=${this.handleDownload}
                    style=${this.renderStyleObject(actionBtnStyle("#2A9D8F"))}
                  >
                    ${iconDownload(18, "#FFFFFF")}
                  </button>
                `
              : ""}
          </div>

          <!-- Middle Group: Canvas Zoom Controls (Only when image is loaded) -->
          ${showPhotoControls
            ? html`
                <div
                  id="easel-zoom-container"
                  style="display: flex; align-items: center; gap: 0.5rem;"
                >
                  <!-- Zoom Out Button -->
                  <button
                    title="Zoom Out"
                    @click=${() =>
                      window.dispatchEvent(new CustomEvent("easel-zoom-out"))}
                    style=${this.renderStyleObject({
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                      backgroundColor: "#FFFFFF",
                      border: "2.5px solid #000000",
                      boxShadow: "2px 2px 0px 0px #000000",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      padding: "0",
                      transition: "transform 0.15s ease, box-shadow 0.15s ease",
                    })}
                  >
                    ${iconZoomOut(18, "#000000")}
                  </button>

                  <!-- Pan Button -->
                  <button
                    id="easel-pan-btn"
                    title="Pan Canvas"
                    @pointerdown=${this.handlePanPointerDown}
                    style=${this.renderStyleObject({
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                      backgroundColor: zoomScale !== 1 ? "#000000" : "#FFFFFF",
                      border: "2.5px solid #000000",
                      boxShadow: "2px 2px 0px 0px #000000",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "grab",
                      padding: "0",
                      transition: "transform 0.15s ease, box-shadow 0.15s ease",
                    })}
                  >
                    ${iconMove(18, zoomScale !== 1 ? "#FFFFFF" : "#000000")}
                  </button>

                  <!-- Zoom In Button -->
                  <button
                    title="Zoom In"
                    @click=${() =>
                      window.dispatchEvent(new CustomEvent("easel-zoom-in"))}
                    style=${this.renderStyleObject({
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                      backgroundColor: "#FFFFFF",
                      border: "2.5px solid #000000",
                      boxShadow: "2px 2px 0px 0px #000000",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      padding: "0",
                      transition: "transform 0.15s ease, box-shadow 0.15s ease",
                    })}
                  >
                    ${iconZoomIn(18, "#000000")}
                  </button>
                </div>
              `
            : ""}

          <!-- Right Group: Color Category Buttons (Only when image is loaded) -->
          ${showPhotoControls
            ? html`
                <div
                  id="palette-mode-toggles"
                  style="display: flex; align-items: center; gap: 0.5rem;"
                >
                  <!-- Undo Button -->
                  <button
                    id="undo-btn"
                    title="Undo"
                    @click=${() => {
                      if (canUndo) {
                        soundEffects.playPop();
                        handleUndo();
                      }
                    }}
                    style=${this.renderStyleObject({
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                      backgroundColor: "#FFFFFF",
                      border: "2.5px solid #000000",
                      boxShadow: "2px 2px 0px 0px #000000",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: canUndo ? "pointer" : "default",
                      padding: "0",
                      transition: "transform 0.15s ease, box-shadow 0.15s ease",
                      opacity: canUndo ? "1" : "0.5",
                      pointerEvents: canUndo ? "auto" : "none",
                    })}
                  >
                    ${iconRotateCcw(18, "#000000")}
                  </button>
                  <!-- Fill (Paint Bucket) Mode Button -->
                  <button
                    id="fill-mode-btn"
                    @click=${() => {
                      isBrushModeSignal.set(false);
                    }}
                    style=${this.renderStyleObject({
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                      backgroundColor: isBrushMode ? "#FFFFFF" : "#000000",
                      border: "2.5px solid #000000",
                      boxShadow: `2px 2px 0px 0px ${
                        isBrushMode ? "#000000" : "#E63946"
                      }`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      padding: "0",
                      transition: "transform 0.15s ease, box-shadow 0.15s ease",
                    })}
                    title="Fill Mode"
                  >
                    ${iconPaintBucket(18, isBrushMode ? "#000000" : "#FFFFFF")}
                  </button>
                  <!-- Brush Mode Button -->
                  <button
                    id="brush-mode-btn"
                    @click=${() => {
                      isBrushModeSignal.set(true);
                    }}
                    style=${this.renderStyleObject({
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                      backgroundColor: isBrushMode ? "#000000" : "#FFFFFF",
                      border: "2.5px solid #000000",
                      boxShadow: `2px 2px 0px 0px ${
                        isBrushMode ? "#E63946" : "#000000"
                      }`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      padding: "0",
                      transition: "transform 0.15s ease, box-shadow 0.15s ease",
                    })}
                    title="Brush Mode"
                  >
                    ${iconPaintbrush(18, isBrushMode ? "#FFFFFF" : "#000000")}
                  </button>
                </div>
              `
            : ""}
        </div>

        <!-- Color Swatches Single Row (Only when image is loaded) -->
        ${showPhotoControls
          ? html`
              <div style=${this.renderStyleObject(scrollRowStyle)}>
                ${allColors.map((color) => {
                  const colorStatus = expectedColorStatus.get(color.hexCode);
                  const isCoreColor = colorStatus? colorStatus.total > 0 : undefined;
                  const isFullyPainted = colorStatus
                    ? isCoreColor && colorStatus.total === colorStatus.painted
                    : false;

                  const isSelected = activeColor?.hexCode === color.hexCode;
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
                    border: isSelected
                      ? "3px solid #E63946"
                      : "3px solid transparent",
                    backgroundColor: "transparent",
                    boxShadow: isSelected
                      ? "3px 3px 0px 0px #E63946"
                      : "0px 0px 0px 0px rgba(0,0,0,0.08)",
                    transform: isSelected ? "scale(1.05)" : "scale(1)",
                    opacity: isSelected ? "1" : "0.85",
                    touchAction: isSelected ? "none" : "auto",
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
                    backgroundSize: "1.5rem 1.5rem",
                    backgroundRepeat: "repeat",
                    backgroundImage:
                      color.hexCode === "#00000000"
                        ? transparentImgCss
                        : color.hexCode,
                    transition: "transform 0.15s ease",
                  };

                  return html`
                    <button
                      id="swatch-btn-${color.hexCode.replace("#", "")}"
                      @pointerdown=${(e: PointerEvent) =>
                        this.handleSwatchPointerDown(e, color)}
                      style=${this.renderStyleObject(colorCardStyle)}
                    >
                      <!-- Color Circle -->
                      <div style=${this.renderStyleObject(circleStyle)}>
                        ${isFullyPainted
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
                          style="position: absolute; inset: 0; width: 50%; height: 50%; margin: auto; background-color: #FFFFFF; border-radius: 9999px; display: flex; align-items: center; justify-content: center; opacity: ${isCopied
                            ? 1
                            : 0}; transition: opacity 0.3s;"
                        >
                          ${iconPaintbrush(14, "#000000")}
                        </div>
                      </div>

                      <!-- Color Label/Progress -->
                      <span
                        id="swatch-action-${color.hexCode.replace("#", "")}"
                        @pointerdown=${(e: PointerEvent) => {
                          if (isCoreColor || color.hexCode === "#00000000")
                            return;
                          if (e.pointerType === "mouse" && e.button !== 0)
                            return;
                          e.stopPropagation();
                          handleDeleteSwatchColor(color);
                        }}
                        style="font-size: 0.6875rem;
                          font-weight: 900;
                          color: #3D2314;
                          padding: 0.375rem;
                          text-align: center;
                          white-space: nowrap;
                          overflow: hidden;
                          text-overflow: ellipsis;
                          width: 100%;
                          line-height: 1.2;
                          display: inline-flex;
                          border-radius: 100%;
                          justify-content: center;
                          cursor: ${!isCoreColor && isSelected
                          ? "pointer"
                          : "inherit"};
                          pointer-events: ${isSelected && !isCoreColor
                          ? "auto"
                          : "none"};"
                        title=${!isCoreColor && isSelected
                          ? "Delete colour swatch"
                          : ""}
                      >
                        ${color.hexCode === "#00000000"
                          ? "Eraser"
                          : isCoreColor
                          ? `${colorStatus!.painted}/${colorStatus!.total}`
                          : isSelected
                          ? iconTrash2(12, "#E63946")
                          : "♾️"}
                      </span>
                    </button>
                  `;
                })}

                <button
                  id="pick-new-color-btn"
                  @pointerdown=${(e: PointerEvent) => {
                    if (e.pointerType === "mouse" && e.button !== 0) return;
                    soundEffects.playPop();
                    isColorPickerOpenSignal.set(true);
                  }}
                  style=${this.renderStyleObject({
                    flex: "0 0 auto",
                    width: "82px",
                    display: "flex",
                    flexDirection: "column" as const,
                    alignItems: "center",
                    padding: "0.375rem",
                    borderRadius: "1rem",
                    transition: "all 0.15s ease",
                    cursor: "pointer",
                    border: "3px solid transparent",
                    opacity: "0.85",
                    touchAction: "auto",
                  })}
                  title="Add New Color"
                >
                  <!-- Color Circle -->
                  <div
                    style=${this.renderStyleObject({
                      width: "3.25rem",
                      height: "3.25rem",
                      borderRadius: "9999px",
                      border: "3px solid #000000",
                      boxShadow: "0 2px 4px rgba(0, 0, 0, 0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      position: "relative" as const,
                      backgroundImage: `conic-gradient(
                        from 0deg,
                      hsl(0, 100%, 50%) 0deg,     /* Red at 0° */
                      hsl(60, 100%, 50%) 60deg,   /* Yellow at 60° */
                      hsl(120, 100%, 50%) 120deg, /* Green at 120° */
                      hsl(180, 100%, 50%) 180deg, /* Cyan at 180° */
                      hsl(240, 100%, 50%) 240deg, /* Blue at 240° */
                      hsl(300, 100%, 50%) 300deg, /* Magenta at 300° */
                      hsl(360, 100%, 50%) 360deg  /* Red at 360° */
                      );`,
                      transition: "transform 0.15s ease",
                    })}
                  >
                    <div
                      style="position: absolute; inset: 0; width: 0; height: 0; margin: auto; background-color: #FFFFFF; border: solid 2px #FFFFFF; border-radius: 100%; corner-shape: round !important; display: flex; align-items: center; justify-content: center;"
                    ></div>
                  </div>

                  <!-- Color Label/Progress -->
                  <span
                    style="font-size: 0.6875rem; font-weight: 900; color: #3D2314; margin-top: 0.375rem; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; line-height: 1.2;"
                  >
                    Picker
                  </span>
                </button>
              </div>
            `
          : ""}
      </div>
    `;
  }

  private renderStyleObject(styleObj: Record<string, string | number>): string {
    return Object.entries(styleObj)
      .map(
        ([k, v]) =>
          `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}: ${v};`
      )
      .join(" ");
  }
}
