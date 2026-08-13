import { html } from "lit";
import { customElement } from "lit/decorators.js";
import { SignalElement } from "./utils/SignalElement";
import {
  currentArtworkSignal,
  appBackgroundStyleSignal,
  loadSavedArtworks,
  draggedColorSignal,
  draggedPositionSignal,
  isWindowFocusedSignal,
} from "./state/store";
import "./components/EaselBoard";
import "./components/PaintingControls";
import "./components/ArtworkGalleryModal";
import "./components/TourGuide";
import { PALETTE_COLOR } from "./types";
import { transparentImgCss } from "./components/constants";
import { iconPaintbrush } from "./components/icons";

@customElement("paint-app")
export class PaintApp extends SignalElement {
  private handleBlur = () => {
    isWindowFocusedSignal.set(false);
  };

  connectedCallback() {
    super.connectedCallback();
    loadSavedArtworks();
    window.addEventListener("blur", this.handleBlur);
    // Initialize state
    isWindowFocusedSignal.set(document.hasFocus());
  }

  disconnectedCallback() {
    window.removeEventListener("blur", this.handleBlur);
    super.disconnectedCallback();
  }

  render() {
    const currentArtwork = currentArtworkSignal.get();
    const bgStyle = appBackgroundStyleSignal.get();
    const draggedColor = draggedColorSignal.get();
    const draggedPos = draggedPositionSignal.get();
    const isFocused = isWindowFocusedSignal.get();

    const mainContainerStyle = {
      position: "relative" as const,
      zIndex: 10,
      width: "95vmin",
      maxWidth: "95vmin",
      margin: "0 auto",
      padding: "0",
      display: "flex",
      flexDirection: "column" as const,
      alignItems: "center",
      boxSizing: "border-box" as const,
    };

    return html`
      <main style=${this.renderStyleObject(bgStyle)}>
        <!-- Background Accents -->
        <div style="position: fixed; inset: 0; pointer-events: none; z-index: 0; opacity: 0.5; overflow: hidden;">
          <div
            style="position: absolute; top: 2.5rem; left: -3rem; width: 18rem; height: 18rem; background-color: rgba(255, 229, 217, 0.4); border-radius: 9999px; filter: blur(48px);"
          ></div>
          <div
            style="position: absolute; top: 33%; right: -4rem; width: 24rem; height: 24rem; background-color: rgba(78, 168, 222, 0.3); border-radius: 9999px; filter: blur(48px);"
          ></div>
          <div
            style="position: absolute; bottom: 2.5rem; left: 25%; width: 20rem; height: 20rem; background-color: rgba(255, 209, 102, 0.4); border-radius: 9999px; filter: blur(48px);"
          ></div>
        </div>

        <!-- Main Layout -->
        <div style=${this.renderStyleObject(mainContainerStyle)}>
          <!-- Easel Board -->
          <easel-board></easel-board>

          <!-- Painting Controls -->
          <painting-controls
            .colorStats=${currentArtwork ? currentArtwork.colorStats : []}
          ></painting-controls>

        <!-- Gallery Clipboard Modal -->
        <artwork-gallery-modal></artwork-gallery-modal>
        
        <!-- Interactive Tour Guide -->
        <app-tour></app-tour>
        
        <!-- Drag Indicator -->
        ${draggedColor && draggedPos
          ? html`
              <div
                style="position: fixed; left: ${draggedPos.x}px; top: ${draggedPos.y}px; transform: translate(-50%, -50%); width: 8px; height: 8px; border-radius: 50%; background-color: ${draggedColor}; background-size: 0.5rem 0.5rem; background-repeat: repeat; background-image: ${draggedColor === PALETTE_COLOR.transparent.hexCode ? transparentImgCss : 'none'}; border: 2px solid #FFFFFF; box-shadow: 0 4px 10px rgba(0,0,0,0.4); pointer-events: none; z-index: 9999; animation: bounce-drop 2s ease infinite;"
              ></div>
            `
          : ""}

        <!-- Blur Overlay -->
        ${!isFocused && currentArtwork
          ? html`
              <div
                @pointerdown=${(e: Event) => {
                  e.stopPropagation();
                  isWindowFocusedSignal.set(true);
                }}
                @mousedown=${(e: Event) => {
                  e.stopPropagation();
                  isWindowFocusedSignal.set(true);
                }}
                @click=${(e: Event) => {
                  e.stopPropagation();
                  isWindowFocusedSignal.set(true);
                }}
                style="position: fixed; inset: 0; z-index: 10000; display: flex; flex-direction: column; align-items: center; justify-content: center; background-color: rgba(255, 255, 255, 0.4); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); cursor: pointer;"
              >
                <div style="background: white; padding: 2rem 3rem; border-radius: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.1); display: flex; flex-direction: column; align-items: center; gap: 1rem; border: 2px solid ${PALETTE_COLOR.peach_base.hexCode};">
                  ${iconPaintbrush(48, PALETTE_COLOR.crimson_red.hexCode)}
                  <h2 style="margin: 0; font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 800; color: ${PALETTE_COLOR.dark_espresso.hexCode};">Resume painting</h2>
                  <p style="margin: 0; font-size: 0.875rem; color: #666; font-family: 'Plus Jakarta Sans', sans-serif;">Click anywhere to continue</p>
                </div>
              </div>
            `
          : ""}
      </main>
    `;
  }

  private renderStyleObject(styleObj: Record<string, string | number>): string {
    return Object.entries(styleObj)
      .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}: ${v};`)
      .join(" ");
  }
}
