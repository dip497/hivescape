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
 * The ink style's rules (the GPU's shader mirrors them), as an ASCII shader over a picture draws: each
 * cell is read for its texture (how strong, and how much it runs one way), and takes either a stroke
 * along that texture (grass `/`, rain `|`, a roof line `-`) or a character as dense as it is bright.
 */

/** Ink's stroke characters, by `inkStroke`'s index: along the texture. */
export const INK_STROKES = "-|\\/";

/** A cell's texture from its `ss x ss` samples of brightness `Lu` (row by row), in a `cw x ch` cell. */
export interface InkTexture {
  /** How much texture, 0..1. */
  tex: number;
  /** How much it runs one way, 0 (no way) .. 1 (all one way). */
  coh: number;
  /** The direction brightness changes fastest in, radians, y down (the texture runs across it). */
  angle: number;
}

/** How strongly texture registers: the brightness change per two pixels at which `tex` reaches 1, inverted. */
export const INK_TEXTURE_GAIN = 6;

/** A cell's texture: the structure tensor of its samples' brightness, the change measured per two pixels. */
export function inkTexture(Lu: ArrayLike<number>, ss: number, cw: number, ch: number): InkTexture {
  const kx = (2 * ss) / cw, ky = (2 * ss) / ch;
  let jxx = 0, jyy = 0, jxy = 0, n = 0;
  for (let v = 0; v < ss - 1; v++) for (let u = 0; u < ss - 1; u++) {
    const a = Lu[v * ss + u]!, b = Lu[v * ss + u + 1]!, c = Lu[(v + 1) * ss + u]!, d = Lu[(v + 1) * ss + u + 1]!;
    const dx = ((b - a + d - c) / 2) * kx, dy = ((c - a + d - b) / 2) * ky;
    jxx += dx * dx; jyy += dy * dy; jxy += dx * dy; n++;
  }
  jxx /= n; jyy /= n; jxy /= n;
  const e = jxx + jyy;
  return { tex: Math.min(1, Math.sqrt(e) * INK_TEXTURE_GAIN), coh: e > 1e-9 ? Math.sqrt((jxx - jyy) ** 2 + 4 * jxy * jxy) / e : 0, angle: 0.5 * Math.atan2(2 * jxy, jxx - jyy) };
}

/** The stroke along a texture whose brightness changes fastest at `angle`: an index into `INK_STROKES`. */
export function inkStroke(angle: number): number {
  const a = (((angle + Math.PI / 2) % Math.PI) + Math.PI) % Math.PI;
  if (a < Math.PI / 8 || a > (7 * Math.PI) / 8) return 0;
  if (a > (3 * Math.PI) / 8 && a < (5 * Math.PI) / 8) return 1;
  return a < Math.PI / 2 ? 2 : 3;
}

/** The thresholds: no character below `none` of tone; a stroke where texture is at least `tex` and runs one way at least `coh`. */
export const INK_PICK = { none: 0.08, tex: 0.45, coh: 0.55 } as const;

/**
 * Which character an ink cell takes, and how strongly it shows (0..1): `[0]` none, `[1, stroke, s]`
 * along strong one-way texture, `[2, ramp index, s]` as dense as the cell is bright (texture adds a
 * little), so the picture's light and dark read in the characters. `tone` is the cell's brightness on
 * a dark look (its darkness on a light one), 0..1; the ramp runs from least to most ink.
 */
export function inkGlyph(tone: number, t: InkTexture, rampLen: number): [0] | [1 | 2, number, number] {
  if (tone < INK_PICK.none) return [0];
  if (t.tex > INK_PICK.tex && t.coh > INK_PICK.coh) return [1, inkStroke(t.angle), 0.55 + 0.45 * tone];
  const q = Math.min(1, tone * (0.85 + 0.25 * t.tex)), k = Math.min(rampLen - 1, Math.floor(q * rampLen));
  return k <= 0 ? [0] : [2, k, 0.4 + 0.6 * q];
}
