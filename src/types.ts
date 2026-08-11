export const PALETTE_COLORS = [
  // Neutrals & Outlines
  {
    id: "pure_white",
    name: "Pure White",
    hexCode: "#FFFFFF",
    rgb: [255, 255, 255],
    category: "Neutrals & Outlines",
  },
  {
    id: "light_gray",
    name: "Light Gray",
    hexCode: "#C0C0C0",
    rgb: [192, 192, 192],
    category: "Neutrals & Outlines",
  },
  {
    id: "dark_gray",
    name: "Dark Gray",
    hexCode: "#606060",
    rgb: [96, 96, 96],
    category: "Neutrals & Outlines",
  },
  {
    id: "pure_black",
    name: "Pure Black",
    hexCode: "#000000",
    rgb: [0, 0, 0],
    category: "Neutrals & Outlines",
  },

  // Skin Tones & Earth
  {
    id: "pale_ivory",
    name: "Pale Ivory",
    hexCode: "#FFE5D9",
    rgb: [255, 229, 217],
    category: "Skin Tones & Earth",
  },
  {
    id: "peach_base",
    name: "Peach Base",
    hexCode: "#FCD5AE",
    rgb: [252, 213, 174],
    category: "Skin Tones & Earth",
  },
  {
    id: "warm_beige",
    name: "Warm Beige",
    hexCode: "#D4A373",
    rgb: [212, 163, 115],
    category: "Skin Tones & Earth",
  },
  {
    id: "almond_brown",
    name: "Almond Brown",
    hexCode: "#8B5E3C",
    rgb: [139, 94, 60],
    category: "Skin Tones & Earth",
  },
  {
    id: "dark_espresso",
    name: "Dark Espresso",
    hexCode: "#4A2810",
    rgb: [74, 40, 16],
    category: "Skin Tones & Earth",
  },
  {
    id: "terracotta",
    name: "Terracotta",
    hexCode: "#C05A46",
    rgb: [192, 90, 70],
    category: "Skin Tones & Earth",
  },

  // Reds & Pinks
  {
    id: "blush_pink",
    name: "Blush Pink",
    hexCode: "#FFA6C9",
    rgb: [255, 166, 201],
    category: "Reds & Pinks",
  },
  {
    id: "crimson_red",
    name: "Crimson Red",
    hexCode: "#E63946",
    rgb: [230, 57, 70],
    category: "Reds & Pinks",
  },
  {
    id: "deep_burgundy",
    name: "Deep Burgundy",
    hexCode: "#800020",
    rgb: [128, 0, 32],
    category: "Reds & Pinks",
  },

  // Yellows & Oranges
  {
    id: "bright_yellow",
    name: "Bright Yellow",
    hexCode: "#FFD166",
    rgb: [255, 209, 102],
    category: "Yellows & Oranges",
  },
  {
    id: "vibrant_orange",
    name: "Vibrant Orange",
    hexCode: "#F4A261",
    rgb: [244, 162, 97],
    category: "Yellows & Oranges",
  },

  // Greens
  {
    id: "lime_green",
    name: "Lime Green",
    hexCode: "#06D6A0",
    rgb: [6, 214, 160],
    category: "Greens",
  },
  {
    id: "forest_green",
    name: "Forest Green",
    hexCode: "#2A9D8F",
    rgb: [42, 157, 143],
    category: "Greens",
  },
  {
    id: "olive_green",
    name: "Olive Green",
    hexCode: "#556B2F",
    rgb: [85, 107, 47],
    category: "Greens",
  },

  // Blues & Cyans
  {
    id: "electric_cyan",
    name: "Electric Cyan",
    hexCode: "#00F5D4",
    rgb: [0, 245, 212],
    category: "Blues & Cyans",
  },
  {
    id: "sky_blue",
    name: "Sky Blue",
    hexCode: "#4EA8DE",
    rgb: [78, 168, 222],
    category: "Blues & Cyans",
  },
  {
    id: "royal_blue",
    name: "Royal Blue",
    hexCode: "#0077B6",
    rgb: [0, 119, 182],
    category: "Blues & Cyans",
  },
  {
    id: "midnight_blue",
    name: "Midnight Blue",
    hexCode: "#1D3557",
    rgb: [29, 53, 87],
    category: "Blues & Cyans",
  },

  // Purples
  {
    id: "bright_lavender",
    name: "Bright Lavender",
    hexCode: "#B5179E",
    rgb: [181, 23, 158],
    category: "Purples",
  },
  {
    id: "deep_purple",
    name: "Deep Purple",
    hexCode: "#7209B7",
    rgb: [114, 9, 183],
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
  colorStats: UsedColorStat[];
  totalPixels: number;
}
