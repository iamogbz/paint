import { MAX_ZOOM, MIN_ZOOM } from "./constants";

export function clamp(value: number, min: number, max: number) {
  return Math.max(Math.min(value, max), min);
}

export function zoom(currentZoom: number, out: boolean, step = 1) {
  const delta = out ? 0.95 : 1.05;
  const newZoom = currentZoom * Math.pow(delta, step);
  const precision = Math.pow(10, newZoom <= 0.95 ? 2 : 1);
  return clamp(Math.round(newZoom * precision) / precision, MIN_ZOOM, MAX_ZOOM);
}
