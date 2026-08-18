import { TemplateResult } from "lit";

export type BrushStrokePaths = Record<
  string,
  Array<{
    points: Array<{ x: number; y: number }>;
    stroke: string;
    strokeWidth: number;
  }>
>;

export interface SvgPath {
  id: number;
  d: string;
}

export interface ProcessedArtwork {
  id: string;
  name: string;
  /** original image data */
  originalDataUrl: string;
  /** full color svg rendering */
  cartoonDataUrl: string;
  /** blank template for painting in */
  cartoonSVG: string;
  width: number;
  height: number;
  createdAt: number;
  modifiedAt: number;
  /** Map of hexcode to assigned regions ids for fast lookup */
  colorsAssignedToRegions: Map<string, Set<string>>;
  colorsFilledInRegions: Map<string, Set<string>>;
  /** Map of regions ids current fill hexcode for fast lookup */
  regionsCurrentFillInfo: Map<string, string>;
  regionsDrawingInfo: ReadonlyMap<
    string,
    {
      readonly id: string;
      // TODO: ensure this can not become stale due to map of color to region being mutated
      readonly fillColor: string;
      readonly neighbourRegionIds: Set<string>;
      readonly boundingBox: {
        readonly height: number;
        readonly width: number;
        readonly x: number;
        readonly y: number;
      } | null;
    }
  >;
  brushStrokePaths: BrushStrokePaths;
}

export type MutableMap<T> = T extends ReadonlyMap<infer K, infer V> ? Map<K, V> : never;

export type UndoHistoryItem = Pick<ProcessedArtwork, "regionsCurrentFillInfo" | "colorsFilledInRegions" | "colorsAssignedToRegions" | "brushStrokePaths">;
