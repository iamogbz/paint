import React, { useRef, useState } from "react";
import { ProcessedArtwork } from "../types";
import { ImageComparisonSlider } from "./ImageComparisonSlider";
import {
  Upload,
  Image as ImageIcon,
  Download,
  Sparkles,
  Loader2,
  Image,
  PaintBucket,
  FolderOpen,
} from "lucide-react";
import { soundEffects } from "../utils/soundEffects";
import { getDailyChallenge } from "../data/sampleImages";

interface EaselBoardProps {
  currentArtwork: ProcessedArtwork | null;
  hasArtworks: boolean;
  isProcessing: boolean;
  onImageSelected: (src: string, name?: string) => void;
  onOpenGallery: () => void;
  activeHighlightHex?: string | null;
}

export const EaselBoard: React.FC<EaselBoardProps> = ({
  currentArtwork,
  hasArtworks,
  isProcessing,
  onImageSelected,
  onOpenGallery,
  activeHighlightHex,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const dailyChallengeImage = getDailyChallenge();

  const handleFileInput = (file: File) => {
    if (file && file.type.startsWith("image/")) {
      soundEffects.playPop();
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          onImageSelected(
            event.target.result as string,
            file.name.replace(/\.[^/.]+$/, "")
          );
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    handleFileInput(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    handleFileInput(file);
  };

  const handleDownload = () => {
    if (!currentArtwork) return;
    soundEffects.playPop();
    const link = document.createElement("a");
    link.download = `${currentArtwork.name}-palette-cartoon.png`;
    link.href = currentArtwork.cartoonDataUrl;
    link.click();
  };

  return (
    <div className="w-full max-w-2xl mx-auto pt-2 pb-4 px-2 sm:px-4 relative flex flex-col items-center">
      {/* Wooden Easel Top Wooden Clamp */}
      <div className="w-48 sm:w-64 h-6 bg-[#8B5E3C] border-3 border-[#3D2314] rounded-t-xl shadow-md z-20 flex items-center justify-center relative"></div>

      {/* Main Easel Canvas Frame */}
      <div className="w-full bg-[#8B5E3C] border-[4px] border-[#4A2810] rounded-[28px] p-3 sm:p-5 shadow-[12px_12px_0px_0px_rgba(0,0,0,0.15)] relative z-10 overflow-visible">
        {/* Top of Easel Header Bar */}
        <div className="flex items-center justify-between w-full mb-2 gap-2">
          {/* Left: View Other Artworks button if user has at least one artwork uploaded */}
          {hasArtworks ? (
            <button
              title="Open Gallery"
              onClick={() => {
                soundEffects.playPop();
                onOpenGallery();
              }}
              id="view-other-artworks-btn"
              className="bg-[#FFFFFF] text-[#000000] border-[3px] border-[#000000] rounded-[24px] px-4 py-2 sm:px-5 sm:py-2.5 flex items-center gap-2.5 shadow-[5px_5px_0px_0px_#000000] hover:translate-y-0.5 hover:shadow-[2px_2px_0px_0px_#000000] transition-all font-black text-xs sm:text-sm uppercase tracking-tight active:scale-95"
            >
              <FolderOpen className="w-4 h-4 text-[#000000]" />
            </button>
          ) : null}

          {/* Right Action Controls */}
          <div className="flex items-center gap-2">
            {/* Audio Toggle (TODO: Maybe enabled again) */}
            {/* <button
              onClick={onToggleSound}
              title={soundEnabled ? 'Mute Sounds' : 'Enable Sounds'}
              className="w-10 h-10 rounded-[20px] bg-white text-[#000000] border-[3px] border-[#000000] flex items-center justify-center shadow-[3px_3px_0px_0px_#000000] active:scale-95 hover:translate-y-0.5 hover:shadow-[1px_1px_0px_0px_#000000] transition-all"
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-gray-400" />}
            </button> */}

            {/* New Upload Button if artwork is displayed */}
            {currentArtwork && !isProcessing && (
              <>
                {/* Download Button */}
                <button
                  title="Save Painting to Device"
                  onClick={handleDownload}
                  className="bg-[#2A9D8F] hover:bg-[#1d7369] text-white text-[#000000] border-[3px] border-[#000000] rounded-[24px] px-4 py-2 sm:px-5 sm:py-2.5 flex items-center gap-2.5 shadow-[5px_5px_0px_0px_#000000] hover:translate-y-0.5 hover:shadow-[2px_2px_0px_0px_#000000] transition-all font-black text-xs sm:text-sm uppercase tracking-tight active:scale-95"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  title="Change Image"
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-white hover:bg-[#FFD166] text-[#000000] border-[3px] border-[#000000] rounded-[24px] px-4 py-2 sm:px-5 sm:py-2.5 flex items-center gap-2.5 shadow-[5px_5px_0px_0px_#000000] hover:translate-y-0.5 hover:shadow-[2px_2px_0px_0px_#000000] transition-all font-black text-xs sm:text-sm uppercase tracking-tight active:scale-95"
                >
                  <Image className="w-4 h-4" />
                </button>
                {/* Hidden File Input for re-upload */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </>
            )}
          </div>
        </div>

        {/* EASEL BOARD CANVAS DISPLAY AREA */}
        <div className="flex flex-col items-center justify-center relative">
          {/* STATE 1: Processing Loader */}
          {isProcessing && (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center animate-pulse">
              <div className="relative w-20 h-20 mb-4 flex items-center justify-center">
                <Loader2 className="w-16 h-16 text-[#E63946] animate-spin stroke-[2.5]" />
                <Sparkles className="w-8 h-8 text-[#FFD166] absolute" />
              </div>
              <h3 className="text-xl font-black text-[#3D2314] mb-1 italic">
                Preparing Canvas..
              </h3>
              <p className="text-xs font-bold text-[#4A2810] max-w-xs uppercase">
                collecting paints and colouring palettes
              </p>
            </div>
          )}

          {/* STATE 2: Upload Box on Easel (No artwork loaded yet) */}
          {!currentArtwork && !isProcessing && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              className={`w-full max-w-md my-4 p-6 sm:p-8 rounded-[28px] border-[3px] border-dashed transition-all flex flex-col items-center text-center cursor-pointer ${
                isDragOver
                  ? "border-[#E63946] bg-[#FFA6C9]/30 scale-102"
                  : "border-[#000000] bg-white/80 hover:bg-white shadow-[6px_6px_0px_0px_#000000]"
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              {/* Camera / Paint Icon */}
              <div className="w-20 h-20 rounded-[24px] bg-[#FFD166] border-[3px] border-[#000000] flex items-center justify-center shadow-[4px_4px_0px_0px_#000000] mb-4 text-[#000000] hover:rotate-6 transition-transform">
                <Upload className="w-10 h-10" />
              </div>

              <h3 className="text-2xl font-black italic text-[#3D2314] mb-2 tracking-tight">
                Upload Your Image
              </h3>
              <p className="text-xs sm:text-sm font-bold text-[#4A2810]/80 mb-5 max-w-xs leading-relaxed">
                Tap to select or drag & drop any photo.
              </p>

              <button className="bg-[#E63946] hover:bg-[#c92a37] text-white font-black px-6 py-3 rounded-[20px] border-[3px] border-[#000000] shadow-[4px_4px_0px_0px_#000000] text-xs sm:text-sm flex items-center gap-2 active:scale-95 transition-all uppercase tracking-wide">
                <ImageIcon className="w-5 h-5" />
                Choose Photo
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />

              {/* Sample Photo Pickers */}
              <div className="mt-8 pt-6 border-t-2 border-[#000000]/15 w-full">
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <button
                    key={dailyChallengeImage.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      soundEffects.playPop();
                      onImageSelected(
                        dailyChallengeImage.dataUrl,
                        dailyChallengeImage.name
                      );
                    }}
                    className="bg-white hover:bg-[#FFD166] text-[#000000] border-[2.5px] border-[#000000] px-3.5 py-2.5 rounded-[16px] font-black text-sm flex items-center gap-1.5 shadow-[2px_2px_0px_0px_#000000] active:scale-95 transition-all"
                  >
                    <PaintBucket className="h-5 w-5" />
                    {/* <span>{dailyChallengeImage.name}</span> */}
                    Or Paint the Daily Challenge
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STATE 3: Cartoon Image & Slider Displayed on Easel */}
          {currentArtwork && !isProcessing && (
            <div className="w-full flex flex-col items-center">
              {/* Image Slider */}
              <ImageComparisonSlider
                originalUrl={currentArtwork.originalDataUrl}
                cartoonUrl={currentArtwork.cartoonDataUrl}
                width={currentArtwork.width}
                height={currentArtwork.height}
                altText={currentArtwork.name}
                activeHighlightHex={activeHighlightHex}
              />
            </div>
          )}
        </div>
      </div>

      {/* Wooden Easel Legs at Bottom */}
      <div className="w-full max-w-md flex justify-between px-8 -mt-2 z-0">
        <div className="w-6 h-16 bg-[#8B5E3C] border-2 border-[#3D2314] rounded-b-lg rotate-12 shadow-md" />
        <div className="w-6 h-20 bg-[#5C3D2E] border-2 border-[#3D2314] rounded-b-lg shadow-md" />
        <div className="w-6 h-16 bg-[#8B5E3C] border-2 border-[#3D2314] rounded-b-lg -rotate-12 shadow-md" />
      </div>
    </div>
  );
};
