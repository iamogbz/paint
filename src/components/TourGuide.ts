import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { SignalElement } from "../utils/SignalElement";
import {
  iconImage,
  iconFolderOpen,
  iconDownload,
  iconZoomIn,
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
iconZoomOut,
} from "./icons";

// Dev Note: Keep these instructions updated as features are added/removed/modified.
// If you add a new control button, assign it a slide here.

@customElement("app-tour")
export class AppTour extends SignalElement {
  @state() private currentStep = 0;
  @state() private isVisible = false;

  private steps = [
    {
      title: "Welcome to PAINT by COLOURS!",
      description: "Let's take a quick tour of the controls so you can start painting your masterpiece.",
      icon: iconPaintBucket(48, "#E63946"),
    },
    {
      title: "Starting a Painting",
      description: "When you launch the app, you can either upload your own photo to generate a custom canvas, or start the Daily Challenge directly from the easel.",
      icon: iconImage(48, "#2A9D8F"),
    },
    {
      title: "Your Gallery & Saving",
      description: html`Click the yellow Gallery icon to view existing paintings, change their names, or start a new one. Click the green Save icon to download your painting to your device.`,
      icon: html`
        ${iconFolderOpen(48, "#F4A261")}
        ${iconDownload(24, "#2A9D8F")}`,
    },
    {
      title: "Navigating the Canvas",
      description: "Use the Zoom in/out buttons, scroll wheel or pinch to zoom on your device. To pan around, start dragging in a direction from the Pan button or simply click and drag the canvas directly.",
      icon: html`
      ${iconZoomOut(12, "#000000")}
      ${iconMove(48, "#000000")}
      ${iconZoomIn(12, "#000000")}
      `,
    },
    {
      title: "Applying Paint",
      description: "Select a color from the palette and tap on the canvas. You can also drag the selected color swatch directly onto a region! Just click the color again to deselect and the eraser is selected by default.",
      icon: iconPaintbrush(48, "#E63946"),
    },
    {
      title: "Color Modes",
      description: "Toggle between the Palette, which shows only the colors needed for this specific painting, and the Paint Bucket button (allows using any color).",
      icon: iconPalette(48, "#E63946"),
    },
    {
      title: "Track Your Progress",
      description: "Each color swatch shows your progress in number of regions painted. Once a color is fully painted, a checkmark will appear on its swatch. However this is just a guide, you are the artist!",
      icon: iconCheck(48, "#2A9D8F"),
    },
    {
      title: "Fixing Mistakes",
      description: "Made a mistake? No worries! Just click the Undo button to revert your last stroke and try again.",
      icon: iconRotateCcw(48, "#000000"),
    },
    {
      title: "Enjoy!",
      description: "Looking forward to your next masterpiece! Share it with your friends and maybe they can make their own too.",
      icon: iconSparkles(48, "#2A9D8F"),
    },
  ];

  connectedCallback() {
    super.connectedCallback();
    if (!localStorage.getItem("tour-completed")) {
      setTimeout(() => {
        this.isVisible = true;
      }, 500);
    }
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
            >
              ${iconChevronLeft(24, "#000000")}
            </button>
            
            <div style=${this.renderStyleObject(progressDotsStyle)}>
              ${this.steps.map((_, i) => html`
                <div style="width: 8px; height: 8px; border-radius: 50%; background-color: ${i === this.currentStep ? "#E63946" : "#D1D5DB"}; border: 1px solid ${i === this.currentStep ? "#000000" : "transparent"};"></div>
              `)}
            </div>
            
            <button 
              @click=${this.nextStep} 
              style=${this.renderStyleObject(navBtnStyle(false))}
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

