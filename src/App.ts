import { html } from "lit";
import { customElement } from "lit/decorators.js";
import { SignalElement } from "./utils/SignalElement";
import { currentArtworkSignal, appBackgroundStyleSignal, loadSavedArtworks, draggedColorPositionSignal, isWindowFocusedSignal, activeHighlightColorSignal } from "./state/store";
import "./components/EaselBoard";
import "./components/PaintingControls";
import "./components/ArtworkGalleryModal";
import "./components/DailyChallengeModal";
import "./components/RadialColorPickerModal";
import "./components/TourGuide";
import { TRANSPARENT_HEX, transparentImgCss } from "./utils/constants";
import { iconPaintbrush } from "./components/icons";

@customElement("paint-app")
export class PaintApp extends SignalElement {
  private handleBlur = () => {
    isWindowFocusedSignal.set(false);
  };

  private handleGlobalPointerUp = () => {
    if (!isWindowFocusedSignal.get()) {
      window.focus();
      isWindowFocusedSignal.set(true);
    }
  };

  connectedCallback() {
    super.connectedCallback();
    loadSavedArtworks();
    window.addEventListener("blur", this.handleBlur);
    window.addEventListener("pointerup", this.handleGlobalPointerUp, { capture: true });
    // Initialize state
    isWindowFocusedSignal.set(document.hasFocus());
  }

  disconnectedCallback() {
    window.removeEventListener("pointerup", this.handleGlobalPointerUp, { capture: true });
    window.removeEventListener("blur", this.handleBlur);
    super.disconnectedCallback();
  }

  render() {
    const currentArtwork = currentArtworkSignal.get();
    const bgStyle = appBackgroundStyleSignal.get();
    const draggedColor = activeHighlightColorSignal.get();
    const draggedPos = draggedColorPositionSignal.get();
    const isFocused = isWindowFocusedSignal.get();

    const mainContainerStyle = {
      position: "relative" as const,
      zIndex: 10,
      width: "100vw",
      height: "100vh",
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
          <div style="position: absolute; top: 2.5rem; left: -3rem; width: 18rem; height: 18rem; background-color: rgba(255, 229, 217, 0.4); border-radius: 9999px; filter: blur(48px);"></div>
          <div style="position: absolute; top: 33%; right: -4rem; width: 24rem; height: 24rem; background-color: rgba(78, 168, 222, 0.3); border-radius: 9999px; filter: blur(48px);"></div>
          <div style="position: absolute; bottom: 2.5rem; left: 25%; width: 20rem; height: 20rem; background-color: rgba(255, 209, 102, 0.4); border-radius: 9999px; filter: blur(48px);"></div>
        </div>

        <!-- Main Layout -->
        <div style=${this.renderStyleObject(mainContainerStyle)}>
          <!-- Easel Board -->
          <easel-board></easel-board>

          <!-- Painting Controls -->
          <painting-controls></painting-controls>

        <!-- Gallery Clipboard Modal -->
        <artwork-gallery-modal></artwork-gallery-modal>

        <!-- Daily Challenge Modal -->
        <daily-challenge-modal></daily-challenge-modal>

        <!-- Radial Color Picker Modal -->
        <radial-color-picker-modal></radial-color-picker-modal>

        <!-- Interactive Tour Guide -->
        <app-tour></app-tour>

        <!-- Drag Indicator -->
        ${draggedColor && draggedPos ? html` <div style="position: fixed; left: ${draggedPos.targetX}px; top: ${draggedPos.targetY}px; transform: translate(-50%, -50%); width: 8px; height: 8px; border-radius: 50%; background-color: ${draggedColor}; background-size: 0.5rem 0.5rem; background-repeat: repeat; background-image: ${draggedColor === TRANSPARENT_HEX ? transparentImgCss : "none"}; border: 2px solid #FFFFFF; box-shadow: 0 4px 10px rgba(0,0,0,0.4); pointer-events: none; z-index: 9999; animation: bounce-drop 2s ease infinite;"></div> ` : ""}

        <!-- Blur Overlay -->
        ${
          !isFocused && currentArtwork
            ? html`
                <div style="position: fixed; inset: 0; z-index: 10000; display: flex; flex-direction: column; align-items: center; justify-content: center; background-color: rgba(255, 255, 255, 0.6); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); padding: 0.75rem; box-sizing: border-box; cursor: pointer;">
                  <div style="background-color: rgba(255, 255, 255, 0.95); backdrop-filter: blur(0.5rem); padding: 2.5rem 3.5rem; border-radius: 32px; box-shadow: 10px 10px 0px 0px #000000; display: flex; flex-direction: column; align-items: center; gap: 1rem; border: 4px solid #000000; max-width: 400px; text-align: center;">
                    ${iconPaintbrush(48, "#000000")}
                    <h2 style="margin: 0; font-family: 'Playfair Display', serif; font-style: italic; font-size: 1.75rem; font-weight: 900; color: #000000; letter-spacing: -0.02em;">Resume painting</h2>
                    <p style="margin: 0; font-size: 0.875rem; font-weight: 800; text-transform: uppercase; color: #000000; font-family: 'Plus Jakarta Sans', sans-serif;">Click anywhere to continue</p>
                  </div>
                </div>
              `
            : ""
        }
      </main>
    `;
  }

  private renderStyleObject(styleObj: Record<string, string | number>): string {
    return Object.entries(styleObj)
      .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}: ${v};`)
      .join(" ");
  }
}
