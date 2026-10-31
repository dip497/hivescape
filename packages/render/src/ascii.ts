/**
 * How the ascii style picks a cell's character, written once for both backends (the GPU's shader
 * mirrors `edgeGlyph` and `bodyGlyph`; tests hold the rules). A cell is read as a shape, not only
 * as an amount: from its samples come its coverage, where its covered part sits, and whether that
 * part is a stroke and which way it runs.
 *
 * - A body cell (covered at least `threshold`) is a block of its colour with a character cut into
 *   it, sparse on bright skin and dense in shadow.
 * - An edge cell is a light character alone, the one that sits where the shape does: low in the
 *   cell `.` or `,`, high `'` or `"`, along one side `(` or `)`, through the middle `-` or `:`.
 * - A thin stroke through a cell is a line character along it: `-`, `|`, `/`, `\`, and `_` low.
 */

import { JOINED } from "./atlas.js";

/** Edge characters, by index. */
export const ASCII_EDGES = ".,_'\"-:|/\\()";
export const EDGE = { dot: 0, comma: 1, under: 2, tick: 3, ticks: 4, dash: 5, colon: 6, bar: 7, slash: 8, back: 9, open: 10, close: 11 } as const;

/** A cell's shape: coverage 0..1; the covered part's centre, 0..1 across and down; how much it is a
 *  stroke (0 round .. 1 a line); the stroke's direction, radians, 0 across, y down; and its length,
 *  a share of the cell's longer side. */
export interface CellShape { cov: number; cx: number; cy: number; aniso: number; angle: number; len: number }

/** Which edge character draws a partly covered cell of this shape. */
export function edgeGlyph(s: CellShape): number {
  const { cov, cx, cy, aniso, angle, len } = s;
  // A stroke runs most of the way through the cell; a small blob is a dot wherever it points.
  if (aniso > 0.55 && cov < 0.5 && len > 0.5) {
    const a = ((angle % Math.PI) + Math.PI) % Math.PI;
    if (a < Math.PI / 8 || a > (7 * Math.PI) / 8) return cy > 0.68 ? EDGE.under : EDGE.dash;
    // A stroke down one side of the cell is the edge of a body beside it.
    if (a > (3 * Math.PI) / 8 && a < (5 * Math.PI) / 8) return cx > 0.62 ? EDGE.open : cx < 0.38 ? EDGE.close : EDGE.bar;
    // y runs down the screen: a stroke heading down to the right is a backslash.
    return a < Math.PI / 2 ? EDGE.back : EDGE.slash;
  }
  if (cy > 0.66) return cov < 0.22 ? EDGE.dot : EDGE.comma;
  if (cy < 0.34) return cov < 0.22 ? EDGE.tick : EDGE.ticks;
  if (cx > 0.64) return EDGE.open;
  if (cx < 0.36) return EDGE.close;
  return cov < 0.3 ? EDGE.dash : EDGE.colon;
}

/** Which of `n` ramp characters is cut into a body cell of lightness `l` (0..1): bright skin, sparse.
 *  `jitter` (-0.5..0.5, fixed per cell) mixes neighbouring characters, so a flat colour still has a grain. */
export const bodyGlyph = (l: number, n: number, jitter = 0): number => Math.min(n - 1, Math.max(0, Math.floor((1 - l) * n + jitter * 0.8)));

/** How dark a body's cut character is against its block, on a dark page and a light one (share of the block's colour). */
export const CUT = { dark: 0.3, light: 0.52 } as const;

/**
 * The ink style's rules (the GPU's shader mirrors them). The brightness change across a cell of
 * `ss x ss` samples, `Lu` row by row: right half less left half, bottom half less top half.
 */
export function inkGradient(Lu: ArrayLike<number>, ss: number): [number, number] {
  let gx = 0, gy = 0;
  const h = ss >> 1;
  for (let k = 0; k < ss; k++) for (let m = 0; m < h; m++) {
    gx += Lu[k * ss + h + m]! - Lu[k * ss + m]!;
    gy += Lu[(h + m) * ss + k]! - Lu[m * ss + k]!;
  }
  return [gx / (ss * h), gy / (ss * h)];
}

/** The line along an edge whose brightness changes by `gx, gy` across a `cw x ch` cell: an index into `ASCII_EDGES`. */
export function inkEdge(gx: number, gy: number, cw: number, ch: number): number {
  const a = Math.atan2(gy / ch, gx / cw) + Math.PI / 2, m = ((a % Math.PI) + Math.PI) % Math.PI;
  if (m < Math.PI / 8 || m > (7 * Math.PI) / 8) return EDGE.dash;
  if (m > (3 * Math.PI) / 8 && m < (5 * Math.PI) / 8) return EDGE.bar;
  return m < Math.PI / 2 ? EDGE.back : EDGE.slash;
}

/** Ink's edge characters, by the same indices as `ASCII_EDGES`: its lines join their neighbours'. */
export const INK_EDGES = `.,_'"${JOINED.across}:${JOINED.down}${JOINED.up}${JOINED.fall}()`;

/** The spread of brightness across an ink cell's samples (their standard deviation, 0..0.5). */
export function inkSpread(Lu: ArrayLike<number>, n: number): number {
  let m = 0, q = 0;
  for (let k = 0; k < n; k++) { m += Lu[k]!; q += Lu[k]! * Lu[k]!; }
  m /= n;
  return Math.sqrt(Math.max(0, q / n - m * m));
}

/** Which of `n` ramp characters an ink cell of brightness `d` (0..1, against its ground) takes. */
export const inkDensity = (d: number, n: number): number => Math.min(n - 1, Math.max(0, Math.floor(d * 1.12 * n)));
