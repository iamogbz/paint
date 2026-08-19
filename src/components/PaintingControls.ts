import { html, PropertyValues } from "lit";
import { customElement, property } from "lit/decorators.js";
import { SignalElement } from "../utils/SignalElement";
import { activeHighlightColorSignal, copiedHexSignal, artworksSignal, currentArtworkSignal, isProcessingSignal, isGalleryOpenSignal, isColorPickerOpenSignal, zoomScaleSignal, draggedColorPositionSignal, undoStackSignal, handleUndo, handleDeleteSwatchColor, isBrushModeSignal, panDragActiveSignal } from "../state/store";
import { iconPaintBucket, iconPaintbrush, iconCheck, iconFolderOpen, iconDownload, iconZoomIn, iconZoomOut, iconRotateCcw, iconMove, iconTrash2 } from "./icons";
import { DROPPER_BUFFER_PX, TRANSPARENT_HEX, transparentImgCss } from "../utils/constants";
import { soundEffects } from "../utils/soundEffects";
import { zoom } from "../utils/ui";
import "./DownloadPopup";

export interface PanCanvasDeltaEvent {
  dx: number;
  dy: number;
}

@customElement("painting-controls")
export class PaintingControls extends SignalElement {
  @property({ type: Boolean }) showDownloadPopup = false;

  private timeoutId?: number;
  private panAnimationFrame: number | null = null;
  private isPanning = false;

  private handlePanPointerDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();

    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    panDragActiveSignal.set(true);

    const startX = e.clientX;
    const startY = e.clientY;
    let hasDragged = false;
    let currentDx = 0;
    let currentDy = 0;

    const panLoop = () => {
      if (!this.isPanning) return;
      if (hasDragged) {
        const speedFactor = 0.2;
        window.dispatchEvent(
          new CustomEvent<PanCanvasDeltaEvent>("easel-pan-delta", {
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
        window.dispatchEvent(new CustomEvent("easel-reset-pan"));
        const currentZoom = zoomScaleSignal.get();
        const nextScale = currentZoom === 1 ? 2 : 1;
        zoomScaleSignal.set(nextScale);
      }
    };

    const onPointerCancel = () => cleanup();

    target.addEventListener("pointermove", onPointerMove);
    target.addEventListener("pointerup", onPointerUp);
    target.addEventListener("pointercancel", onPointerCancel);

    const cleanup = () => {
      panDragActiveSignal.set(false);
      target.removeEventListener("pointermove", onPointerMove);
      target.removeEventListener("pointerup", onPointerUp);
      target.removeEventListener("pointercancel", onPointerCancel);
      try {
        target.releasePointerCapture(e.pointerId);
      } catch (err) {
        // ignore if already released
      }
      if (this.panAnimationFrame !== null) {
        cancelAnimationFrame(this.panAnimationFrame);
        this.panAnimationFrame = null;
      }
      this.isPanning = false;
    };
  };

  private handleColorClick = (hexCode: string) => {
    soundEffects.playPop();
    const activeColor = activeHighlightColorSignal.get();

    if (activeColor !== hexCode) {
      window.clearTimeout(this.timeoutId);
      activeHighlightColorSignal.set(hexCode);

      navigator.clipboard
        .writeText(hexCode)
        .then(() => {
          copiedHexSignal.set(hexCode);
          this.timeoutId = window.setTimeout(() => {
            copiedHexSignal.set(null);
          }, 1500);
        })
        .catch(() => {});
    }
  };

  private handleSwatchPointerDown = (e: PointerEvent, hexCode: string) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;

    try {
      if (e.target instanceof Element) {
        e.target.releasePointerCapture(e.pointerId);
      }
    } catch (err) {}

    const activeColor = activeHighlightColorSignal.get();
    const isActive = activeColor === hexCode;

    const startX = e.clientX;
    const startY = e.clientY;
    let isDragging = false;

    const cleanup = () => {
      draggedColorPositionSignal.set(null);

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
      }

      if (isDragging) {
        // offset by certain amount on the Y axis for better visibility
        draggedColorPositionSignal.set({
          targetX: moveEvent.clientX,
          targetY: moveEvent.clientY - DROPPER_BUFFER_PX,
        });
      }
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      if (!isDragging) {
        this.handleColorClick(hexCode);
      }
      setTimeout(cleanup, 150);
    };

    const onPointerCancel = () => {
      cleanup();
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
  };

  private handleDownloadClick = () => {
    const artwork = currentArtworkSignal.get();
    if (!artwork) return;
    this.showDownloadPopup = true;
  };

  private lastActiveColor: string | null = null;

  updated(changedProperties: PropertyValues) {
    super.updated(changedProperties);
    const activeColor = activeHighlightColorSignal.get();
    if (activeColor && this.lastActiveColor !== activeColor) {
      this.lastActiveColor = activeColor;
      const btnId = `swatch-btn-${activeColor.replace("#", "")}`;
      const btn = this.querySelector(`#${btnId}`) || this.renderRoot.querySelector(`#${btnId}`);
      if (btn) {
        btn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }
    } else if (!activeColor) {
      this.lastActiveColor = null;
    }
  }

  render() {
    const activeColor = activeHighlightColorSignal.get();
    const copiedHex = copiedHexSignal.get();
    const currentArtwork = currentArtworkSignal.get();
    const canUndo = undoStackSignal.get().length > 0;
    const hasArtworks = artworksSignal.get().size > 0;
    const isProcessing = isProcessingSignal.get();
    const currentZoom = zoomScaleSignal.get();
    const isBrushMode = isBrushModeSignal.get();

    const showPhotoControls = Boolean(currentArtwork && !isProcessing);

    // If there is no active photo and no gallery artworks, hide the entire controls bar
    if (!showPhotoControls && !hasArtworks) {
      return html``;
    }

    const regionedColors: string[] = [];
    const assignedNonRegionedColors: Set<string> = new Set();
    const allColors = [TRANSPARENT_HEX];
    const dirtyRegions = new Set(currentArtwork?.regionsCurrentFillInfo.keys().filter((regionId) => Object.keys(currentArtwork?.brushStrokePaths[regionId] ?? {}).length > 0) ?? []);

    if (currentArtwork) {
      // use the stat count directly since painting in the image does not change this value
      for (const [colorHex, regionsIds] of currentArtwork.colorsAssignedToRegions) {
        if (colorHex === TRANSPARENT_HEX) {
          continue;
        }
        if (regionsIds.size > 0) {
          regionedColors.push(colorHex);
        } else {
          assignedNonRegionedColors.add(colorHex);
        }
      }
      const nonRegionedColors = assignedNonRegionedColors.union(new Set(currentArtwork.regionsCurrentFillInfo.values())).difference(new Set(regionedColors));

      // Un-regioned colors maintain their preserved order
      // Regioned colors maintain order but uncompleted show first
      allColors.push(
        ...regionedColors.sort((hexCodeA, hexCodeB) => {
          const colorRegionsA = currentArtwork.colorsAssignedToRegions.get(hexCodeA) ?? new Set();
          const colorRegionsB = currentArtwork.colorsAssignedToRegions.get(hexCodeB) ?? new Set();

          const expectedTotalA = colorRegionsA.size;
          const expectedTotalB = colorRegionsB.size;

          const correctRegionsA = colorRegionsA.difference(dirtyRegions).intersection(currentArtwork.colorsFilledInRegions.get(hexCodeA) ?? new Set());
          const correctRegionsB = colorRegionsB.difference(dirtyRegions).intersection(currentArtwork.colorsFilledInRegions.get(hexCodeB) ?? new Set());

          const correctTotalA = correctRegionsA.size;
          const correctTotalB = correctRegionsB.size;

          const correctlyFinishedA = expectedTotalA === correctTotalA;
          const correctlyFinishedB = expectedTotalB === correctTotalB;

          if (correctlyFinishedA === correctlyFinishedB) {
            return parseInt(hexCodeA.replace("#", ""), 16) - parseInt(hexCodeB.replace("#", ""));
          }

          return Number(correctlyFinishedA) - Number(correctlyFinishedB);
        }),
        ...nonRegionedColors
      );
    }

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
      userSelect: "none",
      touchAction: "none" as const,
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
                    @click=${this.handleDownloadClick}
                    style=${this.renderStyleObject({
                      ...actionBtnStyle("#2A9D8F"),
                    })}
                  >
                    ${iconDownload(18, "#FFFFFF")}
                  </button>
                `
              : ""}
          </div>

          <!-- Middle Group: Canvas Zoom Controls (Only when image is loaded) -->
          ${showPhotoControls
            ? html`
                <div id="easel-zoom-container" style="display: flex; align-items: center; gap: 0.5rem;">
                  <!-- Zoom Out Button -->
                  <button
                    title="Zoom Out"
                    @click=${() => {
                      zoomScaleSignal.set(zoom(currentZoom, true, 4));
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
                      backgroundColor: "#000000",
                      border: "2.5px solid #000000",
                      boxShadow: "2px 2px 0px 0px #E63946",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "grab",
                      padding: "0",
                      touchAction: "none",
                      transition: "transform 0.15s ease, box-shadow 0.15s ease",
                    })}
                  >
                    ${iconMove(18, "#FFFFFF")}
                  </button>

                  <!-- Zoom In Button -->
                  <button
                    title="Zoom In"
                    @click=${() => {
                      zoomScaleSignal.set(zoom(currentZoom, false, 4));
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
                <div id="palette-mode-toggles" style="display: flex; align-items: center; gap: 0.5rem;">
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
                      boxShadow: `2px 2px 0px 0px ${isBrushMode ? "#000000" : "#E63946"}`,
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
                      boxShadow: `2px 2px 0px 0px ${isBrushMode ? "#E63946" : "#000000"}`,
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
                ${allColors.map((hexCode) => {
                  const assignedRegions = currentArtwork.colorsAssignedToRegions.get(hexCode) ?? new Set();
                  const assignedRegionCount = assignedRegions.size;
                  const paintedRegionCount = currentArtwork.colorsFilledInRegions.get(hexCode)?.intersection(assignedRegions)?.difference(dirtyRegions).size ?? 0;
                  const isCoreColor = assignedRegionCount > 0;
                  const isFullyPainted = isCoreColor ? assignedRegionCount === paintedRegionCount : false;

                  const isSelected = activeColor === hexCode;
                  const isCopied = copiedHex === hexCode;

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
                    border: isSelected ? "3px solid #E63946" : "3px solid transparent",
                    backgroundColor: "transparent",
                    boxShadow: isSelected ? "3px 3px 0px 0px #E63946" : "0px 0px 0px 0px rgba(0,0,0,0.08)",
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
                    backgroundColor: hexCode,
                    backgroundSize: "1.5rem 1.5rem",
                    backgroundRepeat: "repeat",
                    backgroundImage: hexCode === TRANSPARENT_HEX ? transparentImgCss : hexCode,
                    transition: "transform 0.15s ease",
                  };

                  return html`
                    <button id="swatch-btn-${hexCode.replace("#", "")}" @pointerdown=${(e: PointerEvent) => this.handleSwatchPointerDown(e, hexCode)} style=${this.renderStyleObject(colorCardStyle)}>
                      <!-- Color Circle -->
                      <div style=${this.renderStyleObject(circleStyle)}>
                        ${isFullyPainted ? html` <div style="position: absolute; top: -4px; right: -4px; width: 20px; height: 20px; background-color: #000000; border-radius: 9999px; border: 2px solid #FFFFFF; display: flex; align-items: center; justify-content: center; color: #FFFFFF;">${iconCheck(12, "#FFFFFF")}</div> ` : ""}

                        <!-- Copied Feedback -->
                        <div style="position: absolute; inset: 0; width: 50%; height: 50%; margin: auto; background-color: #FFFFFF; border-radius: 9999px; display: flex; align-items: center; justify-content: center; opacity: ${isCopied ? 1 : 0}; transition: opacity 0.3s;">${iconPaintbrush(14, "#000000")}</div>
                      </div>

                      <!-- Color Label/Progress -->
                      <span
                        id="swatch-action-${hexCode.replace("#", "")}"
                        @pointerdown=${(e: PointerEvent) => {
                          if (isCoreColor || hexCode === TRANSPARENT_HEX) return;
                          if (e.pointerType === "mouse" && e.button !== 0) return;
                          e.stopPropagation();
                          handleDeleteSwatchColor(hexCode);
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
                          cursor: ${!isCoreColor && isSelected ? "pointer" : "inherit"};
                          pointer-events: ${isSelected && !isCoreColor ? "auto" : "none"};"
                        title=${!isCoreColor && isSelected ? "Delete colour swatch" : ""}
                      >
                        ${hexCode === TRANSPARENT_HEX ? "Eraser" : isCoreColor ? `${paintedRegionCount}/${assignedRegionCount}` : isSelected ? iconTrash2(12, "#E63946") : "♾️"}
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
                      animation: "hue-loop linear 5s infinite",
                    })}
                  >
                    <div style="position: absolute; inset: 0; width: 0; height: 0; margin: auto; background-color: #FFFFFF; border: solid 2px #FFFFFF; border-radius: 100%; corner-shape: round !important; display: flex; align-items: center; justify-content: center;"></div>
                  </div>

                  <!-- Color Label/Progress -->
                  <span style="font-size: 0.6875rem; font-weight: 900; color: #3D2314; margin-top: 0.375rem; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; line-height: 1.2;"> Picker </span>
                </button>
              </div>
            `
          : ""}
      </div>
      <download-popup .artwork=${currentArtwork} ?isOpen=${this.showDownloadPopup} @close=${() => (this.showDownloadPopup = false)}></download-popup>
    `;
  }

  private renderStyleObject(styleObj: Record<string, string | number>): string {
    return Object.entries(styleObj)
      .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}: ${v};`)
      .join(" ");
  }
}
