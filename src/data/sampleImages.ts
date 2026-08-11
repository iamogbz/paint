/**
 * Generates sample data URLs using canvas so the app has instant, reliable sample images
 * for testing without external image network dependencies.
 */

function createSampleCanvas(
  drawFn: (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ) => void,
  w = 600,
  h = 600
): string {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    drawFn(ctx, w, h);
  }
  return canvas.toDataURL("image/png");
}

export interface SampleImage {
  id: string;
  name: string;
  dataUrl: string;
}

export function getDailyChallenge(): SampleImage {
  return {
    id: "daily-challenge",
    name: "Playful Cat",
    dataUrl: createSampleCanvas((ctx, w, h) => {
      // Soft yellow/orange background
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, "#FFD166");
      grad.addColorStop(1, "#F4A261");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Cat face
      ctx.fillStyle = "#FFE5D9";
      ctx.beginPath();
      ctx.arc(w / 2, h / 2 + 30, 160, 0, Math.PI * 2);
      ctx.fill();

      // Ears
      ctx.fillStyle = "#C05A46";
      ctx.beginPath();
      ctx.moveTo(w / 2 - 130, h / 2 - 40);
      ctx.lineTo(w / 2 - 180, h / 2 - 180);
      ctx.lineTo(w / 2 - 40, h / 2 - 120);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(w / 2 + 130, h / 2 - 40);
      ctx.lineTo(w / 2 + 180, h / 2 - 180);
      ctx.lineTo(w / 2 + 40, h / 2 - 120);
      ctx.fill();

      // Inner ears
      ctx.fillStyle = "#FFA6C9";
      ctx.beginPath();
      ctx.moveTo(w / 2 - 120, h / 2 - 50);
      ctx.lineTo(w / 2 - 160, h / 2 - 150);
      ctx.lineTo(w / 2 - 50, h / 2 - 110);
      ctx.fill();

      // Eyes
      ctx.fillStyle = "#06D6A0";
      ctx.beginPath();
      ctx.ellipse(w / 2 - 60, h / 2, 25, 38, 0, 0, Math.PI * 2);
      ctx.ellipse(w / 2 + 60, h / 2, 25, 38, 0, 0, Math.PI * 2);
      ctx.fill();

      // Pupils
      ctx.fillStyle = "#000000";
      ctx.beginPath();
      ctx.ellipse(w / 2 - 60, h / 2, 10, 25, 0, 0, Math.PI * 2);
      ctx.ellipse(w / 2 + 60, h / 2, 10, 25, 0, 0, Math.PI * 2);
      ctx.fill();

      // Nose
      ctx.fillStyle = "#E63946";
      ctx.beginPath();
      ctx.moveTo(w / 2 - 15, h / 2 + 45);
      ctx.lineTo(w / 2 + 15, h / 2 + 45);
      ctx.lineTo(w / 2, h / 2 + 65);
      ctx.fill();

      // Whiskers
      ctx.strokeStyle = "#4A2810";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(w / 2 - 80, h / 2 + 60);
      ctx.lineTo(w / 2 - 200, h / 2 + 40);
      ctx.moveTo(w / 2 - 80, h / 2 + 75);
      ctx.lineTo(w / 2 - 210, h / 2 + 80);
      ctx.moveTo(w / 2 + 80, h / 2 + 60);
      ctx.lineTo(w / 2 + 200, h / 2 + 40);
      ctx.moveTo(w / 2 + 80, h / 2 + 75);
      ctx.lineTo(w / 2 + 210, h / 2 + 80);
      ctx.stroke();
    }),
  };
}
