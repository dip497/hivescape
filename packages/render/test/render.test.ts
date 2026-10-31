import { describe, expect, test } from "bun:test";
import { averageCells, cellShapes } from "../src/kernel.ts";
import { ASCII_EDGES, bodyGlyph, edgeGlyph, INK_EDGES, inkDensity, inkEdge, inkGradient, inkSpread } from "../src/ascii.ts";
import { JOINED } from "../src/atlas.ts";
import { cellSize, inkColours, inkDetail, inkStrength, inkTone } from "../src/frame.ts";
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
  test("a flat cell keeps near its own colour; detail darkens the ground and brightens the character", () => {
    const [fr, fg, fb, ir, ig, ib] = inkColours(0.6, 0.5, 0.3, true, 0);
    const [dr, dg, db, jr, jg, jb] = inkColours(0.6, 0.5, 0.3, true, 1);
    // Flat: the ground stays within a fifth of the cell's brightness, so a sky still reads as sky.
    expect(lum(fr, fg, fb)).toBeGreaterThan(lum(0.6, 0.5, 0.3) * 0.8);
    expect(lum(dr, dg, db)).toBeLessThan(lum(fr, fg, fb) * 0.7);
    // The character stands further off its ground where there is detail.
    expect(lum(jr, jg, jb) / lum(dr, dg, db)).toBeGreaterThan(2 * (lum(ir, ig, ib) / lum(fr, fg, fb)));
  });
  test("on a light look the ground is washed and the character deeper than the colour", () => {
    const [gr, gg, gb, cr, cg, cb] = inkColours(0.6, 0.5, 0.3, false, 1);
    expect(lum(gr, gg, gb)).toBeGreaterThan(lum(0.6, 0.5, 0.3));
    expect(lum(cr, cg, cb)).toBeLessThan(lum(0.6, 0.5, 0.3) * 0.6);
  });
  test("a cell's detail is the spread of its brightness: none in a flat cell, full in a sharp one", () => {
    const flat = new Array(16).fill(0.7), checker = Array.from({ length: 16 }, (_, k) => ((k + (k >> 2)) & 1 ? 0.9 : 0.1));
    expect(inkDetail(inkSpread(flat, 16))).toBeLessThan(1e-4);
    expect(inkDetail(inkSpread(checker, 16))).toBe(1);
    expect(inkStrength(1)).toBe(1);
    expect(inkStrength(0)).toBeLessThan(0.5);
  });
  test("a flat bright sky takes a lighter character than the same brightness full of detail", () => {
    const n = 12;
    expect(inkDensity(inkTone(0.8, true, 0), n)).toBeLessThan(inkDensity(inkTone(0.8, true, 1), n) - 2);
    // On a light look the ramp runs the other way: dark cells are dense.
    expect(inkDensity(inkTone(0.1, false, 1), n)).toBeGreaterThan(inkDensity(inkTone(0.9, false, 1), n));
  });
  test("an edge is drawn as a joined line along it, so neighbouring cells make one line", () => {
    // Samples 4 x 4, row by row: bright above, dark below, a level edge; then bright left, dark right.
    const level = Array.from({ length: 16 }, (_, k) => (k < 8 ? 0.9 : 0.1));
    const upright = Array.from({ length: 16 }, (_, k) => (k % 4 < 2 ? 0.9 : 0.1));
    const [lx, ly] = inkGradient(level, 4), [ux, uy] = inkGradient(upright, 4);
    expect(INK_EDGES[inkEdge(lx, ly, 7, 13)]).toBe(JOINED.across);
    expect(INK_EDGES[inkEdge(ux, uy, 7, 13)]).toBe(JOINED.down);
  });
});
