import React, { useState } from 'react';
import { ProcessingSettings, PALETTE_COLORS } from '../types';
import { X, Sparkles, Sliders, Check } from 'lucide-react';
import { soundEffects } from '../utils/soundEffects';

interface StyleSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSettings: ProcessingSettings;
  onApplySettings: (newSettings: ProcessingSettings) => void;
}

export const StyleSettingsModal: React.FC<StyleSettingsModalProps> = ({
  isOpen,
  onClose,
  currentSettings,
  onApplySettings
}) => {
  const [settings, setSettings] = useState<ProcessingSettings>({ ...currentSettings });

  if (!isOpen) return null;

  const handleApply = () => {
    soundEffects.playPop();
    onApplySettings(settings);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white/70 backdrop-blur-xl border-[4px] border-[#000000] w-full max-w-md rounded-[32px] p-5 sm:p-6 shadow-[10px_10px_0px_0px_#000000] flex flex-col relative">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b-2 border-[#000000]/20 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-[18px] bg-[#FFD166] border-[3px] border-[#000000] flex items-center justify-center text-[#000000] font-bold shadow-[2px_2px_0px_0px_#000000]">
              <Sliders className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-black italic text-[#4A2810]">
              Cartoon Style Tuning
            </h2>
          </div>

          <button
            onClick={() => {
              soundEffects.playPop();
              onClose();
            }}
            className="w-9 h-9 rounded-[16px] bg-white border-[2.5px] border-[#000000] text-[#000000] flex items-center justify-center font-black shadow-[2px_2px_0px_0px_#000000] hover:bg-[#E63946] hover:text-white transition-all active:scale-95"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Controls Body */}
        <div className="space-y-5">
          {/* Smoothness Slider */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-black text-[#000000] uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#E63946]" />
                Curve Smoothness
              </label>
              <span className="text-xs font-black text-[#E63946] bg-white px-2.5 py-0.5 rounded-full border-2 border-[#000000] uppercase shadow-[1px_1px_0px_0px_#000000]">
                Level {settings.smoothness}
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="5"
              step="1"
              value={settings.smoothness}
              onChange={(e) => {
                soundEffects.playBrushSwoosh();
                setSettings({ ...settings, smoothness: parseInt(e.target.value) });
              }}
              className="w-full accent-[#E63946] h-2 bg.white border-2 border-[#000000] rounded-lg cursor-pointer"
            />
            <p className="text-[11px] text-[#4A2810] font-bold mt-1">
              Higher values blend textures into smooth curved blocks of color.
            </p>
          </div>

          {/* Outline Strength */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-black text-[#000000] uppercase tracking-wider">
                Cartoon Outline Edges
              </label>
              <span className="text-xs font-black text-[#1D3557] bg-white px-2.5 py-0.5 rounded-full border-2 border-[#000000] uppercase shadow-[1px_1px_0px_0px_#000000]">
                {settings.outlineStrength === 0 ? 'Off' : `Level ${settings.outlineStrength}`}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="4"
              step="1"
              value={settings.outlineStrength}
              onChange={(e) => {
                soundEffects.playBrushSwoosh();
                setSettings({ ...settings, outlineStrength: parseInt(e.target.value) });
              }}
              className="w-full accent-[#1D3557] h-2 bg-white border-2 border-[#000000] rounded-lg cursor-pointer"
            />
            <p className="text-[11px] text-[#4A2810] font-bold mt-1">
              Adds comic book style outline accents along high contrast boundaries.
            </p>
          </div>

          {/* Outline Color Choice */}
          {settings.outlineStrength > 0 && (
            <div>
              <label className="text-xs font-black text-[#000000] uppercase tracking-wider block mb-2">
                Outline Accent Color
              </label>
              <div className="flex items-center gap-2">
                {[
                  { hex: '#000000', name: 'Pure Black' },
                  { hex: '#1D3557', name: 'Midnight' },
                  { hex: '#606060', name: 'Dark Gray' },
                  { hex: '#800020', name: 'Burgundy' }
                ].map(opt => (
                  <button
                    key={opt.hex}
                    onClick={() => {
                      soundEffects.playPop();
                      setSettings({ ...settings, outlineColorHex: opt.hex });
                    }}
                    className={`flex-1 py-1.5 px-2 rounded-[14px] border-[2px] text-xs font-black flex items-center justify-center gap-1.5 uppercase transition-all ${
                      settings.outlineColorHex.toUpperCase() === opt.hex.toUpperCase()
                        ? 'border-[#000000] bg-[#FFD166] shadow-[2px_2px_0px_0px_#000000] scale-105'
                        : 'border-[#000000]/40 bg-white hover:border-[#000000]'
                    }`}
                  >
                    <div 
                      className="w-3.5 h-3.5 rounded-full border border-black/30"
                      style={{ backgroundColor: opt.hex }}
                    />
                    <span className="truncate">{opt.name.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Edge Cleaning Toggle */}
          <div className="flex items-center justify-between p-3.5 bg-white border-[2.5px] border-[#000000] rounded-[20px] shadow-[3px_3px_0px_0px_#000000]">
            <div>
              <span className="text-xs font-black text-[#000000] uppercase block">
                Smooth Curves & Round Edges
              </span>
              <span className="text-[11px] font-bold text-[#4A2810]">
                Removes pixel noise into organic shapes
              </span>
            </div>
            <button
              onClick={() => {
                soundEffects.playPop();
                setSettings({ ...settings, cleanJaggies: !settings.cleanJaggies });
              }}
              className={`w-12 h-6 rounded-full transition-colors relative p-1 flex items-center border-[2px] border-[#000000] ${
                settings.cleanJaggies ? 'bg-[#2A9D8F]' : 'bg-gray-300'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white border border-black shadow-md transform transition-transform ${
                  settings.cleanJaggies ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-3 border-t-2 border-[#000000]/20 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-[18px] text-xs font-black text-[#000000] bg-white border-[2.5px] border-[#000000] shadow-[2px_2px_0px_0px_#000000] active:scale-95 uppercase transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="px-5 py-2.5 rounded-[18px] text-xs font-black text-white bg-[#E63946] border-[2.5px] border-[#000000] shadow-[3px_3px_0px_0px_#000000] hover:bg-[#c92a37] flex items-center gap-1.5 active:scale-95 uppercase tracking-wide transition-all"
          >
            <Check className="w-4 h-4" />
            Re-Paint Artwork
          </button>
        </div>

      </div>
    </div>
  );
};
