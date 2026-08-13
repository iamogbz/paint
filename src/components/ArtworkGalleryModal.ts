import { html } from "lit";
import { customElement } from "lit/decorators.js";
import { SignalElement } from "../utils/SignalElement";
import {
  isGalleryOpenSignal,
  artworksSignal,
  currentArtworkSignal,
  handleSelectArtwork,
  handleDeleteArtwork,
} from "../state/store";
import {
  iconGalleryVertical,
  iconX,
  iconCheckCircle2,
  iconDownload,
  iconTrash2,
  iconImage,
} from "./icons";
import { soundEffects } from "../utils/soundEffects";
import { downloadImage, exportArtworkCleanDataUrl } from "../utils/download";

@customElement("artwork-gallery-modal")
export class ArtworkGalleryModal extends SignalElement {
  render() {
    const isOpen = isGalleryOpenSignal.get();
    if (!isOpen) return html``;

    const artworks = artworksSignal.get();
    const activeArtworkId = currentArtworkSignal.get()?.id || null;

    const overlayStyle = {
      position: "fixed" as const,
      inset: 0,
      zIndex: 50,
      backgroundColor: "rgba(0, 0, 0, 0.6)",
      backdropFilter: "blur(8px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0.75rem",
      boxSizing: "border-box" as const,
    };

    const modalContentStyle = {
      backgroundColor: "rgba(255, 255, 255, 0.8)",
      backdropFilter: "blur(16px)",
      border: "4px solid #000000",
      width: "100%",
      maxWidth: "95vmin",
      maxHeight: "85vh",
      borderRadius: "32px",
      padding: "1rem 1.25rem",
      boxShadow: "10px 10px 0px 0px #000000",
      display: "flex",
      flexDirection: "column" as const,
      position: "relative" as const,
      overflow: "hidden",
      boxSizing: "border-box" as const,
    };

    const headerStyle = {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      paddingBottom: "1rem",
      borderBottom: "2px solid rgba(0, 0, 0, 0.2)",
    };

    const closeBtnStyle = {
      width: "2.5rem",
      height: "2.5rem",
      borderRadius: "18px",
      backgroundColor: "#FFFFFF",
      border: "3px solid #000000",
      color: "#000000",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: "900",
      boxShadow: "2px 2px 0px 0px #000000",
      cursor: "pointer",
      transition: "all 0.15s ease",
    };

    return html`
      <div style=${this.renderStyleObject(overlayStyle)}>
        <div style=${this.renderStyleObject(modalContentStyle)}>
          <!-- Header -->
          <div style=${this.renderStyleObject(headerStyle)}>
            <div style="display: flex; align-items: center; gap: 0.625rem;">
              <div style="width: 2.5rem; height: 2.5rem; border-radius: 18px; background-color: #FFD166; border: 3px solid #000000; display: flex; align-items: center; justify-content: center; color: #000000; box-shadow: 2px 2px 0px 0px #000000;">
                ${iconGalleryVertical(20, "#000000")}
              </div>
              <div>
                <h2 style="font-size: 1.25rem; font-weight: 900; font-style: italic; color: #4A2810; margin: 0; letter-spacing: -0.02em;">
                  Existing Paintings
                </h2>
                <p style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: #4A2810; margin: 0;">
                  ${artworks.length} saved ${artworks.length === 1 ? "artwork" : "artworks"}
                </p>
              </div>
            </div>

            <button
              @click=${() => {
                isGalleryOpenSignal.set(false);
              }}
              style=${this.renderStyleObject(closeBtnStyle)}
            >
              ${iconX(20, "#000000")}
            </button>
          </div>

          <!-- Gallery List -->
          <div style="flex: 1; overflow-y: auto; padding: 1rem 0; display: flex; flex-direction: column; gap: 0.75rem;">
            ${artworks.length === 0
              ? html`
                  <div style="text-align: center; color: #4A2810; font-weight: 700; font-size: 0.875rem; font-style: italic;">
                    An empty canvas is an invitation<br />to start your journey with a painting
                  </div>
                `
              : ""}
            ${artworks.map((art) => {
              const isActive = art.id === activeArtworkId;
              const dateStr = new Date(art.createdAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });
              const usedColorsCount = art.colorStats.filter((s) => s.count > 0).length;

              const validStats = art.colorStats
                .filter(
                  (s) => s.count > 0 && s.color.category !== "Neutrals & Outlines"
                )
                .sort((a, b) => b.count - a.count);
              
              const categoryMap = new Map<string, typeof validStats>();
              for (const stat of validStats) {
                if (!categoryMap.has(stat.color.category)) {
                  categoryMap.set(stat.color.category, []);
                }
                categoryMap.get(stat.color.category)!.push(stat);
              }

              const displayStats: typeof validStats = [];
              
              // 1. Pick at least one from each category present
              for (const stats of categoryMap.values()) {
                if (displayStats.length < 8) {
                  displayStats.push(stats[0]);
                }
              }

              // 2. Fill the rest up to 8 colors
              if (displayStats.length < 8) {
                for (const stat of validStats) {
                  if (displayStats.length >= 8) break;
                  if (!displayStats.includes(stat)) {
                    displayStats.push(stat);
                  }
                }
              }

              const itemCardStyle = {
                padding: "0.75rem",
                borderRadius: "24px",
                border: isActive ? "3px solid #E63946" : "3px solid #000000",
                boxShadow: isActive ? "4px 4px 0px 0px #E63946" : "3px 3px 0px 0px #000000",
                display: "flex",
                flexDirection: "row" as const,
                alignItems: "center",
                gap: "0.75rem",
                backgroundColor: "rgba(255, 255, 255, 0.95)",
                flexWrap: "wrap" as const,
              };

              const activeBadgeStyle = {
                position: "absolute" as const,
                top: "0.375rem",
                left: "0.375rem",
                backgroundColor: "#E63946",
                color: "#FFFFFF",
                fontSize: "0.625rem",
                fontWeight: "900",
                padding: "0.125rem 0.5rem",
                borderRadius: "9999px",
                border: "1px solid #FFFFFF",
                textTransform: "uppercase" as const,
              };

              const selectBtnStyle = {
                padding: "0.375rem 0.75rem",
                borderRadius: "16px",
                fontSize: "0.75rem",
                fontWeight: "900",
                border: "2.5px solid #000000",
                display: "flex",
                alignItems: "center",
                gap: "0.25rem",
                textTransform: "uppercase" as const,
                transition: "all 0.15s ease",
                boxShadow: "2px 2px 0px 0px #000000",
                backgroundColor: isActive ? "#E63946" : "#FFD166",
                color: isActive ? "#FFFFFF" : "#000000",
                cursor: "pointer",
              };

              return html`
                <div style=${this.renderStyleObject(itemCardStyle)}>
                  <!-- Thumbnail -->
                  <div
                    @click=${() => {
                      handleSelectArtwork(art);
                      isGalleryOpenSignal.set(false);
                    }}
                    style="width: 7rem; height: 7rem; border-radius: 18px; overflow: hidden; border: 2.5px solid rgba(0, 0, 0, 0.25); position: relative; cursor: pointer; flex-shrink: 0; background-color: rgba(0,0,0,0.05);"
                  >
                    <img
                      src="${exportArtworkCleanDataUrl(art)}"
                      alt="${art.name}"
                      style="width: 100%; height: 100%; object-fit: cover;"
                    />
                    ${isActive
                      ? html`<div style=${this.renderStyleObject(activeBadgeStyle)}>ACTIVE</div>`
                      : ""}
                  </div>

                  <!-- Details -->
                  <div style="flex: 1; min-width: 200px; display: flex; flex-direction: column; justify-content: space-between;">
                    <div>
                      <h3 style="font-weight: 900; color: #000000; font-size: 1rem; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${art.name}
                      </h3>
                      <p style="font-size: 0.75rem; color: #4A2810; font-weight: 700; margin: 0.25rem 0 0 0;">
                        Created: ${dateStr} • ${art.width}×${art.height}px
                      </p>

                      <!-- Color Swatches -->
                      <div style="display: flex; align-items: center; gap: 0.25rem; margin-top: 0.5rem; flex-wrap: wrap;">
                        <span style="font-size: 0.625rem; font-weight: 900; color: #000000; text-transform: uppercase; margin-right: 0.25rem;">
                          ${usedColorsCount} colors:
                        </span>
                        ${displayStats.map(
                            (stat) => html`
                              <div
                                style="width: 1rem; height: 1rem; border-radius: 9999px; border: 1px solid #000000; background-color: ${stat.color.hexCode};"
                                title="${stat.color.name}: ${stat.percentage}%"
                              ></div>
                            `
                          )}
                      </div>
                    </div>

                    <!-- Actions -->
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-top: 0.75rem; padding-top: 0.5rem; border-top: 1px solid rgba(0,0,0,0.15);">
                      <button
                        @click=${() => {
                          handleSelectArtwork(art);
                          isGalleryOpenSignal.set(false);
                        }}
                        style=${this.renderStyleObject(selectBtnStyle)}
                      >
                        ${iconCheckCircle2(14, isActive ? "#FFFFFF" : "#000000")}
                        ${isActive ? "Currently Viewing" : "Display on Easel"}
                      </button>

                      <div style="display: flex; align-items: center; gap: 0.375rem;">
                        <!-- Download -->
                        <button
                          @click=${() => {
                            const cleanDataUrl = exportArtworkCleanDataUrl(art);
                            downloadImage(cleanDataUrl, `paint_by_numbers_${art.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}_paint.ogbizi.com.png`);
                          }}
                          style="padding: 0.5rem; border-radius: 14px; background-color: #FFFFFF; border: 2px solid #000000; color: #000000; boxShadow: 2px 2px 0px 0px #000000; cursor: pointer;"
                          title="Download Artwork"
                        >
                          ${iconDownload(16, "#000000")}
                        </button>

                        <!-- Delete -->
                        <button
                          @click=${() => {
                            handleDeleteArtwork(art.id);
                          }}
                          style="padding: 0.5rem; border-radius: 14px; background-color: #FFFFFF; border: 2px solid #000000; color: #000000; boxShadow: 2px 2px 0px 0px #000000; cursor: pointer;"
                          title="Delete Artwork"
                        >
                          ${iconTrash2(16, "#000000")}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              `;
            })}
          </div>

          <!-- Footer -->
          <div style="padding-top: 0.75rem; border-top: 2px solid rgba(0,0,0,0.2); display: flex; align-items: center; justify-content: space-between;">
            <button
              @click=${() => {
                isGalleryOpenSignal.set(false);
                currentArtworkSignal.set(null);
                setTimeout(() => {
                  const easel = document.querySelector("easel-board") as any;
                  easel?.triggerFilePicker?.();
                }, 100);
              }}
              style="background-color: #2A9D8F; color: #FFFFFF; font-weight: 900; padding: 0.625rem 1rem; border-radius: 20px; border: 3px solid #000000; box-shadow: 3px 3px 0px 0px #000000; font-size: 0.75rem; display: flex; align-items: center; gap: 0.5rem; text-transform: uppercase; cursor: pointer;"
            >
              ${iconImage(16, "#FFFFFF")} Start a new painting
            </button>

            <button
              @click=${() => {
                isGalleryOpenSignal.set(false);
              }}
              style="background-color: #FFFFFF; color: #000000; border: 2.5px solid #000000; font-weight: 900; padding: 0.625rem 1.25rem; border-radius: 20px; font-size: 0.75rem; box-shadow: 2px 2px 0px 0px #000000; text-transform: uppercase; cursor: pointer;"
            >
              Close
            </button>
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
