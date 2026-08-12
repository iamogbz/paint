import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { SignalElement } from "../utils/SignalElement";
import {
  sliderPositionSignal,
  isDraggingSignal,
} from "../state/store";
import { iconEye, iconSplit, iconSparkles } from "./icons";
import { soundEffects } from "../utils/soundEffects";

@customElement("image-comparison-slider")
export class ImageComparisonSlider extends SignalElement {
  @property({ type: String }) originalUrl = "";
  @property({ type: String }) cartoonUrl = "";
  @property({ type: Number }) width = 800;
  @property({ type: Number }) height = 600;
  @property({ type: String }) altText = "Artwork comparison";

  private containerRef?: HTMLDivElement;

  connectedCallback() {
    super.connectedCallback();

    window.addEventListener("mousemove", this.handleMouseMove);
    window.addEventListener("mouseup", this.handleMouseUp);
    window.addEventListener("touchmove", this.handleTouchMove);
    window.addEventListener("touchend", this.handleTouchEnd);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("mousemove", this.handleMouseMove);
    window.removeEventListener("mouseup", this.handleMouseUp);
    window.removeEventListener("touchmove", this.handleTouchMove);
    window.removeEventListener("touchend", this.handleTouchEnd);
  }

  private updateSliderPosition = (clientX: number) => {
    if (!this.containerRef) return;
    const rect = this.containerRef.getBoundingClientRect();
    const x = clientX - rect.left;
    let percentage = (x / rect.width) * 100;
    if (percentage < 0) percentage = 0;
    if (percentage > 100) percentage = 100;
    sliderPositionSignal.set(percentage);
  };

  private handleMouseDown = (e: MouseEvent) => {
    isDraggingSignal.set(true);
    this.updateSliderPosition(e.clientX);
    soundEffects.playBrushSwoosh();
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (!isDraggingSignal.get()) return;
    this.updateSliderPosition(e.clientX);
  };

  private handleMouseUp = () => {
    if (isDraggingSignal.get()) {
      isDraggingSignal.set(false);
    }
  };

  private handleTouchStart = (e: TouchEvent) => {
    isDraggingSignal.set(true);
    if (e.touches.length > 0) {
      this.updateSliderPosition(e.touches[0].clientX);
      soundEffects.playBrushSwoosh();
    }
  };

  private handleTouchMove = (e: TouchEvent) => {
    if (!isDraggingSignal.get()) return;
    if (e.touches.length > 0) {
      this.updateSliderPosition(e.touches[0].clientX);
    }
  };

  private handleTouchEnd = () => {
    isDraggingSignal.set(false);
  };

  private setPreset = (pos: number) => {
    soundEffects.playPop();
    sliderPositionSignal.set(pos);
  };

  render() {
    const pos = sliderPositionSignal.get();
    const isOriginalActive = pos <= 5;
    const isSplitActive = pos > 5 && pos < 95;
    const isCartoonActive = pos >= 95;

    // Inline style computations driven by signals
    const presetBtnStyle = (isActive: boolean, activeBg: string) => ({
      padding: "0.25rem 0.875rem",
      borderRadius: "9999px",
      fontSize: "0.75rem",
      fontWeight: "900",
      textTransform: "uppercase" as const,
      letterSpacing: "0.05em",
      transition: "all 0.15s ease",
      display: "flex",
      alignItems: "center",
      gap: "0.25rem",
      border: isActive ? "2px solid #000000" : "2px solid transparent",
      backgroundColor: isActive ? activeBg : "transparent",
      color: isActive ? "#FFFFFF" : "#000000",
      boxShadow: isActive ? "2px 2px 0px 0px #000000" : "none",
      transform: isActive ? "scale(1.05)" : "scale(1)",
      cursor: "pointer",
    });

    const containerStyle = {
      position: "relative" as const,
      width: "100%",
      aspectRatio: `${this.width} / ${this.height}`,
      borderRadius: "12px",
      overflow: "hidden",
      cursor: "ew-resize",
      userSelect: "none" as const,
      border: "4px solid #000000",
      boxShadow: "4px 4px 0px 0px rgba(0,0,0,0.25)",
      backgroundColor: "#000000",
    };

    const cartoonLayerStyle = {
      position: "absolute" as const,
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
      width: `${pos}%`,
      height: "100%",
      overflow: "hidden",
      pointerEvents: "none" as const,
    };

    const cartoonImgStyle = {
      position: "absolute" as const,
      top: 0,
      left: 0,
      width: this.containerRef ? `${this.containerRef.clientWidth}px` : "100%",
      height: "100%",
      objectFit: "contain" as const,
      pointerEvents: "none" as const,
      maxWidth: "none",
    };

    const dividerStyle = {
      position: "absolute" as const,
      top: 0,
      bottom: 0,
      width: "4px",
      backgroundColor: "#FFFFFF",
      boxShadow: "0 0 10px rgba(0,0,0,0.5)",
      pointerEvents: "none" as const,
      zIndex: 10,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      left: `${pos}%`,
      marginLeft: "-2px",
    };

    const handleStyle = {
      width: "40px",
      height: "40px",
      backgroundColor: "#000000",
      border: "3px solid #FFFFFF",
      borderRadius: "9999px",
      boxShadow: "3px 3px 0px 0px #FFFFFF",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#FFFFFF",
      cursor: "pointer",
      pointerEvents: "auto" as const,
      transition: "transform 0.15s ease",
    };

    return html`
      <div style="display: flex; flex-direction: column; align-items: center; width: 100%;">
        <!-- Mode Presets -->
        <div style="display: flex; items-center; gap: 0.375rem; margin-bottom: 0.75rem; background: rgba(255, 255, 255, 0.4); backdrop-filter: blur(8px); padding: 0.375rem; border-radius: 9999px; border: 2.5px solid #000000; box-shadow: 3px 3px 0px 0px #000000;">
          <button
            title="Show Original"
            @click=${() => this.setPreset(0)}
            style=${this.renderStyleObject(presetBtnStyle(isOriginalActive, "#1D3557"))}
          >
            ${iconEye(14, isOriginalActive ? "#FFFFFF" : "#000000")}
          </button>

          <button
            title="50/50 Split"
            @click=${() => this.setPreset(50)}
            style=${this.renderStyleObject(presetBtnStyle(isSplitActive, "#2A9D8F"))}
          >
            ${iconSplit(14, isSplitActive ? "#FFFFFF" : "#000000")}
          </button>

          <button
            title="Show Painting"
            @click=${() => this.setPreset(100)}
            style=${this.renderStyleObject(presetBtnStyle(isCartoonActive, "#E63946"))}
          >
            ${iconSparkles(14, isCartoonActive ? "#FFFFFF" : "#000000")}
          </button>
        </div>

        <!-- Slider Canvas -->
        <div
          ${(el: Element) => (this.containerRef = el as HTMLDivElement)}
          @mousedown=${this.handleMouseDown}
          @touchstart=${this.handleTouchStart}
          style=${this.renderStyleObject(containerStyle)}
        >
          <!-- Underlayer: Original Image -->
          <img
            src="${this.originalUrl}"
            alt="Original ${this.altText}"
            style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; pointer-events: none;"
          />

          <!-- Top Layer: Cartoon Version -->
          <div style=${this.renderStyleObject(cartoonLayerStyle)}>
            <img
              src="${this.cartoonUrl}"
              alt="Cartoon ${this.altText}"
              style=${this.renderStyleObject(cartoonImgStyle)}
            />
          </div>

          <!-- Divider Handle -->
          <div style=${this.renderStyleObject(dividerStyle)}>
            <div style=${this.renderStyleObject(handleStyle)}>
              ${iconSplit(20, "#FFFFFF")}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderStyleObject(styleObj: Record<string, string | number>): string {
    return Object.entries(styleObj)
      .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}: ${v};`)
      .join(" ");
  }
}
