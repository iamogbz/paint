import { html, svg } from "lit";
import { customElement } from "lit/decorators.js";
import { SignalElement } from "../utils/SignalElement";
import {
  isWindowFocusedSignal,
  currentArtworkSignal,
  isProcessingSignal,
  processingImageSrcSignal,
  processingImageWidthSignal,
  processingImageHeightSignal,
  activeHighlightColorSignal,
  isDragOverSignal,
  zoomScaleSignal,
  handleImageSelected,
  handleSelectArtwork,
  draggedColorSignal,
  pushUndoState,
  saveCurrentArtworkProgress,
  footerStyleSignal,
  isBrushModeSignal,
  artworksSignal,
} from "../state/store";
import { getDailyChallenge } from "../data/dailyChallenge";
import { soundEffects } from "../utils/soundEffects";
import { iconImage, iconSparkles, iconUpload, iconPaintBucket } from "./icons";
import { BASE_BRUSH_RADIUS, transparentImgCss } from "./constants";
import { deepCopy } from "../utils/object";
import { normalizeHex } from "../utils/color";
import { BrushStrokePaths, ProcessedArtwork } from "../types";

function erasePointsFromStrokePath(
  points: Array<{ x: number; y: number }>,
  cx: number,
  cy: number,
  r: number
): Array<Array<{ x: number; y: number }>> {
  if (points.length === 0) return [];
  if (points.length === 1) {
    const distSq = (points[0].x - cx) ** 2 + (points[0].y - cy) ** 2;
    return distSq < r * r ? [] : [[points[0]]];
  }

  const result: Array<Array<{ x: number; y: number }>> = [];
  let currentSubPath: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const a = dx * dx + dy * dy;

    if (a < 1e-9) {
      const distSq = (p1.x - cx) ** 2 + (p1.y - cy) ** 2;
      if (distSq >= r * r) {
        if (
          currentSubPath.length === 0 ||
          currentSubPath[currentSubPath.length - 1] !== p1
        ) {
          currentSubPath.push(p1);
        }
      }
      continue;
    }

    const fx = p1.x - cx;
    const fy = p1.y - cy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - r * r;

    const discriminant = b * b - 4 * a * c;

    if (discriminant < 0) {
      const p1Inside = fx * fx + fy * fy < r * r;
      if (!p1Inside) {
        if (currentSubPath.length === 0) {
          currentSubPath.push(p1);
        }
        currentSubPath.push(p2);
      } else {
        if (currentSubPath.length > 0) {
          result.push(currentSubPath);
          currentSubPath = [];
        }
      }
    } else {
      const sqrtDisc = Math.sqrt(discriminant);
      let t1 = (-b - sqrtDisc) / (2 * a);
      let t2 = (-b + sqrtDisc) / (2 * a);

      if (t1 > t2) {
        const temp = t1;
        t1 = t2;
        t2 = temp;
      }

      const tIn = Math.max(0, Math.min(t1, t2));
      const tOut = Math.min(1, Math.max(t1, t2));

      if (tIn >= tOut || tOut <= 0 || tIn >= 1) {
        if (currentSubPath.length === 0) {
          currentSubPath.push(p1);
        }
        currentSubPath.push(p2);
      } else {
        if (tIn > 0) {
          const intersectIn = {
            x: p1.x + tIn * dx,
            y: p1.y + tIn * dy,
          };
          if (currentSubPath.length === 0) {
            currentSubPath.push(p1);
          }
          currentSubPath.push(intersectIn);
          result.push(currentSubPath);
          currentSubPath = [];
        } else {
          if (currentSubPath.length > 0) {
            result.push(currentSubPath);
            currentSubPath = [];
          }
        }

        if (tOut < 1) {
          const intersectOut = {
            x: p1.x + tOut * dx,
            y: p1.y + tOut * dy,
          };
          currentSubPath.push(intersectOut);
          currentSubPath.push(p2);
        }
      }
    }
  }

  if (currentSubPath.length > 0) {
    result.push(currentSubPath);
  }

  return result;
}

function eraseFromStrokesList(
  strokes: Array<{
    points: Array<{ x: number; y: number }>;
    stroke: string;
    strokeWidth: number;
  }>,
  eraserPoints: Array<{ x: number; y: number }>,
  eraserRadius: number
): Array<{
  points: Array<{ x: number; y: number }>;
  stroke: string;
  strokeWidth: number;
}> {
  let currentStrokes = [...strokes];

  for (const ep of eraserPoints) {
    const nextStrokes: Array<{
      points: Array<{ x: number; y: number }>;
      stroke: string;
      strokeWidth: number;
    }> = [];
    for (const stroke of currentStrokes) {
      const splitPaths = erasePointsFromStrokePath(
        stroke.points,
        ep.x,
        ep.y,
        eraserRadius
      );
      for (const path of splitPaths) {
        if (path.length > 0) {
          nextStrokes.push({
            ...stroke,
            points: path,
          });
        }
      }
    }
    currentStrokes = nextStrokes;
  }

  return currentStrokes;
}

@customElement("easel-board")
export class EaselBoard extends SignalElement {
  private scale = 1;
  private panX = 0;
  private panY = 0;
  private isDragging = false;
  private zoomAnimationEndTime = 0;
  private isPinching = false;
  private pinchActiveInGesture = false;
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
  private hoveredRegionId: number | null = null;

  // Brush Painting State
  private isBrushPainting = false;
  private brushTargetRegionId: number | null = null;
  private hasPaintedInCurrentStroke = false;
  private activeStrokeIdx = -1;
  private currentStrokeRegionId: number | null = null;
  // faster buffering of painted paths without waiting for save logic
  private brushStrokePaths = {} as BrushStrokePaths;
  private brushPositionBuffer =
    [] as BrushStrokePaths[number][number]["points"];

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
    window.addEventListener("color-drag-move", this.handleColorDragMove);
    window.addEventListener("color-drop", this.handleColorDrop);
    window.addEventListener("pointerup", this.handleGlobalPointerUp);
    window.addEventListener("pointercancel", this.handleGlobalPointerUp);
    window.addEventListener("easel-zoom-set", this.handleZoomSet);
    window.addEventListener("easel-pan-delta", this.handlePanDelta);
    window.addEventListener("easel-zoom-in", this.zoomIn);
    window.addEventListener("easel-zoom-out", this.zoomOut);
    window.addEventListener("easel-redraw-artboard", this.redrawArtboard);

    (window as any).getRegionColors = () => {
      const currentArtwork = currentArtworkSignal.get();
      if (!currentArtwork) return {};
      const colors: Record<number, string> = {};
      for (const path of currentArtwork.svgPaths || []) {
        colors[path.id] =
          currentArtwork.paintedRegionsState?.[path.id] ||
          currentArtwork.regionExpectedColors?.[path.id] ||
          "#00000000";
      }
      return colors;
    };

    (window as any).setRegionHighlight = (
      regionId: number,
      colorHex?: string
    ) => {
      this.hoveredRegionId = regionId;
      if (colorHex) {
        activeHighlightColorSignal.set({
          hexCode: colorHex,
          rgba: [0, 0, 0, 255],
        });
      }
      this.requestUpdate();
    };

    (window as any).setRegionFill = (regionId: number, colorHex: string) => {
      this.fillRegion(regionId, colorHex);
    };
  }

  updated() {
    this.setupZoomListeners();
  }

  private fillRegion(regionId: number, colorHex: string) {
    const currentArtwork = currentArtworkSignal.get();
    if (!currentArtwork) return;

    const expected = currentArtwork.regionExpectedColors?.[regionId];
    if (!expected || expected === "#00000000") return;

    const currentColor = currentArtwork.paintedRegionsState?.[regionId];
    if (currentColor === colorHex) return;

    const isBrushMode = isBrushModeSignal.get();
    if (!isBrushMode || (isBrushMode && !this.hasPaintedInCurrentStroke)) {
      pushUndoState(
        currentArtwork.paintedRegionsState,
        currentArtwork.colorStats,
        currentArtwork.brushStrokePaths
      );
      this.hasPaintedInCurrentStroke = true;
    }

    if (!isBrushMode) {
      delete this.brushStrokePaths[regionId];
    }

    const newPaintedState = {
      ...(currentArtwork.paintedRegionsState || {}),
      [regionId]: colorHex,
    };

    saveCurrentArtworkProgress(newPaintedState, this.brushStrokePaths);

    if (colorHex === expected) {
      soundEffects.playPop();
    } else {
      soundEffects.playBrushSwoosh();
    }
  }

  private dropperBufferPx = 60;

  private normalizeHexColor(hex: string | undefined): string {
    if (!hex) return "";
    let h = hex.trim().toUpperCase();
    if (!h.startsWith("#")) {
      h = "#" + h;
    }
    if (h.length === 7) {
      h = h + "FF";
    }
    return h;
  }

  private getRegionIdAtPoint(
    clientX: number,
    clientY: number,
    isDragging: boolean,
    overrideColorHex?: string
  ): number | null {
    const currentArtwork = currentArtworkSignal.get();
    if (!currentArtwork) return null;

    let selectedColorHex = overrideColorHex || null;
    if (!selectedColorHex) {
      const activeColor = activeHighlightColorSignal.get();
      if (activeColor) {
        selectedColorHex = activeColor.hexCode;
      }
    }

    const targetX = clientX;
    const targetY = isDragging ? clientY - this.dropperBufferPx : clientY;

    const elementUnderneath = document.elementFromPoint(targetX, targetY);
    if (
      elementUnderneath &&
      elementUnderneath.tagName.toLowerCase() === "path"
    ) {
      const regionIdStr = elementUnderneath.getAttribute("data-region-id");
      if (regionIdStr) {
        return parseInt(regionIdStr, 10);
      }
    }

    return null;
  }

  private handleColorDragMove = (e: Event) => {
    const customEvent = e as CustomEvent;
    const { x: clientX, y: mouseY } = customEvent.detail;

    const regionId = this.getRegionIdAtPoint(clientX, mouseY, true);
    if (regionId !== null) {
      if (this.hoveredRegionId !== regionId) {
        this.hoveredRegionId = regionId;
        this.requestUpdate();
      }
      return;
    }
    if (this.hoveredRegionId !== null) {
      this.hoveredRegionId = null;
      this.requestUpdate();
    }
  };

  private handleColorDrop = (e: Event) => {
    const customEvent = e as CustomEvent;
    const { x: clientX, y: mouseY, color } = customEvent.detail;

    if (this.hoveredRegionId !== null) {
      this.hoveredRegionId = null;
      this.requestUpdate();
    }

    const colorHex = typeof color === "string" ? color : color?.hexCode || "";
    const regionId = this.getRegionIdAtPoint(clientX, mouseY, true, colorHex);
    if (regionId !== null) {
      if (colorHex) {
        this.fillRegion(regionId, colorHex);
      }
    }
  };

  private handleSvgPointerDown = (e: PointerEvent) => {
    if (!isWindowFocusedSignal.get()) return;
    if (this.isPinching || this.pinchActiveInGesture) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;

    const isBrushMode = isBrushModeSignal.get();

    if (isBrushMode) {
      e.preventDefault();
      this.isBrushPainting = true;
      this.hasPaintedInCurrentStroke = false;

      const pathEl = e.currentTarget as SVGPathElement;
      const regionIdStr = pathEl.getAttribute("data-region-id");
      if (!regionIdStr) return;
      let regionId = parseInt(regionIdStr, 10);

      const resolvedRegionId = this.getRegionIdAtPoint(
        e.clientX,
        e.clientY,
        false
      );
      if (resolvedRegionId !== null) {
        regionId = resolvedRegionId;
      }

      const currentArtwork = currentArtworkSignal.get();
      if (!currentArtwork) return;

      let activeColor = activeHighlightColorSignal.get();
      if (!activeColor) {
        const defaultColor = currentArtwork.colorStats[0]?.color;
        if (defaultColor) {
          activeHighlightColorSignal.set(defaultColor);
          activeColor = defaultColor;
        }
      }
      if (!activeColor) return;

      this.brushTargetRegionId = regionId;

      // Push state to undo stack before adding the new stroke
      pushUndoState(
        currentArtwork.paintedRegionsState,
        currentArtwork.colorStats,
        currentArtwork.brushStrokePaths
      );

      this.brushStrokePaths = deepCopy(currentArtwork.brushStrokePaths ?? {});

      // Start initial brush stroke path inside the starting region
      const svgEl = this.querySelector<SVGSVGElement>("svg");
      if (svgEl) {
        const rect = svgEl.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * currentArtwork.width;
        const y =
          ((e.clientY - rect.top) / rect.height) * currentArtwork.height;

        this.currentStrokeRegionId = regionId;
        const strokeWidth = Math.round(
          Math.max(1, BASE_BRUSH_RADIUS / this.scale)
        );

        if (activeColor.hexCode === "#00000000") {
          if (this.brushStrokePaths[regionId]) {
            this.brushStrokePaths[regionId] = eraseFromStrokesList(
              this.brushStrokePaths[regionId],
              [{ x, y }],
              strokeWidth / 2
            );
          }
          this.activeStrokeIdx = -1;
        } else {
          const startStrokePoint = {
            points: [{ x, y }],
            stroke: activeColor.hexCode,
            strokeWidth,
          };

          if (!this.brushStrokePaths[regionId]) {
            this.brushStrokePaths[regionId] = [];
          }
          this.activeStrokeIdx = this.brushStrokePaths[regionId].length;
          this.brushStrokePaths[regionId].push(startStrokePoint);
        }
      }

      this.requestUpdate();
    }
  };

  private handleBrushPointerMove = (e: PointerEvent) => {
    if (!this.isBrushPainting) return;
    if (this.isPinching || this.pinchActiveInGesture) {
      this.isBrushPainting = false;
      this.activeStrokeIdx = -1;
      return;
    }
    this.brushPositionBuffer.push({ x: e.clientX, y: e.clientY });

    const svgEl = this.querySelector<SVGSVGElement>("svg");
    const currentArtwork = currentArtworkSignal.get();
    if (!svgEl || !currentArtwork) return;

    const rect = svgEl.getBoundingClientRect();
    // clear the buffer now that the element has been found to place the stroke path
    const strokePoints = this.brushPositionBuffer.splice(0).map((pos) => ({
      x: ((pos.x - rect.left) / rect.width) * currentArtwork.width,
      y: ((pos.y - rect.top) / rect.height) * currentArtwork.height,
    }));

    // Find the region under the pointer using getRegionIdAtPoint
    const currentBrushRegionId = this.getRegionIdAtPoint(
      e.clientX,
      e.clientY,
      false
    );

    if (currentBrushRegionId !== null) {
      const isSameExpectedColor =
        currentArtwork.regionExpectedColors?.[currentBrushRegionId] ===
        currentArtwork.regionExpectedColors?.[this.brushTargetRegionId!];
      if (isSameExpectedColor) {
        if (currentBrushRegionId !== this.brushTargetRegionId) {
          // Reset active stroke index when moving to a different region with the same expected color
          this.activeStrokeIdx = -1;
        }

        if (this.activeStrokeIdx >= 0) {
          // Still inside same region, append point to active stroke
          this.brushStrokePaths[currentBrushRegionId][
            this.activeStrokeIdx
          ].points.push(...strokePoints);
        } else {
          // Start a new active stroke in the entered region
          this.brushTargetRegionId = currentBrushRegionId;
          let activeColor =
            activeHighlightColorSignal.get() ||
            currentArtwork.colorStats[0]?.color;
          const strokeWidth = Math.max(1, BASE_BRUSH_RADIUS / this.scale);
          if (activeColor) {
            // If the active color is transparent, do not create a new stroke
            if (activeColor.hexCode === "#00000000") {
              // instead remove from any strokes in the region
              if (this.brushStrokePaths[currentBrushRegionId]) {
                this.brushStrokePaths[currentBrushRegionId] =
                  eraseFromStrokesList(
                    this.brushStrokePaths[currentBrushRegionId],
                    strokePoints,
                    strokeWidth / 2
                  );
              }
            } else {
              const startNewStrokePoint = {
                points: strokePoints,
                stroke: activeColor.hexCode,
                strokeWidth,
              };
              if (!this.brushStrokePaths[currentBrushRegionId]) {
                this.brushStrokePaths[currentBrushRegionId] = [];
              }
              this.activeStrokeIdx =
                this.brushStrokePaths[currentBrushRegionId].length;
              this.brushStrokePaths[currentBrushRegionId].push(
                startNewStrokePoint
              );
            }
          }
        }
      } else {
        // Not over a colorable region, terminate active stroke
        this.activeStrokeIdx = -1;
      }
    } else {
      // Out of bounds or not over any region path, terminate active stroke
      this.activeStrokeIdx = -1;
    }

    this.requestUpdate();
  };

  private handleSvgPointerUp = (e: PointerEvent) => {
    if (!isWindowFocusedSignal.get()) return;
    if (this.hasDragged || this.isPinching || this.pinchActiveInGesture) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (draggedColorSignal.get()) return;

    const isBrushMode = isBrushModeSignal.get();
    if (isBrushMode) return; // Handled in down/move

    const pathEl = e.currentTarget as SVGPathElement;
    const regionIdStr = pathEl.getAttribute("data-region-id");
    if (!regionIdStr) return;
    let regionId = parseInt(regionIdStr, 10);

    const resolvedRegionId = this.getRegionIdAtPoint(
      e.clientX,
      e.clientY,
      false
    );
    if (resolvedRegionId !== null) {
      regionId = resolvedRegionId;
    }

    const currentArtwork = currentArtworkSignal.get();
    if (!currentArtwork) return;

    let activeColor = activeHighlightColorSignal.get();
    if (!activeColor) {
      const defaultColor = currentArtwork.colorStats[0]?.color;
      if (defaultColor) {
        activeHighlightColorSignal.set(defaultColor);
        activeColor = defaultColor;
      }
    }
    if (!activeColor) return;

    this.fillRegion(regionId, activeColor.hexCode);
  };

  private handleGlobalPointerUp = () => {
    this.isDragging = false;
    this.isBrushPainting = false;
    this.brushTargetRegionId = null;
    this.activeStrokeIdx = -1;
    this.currentStrokeRegionId = null;

    const currentArtwork = currentArtworkSignal.get();
    if (currentArtwork) {
      saveCurrentArtworkProgress(
        currentArtwork.paintedRegionsState,
        this.brushStrokePaths
      );
    }

    this.updateTransformStyle();

    this.requestUpdate();
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
      window.removeEventListener("pointerup", this.handleGlobalPointerUp);
      window.removeEventListener("pointercancel", this.handleGlobalPointerUp);
      window.addEventListener("pointermove", this.handlePointerMove);
      window.addEventListener("pointerup", this.handleGlobalPointerUp);
      window.addEventListener("pointercancel", this.handleGlobalPointerUp);
    }
  }

  private updateTransformStyle() {
    const el = this.querySelector("#easel-transform-element") as HTMLElement;
    if (el) {
      el.style.transform = `translate3d(${this.panX}px, ${this.panY}px, 0px) scale(${this.scale})`;
      const isAnimating = Date.now() < this.zoomAnimationEndTime;
      el.style.transition =
        !isAnimating && (this.isDragging || this.isPinching)
          ? "none"
          : "transform 0.15s cubic-bezier(0.2, 0, 0, 1)";
    }
  }

  private setScaleAtPoint(
    newScale: number,
    clientX?: number,
    clientY?: number
  ) {
    newScale = Math.min(8.0, Math.max(0.5, newScale));
    if (newScale === this.scale) return;

    if (
      clientX === undefined ||
      clientY === undefined ||
      !this.containerElement
    ) {
      if (newScale === 1) {
        this.scale = 1;
        this.panX = 0;
        this.panY = 0;
      } else {
        this.scale = newScale;
        this.panX = this.clampPanX(this.panX, newScale);
        this.panY = this.clampPanY(this.panY, newScale);
      }
    } else {
      const rect = this.containerElement.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const x = clientX - centerX;
      const y = clientY - centerY;

      const ratio = newScale / this.scale;

      const newPanX = x - (x - this.panX) * ratio;
      const newPanY = y - (y - this.panY) * ratio;

      if (newScale === 1) {
        this.scale = 1;
        this.panX = 0;
        this.panY = 0;
      } else {
        this.scale = newScale;
        this.panX = this.clampPanX(newPanX, newScale);
        this.panY = this.clampPanY(newPanY, newScale);
      }
    }

    zoomScaleSignal.set(this.scale);
    this.updateTransformStyle();
  }

  private setScale(s: number) {
    this.setScaleAtPoint(s);
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
      this.zoomAnimationEndTime = Date.now() + 200;
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
    this.zoomAnimationEndTime = Date.now() + 200;
    this.setScale(this.scale * 1.4);
  };

  private zoomOut = () => {
    this.zoomAnimationEndTime = Date.now() + 200;
    this.setScale(this.scale / 1.4);
  };

  private handleTouchStart = (e: TouchEvent) => {
    if (e.touches.length >= 2) {
      e.preventDefault();
      this.isPinching = true;
      this.pinchActiveInGesture = true;
      this.hasDragged = true;

      // Abort active brush stroke if pinching/zooming
      if (this.isBrushPainting) {
        this.isBrushPainting = false;
        const currentArtwork = currentArtworkSignal.get();
        if (currentArtwork) {
          this.brushStrokePaths = deepCopy(currentArtwork.brushStrokePaths ?? {});
        }
        this.activeStrokeIdx = -1;
      }

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
      if (isBrushModeSignal.get()) {
        this.isPinching = false;
        this.isDragging = false;
        return;
      }
      this.isPinching = false;
      if (!this.pinchActiveInGesture) {
        this.hasDragged = false;
      }
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
        this.zoomAnimationEndTime = Date.now() + 200;
        if (this.scale > 1.2) {
          this.setScaleAtPoint(1, e.touches[0].clientX, e.touches[0].clientY);
        } else {
          this.setScaleAtPoint(2.5, e.touches[0].clientX, e.touches[0].clientY);
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

      let newPanX = this.startPanX;
      let newPanY = this.startPanY;

      if (this.containerElement) {
        const rect = this.containerElement.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const startX = this.startTouchX - centerX;
        const startY = this.startTouchY - centerY;
        const endX = midX - centerX;
        const endY = midY - centerY;

        const scaleRatio = targetScale / this.initialScale;
        newPanX = endX - (startX - this.startPanX) * scaleRatio;
        newPanY = endY - (startY - this.startPanY) * scaleRatio;
      }

      this.scale = targetScale;
      this.panX = this.clampPanX(newPanX, targetScale);
      this.panY = this.clampPanY(newPanY, targetScale);
      zoomScaleSignal.set(this.scale);
      this.updateTransformStyle();
    } else if (e.touches.length === 1) {
      if (isBrushModeSignal.get()) {
        return;
      }
      const dx = e.touches[0].clientX - this.pointerDownX;
      const dy = e.touches[0].clientY - this.pointerDownY;
      if (Math.hypot(dx, dy) > 10) {
        this.hasDragged = true;
      }
      e.preventDefault();
      this.panX = this.clampPanX(this.startPanX + dx, this.scale);
      this.panY = this.clampPanY(this.startPanY + dy, this.scale);
      this.updateTransformStyle();
    }
  };

  private handleTouchEnd = (e: TouchEvent) => {
    if (e.touches.length < 2) {
      this.isPinching = false;
      this.initialPinchDist = 0;
      zoomScaleSignal.set(this.scale);
      this.updateTransformStyle();
    }
    if (e.touches.length === 0) {
      this.pinchActiveInGesture = false;
    }
  };

  private handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.15 : 0.85;
    this.setScaleAtPoint(this.scale * delta, e.clientX, e.clientY);
  };

  private handlePointerDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (this.isPinching || this.pinchActiveInGesture) return;
    if (isBrushModeSignal.get()) {
      this.isDragging = false;
      return;
    }

    const now = Date.now();
    if (e.pointerType === "mouse") {
      if (now - this.lastTapTime < 300) {
        this.hasDragged = true;
        this.zoomAnimationEndTime = Date.now() + 200;
        if (this.scale > 1.2) {
          this.setScaleAtPoint(1, e.clientX, e.clientY);
        } else {
          this.setScaleAtPoint(2.5, e.clientX, e.clientY);
        }
        this.lastTapTime = 0;
        this.isDragging = false;
        return;
      } else {
        this.lastTapTime = now;
      }
    }

    this.pointerDownX = e.clientX;
    this.pointerDownY = e.clientY;
    if (!this.isPinching && !this.pinchActiveInGesture) {
      this.hasDragged = false;
    }
    this.isDragging = true;
    this.startTouchX = e.clientX;
    this.startTouchY = e.clientY;
    this.startPanX = this.panX;
    this.startPanY = this.panY;
    this.updateTransformStyle();
  };

  private handlePointerMove = (e: PointerEvent) => {
    if (isBrushModeSignal.get()) {
      if (this.isDragging) {
        this.isDragging = false;
        this.hasDragged = false;
      }
      this.handleBrushPointerMove(e);
      return;
    }
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
    const dx = e.clientX - this.startTouchX;
    const dy = e.clientY - this.startTouchY;
    this.panX = this.clampPanX(this.startPanX + dx, this.scale);
    this.panY = this.clampPanY(this.startPanY + dy, this.scale);
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

  private redrawArtboard = () => {
    const currentArtwork = currentArtworkSignal.get();
    if (currentArtwork) {
      // refresh the local strokes buffer from the saved artwork
      this.brushStrokePaths = deepCopy(currentArtwork.brushStrokePaths ?? {});
      this.requestUpdate();
    }
  };

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("color-drag-move", this.handleColorDragMove);
    window.removeEventListener("color-drop", this.handleColorDrop);
    window.removeEventListener("pointerup", this.handleGlobalPointerUp);
    window.removeEventListener("pointercancel", this.handleGlobalPointerUp);
    window.removeEventListener("easel-zoom-set", this.handleZoomSet);
    window.removeEventListener("easel-pan-delta", this.handlePanDelta);
    window.removeEventListener("easel-zoom-in", this.zoomIn);
    window.removeEventListener("easel-zoom-out", this.zoomOut);
  }

  render() {
    const currentArtwork = currentArtworkSignal.get();
    const currentArtworkId = currentArtwork?.id || null;
    activeHighlightColorSignal.get();
    draggedColorSignal.get();
    zoomScaleSignal.get();
    const isProcessing = isProcessingSignal.get();
    const processingSrc = processingImageSrcSignal.get();
    const processingWidth = processingImageWidthSignal.get();
    const processingHeight = processingImageHeightSignal.get();
    const isDragOver = isDragOverSignal.get();
    const dailyChallengeImage = getDailyChallenge();

    if (currentArtworkId !== this.lastArtworkId) {
      this.lastArtworkId = currentArtworkId;
      this.scale = 1;
      this.panX = 0;
      this.panY = 0;
      zoomScaleSignal.set(1);
      setTimeout(() => this.updateTransformStyle(), 0);
      // first time this artwork is loaded
      isBrushModeSignal.set(false);
      window.dispatchEvent(new CustomEvent("easel-redraw-artboard"));
    }

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
      userSelect: "none" as const,
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

    const draggedColorHex = draggedColorSignal.get();
    const activeColor = activeHighlightColorSignal.get();
    const targetHex = draggedColorHex || activeColor?.hexCode;

    return html`
      <div style=${this.renderStyleObject(outerContainerStyle)}>
        <input
          id="easel-file-input"
          type="file"
          accept="image/*"
          style="display: none;"
          @change=${this.handleFileChange}
        />

        <div
          id="easel-zoom-container"
          style="position: relative; width: 100%; touch-action: none; user-select: none; -webkit-user-select: none;"
        >
          <div
            id="easel-transform-element"
            style="width: 100%; display: flex; flex-direction: column; align-items: center; transform: translate3d(${this
              .panX}px, ${this.panY}px, 0px) scale(${this
              .scale}); transform-origin: center center; transition: ${this
              .isDragging || this.isPinching
              ? "none"
              : "transform 0.15s cubic-bezier(0.2, 0, 0, 1)"}; will-change: transform;"
          >
            <div style=${this.renderStyleObject(easelTopClampStyle)}></div>
            <div style=${this.renderStyleObject(mainFrameStyle)}>
              <div
                style="display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; padding: 0.5rem; background-size: 0.5rem 0.5rem; background-image: ${transparentImgCss}; min-height: 40vh; overflow: hidden;"
              >
                ${currentArtwork || isProcessing
                  ? html`
                      <div
                        id="original-image" style="width: 100%; aspect-ratio: ${processingWidth} / ${processingHeight}; display: flex; flex-direction: column; justify-content: center; align-items: center; position: ${isProcessing ? 'relative' : 'absolute'}; animation: blur-pulse 2s infinite ease-in-out; transition: opacity 1s ease-out; opacity: ${isProcessing ?  1 : 0}; z-index: 1000; pointer-events: none;"
                      >
                        <div
                          style="position: relative; width: 100%; height: 100%; border-radius: 4px; overflow: hidden; display: flex; align-items: center; justify-content: center; background-color: transparent;"
                        >
                          <img
                            src="${processingSrc || currentArtwork.originalDataUrl}"
                            style="width: 100%; height: 100%; object-fit: cover;"
                          />
                        </div>
                      </div>
                    `
                  : ""}
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
                        <div
                          style="width: 5rem; height: 5rem; border-radius: 24px; background-color: #FFD166; border: 3px solid #000000; display: flex; align-items: center; justify-content: center; box-shadow: 4px 4px 0px 0px #000000; margin-bottom: 1rem; color: #000000;"
                        >
                          ${iconUpload(40, "#000000")}
                        </div>
                        <h3
                          style="font-size: 1.5rem; font-weight: 900; font-style: italic; color: #3D2314; margin: 0 0 0.5rem 0; letter-spacing: -0.02em;"
                        >
                          Upload Your Image
                        </h3>
                        <p
                          style="font-size: 0.875rem; font-weight: 700; color: rgba(74, 40, 16, 0.8); margin: 0; line-height: 1.5;"
                        >
                          Tap to select or drag & drop any photo.
                        </p>
                        <div
                          style="margin-top: 2rem; padding-top: 2rem; border-top: 2px solid rgba(0, 0, 0, 0.15); width: 100%;"
                        >
                          <div
                            style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2rem; width: 100%;"
                          >
                            ${artworksSignal.get().length > 0
                              ? html`
                                  <button
                                    @click=${(e: Event) => {
                                      e.stopPropagation();
                                      const sorted = [
                                        ...artworksSignal.get(),
                                      ].sort(
                                        (a, b) =>
                                          (b.modifiedAt || 0) -
                                          (a.modifiedAt || 0)
                                      );
                                      if (sorted.length > 0) {
                                        handleSelectArtwork(sorted[0]);
                                      }
                                    }}
                                    style="background-color: #2A9D8F; color: #FFFFFF; border: 2.5px solid #000000; padding: 0.625rem 1.25rem; border-radius: 16px; font-weight: 900; font-size: 1rem; display: flex; align-items: center; gap: 0.5rem; box-shadow: 2px 2px 0px 0px #000000; cursor: pointer; text-transform: uppercase;"
                                  >
                                    ${iconImage(24, "#FFFFFF")} Resume Painting
                                  </button>
                                `
                              : ""}
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
                              ${iconPaintBucket(20, "#000000")} Or Try the Daily
                              Challenge
                            </button>
                          </div>
                        </div>
                      </div>
                      <footer
                        style=${this.renderStyleObject(footerStyleSignal.get())}
                      >
                        <p style="margin: 0;">
                          PAINT by COLOURS
                          <a
                            href="https://github.com/sponsors/iamogbz"
                            target="_blank"
                            style="color: inherit; text-decoration: inherit; cursor: pointer;"
                            >❤️ QBRKTS</a
                          >
                          ©️ ${new Date().getFullYear()}
                        </p>
                      </footer>
                    `
                  : ""}
                ${currentArtwork && !isProcessing
                  ? html`
                      <div
                        style="width: 100%; display: flex; flex-direction: column; align-items: center; transition: opacity 1s ease-in-out; opacity: ${isProcessing ? 0 : 1};"
                      >
                        <div
                          style="position: relative; width: 100%; aspect-ratio: ${currentArtwork.width} / ${currentArtwork.height}; border-radius: 4px; overflow: hidden; display: flex; align-items: center; justify-content: center; background-color: transparent;"
                        >
                          ${currentArtwork.svgPaths
                            ? html`
                                <!-- Lower SVG for color fills -->
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="100%"
                                  height="100%"
                                  viewBox="0 0 ${currentArtwork.width} ${currentArtwork.height}"
                                  style="position: relative; touch-action: none; display: block; max-height: none; max-width: none; overflow: visible; cursor: crosshair;"
                                >
                                  <defs>
                                    ${currentArtwork.svgPaths.map(
                                      (path) => svg`
                              <clipPath id="mask-${path.id}">
                                <path d="${path.d}" />
                              </clipPath>
                            `
                                    )}
                                  </defs>

                                  ${currentArtwork.svgPaths.map((path) => {
                                    const isPainted =
                                      currentArtwork.paintedRegionsState?.[
                                        path.id
                                      ];
                                    const expected =
                                      currentArtwork.regionExpectedColors?.[
                                        path.id
                                      ];
                                    const fill =
                                      isPainted ||
                                      (expected === "#00000000"
                                        ? "none"
                                        : "#FFFFFF");

                                    return svg`
                              <path
                                data-region-id="${path.id}"
                                d="${path.d}"
                                fill="${fill}"
                                stroke="none"
                                stroke-width="0"
                                stroke-linejoin="round"
                                pointer-events="all"
                                @pointerdown=${this.handleSvgPointerDown}
                                @pointerup=${this.handleSvgPointerUp}
                                @pointerenter=${(e: PointerEvent) => {
                                  this.hoveredRegionId = path.id;
                                  this.requestUpdate();
                                }}
                                @pointerleave=${() => {
                                  if (this.hoveredRegionId === path.id) {
                                    this.hoveredRegionId = null;
                                    this.requestUpdate();
                                  }
                                }}
                              />
                            `;
                                  })}
                                  ${currentArtwork.svgPaths.map((path) => {
                                    const strokes =
                                      this.brushStrokePaths?.[path.id] || [];
                                    return svg`
                              <g clip-path="url(#mask-${
                                path.id
                              })" id="brush-paths-${path.id}">
                                ${strokes.map((stroke) => {
                                  if (stroke.points.length === 0) return svg``;
                                  const dStr = stroke.points
                                    .map(
                                      (p, idx) =>
                                        `${idx === 0 ? "M" : "L"} ${p.x.toFixed(
                                          1
                                        )} ${p.y.toFixed(1)}`
                                    )
                                    .join(" ");
                                  return svg`
                                    <path
                                      d="${dStr}"
                                      fill="none"
                                      stroke="${stroke.stroke}"
                                      stroke-width="${stroke.strokeWidth}"
                                      stroke-linecap="round"
                                      stroke-linejoin="round"
                                      pointer-events="none"
                                    />
                                  `;
                                })}
                              </g>
                            `;
                                  })}
                                </svg>

                                <!-- Upper SVG for outline guides -->
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="100%"
                                  height="100%"
                                  viewBox="0 0 ${currentArtwork.width} ${currentArtwork.height}"
                                  style="position: absolute; top: 0; left: 0; pointer-events: none; overflow: visible;"
                                >
                                  ${currentArtwork.svgPaths.map((path) => {
                                    const isPainted =
                                      currentArtwork.paintedRegionsState?.[
                                        path.id
                                      ];
                                    const expected =
                                      currentArtwork.regionExpectedColors?.[
                                        path.id
                                      ];

                                    let stroke = "none";
                                    let strokeWidth = "0";
                                    let mixBlendMode = "normal";

                                    const baseStrokeWidth = Math.max(
                                      1,
                                      currentArtwork.width / 400 / this.scale
                                    );

                                    const targetHexUpper =
                                      normalizeHex(targetHex);
                                    const expectedUpper =
                                      normalizeHex(expected);
                                    const isPaintedUpper =
                                      normalizeHex(isPainted);

                                    const isTarget =
                                      !!targetHexUpper &&
                                      expectedUpper === targetHexUpper;
                                    const isPaintedCorrect =
                                      !!isPainted &&
                                      isPaintedUpper === expectedUpper;
                                    const isPaintedWrong =
                                      !!isPainted &&
                                      isPaintedUpper !== expectedUpper;
                                    const isHovered =
                                      path.id === this.hoveredRegionId;
                                    strokeWidth = (
                                      baseStrokeWidth *
                                      (isPaintedWrong ? 1.2 : 1.0)
                                    ).toString();

                                    if (isHovered) {
                                      const isTransparentPaintFill =
                                        targetHexUpper.substring(7) === "00";
                                      stroke = isTransparentPaintFill
                                        ? "#FFFFFF"
                                        : targetHex || "#000000";
                                      mixBlendMode = isTransparentPaintFill
                                        ? "difference"
                                        : "normal";
                                    } else {
                                      if (isTarget) {
                                        if (isPaintedCorrect) {
                                          stroke = "none";
                                          strokeWidth = "0";
                                          mixBlendMode = "normal";
                                        } else {
                                          stroke = "#FFFFFF";
                                          strokeWidth = strokeWidth;
                                          mixBlendMode = "difference";
                                        }
                                      }
                                    }

                                    return svg`
                              <path
                                d="${path.d}"
                                fill="none"
                                stroke="${stroke}"
                                stroke-width="${strokeWidth}"
                                stroke-linejoin="round"
                                pointer-events="none"
                                style="mix-blend-mode: ${mixBlendMode};"
                              />
                            `;
                                  })}
                                </svg>
                              `
                            : html`
                                <img
                                  src=${currentArtwork?.cartoonDataUrl || ""}
                                  style="width:100%;height:100%;object-fit:contain;opacity:0.5;filter:grayscale(1)"
                                />
                                <p
                                  style="position:absolute;color:black;font-weight:bold;background:white;padding:4px 8px;border-radius:4px"
                                >
                                  Legacy image format not supported by SVG
                                  engine.
                                </p>
                              `}
                        </div>
                      </div>
                    `
                  : ""}
              </div>
            </div>

            <div
              style="width: 100%; max-width: 28rem; display: flex; justify-content: space-between; padding: 0 2rem; margin-top: -0.5rem;"
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
