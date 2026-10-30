/**
 * Canvases that work the same in a page and in a worker, the font every renderer draws characters
 * in, and the grid a style lays over a size.
 */
import type { Size, StyleSpec } from "@hivescape/core";
import { MONO_FAMILY, MONO_WOFF2 } from "./font-data.js";

export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** A canvas off screen: an OffscreenCanvas where there is one (pages and workers), else an element. */
export function offscreen(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(Math.max(1, w), Math.max(1, h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  return c;
}

export const ctx2d = (c: AnyCanvas, opts?: CanvasRenderingContext2DSettings): Ctx2D => {
  const g = c.getContext("2d", opts) as Ctx2D | null;
  if (!g) throw new Error("hivescape: no 2D context");
  return g;
};

let fontReady: Promise<string> | null = null;

/** The bundled monospace face, added to this page's or worker's fonts once. Resolves with its family. */
export function loadFont(): Promise<string> {
  fontReady ??= (async () => {
    const fonts = (globalThis as { fonts?: FontFaceSet }).fonts ?? (typeof document !== "undefined" ? document.fonts : undefined);
    if (!fonts || typeof FontFace === "undefined") return "monospace";
    const bytes = Uint8Array.from(atob(MONO_WOFF2), (c) => c.charCodeAt(0));
    const face = new FontFace(MONO_FAMILY, bytes.buffer, { weight: "600" });
    await face.load();
    fonts.add(face);
    return MONO_FAMILY;
  })().catch(() => "monospace");
  return fontReady;
}

export interface Grid {
  cols: number;
  rows: number;
  /** A cell's size, CSS pixels: for a comb, the hexagon's width and its row step. */
  cw: number;
  ch: number;
  /** Hexagons: odd rows sit half a cell to the left, and one more column and row cover the edges. */
  hex: boolean;
}

/** The cells a style lays over a size: whole cells, the last row and column running off the edge. */
export const gridFor = (size: Size, style: StyleSpec): Grid => {
  const hex = style.kind === "comb";
  // A native picture has no cells; its grid only sizes the light layer.
  const [cw, ch] = style.kind === "native" ? [8, 8] : style.cell;
  const extra = hex ? 1 : 0;
  return { cols: Math.max(1, Math.ceil(size.w / cw) + extra), rows: Math.max(1, Math.ceil(size.h / ch) + extra), cw, ch, hex };
};

/** Samples per cell side for the picture: a power of two, so the GPU's mip level `log2(SS)` is one texel a cell. */
export const SS = 4;

/** Samples per cell side for the light layer: light is broad, two is plenty. */
export const LS = 2;
