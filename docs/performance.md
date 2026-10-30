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
| webgl2 | glyph | 1 | 8480 | 2.3 / 4.5 ms |
| webgl2 | pixel | 1 | 20340 | 4.0 / 6.5 ms |
| webgl2 | native | 1 | — | 9.3 / 16.9 ms |
| webgl2 | native | 2 | — | 30.9 / 37.3 ms |
| canvas2d | comb | 1 | 9072 | 11.2 / 14.3 ms |
| canvas2d | comb | 2 | 9072 | 11.3 / 13.9 ms |
| canvas2d | glyph | 1 | 8480 | 6.9 / 7.6 ms |
| canvas2d | glyph | 2 | 8480 | 7.2 / 8.9 ms |
| canvas2d | pixel | 1 | 20340 | 12.9 / 13.8 ms |
| canvas2d | native | 1 | — | 4.3 / 5.8 ms |
| canvas2d | native | 2 | — | 9.0 / 11.2 ms |

At 30 frames a second, a frame may take 33 ms. Below 20 ms of script, the scene stays under
Hivemind's 60% limit.

What the numbers say:

- **On the GPU, a frame costs the scene's own painting and little else**: 2.3 to 4 ms, whatever
  the cell count or pixel ratio.
- **The CPU path's cost is flat in the cell count and the pixel ratio.** It draws five full-layer
  images, not one shape per cell. In an earlier version, which drew each cell as a path with a
  bevel stamped on it, Campfire's comb took 28.8 ms at ratio 1 and 54.7 ms at ratio 2. Glyph took
  941 ms at ratio 2, because it tinted a whole atlas for each new colour; it now tints one
  character slot at a time.
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
