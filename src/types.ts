export interface PaletteColor {
  id: string;
  name: string;
  hexCode: string;
  rgb: [number, number, number];
  category: 'Neutrals & Outlines' | 'Skin Tones & Earth' | 'Reds & Pinks' | 'Yellows & Oranges' | 'Greens' | 'Blues & Cyans' | 'Purples';
}

export const PALETTE_COLORS: PaletteColor[] = [
  // Neutrals & Outlines
  { id: 'pure-white', name: 'Pure White', hexCode: '#FFFFFF', rgb: [255, 255, 255], category: 'Neutrals & Outlines' },
  { id: 'light-gray', name: 'Light Gray', hexCode: '#C0C0C0', rgb: [192, 192, 192], category: 'Neutrals & Outlines' },
  { id: 'dark-gray', name: 'Dark Gray', hexCode: '#606060', rgb: [96, 96, 96], category: 'Neutrals & Outlines' },
  { id: 'pure-black', name: 'Pure Black', hexCode: '#000000', rgb: [0, 0, 0], category: 'Neutrals & Outlines' },

  // Skin Tones & Earth
  { id: 'pale-ivory', name: 'Pale Ivory', hexCode: '#FFE5D9', rgb: [255, 229, 217], category: 'Skin Tones & Earth' },
  { id: 'peach-base', name: 'Peach Base', hexCode: '#FCD5AE', rgb: [252, 213, 174], category: 'Skin Tones & Earth' },
  { id: 'warm-beige', name: 'Warm Beige', hexCode: '#D4A373', rgb: [212, 163, 115], category: 'Skin Tones & Earth' },
  { id: 'almond-brown', name: 'Almond Brown', hexCode: '#8B5E3C', rgb: [139, 94, 60], category: 'Skin Tones & Earth' },
  { id: 'dark-espresso', name: 'Dark Espresso', hexCode: '#4A2810', rgb: [74, 40, 16], category: 'Skin Tones & Earth' },
  { id: 'terracotta', name: 'Terracotta', hexCode: '#C05A46', rgb: [192, 90, 70], category: 'Skin Tones & Earth' },

  // Reds & Pinks
  { id: 'blush-pink', name: 'Blush Pink', hexCode: '#FFA6C9', rgb: [255, 166, 201], category: 'Reds & Pinks' },
  { id: 'crimson-red', name: 'Crimson Red', hexCode: '#E63946', rgb: [230, 57, 70], category: 'Reds & Pinks' },
  { id: 'deep-burgundy', name: 'Deep Burgundy', hexCode: '#800020', rgb: [128, 0, 32], category: 'Reds & Pinks' },

  // Yellows & Oranges
  { id: 'bright-yellow', name: 'Bright Yellow', hexCode: '#FFD166', rgb: [255, 209, 102], category: 'Yellows & Oranges' },
  { id: 'vibrant-orange', name: 'Vibrant Orange', hexCode: '#F4A261', rgb: [244, 162, 97], category: 'Yellows & Oranges' },

  // Greens
  { id: 'lime-green', name: 'Lime Green', hexCode: '#06D6A0', rgb: [6, 214, 160], category: 'Greens' },
  { id: 'forest-green', name: 'Forest Green', hexCode: '#2A9D8F', rgb: [42, 157, 143], category: 'Greens' },

  // Blues & Cyans
  { id: 'electric-cyan', name: 'Electric Cyan', hexCode: '#00F5D4', rgb: [0, 245, 212], category: 'Blues & Cyans' },
  { id: 'sky-blue', name: 'Sky Blue', hexCode: '#4EA8DE', rgb: [78, 168, 222], category: 'Blues & Cyans' },
  { id: 'royal-blue', name: 'Royal Blue', hexCode: '#0077B6', rgb: [0, 119, 182], category: 'Blues & Cyans' },
  { id: 'midnight-blue', name: 'Midnight Blue', hexCode: '#1D3557', rgb: [29, 53, 87], category: 'Blues & Cyans' },

  // Purples
  { id: 'bright-lavender', name: 'Bright Lavender', hexCode: '#B5179E', rgb: [181, 23, 158], category: 'Purples' },
  { id: 'deep-purple', name: 'Deep Purple', hexCode: '#7209B7', rgb: [114, 9, 183], category: 'Purples' }
];

export interface UsedColorStat {
  color: PaletteColor;
  count: number;
  percentage: number; // e.g. 21 for 21%
}

export interface ProcessingSettings {
  smoothness: number; // 1 to 5 (radius for blur/edge smoothing)
  outlineStrength: number; // 0 to 5 (cartoon outline emphasis)
  outlineColorHex: string; // #000000 or #1D3557
  cleanJaggies: boolean; // connected component/majority pass
}

export interface ProcessedArtwork {
  id: string;
  name: string;
  originalDataUrl: string;
  cartoonDataUrl: string;
  width: number;
  height: number;
  createdAt: number;
  colorStats: UsedColorStat[];
  totalPixels: number;
  settingsUsed: ProcessingSettings;
}
