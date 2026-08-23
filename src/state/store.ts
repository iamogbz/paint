import { signal, computed } from "@lit-labs/signals";
import { get, set, del } from "idb-keyval";
import { ProcessedArtwork, ArtworkSummary, UndoHistoryItem } from "../types";
import { processImageToCartoonPalette } from "../utils/imageProcessor";
import { soundEffects } from "../utils/soundEffects";
import confetti from "canvas-confetti";
import { copyMapSet, deepCopy } from "../utils/object";
import { TRANSPARENT_HEX, PAINTABLE_REGION_HEX, FALLBACK_IMAGE_SIZE_PX } from "../utils/constants";
import { normalizeHex } from "../utils/color";
import { exportArtworkSvgDataUrl } from "../utils/download";

const STORAGE_KEY_ARTWORKS_META = "paint_artworks_meta_v2";
const STORAGE_KEY_ALL_ARTWORKS_LEGACY = "paint_part_sd_artworks_v1";

function getArtworkStorageKey(id: string) {
  return `paint_artwork_v2_${id}`;
}

// Core State Signals using Lit Signals
export const artworkIdsSortedSignal = signal<string[]>([]);
export const artworkSummariesSignal = signal<Map<string, ArtworkSummary>>(new Map());
export const currentArtworkSignal = signal<ProcessedArtwork | null>(null);
export const isProcessingSignal = signal<boolean>(false);
export const processingImageSrcSignal = signal<string | null>(null);
export const processingImageWidthSignal = signal<number>(0);
export const processingImageHeightSignal = signal<number>(0);
export const soundEnabledSignal = signal<boolean>(true);
export const dragToOpenFileSignal = signal<boolean>(false);
export const isGalleryOpenSignal = signal<boolean>(false);
export const isDailyChallengeModalOpenSignal = signal<boolean>(false);
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
  marginTop: "1rem",
  textAlign: "center" as const,
  fontSize: "0.75rem",
  fontWeight: "800",
  color: "#4A2810",
}));

export function createArtworkSummary(art: ProcessedArtwork, existingThumbnail?: string): ArtworkSummary {
  const regionCount = art.regionsCurrentFillInfo?.size ?? art.regionsDrawingInfo?.size ?? 0;
  const usedColorsByCount = art.colorsAssignedToRegions
    ? Array.from(art.colorsAssignedToRegions.entries())
        .map(([hexCode, regionIds]) => [regionIds.size, hexCode] as const)
        .filter(([size, hexCode]) => hexCode !== TRANSPARENT_HEX && size !== 0)
    : [];
  const usedColorsSorted = usedColorsByCount.sort((a, b) => b[0] - a[0]);
  const colorCountToDisplay = 6;
  const stepSize = Math.max(1, Math.floor(usedColorsSorted.length / colorCountToDisplay));
  const colorsToDisplay = new Array(colorCountToDisplay)
    .fill(null)
    .map((_, i) => usedColorsSorted[i * stepSize]?.[1])
    .filter(Boolean) as string[];

  const thumbnailSvgDataUrl = existingThumbnail || exportArtworkSvgDataUrl(art);

  return {
    id: art.id,
    name: art.name,
    width: art.width,
    height: art.height,
    createdAt: art.createdAt,
    modifiedAt: art.modifiedAt,
    regionCount,
    usedColorsCount: usedColorsSorted.length,
    colorsToDisplay,
    thumbnailSvgDataUrl,
  };
}

// Storage Helpers
export async function loadSavedArtworks() {
  try {
    let metaData: any = await get(STORAGE_KEY_ARTWORKS_META);

    if (!metaData || (metaData instanceof Map ? metaData.size === 0 : Object.keys(metaData).length === 0)) {
      // Check legacy storage
      let legacyData: any = await get(STORAGE_KEY_ALL_ARTWORKS_LEGACY);
      const localSaved = localStorage.getItem(STORAGE_KEY_ALL_ARTWORKS_LEGACY);
      if (localSaved) {
        try {
          const parsed = JSON.parse(localSaved);
          if (!legacyData) legacyData = parsed;
        } catch (_) {}
        localStorage.removeItem(STORAGE_KEY_ALL_ARTWORKS_LEGACY);
      }

      if (legacyData) {
        const migratedArtworks = migrateAndValidateArtworks(legacyData);
        const summariesMap = new Map<string, ArtworkSummary>();
        for (const [id, artwork] of migratedArtworks.entries()) {
          await set(getArtworkStorageKey(id), artwork);
          summariesMap.set(id, createArtworkSummary(artwork));
        }
        metaData = summariesMap;
        await set(STORAGE_KEY_ARTWORKS_META, summariesMap);
        del(STORAGE_KEY_ALL_ARTWORKS_LEGACY).catch(() => {});
      }
    }

    const summariesMap = migrateAndValidateSummaries(metaData);
    if (summariesMap.size > 0) {
      const sorted = Array.from(summariesMap.keys()).sort((a, b) => (summariesMap.get(b)?.modifiedAt || 0) - (summariesMap.get(a)?.modifiedAt || 0));
      artworkIdsSortedSignal.set(sorted);
      artworkSummariesSignal.set(summariesMap);
    }
  } catch (e) {
    console.warn("Could not restore saved artworks metadata from idb", e);
  }
}

export async function loadArtworkById(id: string): Promise<ProcessedArtwork | null> {
  const current = currentArtworkSignal.get();
  if (current?.id === id) {
    return current;
  }

  try {
    const rawData = await get(getArtworkStorageKey(id));
    if (!rawData) return null;
    return hydrateArtwork(rawData);
  } catch (e) {
    console.warn(`Failed to load artwork ${id} from idb`, e);
    return null;
  }
}

function migrateAndValidateSummaries(rawData: any): Map<string, ArtworkSummary> {
  const result = new Map<string, ArtworkSummary>();
  if (!rawData) return result;

  let items: any[] = [];
  if (rawData instanceof Map) {
    items = Array.from(rawData.values());
  } else if (Array.isArray(rawData)) {
    items = rawData;
  } else if (typeof rawData === "object") {
    items = Object.values(rawData);
  }

  for (const item of items) {
    if (!item || typeof item !== "object" || !item.id) continue;
    result.set(item.id, {
      id: item.id,
      name: item.name || "Untitled",
      width: item.width || FALLBACK_IMAGE_SIZE_PX,
      height: item.height || FALLBACK_IMAGE_SIZE_PX,
      createdAt: item.createdAt || Date.now(),
      modifiedAt: item.modifiedAt || Date.now(),
      regionCount: item.regionCount || 0,
      usedColorsCount: item.usedColorsCount || 0,
      colorsToDisplay: Array.isArray(item.colorsToDisplay) ? item.colorsToDisplay : [],
      thumbnailSvgDataUrl: item.thumbnailSvgDataUrl || "",
    });
  }

  return result;
}

function hydrateArtwork(item: any): ProcessedArtwork {
  return {
    id: item.id,
    name: item.name || "Untitled",
    originalDataUrl: item.originalDataUrl || "",
    cartoonDataUrl: item.cartoonDataUrl || "",
    cartoonSVG: item.cartoonSVG || "",
    width: item.width || FALLBACK_IMAGE_SIZE_PX,
    height: item.height || FALLBACK_IMAGE_SIZE_PX,
    createdAt: item.createdAt || Date.now(),
    modifiedAt: item.modifiedAt || Date.now(),
    colorsAssignedToRegions: migrateMapOfSets(item.colorsAssignedToRegions),
    colorsFilledInRegions: migrateMapOfSets(item.colorsFilledInRegions),
    regionsCurrentFillInfo: migrateMapOfStrings(item.regionsCurrentFillInfo),
    regionsDrawingInfo: migrateRegionsDrawingInfo(item.regionsDrawingInfo),
    brushStrokePaths: item.brushStrokePaths && typeof item.brushStrokePaths === "object" ? item.brushStrokePaths : {},
  };
}

function migrateAndValidateArtworks(rawData: any): Map<string, ProcessedArtwork> {
  const result = new Map<string, ProcessedArtwork>();
  if (!rawData) return result;

  let items: any[] = [];
  if (rawData instanceof Map) {
    items = Array.from(rawData.values());
  } else if (Array.isArray(rawData)) {
    items = rawData;
  } else if (typeof rawData === "object") {
    items = Object.values(rawData);
  }

  for (const item of items) {
    try {
      if (!item || typeof item !== "object" || !item.id) {
        continue;
      }
      result.set(item.id, hydrateArtwork(item));
    } catch (err) {
      console.warn(`Failed to migrate artwork ${item?.id}`, err);
    }
  }

  return result;
}

function migrateMapOfSets(data: any): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  if (!data || typeof data !== "object") return map;

  const entries = data instanceof Map ? data.entries() : Object.entries(data);
  for (const [key, value] of entries) {
    if (value instanceof Set) {
      map.set(key, value);
    } else if (Array.isArray(value)) {
      map.set(key, new Set(value));
    } else {
      map.set(key, new Set());
    }
  }
  return map;
}

function migrateMapOfStrings(data: any): Map<string, string> {
  const map = new Map<string, string>();
  if (!data || typeof data !== "object") return map;

  const entries = data instanceof Map ? data.entries() : Object.entries(data);
  for (const [key, value] of entries) {
    map.set(key, String(value));
  }
  return map;
}

function migrateRegionsDrawingInfo(data: any): Map<string, any> {
  const map = new Map<string, any>();
  if (!data || typeof data !== "object") return map;

  const entries = data instanceof Map ? data.entries() : Object.entries(data);
  for (const [key, value] of entries) {
    if (value && typeof value === "object") {
      map.set(key, {
        ...value,
        neighbourRegionIds: value.neighbourRegionIds instanceof Set ? value.neighbourRegionIds : new Set(Array.isArray(value.neighbourRegionIds) ? value.neighbourRegionIds : []),
      });
    }
  }
  return map;
}

export function handleSelectArtwork(selectedArtwork?: ProcessedArtwork | null) {
  const currentArtwork = currentArtworkSignal.get();
  if (currentArtwork?.id === selectedArtwork?.id && currentArtwork !== null) {
    return;
  }

  // Flush any pending save for the previous artwork before switching
  flushPendingArtworkSave();

  undoStackSignal.set([]);
  isBrushModeSignal.set(false);
  zoomScaleSignal.set(1.0);
  canvasPositionDeltaSignal.set({ x: 0, y: 0 });
  activeHighlightColorSignal.set(null);

  if (selectedArtwork) {
    saveCurrentArtworkProgress(selectedArtwork);
    // Flush initial state so summary exists
    flushPendingArtworkSave();
  } else {
    currentArtworkSignal.set(null);
  }
}

export async function handleSelectArtworkById(id: string): Promise<void> {
  const current = currentArtworkSignal.get();
  if (current?.id === id) return;

  const artwork = await loadArtworkById(id);
  if (artwork) {
    handleSelectArtwork(artwork);
  }
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

export async function handleRenameArtwork(id: string, newName: string): Promise<void> {
  const summaries = artworkSummariesSignal.get();
  const summary = summaries.get(id);
  if (!summary) return;

  const trimmedName = newName.trim() || "Untitled";
  summary.name = trimmedName;
  summary.modifiedAt = Date.now();

  const sorted = Array.from(summaries.keys()).sort((a, b) => (summaries.get(b)?.modifiedAt || 0) - (summaries.get(a)?.modifiedAt || 0));
  artworkIdsSortedSignal.set(sorted);
  artworkSummariesSignal.set(new Map(summaries));

  set(STORAGE_KEY_ARTWORKS_META, summaries).catch(() => {});

  const current = currentArtworkSignal.get();
  if (current?.id === id) {
    current.name = trimmedName;
    current.modifiedAt = summary.modifiedAt;
    set(getArtworkStorageKey(id), current).catch(() => {});
    currentArtworkSignal.set({ ...current });
  } else {
    const artwork = await loadArtworkById(id);
    if (artwork) {
      artwork.name = trimmedName;
      artwork.modifiedAt = summary.modifiedAt;
      set(getArtworkStorageKey(id), artwork).catch(() => {});
    }
  }
}

export async function handleDeleteArtwork(id: string): Promise<void> {
  const summaries = artworkSummariesSignal.get();
  summaries.delete(id);

  const sorted = Array.from(summaries.keys()).sort((a, b) => (summaries.get(b)?.modifiedAt || 0) - (summaries.get(a)?.modifiedAt || 0));
  artworkIdsSortedSignal.set(sorted);
  artworkSummariesSignal.set(new Map(summaries));

  del(getArtworkStorageKey(id)).catch(() => {});
  set(STORAGE_KEY_ARTWORKS_META, summaries).catch(() => {});

  if (currentArtworkSignal.get()?.id === id) {
    handleSelectArtwork(null);
  }
}

export function handleToggleSound() {
  const next = !soundEnabledSignal.get();
  soundEnabledSignal.set(next);
  soundEffects.enabled = next;
}

let persistDebounceTimer: any = null;
let pendingPersistArtwork: ProcessedArtwork | null = null;

export function flushPendingArtworkSave() {
  if (persistDebounceTimer) {
    clearTimeout(persistDebounceTimer);
    persistDebounceTimer = null;
  }
  if (!pendingPersistArtwork) return;

  const artwork = pendingPersistArtwork;
  pendingPersistArtwork = null;

  try {
    const summaries = artworkSummariesSignal.get();
    const existingSummary = summaries.get(artwork.id);
    const updatedSummary = createArtworkSummary(artwork);

    if (existingSummary) {
      Object.assign(existingSummary, updatedSummary);
    } else {
      summaries.set(artwork.id, updatedSummary);
    }

    const sorted = Array.from(summaries.keys()).sort((a, b) => (summaries.get(b)?.modifiedAt || 0) - (summaries.get(a)?.modifiedAt || 0));
    artworkIdsSortedSignal.set(sorted);
    artworkSummariesSignal.set(new Map(summaries));

    set(getArtworkStorageKey(artwork.id), artwork).catch((e) => {
      console.warn("Could not save to idb", e);
    });
    set(STORAGE_KEY_ARTWORKS_META, summaries).catch((e) => {
      console.warn("Could not save summaries to idb", e);
    });
  } catch (err) {
    console.warn("Error during artwork flush", err);
  }
}

export function saveCurrentArtworkProgress(currentArtwork: ProcessedArtwork | null) {
  if (currentArtwork) {
    currentArtwork.modifiedAt = Date.now();
    pendingPersistArtwork = currentArtwork;

    // Fast in-memory summary update without heavy SVG re-encoding on each paint
    const summaries = artworkSummariesSignal.get();
    const existingSummary = summaries.get(currentArtwork.id);
    const fastSummary = createArtworkSummary(currentArtwork, existingSummary?.thumbnailSvgDataUrl);

    if (existingSummary) {
      Object.assign(existingSummary, fastSummary);
    } else {
      summaries.set(currentArtwork.id, fastSummary);
    }

    // Schedule debounced full IDB save and thumbnail re-generation
    if (persistDebounceTimer) {
      clearTimeout(persistDebounceTimer);
    }
    persistDebounceTimer = setTimeout(() => {
      flushPendingArtworkSave();
    }, 400);
  }

  // Even though references are used we want to trigger a render of other components
  // calling set with the exact same object reference does not trigger a rerender
  // This should be the only place we do this update references of mutable properties
  currentArtworkSignal.set(currentArtwork ? { ...currentArtwork } : null);
}

const MAX_UNDO_HISTORY = 10;

/**
 * Save only the diffable between states not the full artwork
 */
export function pushUndoState(currentArtwork: ProcessedArtwork) {
  const currentStack = undoStackSignal.get();
  const nextStack = [
    ...currentStack,
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
  ];

  if (nextStack.length > MAX_UNDO_HISTORY) {
    undoStackSignal.set(nextStack.slice(-MAX_UNDO_HISTORY));
  } else {
    undoStackSignal.set(nextStack);
  }
}

export function handleDeleteSwatchColor(color: string) {
  const hexCode = normalizeHex(color);
  if (!hexCode || hexCode === TRANSPARENT_HEX) return;
  const current = currentArtworkSignal.get();
  if (!current) return;

  // Check if this is a core color (stat.count > 0 in original image)
  const isCoreColor = (current.colorsAssignedToRegions.get(hexCode)?.size ?? 0) > 0;
  if (isCoreColor) {
    // Core color with regions in original artwork cannot be deleted
    return;
  }

  // Push current painted state and current colorStats to undo stack before modifying
  pushUndoState(current);

  // Unpaint any region that was painted with this color
  for (const regionId of current.colorsFilledInRegions.get(hexCode) ?? []) {
    if (current.regionsDrawingInfo.get(regionId)?.fillColor === TRANSPARENT_HEX) {
      current.regionsCurrentFillInfo.set(regionId, TRANSPARENT_HEX);
    } else {
      current.regionsCurrentFillInfo.set(regionId, PAINTABLE_REGION_HEX);
    }
  }

  // Remove brush strokes painted with this color
  if (current.brushStrokePaths) {
    for (const regionId of Object.keys(current.brushStrokePaths)) {
      const regionStrokes = current.brushStrokePaths[regionId];
      if (regionStrokes) {
        for (const [strokeId, stroke] of Object.entries(regionStrokes)) {
          if (stroke.stroke === hexCode) {
            delete regionStrokes[strokeId];
          }
        }
        if (Object.keys(regionStrokes).length === 0) {
          delete current.brushStrokePaths[regionId];
        }
      }
    }
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
