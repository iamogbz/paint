import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import { FILLABLE_SVG_ELEMENTS_SELECTOR } from "./constants";
import { render } from "lit";

/** Basically the same thing as unsafeSVG from lit */
export function parseSVG(svgStr: string) {
  const container = document.createElement("div");
  render(unsafeSVG(svgStr), container);
  return container.firstElementChild as SVGElement;
}

export type SVGFillableElement = SVGElementTagNameMap[typeof FILLABLE_SVG_ELEMENTS_SELECTOR];
