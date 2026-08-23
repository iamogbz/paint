import { html } from "lit";
import { customElement } from "lit/decorators.js";
import { getAllDailyChallenges, SampleImage } from "../data/dailyChallenge";
import { handleImageSelected, isDailyChallengeModalOpenSignal } from "../state/store";
import { SignalElement } from "../utils/SignalElement";
import { iconX, iconCalendar } from "./icons";

@customElement("daily-challenge-modal")
export class DailyChallengeModal extends SignalElement {
  private challenges: SampleImage[] = [];

  connectedCallback() {
    super.connectedCallback();
    this.challenges = getAllDailyChallenges(10);
  }

  private handleSelectChallenge(challenge: SampleImage) {
    // We treat daily challenges as initial images that need to be processed
    handleImageSelected(challenge.dataUrl, challenge.name);
    isDailyChallengeModalOpenSignal.set(false);
  }

  private renderStyleObject(styleObj: Record<string, string | number>): string {
    return Object.entries(styleObj)
      .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}: ${v};`)
      .join(" ");
  }

  render() {
    const isOpen = isDailyChallengeModalOpenSignal.get();
    if (!isOpen) return html``;

    const overlayStyle = {
      position: "fixed",
      top: 0,
      left: 0,
      width: "100vw",
      height: "100vh",
      backgroundColor: "rgba(0, 0, 0, 0.4)",
      backdropFilter: "blur(0.5rem)",
      WebkitBackdropFilter: "blur(0.5rem)",
      zIndex: 9999,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1rem",
      boxSizing: "border-box" as const,
    };

    const modalStyle = {
      backgroundColor: "#FAF8F5",
      borderRadius: "24px",
      width: "100%",
      maxWidth: "800px",
      maxHeight: "90vh",
      display: "flex",
      flexDirection: "column",
      boxShadow: "0.5rem 0.5rem 0 0 #000000",
      border: "3px solid #000000",
      overflow: "hidden",
    };

    const transparentImgCss = 'url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><rect x="0" y="0" width="1" height="1" fill="%23E0E0E0"/><rect x="1" y="1" width="1" height="1" fill="%23E0E0E0"/><rect x="1" y="0" width="1" height="1" fill="%23FFFFFF"/><rect x="0" y="1" width="1" height="1" fill="%23FFFFFF"/></svg>\')';

    return html`
      <div style=${this.renderStyleObject(overlayStyle)} @click=${() => isDailyChallengeModalOpenSignal.set(false)}>
        <div style=${this.renderStyleObject(modalStyle)} @click=${(e: Event) => e.stopPropagation()}>
          <!-- Header -->
          <div style="padding: 1.25rem 1.5rem; border-bottom: 3px solid #000000; display: flex; align-items: center; justify-content: space-between; background-color: #E9C46A;">
            <h2 style="margin: 0; font-size: 1.5rem; font-weight: 900; color: #000000; display: flex; align-items: center; gap: 0.5rem;">${iconCalendar(24, "#000000")} Daily Challenges</h2>
            <button @click=${() => isDailyChallengeModalOpenSignal.set(false)} style="background: none; border: none; cursor: pointer; padding: 0.25rem; display: flex; align-items: center; justify-content: center; border-radius: 50%; hover:bg-black/10 transition-colors">${iconX(24, "#000000")}</button>
          </div>

          <!-- Flex Gallery -->
          <div style="flex: 1; overflow-y: auto; padding: 1.5rem; display: flex; flex-wrap: wrap; justify-content: center; gap: 1.5rem; background-color: #FAF8F5;">
            ${this.challenges.map((challenge) => {
              return html`
                <div style="width: 140px; flex-grow: 1; max-width: 200px; display: flex; flex-direction: column; background-color: #FFFFFF; border: 3px solid #000000; border-radius: 16px; overflow: hidden; box-shadow: 4px 4px 0 0 #000000; cursor: pointer; transition: transform 0.1s ease-in-out;" @click=${() => this.handleSelectChallenge(challenge)} onmouseover="this.style.transform='translate(-2px, -2px)'; this.style.boxShadow='6px 6px 0 0 #000000';" onmouseout="this.style.transform='translate(0, 0)'; this.style.boxShadow='4px 4px 0 0 #000000';">
                  <!-- Preview Image -->
                  <div style="padding-bottom: 100%; width: 100%; position: relative; border-bottom: 3px solid #000000; background-color: #f0f0f0; background-image: ${transparentImgCss}; background-size: 1rem 1rem; overflow: hidden;">
                    <img src="${challenge.dataUrl}" alt="${challenge.name}" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; pointer-events: none;" />
                  </div>
                  <!-- Details -->
                  <div style="padding: 0.75rem; display: flex; flex-direction: column; gap: 0.25rem;">
                    <h3 style="margin: 0; font-size: 0.875rem; font-weight: 900; color: #000000;">${challenge.name}</h3>
                  </div>
                </div>
              `;
            })}
          </div>
        </div>
      </div>
    `;
  }
}
