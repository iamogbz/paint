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
        "Let's take a quick tour of the controls so you can start painting your masterpiece.",
      icon: iconPaintBucket(48, "#E63946"),
    },
    {
      title: "Starting a Painting",
      description:
        "Upload any photo to generate a custom paint by colours canvas, or jump straight into the Daily Challenge.",
      icon: iconImage(48, "#2A9D8F"),
    },
    {
      title: "Navigating the Canvas",
      description:
        "Zoom in/out using buttons, scroll wheel, or pinch to zoom. Pan around freely by dragging the Move joystick or dragging the canvas in Fill Mode.",
      icon: html`
        ${iconZoomOut(18, "#000000")} ${iconMove(48, "#000000")}
        ${iconZoomIn(18, "#000000")}
      `,
    },
    {
      title: "Painting the Canvas",
      description:
        "Use Paint Bucket mode to fill entire color islands at once by tapping or dragging the color to the canvas. Switch to Brush Mode to paint inside lines, zooming in for precision!",
      icon: html`
        ${iconPaintBucket(32, "#000000")} ${iconPaintbrush(32, "#E63946")}
      `,
    },
    {
      title: "Track your Progress",
      description:
        "Each color swatch shows your progress in number of regions painted. Once a color is fully painted, a checkmark will appear on its swatch. However this is just a guide, you are the artist!",
      icon: iconCheck(48, "#2A9D8F"),
    },
    {
      title: "Want to add Custom Colors?",
      description:
        "Tap the rainbow Picker to open the Color Wheel, adjust brightness, or input HEX codes directly. Added custom swatches can be removed anytime.",
      icon: iconPalette(48, "#8338EC"),
    },
    {
      title: "Made a mistake?",
      description:
        "No worries! Just click the Undo button to revert your last change and try again. The eraser is also there to clear colours from the canvas.",
      icon: iconRotateCcw(48, "#000000"),
    },
    {
      title: "Gallery & Saving",
      description:
        "Use the yellow Gallery icon to view existing paintings, track their completion progress, change their names, or start a new one. Use the green Save icon to download your painting.",
      icon: html`
        ${iconFolderOpen(48, "#F4A261")} ${iconDownload(24, "#2A9D8F")}
      `,
    },
    {
      title: "Ready, Set, Paint!",
      description:
        "Looking forward to your next masterpiece! Share it with your friends and maybe they can make their own too.",
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

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  private nextStep() {
    this.goToStep(this.currentStep + 1);
  }

  private prevStep() {
    this.goToStep(this.currentStep - 1);
  }

  private goToStep(stepIndex: number) {
    if (stepIndex >= 0 && stepIndex < this.steps.length) {
      this.currentStep = stepIndex;
    } else if (stepIndex >= this.steps.length) {
      this.finishTour();
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
      backgroundColor: "rgba(255, 255, 255, 0.6)",
      backdropFilter: "blur(0.5rem)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0.75rem",
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
          <button
            @click=${this.finishTour}
            style=${this.renderStyleObject(closeBtnStyle)}
            title="Skip Tour"
          >
            ${iconX(16, "#000000")}
          </button>

          <div
            style="margin-bottom: 1.5rem; display: flex; justify-content: center; align-items: center; width: 96px; height: 96px; background-color: rgba(0,0,0,0.05); border-radius: 50%; border: 3px solid rgba(0,0,0,0.1);"
          >
            ${currentSlide.icon}
          </div>

          <h2
            style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.5rem; font-weight: 900; color: #3D2314; margin: 0 0 1rem 0;"
          >
            ${currentSlide.title}
          </h2>

          <p
            style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1rem; color: #4A2810; font-weight: 600; line-height: 1.5; margin: 0 0 2rem 0; min-height: 4.5rem;"
          >
            ${currentSlide.description}
          </p>

          <div
            style="display: flex; align-items: center; justify-content: space-between; width: 100%;"
          >
            <button
              @click=${this.prevStep}
              style=${this.renderStyleObject(
                navBtnStyle(this.currentStep === 0)
              )}
              ?disabled=${this.currentStep === 0}
              title="Previous"
            >
              ${iconChevronLeft(24, "#000000")}
            </button>

            <div style=${this.renderStyleObject(progressDotsStyle)}>
              ${this.steps.map(
                (_, i) => html`
                  <button
                    @click=${() => this.goToStep(i)}
                    style="width: 10px; height: 10px; border-radius: 50%; background-color: ${i ===
                    this.currentStep
                      ? "#E63946"
                      : "#D1D5DB"}; border: 1.5px solid ${i === this.currentStep
                      ? "#000000"
                      : "rgba(0,0,0,0.15)"}; padding: 0; cursor: pointer; transition: all 0.15s ease;"
                    title="Go to step ${i + 1}"
                  ></button>
                `
              )}
            </div>

            <button
              @click=${this.nextStep}
              style=${this.renderStyleObject(navBtnStyle(false))}
              title="Next"
            >
              ${this.currentStep === this.steps.length - 1
                ? iconCheck(24, "#000000")
                : iconChevronRight(24, "#000000")}
            </button>
          </div>

          ${this.currentStep === this.steps.length - 1
            ? html`
                <button
                  @click=${this.finishTour}
                  style="margin-top: 1.5rem; width: 100%; background-color: #2A9D8F; color: #FFFFFF; font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 900; padding: 0.75rem 1.5rem; border-radius: 20px; border: 3px solid #000000; box-shadow: 4px 4px 0px 0px #000000; font-size: 1rem; text-transform: uppercase; cursor: pointer; transition: all 0.15s ease;"
                >
                  Let's Paint!
                </button>
              `
            : ""}
        </div>
      </div>
    `;
  }

  private renderStyleObject(styleObj: Record<string, string | number>): string {
    return Object.entries(styleObj)
      .map(
        ([k, v]) =>
          `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}: ${v};`
      )
      .join(" ");
  }
}
