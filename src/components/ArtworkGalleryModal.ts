import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { SignalElement } from "../utils/SignalElement";
import { ProcessedArtwork } from "../types";
import { isGalleryOpenSignal, artworksSignal, currentArtworkSignal, handleSelectArtwork, handleDeleteArtwork, handleRenameArtwork, artworkIdsSortedSignal } from "../state/store";
import { iconGalleryVertical, iconX, iconCheckCircle2, iconDownload, iconTrash2, iconImage, iconEdit2 } from "./icons";
import { exportArtworkSvgDataUrl } from "../utils/download";
import { TRANSPARENT_HEX, transparentImgCss } from "../utils/constants";
import "./DownloadPopup";

@customElement("artwork-gallery-modal")
export class ArtworkGalleryModal extends SignalElement {
  @state()
  private editingId: string | null = null;
  @state()
  private editNameValue: string = "";

  @state() private showDownloadPopup = false;
  @state() private downloadingArtwork: ProcessedArtwork | null = null;

  render() {
    const isOpen = isGalleryOpenSignal.get();
    if (!isOpen) return html``;

    const artworks = artworksSignal.get();
    const artworksSortedIds = artworkIdsSortedSignal.get();
    const activeArtworkId = currentArtworkSignal.get()?.id || null;

    const overlayStyle = {
      position: "fixed" as const,
      inset: 0,
      zIndex: 15000,
      backgroundColor: "rgba(255,255,255, 0.6)",
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
              <div style="width: 2.5rem; height: 2.5rem; border-radius: 18px; background-color: #FFD166; border: 3px solid #000000; display: flex; align-items: center; justify-content: center; color: #000000; box-shadow: 2px 2px 0px 0px #000000;">${iconGalleryVertical(20, "#000000")}</div>
              <div>
                <h2 style="font-size: 1.25rem; font-weight: 900; font-style: italic; color: #4A2810; margin: 0; letter-spacing: -0.02em;">Existing Paintings</h2>
                <p style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: #4A2810; margin: 0;">${artworksSortedIds.length} saved ${artworksSortedIds.length === 1 ? "artwork" : "artworks"}</p>
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
            ${artworksSortedIds.length === 0 ? html` <div style="text-align: center; color: #4A2810; font-weight: 700; font-size: 0.875rem; font-style: italic;">An empty canvas is an invitation<br />to start your journey with a painting</div> ` : ""}
            ${artworksSortedIds.map((artId) => {
              const art = artworks.get(artId);
              const isActive = art.id === activeArtworkId;
              const dateStr = new Date(art.createdAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });
              // TODO: decide if showing the colors the user has place on the artwork is worth it
              const usedColorsByCount = art.colorsAssignedToRegions
                .entries()
                .map(([hexCode, regionIds]) => [regionIds.size, hexCode] as const)
                .filter(([size, hexCode]) => hexCode !== TRANSPARENT_HEX && size !== 0);
              const usedColorsSorted = Array.from(usedColorsByCount).sort();
              const colorCountToDisplay = 6;
              const stepSize = Math.max(1, Math.floor(usedColorsSorted.length / colorCountToDisplay));
              const colorsToDisplay = new Array(colorCountToDisplay)
                .fill(null)
                .map((_, i) => usedColorsSorted[i * stepSize]?.[1])
                .filter(Boolean);

              const itemCardStyle = {
                padding: "0.75rem",
                borderRadius: "24px",
                border: isActive ? "3px solid #E63946" : "3px solid #000000",
                boxShadow: isActive ? "0px 4px 0px 0px #E63946" : "0px 3px 0px 0px #000000",
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
                    style="width: 7rem; height: 7rem; border-radius: 18px; overflow: hidden; border: 2.5px solid rgba(0, 0, 0, 0.25); position: relative; cursor: pointer; flex-shrink: 0; background-color: rgba(0,0,0,0.05); background-size: 0.5rem 0.5rem; background-image: ${transparentImgCss};"
                  >
                    <img src="${exportArtworkSvgDataUrl(art)}" alt="${art.name}" style="width: 100%; height: 100%; object-fit: cover;" />
                    ${isActive ? html`<div style=${this.renderStyleObject(activeBadgeStyle)}>ACTIVE</div>` : ""}
                  </div>

                  <!-- Details -->
                  <div style="flex: 1; min-width: 200px; display: flex; flex-direction: column; justify-content: space-between;">
                    <div>
                      ${this.editingId === art.id
                        ? html`
                            <input
                              type="text"
                              .value="${this.editNameValue}"
                              @input="${(e: Event) => {
                                this.editNameValue = (e.target as HTMLInputElement).value;
                              }}"
                              @keydown="${(e: KeyboardEvent) => {
                                if (e.key === "Enter") {
                                  handleRenameArtwork(art.id, this.editNameValue || "Untitled");
                                  this.editingId = null;
                                } else if (e.key === "Escape") {
                                  this.editingId = null;
                                }
                              }}"
                              @blur="${() => {
                                handleRenameArtwork(art.id, this.editNameValue || "Untitled");
                                this.editingId = null;
                              }}"
                              style="font-weight: 900; color: #000000; font-size: 1rem; margin: 0; padding: 2px 4px; border: 2px solid #000; border-radius: 4px; width: 100%; box-sizing: border-box;"
                              autofocus
                            />
                          `
                        : html`
                            <h3
                              style="display: flex; align-items: center; font-weight: 900; color: #000000; font-size: 1rem; margin: 0; cursor: pointer; width: 100%;"
                              @click="${() => {
                                if (!art.name.startsWith("Daily Challenge")) {
                                  this.editingId = art.id;
                                  this.editNameValue = art.name;
                                }
                              }}"
                            >
                              <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${art.name}</span>
                              ${!art.name.startsWith("Daily Challenge")
                                ? html`
                                    <button
                                      style="margin-left: 0.5rem; background: none; border: none; cursor: pointer; padding: 0; display: flex; align-items: center; flex-shrink: 0;"
                                      title="Rename"
                                      @click="${(e: Event) => {
                                        e.stopPropagation();
                                        this.editingId = art.id;
                                        this.editNameValue = art.name;
                                      }}"
                                    >
                                      ${iconEdit2(14, "#4A2810")}
                                    </button>
                                  `
                                : ""}
                            </h3>
                          `}
                      <p style="font-size: 0.75rem; color: #4A2810; font-weight: 700; margin: 0.25rem 0 0 0;">Created: ${dateStr} • ${art.width}×${art.height}px</p>

                      <!-- Color Swatches -->
                      <div style="display: flex; align-items: center; gap: 0.25rem; margin-top: 0.5rem; flex-wrap: wrap;">
                        <span style="font-size: 0.625rem; font-weight: 900; color: #000000; text-transform: uppercase; margin-right: 0.25rem;"> ${usedColorsSorted.length} colors: </span>
                        ${colorsToDisplay.map((hexCode) => html` <div style="width: 1rem; height: 1rem; border-radius: 9999px; border: 1px solid #000000; background-color: ${hexCode};" title="${hexCode}"></div> `)}
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
                        ${iconCheckCircle2(14, isActive ? "#FFFFFF" : "#000000")} ${isActive ? "Resume" : "Display"}
                      </button>

                      <div style="display: flex; align-items: center; gap: 0.375rem;">
                        <!-- Download -->
                        <button
                          @click=${() => {
                            this.downloadingArtwork = art;
                            this.showDownloadPopup = true;
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
              id="gallery-new-painting-btn"
              @click=${() => {
                isGalleryOpenSignal.set(false);
                handleSelectArtwork(null);
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
      <download-popup .artwork=${this.downloadingArtwork} ?isOpen=${this.showDownloadPopup} @close=${() => (this.showDownloadPopup = false)}></download-popup>
    `;
  }

  private renderStyleObject(styleObj: Record<string, string | number>): string {
    return Object.entries(styleObj)
      .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}: ${v};`)
      .join(" ");
  }
}
