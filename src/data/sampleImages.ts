/**
 * Generates sample data URLs using canvas so the app has instant, reliable sample images
 * for testing without external image network dependencies.
 */

function createSampleCanvas(
  drawFn: (ctx: CanvasRenderingContext2D, width: number, height: number) => void,
  w = 600,
  h = 600
): string {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    drawFn(ctx, w, h);
  }
  return canvas.toDataURL('image/png');
}

export interface SampleImage {
  id: string;
  name: string;
  emoji: string;
  dataUrl: string;
}

export function getSampleImages(): SampleImage[] {
  return [
    {
      id: 'sample-cat',
      name: 'Playful Cat',
      emoji: '🐱',
      dataUrl: createSampleCanvas((ctx, w, h) => {
        // Soft yellow/orange background
        const grad = ctx.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, '#FFD166');
        grad.addColorStop(1, '#F4A261');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        // Cat face
        ctx.fillStyle = '#FFE5D9';
        ctx.beginPath();
        ctx.arc(w / 2, h / 2 + 30, 160, 0, Math.PI * 2);
        ctx.fill();

        // Ears
        ctx.fillStyle = '#C05A46';
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
        ctx.fillStyle = '#FFA6C9';
        ctx.beginPath();
        ctx.moveTo(w / 2 - 120, h / 2 - 50);
        ctx.lineTo(w / 2 - 160, h / 2 - 150);
        ctx.lineTo(w / 2 - 50, h / 2 - 110);
        ctx.fill();

        // Eyes
        ctx.fillStyle = '#06D6A0';
        ctx.beginPath();
        ctx.ellipse(w / 2 - 60, h / 2, 25, 38, 0, 0, Math.PI * 2);
        ctx.ellipse(w / 2 + 60, h / 2, 25, 38, 0, 0, Math.PI * 2);
        ctx.fill();

        // Pupils
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.ellipse(w / 2 - 60, h / 2, 10, 25, 0, 0, Math.PI * 2);
        ctx.ellipse(w / 2 + 60, h / 2, 10, 25, 0, 0, Math.PI * 2);
        ctx.fill();

        // Nose
        ctx.fillStyle = '#E63946';
        ctx.beginPath();
        ctx.moveTo(w / 2 - 15, h / 2 + 45);
        ctx.lineTo(w / 2 + 15, h / 2 + 45);
        ctx.lineTo(w / 2, h / 2 + 65);
        ctx.fill();

        // Whiskers
        ctx.strokeStyle = '#4A2810';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(w / 2 - 80, h / 2 + 60); ctx.lineTo(w / 2 - 200, h / 2 + 40);
        ctx.moveTo(w / 2 - 80, h / 2 + 75); ctx.lineTo(w / 2 - 210, h / 2 + 80);
        ctx.moveTo(w / 2 + 80, h / 2 + 60); ctx.lineTo(w / 2 + 200, h / 2 + 40);
        ctx.moveTo(w / 2 + 80, h / 2 + 75); ctx.lineTo(w / 2 + 210, h / 2 + 80);
        ctx.stroke();
      })
    },
    {
      id: 'sample-landscape',
      name: 'Sunset Mountain',
      emoji: '🌅',
      dataUrl: createSampleCanvas((ctx, w, h) => {
        // Sky gradient
        const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.7);
        skyGrad.addColorStop(0, '#B5179E');
        skyGrad.addColorStop(0.4, '#E63946');
        skyGrad.addColorStop(0.8, '#F4A261');
        skyGrad.addColorStop(1, '#FFD166');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, w, h);

        // Sun
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(w / 2, h * 0.45, 70, 0, Math.PI * 2);
        ctx.fill();

        // Back Mountains
        ctx.fillStyle = '#7209B7';
        ctx.beginPath();
        ctx.moveTo(0, h * 0.65);
        ctx.lineTo(w * 0.3, h * 0.35);
        ctx.lineTo(w * 0.6, h * 0.65);
        ctx.lineTo(w * 0.85, h * 0.4);
        ctx.lineTo(w, h * 0.65);
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.fill();

        // Front Mountain
        ctx.fillStyle = '#1D3557';
        ctx.beginPath();
        ctx.moveTo(0, h);
        ctx.lineTo(0, h * 0.7);
        ctx.lineTo(w * 0.45, h * 0.45);
        ctx.lineTo(w * 0.9, h * 0.85);
        ctx.lineTo(w, h * 0.75);
        ctx.lineTo(w, h);
        ctx.fill();

        // Trees silhouettes
        ctx.fillStyle = '#000000';
        for (let i = 0; i < 8; i++) {
          const tx = 30 + i * 75;
          const ty = h - 20;
          ctx.beginPath();
          ctx.moveTo(tx, ty - 60);
          ctx.lineTo(tx - 20, ty);
          ctx.lineTo(tx + 20, ty);
          ctx.fill();
        }
      })
    },
    {
      id: 'sample-fruit',
      name: 'Juicy Watermelon',
      emoji: '🍉',
      dataUrl: createSampleCanvas((ctx, w, h) => {
        // Cyan background
        ctx.fillStyle = '#4EA8DE';
        ctx.fillRect(0, 0, w, h);

        // Watermelon Rind (Dark Green)
        ctx.fillStyle = '#2A9D8F';
        ctx.beginPath();
        ctx.arc(w / 2, h / 2 - 20, 220, 0, Math.PI);
        ctx.fill();

        // Light Green inner rind
        ctx.fillStyle = '#06D6A0';
        ctx.beginPath();
        ctx.arc(w / 2, h / 2 - 20, 200, 0, Math.PI);
        ctx.fill();

        // White border
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(w / 2, h / 2 - 20, 185, 0, Math.PI);
        ctx.fill();

        // Red Flesh
        ctx.fillStyle = '#E63946';
        ctx.beginPath();
        ctx.arc(w / 2, h / 2 - 20, 170, 0, Math.PI);
        ctx.fill();

        // Seeds
        ctx.fillStyle = '#1D3557';
        const seedPositions = [
          [w / 2 - 80, h / 2 + 30],
          [w / 2 - 30, h / 2 + 70],
          [w / 2 + 40, h / 2 + 60],
          [w / 2 + 90, h / 2 + 25],
          [w / 2, h / 2 + 110],
          [w / 2 - 110, h / 2 + 70],
        ];

        seedPositions.forEach(([sx, sy]) => {
          ctx.beginPath();
          ctx.ellipse(sx, sy, 8, 16, Math.PI / 6, 0, Math.PI * 2);
          ctx.fill();
        });
      })
    }
  ];
}
