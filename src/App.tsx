import React, { useState, useEffect } from "react";
import { ProcessedArtwork, PALETTE_COLOR, PaletteColor } from "./types";
import { processImageToCartoonPalette } from "./utils/imageProcessor";
import { EaselBoard } from "./components/EaselBoard";
import { PaletteDisplay } from "./components/PaletteDisplay";
import { ArtworkGalleryModal } from "./components/ArtworkGalleryModal";
import { soundEffects } from "./utils/soundEffects";
import confetti from "canvas-confetti";

const STORAGE_KEY = "paint_part_sd_artworks_v1";

export default function App() {
  const [artworks, setArtworks] = useState<ProcessedArtwork[]>([]);
  const [currentArtwork, setCurrentArtwork] = useState<ProcessedArtwork | null>(
    null
  );
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [activeHighlightColor, setActiveHighlightColor] =
    useState<PaletteColor | null>(null);

  // Modals state
  const [isGalleryOpen, setIsGalleryOpen] = useState<boolean>(false);

  // Load saved artworks on startup
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: ProcessedArtwork[] = JSON.parse(saved);
        if (parsed && parsed.length > 0) {
          setArtworks(parsed);
          setCurrentArtwork(parsed[0]);
        }
      }
    } catch (e) {
      console.warn("Could not restore saved artworks from localStorage", e);
    }
  }, []);

  // Save artworks when updated
  const saveArtworksList = (newList: ProcessedArtwork[]) => {
    setArtworks(newList);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newList));
    } catch (e) {
      console.warn("Could not save to localStorage", e);
    }
  };

  // Convert uploaded image
  const handleImageSelected = async (
    imageSrc: string,
    name = "Cartoon Artwork"
  ) => {
    setIsProcessing(true);
    soundEffects.playBrushSwoosh();

    try {
      // Process cartoon quantization
      const newArtwork = await processImageToCartoonPalette(imageSrc, name);

      const updatedList = [newArtwork, ...artworks];
      saveArtworksList(updatedList);
      setCurrentArtwork(newArtwork);
      setIsProcessing(false);

      // Play chime & confetti burst!
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
      setIsProcessing(false);
      alert("Failed to process image. Please try another photo.");
    }
  };

  // Delete artwork
  const handleDeleteArtwork = (id: string) => {
    const updated = artworks.filter((art) => art.id !== id);
    saveArtworksList(updated);
    if (currentArtwork?.id === id) {
      setCurrentArtwork(updated.length > 0 ? updated[0] : null);
    }
  };

  // Toggle sound
  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundEffects.enabled = next;
    if (next) soundEffects.playPop();
  };

  return (
    <main
      className="min-h-screen font-sans relative pb-12 overflow-x-hidden"
      style={{
        background: `radial-gradient(circle at 50% 50%, ${PALETTE_COLOR.pale_ivory.hexCode} 0%, ${PALETTE_COLOR.peach_base.hexCode} 100%`,
      }}
    >
      {/* Playful Frosted Glass Background Accents */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-50 overflow-hidden">
        <div
          className={`absolute top-10 -left-12 w-72 h-72 bg-[${PALETTE_COLOR.pale_ivory.hexCode}]/40 rounded-full blur-3xl`}
        />
        <div
          className={`absolute top-1/3 -right-16 w-96 h-96 bg-[${PALETTE_COLOR.sky_blue.hexCode}]/30 rounded-full blur-3xl`}
        />
        <div
          className={`absolute bottom-10 left-1/4 w-80 h-80 bg-[${PALETTE_COLOR.bright_yellow.hexCode}]/40 rounded-full blur-3xl`}
        />
      </div>

      {/* Main Container - Desktop centered mobile layout */}
      <div className="relative z-10 w-full max-w-2xl mx-auto px-2 sm:px-4 pt-3 flex flex-col items-center">
        {/* FIRST THING USER SEES: EASEL BOARD (No App Header above it) */}
        <EaselBoard
          currentArtwork={currentArtwork}
          hasArtworks={artworks.length > 0}
          isProcessing={isProcessing}
          onImageSelected={handleImageSelected}
          onOpenGallery={() => setIsGalleryOpen(true)}
          activeHighlightHex={activeHighlightColor?.hexCode}
        />

        {/* UNDER THE EASEL BOARD: COLOR PALETTE COMPONENT */}
        <PaletteDisplay
          colorStats={currentArtwork ? currentArtwork.colorStats : []}
          activeColorId={activeHighlightColor?.id}
          onSelectColor={(col) => setActiveHighlightColor(col)}
        />

        {/* Footer info */}
        <footer
          className={`mt-8 text-center text-xs font-bold text-[${PALETTE_COLOR.dark_espresso.hexCode}]`}
        >
          <p>PAINT by Colors ©️ QBRKTS {new Date().getFullYear()}</p>
        </footer>
      </div>

      {/* Gallery Clipboard Modal */}
      <ArtworkGalleryModal
        isOpen={isGalleryOpen}
        onClose={() => setIsGalleryOpen(false)}
        artworks={artworks}
        activeArtworkId={currentArtwork?.id || null}
        onSelectArtwork={(art) => setCurrentArtwork(art)}
        onDeleteArtwork={handleDeleteArtwork}
        onUploadNew={() => {
          setCurrentArtwork(null);
        }}
      />
    </main>
  );
}
