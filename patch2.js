const fs = require('fs');
let code = fs.readFileSync('src/utils/imageProcessor.ts', 'utf8');

const modeFilter = `
/**
 * Applies a mode filter (most frequent color in neighborhood) to remove thin lines and noise.
 */
function applyModeFilter(
  colorIndices: Int16Array,
  width: number,
  height: number,
  radius: number
) {
  const copy = new Int16Array(colorIndices);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      
      const counts = new Map<number, number>();
      let maxCount = 0;
      let dominantVal = copy[idx];

      const minY = Math.max(0, y - radius);
      const maxY = Math.min(height - 1, y + radius);
      const minX = Math.max(0, x - radius);
      const maxX = Math.min(width - 1, x + radius);

      for (let ny = minY; ny <= maxY; ny++) {
        const nRow = ny * width;
        for (let nx = minX; nx <= maxX; nx++) {
          const nVal = copy[nRow + nx];
          const c = (counts.get(nVal) || 0) + 1;
          counts.set(nVal, c);
          if (c > maxCount) {
            maxCount = c;
            dominantVal = nVal;
          }
        }
      }
      colorIndices[idx] = dominantVal;
    }
  }
}
`;

code = code.replace(
  "export async function processImageToCartoonPalette",
  modeFilter + "\nexport async function processImageToCartoonPalette"
);

fs.writeFileSync('src/utils/imageProcessor.ts', code);
