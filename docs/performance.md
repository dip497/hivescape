# What Hivescape costs

A background runs all day behind the work. It must leave the machine to the work. Hivemind stops
a live wallpaper that takes more than 60% of a core.

## How to measure

```bash
node packages/cli/bin/hivescape.mjs bench scenes/campfire
```

It runs the scene in headless Chromium for each backend, style and pixel ratio, with the frame cap
and vsync off. It reports the script time per frame (median and 90th percentile) and the frames a
second.

**Read the WebGL rows' frames a second with care.** A machine without a GPU (CI, a container, xvfb)
runs WebGL on SwiftShader, which shades every fragment on the CPU. The script time there is still
the real cost on the main thread or the worker; the frame rate is not. Measure on a real GPU before
quoting one.

## Campfire at 1440 × 900

Measured 2026-10-30 in a container with no GPU. WebGL is SwiftShader; Canvas2D is Skia on the CPU.

| Backend | Style | Pixel ratio | Cells | Script per frame (median / p90) |
|---|---|---|---|---|
| webgl2 | comb | 1 | 9072 | 2.5 / 4.2 ms |
| webgl2 | comb | 2 | 9072 | 2.4 / 3.6 ms |
| webgl2 | ascii | 1 | 11200 | 3.9 / 4.6 ms |
| webgl2 | ascii | 2 | 11200 | 3.8 / 4.2 ms |
| webgl2 | pixel | 1 | 20340 | 4.0 / 6.5 ms |
| webgl2 | native | 1 | — | 9.3 / 16.9 ms |
| webgl2 | native | 2 | — | 30.9 / 37.3 ms |
| canvas2d | comb | 1 | 9072 | 11.2 / 14.3 ms |
| canvas2d | comb | 2 | 9072 | 11.3 / 13.9 ms |
| canvas2d | ascii | 1 | 11200 | 15.5 / 17.3 ms |
| canvas2d | ascii | 2 | 11200 | 15.1 / 17.7 ms |
| canvas2d | pixel | 1 | 20340 | 12.9 / 13.8 ms |
| canvas2d | native | 1 | — | 4.3 / 5.8 ms |
| canvas2d | native | 2 | — | 9.0 / 11.2 ms |

The Hive, with its bees on the full-resolution front layer, at the same size and on the same
machine: comb 4.2 ms on WebGL and 11.1 ms on Canvas2D at ratio 1 (4.7 and 11.7 at 2); ascii
2.6 ms and 14.3 ms (2.6 and 15.5 at 2).

Garden of the day, native, on Canvas2D: 4.4 ms at ratio 1 and 7.4 ms at 2 (on WebGL it was 9.6 and
34.4 ms, the full-resolution upload; so a native scene now takes the 2D canvas when the backend is
left to choose). In ascii: 3.0 ms on WebGL and 11.7 ms on Canvas2D.

The living paintings, in ink, 14 420 cells, on the same machine: on WebGL 3.2 ms at ratio 1 and
3.3 ms at 2 (The Harvest). On Canvas2D, The Harvest takes 14.0 ms at ratio 1 and 14.3 ms at 2, and
Sudden Shower, whose rain changes the most cells, 17.1 and 17.6 ms. Drawn naively, a character
stamped in every cell every frame, The Harvest took 61.4 ms on Canvas2D; the stamps are now kept
and only changed cells restamped.

At 30 frames a second, a frame may take 33 ms. Below 20 ms of script, the scene stays under
Hivemind's 60% limit.

What the numbers say:

- **On the GPU, a frame costs the scene's own painting and little else**: 2.3 to 4 ms, whatever
  the cell count or pixel ratio.
- **The CPU path's cost is flat in the cell count and the pixel ratio.** It draws five full-layer
  images, not one shape per cell. In an earlier version, which drew each cell as a path with a
  bevel stamped on it, Campfire's comb took 28.8 ms at ratio 1 and 54.7 ms at ratio 2. The
  characters of the earlier glyph style took 941 ms at ratio 2, because it tinted a whole atlas for
  each new colour; ascii tints one character slot at a time, and draws a body's cut characters from
  one black copy at a fixed strength, so they need no tint at all.
- **Native on WebGL uploads a full-resolution picture every frame.** On SwiftShader that upload is
  a CPU copy: 9 ms at ratio 1 and 31 ms at ratio 2. With a GPU-backed canvas it is a copy on the
  GPU. If a native scene is heavy, show it on the 2D backend.

## Choices made for cost

- The **picture is sampled at 4 × 4 a cell, and the light at 2 × 2**, not at screen resolution.
  Painting is the biggest share of a frame, and it scales with these sizes, not with the screen.
- **The GPU averages the cells** (mipmaps) and **places them** (instancing). The CPU uploads two
  small textures and a few uniforms.
- **The backdrop is drawn only when the size or the look changes.** Gradients, stars and ridges
  cost nothing per frame.
- **At most 30 frames a second, on a fixed step.** A slow machine skips frames, not time, and
  catches up at most four steps after a stall.
- **WebAssembly is not used yet.** Measured against a Rust kernel: the per-cell averaging was 0.42
  ms in JavaScript against 0.34 ms in WebAssembly, and boids at 1000 were 2.0 ms against 1.6 ms. A
  1.2× gain does not pay for a toolchain in every build. `averageCells` keeps a signature a
  kernel can take over.
