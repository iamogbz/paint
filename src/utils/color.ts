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
