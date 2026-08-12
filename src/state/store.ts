import { signal, computed } from "@lit-labs/signals";
import { ProcessedArtwork, PALETTE_COLOR, PaletteColor } from "../types";
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
export const selectedCategorySignal = signal<string>("All");
export const copiedHexSignal = signal<string | null>(null);
export const isDragOverSignal = signal<boolean>(false);
export const isDraggingSignal = signal<boolean>(false);
export const sliderPositionSignal = signal<number>(50); // 0 to 100

// Dynamic Style Signals
export const appBackgroundStyleSignal = computed(() => ({
  background: `radial-gradient(circle at 50% 50%, ${PALETTE_COLOR.pale_ivory.hexCode} 0%, ${PALETTE_COLOR.peach_base.hexCode} 100%)`,
  minHeight: "100vh",
  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
  position: "relative" as const,
  paddingBottom: "3rem",
  overflowX: "hidden" as const,
}));

export const footerStyleSignal = computed(() => ({
  marginTop: "2rem",
  textAlign: "center" as const,
  fontSize: "0.75rem",
  fontWeight: "800",
  color: PALETTE_COLOR.dark_espresso.hexCode,
}));

// Storage Helpers
export function loadSavedArtworks() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_ALL_ARTWORKS);
    if (saved) {
      const parsed: ProcessedArtwork[] = JSON.parse(saved);
      if (parsed && parsed.length > 0) {
        const sorted = parsed.sort((a, b) => (b.modifiedAt || 0) - (a.modifiedAt || 0));
        artworksSignal.set(sorted);
        currentArtworkSignal.set(sorted[0]);
      }
    }
  } catch (e) {
    console.warn("Could not restore saved artworks from localStorage", e);
  }
}

export function saveArtworksList(newList: ProcessedArtwork[]) {
  artworksSignal.set(newList);
  try {
    localStorage.setItem(STORAGE_KEY_ALL_ARTWORKS, JSON.stringify(newList));
  } catch (e) {
    console.warn("Could not save to localStorage", e);
  }
}

export function handleSelectArtwork(artwork: ProcessedArtwork) {
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
  soundEffects.playBrushSwoosh();

  try {
    const artworkName = name.substring(0, 32);
    const newArtwork = await processImageToCartoonPalette(imageSrc, artworkName);

    const updatedList = [newArtwork, ...artworksSignal.get()];
    saveArtworksList(updatedList);
    currentArtworkSignal.set(newArtwork);
    isProcessingSignal.set(false);

    soundEffects.playSuccessChime();
    confetti({
      particleCount: 50,
      spread: 70,
      origin: { y: 0.6 },
      colors: [
        PALETTE_COLOR.crimson_red.hexCode,
        PALETTE_COLOR.bright_yellow.hexCode,
        PALETTE_COLOR.lime_green.hexCode,
        PALETTE_COLOR.sky_blue.hexCode,
        PALETTE_COLOR.bright_lavender.hexCode,
      ],
    });
  } catch (err) {
    console.error("Image processing failed:", err);
    isProcessingSignal.set(false);
    alert("Failed to process image. Please try another photo.");
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
  if (next) soundEffects.playPop();
}
