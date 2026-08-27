import { BrushStrokePaths } from "../types";

/** Clone JSON compatible object completely */
export function deepCopy<T>(obj: T): T {
  return obj && JSON.parse(JSON.stringify(obj));
}

/** Deep clone map set */
export function copyMapSet<K, V>(o: Map<K, Set<V>>) {
  return new Map(Array.from(o).map(([k, v]) => [k, new Set(v)] as const));
}

/** Shallow copy brush strokes structure, keeping stroke objects and point arrays intact */
export function copyBrushStrokePaths(paths: BrushStrokePaths): BrushStrokePaths {
  if (!paths) return paths;
  const newPaths: BrushStrokePaths = {};
  for (const [regionId, strokes] of Object.entries(paths)) {
    newPaths[regionId] = { ...strokes };
  }
  return newPaths;
}
