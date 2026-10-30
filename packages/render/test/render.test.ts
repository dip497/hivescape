import { describe, expect, test } from "bun:test";
import { averageCells, cellShapes } from "../src/kernel.ts";
import { ASCII_EDGES, bodyGlyph, edgeGlyph } from "../src/ascii.ts";
import { cellSize } from "../src/frame.ts";
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
