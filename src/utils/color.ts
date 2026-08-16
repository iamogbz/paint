// Color math utilities
export function hsvToRgb(
  h: number,
  s: number,
  v: number
): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  v = Math.max(0, Math.min(1, v));
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

export function rgbToHsv(
  r: number,
  g: number,
  b: number
): [number, number, number] {
  r = Math.max(0, Math.min(255, r)) / 255;
  g = Math.max(0, Math.min(255, g)) / 255;
  b = Math.max(0, Math.min(255, b)) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (max !== min) {
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
  }
  return [h, s, v];
}

export function hexToRgb(hexCode: string) {
  const hexPartDx = hexCode.length > 4 ? 2 : 1;
  const strippedHexCode = hexCode.replace("#", "");
  if (strippedHexCode.length !== 3 && strippedHexCode.length < 6) {
    return null;
  }
  const rbga: number[] = [];
  for (let i = 0; i < 4; i++) {
    rbga.push(
      parseInt(
        strippedHexCode.slice(i * hexPartDx, i * hexPartDx + hexPartDx) || "FF",
        16
      )
    );
  }
  return Object.freeze(rbga) as readonly [number, number, number, number];
}

export function rgbToHex(r: number, g: number, b: number, a?: number): string {
  return (
    "#" +
    [r, g, b, a]
      .filter((v) => v != undefined)
      .map((x) =>
        Math.max(0, Math.min(255, Math.round(x)))
          .toString(16)
          .padStart(2, "0")
          .toUpperCase()
      )
      .join("")
  );
}

export function normalizeHex(hex) {
  if (!hex) return "";
  let h = hex.trim().toUpperCase();
  if (!h.startsWith("#")) {
    h = "#" + h;
  }
  if (h.length === 7) {
    h = h + "FF";
  }
  return h;
}

export function getColorProperties(hexCode: string) {
  const rgb = hexToRgb(hexCode);
  if (!rgb) return { isGray: true, h: 0, s: 0, v: 0 };
  const [h, s, v] = rgbToHsv(rgb[0], rgb[1], rgb[2]);

  // A color is considered grayscale/achromatic if:
  // - saturation is extremely low (s < 0.08)
  // - or it's extremely dark (v < 0.08)
  // - or it's very pale/light (s < 0.15 and v > 0.9)
  const isGray = s < 0.08 || v < 0.08 || (s < 0.15 && v > 0.9);
  return { isGray, h, s, v };
}

export function calculateColorComplexity(imageData: ImageData): number {
    // P (Total Pixels)
    const P = imageData.data.length / 4;

    // Handle the edge case of an image with 1 or 0 pixels
    if (P <= 1) return 1;

    // Cast the underlying ArrayBuffer to a 32-bit unsigned integer array.
    // This packs the RGBA (Red Green Blue Alpha) channels of each pixel 
    // into a single number, making iteration and Set storage significantly faster.
    const buffer32 = new Uint32Array(imageData.data.buffer);
    const uniqueColors = new Set<number>();

    for (let i = 0; i < P; i++) {
        uniqueColors.add(buffer32[i]);
    }

    // U (Unique Colors)
    const U = uniqueColors.size;

    // Ensure a 1-color image correctly returns 0 before we hit logarithmic math
    if (U === 1) return 0;

    // Apply non-linear logarithmic progression
    const CC = Math.log(U) / Math.log(P);

    return CC;
}
