import { html } from "lit";
import { customElement } from "lit/decorators.js";
import { SignalElement } from "../utils/SignalElement";
import {
  isWindowFocusedSignal,
  currentArtworkSignal,
  artworksSignal,
  isProcessingSignal,
  activeHighlightColorSignal,
  isDragOverSignal,
  zoomScaleSignal,
  handleImageSelected,
  handleSelectArtwork,
  draggedColorSignal,
  pushUndoState,
  footerStyleSignal,
} from "../state/store";
import { ProcessedArtwork } from "../types";
import { getDailyChallenge } from "../data/dailyChallenge";
import { soundEffects } from "../utils/soundEffects";
import {
  iconImage,
  iconLoader2,
  iconSparkles,
  iconUpload,
  iconPaintBucket,
} from "./icons";
import { transparentImgCss } from "./constants";

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
  private pointerDownX = 0;
  private pointerDownY = 0;
  private hasDragged = false;
  private lastArtworkId: string | null = null;
  private containerElement: HTMLElement | null = null;

  // Interactive Canvas State
  private activeArtworkId: string | null = null;
  private regionMapData: Int32Array | null = null;
  private isBorderPixel: Uint8Array | null = null;
  private regionBorderPixels: Map<number, Int32Array> | null = null;
  private regionExpectedColors = new Map<number, string>();
  private hoveredRegionId: number | null = null;
  private artworkWidth = 0;
  private artworkHeight = 0;
  private offscreenCanvas: HTMLCanvasElement | null = null;
  private offscreenCtx: CanvasRenderingContext2D | null = null;
  private lastPaintedStateStr = "";
  private lastBorderPaintedStateStr = "";
  private lastTargetHex: string | null = null;
  private borderOverlayCanvas: HTMLCanvasElement | null = null;
  private borderOverlayCtx: CanvasRenderingContext2D | null = null;

  public triggerFilePicker = () => {
    const input = document.getElementById(
      "easel-file-input"
    ) as HTMLInputElement;
    if (input) {
      input.value = "";
      input.click();
    }
  };

  firstUpdated() {
    this.setupZoomListeners();
    this.checkArtworkAndRender();
  }

  updated() {
    this.setupZoomListeners();
    this.checkArtworkAndRender();
  }

  private handleBlur = () => {
    this.pointerDownOnCanvas = false;
  };

  private handleRedrawArtboard = () => {
    this.lastPaintedStateStr = "";
    this.lastTargetHex = null;
    this.lastBorderPaintedStateStr = "";
    this.drawArtboardCanvas();
  };

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("blur", this.handleBlur);
    window.addEventListener("easel-redraw-artboard", this.handleRedrawArtboard);
    window.addEventListener("easel-zoom-in", this.zoomIn);
    window.addEventListener("easel-zoom-out", this.zoomOut);
    window.addEventListener("easel-zoom-set", this.handleZoomSet);
    window.addEventListener("easel-pan-delta", this.handlePanDelta);
    window.addEventListener("pointerdown", this.handleGlobalPointerDown, {
      capture: true,
    });
    window.addEventListener(
      "color-drag-move",
      this.handleColorDragMove as EventListener
    );
    window.addEventListener(
      "color-drop",
      this.handleColorDrop as EventListener
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("blur", this.handleBlur);
    window.removeEventListener("easel-redraw-artboard", this.handleRedrawArtboard);
    window.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerup", this.handlePointerUp);
    window.removeEventListener("pointercancel", this.handlePointerUp);
    window.removeEventListener("easel-zoom-in", this.zoomIn);
    window.removeEventListener("easel-zoom-out", this.zoomOut);
    window.removeEventListener("easel-zoom-set", this.handleZoomSet);
    window.removeEventListener("easel-pan-delta", this.handlePanDelta);
    window.removeEventListener("pointerdown", this.handleGlobalPointerDown, {
      capture: true,
    });
    window.removeEventListener(
      "color-drag-move",
      this.handleColorDragMove as EventListener
    );
    window.removeEventListener(
      "color-drop",
      this.handleColorDrop as EventListener
    );
  }

  private checkArtworkAndRender() {
    const currentArtwork = currentArtworkSignal.get();
    if (currentArtwork && currentArtwork.id !== this.activeArtworkId) {
      this.activeArtworkId = currentArtwork.id;
      this.prepareArtworkCanvas(currentArtwork);
    } else if (currentArtwork) {
      this.drawArtboardCanvas();
    }
  }

  private prepareArtworkCanvas(artwork: ProcessedArtwork) {
    this.artworkWidth = artwork.width;
    this.artworkHeight = artwork.height;
    this.regionExpectedColors.clear();

    if (artwork.regionExpectedColors) {
      for (const [regionId, hex] of Object.entries(
        artwork.regionExpectedColors
      )) {
        this.regionExpectedColors.set(Number(regionId), hex);
      }
    }

    if (
      artwork.regionMapData &&
      artwork.regionMapData.length === artwork.width * artwork.height
    ) {
      this.regionMapData = new Int32Array(artwork.regionMapData);
      this.computeBorderMap(artwork.width, artwork.height);

      // If we didn't have regionExpectedColors but we had regionMapData, we must extract colors from image
      if (!artwork.regionExpectedColors) {
        this.extractColorsFromImage(artwork);
      } else {
        this.drawArtboardCanvas();
      }
    } else {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = artwork.width;
        tempCanvas.height = artwork.height;
        const ctx = tempCanvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;

        ctx.drawImage(img, 0, 0);
        const srcData = ctx.getImageData(0, 0, artwork.width, artwork.height);

        this.buildRegionMapFromImageData(srcData);
        this.computeBorderMap(artwork.width, artwork.height);
        this.drawArtboardCanvas();
      };
      img.src = artwork.cartoonDataUrl;
    }
  }

  private extractColorsFromImage(artwork: ProcessedArtwork) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = artwork.width;
      tempCanvas.height = artwork.height;
      const ctx = tempCanvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const srcData = ctx.getImageData(0, 0, artwork.width, artwork.height);

      // Just extract colors using existing map
      if (this.regionMapData) {
        const w = artwork.width;
        const h = artwork.height;
        const data = srcData.data;
        const seenRegions = new Set<number>();
        for (let i = 0; i < w * h; i++) {
          const regionId = this.regionMapData[i];
          if (regionId >= 0 && !seenRegions.has(regionId)) {
            seenRegions.add(regionId);
            const r = data[i * 4];
            const g = data[i * 4 + 1];
            const b = data[i * 4 + 2];
            const hex = `#${r.toString(16).padStart(2, "0")}${g
              .toString(16)
              .padStart(2, "0")}${b
              .toString(16)
              .padStart(2, "0")}FF`.toUpperCase();
            this.regionExpectedColors.set(regionId, hex);
          }
        }
      }
      this.drawArtboardCanvas();
    };
    img.src = artwork.cartoonDataUrl;
  }

  private buildRegionMapFromImageData(imageData: ImageData): number {
    const w = imageData.width;
    const h = imageData.height;
    const data = imageData.data;
    const regionMap = new Int32Array(w * h);
    regionMap.fill(-1);

    const visited = new Uint8Array(w * h);
    let nextRegionId = 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (visited[idx]) continue;

        const pxIdx = idx * 4;
        const r = data[pxIdx];
        const g = data[pxIdx + 1];
        const b = data[pxIdx + 2];
        const a = data[pxIdx + 3];

        const regionId = nextRegionId++;

        const hex = `#${r.toString(16).padStart(2, "0")}${g
          .toString(16)
          .padStart(2, "0")}${b.toString(16).padStart(2, "0")}FF`.toUpperCase();
        this.regionExpectedColors.set(regionId, hex);

        const queue = [x, y];
        visited[idx] = 1;

        let head = 0;
        while (head < queue.length) {
          const qx = queue[head++];
          const qy = queue[head++];
          const qIdx = qy * w + qx;

          regionMap[qIdx] = regionId;

          const neighbors = [
            [qx + 1, qy],
            [qx - 1, qy],
            [qx, qy + 1],
            [qx, qy - 1],
          ];

          for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              const nIdx = ny * w + nx;
              if (!visited[nIdx]) {
                const nPxIdx = nIdx * 4;
                const nr = data[nPxIdx];
                const ng = data[nPxIdx + 1];
                const nb = data[nPxIdx + 2];
                const na = data[nPxIdx + 3];

                if (r === nr && g === ng && b === nb && a === na) {
                  visited[nIdx] = 1;
                  queue.push(nx, ny);
                }
              }
            }
          }
        }
      }
    }

    this.regionMapData = regionMap;
    return nextRegionId;
  }

  private computeBorderMap(w: number, h: number) {
    if (!this.regionMapData) return;

    const totalPixels = w * h;
    const isBorder = new Uint8Array(totalPixels);
    const regionBorderSets = new Map<number, Set<number>>();

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const r1 = this.regionMapData[idx];
        if (r1 < 0) continue;

        if (!regionBorderSets.has(r1)) {
          regionBorderSets.set(r1, new Set<number>());
        }

        const rRight = x + 1 < w ? this.regionMapData[idx + 1] : -1;
        const rDown = y + 1 < h ? this.regionMapData[idx + w] : -1;

        if ((rRight >= 0 && rRight !== r1) || (rDown >= 0 && rDown !== r1)) {
          isBorder[idx] = 1;
          regionBorderSets.get(r1)?.add(idx);

          if (rRight >= 0 && rRight !== r1) {
            const idxRight = idx + 1;
            isBorder[idxRight] = 1;
            if (!regionBorderSets.has(rRight))
              regionBorderSets.set(rRight, new Set<number>());
            regionBorderSets.get(rRight)?.add(idxRight);
          }
          if (rDown >= 0 && rDown !== r1) {
            const idxDown = idx + w;
            isBorder[idxDown] = 1;
            if (!regionBorderSets.has(rDown))
              regionBorderSets.set(rDown, new Set<number>());
            regionBorderSets.get(rDown)?.add(idxDown);
          }
        }
      }
    }

    const regionBorderPixels = new Map<number, Int32Array>();
    for (const [regId, set] of regionBorderSets.entries()) {
      regionBorderPixels.set(regId, Int32Array.from(set));
    }

    this.isBorderPixel = isBorder;
    this.regionBorderPixels = regionBorderPixels;
  }

  private drawArtboardCanvas() {
    const canvas = this.querySelector<HTMLCanvasElement>("#artboard-canvas");
    const currentArtwork = currentArtworkSignal.get();
    if (!canvas || !currentArtwork || !this.regionMapData) return;

    const w = this.artworkWidth;
    const h = this.artworkHeight;
    if (w <= 0 || h <= 0) return;

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const destCtx = canvas.getContext("2d");
    if (!destCtx) return;

    if (
      !this.offscreenCanvas ||
      this.offscreenCanvas.width !== w ||
      this.offscreenCanvas.height !== h
    ) {
      this.offscreenCanvas = document.createElement("canvas");
      this.offscreenCanvas.width = w;
      this.offscreenCanvas.height = h;
      this.offscreenCtx = this.offscreenCanvas.getContext("2d", {
        willReadFrequently: true,
      });
      this.lastPaintedStateStr = "";
    }

    if (
      !this.borderOverlayCanvas ||
      this.borderOverlayCanvas.width !== w ||
      this.borderOverlayCanvas.height !== h
    ) {
      this.borderOverlayCanvas = document.createElement("canvas");
      this.borderOverlayCanvas.width = w;
      this.borderOverlayCanvas.height = h;
      this.borderOverlayCtx = this.borderOverlayCanvas.getContext("2d");
      this.lastTargetHex = null;
    }

    if (!this.offscreenCtx || !this.borderOverlayCtx) return;

    // 1. Render PURE PAINT CANVAS PIXELS (no borders or darkening embedded in image data!)
    const currentPaintedStateStr = currentArtwork.modifiedAt
      ? currentArtwork.modifiedAt.toString()
      : "0";
    if (this.lastPaintedStateStr !== currentPaintedStateStr) {
      const imgData = this.offscreenCtx.createImageData(w, h);
      const pixels = imgData.data;
      const paintedState = currentArtwork.paintedRegionsState || {};

      for (let i = 0; i < w * h; i++) {
        const pxIdx = i * 4;
        const regionId = this.regionMapData[i];
        const paintedColor = paintedState[regionId];

        if (paintedColor) {
          const rgba = this.parseColorToRGBA(paintedColor);
          pixels[pxIdx] = rgba[0];
          pixels[pxIdx + 1] = rgba[1];
          pixels[pxIdx + 2] = rgba[2];
          pixels[pxIdx + 3] = rgba[3];
        } else {
          // Unpainted island starts as clean white
          pixels[pxIdx] = 255;
          pixels[pxIdx + 1] = 255;
          pixels[pxIdx + 2] = 255;
          pixels[pxIdx + 3] = 255;
        }
      }

      this.offscreenCtx.putImageData(imgData, 0, 0);
      this.lastPaintedStateStr = currentPaintedStateStr;
    }

    // 2. Draw base paint canvas onto screen context
    destCtx.fillStyle = "#ffffff";
    destCtx.fillRect(0, 0, w, h);
    destCtx.drawImage(this.offscreenCanvas, 0, 0);

    // 3. SEPARATE DISPLAY OVERLAY PASS: Render contrasting island guide borders on screen context
    const activeColor = activeHighlightColorSignal.get();
    const draggedColorHex = draggedColorSignal.get();
    const targetHex = draggedColorHex || activeColor?.hexCode;
    const cacheableTargetHex = targetHex || "none";
    const paintedState = currentArtwork.paintedRegionsState || {};

    if (
      this.lastTargetHex !== cacheableTargetHex ||
      this.lastBorderPaintedStateStr !== currentPaintedStateStr
    ) {
      this.borderOverlayCtx.clearRect(0, 0, w, h);
      if (
        this.isBorderPixel &&
        targetHex &&
        targetHex !== "#00000000"
      ) {
        const targetHexUpper = targetHex.toUpperCase();
        const overlayImgData = this.borderOverlayCtx.createImageData(w, h);
        const overlayPixels = overlayImgData.data;

        // Function to determine contrasting outline RGBA for any pixel position
        const getContrastingOutlineRGBA = (
          pxX: number,
          pxY: number
        ): [number, number, number, number] => {
          const rId = this.regionMapData![pxY * w + pxX];
          const pColor = paintedState[rId];
          let bgR = 255;
          let bgG = 255;
          let bgB = 255;
          if (pColor) {
            const [r, g, b] = this.parseColorToRGBA(pColor);
            bgR = r;
            bgG = g;
            bgB = b;
          }
          const lum = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;
          // If surrounding space is light (lum > 128), use dark outline.
          // If surrounding space is dark (lum <= 128), use light outline.
          if (lum > 128) {
            return [0, 0, 0, 190];
          } else {
            return [255, 255, 255, 220];
          }
        };

        let hasVisibleBorders = false;
        for (let i = 0; i < w * h; i++) {
          if (this.isBorderPixel[i] === 1) {
            const regionId = this.regionMapData[i];
            const expectedColor =
              this.regionExpectedColors.get(regionId) ||
              currentArtwork.regionExpectedColors?.[regionId];

            if (
              expectedColor &&
              expectedColor.startsWith(targetHexUpper.substring(0, 7))
            ) {
              const paintedColor = paintedState[regionId];
              const isFilledDifferent =
                paintedColor &&
                !paintedColor.toUpperCase().startsWith(targetHexUpper.substring(0, 7));

              if (isFilledDifferent) {
                const x = i % w;
                const y = Math.floor(i / w);
                for (let dy = -1; dy <= 1; dy++) {
                  for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                      const pxIdx = (ny * w + nx) * 4;
                      const [cR, cG, cB, cA] = getContrastingOutlineRGBA(nx, ny);
                      overlayPixels[pxIdx] = cR;
                      overlayPixels[pxIdx + 1] = cG;
                      overlayPixels[pxIdx + 2] = cB;
                      overlayPixels[pxIdx + 3] = cA;
                    }
                  }
                }
              } else {
                const pxIdx = i * 4;
                const x = i % w;
                const y = Math.floor(i / w);
                const [cR, cG, cB, cA] = getContrastingOutlineRGBA(x, y);
                overlayPixels[pxIdx] = cR;
                overlayPixels[pxIdx + 1] = cG;
                overlayPixels[pxIdx + 2] = cB;
                overlayPixels[pxIdx + 3] = cA;
              }
              hasVisibleBorders = true;
            }
          }
        }

        if (hasVisibleBorders) {
          this.borderOverlayCtx.putImageData(overlayImgData, 0, 0);
        }
      }
      this.lastTargetHex = cacheableTargetHex;
      this.lastBorderPaintedStateStr = currentPaintedStateStr;
    }

    // Draw the cached border overlay
    destCtx.drawImage(this.borderOverlayCanvas, 0, 0);

    // 4. Hover Highlight Pass: draw active hover region outline overlay in selected color
    if (this.hoveredRegionId !== null && this.regionBorderPixels) {
      const borderIndices = this.regionBorderPixels.get(this.hoveredRegionId);
      if (borderIndices && borderIndices.length > 0) {
        if (targetHex && targetHex !== "#00000000") {
          const targetRGBARaw = this.parseColorToRGBA(targetHex);
          destCtx.fillStyle = `rgba(${targetRGBARaw[0]}, ${targetRGBARaw[1]}, ${targetRGBARaw[2]}, 1.0)`;
        } else {
          destCtx.fillStyle = "rgba(0, 0, 0, 1.0)";
        }

        const expectedColor =
          this.regionExpectedColors.get(this.hoveredRegionId) ||
          currentArtwork.regionExpectedColors?.[this.hoveredRegionId];
        const targetHexUpper = targetHex ? targetHex.toUpperCase() : "";
        const paintedColor = paintedState[this.hoveredRegionId];
        const isFilledDifferent =
          targetHex &&
          expectedColor &&
          expectedColor.startsWith(targetHexUpper.substring(0, 7)) &&
          paintedColor &&
          !paintedColor.toUpperCase().startsWith(targetHexUpper.substring(0, 7));

        if (isFilledDifferent) {
          for (let k = 0; k < borderIndices.length; k++) {
            const pIdx = borderIndices[k];
            const bx = pIdx % w;
            const by = Math.floor(pIdx / w);
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const nx = bx + dx;
                const ny = by + dy;
                if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                  destCtx.fillRect(nx, ny, 1, 1);
                }
              }
            }
          }
        } else {
          for (let k = 0; k < borderIndices.length; k++) {
            const pIdx = borderIndices[k];
            const bx = pIdx % w;
            const by = Math.floor(pIdx / w);
            destCtx.fillRect(bx, by, 1, 1);
          }
        }
      }
    }
  }

  private getDarkenedRGB(
    r: number,
    g: number,
    b: number
  ): [number, number, number] {
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    if (luminance > 127.5) {
      // 50% of 255
      const scale = 127.5 / luminance;
      return [
        Math.floor(r * scale),
        Math.floor(g * scale),
        Math.floor(b * scale),
      ];
    }
    return [r, g, b];
  }

  private parseColorToRGBA(colorStr: string): [number, number, number, number] {
    if (colorStr.startsWith("#")) {
      let hex = colorStr.slice(1);
      if (hex.length === 3 || hex.length === 4) {
        hex = hex
          .split("")
          .map((c) => c + c)
          .join("");
      }
      const r = parseInt(hex.slice(0, 2), 16) || 0;
      const g = parseInt(hex.slice(2, 4), 16) || 0;
      const b = parseInt(hex.slice(4, 6), 16) || 0;
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255;
      return [r, g, b, a];
    }
    return [255, 255, 255, 255];
  }

  private pointerDownOnCanvas = false;

  private handleGlobalPointerDown = (e: PointerEvent) => {
    if (!isWindowFocusedSignal.get()) {
      this.pointerDownOnCanvas = false;
      return;
    }
    const canvas = this.querySelector("#artboard-canvas");
    if (canvas) {
      const path = e.composedPath();
      this.pointerDownOnCanvas = path.includes(canvas);
    } else {
      this.pointerDownOnCanvas = false;
    }
  };

  private handleCanvasPointerUp = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!this.pointerDownOnCanvas) return;

    // Always reset the pointer down state so we don't accidentally paint on subsequent clicks
    // that were swallowed during the pointerdown phase (e.g. dismissing overlays).
    this.pointerDownOnCanvas = false;

    if (this.hasDragged) {
      return;
    }
    if (draggedColorSignal.get()) {
      return;
    }
    if (!this.regionMapData) return;
    const currentArtwork = currentArtworkSignal.get();
    if (!currentArtwork) return;

    const canvas = e.currentTarget as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clickX = Math.floor((e.clientX - rect.left) * scaleX);
    const clickY = Math.floor((e.clientY - rect.top) * scaleY);

    if (
      clickX >= 0 &&
      clickX < canvas.width &&
      clickY >= 0 &&
      clickY < canvas.height
    ) {
      const pixelIdx = clickY * canvas.width + clickX;
      const regionId = this.regionMapData[pixelIdx];
      if (regionId !== undefined && regionId >= 0) {
        let activeColor = activeHighlightColorSignal.get();
        if (!activeColor) {
          // If no color selected yet, default to first palette color
          const defaultColor = currentArtwork.colorStats[0]?.color;
          if (defaultColor) {
            activeHighlightColorSignal.set(defaultColor);
            activeColor = defaultColor;
          }
        }

        if (activeColor) {
          const currentPainted = {
            ...(currentArtwork.paintedRegionsState || {}),
          };

          pushUndoState(currentPainted);
          if (activeColor.hexCode === "#00000000") {
            // Eraser mode
            delete currentPainted[regionId];
            soundEffects.playPop();
          } else {
            // Paint or replace existing region color
            currentPainted[regionId] = activeColor.hexCode;
            soundEffects.playPop();
          }

          const updatedArtwork: ProcessedArtwork = {
            ...currentArtwork,
            paintedRegionsState: currentPainted,
            modifiedAt: Date.now(),
          };
          handleSelectArtwork(updatedArtwork);
          this.drawArtboardCanvas();
        }
      }
    }
  };

  private handleCanvasMouseMove = (e: MouseEvent) => {
    if (e.buttons === 0 && this.isDragging) {
      this.isDragging = false;
      this.hasDragged = false;
    }
    if (this.isDragging || draggedColorSignal.get()) {
      return;
    }
    if (!this.regionMapData) return;
    const canvas = e.currentTarget as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);

    if (x >= 0 && x < canvas.width && y >= 0 && y < canvas.height) {
      const regionId = this.regionMapData[y * canvas.width + x];
      if (this.hoveredRegionId !== regionId) {
        this.hoveredRegionId = regionId;
        this.drawArtboardCanvas();
      }
    } else if (this.hoveredRegionId !== null) {
      this.hoveredRegionId = null;
      this.drawArtboardCanvas();
    }
  };

  private handleCanvasMouseLeave = () => {
    if (draggedColorSignal.get()) return;
    if (this.hoveredRegionId !== null) {
      this.hoveredRegionId = null;
      this.drawArtboardCanvas();
    }
  };

  private dropperBufferPx = 60;

  private handleColorDragMove = (e: Event) => {
    const customEvent = e as CustomEvent;
    const { x: clientX, y: mouseY } = customEvent.detail;
    const clientY = mouseY - this.dropperBufferPx;
    if (!this.regionMapData) return;

    const canvas = this.querySelector("#artboard-canvas") as HTMLCanvasElement;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const elementAtPoint = document.elementFromPoint(clientX, clientY);
    if (
      elementAtPoint === canvas &&
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    ) {
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = Math.floor((clientX - rect.left) * scaleX);
      const y = Math.floor((clientY - rect.top) * scaleY);

      if (x >= 0 && x < canvas.width && y >= 0 && y < canvas.height) {
        const regionId = this.regionMapData[y * canvas.width + x];
        if (this.hoveredRegionId !== regionId) {
          this.hoveredRegionId = regionId;
          this.drawArtboardCanvas();
        }
      }
    } else {
      if (this.hoveredRegionId !== null) {
        this.hoveredRegionId = null;
        this.drawArtboardCanvas();
      }
    }
  };

  private handleColorDrop = (e: Event) => {
    const customEvent = e as CustomEvent;
    const { x: clientX, y: mouseY, color } = customEvent.detail;
    const clientY = mouseY - this.dropperBufferPx;

    // Clear hover effect
    if (this.hoveredRegionId !== null) {
      this.hoveredRegionId = null;
      this.drawArtboardCanvas();
    }

    if (!this.regionMapData) return;
    const currentArtwork = currentArtworkSignal.get();
    if (!currentArtwork) return;

    const canvas = this.querySelector("#artboard-canvas") as HTMLCanvasElement;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const elementAtPoint = document.elementFromPoint(clientX, clientY);
    if (
      elementAtPoint === canvas &&
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    ) {
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = Math.floor((clientX - rect.left) * scaleX);
      const y = Math.floor((clientY - rect.top) * scaleY);

      if (x >= 0 && x < canvas.width && y >= 0 && y < canvas.height) {
        const regionId = this.regionMapData[y * canvas.width + x];
        if (regionId !== undefined && regionId >= 0) {
          const currentPainted = {
            ...(currentArtwork.paintedRegionsState || {}),
          };
          pushUndoState(currentPainted);

          if (color === "#00000000") {
            delete currentPainted[regionId];
            soundEffects.playPop();
          } else {
            currentPainted[regionId] = color;
            soundEffects.playPop();
          }

          const updatedArtwork: ProcessedArtwork = {
            ...currentArtwork,
            paintedRegionsState: currentPainted,
            modifiedAt: Date.now(),
          };
          handleSelectArtwork(updatedArtwork);
          this.drawArtboardCanvas();
        }
      }
    }
  };

  private setupZoomListeners() {
    const container = this.querySelector<HTMLElement>("#easel-zoom-container");
    if (container && container !== this.containerElement) {
      if (this.containerElement) {
        this.containerElement.removeEventListener(
          "touchstart",
          this.handleTouchStart
        );
        this.containerElement.removeEventListener(
          "touchmove",
          this.handleTouchMove
        );
        this.containerElement.removeEventListener(
          "touchend",
          this.handleTouchEnd
        );
        this.containerElement.removeEventListener(
          "touchcancel",
          this.handleTouchEnd
        );
        this.containerElement.removeEventListener("wheel", this.handleWheel);
        this.containerElement.removeEventListener(
          "pointerdown",
          this.handlePointerDown
        );
      }
      this.containerElement = container;
      container.addEventListener("touchstart", this.handleTouchStart, {
        passive: false,
      });
      container.addEventListener("touchmove", this.handleTouchMove, {
        passive: false,
      });
      container.addEventListener("touchend", this.handleTouchEnd, {
        passive: false,
      });
      container.addEventListener("touchcancel", this.handleTouchEnd, {
        passive: false,
      });
      container.addEventListener("wheel", this.handleWheel, { passive: false });
      container.addEventListener("pointerdown", this.handlePointerDown);

      window.removeEventListener("pointermove", this.handlePointerMove);
      window.removeEventListener("pointerup", this.handlePointerUp);
      window.removeEventListener("pointercancel", this.handlePointerUp);
      window.addEventListener("pointermove", this.handlePointerMove);
      window.addEventListener("pointerup", this.handlePointerUp);
      window.addEventListener("pointercancel", this.handlePointerUp);
    }
  }

  private updateTransformStyle() {
    const el = this.querySelector("#easel-transform-element") as HTMLElement;
    if (el) {
      el.style.transform = `translate3d(${this.panX}px, ${this.panY}px, 0px) scale(${this.scale})`;
      el.style.transition =
        this.isDragging || this.isPinching
          ? "none"
          : "transform 0.15s cubic-bezier(0.2, 0, 0, 1)";
    }
  }

  private setScale(s: number) {
    const newScale = Math.min(8.0, Math.max(0.5, s));
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
    this.updateTransformStyle();
  }

  private clampPanX(x: number, s: number): number {
    const w = this.containerElement?.clientWidth || 350;
    const maxPan = (w * s) / 2;
    return Math.max(-maxPan, Math.min(maxPan, x));
  }

  private clampPanY(y: number, s: number): number {
    const h = this.containerElement?.clientHeight || 350;
    // half the scaled easel size cause panning is calculated from the middle
    const basePan = (h * s) / 2;
    const minScreenSize = Math.min(window.innerHeight, window.innerWidth);
    // give some extra room at the bottom depending on screen size
    const maxPanUp = basePan + minScreenSize * 0.3;
    // stop it from going to far down, limit adjustment by half screen size
    const maxPanDown = Math.max(0, basePan - minScreenSize * 0.3);
    return Math.max(-maxPanUp, Math.min(maxPanDown, y));
  }

  private handleZoomSet = (e: Event) => {
    const scale = (e as CustomEvent).detail.scale;
    if (scale !== undefined) {
      this.setScale(scale);
    }
  };

  private handlePanDelta = (e: Event) => {
    const { dx, dy } = (e as CustomEvent).detail;
    if (true) {
      // always allow pan delta
      this.panX = this.clampPanX(this.panX + dx, this.scale);
      this.panY = this.clampPanY(this.panY + dy, this.scale);
      this.updateTransformStyle();
    }
  };

  private zoomIn = () => {
    this.setScale(this.scale * 1.4);
  };

  private zoomOut = () => {
    this.setScale(this.scale / 1.4);
  };

  private handleTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      this.isPinching = true;
      this.hasDragged = true;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      this.initialPinchDist = Math.hypot(
        t1.clientX - t2.clientX,
        t1.clientY - t2.clientY
      );
      this.initialScale = this.scale;
      this.startTouchX = (t1.clientX + t2.clientX) / 2;
      this.startTouchY = (t1.clientY + t2.clientY) / 2;
      this.startPanX = this.panX;
      this.startPanY = this.panY;
      this.updateTransformStyle();
    } else if (e.touches.length === 1) {
      this.isPinching = false;
      this.hasDragged = false;
      this.pointerDownX = e.touches[0].clientX;
      this.pointerDownY = e.touches[0].clientY;
      this.startTouchX = e.touches[0].clientX;
      this.startTouchY = e.touches[0].clientY;
      this.startPanX = this.panX;
      this.startPanY = this.panY;
      this.updateTransformStyle();

      const now = Date.now();
      if (now - this.lastTapTime < 300) {
        this.hasDragged = true;
        if (this.scale > 1.2) {
          this.setScale(1);
        } else {
          this.setScale(2.5);
        }
        this.lastTapTime = 0;
      } else {
        this.lastTapTime = now;
      }
    }
  };

  private handleTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 2 && this.initialPinchDist > 0) {
      e.preventDefault();
      this.hasDragged = true;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const ratio = dist / this.initialPinchDist;
      const targetScale = Math.min(
        8.0,
        Math.max(0.5, this.initialScale * ratio)
      );

      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      const dx = midX - this.startTouchX;
      const dy = midY - this.startTouchY;

      this.scale = targetScale;
      this.panX = this.clampPanX(this.startPanX + dx, targetScale);
      this.panY = this.clampPanY(this.startPanY + dy, targetScale);
      zoomScaleSignal.set(this.scale);
      this.updateTransformStyle();
    } else if (e.touches.length === 1) {
      const dx = e.touches[0].clientX - this.pointerDownX;
      const dy = e.touches[0].clientY - this.pointerDownY;
      if (Math.hypot(dx, dy) > 10) {
        this.hasDragged = true;
      }
      if (true) {
        // always allow pan on touch
        e.preventDefault();
        this.panX = this.clampPanX(this.startPanX + dx, this.scale);
        this.panY = this.clampPanY(this.startPanY + dy, this.scale);
        this.updateTransformStyle();
      }
    }
  };

  private handleTouchEnd = (e: TouchEvent) => {
    if (e.touches.length < 2) {
      this.isPinching = false;
      this.initialPinchDist = 0;
      zoomScaleSignal.set(this.scale);
      this.updateTransformStyle();
    }
  };

  private handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.15 : 0.85;
    this.setScale(this.scale * delta);
  };

  private handlePointerDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (this.isPinching) return;
    this.pointerDownX = e.clientX;
    this.pointerDownY = e.clientY;
    this.hasDragged = false;
    this.isDragging = true;
    this.startTouchX = e.clientX;
    this.startTouchY = e.clientY;
    this.startPanX = this.panX;
    this.startPanY = this.panY;
    this.updateTransformStyle();
  };

  private handlePointerMove = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.buttons === 0 && this.isDragging) {
      this.isDragging = false;
      this.hasDragged = false;
      this.updateTransformStyle();
    }
    if (this.isPinching || !this.isDragging) return;
    const dist = Math.hypot(
      e.clientX - this.pointerDownX,
      e.clientY - this.pointerDownY
    );
    if (dist > 10) {
      this.hasDragged = true;
    }
    if (true) {
      // always allow pan
      const dx = e.clientX - this.startTouchX;
      const dy = e.clientY - this.startTouchY;
      this.panX = this.clampPanX(this.startPanX + dx, this.scale);
      this.panY = this.clampPanY(this.startPanY + dy, this.scale);
      this.updateTransformStyle();
    }
  };

  private handlePointerUp = () => {
    this.pointerDownOnCanvas = false;
    this.isDragging = false;
    this.updateTransformStyle();
  };

  private handleFileInput = (file: File) => {
    if (file && file.type.startsWith("image/")) {
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

  render() {
    const currentArtwork = currentArtworkSignal.get();
    const currentArtworkId = currentArtwork?.id || null;
    activeHighlightColorSignal.get(); // Track active color to trigger updates
    draggedColorSignal.get(); // Track dragged color to trigger updates
    if (currentArtworkId !== this.lastArtworkId) {
      this.lastArtworkId = currentArtworkId;
      this.scale = 1;
      this.panX = 0;
      this.panY = 0;
      zoomScaleSignal.set(1);
      setTimeout(() => this.updateTransformStyle(), 0);
    }
    const isProcessing = isProcessingSignal.get();
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
      backgroundColor: "#845442",
      border: "3px solid #845442",
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
      backgroundColor: "#FFFFFF",
      border: "4px solid #845442",
      borderRadius: "8px",
      boxShadow: "12px 12px 0px 0px rgba(0,0,0,0.15)",
      position: "relative" as const,
      zIndex: 10,
      boxSizing: "border-box" as const,
    };

    const dropAreaStyle = {
      width: "100%",
      maxWidth: "28rem",
      margin: "1rem auto",
      padding: "1.5rem",
      borderRadius: "28px",
      border: "3px dashed " + (isDragOver ? "#E63946" : "#000000"),
      backgroundColor: isDragOver
        ? "rgba(255, 166, 201, 0.3)"
        : "rgba(255, 255, 255, 0.8)",
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
            id="easel-transform-element"
            style="width: 100%; display: flex; flex-direction: column; align-items: center; transform: translate3d(${this
              .panX}px, ${this.panY}px, 0px) scale(${this
              .scale}); transform-origin: center center; transition: ${this
              .isDragging || this.isPinching
              ? "none"
              : "transform 0.15s cubic-bezier(0.2, 0, 0, 1)"}; will-change: transform;"
          >
            <!-- Top Wooden Clamp -->
            <div style=${this.renderStyleObject(easelTopClampStyle)}></div>

            <!-- Main Frame -->
            <div style=${this.renderStyleObject(mainFrameStyle)}>
              <!-- Easel Canvas Display Area -->
              <div
                style="display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; padding: 0.5rem; background-size: 0.5rem 0.5rem; background-image: ${transparentImgCss};"
              >
                <!-- STATE 1: Processing Loader -->
                ${isProcessing
                  ? html`
                      <div
                        style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;"
                      >
                        <div
                          style="position: relative; width: 5rem; height: 5rem; margin-bottom: 1rem; display: flex; align-items: center; justify-content: center;"
                        >
                          ${iconLoader2(64, "#FFD166")}
                          <div style="position: absolute;">
                            ${iconSparkles(32, "#FFD166")}
                          </div>
                        </div>
                        <h3
                          style="font-size: 1.25rem; font-weight: 900; color: #3D2314; margin: 0 0 0.25rem 0; font-style: italic;"
                        >
                          Preparing Canvas..
                        </h3>
                        <p
                          style="font-size: 0.75rem; font-weight: 700; color: #4A2810; text-transform: uppercase; margin: 0;"
                        >
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

                        <div style="margin-top: 2rem; padding-top: 1.5rem; border-top: 2px solid rgba(0, 0, 0, 0.15); width: 100%;">
                          <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; flex-wrap: wrap;">
                            <button
                              @click=${(e: Event) => {
                                e.stopPropagation();
                                handleImageSelected(
                                  dailyChallengeImage.dataUrl,
                                  dailyChallengeImage.name
                                );
                              }}
                              style="background-color: #FFFFFF; color: #000000; border: 2.5px solid #000000; padding: 0.625rem 0.875rem; border-radius: 16px; font-weight: 900; font-size: 0.875rem; display: flex; align-items: center; gap: 0.375rem; box-shadow: 2px 2px 0px 0px #000000; cursor: pointer;"
                            >
                              ${iconPaintBucket(
                                20,
                                "#000000"
                              )} Or Paint the Daily Challenge
                            </button>
                          </div>
                        </div>
                      </div>

                      <footer style=${this.renderStyleObject(
                        footerStyleSignal.get()
                      )}>
                        <p style="margin: 0;">PAINT by COLOURS <a href="https://github.com/sponsors/iamogbz" target="_blank" style="color: inherit; text-decoration: inherit; cursor: pointer;">❤️ QBRKTS</a> ©️ ${new Date().getFullYear()}</p>
                      </footer>
                    </div>
                    `
                  : ""}

                <!-- STATE 3: Interactive Line-Art Painting Canvas -->
                ${currentArtwork && !isProcessing
                  ? html`
                      <div
                        style="width: 100%; display: flex; flex-direction: column; align-items: center;"
                      >
                        <div
                          style="position: relative; width: 100%; aspect-ratio: ${currentArtwork.width} / ${currentArtwork.height}; border-radius: 4px; overflow: hidden; display: flex; align-items: center; justify-content: center; background-color: #ffffff;"
                        >
                          <canvas
                            id="artboard-canvas"
                            @pointerup=${this.handleCanvasPointerUp}
                            @mousemove=${this.handleCanvasMouseMove}
                            @mouseleave=${this.handleCanvasMouseLeave}
                            style="width: 100%; height: 100%; object-fit: contain; display: block; cursor: crosshair;"
                          ></canvas>
                        </div>
                      </div>
                    `
                  : ""}
              </div>
            </div>

            <!-- Wooden Easel Legs -->
            <div
              style="width: 100%; max-width: 28rem; display: flex; justify-content: space-between; padding: 0 2rem; margin-top: -0.5rem; z-index: 0;"
            >
              <div
                style="width: 1.5rem; height: 4rem; background-color: #845442; border: 2px solid #845442; border-bottom-left-radius: 0.5rem; border-bottom-right-radius: 0.5rem; transform: rotate(12deg); box-shadow: 0 4px 6px rgba(0,0,0,0.1);"
              ></div>
              <div
                style="width: 1.5rem; height: 5rem; background-color: #845442; border: 2px solid #845442; border-bottom-left-radius: 0.5rem; border-bottom-right-radius: 0.5rem; box-shadow: 0 4px 6px rgba(0,0,0,0.1);"
              ></div>
              <div
                style="width: 1.5rem; height: 4rem; background-color: #845442; border: 2px solid #845442; border-bottom-left-radius: 0.5rem; border-bottom-right-radius: 0.5rem; transform: rotate(-12deg); box-shadow: 0 4px 6px rgba(0,0,0,0.1);"
              ></div>
            </div>
          </div>
        </div>
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
