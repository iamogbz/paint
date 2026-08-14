
export interface PaletteColor {
  hexCode: string;
  rgba: readonly [number, number, number, number];
}

export interface UsedColorStat {
  color: PaletteColor;
  count: number;
  percentage: number;
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
  regionMapData?: number[];
  regionExpectedColors?: Record<number, string>;
}
