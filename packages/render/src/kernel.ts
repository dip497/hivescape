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
