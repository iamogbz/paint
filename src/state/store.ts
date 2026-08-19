import { signal, computed } from "@lit-labs/signals";
import { get, set } from "idb-keyval";
import { ProcessedArtwork, UndoHistoryItem } from "../types";
import { processImageToCartoonPalette } from "../utils/imageProcessor";
import { soundEffects } from "../utils/soundEffects";
import confetti from "canvas-confetti";
import { copyMapSet, deepCopy } from "../utils/object";
import { TRANSPARENT_HEX } from "../utils/constants";
import { normalizeHex } from "../utils/color";

const STORAGE_KEY_ALL_ARTWORKS = "paint_part_sd_artworks_v1";

// Core State Signals using Lit Signals
export const artworkIdsSortedSignal = signal<string[]>([]);
export const artworksSignal = signal<Map<string, ProcessedArtwork>>(new Map());
export const currentArtworkSignal = signal<ProcessedArtwork | null>(null);
export const isProcessingSignal = signal<boolean>(false);
export const processingImageSrcSignal = signal<string | null>(null);
export const processingImageWidthSignal = signal<number>(0);
export const processingImageHeightSignal = signal<number>(0);
export const soundEnabledSignal = signal<boolean>(true);
export const dragToOpenFileSignal = signal<boolean>(false);
export const isGalleryOpenSignal = signal<boolean>(false);
export const undoStackSignal = signal<UndoHistoryItem[]>([]);
export const zoomScaleSignal = signal<number>(1.0);
export const canvasPositionDeltaSignal = signal<{ x: number; y: number }>({ x: 0, y: 0 });
export const isBrushModeSignal = signal<boolean>(false);
export const isWindowFocusedSignal = signal<boolean>(true);

// Color selection and dropping
export const activeHighlightColorSignal = signal<string | null>(null);
export const draggedColorPositionSignal = signal<{ targetX: number; targetY: number } | null>(null);
export const isColorPickerOpenSignal = signal<boolean>(false);
export const copiedHexSignal = signal<string | null>(null);

// Drag move button pan navigation
export const panDragActiveSignal = signal(false);

// Dynamic Style Signals
export const appBackgroundStyleSignal = computed(() => ({
  background: `radial-gradient(circle at 50% 50%, ${"#FFE5D9"} 0%, ${"#FFFFFF"} 20%)`,
  minHeight: "100vh",
  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
  position: "relative" as const,
  overflowX: "hidden" as const,
  overflowY: "visible",
}));

export const footerStyleSignal = computed(() => ({
  marginTop: "2rem",
  textAlign: "center" as const,
  fontSize: "0.75rem",
  fontWeight: "800",
  color: "#4A2810",
}));

// Storage Helpers
export async function loadSavedArtworks() {
  try {
    // Migrate from localStorage if it exists to avoid data loss
    const localSaved = localStorage.getItem(STORAGE_KEY_ALL_ARTWORKS);
    if (localSaved) {
      const parsed: ProcessedArtwork[] = JSON.parse(localSaved);
      await set(STORAGE_KEY_ALL_ARTWORKS, parsed);
      localStorage.removeItem(STORAGE_KEY_ALL_ARTWORKS);
    }

    const parsed = await get<Map<string, ProcessedArtwork>>(STORAGE_KEY_ALL_ARTWORKS);
    if (parsed && parsed.size > 0) {
      const sorted = Array.from(parsed.keys()).sort((a, b) => (parsed.get(b).modifiedAt || 0) - (parsed.get(a).modifiedAt || 0));
      artworkIdsSortedSignal.set(sorted);
      artworksSignal.set(parsed);
    }
  } catch (e) {
    console.warn("Could not restore saved artworks from idb", e);
  }
}

/**
 * This triggers a rerender because the art ids return a new reference for sorting
 * But only for components listening to the `artworkIdsSortedSignal`
 */
export function saveArtworks(data: Map<string, ProcessedArtwork>) {
  artworksSignal.set(data);
  const existingArtIdsSorted = Array.from(data.keys()).sort((a, b) => data.get(b).modifiedAt - data.get(a).modifiedAt);
  artworkIdsSortedSignal.set(existingArtIdsSorted);

  set(STORAGE_KEY_ALL_ARTWORKS, data).catch((e) => {
    console.warn("Could not save to idb", e);
  });
}

export function handleSelectArtwork(selectedArtwork?: ProcessedArtwork) {
  const currentArtwork = currentArtworkSignal.get();
  if (currentArtwork?.id === selectedArtwork?.id) {
    return;
  }

  undoStackSignal.set([]);
  isBrushModeSignal.set(false);
  zoomScaleSignal.set(1.0);
  canvasPositionDeltaSignal.set({ x: 0, y: 0 });
  activeHighlightColorSignal.set(null);

  saveCurrentArtworkProgress(selectedArtwork);
}

export async function handleImageSelected(imageSrc: string, name: string = "Untitled") {
  // Set processing source first dimensions are loaded in the first step of image processing
  processingImageSrcSignal.set(imageSrc);

  isProcessingSignal.set(true);
  try {
    const artworkName = name.substring(0, 32);
    const newArtwork = await processImageToCartoonPalette(imageSrc, artworkName);

    handleSelectArtwork(newArtwork);

    confetti({
      particleCount: 50,
      spread: 70,
      origin: { y: 0.6 },
      colors: ["#E63946", "#FFD166", "#06D6A0", "#4EA8DE", "#B5179E"],
    });
  } catch (err) {
    console.error("Image processing failed:", err);
    alert("Failed to process image. Please try another photo.");
  } finally {
    isProcessingSignal.set(false);
    processingImageSrcSignal.set(null);
  }
}

export function handleRenameArtwork(id: string, newName: string) {
  const existingArtworks = artworksSignal.get();
  const targetArtwork = existingArtworks.get(id);
  if (!targetArtwork) return;
  targetArtwork.name = newName;
  targetArtwork.modifiedAt = Date.now();
  saveArtworks(existingArtworks);
}

export function handleDeleteArtwork(id: string) {
  const existingArtworks = artworksSignal.get();
  existingArtworks.delete(id);
  saveArtworks(existingArtworks);

  if (currentArtworkSignal.get()?.id === id) {
    handleSelectArtwork(null);
  }
}

export function handleToggleSound() {
  const next = !soundEnabledSignal.get();
  soundEnabledSignal.set(next);
  soundEffects.enabled = next;
}

export function saveCurrentArtworkProgress(currentArtwork: ProcessedArtwork) {
  if (currentArtwork) {
    currentArtwork.modifiedAt = Date.now();
    const existingArtworks = artworksSignal.get();
    existingArtworks.set(currentArtwork.id, currentArtwork);
    saveArtworks(existingArtworks);
  }
  // Even though references are used we want to trigger a render of other components
  // calling set with the exact same object reference does not trigger a rerender
  // This should be the only place we do this update references of mutable properties
  currentArtworkSignal.set(currentArtwork && { ...currentArtwork });
}

/**
 * Save only the diffable between states not the full artwork
 */
export function pushUndoState(currentArtwork: ProcessedArtwork) {
  undoStackSignal.set([
    ...undoStackSignal.get(),
    {
      /** For the swatch counts */
      colorsAssignedToRegions: copyMapSet(currentArtwork.colorsAssignedToRegions),
      /** For the swatch counts */
      colorsFilledInRegions: copyMapSet(currentArtwork.colorsFilledInRegions),
      /** For the painting state */
      regionsCurrentFillInfo: new Map(currentArtwork.regionsCurrentFillInfo),
      /** For the custom brush strokes */
      brushStrokePaths: deepCopy(currentArtwork.brushStrokePaths),
    } as const,
  ]);
}

export function handleDeleteSwatchColor(color: string) {
  const hexCode = normalizeHex(color);
  if (!hexCode || hexCode === TRANSPARENT_HEX) return;
  const current = currentArtworkSignal.get();
  if (!current) return;

  // Check if this is a core color (stat.count > 0 in original image)
  const isCoreColor = current.colorsAssignedToRegions.get(hexCode)?.size > 0;
  if (isCoreColor) {
    // Core color with regions in original artwork cannot be deleted
    return;
  }

  // Push current painted state and current colorStats to undo stack before modifying
  pushUndoState(current);

  // Unpaint any region that was painted with this color
  for (const regionId of current.colorsFilledInRegions.get(hexCode) ?? []) {
    current.regionsCurrentFillInfo.delete(regionId);
  }
  current.colorsAssignedToRegions.delete(hexCode);

  // If the active highlight color is this deleted color, deselect it
  if (normalizeHex(activeHighlightColorSignal.get()) === hexCode) {
    activeHighlightColorSignal.set(null);
  }

  current.modifiedAt = Date.now();
  saveCurrentArtworkProgress(current);

  soundEffects.playPop();
}

export function handleUndo() {
  const stack = undoStackSignal.get();
  if (stack.length === 0) return;
  const current = currentArtworkSignal.get();
  if (!current) return;

  const [previousState] = stack.slice(-1);
  // creating a new object to trigger the rerender pipeline
  undoStackSignal.set(stack.slice(0, -1));

  // the previous state was already a clone so we can use the references since its now the present
  Object.assign(current, previousState);
  saveCurrentArtworkProgress(current);
}
