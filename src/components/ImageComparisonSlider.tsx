import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Sparkles, Eye, Paintbrush } from 'lucide-react';
import { soundEffects } from '../utils/soundEffects';

interface ImageComparisonSliderProps {
  originalUrl: string;
  cartoonUrl: string;
  width: number;
  height: number;
  altText?: string;
  activeHighlightHex?: string | null;
}

export const ImageComparisonSlider: React.FC<ImageComparisonSliderProps> = ({
  originalUrl,
  cartoonUrl,
  width,
  height,
  altText = 'Artwork comparison',
  activeHighlightHex
}) => {
  const [sliderPosition, setSliderPosition] = useState<number>(50); // 0% to 100%
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const updateSliderPosition = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    let percentage = (x / rect.width) * 100;
    if (percentage < 0) percentage = 0;
    if (percentage > 100) percentage = 100;
    setSliderPosition(percentage);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    updateSliderPosition(e.clientX);
    soundEffects.playBrushSwoosh();
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    updateSliderPosition(e.clientX);
  }, [isDragging, updateSliderPosition]);

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
    }
  }, [isDragging]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    if (e.touches.length > 0) {
      updateSliderPosition(e.touches[0].clientX);
      soundEffects.playBrushSwoosh();
    }
  };

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isDragging) return;
    if (e.touches.length > 0) {
      updateSliderPosition(e.touches[0].clientX);
    }
  }, [isDragging, updateSliderPosition]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleTouchEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

  // Quick preset buttons (Full Cartoon, 50/50 Split, Full Original)
  const setPreset = (pos: number) => {
    soundEffects.playPop();
    setSliderPosition(pos);
  };

  return (
    <div className="flex flex-col items-center w-full">
      {/* Quick Mode Controls */}
      <div className="flex items-center gap-1.5 mb-3 bg-white/40 backdrop-blur-md p-1.5 rounded-full border-[2.5px] border-[#000000] shadow-[3px_3px_0px_0px_#000000]">
        <button
          onClick={() => setPreset(100)}
          className={`px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1 border-2 ${
            sliderPosition >= 95
              ? 'bg-[#E63946] text-white border-[#000000] shadow-[2px_2px_0px_0px_#000000] scale-105'
              : 'border-transparent text-[#000000] hover:bg-white/60'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Cartoon
        </button>
        <button
          onClick={() => setPreset(50)}
          className={`px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1 border-2 ${
            sliderPosition > 5 && sliderPosition < 95
              ? 'bg-[#2A9D8F] text-white border-[#000000] shadow-[2px_2px_0px_0px_#000000] scale-105'
              : 'border-transparent text-[#000000] hover:bg-white/60'
          }`}
        >
          <Paintbrush className="w-3.5 h-3.5" />
          Split Slider
        </button>
        <button
          onClick={() => setPreset(0)}
          className={`px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1 border-2 ${
            sliderPosition <= 5
              ? 'bg-[#1D3557] text-white border-[#000000] shadow-[2px_2px_0px_0px_#000000] scale-105'
              : 'border-transparent text-[#000000] hover:bg-white/60'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          Original
        </button>
      </div>

      {/* Comparison Container */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        className="relative w-full max-w-[800px] aspect-auto max-h-[70vh] rounded-[24px] overflow-hidden cursor-ew-resize select-none border-[4px] border-[#000000] shadow-[8px_8px_0px_0px_#000000] bg-[#000]"
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        {/* Underlayer: Original Image */}
        <img
          src={originalUrl}
          alt={`Original ${altText}`}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        />

        {/* Top layer: Cartoon Version clipped by slider position */}
        <div
          className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none"
          style={{ width: `${sliderPosition}%` }}
        >
          <img
            src={cartoonUrl}
            alt={`Cartoon ${altText}`}
            className="absolute inset-0 w-full h-full object-contain pointer-events-none max-w-none"
            style={{ width: containerRef.current?.clientWidth ? `${containerRef.current.clientWidth}px` : '100%', height: '100%' }}
          />
        </div>

        {/* Badges on overlay */}
        <div className="absolute top-3 left-3 bg-[#E63946] text-white text-[10px] sm:text-[11px] font-black px-3 py-1 rounded-full shadow-md border-[2px] border-white pointer-events-none uppercase tracking-wider">
          🎨 Cartoon Palette
        </div>
        <div className="absolute top-3 right-3 bg-[#1D3557] text-white text-[10px] sm:text-[11px] font-black px-3 py-1 rounded-full shadow-md border-[2px] border-white pointer-events-none uppercase tracking-wider">
          📷 Original Photo
        </div>

        {/* Divider Bar & Handle */}
        <div
          className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_10px_rgba(0,0,0,0.5)] pointer-events-none z-10 flex items-center justify-center"
          style={{ left: `${sliderPosition}%` }}
        >
          <div className="w-10 h-10 -ml-5 bg-white border-[3px] border-[#000000] rounded-full shadow-[3px_3px_0px_0px_#000000] flex items-center justify-center text-[#000000] font-black text-sm hover:scale-110 active:scale-95 transition-transform pointer-events-auto">
            <span className="text-xs tracking-tighter">◀ ▶</span>
          </div>
        </div>
      </div>

      <p className="text-xs text-[#4A2810] font-black uppercase tracking-wider mt-2.5 flex items-center gap-1.5">
        <span>👆 Drag slider left / right to compare photo & cartoon</span>
      </p>
    </div>
  );
};
