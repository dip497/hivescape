import { describe, expect, test } from "bun:test";
import { averageCells, cellShapes } from "../src/kernel.ts";
import { ASCII_EDGES, bodyGlyph, edgeGlyph, INK_SX, INK_SY, inkCell, inkDither, inkGlyphs, inkPick, measureShape, readInkCell } from "../src/ascii.ts";
import { cellSize, inkColour, inkStrokeAlpha } from "../src/frame.ts";
import { gridFor } from "../src/surface.ts";
import { resolveStyle, DARK } from "@hivescape/core";

/** A picture `cols * ss` by `rows * ss`, opaque `rgb` where `paint(x, y)` says so. */
function picture(cols: number, rows: number, ss: number, paint: (x: number, y: number) => boolean, rgb = [200, 40, 10]): Uint8ClampedArray {
  const W = cols * ss, H = rows * ss, px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (paint(x, y)) px.set([...rgb, 255], (y * W + x) * 4);
  return px;
}

describe("averageCells", () => {
  test("a cell's colour is its shape's colour, and only its coverage falls at an edge", () => {
    const out = new Float32Array(2 * 1 * 4);
    averageCells(picture(2, 1, 4, (x) => x < 6), 2, 1, 4, out);
    expect([...out.slice(0, 4)]).toEqual([200, 40, 10, 1]);
    expect([...out.slice(4, 8)]).toEqual([200, 40, 10, 0.5]);
  });
  test("for a comb, odd rows read the window half a cell to the left, where their cells sit", () => {
    // Only cell 0's column is painted: even rows see it whole in cell 0; odd rows straddle it.
    const px = picture(3, 2, 4, (x) => x < 4), out = new Float32Array(3 * 2 * 4);
    averageCells(px, 3, 2, 4, out, true);
    const a = (i: number, j: number) => out[(j * 3 + i) * 4 + 3];
    expect([a(0, 0), a(1, 0), a(2, 0)]).toEqual([1, 0, 0]);
    expect([a(0, 1), a(1, 1), a(2, 1)]).toEqual([1, 0.5, 0]);
  });
});

test("a cell shows nothing below the soft edge, whole at the threshold, and grows in between", () => {
  expect(cellSize(0.05, 0.12, 0.5)).toBe(0);
  expect(cellSize(0.5, 0.12, 0.5)).toBe(1);
  const sizes = [0.12, 0.2, 0.3, 0.4, 0.49].map((a) => cellSize(a, 0.12, 0.5));
  for (let k = 1; k < sizes.length; k++) expect(sizes[k]!).toBeGreaterThan(sizes[k - 1]!);
});

test("a comb's grid has a column and a row to spare, so the offset rows still cover the edges", () => {
  const style = resolveStyle({ cell: [16, 0] }, DARK);
  const g = gridFor({ w: 160, h: 140, dpr: 1 }, style);
  expect(g.hex).toBe(true);
  expect(g.cols).toBe(11);
  expect(g.rows).toBe(Math.ceil(140 / (16 * Math.sqrt(3) / 2)) + 1);
});

describe("ascii", () => {
  /** Draw `paint` into one cell of 8 x 8 samples, 9 x 13 px, and read the character it gets. */
  const glyphFor = (paint: (x: number, y: number) => boolean) => {
    const px = picture(1, 1, 8, (x, y) => paint(x / 8, y / 8)), out = new Float32Array(6);
    cellShapes(px, 1, 1, 8, 9, 13, out);
    return ASCII_EDGES[edgeGlyph({ cov: out[0]!, cx: out[1]!, cy: out[2]!, aniso: out[3]!, angle: out[4]!, len: out[5]! })];
  };
  test("a thin stroke is drawn as the line character that runs its way", () => {
    expect(glyphFor((x, y) => Math.abs(y - 0.45) < 0.1)).toBe("-");
    expect(glyphFor((x) => Math.abs(x - 0.5) < 0.12)).toBe("|");
    // y runs down: down to the right is a backslash, up to the right a slash (in CSS pixels of a 9 x 13 cell).
    expect(glyphFor((x, y) => Math.abs(y * 13 - x * 9 - 2) < 1.4)).toBe("\\");
    expect(glyphFor((x, y) => Math.abs((1 - y) * 13 - x * 9 - 2) < 1.4)).toBe("/");
    expect(glyphFor((x, y) => y > 0.82)).toBe("_");
  });
  test("a shape's edge is the light character that sits where the shape does", () => {
    expect(glyphFor((x, y) => y > 0.8 && x > 0.35 && x < 0.65)).toBe(".");
    expect(glyphFor((x, y) => y < 0.2 && x > 0.35 && x < 0.65)).toBe("'");
    expect(glyphFor((x, y) => x > 0.6 && y > 0.1 && y < 0.9)).toBe("(");
    expect(glyphFor((x, y) => x < 0.4 && y > 0.1 && y < 0.9)).toBe(")");
  });
  test("a body's character is sparse on bright skin and dense in shadow", () => {
    expect(bodyGlyph(0.95, 10)).toBe(0);
    expect(bodyGlyph(0.05, 10)).toBe(9);
    expect(bodyGlyph(0.5, 10)).toBeGreaterThan(bodyGlyph(0.8, 10));
  });
});

describe("ink", () => {
  const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
  /** A character's bitmap, 16 x 24 (a slot), inked where `paint(x, y)` (0..1 each way), and its measured coverage. */
  const glyph = (slot: number, paint: (x: number, y: number) => boolean) => {
    const w = 16, h = 24, px = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (paint((x + 0.5) / w, (y + 0.5) / h)) px[(y * w + x) * 4 + 3] = 255;
    return { slot, cover: measureShape(px, w, 0, 0, w, h) };
  };
  /** An even fill character covering about `share` of its cell (a dither of that density). */
  const even = (slot: number, share: number) => glyph(slot, (x, y) => ((Math.floor(x * 16) * 7 + Math.floor(y * 24) * 3) % 10) / 10 < share);
  const EDGES = { 10: "_", 11: "|", 12: "[", 13: "/", 14: "-" } as Record<number, string>;
  const set = inkGlyphs(
    [even(1, 0.6), even(0, 0), even(3, 0.1), even(2, 0.3)],
    [glyph(10, (x, y) => y > 0.84), glyph(11, (x) => Math.abs(x - 0.5) < 0.12), glyph(12, (x) => x < 0.22), glyph(13, (x, y) => Math.abs((1 - y) - x) < 0.13), glyph(14, (x, y) => Math.abs(y - 0.5) < 0.07)],
  );
  /** A cell's samples (INK_SX x INK_SY, RGBA), coloured by `paint(x, y)` (0..1 each way) as sRGB 0..255. */
  const cellPx = (paint: (x: number, y: number) => readonly number[]) => {
    const px = new Uint8ClampedArray(INK_SX * INK_SY * 4);
    for (let v = 0; v < INK_SY; v++) for (let u = 0; u < INK_SX; u++) px.set([...paint((u + 0.5) / INK_SX, (v + 0.5) / INK_SY), 255], (v * INK_SX + u) * 4);
    return px;
  };
  const read = (paint: (x: number, y: number) => readonly number[], dark = true) => { const c = inkCell(); readInkCell(cellPx(paint), INK_SX, 0, 0, dark, c); return c; };
  const pick = (paint: (x: number, y: number) => readonly number[], dark = true) => {
    const p = inkPick(read(paint, dark).tone, set);
    return p[0] === 0 ? "none" : p[0] === 1 ? EDGES[set.edges[p[1]]!]! : `fill ${set.fill[p[1]]}`;
  };
  const W = [255, 255, 255], K = [0, 0, 0];

  test("a cell with an edge in it takes the edge character shaped like it: low `_`, down the middle `|`, a left side `[`, a diagonal `/`", () => {
    expect(pick((x, y) => (y > 0.66 ? W : K))).toBe("_");
    expect(pick((x) => (x > 0.33 && x < 0.67 ? W : K))).toBe("|");
    expect(pick((x) => (x < 0.33 ? W : K))).toBe("[");
    expect(pick((x, y) => (Math.abs((1 - y) - x) < 0.2 ? W : K))).toBe("/");
    expect(pick((x, y) => (y > 0.33 && y < 0.67 ? W : K))).toBe("-");
  });
  test("a flat cell takes an even fill, denser the brighter it is; a dark one takes nothing", () => {
    const at = (v: number) => pick(() => [v, v, v]);
    expect(at(8)).toBe("none");
    // Fills by their measured coverage: slot 3 (0.1) < slot 2 (0.3) < slot 1 (0.6).
    expect([at(110), at(170), at(255)]).toEqual(["fill 3", "fill 2", "fill 1"]);
  });
  test("a flat stretch between two fills mixes them, dithered, as much of each as its tone lies between them, and not one character in every cell", () => {
    // A tone 0.4 of the way from the 0.3 fill to the 0.6 one (as a share of the densest): over any 4 x 4
    // block of cells about 40% take the denser fill and the rest the sparser, never a third.
    const lo = set.levels[2]!, hi = set.levels[3]!, tone = new Float32Array(9).fill(lo + (hi - lo) * 0.4);
    const counts = new Map<number, number>();
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      const p = inkPick(tone, set, inkDither(i, j));
      counts.set(p[0] === 2 ? p[1] : -1, (counts.get(p[0] === 2 ? p[1] : -1) ?? 0) + 1);
    }
    expect(Object.fromEntries(counts)).toEqual({ 2: 10, 3: 6 });
    // A block a step along takes the same pattern: it is fixed to the cells, so it never shimmers.
    expect(inkDither(1, 2)).toBe(inkDither(5, 6));
  });

  test("the fill is ordered by measured coverage, whatever order it is given in, the densest at level 1", () => {
    expect(set.fill).toEqual([0, 3, 2, 1]);
    expect(set.levels[0]).toBe(0);
    expect(set.levels[3]).toBeCloseTo(1, 5);
    for (let k = 1; k < set.levels.length; k++) expect(set.levels[k]!).toBeGreaterThan(set.levels[k - 1]!);
  });
  test("a cell across an edge takes its bright side's colour, not the mean of both sides", () => {
    const c = read((x) => (x < 0.5 ? [230, 40, 30] : [10, 60, 20]));
    expect(c.ink[0]!).toBeGreaterThan(0.85);
    expect(c.ink[1]!).toBeLessThan(0.2);
    // On a light page the character is the dark part: here, the dark green.
    const l = read((x) => (x < 0.5 ? [230, 200, 190] : [10, 60, 20]), false);
    expect(l.ink[1]!).toBeGreaterThan(l.ink[0]! * 2);
  });
  test("a character's colour is averaged in linear light, so a mix of two bright colours does not dull", () => {
    // Red and a green of the same brightness on the bright side, black below: averaged as sRGB numbers
    // the red would sit at 0.5; in linear light it is 0.71.
    const c = read((x, y) => (y > 0.66 ? K : (Math.floor(x * INK_SX) + Math.floor(y * INK_SY)) % 2 ? [0, 182, 0] : [255, 0, 0]));
    expect(c.ink[0]!).toBeGreaterThan(0.68);
    expect(c.ink[1]!).toBeGreaterThan(0.48);
  });
  test("on a light look tone is darkness: a dark cell asks for ink, a pale one for none", () => {
    expect(read(() => [20, 20, 20], false).tone[4]!).toBeGreaterThan(0.8);
    expect(pick(() => [250, 250, 250], false)).toBe("none");
  });
  test("an edge in a dim part of the picture shows dimmer than one in a bright part", () => {
    const st = (v: number) => (inkPick(read((x, y) => (y > 0.66 ? [v, v, v] : K)).tone, set) as number[])[2]!;
    expect(st(255)).toBeGreaterThan(st(150));
  });
  test("on a dark look a character is lifted toward its colour's full brightness, its hue kept", () => {
    const [r, g, b] = inkColour(0.3, 0.2, 0.1, true);
    expect(Math.max(r, g, b)).toBeGreaterThan(0.75);
    expect(r > g && g > b).toBe(true);
  });
  test("pushing a colour's chroma never clips it: the channels keep their proportions round its grey", () => {
    // A saturated orange: pushed 1.35 times as is, red would pass 1 and blue fall below 0.
    const [r, g, b] = inkColour(1, 0.7, 0.1, true), l = lum(r, g, b);
    for (const c of [r, g, b]) { expect(c).toBeLessThanOrEqual(1); expect(c).toBeGreaterThanOrEqual(0); }
    // The push stops where a channel would leave 0..1, so (r - l) : (b - l) stays as it was and the hue holds.
    const l0 = lum(1, 0.7, 0.1);
    expect((r - l) / (b - l)).toBeCloseTo((1 - l0) / (0.1 - l0), 2);
  });
  test("a stroke in ink shows as strongly as its colour is bright (dark, on a light look), as a character's density does", () => {
    expect(inkStrokeAlpha(0.8, 0.8, 0.8, true)).toBeGreaterThan(inkStrokeAlpha(0.3, 0.3, 0.3, true));
    expect(inkStrokeAlpha(0.03, 0.03, 0.03, true)).toBeLessThan(0.15);
    expect(inkStrokeAlpha(0.3, 0.3, 0.3, false)).toBeGreaterThan(inkStrokeAlpha(0.8, 0.8, 0.8, false));
  });
  test("on a light look a character is deeper than its colour", () => {
    const [r, g, b] = inkColour(0.6, 0.5, 0.3, false);
    expect(lum(r, g, b)).toBeLessThan(lum(0.6, 0.5, 0.3) * 0.7);
  });
});
