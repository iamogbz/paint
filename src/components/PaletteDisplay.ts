import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { SignalElement } from "../utils/SignalElement";
import {
  PALETTE_COLOR,
  PaletteColor,
  UsedColorStat,
} from "../types";
import {
  selectedCategorySignal,
  activeHighlightColorSignal,
  copiedHexSignal,
} from "../state/store";
import {
  iconPalette,
  iconPaintbrush,
  iconCheck,
} from "./icons";
import { soundEffects } from "../utils/soundEffects";

const PALETTE_CATEGORIES_ALL = "All";
const PALETTE_CATEGORIES_USED = "Used Only";

@customElement("palette-display")
export class PaletteDisplay extends SignalElement {
  @property({ type: Array }) colorStats: UsedColorStat[] = [];

  private timeoutId?: number;

  private handleColorClick = (color: PaletteColor) => {
    soundEffects.playPop();
    const active = activeHighlightColorSignal.get();

    if (active?.id === color.id) {
      activeHighlightColorSignal.set(null);
    } else {
      window.clearTimeout(this.timeoutId);
      activeHighlightColorSignal.set(color);

      navigator.clipboard
        .writeText(color.hexCode)
        .then(() => {
          copiedHexSignal.set(color.hexCode);
          this.timeoutId = window.setTimeout(() => {
            copiedHexSignal.set(null);
          }, 1500);
        })
        .catch(() => {});
    }
  };

  render() {
    const selectedCat = selectedCategorySignal.get();
    const activeColor = activeHighlightColorSignal.get();
    const copiedHex = copiedHexSignal.get();

    // Map stats by color ID
    const statsMap = new Map<string, UsedColorStat>();
    (this.colorStats || []).forEach((stat) => statsMap.set(stat.color.id, stat));

    const allColors = Object.values(PALETTE_COLOR);
    const filteredColors = allColors.filter((color) => {
      const stat = statsMap.get(color.id);
      const isUsed = stat ? stat.count > 0 : false;

      if (selectedCat === PALETTE_CATEGORIES_USED) return isUsed;
      return true;
    });

    const categories = [PALETTE_CATEGORIES_ALL, PALETTE_CATEGORIES_USED];

    const containerStyle = {
      width: "100%",
      maxWidth: "42rem",
      margin: "1.5rem auto 0 auto",
      backgroundColor: "rgba(255, 255, 255, 0.4)",
      backdropFilter: "blur(16px)",
      border: "4px solid #000000",
      borderRadius: "32px",
      padding: "1rem 1.25rem",
      boxShadow: "8px 8px 0px 0px #000000",
      position: "relative" as const,
      overflow: "hidden",
      boxSizing: "border-box" as const,
    };

    const headerStyle = {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "0.5rem",
      marginBottom: "1rem",
      paddingBottom: "0.75rem",
      borderBottom: "3px solid rgba(0, 0, 0, 0.2)",
    };

    const gridStyle = {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(85px, 1fr))",
      gap: "0.75rem",
    };

    return html`
      <div id="color-palette-section" style=${this.renderStyleObject(containerStyle)}>
        <!-- Header Category Buttons -->
        <div style=${this.renderStyleObject(headerStyle)}>
          ${categories.map((cat) => {
            const isSel = selectedCat === cat;
            const btnStyle = {
              fontSize: "0.75rem",
              padding: "0.375rem 0.875rem",
              borderRadius: "9999px",
              fontWeight: "900",
              textTransform: "uppercase" as const,
              letterSpacing: "0.05em",
              transition: "all 0.15s ease",
              border: "2.5px solid #000000",
              cursor: "pointer",
              backgroundColor: isSel ? "#000000" : "rgba(255, 255, 255, 0.8)",
              color: isSel ? "#FFFFFF" : "#000000",
              boxShadow: isSel ? "2px 2px 0px 0px rgba(0, 0, 0, 0.3)" : "none",
              display: "flex",
              alignItems: "center",
              gap: "0.25rem",
            };

            return html`
              <button
                @click=${() => {
                  soundEffects.playPop();
                  selectedCategorySignal.set(cat);
                }}
                style=${this.renderStyleObject(btnStyle)}
              >
                ${cat === PALETTE_CATEGORIES_ALL
                  ? iconPalette(18, isSel ? "#FFFFFF" : "#000000")
                  : iconPaintbrush(18, isSel ? "#FFFFFF" : "#000000")}
              </button>
            `;
          })}
        </div>

        <!-- Color Swatches Grid -->
        <div style=${this.renderStyleObject(gridStyle)}>
          ${filteredColors.map((color) => {
            const stat = statsMap.get(color.id);
            const ratio = stat ? stat.percentage : 0;
            const isUsed = ratio > 0;
            const isSelected = activeColor?.id === color.id;
            const isCopied = copiedHex === color.hexCode;

            const colorCardStyle = {
              display: "flex",
              flexDirection: "column" as const,
              alignItems: "center",
              padding: "0.5rem",
              borderRadius: "1rem",
              transition: "all 0.15s ease",
              cursor: "pointer",
              border: isSelected ? "3px solid #E63946" : "3px solid transparent",
              backgroundColor: isSelected ? "rgba(254, 243, 199, 0.9)" : "transparent",
              boxShadow: isSelected ? "4px 4px 0px 0px #E63946" : "none",
              transform: isSelected ? "scale(1.05)" : "scale(1)",
              opacity: isUsed || isSelected ? "1" : "0.85",
            };

            const circleStyle = {
              width: "3.25rem",
              height: "3.25rem",
              borderRadius: "9999px",
              border: "3px solid #000000",
              boxShadow: "0 2px 4px rgba(0, 0, 0, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative" as const,
              backgroundColor: color.hexCode,
              transition: "transform 0.15s ease",
            };

            return html`
              <button
                @click=${() => this.handleColorClick(color)}
                style=${this.renderStyleObject(colorCardStyle)}
              >
                <!-- Color Circle -->
                <div style=${this.renderStyleObject(circleStyle)}>
                  ${isUsed
                    ? html`
                        <div
                          style="position: absolute; top: -4px; right: -4px; width: 20px; height: 20px; background-color: #000000; border-radius: 9999px; border: 2px solid #FFFFFF; display: flex; align-items: center; justify-content: center; color: #FFFFFF;"
                        >
                          ${iconCheck(12, "#FFFFFF")}
                        </div>
                      `
                    : ""}

                  <!-- Copied Feedback -->
                  <div
                    style="position: absolute; inset: 0; width: 50%; height: 50%; margin: auto; background-color: #FFFFFF; border-radius: 9999px; display: flex; align-items: center; justify-content: center; opacity: ${isCopied ? 1 : 0}; transition: opacity 0.3s;"
                  >
                    ${iconPaintbrush(14, "#000000")}
                  </div>
                </div>

                <!-- Color Label -->
                <span
                  style="font-size: 0.6875rem; font-weight: 900; color: #3D2314; margin-top: 0.375rem; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; line-height: 1.2;"
                >
                  ${color.name}
                </span>

                <!-- Percentage -->
                <span
                  style="font-size: 0.75rem; font-weight: ${isUsed ? "900" : "700"}; color: ${isUsed ? "#000000" : "#6B7280"};"
                >
                  ${ratio}%
                </span>
              </button>
            `;
          })}
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
