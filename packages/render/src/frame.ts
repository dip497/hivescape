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
