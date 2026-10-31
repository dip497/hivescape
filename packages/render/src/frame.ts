/**
 * What a backend is handed each frame, and the small rules both backends share: the ripple ring,
 * the per-cell flicker hash, the key light's direction and the size a partly covered cell shows at.
 */
import type { Look, Ripple, StyleSpec } from "@hivescape/core";
import type { AnyCanvas, Grid } from "./surface.js";

/** Exact marks to draw on top this frame, in flat arrays (no object per mark). A dot's slot is `-(1 + soft)`. */
export class OverlayBatch {
  n = 0;
  x = new Float32Array(256);
  y = new Float32Array(256);
  slot = new Float32Array(256);
  /** Straight RGBA, 0..1. */
  rgba = new Float32Array(1024);
  scale = new Float32Array(256);

  clear(): void { this.n = 0; }

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
  /** The scene's subjects, `grid.cols * SS` by `grid.rows * SS`, transparent where there is nothing. */
  picture: AnyCanvas;
  grid: Grid;
  style: StyleSpec;
  look: Look;
  time: number;
  pointer: { x: number; y: number; active: boolean };
  ripples: readonly Ripple[];
  /** Atlas slots of the style's ramp, light to full. */
  ramp: readonly number[];
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
 * How the ink style colours a cell, from its own colour (0..1) and its detail `d` (0 flat .. 1 full of
 * detail; `inkDetail`). A flat cell (a clear sky, a blurred surround) stays near its own colour, a
 * faint character of the same hue over it, so the picture keeps its tones; a detailed cell gets a
 * darker ground (washed, on a light look) and a bright (deep) character, so the characters draw the
 * painting's detail. Colours are pushed a little apart from grey (`sat`), as light through glass.
 * Both backends read these.
 */
export const INK = {
  dark: { flat: 0.84, ground: 0.5, ink: 1.34, lift: 0.04, seam: 0.64 },
  light: { flat: 0.08, ground: 0.3, ink: 0.5, lift: 0, seam: 0.9 },
  sat: 1.18,
  /** A character's strength in a flat cell; detail raises it to 1. */
  faint: 0.4,
  /** How fast detail (the spread of brightness inside the cell) reaches 1. */
  detail: 9,
  /** A flat cell takes a character this much lighter (a bright sky `=`, not a wall of `0`); detail takes it back. */
  calm: 0.5,
} as const;

/** A cell's detail, 0..1, from the spread of brightness across its samples (`inkSpread`). */
export const inkDetail = (spread: number): number => Math.min(1, spread * INK.detail);

/** How strongly an ink cell's character shows, from its detail. */
export const inkStrength = (d: number): number => INK.faint + (1 - INK.faint) * d;

/** A cell's ground and character colours in ink, 0..1 in and out, from its colour and detail `d`. */
export function inkColours(r: number, g: number, b: number, dark: boolean, d: number): [number, number, number, number, number, number] {
  const l = 0.299 * r + 0.587 * g + 0.114 * b;
  r = Math.min(1, Math.max(0, l + (r - l) * INK.sat)); g = Math.min(1, Math.max(0, l + (g - l) * INK.sat)); b = Math.min(1, Math.max(0, l + (b - l) * INK.sat));
  if (dark) {
    const { flat, ground, ink, lift } = INK.dark, k = flat + (ground - flat) * d, m = flat + 0.2 + (ink - flat - 0.2) * d;
    return [r * k, g * k, b * k, Math.min(1, r * m + lift * d), Math.min(1, g * m + lift * d), Math.min(1, b * m + lift * d)];
  }
  const { flat, ground, ink } = INK.light, k = flat + (ground - flat) * d, m = 0.8 + (ink - 0.8) * d;
  return [r + (1 - r) * k, g + (1 - g) * k, b + (1 - b) * k, r * m, g * m, b * m];
}

/** How far up the ramp an ink cell's character sits, 0..1: its brightness (darkness, on a light look), calmed where it is flat. */
export const inkTone = (lm: number, dark: boolean, d: number): number => (dark ? lm : 1 - lm) * (INK.calm + (1 - INK.calm) * d);
