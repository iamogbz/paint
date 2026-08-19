export const TRANSPARENT_HEX = "#00000000";
export const PAINTABLE_REGION_HEX = "#FFFFFFFF";
export const transparentImgCss = `conic-gradient(#00000011 25%, #FFFFFF11 25%, #FFFFFF11 50%, #00000011 50%, #00000011 75%, #FFFFFF11 75%)`;

export const BASE_BRUSH_RADIUS = 20;
export const DROPPER_BUFFER_PX = 60;
export const FALLBACK_IMAGE_SIZE_PX = 960;
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 10.0;

const fillableSvgElements = ["circle", "ellipse", "path", "polyline", "polygon", "rect", "text", "textPath", "tspan"] as const;
export const FILLABLE_SVG_ELEMENTS = new Set(fillableSvgElements);
export const FILLABLE_SVG_ELEMENTS_SELECTOR = fillableSvgElements.join(",") as (typeof fillableSvgElements)[number];
