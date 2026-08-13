const fs = require('fs');
let code = fs.readFileSync('src/utils/imageProcessor.ts', 'utf8');

const eliminateSmallIslandsFunc = `
/**
 * Eliminates small isolated regions (islands) by merging them into their dominant neighboring color.
 */
function eliminateSmallIslands(
  colorIndices: Int16Array,
  width: number,
  height: number,
  minRegionSize: number
) {
  const totalPixels = width * height;
  const visited = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels * 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const startIdx = y * width + x;
      if (visited[startIdx]) continue;

      const colorIdx = colorIndices[startIdx];
      let head = 0;
      let tail = 0;

      queue[tail++] = x;
      queue[tail++] = y;
      visited[startIdx] = 1;

      while (head < tail) {
        const qx = queue[head++];
        const qy = queue[head++];

        const neighbors = [
          [qx + 1, qy],
          [qx - 1, qy],
          [qx, qy + 1],
          [qx, qy - 1],
        ];

        for (const [nx, ny] of neighbors) {
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nIdx = ny * width + nx;
            if (!visited[nIdx] && colorIndices[nIdx] === colorIdx) {
              visited[nIdx] = 1;
              queue[tail++] = nx;
              queue[tail++] = ny;
            }
          }
        }
      }

      const regionSize = tail / 2;
      if (regionSize < minRegionSize) {
        const neighborCounts = new Map<number, number>();
        let maxCount = 0;
        let dominantNeighbor = -1;

        for (let i = 0; i < tail; i += 2) {
          const rx = queue[i];
          const ry = queue[i + 1];
          const neighbors = [
            [rx + 1, ry],
            [rx - 1, ry],
            [rx, ry + 1],
            [rx, ry - 1],
            [rx + 1, ry + 1],
            [rx - 1, ry - 1],
            [rx + 1, ry - 1],
            [rx - 1, ry + 1]
          ];
          for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const nIdx = ny * width + nx;
              const nColor = colorIndices[nIdx];
              if (nColor !== colorIdx) {
                const count = (neighborCounts.get(nColor) || 0) + 1;
                neighborCounts.set(nColor, count);
                if (count > maxCount) {
                  maxCount = count;
                  dominantNeighbor = nColor;
                }
              }
            }
          }
        }

        if (dominantNeighbor !== -1) {
          for (let i = 0; i < tail; i += 2) {
            const rx = queue[i];
            const ry = queue[i + 1];
            colorIndices[ry * width + rx] = dominantNeighbor;
          }
        }
      }
    }
  }
}
`;

code = code.replace(
  "export async function processImageToCartoonPalette",
  eliminateSmallIslandsFunc + "\nexport async function processImageToCartoonPalette"
);

fs.writeFileSync('src/utils/imageProcessor.ts', code);
