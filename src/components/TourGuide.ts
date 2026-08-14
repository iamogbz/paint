import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { SignalElement } from "../utils/SignalElement";
import {
  iconImage,
  iconFolderOpen,
  iconDownload,
  iconZoomIn,
  iconZoomOut,
  iconMove,
  iconRotateCcw,
  iconPaintbrush,
  iconPalette,
  iconCheck,
  iconChevronRight,
  iconChevronLeft,
  iconX,
  iconSparkles,
  iconPaintBucket,
} from "./icons";

// Dev Note: Keep these instructions updated as features are added/removed/modified.
// If you add or modify a control button or interaction, update the tour slides accordingly.

@customElement("app-tour")
export class AppTour extends SignalElement {
  @state() private currentStep = 0;
  @state() private isVisible = false;

  private steps = [
    {
      title: "Welcome to PAINT by COLOURS!",
      description:
        "Transform any photo into a vibrant paint-by-numbers canvas, or paint today's curated Daily Challenge. Let's take a quick tour of the features!",
      icon: iconPaintBucket(48, "#E63946"),
    },
    {
      title: "Starting a Painting",
      description:
        "Upload any photo from your device via click or drag-and-drop to automatically generate a custom canvas and palette, or jump straight into the Daily Challenge.",
      icon: iconImage(48, "#2A9D8F"),
    },
    {
      title: "Navigating the Canvas",
      description:
        "Zoom smoothly from 50% to 800% using the Zoom buttons, mouse scroll wheel, or pinch gestures. Pan around freely by dragging directly on the canvas or dragging from the center Pan button.",
      icon: html`
        <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
          ${iconZoomOut(20, "#000000")}
          ${iconMove(44, "#000000")}
          ${iconZoomIn(20, "#000000")}
        </div>
      `,
    },
    {
      title: "Painting & Smart Guides",
      description:
        "Select a color swatch and tap a region to fill it, or drag the color swatch directly onto the canvas! High-contrast outlines guide you to matching regions, with 3× thicker borders highlighting misplaced colors.",
      icon: iconPaintbrush(48, "#E63946"),
    },
    {
      title: "Color Palette & Progress",
      description:
        "The palette arranges colors by frequency. Each swatch shows real-time progress counters (painted vs. total regions) and receives a completion checkmark once 100% filled. Tap any swatch to copy its HEX code.",
      icon: iconCheck(48, "#2A9D8F"),
    },
    {
      title: "Custom Colours & Picker",
      description:
        "Want to add your own colors? Tap the Picker swatch to open the 360° Color Wheel, adjust brightness, or input custom HEX codes. Added custom swatches can be removed anytime with the trash button.",
      icon: iconPalette(48, "#8338EC"),
    },
    {
      title: "Fixing Mistakes & Eraser",
      description:
        "Made a mistake? Click the Undo button to step backward through your recent strokes. You can also use the Eraser swatch (or click the active color to deselect) to clear regions back to white.",
      icon: iconRotateCcw(48, "#000000"),
    },
    {
      title: "Gallery & High-Res Save",
      description:
        "Click the yellow Gallery icon to browse saved paintings, rename them, switch active artwork, or delete old ones. Click the green Save button anytime to download a crisp, clean PNG of your painting.",
      icon: html`
        <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
          ${iconFolderOpen(40, "#F4A261")}
          ${iconDownload(28, "#2A9D8F")}
        </div>
      `,
    },
    {
      title: "Ready, Set, Paint!",
      description:
        "Unleash your creativity, relax, and bring your artworks to life one color at a time. Have fun painting your masterpiece!",
      icon: iconSparkles(48, "#2A9D8F"),
    },
  ];

  private handleOpenTour = () => {
    this.currentStep = 0;
    this.isVisible = true;
  };

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("open-tour-guide", this.handleOpenTour);
    if (!localStorage.getItem("tour-completed")) {
      setTimeout(() => {
        this.isVisible = true;
      }, 500);
    }
  }

  disconnectedCallback() {
    window.removeEventListener("open-tour-guide", this.handleOpenTour);
    super.disconnectedCallback();
  }

  private nextStep() {
    if (this.currentStep < this.steps.length - 1) {
      this.currentStep++;
    } else {
      this.finishTour();
    }
  }

  private prevStep() {
    if (this.currentStep > 0) {
      this.currentStep--;
    }
  }

  private goToStep(stepIndex: number) {
    if (stepIndex >= 0 && stepIndex < this.steps.length) {
      this.currentStep = stepIndex;
    }
  }

  private finishTour() {
    this.isVisible = false;
    localStorage.setItem("tour-completed", "true");
  }

  render() {
    if (!this.isVisible) return html``;

    const currentSlide = this.steps[this.currentStep];

    const overlayStyle = {
      position: "fixed" as const,
      inset: 0,
      zIndex: 20000,
      backgroundColor: "rgba(0, 0, 0, 0.75)",
      backdropFilter: "blur(8px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1rem",
      boxSizing: "border-box" as const,
    };

    const modalStyle = {
      backgroundColor: "#FFFFFF",
      border: "4px solid #000000",
      width: "100%",
      maxWidth: "500px",
      borderRadius: "32px",
      padding: "2rem",
      boxShadow: "10px 10px 0px 0px #000000",
      display: "flex",
      flexDirection: "column" as const,
      alignItems: "center",
      textAlign: "center" as const,
      position: "relative" as const,
      boxSizing: "border-box" as const,
    };

    const closeBtnStyle = {
      position: "absolute" as const,
      top: "1rem",
      right: "1rem",
      width: "36px",
      height: "36px",
      borderRadius: "50%",
      backgroundColor: "#FFFFFF",
      border: "2px solid #000000",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      boxShadow: "2px 2px 0px 0px #000000",
    };

    const navBtnStyle = (disabled: boolean) => ({
      width: "48px",
      height: "48px",
      borderRadius: "50%",
      backgroundColor: disabled ? "#E5E7EB" : "#FFD166",
      border: "3px solid #000000",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: disabled ? "default" : "pointer",
      opacity: disabled ? 0.5 : 1,
      boxShadow: disabled ? "none" : "3px 3px 0px 0px #000000",
      transition: "all 0.15s ease",
    });

    const progressDotsStyle = {
      display: "flex",
      gap: "0.5rem",
      alignItems: "center",
      flexWrap: "wrap" as const,
      justifyContent: "center",
    };

    return html`
      <div style=${this.renderStyleObject(overlayStyle)}>
        <div style=${this.renderStyleObject(modalStyle)}>
          <button @click=${this.finishTour} style=${this.renderStyleObject(closeBtnStyle)} title="Skip Tour">
            ${iconX(16, "#000000")}
          </button>
          
          <div style="margin-bottom: 1.5rem; display: flex; justify-content: center; align-items: center; width: 96px; height: 96px; background-color: rgba(0,0,0,0.05); border-radius: 50%; border: 3px solid rgba(0,0,0,0.1);">
            ${currentSlide.icon}
          </div>
          
          <h2 style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.5rem; font-weight: 900; color: #3D2314; margin: 0 0 1rem 0;">
            ${currentSlide.title}
          </h2>
          
          <p style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1rem; color: #4A2810; font-weight: 600; line-height: 1.5; margin: 0 0 2rem 0; min-height: 4.5rem;">
            ${currentSlide.description}
          </p>
          
          <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
            <button 
              @click=${this.prevStep} 
              style=${this.renderStyleObject(navBtnStyle(this.currentStep === 0))}
              ?disabled=${this.currentStep === 0}
              title="Previous"
            >
              ${iconChevronLeft(24, "#000000")}
            </button>
            
            <div style=${this.renderStyleObject(progressDotsStyle)}>
              ${this.steps.map((_, i) => html`
                <button
                  @click=${() => this.goToStep(i)}
                  style="width: 10px; height: 10px; border-radius: 50%; background-color: ${i === this.currentStep ? "#E63946" : "#D1D5DB"}; border: 1.5px solid ${i === this.currentStep ? "#000000" : "rgba(0,0,0,0.15)"}; padding: 0; cursor: pointer; transition: all 0.15s ease;"
                  title="Go to step ${i + 1}"
                ></button>
              `)}
            </div>
            
            <button 
              @click=${this.nextStep} 
              style=${this.renderStyleObject(navBtnStyle(false))}
              title="Next"
            >
              ${this.currentStep === this.steps.length - 1 ? iconCheck(24, "#000000") : iconChevronRight(24, "#000000")}
            </button>
          </div>
          
          ${this.currentStep === this.steps.length - 1 ? html`
            <button 
              @click=${this.finishTour}
              style="margin-top: 1.5rem; width: 100%; background-color: #2A9D8F; color: #FFFFFF; font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 900; padding: 0.75rem 1.5rem; border-radius: 20px; border: 3px solid #000000; box-shadow: 4px 4px 0px 0px #000000; font-size: 1rem; text-transform: uppercase; cursor: pointer; transition: all 0.15s ease;"
            >
              Let's Paint!
            </button>
          ` : ""}
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


