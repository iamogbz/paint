import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { SignalElement } from "../utils/SignalElement";
import { isColorPickerOpenSignal, currentArtworkSignal, activeHighlightColorSignal, handleSelectArtwork, pushUndoState, saveCurrentArtworkProgress } from "../state/store";
import { soundEffects } from "../utils/soundEffects";
import { iconX, iconPalette, iconPlus } from "./icons";
import { hsvToRgb, rgbToHex, hexToRgb, rgbToHsv } from "../utils/color";
import { TRANSPARENT_HEX } from "../utils/constants";

const PRESET_HUES = ["#E63946", "#F4A261", "#E9C46A", "#2A9D8F", "#4EA8DE", "#3A86FF", "#8338EC", "#FF006E"];

@customElement("radial-color-picker-modal")
export class RadialColorPickerModal extends SignalElement {
  @state() private hue: number = 0; // 0 - 360
  @state() private sat: number = 0.85; // 0 - 1
  @state() private val: number = 0.95; // 0 - 1
  @state() private hexInput: string = "#E63946";
  @state() private isDraggingWheel: boolean = false;

  private wheelSize = 220;
  private wheelRadius = 100; // size/2 - 10px padding

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && isColorPickerOpenSignal.get()) {
      this.closeModal();
    }
  };

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("keydown", this.handleKeyDown);
  }

  disconnectedCallback() {
    window.removeEventListener("keydown", this.handleKeyDown);
    super.disconnectedCallback();
  }

  protected updated(changedProperties: Map<string | number | symbol, unknown>) {
    super.updated(changedProperties);
    if (isColorPickerOpenSignal.get()) {
      this.drawWheelCanvas();
    }
  }

  private closeModal = () => {
    isColorPickerOpenSignal.set(false);
  };

  private drawWheelCanvas() {
    const canvas = this.renderRoot?.querySelector("#radial-color-canvas") as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const size = this.wheelSize;
    if (canvas.width !== size * dpr) {
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const radius = this.wheelRadius;

    const imgData = ctx.createImageData(size * dpr, size * dpr);
    const data = imgData.data;

    for (let py = 0; py < size * dpr; py++) {
      for (let px = 0; px < size * dpr; px++) {
        const x = px / dpr;
        const y = py / dpr;
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.hypot(dx, dy);

        const idx = (py * size * dpr + px) * 4;
        if (dist <= radius) {
          const angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
          const sat = Math.min(1, dist / radius);
          const [r, g, b] = hsvToRgb(angle, sat, 1.0);

          const edgeDist = radius - dist;
          const alpha = edgeDist < 1.5 ? Math.max(0, Math.min(1, edgeDist / 1.5)) * 255 : 255;

          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = alpha;
        } else {
          data[idx + 3] = 0;
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
    ctx.restore();
  }

  private updateColorFromWheelPoint(clientX: number, clientY: number) {
    const wheelContainer = this.renderRoot?.querySelector("#radial-wheel-container") as HTMLElement;
    if (!wheelContainer) return;

    const rect = wheelContainer.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.hypot(dx, dy);

    const sat = Math.min(1, dist / this.wheelRadius);
    const hue = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;

    this.hue = hue;
    this.sat = sat;

    const [r, g, b] = hsvToRgb(this.hue, this.sat, this.val);
    this.hexInput = rgbToHex(r, g, b).substring(0, 7);
  }

  private handleWheelPointerDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();

    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    this.isDraggingWheel = true;
    this.updateColorFromWheelPoint(e.clientX, e.clientY);

    const onPointerMove = (moveEvt: PointerEvent) => {
      if (this.isDraggingWheel) {
        this.updateColorFromWheelPoint(moveEvt.clientX, moveEvt.clientY);
      }
    };

    const onPointerUp = (upEvt: PointerEvent) => {
      this.isDraggingWheel = false;
      target.releasePointerCapture(upEvt.pointerId);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  };

  private handleValSliderChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const valPercent = parseFloat(target.value);
    this.val = valPercent / 100;
    const [r, g, b] = hsvToRgb(this.hue, this.sat, this.val);
    this.hexInput = rgbToHex(r, g, b).substring(0, 7);
  };

  private handleHexInputChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const rawVal = target.value;
    this.hexInput = rawVal;

    const rgb = hexToRgb(rawVal);
    if (rgb) {
      const [h, s, v] = rgbToHsv(rgb[0], rgb[1], rgb[2]);
      this.hue = h;
      this.sat = s;
      this.val = v;
    }
  };

  private selectPreset = (hex: string) => {
    soundEffects.playPop();
    this.hexInput = hex;
    const rgb = hexToRgb(hex);
    if (rgb) {
      const [h, s, v] = rgbToHsv(rgb[0], rgb[1], rgb[2]);
      this.hue = h;
      this.sat = s;
      this.val = v;
    }
  };

  private handleAddColor = () => {
    const [r, g, b] = hsvToRgb(this.hue, this.sat, this.val);
    const hex = rgbToHex(r, g, b);
    const currentArtwork = currentArtworkSignal.get();
    if (!currentArtwork) {
      this.closeModal();
      return;
    }

    const isCoreColor = currentArtwork.colorsAssignedToRegions.get(hex)?.size > 0;

    // is not a core colour so is removable
    if (!isCoreColor && hex !== TRANSPARENT_HEX) {
      pushUndoState(currentArtwork);
      // empty assignment shows not a core color
      currentArtwork.colorsAssignedToRegions.set(hex, new Set());
      saveCurrentArtworkProgress(currentArtwork);
    }

    activeHighlightColorSignal.set(hex);
    soundEffects.playPop();
    this.closeModal();
  };

  render() {
    const isOpen = isColorPickerOpenSignal.get();
    if (!isOpen) return html``;

    const [r, g, b] = hsvToRgb(this.hue, this.sat, this.val);
    const currentHex = rgbToHex(r, g, b);
    const [pureR, pureG, pureB] = hsvToRgb(this.hue, this.sat, 1.0);
    const pureHueHex = rgbToHex(pureR, pureG, pureB);

    // Calculate handle position on wheel
    const cx = this.wheelSize / 2;
    const cy = this.wheelSize / 2;
    const handleDist = this.sat * this.wheelRadius;
    const handleAngleRad = (this.hue * Math.PI) / 180;
    const handleX = cx + handleDist * Math.cos(handleAngleRad);
    const handleY = cy + handleDist * Math.sin(handleAngleRad);

    const overlayStyle = {
      position: "fixed" as const,
      inset: 0,
      zIndex: 16000,
      backgroundColor: "rgba(255, 255, 255, 0.6)",
      backdropFilter: "blur(8px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0.75rem",
      boxSizing: "border-box" as const,
    };

    const modalContentStyle = {
      backgroundColor: "rgba(255, 255, 255, 0.95)",
      backdropFilter: "blur(16px)",
      border: "4px solid #000000",
      width: "100%",
      maxWidth: "380px",
      borderRadius: "32px",
      padding: "1.5rem 1.25rem",
      boxShadow: "10px 10px 0px 0px #000000",
      display: "flex",
      flexDirection: "column" as const,
      alignItems: "center",
      position: "relative" as const,
      boxSizing: "border-box" as const,
      gap: "1rem",
    };

    const headerStyle = {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      width: "100%",
      paddingBottom: "0.75rem",
      borderBottom: "2px solid rgba(0, 0, 0, 0.15)",
    };

    const closeBtnStyle = {
      width: "2.25rem",
      height: "2.25rem",
      borderRadius: "14px",
      backgroundColor: "#FFFFFF",
      border: "2.5px solid #000000",
      color: "#000000",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: "900",
      boxShadow: "2px 2px 0px 0px #000000",
      cursor: "pointer",
      transition: "transform 0.15s ease",
    };

    return html`
      <div
        style=${this.renderStyleObject(overlayStyle)}
        @pointerdown=${(e: PointerEvent) => {
          if (e.target === e.currentTarget) {
            this.closeModal();
          }
        }}
      >
        <div style=${this.renderStyleObject(modalContentStyle)}>
          <!-- Header -->
          <div style=${this.renderStyleObject(headerStyle)}>
            <div style="display: flex; align-items: center; gap: 0.625rem;">
              <div style="width: 2.25rem; height: 2.25rem; border-radius: 14px; background-color: #FFD166; border: 2.5px solid #000000; display: flex; align-items: center; justify-content: center; color: #000000; box-shadow: 2px 2px 0px 0px #000000;">${iconPalette(18, "#000000")}</div>
              <div>
                <h2 style="margin: 0; font-size: 1.125rem; font-weight: 800; color: #3D2314; letter-spacing: -0.02em;">Pick a Colour</h2>
                <p style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: #4A2810; margin: 0;">OR ENTER YOUR HEX CODE</p>
              </div>
            </div>
            <button title="Close" @click=${this.closeModal} style=${this.renderStyleObject(closeBtnStyle)}>${iconX(16, "#000000")}</button>
          </div>

          <!-- Radial Wheel Container -->
          <div
            id="radial-wheel-container"
            @pointerdown=${this.handleWheelPointerDown}
            style=${this.renderStyleObject({
              position: "relative" as const,
              width: `${this.wheelSize}px`,
              height: `${this.wheelSize}px`,
              borderRadius: "50%",
              cursor: "crosshair",
              touchAction: "none",
              userSelect: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <!-- Canvas Wheel -->
            <canvas id="radial-color-canvas" style="position: absolute; inset: 0; border-radius: 50%; box-shadow: inset 0 0 0 3px #000000, 0 4px 12px rgba(0,0,0,0.15);"></canvas>

            <!-- Wheel Selector Handle -->
            <div
              style=${this.renderStyleObject({
                position: "absolute" as const,
                left: `${handleX}px`,
                top: `${handleY}px`,
                transform: "translate(-50%, -50%)",
                width: "24px",
                height: "24px",
                borderRadius: "50%",
                backgroundColor: currentHex,
                border: "3px solid #FFFFFF",
                boxShadow: "0 0 0 2px #000000, 0 3px 6px rgba(0,0,0,0.3)",
                pointerEvents: "none",
                transition: this.isDraggingWheel ? "none" : "all 0.1s ease",
              })}
            ></div>
          </div>

          <!-- Brightness / Lightness Slider -->
          <div style="width: 100%; display: flex; flex-direction: column; gap: 0.375rem;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 0.75rem; font-weight: 800; color: #3D2314;"> Brightness </span>
              <span style="font-size: 0.75rem; font-weight: 800; color: #7A5C43;"> ${Math.round(this.val * 100)}% </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              .value=${Math.round(this.val * 100)}
              @input=${this.handleValSliderChange}
              style=${this.renderStyleObject({
                width: "100%",
                height: "16px",
                borderRadius: "8px",
                border: "2px solid #000000",
                background: `linear-gradient(to right, #000000, ${pureHueHex})`,
                outline: "none",
                cursor: "pointer",
                appearance: "none",
                WebkitAppearance: "none",
              })}
            />
          </div>

          <!-- Color Preview & Hex Input -->
          <div style="width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; background-color: #F8F5F2; padding: 0.5rem 0.75rem; border-radius: 16px; border: 2px solid #000000;">
            <!-- Large Preview Chip -->
            <div
              style=${this.renderStyleObject({
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                backgroundColor: currentHex,
                border: "2.5px solid #000000",
                boxShadow: "0 2px 4px rgba(0,0,0,0.15)",
                flexShrink: 0,
              })}
            ></div>

            <!-- Hex input field -->
            <div style="display: flex; align-items: center; gap: 0.375rem; flex: 1;">
              <span style="font-weight: 900; color: #3D2314; font-size: 0.875rem;">HEX</span>
              <input type="text" maxlength="7" pattern="^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$" .value=${this.hexInput} @input=${this.handleHexInputChange} style="width: 100%; border: 2px solid #000000; border-radius: 8px; padding: 0.25rem 0.5rem; font-weight: 800; font-family: monospace; font-size: 0.875rem; color: #000000; background-color: #FFFFFF;" />
            </div>
          </div>

          <!-- Quick Palette Hints -->
          <div style="width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 0.25rem;">
            ${PRESET_HUES.map(
              (presetHex) => html`
                <button
                  @click=${() => this.selectPreset(presetHex)}
                  style=${this.renderStyleObject({
                    width: "26px",
                    height: "26px",
                    borderRadius: "50%",
                    backgroundColor: presetHex,
                    border: "2px solid #000000",
                    cursor: "pointer",
                    padding: "0",
                    transition: "transform 0.1s ease",
                    boxShadow: "1px 1px 0px #000000",
                  })}
                  title=${presetHex}
                ></button>
              `
            )}
          </div>

          <!-- Action Buttons -->
          <div style="width: 100%; display: flex; gap: 0.625rem; margin-top: 0.25rem;">
            <button @click=${this.closeModal} style="flex: 1; padding: 0.625rem; border-radius: 16px; border: 3px solid #000000; background-color: #FFFFFF; font-weight: 800; font-size: 0.875rem; color: #3D2314; cursor: pointer; box-shadow: 2px 2px 0px 0px #000000;">Cancel</button>
            <button id="confirm-add-color-swatch-btn" @click=${this.handleAddColor} style="flex: 2; padding: 0.625rem; border-radius: 16px; border: 3px solid #000000; background-color: #2A9D8F; font-weight: 900; font-size: 0.875rem; color: #FFFFFF; cursor: pointer; box-shadow: 3px 3px 0px 0px #000000; display: flex; align-items: center; justify-content: center; gap: 0.375rem;">${iconPlus(16, "#FFFFFF")} Add Swatch</button>
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
