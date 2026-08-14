export function applyBilateralFilter(
  srcPixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  spatialSigma = 2.0,
  rangeSigma = 45.0,
  radius = 3
): Uint8ClampedArray {
  const r = Math.max(1, Math.round(radius));
  const tempPixels = new Float32Array(srcPixels.length);
  const dstPixels = new Uint8ClampedArray(srcPixels.length);

  const twoSpatialSigmaSq = 2 * Math.max(0.1, spatialSigma) * Math.max(0.1, spatialSigma);
  const twoRangeSigmaSq = 2 * Math.max(0.1, rangeSigma) * Math.max(0.1, rangeSigma);

  // Precompute spatial weights (1D)
  const spatialWeights = new Float32Array(r * 2 + 1);
  for (let d = -r; d <= r; d++) {
    spatialWeights[d + r] = Math.exp(-(d * d) / twoSpatialSigmaSq);
  }

  // Precompute range weights (max dist sq is 255^2 * 3 = 195075)
  const rangeWeights = new Float32Array(195076);
  for (let i = 0; i <= 195075; i++) {
    rangeWeights[i] = Math.exp(-i / twoRangeSigmaSq);
  }

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const idx = (rowOffset + x) * 4;
      const cR = srcPixels[idx];
      const cG = srcPixels[idx + 1];
      const cB = srcPixels[idx + 2];
      const cA = srcPixels[idx + 3];

      let sumR = 0, sumG = 0, sumB = 0, sumW = 0;
      const xMin = Math.max(0, x - r);
      const xMax = Math.min(width - 1, x + r);

      for (let nx = xMin; nx <= xMax; nx++) {
        const nIdx = (rowOffset + nx) * 4;
        const nR = srcPixels[nIdx];
        const nG = srcPixels[nIdx + 1];
        const nB = srcPixels[nIdx + 2];

        const dR = nR - cR;
        const dG = nG - cG;
        const dB = nB - cB;
        
        const distSq = dR * dR + dG * dG + dB * dB;
        const weight = spatialWeights[nx - x + r] * rangeWeights[distSq];

        sumR += nR * weight;
        sumG += nG * weight;
        sumB += nB * weight;
        sumW += weight;
      }

      tempPixels[idx] = sumR / sumW;
      tempPixels[idx + 1] = sumG / sumW;
      tempPixels[idx + 2] = sumB / sumW;
      tempPixels[idx + 3] = cA;
    }
  }

  // Vertical pass
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const idx = (rowOffset + x) * 4;
      const cR = tempPixels[idx];
      const cG = tempPixels[idx + 1];
      const cB = tempPixels[idx + 2];
      const cA = tempPixels[idx + 3];

      let sumR = 0, sumG = 0, sumB = 0, sumW = 0;
      const yMin = Math.max(0, y - r);
      const yMax = Math.min(height - 1, y + r);

      for (let ny = yMin; ny <= yMax; ny++) {
        const nIdx = (ny * width + x) * 4;
        const nR = tempPixels[nIdx];
        const nG = tempPixels[nIdx + 1];
        const nB = tempPixels[nIdx + 2];

        const dR = nR - cR;
        const dG = nG - cG;
        const dB = nB - cB;
        
        const distSq = dR * dR + dG * dG + dB * dB;
        // Floor it for safety, though it should be integer if we used Math.round/trunc,
        // but JS numbers from tempPixels are floats. Wait! tempPixels are Float32,
        // so nR, nG, nB are floats! distSq will not be integer!
        // We must round it to use rangeWeights array, or just compute Math.exp directly.
        // Actually computing Math.exp might be faster than rounding and lookup if we use Float32,
        // or we just use Math.round(distSq). Let's use Math.exp directly or round.
        const weight = spatialWeights[ny - y + r] * rangeWeights[Math.round(distSq)];

        sumR += nR * weight;
        sumG += nG * weight;
        sumB += nB * weight;
        sumW += weight;
      }

      dstPixels[idx] = sumR / sumW;
      dstPixels[idx + 1] = sumG / sumW;
      dstPixels[idx + 2] = sumB / sumW;
      dstPixels[idx + 3] = cA;
    }
  }

  return dstPixels;
}
