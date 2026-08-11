import React, { useState } from 'react';
import { PaletteColor, UsedColorStat } from '../types';
import { PALETTE_COLORS } from '../types';
import { Check, Sparkles, PieChart, Info } from 'lucide-react';
import { soundEffects } from '../utils/soundEffects';

interface PaletteDisplayProps {
  colorStats: UsedColorStat[];
  activeColorId?: string | null;
  onSelectColor?: (color: PaletteColor | null) => void;
}

export const PaletteDisplay: React.FC<PaletteDisplayProps> = ({
  colorStats,
  activeColorId,
  onSelectColor
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [copiedHex, setCopiedHex] = useState<string | null>(null);

  // Map stats by color ID for rapid lookup
  const statsMap = new Map<string, UsedColorStat>();
  colorStats.forEach(stat => statsMap.set(stat.color.id, stat));

  // Count total used colors
  const usedCount = colorStats.filter(s => s.count > 0).length;

  // Categories
  const categories = [
    'All',
    'Used Only',
    'Neutrals & Outlines',
    'Skin Tones & Earth',
    'Reds & Pinks',
    'Yellows & Oranges',
    'Greens',
    'Blues & Cyans',
    'Purples'
  ];

  const filteredColors = PALETTE_COLORS.filter(color => {
    const stat = statsMap.get(color.id);
    const isUsed = stat ? stat.count > 0 : false;

    if (selectedCategory === 'Used Only') return isUsed;
    if (selectedCategory === 'All') return true;
    return color.category === selectedCategory;
  });

  const handleColorClick = (color: PaletteColor) => {
    soundEffects.playPop();
    if (activeColorId === color.id) {
      if (onSelectColor) onSelectColor(null);
    } else {
      if (onSelectColor) onSelectColor(color);
    }

    // Copy hex to clipboard on click
    navigator.clipboard.writeText(color.hexCode).then(() => {
      setCopiedHex(color.hexCode);
      setTimeout(() => setCopiedHex(null), 1500);
    }).catch(() => {});
  };

  return (
    <div 
      id="color-palette-section"
      className="w-full max-w-2xl mx-auto mt-6 bg-white/40 backdrop-blur-xl border-[4px] border-[#000000] rounded-[32px] p-4 sm:p-6 shadow-[8px_8px_0px_0px_#000000] relative overflow-hidden"
    >
      {/* Frosted Glass background accent */}
      <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/30 rounded-full blur-2xl pointer-events-none" />

      {/* Palette Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b-3 border-[#000000]/20">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-[#FFD166] border-[3px] border-[#000000] flex items-center justify-center text-[#000000] font-bold shadow-[2px_2px_0px_0px_#000000]">
            <PieChart className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-2xl font-black italic text-[#4A2810] tracking-tight">
              Color Alchemy
            </h2>
            <p className="text-xs text-[#4A2810]/80 font-bold uppercase tracking-tight">
              {colorStats.length > 0 ? (
                <span><span className="text-[#E63946] font-extrabold">{usedCount}</span> of 24 colors used in this artwork</span>
              ) : (
                'Strict 24-color artist palette'
              )}
            </p>
          </div>
        </div>

        {/* Categories scroll / pill filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none max-w-full">
          {categories.slice(0, 3).map(cat => (
            <button
              key={cat}
              onClick={() => {
                soundEffects.playPop();
                setSelectedCategory(cat);
              }}
              className={`text-xs px-3.5 py-1.5 rounded-full font-black uppercase tracking-wider transition-all border-[2.5px] ${
                selectedCategory === cat
                  ? 'bg-[#000000] text-white border-[#000000] shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)]'
                  : 'bg-white/80 text-[#000000] border-[#000000] hover:bg-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Colors Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
        {filteredColors.map(color => {
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
                  ? 'bg-amber-100/90 border-[3px] border-[#E63946] shadow-[4px_4px_0px_0px_#E63946] scale-105 z-10'
                  : isUsed
                  ? 'hover:scale-105'
                  : 'opacity-40 grayscale hover:opacity-100 hover:grayscale-0'
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

                {copiedHex === color.hexCode && (
                  <div className="absolute inset-0 bg-black/90 rounded-full flex items-center justify-center text-white text-[9px] font-black uppercase">
                    Copied
                  </div>
                )}
              </div>

              {/* Color Name */}
              <span className="text-[11px] font-black text-[#3D2314] mt-1.5 text-center truncate w-full leading-tight">
                {color.name}
              </span>

              {/* Percentage */}
              <span className={`text-xs ${isUsed ? 'font-black text-[#000000]' : 'font-bold text-gray-500'}`}>
                {ratio}%
              </span>
            </button>
          );
        })}
      </div>

      {/* Footer Info */}
      <div className="mt-4 pt-3 border-t-2 border-[#000000]/20 flex items-center justify-between text-xs text-[#4A2810] font-bold">
        <span className="flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-[#E63946]" />
          Tap color to view hex or highlight
        </span>
        <span className="font-black uppercase tracking-tight text-[#000000]">
          Total Colors: 24
        </span>
      </div>
    </div>
  );
};
