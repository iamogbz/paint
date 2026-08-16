export interface PaletteColor {
  hexCode: string;
  rgba: readonly [number, number, number, number];
}

export interface UsedColorStat {
  color: PaletteColor;
  count: number;
  percentage: number;
}

export type BrushStrokePaths = Record<number, Array<{ points: Array<{ x: number, y: number }>; stroke: string; strokeWidth: number }>>

export interface UndoHistoryItem {
  paintedRegionsState: Record<number, string>;
  colorStats?: UsedColorStat[];
  paintedCanvasDataUrl?: string;
  brushStrokePaths?: BrushStrokePaths;
}

export interface SvgPath { id: number; d: string; }

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
  paintedRegionsState?: Record<number, string>;
  paintedCanvasDataUrl?: string;
  regionMapData?: Int32Array | number[];
  regionExpectedColors?: Record<number, string>;
  svgPaths?: SvgPath[];
  brushStrokePaths?: BrushStrokePaths;
}
