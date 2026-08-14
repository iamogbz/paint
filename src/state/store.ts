import { signal, computed } from "@lit-labs/signals";
import { get, set } from "idb-keyval";
import { ProcessedArtwork, PaletteColor } from "../types";
import { processImageToCartoonPalette } from "../utils/imageProcessor";
import { soundEffects } from "../utils/soundEffects";
import confetti from "canvas-confetti";

const STORAGE_KEY_ALL_ARTWORKS = "paint_part_sd_artworks_v1";

// Core State Signals using Lit Signals
export const artworksSignal = signal<ProcessedArtwork[]>([]);
export const currentArtworkSignal = signal<ProcessedArtwork | null>(null);
export const isProcessingSignal = signal<boolean>(false);
export const soundEnabledSignal = signal<boolean>(true);
export const activeHighlightColorSignal = signal<PaletteColor | null>(null);
export const isGalleryOpenSignal = signal<boolean>(false);
export const isColorPickerOpenSignal = signal<boolean>(false);
export const copiedHexSignal = signal<string | null>(null);
export const undoStackSignal = signal<Record<number, string>[]>([]);
export const isDragOverSignal = signal<boolean>(false);
export const zoomScaleSignal = signal<number>(1);

// Drag and drop colors
export const draggedColorSignal = signal<string | null>(null);
export const draggedPositionSignal = signal<{x: number, y: number} | null>(null);
export const isWindowFocusedSignal = signal<boolean>(true);

// Dynamic Style Signals
export const appBackgroundStyleSignal = computed(() => ({
  background: `radial-gradient(circle at 50% 50%, ${"#FFE5D9"} 0%, ${"#FCD5AE"} 100%)`,
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

    const parsed = await get<ProcessedArtwork[]>(STORAGE_KEY_ALL_ARTWORKS);
    if (parsed && parsed.length > 0) {
      const sorted = parsed.sort((a, b) => (b.modifiedAt || 0) - (a.modifiedAt || 0));
      artworksSignal.set(sorted);
      currentArtworkSignal.set(sorted[0]);
    }
  } catch (e) {
    console.warn("Could not restore saved artworks from idb", e);
  }
}

export function saveArtworksList(newList: ProcessedArtwork[]) {
  artworksSignal.set(newList);
  set(STORAGE_KEY_ALL_ARTWORKS, newList).catch((e) => {
    console.warn("Could not save to idb", e);
  });
}

export function handleSelectArtwork(artwork: ProcessedArtwork) {
  const current = currentArtworkSignal.get();
  if (current && current.id !== artwork.id) {
    undoStackSignal.set([]);
  }
  const updatedArtwork = {
    ...artwork,
    modifiedAt: Date.now(),
  };
  const list = [...artworksSignal.get()];
  const artworkIdx = list.findIndex((a) => a.id === artwork.id);
  if (artworkIdx === -1) {
    list.unshift(updatedArtwork);
  } else {
    list[artworkIdx] = updatedArtwork;
  }
  saveArtworksList(list);
  currentArtworkSignal.set(updatedArtwork);
}

export async function handleImageSelected(imageSrc: string, name: string = "Untitled") {
  isProcessingSignal.set(true);
  try {
    const artworkName = name.substring(0, 32);
    const newArtwork = await processImageToCartoonPalette(imageSrc, artworkName);

    const updatedList = [newArtwork, ...artworksSignal.get()];
    saveArtworksList(updatedList);
    undoStackSignal.set([]);
    currentArtworkSignal.set(newArtwork);
    isProcessingSignal.set(false);
    isWindowFocusedSignal.set(true);

    confetti({
      particleCount: 50,
      spread: 70,
      origin: { y: 0.6 },
      colors: [
        "#E63946",
        "#FFD166",
        "#06D6A0",
        "#4EA8DE",
        "#B5179E",
      ],
    });
  } catch (err) {
    console.error("Image processing failed:", err);
    isProcessingSignal.set(false);
    alert("Failed to process image. Please try another photo.");
  }
}

export function handleRenameArtwork(id: string, newName: string) {
  const updated = artworksSignal.get().map((art) => {
    if (art.id === id) {
      return { ...art, name: newName, modifiedAt: Date.now() };
    }
    return art;
  });
  saveArtworksList(updated);
  const current = currentArtworkSignal.get();
  if (current?.id === id) {
    currentArtworkSignal.set({ ...current, name: newName, modifiedAt: Date.now() });
  }
}

export function handleDeleteArtwork(id: string) {
  const updated = artworksSignal.get().filter((art) => art.id !== id);
  if (currentArtworkSignal.get()?.id === id) {
    const nextFirst = updated.length > 0 ? updated[0] : null;
    if (nextFirst) {
      nextFirst.modifiedAt = Date.now();
    }
    currentArtworkSignal.set(nextFirst);
  }
  saveArtworksList(updated);
}

export function handleToggleSound() {
  const next = !soundEnabledSignal.get();
  soundEnabledSignal.set(next);
  soundEffects.enabled = next;
  }

export function pushUndoState(paintedRegionsState: Record<number, string>) {
  undoStackSignal.set([...undoStackSignal.get(), { ...paintedRegionsState }]);
}

export function handleUndo() {
  const stack = undoStackSignal.get();
  if (stack.length === 0) return;
  const current = currentArtworkSignal.get();
  if (!current) return;

  const previousState = stack[stack.length - 1];
  const newStack = stack.slice(0, stack.length - 1);
  undoStackSignal.set(newStack);

  const updatedArtwork = {
    ...current,
    paintedRegionsState: previousState,
    modifiedAt: Date.now(),
  };

  const list = [...artworksSignal.get()];
  const artworkIdx = list.findIndex((a) => a.id === updatedArtwork.id);
  if (artworkIdx !== -1) {
    list[artworkIdx] = updatedArtwork;
    saveArtworksList(list);
  }
  currentArtworkSignal.set(updatedArtwork);
  window.dispatchEvent(new CustomEvent("easel-redraw-artboard"));
}
