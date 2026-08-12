import { html } from "lit";
import { customElement } from "lit/decorators.js";
import { SignalElement } from "./utils/SignalElement";
import {
  currentArtworkSignal,
  appBackgroundStyleSignal,
  footerStyleSignal,
  loadSavedArtworks,
} from "./state/store";
import "./components/EaselBoard";
import "./components/PaintingControls";
import "./components/ArtworkGalleryModal";

@customElement("paint-app")
export class PaintApp extends SignalElement {
  connectedCallback() {
    super.connectedCallback();
    loadSavedArtworks();
  }

  render() {
    const currentArtwork = currentArtworkSignal.get();
    const bgStyle = appBackgroundStyleSignal.get();
    const footerStyle = footerStyleSignal.get();

    const mainContainerStyle = {
      position: "relative" as const,
      zIndex: 10,
      width: "95vmin",
      maxWidth: "95vmin",
      margin: "0 auto",
      padding: "0 0 250px 0",
      display: "flex",
      flexDirection: "column" as const,
      alignItems: "center",
      boxSizing: "border-box" as const,
      marginBottom: "25vh",
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

          <!-- Footer -->
          <footer style=${this.renderStyleObject(footerStyle)}>
            <p style="margin: 0;">PAINT by COLORS ©️ QBRKTS (${new Date().getFullYear()})</p>
          </footer>
        </div>

        <!-- Gallery Clipboard Modal -->
        <artwork-gallery-modal></artwork-gallery-modal>
      </main>
    `;
  }

  private renderStyleObject(styleObj: Record<string, string | number>): string {
    return Object.entries(styleObj)
      .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}: ${v};`)
      .join(" ");
  }
}
