/**
 * Colour as scenes need it: sRGB triples (0..255), mixes that look even (OKLab), OKLCH for picking
 * palettes by lightness, and WCAG contrast for checking that text over a scene stays readable.
 */
import { clamp } from "./math.js";

/** sRGB, 0..255 a channel. */
export type Rgb = readonly [number, number, number];

export function hex(h: string): Rgb {
  const s = h.startsWith("#") ? h.slice(1) : h;
  const f = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
}

export const toHex = (c: Rgb): string => "#" + c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");

export const css = (c: Rgb, a = 1): string =>
  a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${+a.toFixed(3)})`;

/** A straight mix in sRGB: cheap, for tints that only need to be close. */
export const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const toLin = (v: number): number => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const toSrgb = (v: number): number => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

/** OKLab: L 0..1, a and b about -0.4..0.4. */
export type Lab = readonly [number, number, number];

export function toOklab(c: Rgb): Lab {
  const r = toLin(c[0]), g = toLin(c[1]), b = toLin(c[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

/** OKLab to linear sRGB, unclamped (outside 0..1 means out of gamut). */
function labToLinear(lab: Lab): [number, number, number] {
  const [L, A, B] = lab;
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}

export const fromOklab = (lab: Lab): Rgb => {
  const [r, g, b] = labToLinear(lab);
  return [toSrgb(clamp(r)), toSrgb(clamp(g)), toSrgb(clamp(b))];
};

/** OKLCH (L 0..1, C 0..~0.37, h degrees) to sRGB, keeping L and h and lowering C until it fits the gamut. */
export function oklch(L: number, C: number, h: number): Rgb {
  const rad = (h * Math.PI) / 180;
  let lo = 0, hi = C;
  const fits = (c: number) => labToLinear([L, c * Math.cos(rad), c * Math.sin(rad)]).every((v) => v >= -1e-4 && v <= 1 + 1e-4);
  if (fits(C)) lo = C;
  else for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
  return fromOklab([L, lo * Math.cos(rad), lo * Math.sin(rad)]);
}

/** An even-looking mix: through OKLab. */
export const mix = (a: Rgb, b: Rgb, t: number): Rgb => {
  const p = toOklab(a), q = toOklab(b);
  return fromOklab([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]);
};

/** The same colour with its OKLab lightness moved by `d` (negative darkens). */
export const shade = (c: Rgb, d: number): Rgb => { const p = toOklab(c); return fromOklab([clamp(p[0] + d), p[1], p[2]]); };

/** WCAG 2 relative luminance, 0..1. */
export const luminance = (c: Rgb): number => 0.2126 * toLin(c[0]) + 0.7152 * toLin(c[1]) + 0.0722 * toLin(c[2]);

/** WCAG 2 contrast ratio, 1..21. Body text wants 4.5, large text and marks 3. */
export const contrast = (a: Rgb, b: Rgb): number => {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/** `fg` drawn at `alpha` over `bg`. */
export const over = (fg: Rgb, alpha: number, bg: Rgb): Rgb => mixRgb(bg, fg, clamp(alpha));
