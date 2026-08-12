export const PALETTE_COLORS = [
  // Neutrals & Outlines
  {
    id: "transparent",
    name: "Eraser",
    hexCode: "#00000000",
    rgba: [255, 255, 255, 0],
    category: "Neutrals & Outlines",
  },
  {
    id: "pure_white",
    name: "Pure White",
    hexCode: "#FFFFFFFF",
    rgba: [255, 255, 255, 255],
    category: "Neutrals & Outlines",
  },
  {
    id: "light_gray",
    name: "Light Gray",
    hexCode: "#C0C0C0FF",
    rgba: [192, 192, 192, 255],
    category: "Neutrals & Outlines",
  },
  {
    id: "dark_gray",
    name: "Dark Gray",
    hexCode: "#606060FF",
    rgba: [96, 96, 96, 255],
    category: "Neutrals & Outlines",
  },
  {
    id: "pure_black",
    name: "Pure Black",
    hexCode: "#000000FF",
    rgba: [0, 0, 0, 255],
    category: "Neutrals & Outlines",
  },

  // Skin Tones & Earth
  {
    id: "pale_ivory",
    name: "Ivory",
    hexCode: "#FFE5D9FF",
    rgba: [255, 229, 217, 255],
    category: "Skin Tones & Earth",
  },
  {
    id: "peach_base",
    name: "Peach",
    hexCode: "#FCD5AEFF",
    rgba: [252, 213, 174, 255],
    category: "Skin Tones & Earth",
  },
  {
    id: "warm_beige",
    name: "Beige",
    hexCode: "#D4A373FF",
    rgba: [212, 163, 115, 255],
    category: "Skin Tones & Earth",
  },
  {
    id: "almond_brown",
    name: "Brown",
    hexCode: "#8B5E3CFF",
    rgba: [139, 94, 60, 255],
    category: "Skin Tones & Earth",
  },
  {
    id: "dark_espresso",
    name: "Espresso",
    hexCode: "#4A2810FF",
    rgba: [74, 40, 16, 255],
    category: "Skin Tones & Earth",
  },
  {
    id: "terracotta",
    name: "Terracotta",
    hexCode: "#C05A46FF",
    rgba: [192, 90, 70, 255],
    category: "Skin Tones & Earth",
  },

  // Reds & Pinks
  {
    id: "blush_pink",
    name: "Pink",
    hexCode: "#FFA6C9FF",
    rgba: [255, 166, 201, 255],
    category: "Reds & Pinks",
  },
  {
    id: "crimson_red",
    name: "Crimson",
    hexCode: "#E63946FF",
    rgba: [230, 57, 70, 255],
    category: "Reds & Pinks",
  },
  {
    id: "deep_burgundy",
    name: "Burgundy",
    hexCode: "#800020FF",
    rgba: [128, 0, 32, 255],
    category: "Reds & Pinks",
  },

  // Yellows & Oranges
  {
    id: "bright_yellow",
    name: "Yellow",
    hexCode: "#FFD166FF",
    rgba: [255, 209, 102, 255],
    category: "Yellows & Oranges",
  },
  {
    id: "vibrant_orange",
    name: "Orange",
    hexCode: "#F4A261FF",
    rgba: [244, 162, 97, 255],
    category: "Yellows & Oranges",
  },

  // Greens
  {
    id: "lime_green",
    name: "Lime",
    hexCode: "#06D6A0FF",
    rgba: [6, 214, 160, 255],
    category: "Greens",
  },
  {
    id: "forest_green",
    name: "Forest",
    hexCode: "#2A9D8FFF",
    rgba: [42, 157, 143, 255],
    category: "Greens",
  },
  {
    id: "olive_green",
    name: "Olive",
    hexCode: "#556B2FFF",
    rgba: [85, 107, 47, 255],
    category: "Greens",
  },

  // Blues & Cyans
  {
    id: "electric_cyan",
    name: "Cyan",
    hexCode: "#00F5D4FF",
    rgba: [0, 245, 212, 255],
    category: "Blues & Cyans",
  },
  {
    id: "sky_blue",
    name: "Sky",
    hexCode: "#4EA8DEFF",
    rgba: [78, 168, 222, 255],
    category: "Blues & Cyans",
  },
  {
    id: "royal_blue",
    name: "Royal",
    hexCode: "#0077B6FF",
    rgba: [0, 119, 182, 255],
    category: "Blues & Cyans",
  },
  {
    id: "midnight_blue",
    name: "Midnight",
    hexCode: "#1D3557FF",
    rgba: [29, 53, 87, 255],
    category: "Blues & Cyans",
  },

  // Purples
  {
    id: "bright_lavender",
    name: "Lavender",
    hexCode: "#B5179EFF",
    rgba: [181, 23, 158, 255],
    category: "Purples",
  },
  {
    id: "deep_purple",
    name: "Purple",
    hexCode: "#7209B7FF",
    rgba: [114, 9, 183, 255],
    category: "Purples",
  },
] as const;

export type PaletteColor = (typeof PALETTE_COLORS)[number];

export const PALETTE_COLOR = Object.freeze(
  Object.fromEntries(PALETTE_COLORS.map((color) => [color.id, color]))
) as Readonly<{
  [K in PaletteColor["id"]]: Extract<PaletteColor, { id: K }>;
}>;

export const PALLETTE_CATEGORIES = Object.freeze(
  PALETTE_COLORS.map((color) => color.category)
);

export type PaletteCategories = (typeof PALLETTE_CATEGORIES)[number];

export interface UsedColorStat {
  color: PaletteColor;
  count: number;
  percentage: number; // e.g. 21 for 21%
}

export interface ProcessedArtwork {
  id: string;
  name: string;
  originalDataUrl: string;
  cartoonDataUrl: string;
  width: number;
  height: number;
  createdAt: number;
  modifiedAt: number;
  colorStats: UsedColorStat[];
  totalPixels: number;
  paintedRegionsState?: Record<number, string>;
}
