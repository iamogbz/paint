import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import { FALLBACK_IMAGE_SIZE_PX, FILLABLE_SVG_ELEMENTS_SELECTOR } from "./constants";
import { render } from "lit";

export const XML_NS = "http://www.w3.org/2000/svg";

/** Basically the same thing as unsafeSVG from lit */
export function parseSVG<T extends SVGElement>(svgStr: string): T {
  const container = document.createElement("div");
  render(unsafeSVG(svgStr), container);
  return container.firstElementChild as T;
}

/** TODO: look into using `SVGGraphicsElement` instead */
export type SVGFillableElement = SVGElementTagNameMap[typeof FILLABLE_SVG_ELEMENTS_SELECTOR];

export function getSvgDimensions(svg: SVGSVGElement, fallbackValue = FALLBACK_IMAGE_SIZE_PX) {
  return {
    width: svg.viewBox.baseVal.width || svg.width.baseVal.value || fallbackValue,
    height: svg.viewBox.baseVal.height || svg.height.baseVal.value || fallbackValue,
  };
}

/**
 * Simple clean up for possible errors in svg before parsing
 */
export function cleanSvgStr(svgStr: string) {
  let cleanedSvg = svgStr.includes("xmlns=") ? svgStr : svgStr.replace("<svg", `<svg xmlns="${XML_NS}"`);
  cleanedSvg = cleanedSvg.replaceAll(` d="L`, ` d="M`);
  return cleanedSvg;
}
