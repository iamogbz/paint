import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { SignalElement } from "../utils/SignalElement";
import {
  currentArtworkSignal,
  artworksSignal,
  isProcessingSignal,
  activeHighlightColorSignal,
  isGalleryOpenSignal,
  isDragOverSignal,
  zoomScaleSignal,
  handleImageSelected,
} from "../state/store";
import { getDailyChallenge } from "../data/sampleImages";
import { soundEffects } from "../utils/soundEffects";
import { downloadImage } from "../utils/download";
import {
  iconFolderOpen,
  iconDownload,
  iconImage,
  iconLoader2,
  iconSparkles,
  iconUpload,
  iconPaintBucket,
  iconZoomIn,
  iconZoomOut,
  iconRotateCcw,
} from "./icons";

@customElement("easel-board")
export class EaselBoard extends SignalElement {
  private scale = 1;
  private panX = 0;
  private panY = 0;
  private isDragging = false;
  private isPinching = false;
  private initialPinchDist = 0;
  private initialScale = 1;
  private startTouchX = 0;
  private startTouchY = 0;
  private startPanX = 0;
  private startPanY = 0;
  private lastTapTime = 0;
  private lastArtworkId: string | null = null;
  private containerElement: HTMLElement | null = null;

  public triggerFilePicker = () => {
    const input = document.getElementById("easel-file-input") as HTMLInputElement;
    if (input) {
      input.value = "";
      input.click();
    }
  };

  firstUpdated() {
    this.setupZoomListeners();
  }

  updated() {
    this.setupZoomListeners();
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("easel-zoom-in", this.zoomIn);
    window.addEventListener("easel-zoom-out", this.zoomOut);
    window.addEventListener("easel-zoom-reset", this.resetZoom);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerup", this.handlePointerUp);
    window.removeEventListener("easel-zoom-in", this.zoomIn);
    window.removeEventListener("easel-zoom-out", this.zoomOut);
    window.removeEventListener("easel-zoom-reset", this.resetZoom);
  }

  private setupZoomListeners() {
    const container = this.querySelector<HTMLElement>("#easel-zoom-container");
    if (container && container !== this.containerElement) {
      if (this.containerElement) {
        this.containerElement.removeEventListener("touchstart", this.handleTouchStart);
        this.containerElement.removeEventListener("touchmove", this.handleTouchMove);
        this.containerElement.removeEventListener("touchend", this.handleTouchEnd);
        this.containerElement.removeEventListener("touchcancel", this.handleTouchEnd);
        this.containerElement.removeEventListener("wheel", this.handleWheel);
        this.containerElement.removeEventListener("pointerdown", this.handlePointerDown);
      }
      this.containerElement = container;
      container.addEventListener("touchstart", this.handleTouchStart, { passive: false });
      container.addEventListener("touchmove", this.handleTouchMove, { passive: false });
      container.addEventListener("touchend", this.handleTouchEnd, { passive: false });
      container.addEventListener("touchcancel", this.handleTouchEnd, { passive: false });
      container.addEventListener("wheel", this.handleWheel, { passive: false });
      container.addEventListener("pointerdown", this.handlePointerDown);

      window.removeEventListener("pointermove", this.handlePointerMove);
      window.removeEventListener("pointerup", this.handlePointerUp);
      window.addEventListener("pointermove", this.handlePointerMove);
      window.addEventListener("pointerup", this.handlePointerUp);
    }
  }

  private setScale(s: number) {
    const newScale = Math.min(8.0, Math.max(1.0, s));
    if (newScale === 1) {
      this.scale = 1;
      this.panX = 0;
      this.panY = 0;
    } else {
      this.scale = newScale;
      this.panX = this.clampPanX(this.panX, newScale);
      this.panY = this.clampPanY(this.panY, newScale);
    }
    zoomScaleSignal.set(this.scale);
    this.requestUpdate();
  }

  private clampPanX(x: number, s: number): number {
    if (s <= 1) return 0;
    const w = this.containerElement?.clientWidth || 350;
    const maxPan = ((s - 1) * w) / 2 + w * 0.25;
    return Math.max(-maxPan, Math.min(maxPan, x));
  }

  private clampPanY(y: number, s: number): number {
    if (s <= 1) return 0;
    const h = this.containerElement?.clientHeight || 350;
    const maxPan = ((s - 1) * h) / 2 + h * 0.25;
    return Math.max(-maxPan, Math.min(maxPan, y));
  }

  private resetZoom = () => {
    soundEffects.playPop();
    this.scale = 1;
    this.panX = 0;
    this.panY = 0;
    zoomScaleSignal.set(1);
    this.requestUpdate();
  };

  private zoomIn = () => {
    soundEffects.playPop();
    this.setScale(this.scale * 1.4);
  };

  private zoomOut = () => {
    soundEffects.playPop();
    this.setScale(this.scale / 1.4);
  };

  private handleTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      this.isPinching = true;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      this.initialPinchDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      this.initialScale = this.scale;
      this.startTouchX = (t1.clientX + t2.clientX) / 2;
      this.startTouchY = (t1.clientY + t2.clientY) / 2;
      this.startPanX = this.panX;
      this.startPanY = this.panY;
    } else if (e.touches.length === 1) {
      this.isPinching = false;
      this.startTouchX = e.touches[0].clientX;
      this.startTouchY = e.touches[0].clientY;
      this.startPanX = this.panX;
      this.startPanY = this.panY;

      const now = Date.now();
      if (now - this.lastTapTime < 300) {
        soundEffects.playPop();
        if (this.scale > 1.2) {
          this.resetZoom();
        } else {
          this.setScale(2.5);
        }
        this.lastTapTime = 0;
      } else {
        this.lastTapTime = now;
      }

      if (this.scale > 1) {
        e.preventDefault();
      }
    }
  };

  private handleTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 2 && this.initialPinchDist > 0) {
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const ratio = dist / this.initialPinchDist;
      const targetScale = Math.min(8.0, Math.max(1.0, this.initialScale * ratio));

      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      const dx = midX - this.startTouchX;
      const dy = midY - this.startTouchY;

      this.scale = targetScale;
      this.panX = this.clampPanX(this.startPanX + dx, targetScale);
      this.panY = this.clampPanY(this.startPanY + dy, targetScale);
      zoomScaleSignal.set(this.scale);
      this.requestUpdate();
    } else if (e.touches.length === 1 && (this.scale > 1 || this.isDragging)) {
      const dx = e.touches[0].clientX - this.startTouchX;
      const dy = e.touches[0].clientY - this.startTouchY;
      if (this.scale > 1) {
        e.preventDefault();
        this.panX = this.clampPanX(this.startPanX + dx, this.scale);
        this.panY = this.clampPanY(this.startPanY + dy, this.scale);
        this.requestUpdate();
      }
    }
  };

  private handleTouchEnd = (e: TouchEvent) => {
    if (e.touches.length < 2) {
      this.isPinching = false;
      this.initialPinchDist = 0;
      zoomScaleSignal.set(this.scale);
    }
  };

  private handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.15 : 0.85;
    this.setScale(this.scale * delta);
  };

  private handlePointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    if (this.scale > 1) {
      this.isDragging = true;
      this.startTouchX = e.clientX;
      this.startTouchY = e.clientY;
      this.startPanX = this.panX;
      this.startPanY = this.panY;
    }
  };

  private handlePointerMove = (e: PointerEvent) => {
    if (this.isDragging && this.scale > 1) {
      const dx = e.clientX - this.startTouchX;
      const dy = e.clientY - this.startTouchY;
      this.panX = this.clampPanX(this.startPanX + dx, this.scale);
      this.panY = this.clampPanY(this.startPanY + dy, this.scale);
      this.requestUpdate();
    }
  };

  private handlePointerUp = () => {
    this.isDragging = false;
  };


  private handleFileInput = (file: File) => {
    if (file && file.type.startsWith("image/")) {
      soundEffects.playPop();
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          handleImageSelected(
            event.target.result as string,
            file.name.replace(/\.[^/.]+$/, "")
          );
        }
      };
      reader.readAsDataURL(file);
    }
  };

  private handleFileChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) this.handleFileInput(file);
  };

  private handleDrop = (e: DragEvent) => {
    e.preventDefault();
    isDragOverSignal.set(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) this.handleFileInput(file);
  };

  private handleDownload = () => {
    const artwork = currentArtworkSignal.get();
    if (!artwork) return;
    downloadImage(artwork.cartoonDataUrl, `${artwork.name}-palette-cartoon.png`);
  };

  render() {
    const currentArtwork = currentArtworkSignal.get();
    const currentArtworkId = currentArtwork?.id || null;
    if (currentArtworkId !== this.lastArtworkId) {
      this.lastArtworkId = currentArtworkId;
      this.scale = 1;
      this.panX = 0;
      this.panY = 0;
      zoomScaleSignal.set(1);
    }
    const hasArtworks = artworksSignal.get().length > 0;
    const isProcessing = isProcessingSignal.get();
    const activeHighlightHex = activeHighlightColorSignal.get()?.hexCode;
    const isDragOver = isDragOverSignal.get();
    const dailyChallengeImage = getDailyChallenge();

    const outerContainerStyle = {
      width: "95vmin",
      maxWidth: "95vmin",
      margin: "0 auto",
      paddingTop: "0.5rem",
      paddingBottom: "1rem",
      paddingLeft: "0",
      paddingRight: "0",
      position: "relative" as const,
      display: "flex",
      flexDirection: "column" as const,
      alignItems: "center",
      boxSizing: "border-box" as const,
    };

    const easelTopClampStyle = {
      width: "14rem",
      height: "1.5rem",
      backgroundColor: "#8B5E3C",
      border: "3px solid #3D2314",
      borderTopLeftRadius: "0.75rem",
      borderTopRightRadius: "0.75rem",
      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
      zIndex: 20,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      position: "relative" as const,
    };

    const mainFrameStyle = {
      width: "100%",
      backgroundColor: "#8B5E3C",
      border: "4px solid #4A2810",
      borderRadius: "28px",
      padding: "1rem",
      boxShadow: "12px 12px 0px 0px rgba(0,0,0,0.15)",
      position: "relative" as const,
      zIndex: 10,
      boxSizing: "border-box" as const,
    };

    const headerBarStyle = {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      width: "100%",
      marginBottom: "0.5rem",
      gap: "0.5rem",
    };

    const galleryBtnStyle = {
      backgroundColor: "#FFFFFF",
      color: "#000000",
      border: "3px solid #000000",
      borderRadius: "24px",
      padding: "0.5rem 1rem",
      display: "flex",
      alignItems: "center",
      gap: "0.625rem",
      boxShadow: "5px 5px 0px 0px #000000",
      transition: "all 0.15s ease",
      fontWeight: "900",
      fontSize: "0.75rem",
      textTransform: "uppercase" as const,
      cursor: "pointer",
    };

    const actionBtnStyle = (bg = "#2A9D8F") => ({
      backgroundColor: bg,
      color: bg === "#FFFFFF" ? "#000000" : "#FFFFFF",
      border: "3px solid #000000",
      borderRadius: "24px",
      padding: "0.5rem 1rem",
      display: "flex",
      alignItems: "center",
      gap: "0.625rem",
      boxShadow: "5px 5px 0px 0px #000000",
      transition: "all 0.15s ease",
      fontWeight: "900",
      fontSize: "0.75rem",
      textTransform: "uppercase" as const,
      cursor: "pointer",
    });

    const dropAreaStyle = {
      width: "100%",
      maxWidth: "28rem",
      margin: "1rem auto",
      padding: "1.5rem",
      borderRadius: "28px",
      border: "3px dashed " + (isDragOver ? "#E63946" : "#000000"),
      backgroundColor: isDragOver ? "rgba(255, 166, 201, 0.3)" : "rgba(255, 255, 255, 0.8)",
      transform: isDragOver ? "scale(1.02)" : "scale(1)",
      transition: "all 0.15s ease",
      display: "flex",
      flexDirection: "column" as const,
      alignItems: "center",
      textAlign: "center" as const,
      cursor: "pointer",
      boxShadow: isDragOver ? "none" : "6px 6px 0px 0px #000000",
      boxSizing: "border-box" as const,
    };

    return html`
      <div style=${this.renderStyleObject(outerContainerStyle)}>
        <!-- Hidden File Input -->
        <input
          id="easel-file-input"
          type="file"
          accept="image/*"
          style="display: none;"
          @change=${this.handleFileChange}
        />

        <!-- Zoomable Viewport Container -->
        <div
          id="easel-zoom-container"
          style="position: relative; width: 100%; touch-action: none; user-select: none; -webkit-user-select: none;"
        >
          <!-- Zoom Transform Element -->
          <div
            style="width: 100%; display: flex; flex-direction: column; align-items: center; transform: translate3d(${this.panX}px, ${this.panY}px, 0px) scale(${this.scale}); transform-origin: center center; transition: ${this.isDragging || this.isPinching ? "none" : "transform 0.15s cubic-bezier(0.2, 0, 0, 1)"}; will-change: transform;"
          >
            <!-- Top Wooden Clamp -->
            <div style=${this.renderStyleObject(easelTopClampStyle)}></div>

            <!-- Main Frame -->
            <div style=${this.renderStyleObject(mainFrameStyle)}>
              <!-- Easel Canvas Display Area -->
              <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative;">
                <!-- STATE 1: Processing Loader -->
                ${isProcessing
                  ? html`
                      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 3rem 1rem; text-align: center;">
                        <div style="position: relative; width: 5rem; height: 5rem; margin-bottom: 1rem; display: flex; align-items: center; justify-content: center;">
                          ${iconLoader2(64, "#E63946")}
                          <div style="position: absolute;">
                            ${iconSparkles(32, "#FFD166")}
                          </div>
                        </div>
                        <h3 style="font-size: 1.25rem; font-weight: 900; color: #3D2314; margin: 0 0 0.25rem 0; font-style: italic;">
                          Preparing Canvas..
                        </h3>
                        <p style="font-size: 0.75rem; font-weight: 700; color: #4A2810; text-transform: uppercase; margin: 0;">
                          collecting paints and colouring palettes
                        </p>
                      </div>
                    `
                  : ""}

                <!-- STATE 2: Upload Box (No Artwork loaded) -->
                ${!currentArtwork && !isProcessing
                  ? html`
                      <div
                        @dragover=${(e: DragEvent) => {
                          e.preventDefault();
                          isDragOverSignal.set(true);
                        }}
                        @dragleave=${() => isDragOverSignal.set(false)}
                        @drop=${this.handleDrop}
                        @click=${this.triggerFilePicker}
                        style=${this.renderStyleObject(dropAreaStyle)}
                      >
                        <!-- Upload Icon Circle -->
                        <div style="width: 5rem; height: 5rem; border-radius: 24px; background-color: #FFD166; border: 3px solid #000000; display: flex; align-items: center; justify-content: center; box-shadow: 4px 4px 0px 0px #000000; margin-bottom: 1rem; color: #000000;">
                          ${iconUpload(40, "#000000")}
                        </div>

                        <h3 style="font-size: 1.5rem; font-weight: 900; font-style: italic; color: #3D2314; margin: 0 0 0.5rem 0; letter-spacing: -0.02em;">
                          Upload Your Image
                        </h3>
                        <p style="font-size: 0.875rem; font-weight: 700; color: rgba(74, 40, 16, 0.8); margin: 0 0 1.25rem 0; line-height: 1.5;">
                          Tap to select or drag & drop any photo.
                        </p>

                        <button
                          @click=${(e: Event) => {
                            e.stopPropagation();
                            this.triggerFilePicker();
                          }}
                          style="background-color: #E63946; color: #FFFFFF; font-weight: 900; padding: 0.75rem 1.5rem; border-radius: 20px; border: 3px solid #000000; box-shadow: 4px 4px 0px 0px #000000; font-size: 0.875rem; display: flex; align-items: center; gap: 0.5rem; text-transform: uppercase; cursor: pointer;"
                        >
                          ${iconImage(20, "#FFFFFF")} Choose Photo
                        </button>

                        <!-- Sample Daily Challenge Button -->
                        <div style="margin-top: 2rem; padding-top: 1.5rem; border-top: 2px solid rgba(0, 0, 0, 0.15); width: 100%;">
                          <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; flex-wrap: wrap;">
                            <button
                              @click=${(e: Event) => {
                                e.stopPropagation();
                                soundEffects.playPop();
                                handleImageSelected(
                                  dailyChallengeImage.dataUrl,
                                  dailyChallengeImage.name
                                );
                              }}
                              style="background-color: #FFFFFF; color: #000000; border: 2.5px solid #000000; padding: 0.625rem 0.875rem; border-radius: 16px; font-weight: 900; font-size: 0.875rem; display: flex; align-items: center; gap: 0.375rem; box-shadow: 2px 2px 0px 0px #000000; cursor: pointer;"
                            >
                              ${iconPaintBucket(20, "#000000")} Or Paint the Daily Challenge
                            </button>
                          </div>
                        </div>
                      </div>
                    `
                  : ""}

                <!-- STATE 3: Cartoon Image Canvas Displayed on Easel -->
                ${currentArtwork && !isProcessing
                  ? html`
                      <div style="width: 100%; display: flex; flex-direction: column; align-items: center;">
                        <div
                          style="position: relative; width: 100%; aspect-ratio: ${currentArtwork.width} / ${currentArtwork.height}; border-radius: 12px; overflow: hidden; border: 4px solid #000000; box-shadow: 4px 4px 0px 0px rgba(0,0,0,0.25); background-color: #FFFFFF; display: flex; align-items: center; justify-content: center;"
                        >
                          <img
                            src="${currentArtwork.cartoonDataUrl}"
                            alt="${currentArtwork.name}"
                            style="width: 100%; height: 100%; object-fit: contain; display: block;"
                          />
                        </div>
                      </div>
                    `
                  : ""}
              </div>
            </div>

            <!-- Wooden Easel Legs -->
            <div style="width: 100%; max-width: 28rem; display: flex; justify-content: space-between; padding: 0 2rem; margin-top: -0.5rem; z-index: 0;">
              <div style="width: 1.5rem; height: 4rem; background-color: #8B5E3C; border: 2px solid #3D2314; border-bottom-left-radius: 0.5rem; border-bottom-right-radius: 0.5rem; transform: rotate(12deg); box-shadow: 0 4px 6px rgba(0,0,0,0.1);"></div>
              <div style="width: 1.5rem; height: 5rem; background-color: #5C3D2E; border: 2px solid #3D2314; border-bottom-left-radius: 0.5rem; border-bottom-right-radius: 0.5rem; box-shadow: 0 4px 6px rgba(0,0,0,0.1);"></div>
              <div style="width: 1.5rem; height: 4rem; background-color: #8B5E3C; border: 2px solid #3D2314; border-bottom-left-radius: 0.5rem; border-bottom-right-radius: 0.5rem; transform: rotate(-12deg); box-shadow: 0 4px 6px rgba(0,0,0,0.1);"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderStyleObject(styleObj: Record<string, string | number>): string {
    return Object.entries(styleObj)
      .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}: ${v};`)
      .join(" ");
  }
}
