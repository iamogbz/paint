import React from "react";
import { ProcessedArtwork } from "../types";
import {
  X,
  Download,
  Trash2,
  CheckCircle2,
  Image,
  GalleryVertical,
} from "lucide-react";
import { soundEffects } from "../utils/soundEffects";

interface ArtworkGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  artworks: ProcessedArtwork[];
  activeArtworkId: string | null;
  onSelectArtwork: (artwork: ProcessedArtwork) => void;
  onDeleteArtwork: (id: string) => void;
  onUploadNew: () => void;
}

export const ArtworkGalleryModal: React.FC<ArtworkGalleryModalProps> = ({
  isOpen,
  onClose,
  artworks,
  activeArtworkId,
  onSelectArtwork,
  onDeleteArtwork,
  onUploadNew,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
      <div className="bg-white/70 backdrop-blur-xl border-[4px] border-[#000000] w-full max-w-2xl max-h-[85vh] rounded-[32px] p-4 sm:p-6 shadow-[10px_10px_0px_0px_#000000] flex flex-col relative overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b-2 border-[#000000]/20">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-[18px] bg-[#FFD166] border-[3px] border-[#000000] flex items-center justify-center text-[#000000] font-bold shadow-[2px_2px_0px_0px_#000000]">
              <GalleryVertical className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black italic text-[#4A2810] tracking-tight">
                Existing Paintings
              </h2>
              <p className="text-xs font-bold uppercase text-[#4A2810]">
                {artworks.length} saved{" "}
                {artworks.length === 1 ? "artwork" : "artworks"}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              soundEffects.playPop();
              onClose();
            }}
            className="w-10 h-10 rounded-[18px] bg-white border-[3px] border-[#000000] hover:bg-[#E63946] hover:text-white text-[#000000] flex items-center justify-center font-black shadow-[2px_2px_0px_0px_#000000] active:scale-95 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Gallery Grid */}
        <div className="flex-1 overflow-y-auto py-4 space-y-3 pr-1 scrollbar-thin">
          {artworks.length === 0 && (
            <div className="text-center text-[#4A2810] font-bold text-sm">
              <i>
                An empty canvas is an invitation
                <br />
                to start your journey with a painting
              </i>
            </div>
          )}
          {artworks.map((art) => {
            const isActive = art.id === activeArtworkId;
            const dateStr = new Date(art.createdAt).toLocaleDateString(
              undefined,
              {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }
            );
            const usedColorsCount = art.colorStats.filter(
              (s) => s.count > 0
            ).length;

            return (
              <div
                key={art.id}
                className={`p-3 rounded-[24px] border-[3px] transition-all flex flex-col sm:flex-row items-center gap-3 bg-white/90 ${
                  isActive
                    ? "border-[#E63946] shadow-[4px_4px_0px_0px_#E63946]"
                    : "border-[#000000] shadow-[3px_3px_0px_0px_#000000]"
                }`}
              >
                {/* Thumbnail */}
                <div
                  onClick={() => {
                    soundEffects.playPop();
                    onSelectArtwork(art);
                    onClose();
                  }}
                  className="w-full sm:w-28 h-28 rounded-[18px] overflow-hidden border-[2.5px] border-[#000000] bg-black/5 relative cursor-pointer group flex-shrink-0"
                >
                  <img
                    src={art.cartoonDataUrl}
                    alt={art.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                  {isActive && (
                    <div className="absolute top-1.5 left-1.5 bg-[#E63946] text-white text-[10px] font-black px-2 py-0.5 rounded-full border border-white shadow-sm uppercase">
                      ACTIVE
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 w-full flex flex-col justify-between">
                  <div>
                    <h3 className="font-black text-[#000000] text-base line-clamp-1">
                      {art.name}
                    </h3>
                    <p className="text-xs text-[#4A2810] font-bold">
                      Created: {dateStr} • {art.width}×{art.height}px
                    </p>

                    {/* Color Swatch Previews */}
                    <div className="flex items-center gap-1 mt-2 flex-wrap">
                      <span className="text-[10px] font-black text-[#000000] uppercase mr-1">
                        {usedColorsCount} colors:
                      </span>
                      {art.colorStats
                        .filter((s) => s.count > 0)
                        .slice(0, 8)
                        .map((stat) => (
                          <div
                            key={stat.color.id}
                            className="w-4 h-4 rounded-full border border-black shadow-xs"
                            style={{ backgroundColor: stat.color.hexCode }}
                            title={`${stat.color.name}: ${stat.percentage}%`}
                          />
                        ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-[#000000]/15">
                    <button
                      onClick={() => {
                        soundEffects.playPop();
                        onSelectArtwork(art);
                        onClose();
                      }}
                      className={`px-3 py-1.5 rounded-[16px] text-xs font-black border-[2.5px] border-[#000000] flex items-center gap-1 uppercase transition-all shadow-[2px_2px_0px_0px_#000000] active:scale-95 ${
                        isActive
                          ? "bg-[#E63946] text-white"
                          : "bg-[#FFD166] text-[#000000] hover:bg-[#F4A261]"
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {isActive ? "Currently Viewing" : "Display on Easel"}
                    </button>

                    <div className="flex items-center gap-1.5">
                      {/* Download */}
                      <button
                        onClick={() => {
                          soundEffects.playPop();
                          const link = document.createElement("a");
                          link.download = `${art.name}-palette-cartoon.png`;
                          link.href = art.cartoonDataUrl;
                          link.click();
                        }}
                        className="p-2 rounded-[14px] bg-white hover:bg-[#2A9D8F] hover:text-white border-[2px] border-[#000000] text-[#000000] shadow-[2px_2px_0px_0px_#000000] transition-all"
                        title="Download Artwork"
                      >
                        <Download className="w-4 h-4" />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => {
                          soundEffects.playPop();
                          onDeleteArtwork(art.id);
                        }}
                        className="p-2 rounded-[14px] bg-white hover:bg-[#E63946] hover:text-white border-[2px] border-[#000000] text-[#000000] shadow-[2px_2px_0px_0px_#000000] transition-all"
                        title="Delete Artwork"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t-2 border-[#000000]/20 flex items-center justify-between">
          <button
            onClick={() => {
              soundEffects.playPop();
              onClose();
              onUploadNew();
            }}
            className="bg-[#2A9D8F] hover:bg-[#1d7369] text-white font-black px-4 py-2.5 rounded-[20px] border-[3px] border-[#000000] shadow-[3px_3px_0px_0px_#000000] text-xs sm:text-sm flex items-center gap-2 active:scale-95 transition-all uppercase"
          >
            <Image className="w-4 h-4" />
            Start a new painting
          </button>

          <button
            onClick={() => {
              soundEffects.playPop();
              onClose();
            }}
            className="bg-white text-[#000000] border-[2.5px] border-[#000000] font-black px-5 py-2.5 rounded-[20px] text-xs sm:text-sm shadow-[2px_2px_0px_0px_#000000] uppercase active:scale-95 transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
