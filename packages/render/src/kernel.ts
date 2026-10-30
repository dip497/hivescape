/**
 * The CPU path's one hot loop: average a picture of `ss x ss` samples a cell into one colour and
 * coverage per cell. Colours are averaged weighted by alpha, so a shape's edge keeps its colour and
 * only its coverage falls. With `hex`, odd rows are read half a cell to the left, where a comb's
 * odd rows sit (the GPU reads the same window). Pure, over typed arrays, with no allocation: a
 * WebAssembly kernel can replace it behind the same signature (see docs/performance.md).
 */
export function averageCells(px: Uint8ClampedArray, cols: number, rows: number, ss: number, out: Float32Array, hex = false): void {
  const W = cols * ss, rw = W * 4;
  for (let j = 0; j < rows; j++) {
    const shift = hex && j & 1 ? -(ss >> 1) : 0;
    for (let i = 0; i < cols; i++) {
      const u0 = Math.max(0, i * ss + shift), u1 = Math.min(W, i * ss + shift + ss);
      let r = 0, g = 0, b = 0, a = 0;
      for (let v = 0; v < ss; v++) {
        for (let u = u0, p = (j * ss + v) * rw + u0 * 4; u < u1; u++, p += 4) {
          const al = px[p + 3]!;
          r += px[p]! * al; g += px[p + 1]! * al; b += px[p + 2]! * al; a += al;
        }
      }
      const o = (j * cols + i) * 4, n = Math.max(1, (u1 - u0) * ss * 255);
      if (a > 0) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; out[o + 3] = a / n; }
      else { out[o] = 0; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = 0; }
    }
  }
}

/**
 * The ascii style's reading of each cell from the same `ss x ss` samples: its coverage, where the
 * covered part sits (0..1 across and down), how much it is a stroke (0 round .. 1 a line) and the
 * stroke's direction (radians, y down) and length (a share of the cell's longer side). Moments are
 * taken in CSS pixels, `cw x ch` a cell, so a tall cell's diagonal is a diagonal. Six numbers a cell
 * into `out`.
 */
export function cellShapes(px: Uint8ClampedArray, cols: number, rows: number, ss: number, cw: number, ch: number, out: Float32Array): void {
  const rw = cols * ss * 4, n = ss * ss;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      let s = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
      for (let v = 0; v < ss; v++) {
        const y = ((v + 0.5) / ss) * ch;
        for (let u = 0, p = (j * ss + v) * rw + i * ss * 4; u < ss; u++, p += 4) {
          const w = px[p + 3]! / 255;
          if (w === 0) continue;
          const x = ((u + 0.5) / ss) * cw;
          s += w; sx += w * x; sy += w * y; sxx += w * x * x; syy += w * y * y; sxy += w * x * y;
        }
      }
      const o = (j * cols + i) * 6;
      out[o] = s / n;
      if (s <= 0) { out[o + 1] = 0.5; out[o + 2] = 0.5; out[o + 3] = 0; out[o + 4] = 0; out[o + 5] = 0; continue; }
      const mx = sx / s, my = sy / s;
      const a = sxx / s - mx * mx, b = syy / s - my * my, c = sxy / s - mx * my;
      out[o + 1] = mx / cw; out[o + 2] = my / ch;
      out[o + 3] = a + b > 1e-6 ? Math.sqrt((a - b) * (a - b) + 4 * c * c) / (a + b) : 0;
      out[o + 4] = 0.5 * Math.atan2(2 * c, a - b);
      // A stroke of length L spread evenly has variance L² / 12 along it.
      const major = (a + b) / 2 + Math.sqrt(((a - b) / 2) ** 2 + c * c);
      out[o + 5] = Math.sqrt(12 * major) / Math.max(cw, ch);
    }
  }
}
