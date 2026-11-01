/**
 * What a backend is handed each frame, and the small rules both backends share: the ripple ring,
 * the per-cell flicker hash, the key light's direction and the size a partly covered cell shows at.
 */
import type { Look, Ripple, StyleSpec } from "@hivescape/core";
import { INK_READ, type InkGlyphs } from "./ascii.js";
import type { AnyCanvas, Grid } from "./surface.js";

/** Exact marks to draw on top this frame, in flat arrays (no object per mark). A dot's slot is `-(1 + soft)`; strokes have arrays of their own. */
export class OverlayBatch {
  n = 0;
  x = new Float32Array(256);
  y = new Float32Array(256);
  slot = new Float32Array(256);
  /** Straight RGBA, 0..1. */
  rgba = new Float32Array(1024);
  scale = new Float32Array(256);

  /** Strokes: their ends (x0, y0, x1, y1), straight RGBA 0..1 and width, flat. */
  sn = 0;
  seg = new Float32Array(4 * 1024);
  srgba = new Float32Array(4 * 1024);
  swidth = new Float32Array(1024);

  clear(): void { this.n = 0; this.sn = 0; }

  pushStroke(x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number, a: number, width: number): void {
    if (this.sn === this.swidth.length) {
      const k = this.swidth.length * 2, f = (a: Float32Array, m: number) => { const b = new Float32Array(k * m); b.set(a); return b; };
      this.seg = f(this.seg, 4); this.srgba = f(this.srgba, 4); this.swidth = f(this.swidth, 1);
    }
    const i = this.sn++;
    this.seg[i * 4] = x0; this.seg[i * 4 + 1] = y0; this.seg[i * 4 + 2] = x1; this.seg[i * 4 + 3] = y1;
    this.srgba[i * 4] = r; this.srgba[i * 4 + 1] = g; this.srgba[i * 4 + 2] = b; this.srgba[i * 4 + 3] = a;
    this.swidth[i] = width;
  }

  push(x: number, y: number, slot: number, r: number, g: number, b: number, a: number, scale: number): void {
    if (this.n === this.x.length) this.grow();
    const i = this.n++;
    this.x[i] = x; this.y[i] = y; this.slot[i] = slot; this.scale[i] = scale;
    this.rgba[i * 4] = r / 255; this.rgba[i * 4 + 1] = g / 255; this.rgba[i * 4 + 2] = b / 255; this.rgba[i * 4 + 3] = a;
  }

  private grow(): void {
    const k = this.x.length * 2;
    const f = (a: Float32Array, m = 1) => { const b = new Float32Array(k * m); b.set(a); return b; };
    this.x = f(this.x); this.y = f(this.y); this.slot = f(this.slot); this.scale = f(this.scale); this.rgba = f(this.rgba, 4);
  }
}

export interface FrameInput {
  /** The scene's subjects, `grid.cols * SS` by `grid.rows * SS` (ink: `INK_SX` by `INK_SY` a cell), transparent where there is nothing. */
  picture: AnyCanvas;
  grid: Grid;
  style: StyleSpec;
  look: Look;
  time: number;
  pointer: { x: number; y: number; active: boolean };
  ripples: readonly Ripple[];
  /** Atlas slots of the style's ramp, light to full. */
  ramp: readonly number[];
  /** ink: its fill and edge characters, measured (ascii.ts's `inkGlyphs`); null for any other style. */
  ink: InkGlyphs | null;
  /** Atlas slots of the ascii style's edge characters (`ASCII_EDGES`), in order. */
  edges: readonly number[];
  overlay: OverlayBatch;
  /** The scene's lights, `grid.cols * LS` by `grid.rows * LS` on black, or null when it paints none. */
  light: AnyCanvas | null;
}

/** Where the key light comes from: up and to the left, toward the viewer. Shadows fall the other way. */
export const KEY = (() => { const v = [-0.5, -0.66, 0.56], l = Math.hypot(...v); return v.map((x) => x / l) as [number, number, number]; })();

/** How big a cell covered `a` shows, 0 (not at all) to 1 (whole): its area follows its coverage. */
export function cellSize(a: number, soft: number, threshold: number): number {
  if (a < soft) return 0;
  if (a >= threshold) return 1;
  return 0.38 + 0.62 * Math.sqrt((a - soft) / Math.max(threshold - soft, 1e-3));
}

/** The lift a ripple ring gives a cell centre at `x, y`, 0..1. */
export function ringAt(x: number, y: number, ripples: readonly Ripple[], time: number): number {
  let ring = 0;
  for (const r of ripples) {
    const age = time - r.at;
    if (age < 0 || age >= r.life) continue;
    const d = Math.hypot(x - r.x, y - r.y), rr = age * r.speed;
    ring = Math.max(ring, Math.max(0, 1 - Math.abs(d - rr) / 24) * (1 - age / r.life) * r.strength);
  }
  return ring;
}

/** A cell's per-cell random 0..1 for the current flicker tick (the shader's `hash` is the same function). */
export function cellHash(i: number, j: number, tick: number): number {
  let h = (Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ Math.imul(tick, 0x9e3779b1)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0; h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Perceived lightness of straight sRGB 0..255, 0..1 (the cheap Rec. 601 weights both paths use). */
export const lightness = (r: number, g: number, b: number): number => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

/**
 * How the ink style colours a frame. The characters carry the picture's light: each is drawn in the
 * colour of its cell's bright side, its chroma pushed out (kept in gamut, so no hue turns) and, on a
 * dark look, lifted toward that colour's full brightness, so a dark cell is dark because its character
 * is small, not because it is muddy. Beneath them a dim ground of the picture; round them their glow.
 * On a light look the characters are deepened and the ground washed toward the page, like a print.
 * Both backends read these.
 */
export const INK = {
  /** The ground beneath the characters: on a dark look the picture at this share; on a light one, how far it is washed toward the page. */
  base: { dark: 0.16, light: 0.84 },
  /** How far a character's colour is pushed from its own grey. */
  chroma: 1.35,
  /** On a dark look, how far a character's colour is lifted toward its full brightness (0 none, 1 all the way). */
  lift: 0.72,
  /** On a light look, the share of its colour a character is drawn in. */
  deep: 0.62,
  /** The glow round the characters on a dark look: their own light, spread to a quarter and an eighth of the CSS size, added at these shares. */
  glow: [0.3, 0.22],
} as const;

/**
 * How strongly a stroke shows in ink, 0..1, from its colour (sRGB 0..1): the brighter its colour (the
 * darker, on a light look) the stronger, from ink's tone (as a character's density follows it), but
 * by its square root: a stroke is one bright mark among dark gaps, not an even wash.
 */
export function inkStrokeAlpha(r: number, g: number, b: number, dark: boolean): number {
  const l = Math.sqrt(0.299 * r * r + 0.587 * g * g + 0.114 * b * b);
  return Math.sqrt(Math.pow(dark ? l : 1 - l, INK_READ.gamma));
}

/** A character's colour, sRGB 0..1 in and out, from its side of the cell's colour, on a dark look or a light one. */
export function inkColour(r: number, g: number, b: number, dark: boolean): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0];
  inkColourInto(out, r, g, b, dark);
  return out;
}

/** `inkColour` written into `out` (the 2D path calls it per character, so it makes nothing). */
export function inkColourInto(out: number[], r: number, g: number, b: number, dark: boolean): void {
  const l = 0.299 * r + 0.587 * g + 0.114 * b;
  // The chroma push, as far as INK.chroma or until a channel would leave 0..1, whichever comes first.
  let k: number = INK.chroma;
  k = pushLimit(k, r, l); k = pushLimit(k, g, l); k = pushLimit(k, b, l);
  r = l + (r - l) * k; g = l + (g - l) * k; b = l + (b - l) * k;
  if (!dark) { out[0] = r * INK.deep; out[1] = g * INK.deep; out[2] = b * INK.deep; return; }
  const m = Math.max(r, g, b), f = m > 1e-4 ? (1 / m) * INK.lift + (1 - INK.lift) : 1;
  out[0] = Math.min(1, r * f); out[1] = Math.min(1, g * f); out[2] = Math.min(1, b * f);
}
const pushLimit = (k: number, c: number, l: number): number => (c > l + 1e-6 ? Math.min(k, (1 - l) / (c - l)) : c < l - 1e-6 ? Math.min(k, l / (l - c)) : k);
