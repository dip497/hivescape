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
 * The ink style's rules (the GPU's shader mirrors them). The characters carry the picture's light, on a
 * dim ground. Each cell is read as nine regions' tone (three across, three down). A cell with real
 * contrast inside it is an edge: it takes the edge character whose shape, measured out of the font, is
 * nearest the cell's own (a bright lower edge `_`, a bright left side `[`, a bright diagonal `/`). Any
 * other cell is a fill: an even character, denser the brighter the cell, from a ramp ordered by each
 * character's measured coverage, so flat light stays calm. The character is drawn in the colour of the
 * cell's bright part (its dark part, on a light page), never the mean of both sides of an edge; colours
 * are averaged in linear light.
 */

/**
 * The regions a cell is read in, row by row: 3 across (so a bar down the middle, `|`, is its own column,
 * not an even grey) and 3 down; each region is `INK_SPR x INK_SPR` samples of the picture.
 */
export const INK_RX = 3;
export const INK_RY = 3;
export const INK_REGIONS = INK_RX * INK_RY;
export const INK_SPR = 1;
/** Ink samples per cell, across and down. */
export const INK_SX = INK_RX * INK_SPR;
export const INK_SY = INK_RY * INK_SPR;
/** Ink's edge characters: lines and brackets, each a shape that sits somewhere in the cell. */
export const INK_EDGES = "_-|/\\()[]^'\",.`<>~";
/** The most fill and edge characters ink takes (the GPU's uniform arrays are sized for them). */
export const INK_MAX_FILL = 16;
export const INK_MAX_EDGES = 32;

/** The cheap square law between sRGB and linear light (as a terminal viewer averages): 0..255 in, 0..1 out. */
export const toLinear = (v: number): number => (v / 255) * (v / 255);
export const fromLinear = (v: number): number => Math.sqrt(Math.max(0, v));
const LIN = Float32Array.from({ length: 256 }, (_, v) => toLinear(v));

/**
 * How a cell is read and matched. `gamma` bends tone (above 1 darkens the middle, so more of a
 * picture is left as ground); `levels` is how finely a region's tone is told apart (both backends
 * round to it); a cell whose regions differ by at least `edge` is tried as an edge, its shape
 * sharpened by `crunch` (each region against the brightest, raised to it), and it takes the nearest
 * edge character when that is within `fit` (the squared distance over the nine regions).
 */
export const INK_READ = { gamma: 1.6, levels: 10, edge: 0.3, crunch: 1.8, fit: 2.2 } as const;

/** One character's coverage in each region, 0..1, from its alpha (0..255, RGBA) in a slot `w x h` at `x0, y0` of an image `stride` wide. */
export function measureShape(rgba: ArrayLike<number>, stride: number, x0: number, y0: number, w: number, h: number): number[] {
  const out = new Array<number>(INK_REGIONS).fill(0), n = new Array<number>(INK_REGIONS).fill(0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = Math.min(INK_RY - 1, Math.floor((y * INK_RY) / h)) * INK_RX + Math.min(INK_RX - 1, Math.floor((x * INK_RX) / w));
    out[k]! += rgba[((y0 + y) * stride + x0 + x) * 4 + 3]! / 255; n[k]!++;
  }
  return out.map((v, k) => v / Math.max(1, n[k]!));
}

/** The characters ink draws with, as both backends take them. */
export interface InkGlyphs {
  /** Fill characters' atlas slots, least ink first (the blank first of all), and each one's coverage against the densest (0..1). */
  fill: number[];
  levels: Float32Array;
  /** Edge characters' atlas slots, and each one's shape: its coverage in each region against its own most covered region, `INK_REGIONS` numbers each. */
  edges: number[];
  shapes: Float32Array;
}

/**
 * Ink's characters from their measured coverage (`measureShape` of each): the fill sorted by how much
 * ink it lays down, and each edge character's shape as a pattern (its brightest region 1).
 */
export function inkGlyphs(fill: readonly { slot: number; cover: readonly number[] }[], edges: readonly { slot: number; cover: readonly number[] }[]): InkGlyphs {
  const mean = (c: readonly number[]) => c.reduce((a, b) => a + b, 0) / c.length;
  const f = [...fill].sort((a, b) => mean(a.cover) - mean(b.cover)).slice(0, INK_MAX_FILL), top = Math.max(1e-6, ...f.map((g) => mean(g.cover)));
  const e = edges.filter((g) => Math.max(...g.cover) > 0).slice(0, INK_MAX_EDGES);
  const shapes = new Float32Array(e.length * INK_REGIONS);
  e.forEach((g, i) => { const m = Math.max(...g.cover); g.cover.forEach((v, k) => (shapes[i * INK_REGIONS + k] = v / m)); });
  return { fill: f.map((g) => g.slot), levels: Float32Array.from(f, (g) => mean(g.cover) / top), edges: e.map((g) => g.slot), shapes };
}

/** What a cell is read as: its regions' tone (0..1, the light they ask for) and the colour its character takes (sRGB 0..1). */
export interface InkCell { tone: Float32Array; ink: Float32Array }
export const inkCell = (): InkCell => ({ tone: new Float32Array(INK_REGIONS), ink: new Float32Array(3) });

const W601 = [0.299, 0.587, 0.114] as const;

/**
 * Read one cell's `INK_SX x INK_SY` samples (RGBA 0..255, `stride` pixels a row, the cell's first at
 * `x0, y0`) into `out`. Tone is brightness on a dark look, darkness on a light one, bent by `gamma` and
 * rounded to `levels`. The character's colour is the mean, in linear light, of the samples on its side
 * of the cell's mean: the bright ones on a dark look, the dark ones on a light look.
 */
export function readInkCell(px: ArrayLike<number>, stride: number, x0: number, y0: number, dark: boolean, out: InkCell): void {
  let ym = 0;
  const Y = READ_Y, q = INK_READ.levels - 1, T = dark ? TONE_DARK : TONE_LIGHT;
  for (let v = 0; v < INK_SY; v++) for (let u = 0; u < INK_SX; u++) {
    const p = ((y0 + v) * stride + x0 + u) * 4, k = v * INK_SX + u;
    const r = LIN[px[p]!]!, g = LIN[px[p + 1]!]!, b = LIN[px[p + 2]!]!;
    READ_R[k] = r; READ_G[k] = g; READ_B[k] = b;
    ym += (Y[k] = W601[0] * r + W601[1] * g + W601[2] * b);
  }
  ym /= INK_SX * INK_SY;
  let r = 0, g = 0, b = 0, c = 0;
  for (let k = 0; k < INK_SX * INK_SY; k++) if (dark ? Y[k]! >= ym : Y[k]! <= ym) { r += READ_R[k]!; g += READ_G[k]!; b += READ_B[k]!; c++; }
  out.ink[0] = fromLinear(r / c); out.ink[1] = fromLinear(g / c); out.ink[2] = fromLinear(b / c);
  for (let ry = 0; ry < INK_RY; ry++) for (let rx = 0; rx < INK_RX; rx++) {
    let y = 0;
    for (let v = 0; v < INK_SPR; v++) for (let u = 0; u < INK_SPR; u++) y += Y[(ry * INK_SPR + v) * INK_SX + rx * INK_SPR + u]!;
    out.tone[ry * INK_RX + rx] = T[Math.min(TONE_N - 1, ((y / (INK_SPR * INK_SPR)) * (TONE_N - 1) + 0.5) | 0)]! / q;
  }
}
/** A region's rounded tone level from its linear brightness, read from a table (the GPU works it out: equal but within a table step). */
const TONE_N = 4096;
const toneTable = (dark: boolean) => Uint8Array.from({ length: TONE_N }, (_, i) => {
  const l = fromLinear(i / (TONE_N - 1));
  return Math.round(Math.pow(dark ? l : 1 - l, INK_READ.gamma) * (INK_READ.levels - 1));
});
const TONE_DARK = toneTable(true), TONE_LIGHT = toneTable(false);
const READ_R = new Float32Array(INK_SX * INK_SY), READ_G = new Float32Array(INK_SX * INK_SY), READ_B = new Float32Array(INK_SX * INK_SY), READ_Y = new Float32Array(INK_SX * INK_SY);

/** A cell's rounded tones as one number (the 2D path caches the pick on it). */
export function inkKey(tone: ArrayLike<number>): number {
  const q = INK_READ.levels - 1;
  let key = 0;
  for (let k = 0; k < INK_REGIONS; k++) key = key * INK_READ.levels + Math.round(tone[k]! * q);
  return key;
}

/** A 4x4 ordered (Bayer) dither: each cell's threshold, fixed to the cell, so a flat stretch mixes
 *  the two fills either side of its tone in a fine even pattern instead of one character in every
 *  cell, which reads as rows of text. */
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;
export const inkDither = (i: number, j: number): number => (BAYER4[(j & 3) * 4 + (i & 3)]! + 0.5) / 16;
export const INK_DITHERS = 16;
export const inkDitherIndex = (i: number, j: number): number => (j & 3) * 4 + (i & 3);
export const BAYER4_LIST: readonly number[] = BAYER4;

/**
 * Which character a cell read as `tone` takes: `[0]` none; `[1, edge index, strength]` an edge, its
 * strength (0..1) as bright as the cell's brightest region; `[2, fill index, 1]` a fill as dense as the
 * cell is bright on average: the nearer of the two either side of it, or, given the cell's `dither`
 * threshold (inkDither), the denser one when the cell's tone is further than that between them.
 */
const PATTERN = new Float32Array(INK_REGIONS);
export function inkPick(tone: ArrayLike<number>, g: InkGlyphs, dither?: number): [0] | [1 | 2, number, number] {
  let mx = 0, mn = 1, mean = 0;
  for (let k = 0; k < INK_REGIONS; k++) { const t = tone[k]!; mx = Math.max(mx, t); mn = Math.min(mn, t); mean += t; }
  mean /= INK_REGIONS;
  if (mx - mn >= INK_READ.edge && g.edges.length) {
    const p = PATTERN;
    for (let k = 0; k < INK_REGIONS; k++) p[k] = Math.pow(tone[k]! / mx, INK_READ.crunch);
    let best = -1, bd: number = INK_READ.fit;
    for (let e = 0; e < g.edges.length; e++) {
      let d = 0;
      for (let k = 0; k < INK_REGIONS; k++) { const t = p[k]! - g.shapes[e * INK_REGIONS + k]!; d += t * t; }
      if (d < bd) { bd = d; best = e; }
    }
    if (best >= 0) return [1, best, Math.sqrt(mx)];
  }
  let best = 0;
  if (dither === undefined) {
    let bd = Infinity;
    for (let i = 0; i < g.levels.length; i++) { const d = Math.abs(g.levels[i]! - mean); if (d < bd) { bd = d; best = i; } }
  } else {
    // The densest fill at or below the tone, and the next: the cell takes the next when the tone is
    // past its threshold of the way between them.
    for (let i = 0; i < g.levels.length; i++) if (g.levels[i]! <= mean) best = i;
    const next = best + 1;
    if (next < g.levels.length && (mean - g.levels[best]!) / (g.levels[next]! - g.levels[best]!) > dither) best = next;
  }
  return best === 0 ? [0] : [2, best, 1];
}
