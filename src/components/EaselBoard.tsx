import React, { useRef, useState } from 'react';
import { ProcessedArtwork, ProcessingSettings } from '../types';
import { ImageComparisonSlider } from './ImageComparisonSlider';
import { 
  Upload, 
  Image as ImageIcon, 
  ClipboardList, 
  Download, 
  Settings, 
  Volume2, 
  VolumeX, 
  Sparkles, 
  Share2, 
  PlusCircle, 
  Palette,
  Loader2
} from 'lucide-react';
import { soundEffects } from '../utils/soundEffects';
import { getSampleImages, SampleImage } from '../data/sampleImages';

interface EaselBoardProps {
  currentArtwork: ProcessedArtwork | null;
  hasArtworks: boolean;
  isProcessing: boolean;
  onImageSelected: (src: string, name?: string) => void;
  onOpenGallery: () => void;
  onOpenSettings: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  activeHighlightHex?: string | null;
}

export const EaselBoard: React.FC<EaselBoardProps> = ({
  currentArtwork,
  hasArtworks,
  isProcessing,
  onImageSelected,
  onOpenGallery,
  onOpenSettings,
  soundEnabled,
  onToggleSound,
  activeHighlightHex
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const samples = getSampleImages();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      soundEffects.playPop();
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          onImageSelected(event.target.result as string, file.name.replace(/\.[^/.]+$/, ''));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      soundEffects.playPop();
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          onImageSelected(event.target.result as string, file.name.replace(/\.[^/.]+$/, ''));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDownload = () => {
    if (!currentArtwork) return;
    soundEffects.playPop();
    const link = document.createElement('a');
    link.download = `${currentArtwork.name}-palette-cartoon.png`;
    link.href = currentArtwork.cartoonDataUrl;
    link.click();
  };

  return (
    <div className="w-full max-w-2xl mx-auto pt-2 pb-4 px-2 sm:px-4 relative flex flex-col items-center">
      
      {/* Wooden Easel Top Wooden Clamp */}
      <div className="w-48 sm:w-64 h-6 bg-[#8B5E3C] border-3 border-[#3D2314] rounded-t-xl shadow-md z-20 flex items-center justify-center relative">
        <div className="w-12 h-3 bg-[#D4A373] border border-[#3D2314] rounded-full shadow-inner" />
        <div className="absolute -top-3 w-8 h-4 bg-[#4A2810] border border-[#3D2314] rounded-t-md" />
      </div>

      {/* Main Easel Canvas Frame */}
      <div className="w-full bg-[#8B5E3C] border-[4px] border-[#4A2810] rounded-[28px] p-3 sm:p-5 shadow-[12px_12px_0px_0px_rgba(0,0,0,0.15)] relative z-10 overflow-hidden">
        
        {/* Top of Easel Header Bar */}
        <div className="flex items-center justify-between w-full mb-3 pb-2 border-b-2 border-[#4A2810]/40 gap-2">
          {/* Left: View Other Artworks button if user has at least one artwork uploaded */}
          {hasArtworks ? (
            <button
              onClick={() => {
                soundEffects.playPop();
                onOpenGallery();
              }}
              id="view-other-artworks-btn"
              className="bg-[#FFFFFF] text-[#000000] border-[3px] border-[#000000] rounded-[24px] px-4 py-2 sm:px-5 sm:py-2.5 flex items-center gap-2.5 shadow-[5px_5px_0px_0px_#000000] hover:translate-y-0.5 hover:shadow-[2px_2px_0px_0px_#000000] transition-all font-black text-xs sm:text-sm uppercase tracking-tight active:scale-95"
            >
              <ClipboardList className="w-4 h-4 text-[#000000]" />
              <span>View Other Artworks</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 bg-white/40 backdrop-blur-md px-3 py-1.5 rounded-full border-2 border-[#4A2810]">
              <span className="text-xl">🎨</span>
              <span className="text-xs sm:text-sm font-black text-[#4A2810] tracking-wider uppercase">
                Palette Studio
              </span>
            </div>
          )}

          {/* Right Action Controls */}
          <div className="flex items-center gap-2">
            {/* Audio Toggle */}
            <button
              onClick={onToggleSound}
              title={soundEnabled ? 'Mute Sounds' : 'Enable Sounds'}
              className="w-10 h-10 rounded-[20px] bg-white text-[#000000] border-[3px] border-[#000000] flex items-center justify-center shadow-[3px_3px_0px_0px_#000000] active:scale-95 hover:translate-y-0.5 hover:shadow-[1px_1px_0px_0px_#000000] transition-all"
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-gray-400" />}
            </button>

            {/* New Upload Button if artwork is displayed */}
            {currentArtwork && !isProcessing && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-[#2A9D8F] text-white border-[3px] border-[#000000] rounded-[20px] px-3.5 py-2 font-black text-xs flex items-center gap-1.5 shadow-[3px_3px_0px_0px_#000000] hover:translate-y-0.5 hover:shadow-[1px_1px_0px_0px_#000000] transition-all active:scale-95"
              >
                <PlusCircle className="w-4 h-4" />
                <span className="hidden sm:inline uppercase">New Photo</span>
              </button>
            )}
          </div>
        </div>

        {/* EASEL BOARD CANVAS DISPLAY AREA */}
        <div className="bg-white/60 backdrop-blur-md border-[3px] border-[#000000] rounded-[20px] p-3 sm:p-4 min-h-[360px] sm:min-h-[440px] flex flex-col items-center justify-center relative shadow-inner">
          
          {/* STATE 1: Processing Loader */}
          {isProcessing && (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center animate-pulse">
              <div className="relative w-20 h-20 mb-4 flex items-center justify-center">
                <Loader2 className="w-16 h-16 text-[#E63946] animate-spin stroke-[2.5]" />
                <Sparkles className="w-8 h-8 text-[#FFD166] absolute" />
              </div>
              <h3 className="text-xl font-black text-[#3D2314] mb-1 italic">
                Painting Cartoon Version...
              </h3>
              <p className="text-xs font-bold text-[#4A2810] max-w-xs uppercase">
                Applying smooth curves & quantizing colors to strict 24-color artist palette
              </p>
            </div>
          )}

          {/* STATE 2: Upload Box on Easel (No artwork loaded yet) */}
          {!currentArtwork && !isProcessing && (
            <div 
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              className={`w-full max-w-md my-4 p-6 sm:p-8 rounded-[28px] border-[3px] border-dashed transition-all flex flex-col items-center text-center cursor-pointer ${
                isDragOver 
                  ? 'border-[#E63946] bg-[#FFA6C9]/30 scale-102' 
                  : 'border-[#000000] bg-white/80 hover:bg-white shadow-[6px_6px_0px_0px_#000000]'
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
                Tap to select or drag & drop any photo. It will be converted into a smoothed 800px cartoon artwork using the 24-color palette!
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
                <p className="text-xs font-black text-[#4A2810] mb-3 uppercase tracking-wider">
                  Or try with a sample photo:
                </p>
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  {samples.map(sample => (
                    <button
                      key={sample.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        soundEffects.playPop();
                        onImageSelected(sample.dataUrl, sample.name);
                      }}
                      className="bg-white hover:bg-[#FFD166] text-[#000000] border-[2.5px] border-[#000000] px-3.5 py-1.5 rounded-[16px] font-black text-xs flex items-center gap-1.5 shadow-[2px_2px_0px_0px_#000000] active:scale-95 transition-all"
                    >
                      <span>{sample.emoji}</span>
                      <span>{sample.name}</span>
                    </button>
                  ))}
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

              {/* Toolbar under artwork on easel */}
              <div className="flex items-center justify-center gap-2.5 mt-4 flex-wrap w-full">
                {/* Download Button */}
                <button
                  onClick={handleDownload}
                  className="bg-[#2A9D8F] hover:bg-[#1d7369] text-white font-black px-4 py-2.5 rounded-[20px] border-[3px] border-[#000000] shadow-[4px_4px_0px_0px_#000000] text-xs sm:text-sm flex items-center gap-2 active:scale-95 transition-all uppercase tracking-wider"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Artwork</span>
                </button>

                {/* Adjust Style Settings Button */}
                <button
                  onClick={() => {
                    soundEffects.playPop();
                    onOpenSettings();
                  }}
                  className="bg-[#FFD166] hover:bg-[#f2bd3f] text-[#000000] font-black px-4 py-2.5 rounded-[20px] border-[3px] border-[#000000] shadow-[4px_4px_0px_0px_#000000] text-xs sm:text-sm flex items-center gap-2 active:scale-95 transition-all uppercase tracking-wider"
                >
                  <Settings className="w-4 h-4" />
                  <span>Adjust Style</span>
                </button>

                {/* Hidden File Input for re-upload */}
                <input 
                  ref={fileInputRef}
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={handleFileChange} 
                />
              </div>
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
