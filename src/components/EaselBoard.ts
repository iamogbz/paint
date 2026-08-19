import { html, svg } from "lit";
import { customElement } from "lit/decorators.js";
import { SignalElement } from "../utils/SignalElement";
import { currentArtworkSignal, isProcessingSignal, processingImageSrcSignal, processingImageWidthSignal, processingImageHeightSignal, activeHighlightColorSignal, dragToOpenFileSignal, zoomScaleSignal, handleImageSelected, handleSelectArtwork, draggedColorPositionSignal, pushUndoState, saveCurrentArtworkProgress, footerStyleSignal, isBrushModeSignal, artworksSignal, artworkIdsSortedSignal, panDragActiveSignal, undoStackSignal } from "../state/store";
import { getDailyChallenge } from "../data/dailyChallenge";
import { soundEffects } from "../utils/soundEffects";
import { iconImage, iconUpload, iconPaintBucket } from "./icons";
import { BASE_BRUSH_RADIUS, FALLBACK_IMAGE_SIZE_PX, FILLABLE_SVG_ELEMENTS, TRANSPARENT_HEX, transparentImgCss, MIN_ZOOM, MAX_ZOOM } from "../utils/constants";
import { normalizeHex } from "../utils/color";
import { BrushStrokePaths } from "../types";
import { clamp, zoom } from "../utils/ui";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import { updateArtworkSvgWithUserPaints } from "../utils/imageProcessor";

function erasePointsFromStrokePath(points: Array<{ x: number; y: number }>, cx: number, cy: number, r: number): Array<Array<{ x: number; y: number }>> {
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
        if (currentSubPath.length === 0 || currentSubPath[currentSubPath.length - 1] !== p1) {
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
      const splitPaths = erasePointsFromStrokePath(stroke.points, ep.x, ep.y, eraserRadius);
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
  private containerElement: HTMLElement | null = null;
  // TODO: what is this even needed for?
  private animationFrame: number = null;

  // Interactive Canvas State
  private artworkId: string = null;
  private hoveredRegionId: string | null = null;
  private wheelSpinningTimeoutId = null;
  private zoomScale = 1.0;
  private isPointerDown = false;
  private touchStartX = null;
  private touchStartY = null;
  private isDragCanvasAction = false;
  private dragDeltaX = 0;
  private dragDeltaY = 0;
  private panX = 0;
  private panY = 0;

  // Pinch Zoom State
  private activePointers: Map<number, PointerEvent> = new Map();
  private initialPinchDistance: number | null = null;
  private initialZoomScale: number = 1.0;
  private isPinchAction = false;
  private cachedSvgRect: DOMRect | null = null;

  // Brush Painting State
  private isBrushPainting = false;
  private brushTargetRegionId: string | null = null;
  private activeStrokeIdx = -1;
  // faster buffering of painted paths without waiting for save logic
  private brushPositionBuffer = [] as BrushStrokePaths[number][number]["points"];

  public triggerFilePicker = () => {
    if (this.isDragCanvasAction) return;
    const input = document.getElementById("easel-file-input") as HTMLInputElement;
    if (input) {
      input.value = "";
      input.click();
    }
  };

  private setupPointerListeners() {
    const container = this.querySelector<HTMLElement>("#easel-zoom-container");
    if (container && container !== this.containerElement) {
      if (this.containerElement) {
        this.containerElement.removeEventListener("wheel", this.handleWheel);
        this.containerElement.removeEventListener("pointerdown", this.handlePointerDown);
        this.containerElement.removeEventListener("pointermove", this.handlePointerMove);
        this.containerElement.removeEventListener("pointerup", this.handlePointerUp);
        this.containerElement.removeEventListener("pointerleave", this.handlePointerLeave);
      }
      this.containerElement = container;
      this.containerElement.addEventListener("wheel", this.handleWheel, { passive: false });
      this.containerElement.addEventListener("pointerdown", this.handlePointerDown);
      this.containerElement.addEventListener("pointermove", this.handlePointerMove);
      this.containerElement.addEventListener("pointerup", this.handlePointerUp);
      this.containerElement.addEventListener("pointerleave", this.handlePointerLeave);
    }
  }

  private updateTransformDirectly = () => {
    const transformEl = this.querySelector<HTMLElement>("#easel-transform-element");
    if (transformEl) {
      transformEl.style.transform = this.getTransformCssProperty();
      transformEl.style.transition = this.getTransitionCssProperty();
    }
    const container = this.querySelector<HTMLElement>("#main-frame-container");
    if (container) {
      container.style.pointerEvents = (this.isDragCanvasAction || this.isPinchAction) ? "none" : "auto";
    }
  };

  private handleWheel = (e: WheelEvent) => {
    window.clearTimeout(this.wheelSpinningTimeoutId);
    e.preventDefault();

    const newZoomScale = zoom(this.zoomScale, e.deltaY > 0);

    if (newZoomScale !== this.zoomScale) {
      const rect = this.containerElement?.getBoundingClientRect();
      if (rect) {
        const hw = rect.width / 2;
        const hh = rect.height / 2;
        const mx = e.clientX - rect.left - hw;
        const my = e.clientY - rect.top - hh;

        const scaleRatio = newZoomScale / this.zoomScale;

        this.panX = mx - (mx - this.panX) * scaleRatio;
        this.panY = my - (my - this.panY) * scaleRatio;

        this.panX = this.clampPanX(this.panX, newZoomScale);
        this.panY = this.clampPanY(this.panY, newZoomScale);
      }
      this.zoomScale = newZoomScale;
      this.cachedSvgRect = null; // invalidate rect

      this.wheelSpinningTimeoutId = window.setTimeout(() => {
        this.wheelSpinningTimeoutId = null;
        zoomScaleSignal.set(this.zoomScale);
        this.updateTransformDirectly();
      }, 150);
    }

    if (this.animationFrame) {
      return;
    }
    this.animationFrame = window.requestAnimationFrame(() => {
      this.animationFrame = null;
      this.updateTransformDirectly();
      // Only set signal to keep values in sync, no redraw
      zoomScaleSignal.set(this.zoomScale);
    });
  };

  private handlePointerDown = (e: PointerEvent) => {
    this.activePointers.set(e.pointerId, e);

    if (this.activePointers.size === 1) {
      // only mark pointer down if the user was not attempting to drag from the control bar
      this.isPointerDown = panDragActiveSignal.get() === false && draggedColorPositionSignal.get() === null;
      this.dragDeltaX = 0;
      this.dragDeltaY = 0;
      this.isDragCanvasAction = false;
      this.isPinchAction = false;
      this.touchStartX = e.clientX;
      this.touchStartY = e.clientY;
      this.isBrushPainting = isBrushModeSignal.get() && (e.pointerType === "mouse" || e.button === 0);
      this.cachedSvgRect = this.querySelector<SVGSVGElement>("#fill-layer>svg")?.getBoundingClientRect() || null;
      
      // Update hover region immediately on tap for quick fill actions before any move event fires
      if (this.artworkId) {
        this.updateHoverRegion(e);
      }

      window.addEventListener("pointercancel", this.handlePointerUp);
    } else if (this.activePointers.size === 2) {
      this.isPinchAction = true;
      this.isDragCanvasAction = true;
      this.isBrushPainting = false;

      const pointers = Array.from(this.activePointers.values());
      this.initialPinchDistance = Math.hypot(pointers[0].clientX - pointers[1].clientX, pointers[0].clientY - pointers[1].clientY);
      this.initialZoomScale = this.zoomScale;

      this.containerElement?.setPointerCapture(e.pointerId);
    }
  };

  private handlePointerMove = (e: PointerEvent) => {
    // if there is no current artwork then nothing to do
    if (!this.artworkId) return;

    if (this.activePointers.has(e.pointerId)) {
      this.activePointers.set(e.pointerId, e);
    }

    if (this.isPinchAction && this.activePointers.size === 2) {
      e.preventDefault();
      const pointers = Array.from(this.activePointers.values());
      const currentDistance = Math.hypot(pointers[0].clientX - pointers[1].clientX, pointers[0].clientY - pointers[1].clientY);

      if (this.initialPinchDistance) {
        // Pinch zoom
        const scaleFactor = currentDistance / this.initialPinchDistance;
        const newZoom = zoom((this.initialZoomScale * scaleFactor) / 0.95, true);

        if (newZoom !== this.zoomScale) {
          this.zoomScale = newZoom;
          this.cachedSvgRect = null; // invalidate

          window.clearTimeout(this.wheelSpinningTimeoutId);
          this.wheelSpinningTimeoutId = window.setTimeout(() => {
            this.wheelSpinningTimeoutId = null;
            zoomScaleSignal.set(this.zoomScale);
            this.updateTransformDirectly();
          }, 150);
        }

        // Update drag delta based on first pointer movement since pinch started
        this.dragDeltaX = pointers[0].clientX - this.touchStartX;
        this.dragDeltaY = pointers[0].clientY - this.touchStartY;

        if (!this.animationFrame) {
          this.animationFrame = window.requestAnimationFrame(() => {
            this.animationFrame = null;
            this.updateTransformDirectly();
            zoomScaleSignal.set(this.zoomScale);
          });
        }
      }
    } else if (this.isPointerDown && !this.isPinchAction) {
      const dx = e.clientX - this.touchStartX;
      const dy = e.clientY - this.touchStartY;
      const distance = Math.hypot(dx, dy);
      const dragDistanceThresholdPx = 4;

      const isBrushMode = isBrushModeSignal.get();
      if (isBrushMode) {
        e.preventDefault();
        this.handleBrushPointerMove(e);
      } else if (!this.isDragCanvasAction && distance > dragDistanceThresholdPx) {
        this.containerElement?.setPointerCapture(e.pointerId);
        this.isDragCanvasAction = true;
        this.updateTransformDirectly();
      }

      if (this.isDragCanvasAction) {
        this.dragDeltaX = dx;
        this.dragDeltaY = dy;
        if (!this.animationFrame) {
          this.animationFrame = window.requestAnimationFrame(() => {
            this.animationFrame = null;
            this.updateTransformDirectly();
          });
        }
      }
    } else if (this.artworkId) {
      if (e.pointerType === "mouse" || draggedColorPositionSignal.get() !== null) {
        this.updateHoverRegion(e);
      } else if (this.hoveredRegionId !== null) {
        this.hoveredRegionId = null;
        this.redrawArtboard();
      }
    }
  };

  private handlePointerUp = (e: PointerEvent) => {
    this.activePointers.delete(e.pointerId);

    if (this.activePointers.size === 1 && this.isPinchAction) {
      const remainingPointer = Array.from(this.activePointers.values())[0];
      this.touchStartX = remainingPointer.clientX - this.dragDeltaX;
      this.touchStartY = remainingPointer.clientY - this.dragDeltaY;
      this.isPinchAction = false;
      this.updateTransformDirectly();
      return;
    }

    if (this.activePointers.size === 0) {
      if (this.isPointerDown) {
        if (this.isDragCanvasAction) {
          this.panX = this.clampPanX(this.panX + this.dragDeltaX, this.zoomScale);
          this.panY = this.clampPanY(this.panY + this.dragDeltaY, this.zoomScale);
          this.hoveredRegionId = null; // Reset hover after pan to drag
        } else {
          // was not drag action when the touch ended
        }
      }

      // down action did not necessarily start in this component
      if (this.hoveredRegionId && !this.isDragCanvasAction && !this.isPinchAction) {
        const activeColor = activeHighlightColorSignal.get();
        if (activeColor) {
          const dragDropColorPosition = draggedColorPositionSignal.get();
          if (activeColor && (this.isPointerDown || dragDropColorPosition)) this.fillRegion(this.hoveredRegionId, activeColor);
        } else {
          // helpfully select the color of the clicked region
          // but do nothing else incase the user forgot to tap on a color
          const currentArtwork = currentArtworkSignal.get();
          activeHighlightColorSignal.set(currentArtwork.regionsCurrentFillInfo.get(this.hoveredRegionId) || TRANSPARENT_HEX);
        }
      } else if (this.isBrushPainting && this.brushTargetRegionId) {
        // These should be disparate actions since the user can not drag the canvas in brush mode
        // if the user was just done painting with brush strokes then save the art
        const currentArtwork = currentArtworkSignal.get();
        saveCurrentArtworkProgress(currentArtwork);
      }

      this.isPointerDown = false;
      this.touchStartX = null;
      this.touchStartY = null;
      this.isDragCanvasAction = false;
      this.isPinchAction = false;
      this.dragDeltaX = 0;
      this.dragDeltaY = 0;
      this.isBrushPainting = false;
      this.brushTargetRegionId = null;
      this.activeStrokeIdx = -1;
      this.brushPositionBuffer = [];
      this.containerElement?.releasePointerCapture(e.pointerId);
      window.removeEventListener("pointercancel", this.handlePointerUp);
      
      // on mobile/touch screens, there is no persistent hover after the pointer is lifted
      if (e.pointerType !== "mouse") {
        this.hoveredRegionId = null;
      }
      
      this.updateTransformDirectly();
      this.redrawArtboard(); // trigger redraw at end of drag
    }
  };

  private handlePointerLeave = (e: PointerEvent) => {
    if (e.pointerType === "mouse" || draggedColorPositionSignal.get() !== null) {
      this.updateHoverRegion(e);
    } else if (this.hoveredRegionId !== null) {
      this.hoveredRegionId = null;
      this.redrawArtboard();
    }
  };

  private handlePanDelta = (e) => {
    if (!panDragActiveSignal.get()) return;
    this.dragDeltaX = 0;
    this.dragDeltaY = 0;
    this.panX += e?.detail.dx ?? 0;
    this.panY += e?.detail.dy ?? 0;
    if (this.animationFrame) return;
    this.animationFrame = window.requestAnimationFrame(() => {
      this.animationFrame = null;
      this.updateTransformDirectly();
    });
  };

  private handleBrushPointerMove = (e: PointerEvent) => {
    if (!this.isBrushPainting) return;

    // TODO: decide if when there is no active color default to transparent
    // NOTE: using transparent triggers the erase brush strokes action
    const activeColor = activeHighlightColorSignal.get();
    if (!activeColor) return;

    this.brushPositionBuffer.push({ x: e.clientX, y: e.clientY });

    const currentArtwork = currentArtworkSignal.get();
    if (!currentArtwork) return;

    if (!this.cachedSvgRect) {
      this.cachedSvgRect = this.querySelector<SVGSVGElement>("#fill-layer>svg")?.getBoundingClientRect() || null;
    }
    const rect = this.cachedSvgRect;
    if (!rect) return;

    // clear the buffer now that the element has been found to place the stroke path
    const strokePoints = this.brushPositionBuffer.splice(0).map((pos) => ({
      x: ((pos.x - rect.left) / rect.width) * currentArtwork.width,
      y: ((pos.y - rect.top) / rect.height) * currentArtwork.height,
    }));

    // Find the region under the pointer using getRegionIdAtPoint
    const currentBrushRegionId = this.getRegionIdAtPoint(e.clientX, e.clientY);
    const currentBrushRegionExpectedColor = currentArtwork.regionsDrawingInfo.get(currentBrushRegionId)?.fillColor;
    const currentBrushRegionCurrentColor = currentArtwork.regionsCurrentFillInfo.get(currentBrushRegionId);

    const activeColorIsSameAsRegionCurrentColor = currentBrushRegionCurrentColor === activeColor;
    const targetRegionIsAlreadyInDirtyState = currentArtwork.brushStrokePaths?.[currentBrushRegionId]?.length > 0;

    if (currentBrushRegionId !== null && (!activeColorIsSameAsRegionCurrentColor || targetRegionIsAlreadyInDirtyState)) {
      // If there was no active brush target region reset it to where the user was hovering over
      if (!this.brushTargetRegionId) {
        this.brushTargetRegionId = currentBrushRegionId;
        this.hoveredRegionId = null;
        console.log({ activeColorIsSameAsRegionCurrentColor, targetRegionIsAlreadyInDirtyState });
        pushUndoState(currentArtwork);
      }
      const regionsShareTheSameExpectedColor = currentBrushRegionExpectedColor === currentArtwork.regionsDrawingInfo.get(this.brushTargetRegionId!)?.fillColor;
      if (regionsShareTheSameExpectedColor) {
        if (currentBrushRegionId !== this.brushTargetRegionId) {
          // Reset active stroke index when moving to a different region with the same expected color
          this.activeStrokeIdx = -1;
        }

        // do not bother starting a new stroke if there are no points for it
        if (strokePoints.length > 0) {
          if (this.activeStrokeIdx >= 0) {
            // Still inside same region, append point to active stroke
            currentArtwork.brushStrokePaths[currentBrushRegionId][this.activeStrokeIdx].points.push(...strokePoints);
          } else {
            // Start a new active stroke in the entered region
            this.brushTargetRegionId = currentBrushRegionId;
            const imageScaleFactor = Math.max(currentArtwork.width, currentArtwork.height) / FALLBACK_IMAGE_SIZE_PX;
            const strokeWidth = Math.max(1, (BASE_BRUSH_RADIUS * imageScaleFactor) / this.zoomScale);
            if (activeColor) {
              // If the active color is transparent, do not create a new stroke
              if (activeColor === TRANSPARENT_HEX) {
                // instead remove from any strokes in the region
                if (currentArtwork.brushStrokePaths[currentBrushRegionId]) {
                  currentArtwork.brushStrokePaths[currentBrushRegionId] = eraseFromStrokesList(currentArtwork.brushStrokePaths[currentBrushRegionId], strokePoints, strokeWidth / 2);
                }
              } else {
                const startNewStrokePoint = {
                  points: strokePoints,
                  stroke: activeColor,
                  strokeWidth,
                };
                if (!currentArtwork.brushStrokePaths[currentBrushRegionId]) {
                  currentArtwork.brushStrokePaths[currentBrushRegionId] = [];
                }
                this.activeStrokeIdx = currentArtwork.brushStrokePaths[currentBrushRegionId].length;
                currentArtwork.brushStrokePaths[currentBrushRegionId].push(startNewStrokePoint);
              }
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

  private handleFileInput = (file: File) => {
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          handleImageSelected(event.target.result as string, file.name.replace(/\.[^/.]+$/, ""));
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

  private handleFileDrop = (e: DragEvent) => {
    e.preventDefault();
    dragToOpenFileSignal.set(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) this.handleFileInput(file);
  };

  private fillRegion(regionId: string, colorHex: string) {
    const currentArtwork = currentArtworkSignal.get();
    if (!currentArtwork) return;

    // Bucket fills from single taps cannot happen in brush mode,
    // but dragging and dropping a color from the palette should ALWAYS apply a fill.
    const isBrushMode = isBrushModeSignal.get();
    const isDragDrop = draggedColorPositionSignal.get() !== null;
    if (isBrushMode && !isDragDrop) return;

    const currentColor = currentArtwork.regionsCurrentFillInfo.get(regionId);
    const expected = currentArtwork.regionsDrawingInfo.get(regionId).fillColor;
    // TODO: decide if original artwork transparent regions can be painted in
    if (!expected || expected === TRANSPARENT_HEX) return;

    const regionHasBrushStrokes = currentArtwork.brushStrokePaths[regionId]?.length > 0;
    // no color change, no brushes to replace
    if (currentColor === colorHex && !regionHasBrushStrokes) return;
    pushUndoState(currentArtwork);

    // Unconditionally remove all brush strokes clipped by this region when a fill is applied
    if (currentArtwork.brushStrokePaths) delete currentArtwork.brushStrokePaths[regionId];
    // remove region from previously filled in record for that color
    const regionPreviousColor = currentArtwork.regionsCurrentFillInfo.get(regionId);
    if (currentArtwork.colorsFilledInRegions.has(regionPreviousColor)) {
      currentArtwork.colorsFilledInRegions.get(regionPreviousColor).delete(regionId);
    }
    // overwrite region color
    currentArtwork.regionsCurrentFillInfo.set(regionId, colorHex);
    // add region to filled records for this color
    if (!currentArtwork.colorsFilledInRegions.has(colorHex)) {
      currentArtwork.colorsFilledInRegions.set(colorHex, new Set());
    }
    currentArtwork.colorsFilledInRegions.get(colorHex).add(regionId);

    saveCurrentArtworkProgress(currentArtwork);

    if (colorHex === expected) {
      soundEffects.playPop();
    } else {
      soundEffects.playBrushSwoosh();
    }
  }

  private getRegionIdAtPoint(px: number, py: number): string | null {
    const currentArtwork = currentArtworkSignal.get();
    if (!currentArtwork) return null;

    const selectedColorHex = activeHighlightColorSignal.get();

    const getRegionAt = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y);
      if (el && FILLABLE_SVG_ELEMENTS.has(el.tagName.toLowerCase() as any)) {
        return el.getAttribute("data-region-id");
      }
      return null;
    };

    const regionIdA = getRegionAt(px, py);

    if (regionIdA !== null && selectedColorHex) {
      const { fillColor: regionAExpectedColor, neighbourRegionIds: neighbors } = currentArtwork.regionsDrawingInfo.get(regionIdA);
      if (regionAExpectedColor !== selectedColorHex && neighbors) {
        let closestRegion: string | null = null;
        let minDistance = Infinity;

        // Use cached svg rect or compute once
        if (!this.cachedSvgRect) {
            this.cachedSvgRect = this.querySelector<SVGSVGElement>("#fill-layer>svg")?.getBoundingClientRect() || null;
        }
        const rect = this.cachedSvgRect;
        
        if (rect) {
            const svgX = ((px - rect.left) / rect.width) * currentArtwork.width;
            const svgY = ((py - rect.top) / rect.height) * currentArtwork.height;

            // Expand the bounding box check by an 8px physical screen distance to make hitting thin/small elements easier
            const toleranceX = 8 * (currentArtwork.width / rect.width);
            const toleranceY = 8 * (currentArtwork.height / rect.height);
            let minArea = Infinity;

            for (const nId of neighbors) {
              const nInfo = currentArtwork.regionsDrawingInfo.get(nId);
              if (nInfo && nInfo.fillColor === selectedColorHex && nInfo.boundingBox) {
                  const bb = nInfo.boundingBox;
                  // Strictly check if the tapped point falls within the neighbor's mathematical bounding box (+ tolerance)
                  if (svgX >= bb.x - toleranceX && svgX <= bb.x + bb.width + toleranceX && svgY >= bb.y - toleranceY && svgY <= bb.y + bb.height + toleranceY) {
                    const cx = bb.x + bb.width / 2;
                    const cy = bb.y + bb.height / 2;
                    const dist = Math.hypot(cx - svgX, cy - svgY);
                    const area = bb.width * bb.height;
                    
                    // We strongly prefer the smaller shape to make it easier to hit fine details
                    // Only fallback to distance if areas are functionally identical
                    const isSignificantlySmallerArea = area < minArea * 0.8;
                    const isSimilarAreaButCloser = Math.abs(area - minArea) / minArea <= 0.2 && dist < minDistance;

                    if (isSignificantlySmallerArea || isSimilarAreaButCloser) {
                        minArea = area;
                        minDistance = dist;
                        closestRegion = nId;
                    }
                  }
              }
            }
        }
        
        if (closestRegion !== null) {
          return closestRegion;
        }
      }
    }

    return regionIdA;
  }

  private updateHoverRegion = (e: Pick<PointerEvent, "clientX" | "clientY">) => {
    const dragDropColorPosition = draggedColorPositionSignal.get();
    const regionId = this.getRegionIdAtPoint(dragDropColorPosition?.targetX ?? e.clientX, dragDropColorPosition?.targetY ?? e.clientY);
    if (regionId !== null) {
      if (this.hoveredRegionId !== regionId) {
        this.hoveredRegionId = regionId;
        this.redrawArtboard();
      }
      return;
    }
    if (this.hoveredRegionId !== null) {
      this.hoveredRegionId = null;
      this.redrawArtboard();
    }
  };

  private redrawArtboard = () => {
    this.requestUpdate();
    // publish updates;
    zoomScaleSignal.set(this.zoomScale);
  };

  get screenMaxSize() {
    return Math.max(window.innerHeight, window.innerWidth);
  }

  get screenMinSize() {
    return Math.min(window.innerHeight, window.innerWidth);
  }

  private clampPanX(x: number, s: number): number {
    const w = this.containerElement?.clientWidth || 350;
    const maxPan = (w * s) / 2;
    return clamp(x, -maxPan, maxPan);
  }

  private clampPanY(y: number, s: number): number {
    const h = this.containerElement?.clientHeight || 350;
    // half the scaled easel size cause panning is calculated from the middle
    const basePan = (h * s) / 2;
    // give some extra room at the bottom depending on screen size
    const maxPanUp = basePan + this.screenMinSize * 0.3;
    // stop it from going to far down, limit adjustment by half screen size
    const maxPanDown = Math.max(0, basePan - this.screenMinSize * 0.3);
    return clamp(y, -maxPanUp, maxPanDown);
  }

  private getTransformCssProperty = () => {
    return `translate(${this.panX + this.dragDeltaX}px, ${this.panY + this.dragDeltaY}px) scale(${this.zoomScale})`;
  };

  private getTransitionCssProperty = () => {
    if (this.isPointerDown || this.wheelSpinningTimeoutId !== null) {
      return "none";
    }
    return "transform 0.15s cubic-bezier(0.2, 0.5, 0.3, 0.8)";
  };

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("easel-pan-delta", this.handlePanDelta);
    window.removeEventListener("pointerdown", this.handleGlobalPointerDown);
  }

  private handleGlobalPointerDown = (e: PointerEvent) => {
    if (!this.containerElement) return;
    
    // Check if the tap happened outside the canvas container
    const isOutsideCanvas = !e.composedPath().includes(this.containerElement);
    if (isOutsideCanvas && this.hoveredRegionId !== null) {
      this.hoveredRegionId = null;
      this.redrawArtboard();
    }
  };

  firstUpdated() {
    this.setupPointerListeners();
    window.addEventListener("easel-pan-delta", this.handlePanDelta);
    window.addEventListener("pointerdown", this.handleGlobalPointerDown);

    (window as any).regionsByColors = () => {
      const currentArtwork = currentArtworkSignal.get();
      if (!currentArtwork) return {};
      return Object.fromEntries(currentArtwork.colorsAssignedToRegions.entries().map((a) => [a[0], Array.from(a[1])]));
    };

    (window as any).setRegionHighlight = (regionId: string, colorHex?: string) => {
      this.hoveredRegionId = regionId;
      if (colorHex) {
        activeHighlightColorSignal.set(colorHex);
      }
      this.redrawArtboard();
    };

    (window as any).setRegionFill = (regionId: string, colorHex: string) => {
      this.fillRegion(regionId, colorHex);
    };
  }

  updated() {
    this.setupPointerListeners();

    const fillLayer = document.getElementById("fill-layer");
    const guideLayer = document.getElementById("guide-layer");
    const activeColor = activeHighlightColorSignal.get();
    const currentArtwork = currentArtworkSignal.get();

    // update the artwork to show the current paint interaction state
    if (!currentArtwork || !fillLayer) return;
    updateArtworkSvgWithUserPaints(fillLayer.querySelector("svg"), currentArtwork);
    // update the guide layer with current user interaction
    currentArtwork?.regionsDrawingInfo.values().forEach((region) => {
      const expectedColorHex = region.fillColor;

      let stroke = "none";
      let strokeWidth = 0;
      let mixBlendMode = "normal";

      const baseStrokeWidth = Math.max(1, currentArtwork.width / 400 / this.zoomScale);

      const targetHexUpper = normalizeHex(activeColor);
      const expectedHexUpper = normalizeHex(expectedColorHex);
      const currentHexUpper = fillLayer.querySelector(`[data-region-id="${region.id}"]`).getAttribute("fill").toUpperCase();

      const activeBrushTargetColor = this.brushTargetRegionId ? normalizeHex(currentArtwork.regionsDrawingInfo.get(this.brushTargetRegionId)?.fillColor) : null;
      const isTarget = (!!targetHexUpper && expectedHexUpper === targetHexUpper) || (!!activeBrushTargetColor && expectedHexUpper === activeBrushTargetColor);
      const isPaintedCorrect = !!currentHexUpper && currentHexUpper === expectedHexUpper;
      const isPaintedWrong = !!currentHexUpper && currentHexUpper !== expectedHexUpper;
      const isHovered = region.id === this.hoveredRegionId || region.id === this.brushTargetRegionId;
      strokeWidth = baseStrokeWidth * (isPaintedWrong ? 1.2 : 1.0);

      if (isHovered) {
        const isTransparentPaintFill = targetHexUpper.substring(7) === "00";
        stroke = isTransparentPaintFill ? "#FFFFFF" : activeColor || "#000000";
        mixBlendMode = isTransparentPaintFill ? "difference" : "normal";
      } else {
        if (isTarget) {
          if (isPaintedCorrect) {
            stroke = "none";
            strokeWidth = 0;
            mixBlendMode = "normal";
          } else {
            // TODO: fix issue where sometimes blend mode difference does not work
            stroke = "#000000";
            // use is painted wrong stroke width
            mixBlendMode = "normal";
          }
        } else if (!this.hoveredRegionId && !targetHexUpper) {
          stroke = "#00000088";
          strokeWidth = baseStrokeWidth;
          mixBlendMode = "normal";
        }
      }

      const guideElem = guideLayer.querySelector(`[data-region-id=${region.id}]`) as SVGElement;
      guideElem.setAttribute("fill", "none");
      guideElem.setAttribute("stroke", stroke);
      guideElem.setAttribute("stroke-width", strokeWidth.toString());
      guideElem.style.mixBlendMode = mixBlendMode;
    });
  }

  render() {
    const currentArtwork = currentArtworkSignal.get();
    this.artworkId = currentArtwork?.id;
    const isProcessing = isProcessingSignal.get();
    const processingSrc = processingImageSrcSignal.get();
    const processingWidth = processingImageWidthSignal.get();
    const processingHeight = processingImageHeightSignal.get();
    const isDragOver = dragToOpenFileSignal.get();
    const dailyChallengeImage = getDailyChallenge();
    this.zoomScale = zoomScaleSignal.get();

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
        <input id="easel-file-input" type="file" accept="image/*" style="display: none;" @change=${this.handleFileChange} />

        <div id="easel-zoom-container" style="position: relative; width: 100%; touch-action: none; user-select: none; -webkit-user-select: none;">
          <div id="easel-transform-element" style="width: 100%; display: flex; flex-direction: column; align-items: center; transform: ${this.getTransformCssProperty()}; transform-origin: center center; transition: ${this.getTransitionCssProperty()}">
            <div style=${this.renderStyleObject(easelTopClampStyle)}></div>
            <div style=${this.renderStyleObject(mainFrameStyle)}>
              <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; padding: 0.5rem; background-size: 0.5rem 0.5rem; background-image: ${transparentImgCss}; min-height: 40vh; overflow: hidden;">
                ${currentArtwork || isProcessing
                  ? html`
                      <div id="original-image" style="width: 100%; aspect-ratio: ${processingWidth} / ${processingHeight}; display: flex; flex-direction: column; justify-content: center; align-items: center; position: ${isProcessing ? "relative" : "absolute"}; animation: blur-pulse 2s infinite ease-in-out; transition: opacity 1s ease-out; opacity: ${isProcessing ? 1 : 0}; z-index: 1000; pointer-events: none;">
                        <div style="position: relative; width: 100%; height: 100%; border-radius: 4px; overflow: hidden; display: flex; align-items: center; justify-content: center; background-color: transparent;">
                          <img src="${processingSrc || currentArtwork.originalDataUrl}" style="width: 100%; height: 100%; object-fit: cover;" />
                        </div>
                      </div>
                    `
                  : ""}
                ${!currentArtwork && !isProcessing
                  ? html`
                      <div
                        @dragover=${(e: DragEvent) => {
                          e.preventDefault();
                          dragToOpenFileSignal.set(true);
                        }}
                        @dragleave=${() => dragToOpenFileSignal.set(false)}
                        @drop=${this.handleFileDrop}
                        @click=${this.triggerFilePicker}
                        style=${this.renderStyleObject(dropAreaStyle)}
                      >
                        <div style="width: 5rem; height: 5rem; border-radius: 24px; background-color: #FFD166; border: 3px solid #000000; display: flex; align-items: center; justify-content: center; box-shadow: 4px 4px 0px 0px #000000; margin-bottom: 1rem; color: #000000;">${iconUpload(40, "#000000")}</div>
                        <h3 style="font-size: 1.5rem; font-weight: 900; font-style: italic; color: #3D2314; margin: 0 0 0.5rem 0; letter-spacing: -0.02em;">Upload Your Image</h3>
                        <p style="font-size: 0.875rem; font-weight: 700; color: rgba(74, 40, 16, 0.8); margin: 0; line-height: 1.5;">Tap to select or drag & drop any photo.</p>
                        <div style="margin-top: 2rem; padding-top: 2rem; border-top: 2px solid rgba(0, 0, 0, 0.15); width: 100%;">
                          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1.5rem; width: 100%;">
                            ${artworkIdsSortedSignal.get().length > 0
                              ? html`
                                  <button
                                    @click=${(e: Event) => {
                                      e.stopPropagation();
                                      const sorted = artworkIdsSortedSignal.get();
                                      const artworks = artworksSignal.get();
                                      if (sorted.length > 0 && artworks.has(sorted[0])) {
                                        handleSelectArtwork(artworks.get(sorted[0]));
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
                                handleImageSelected(dailyChallengeImage.dataUrl, dailyChallengeImage.name);
                              }}
                              style="background-color: #FFFFFF; color: #000000; border: 2.5px solid #000000; padding: 0.625rem 0.875rem; border-radius: 16px; font-weight: 900; font-size: 0.875rem; display: flex; align-items: center; gap: 0.375rem; box-shadow: 2px 2px 0px 0px #000000; cursor: pointer;"
                            >
                              ${iconPaintBucket(20, "#000000")} Or Try the Daily Challenge
                            </button>
                          </div>
                        </div>
                      </div>
                      <footer style=${this.renderStyleObject(footerStyleSignal.get())}>
                        <p style="margin: 0;">
                          PAINT by COLOURS
                          <a href="https://github.com/sponsors/iamogbz" target="_blank" style="color: inherit; text-decoration: inherit; cursor: pointer;">❤️ QBRKTS</a>
                          ©️ ${new Date().getFullYear()}
                        </p>
                      </footer>
                    `
                  : ""}
                ${currentArtwork && !isProcessing
                  ? html`
                      <div style="cursor: crosshair; width: 100%; display: flex; flex-direction: column; align-items: center; transition: opacity 1s ease-in-out; opacity: ${isProcessing ? 0 : 1};">
                        <div style="position: relative; width: 100%; aspect-ratio: ${currentArtwork.width} / ${currentArtwork.height}; border-radius: 4px; overflow: hidden; display: flex; align-items: center; justify-content: center; background-color: transparent;">
                          ${currentArtwork.regionsDrawingInfo
                            ? html`
                                <!-- Lower SVG for color fills -->
                                <div id="fill-layer" style="display: flex; width: 100%; height: 100%; align-items: center; justify-content: center;">${unsafeSVG(currentArtwork.cartoonSVG)}</div>

                                <!-- Upper SVG for outline guides -->
                                <div id="guide-layer" style="display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; position: absolute; top: 0; left: 0; pointer-events: none; touch-action: none; overflow: visible;">${unsafeSVG(currentArtwork.cartoonSVG)}</div>
                              `
                            : html`
                                <img src=${currentArtwork?.cartoonDataUrl || ""} style="width:100%;height:100%;object-fit:contain;opacity:0.5;filter:grayscale(1)" />
                                <p style="position:absolute;color:black;font-weight:bold;background:white;padding:4px 8px;border-radius:4px">Legacy image format not supported by SVG engine.</p>
                              `}
                        </div>
                      </div>
                    `
                  : ""}
              </div>
            </div>

            <div style="width: 100%; max-width: 28rem; display: flex; justify-content: space-between; padding: 0 2rem; margin-top: -0.5rem;">
              <div style="width: 1.5rem; height: 4rem; background-color: #845442; border: 2px solid #845442; border-bottom-left-radius: 0.5rem; border-bottom-right-radius: 0.5rem; transform: rotate(12deg); box-shadow: 0 4px 6px rgba(0,0,0,0.1);"></div>
              <div style="width: 1.5rem; height: 5rem; background-color: #845442; border: 2px solid #845442; border-bottom-left-radius: 0.5rem; border-bottom-right-radius: 0.5rem; box-shadow: 0 4px 6px rgba(0,0,0,0.1);"></div>
              <div style="width: 1.5rem; height: 4rem; background-color: #845442; border: 2px solid #845442; border-bottom-left-radius: 0.5rem; border-bottom-right-radius: 0.5rem; transform: rotate(-12deg); box-shadow: 0 4px 6px rgba(0,0,0,0.1);"></div>
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
