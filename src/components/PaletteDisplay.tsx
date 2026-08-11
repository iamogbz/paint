import React, { useState } from "react";
import {
  PALETTE_COLOR,
  PaletteColor,
  PALLETTE_CATEGORIES,
  UsedColorStat,
} from "../types";
import {
  Check,
  Sparkles,
  PieChart,
  Info,
  Palette,
  Paintbrush,
  CopyCheck,
} from "lucide-react";
import { soundEffects } from "../utils/soundEffects";

const PALETTE_CATEGORIES_ALL = "All";
const PALETTE_CATEGORIES_USED = "Used Only";

interface PaletteDisplayProps {
  colorStats: UsedColorStat[];
  activeColorId?: string | null;
  onSelectColor?: (color: PaletteColor | null) => void;
}

export const PaletteDisplay: React.FC<PaletteDisplayProps> = ({
  colorStats,
  activeColorId,
  onSelectColor,
}) => {
  // Categories
  const categories = [
    PALETTE_CATEGORIES_ALL,
    PALETTE_CATEGORIES_USED,
    ...PALLETTE_CATEGORIES,
  ] as const;

  const [selectedCategory, setSelectedCategory] = useState<
    (typeof categories)[number]
  >(categories[0]);
  const [copiedHex, setCopiedHex] = useState<string | null>(null);

  // Map stats by color ID for rapid lookup
  const statsMap = new Map<string, UsedColorStat>();
  colorStats.forEach((stat) => statsMap.set(stat.color.id, stat));

  const filteredColors = Object.values(PALETTE_COLOR).filter((color) => {
    const stat = statsMap.get(color.id);
    const isUsed = stat ? stat.count > 0 : false;

    if (selectedCategory === categories[1]) return isUsed;
    if (selectedCategory === categories[0]) return true;
    return color.category === selectedCategory;
  });

  const timeoutIdRef = React.useRef<NodeJS.Timeout>(null);
  const handleColorClick = (color: PaletteColor) => {
    soundEffects.playPop();
    if (activeColorId === color.id) {
      if (onSelectColor) onSelectColor(null);
    } else {
      clearTimeout(timeoutIdRef.current);
      if (onSelectColor) onSelectColor(color);
      // Copy hex to clipboard on click
      navigator.clipboard
        .writeText(color.hexCode)
        .then(() => {
          setCopiedHex(color.hexCode);
          timeoutIdRef.current = setTimeout(() => setCopiedHex(null), 1500);
        })
        .catch(() => {});
    }
  };

  return (
    <div
      id="color-palette-section"
      className="w-full max-w-2xl mx-auto mt-6 bg-white/40 backdrop-blur-xl border-[4px] border-[#000000] rounded-[32px] p-4 sm:p-6 shadow-[8px_8px_0px_0px_#000000] relative overflow-hidden"
    >
      {/* Frosted Glass background accent */}
      <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/30 rounded-full blur-2xl pointer-events-none" />

      {/* Palette Header */}
      <div className="flex flex-row items-center justify-between gap-2 mb-4 pb-3 border-b-3 border-[#000000]/20">
        {/* <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-[#FFD166] border-[3px] border-[#000000] flex items-center justify-center text-[#000000] font-bold shadow-[2px_2px_0px_0px_#000000]">
            <Palette className="w-5 h-5" />
          </div>
        </div> */}

        {/* Categories scroll / pill filter */}
        {/* <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none max-w-full"> */}
        {categories.slice(0, 2).map((cat) => (
          <button
            key={cat}
            onClick={() => {
              soundEffects.playPop();
              setSelectedCategory(cat);
            }}
            className={`text-xs px-3.5 py-1.5 rounded-full font-black uppercase tracking-wider transition-all border-[2.5px] ${
              selectedCategory === cat
                ? "bg-[#000000] text-white border-[#000000] shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)]"
                : "bg-white/80 text-[#000000] border-[#000000] hover:bg-white"
            }`}
          >
            {cat === PALETTE_CATEGORIES_ALL ? (
              <Palette className="w-5 h-5" />
            ) : cat === PALETTE_CATEGORIES_USED ? (
              <Paintbrush className="w-5 h-5" />
            ) : (
              cat
            )}
          </button>
        ))}
        {/* </div> */}
      </div>

      {/* Colors Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
        {filteredColors.map((color) => {
          const stat = statsMap.get(color.id);
          const ratio = stat ? stat.percentage : 0;
          const isUsed = ratio > 0;
          const isSelected = activeColorId === color.id;

          return (
            <button
              key={color.id}
              onClick={() => handleColorClick(color)}
              className={`relative group flex flex-col items-center p-2 rounded-2xl transition-all ${
                isSelected
                  ? "bg-amber-100/90 border-[3px] border-[#E63946] shadow-[4px_4px_0px_0px_#E63946] scale-105 z-10"
                  : isUsed
                  ? "hover:scale-105"
                  : "opacity-90 grayscale-10 hover:opacity-100 hover:grayscale-0"
              }`}
            >
              {/* Color Swatch Circle */}
              <div
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full border-[3px] border-black shadow-md flex items-center justify-center relative transition-transform group-hover:scale-105"
                style={{ backgroundColor: color.hexCode }}
              >
                {/* Active / Used checkmark badge */}
                {isUsed && (
                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-black rounded-full border-2 border-white flex items-center justify-center text-white">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                )}

                <div
                  className={`absolute inset-0 bg-white transition w-1/2 h-1/2 opacity-${
                    copiedHex === color.hexCode ? 100 : 0
                  } rounded-full flex items-center justify-center left-1/4 top-1/4`}
                >
                  <Paintbrush className={`w-4 h-4 stroke-[3] text-black`} />
                </div>
              </div>

              {/* Color Name */}
              <span className="text-[11px] font-black text-[#3D2314] mt-1.5 text-center truncate w-full leading-tight">
                {color.name}
              </span>

              {/* Percentage */}
              <span
                className={`text-xs ${
                  isUsed
                    ? "font-black text-[#000000]"
                    : "font-bold text-gray-500"
                }`}
              >
                {ratio}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
