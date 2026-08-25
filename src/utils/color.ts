import { TRANSPARENT_HEX, TRUE_BLACK_HEX } from "./constants";

// Color math utilities
export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
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
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

export function rgbToHsv(r: number, g: number, b: number, a?: number): [number, number, number] {
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
  const normalized = normalizeHex(hexCode);
  if (!normalized || normalized.length !== 9) {
    return null;
  }
  const strippedHexCode = normalized.substring(1);
  const rbga: number[] = [];
  for (let i = 0; i < 4; i++) {
    rbga.push(parseInt(strippedHexCode.slice(i * 2, i * 2 + 2), 16));
  }
  return Object.freeze(rbga) as readonly [number, number, number, number];
}

export function rgbToHex(r: number, g: number, b: number, a?: number): string {
  return normalizeHex(
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

export function normalizeHex(hex?: string | null): string {
  if (!hex) return "";
  let h = hex.trim().toUpperCase();
  if (!h.startsWith("#")) {
    h = "#" + h;
  }
  if (h.length === 4) {
    // #RGB -> #RRGGBBFF
    h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}FF`;
  } else if (h.length === 5) {
    // #RGBA -> #RRGGBBAA
    h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}${h[4]}${h[4]}`;
  } else if (h.length === 7) {
    // #RRGGBB -> #RRGGBBFF
    h = h + "FF";
  }
  return h;
}

let canvas2dCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
export function getHexCode(anyColor: string) {
  if (!anyColor || anyColor === "none") return TRANSPARENT_HEX;
  const trimmed = anyColor.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) {
    return normalizeHex(trimmed);
  }

  if (!canvas2dCtx) {
    // 1. Create a tiny off-screen canvas
    const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(1, 1) : document.createElement("canvas");

    // Set dimensions to 1x1
    canvas.width = 1;
    canvas.height = 1;

    // update frequently used canvas
    canvas2dCtx = canvas.getContext("2d", { willReadFrequently: true });
  }
  if (!canvas2dCtx) return TRUE_BLACK_HEX;

  // 2. Clear canvas to absolute transparency
  canvas2dCtx.clearRect(0, 0, 1, 1);

  // 3. Apply the input color and paint a single pixel
  canvas2dCtx.fillStyle = anyColor;
  canvas2dCtx.fillRect(0, 0, 1, 1);

  // 4. Extract the exact raw RGBA memory buffer
  const [r, g, b, a] = canvas2dCtx.getImageData(0, 0, 1, 1).data;

  // 5. Format each channel to a 2-character hex block
  const hexR = r.toString(16).padStart(2, "0");
  const hexG = g.toString(16).padStart(2, "0");
  const hexB = b.toString(16).padStart(2, "0");
  const hexA = a.toString(16).padStart(2, "0");

  return normalizeHex(`#${hexR}${hexG}${hexB}${hexA}`);
}

export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  let rN = r / 255;
  let gN = g / 255;
  let bN = b / 255;
  rN = rN > 0.04045 ? Math.pow((rN + 0.055) / 1.055, 2.4) : rN / 12.92;
  gN = gN > 0.04045 ? Math.pow((gN + 0.055) / 1.055, 2.4) : gN / 12.92;
  bN = bN > 0.04045 ? Math.pow((bN + 0.055) / 1.055, 2.4) : bN / 12.92;

  const x = (rN * 0.4124 + gN * 0.3576 + bN * 0.1805) / 0.95047;
  const y = (rN * 0.2126 + gN * 0.7152 + bN * 0.0722) / 1.0;
  const z = (rN * 0.0193 + gN * 0.1192 + bN * 0.9505) / 1.08883;

  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * CIEDE2000 Color Difference formula (ΔE00).
 * Implements CIE Publication 142-2001 standard.
 */
export function ciede2000(lab1: [number, number, number], lab2: [number, number, number]): number {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;

  // 1. Calculate C1*, C2*, C_bar* and G
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const C_bar = (C1 + C2) / 2;
  const C_bar7 = Math.pow(C_bar, 7);
  const G = 0.5 * (1 - Math.sqrt(C_bar7 / (C_bar7 + 6103515625))); // 25^7 = 6103515625

  // 2. Calculate a', C' and h'
  const a1_prime = (1 + G) * a1;
  const a2_prime = (1 + G) * a2;
  const C1_prime = Math.hypot(a1_prime, b1);
  const C2_prime = Math.hypot(a2_prime, b2);

  let h1_prime = Math.atan2(b1, a1_prime) * RAD_TO_DEG;
  if (h1_prime < 0) h1_prime += 360;

  let h2_prime = Math.atan2(b2, a2_prime) * RAD_TO_DEG;
  if (h2_prime < 0) h2_prime += 360;

  // 3. Calculate ΔL', ΔC', Δh' and ΔH'
  const delta_L_prime = L2 - L1;
  const delta_C_prime = C2_prime - C1_prime;

  let delta_h_prime = 0;
  if (C1_prime * C2_prime !== 0) {
    const diff_h = h2_prime - h1_prime;
    if (Math.abs(diff_h) <= 180) {
      delta_h_prime = diff_h;
    } else if (diff_h > 180) {
      delta_h_prime = diff_h - 360;
    } else {
      delta_h_prime = diff_h + 360;
    }
  }

  const delta_H_prime = 2 * Math.sqrt(C1_prime * C2_prime) * Math.sin((delta_h_prime * DEG_TO_RAD) / 2);

  // 4. Calculate L_bar', C_bar', h_bar'
  const L_bar_prime = (L1 + L2) / 2;
  const C_bar_prime = (C1_prime + C2_prime) / 2;

  let h_bar_prime = 0;
  if (C1_prime * C2_prime === 0) {
    h_bar_prime = h1_prime + h2_prime;
  } else {
    const abs_diff = Math.abs(h1_prime - h2_prime);
    const sum_h = h1_prime + h2_prime;
    if (abs_diff <= 180) {
      h_bar_prime = sum_h / 2;
    } else if (sum_h < 360) {
      h_bar_prime = (sum_h + 360) / 2;
    } else {
      h_bar_prime = (sum_h - 360) / 2;
    }
  }

  // 5. Calculate T
  const T = 1 - 0.17 * Math.cos((h_bar_prime - 30) * DEG_TO_RAD) + 0.24 * Math.cos(2 * h_bar_prime * DEG_TO_RAD) + 0.32 * Math.cos((3 * h_bar_prime + 6) * DEG_TO_RAD) - 0.2 * Math.cos((4 * h_bar_prime - 63) * DEG_TO_RAD);

  // 6. Calculate SL, SC, SH
  const L_bar_minus_50_sq = Math.pow(L_bar_prime - 50, 2);
  const S_L = 1 + (0.015 * L_bar_minus_50_sq) / Math.sqrt(20 + L_bar_minus_50_sq);
  const S_C = 1 + 0.045 * C_bar_prime;
  const S_H = 1 + 0.015 * C_bar_prime * T;

  // 7. Calculate RT
  const C_bar_prime7 = Math.pow(C_bar_prime, 7);
  const R_C = 2 * Math.sqrt(C_bar_prime7 / (C_bar_prime7 + 6103515625));
  const delta_theta = 30 * Math.exp(-Math.pow((h_bar_prime - 275) / 25, 2));
  const R_T = -R_C * Math.sin(2 * delta_theta * DEG_TO_RAD);

  // 8. Calculate total color difference ΔE00
  const term_L = delta_L_prime / S_L;
  const term_C = delta_C_prime / S_C;
  const term_H = delta_H_prime / S_H;

  const delta_E00_sq = term_L * term_L + term_C * term_C + term_H * term_H + R_T * term_C * term_H;

  return Math.sqrt(Math.max(0, delta_E00_sq));
}

export function deltaE(lab1: [number, number, number], lab2: [number, number, number]): number {
  return Math.hypot(lab1[0] - lab2[0], lab1[1] - lab2[1], lab1[2] - lab2[2]);
}
