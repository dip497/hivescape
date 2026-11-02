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

Measured 2026-11-02 in a container with no GPU. WebGL is SwiftShader; Canvas2D is Skia on the CPU.
Its comb is finer than it was (10 px cells with a 1 px gap, from 13 px and 2): 15,225 cells, from
9,072. The same container ran the styles that did not change (ascii, native) 15 to 80% slower than
on 2026-10-30, so compare one row with another of the same run, not with older numbers.

| Backend | Style | Pixel ratio | Cells | Script per frame (median / p90) |
|---|---|---|---|---|
| webgl2 | comb | 1 | 15225 | 5.7 / 13.5 ms |
| webgl2 | comb | 2 | 15225 | 5.4 / 8.1 ms |
| webgl2 | ascii | 1 | 11200 | 4.5 / 6.7 ms |
| webgl2 | ascii | 2 | 11200 | 5.2 / 7.1 ms |
| webgl2 | pixel | 1 | 20340 | 7.4 / 10.8 ms |
| webgl2 | native | 1 | — | 17.0 / 19.6 ms |
| webgl2 | native | 2 | — | 45.8 / 51.4 ms |
| webgl2 | ink | 1 | 13500 | 4.5 / 6.7 ms |
| canvas2d | comb | 1 | 15225 | 14.3 / 16.8 ms |
| canvas2d | comb | 2 | 15225 | 15.4 / 18.6 ms |
| canvas2d | ascii | 1 | 11200 | 17.2 / 21.2 ms |
| canvas2d | ascii | 2 | 11200 | 16.8 / 20.6 ms |
| canvas2d | pixel | 1 | 20340 | 15.5 / 19.9 ms |
| canvas2d | native | 1 | — | 9.1 / 11.2 ms |
| canvas2d | native | 2 | — | 21.0 / 28.6 ms |
| canvas2d | ink | 1 | 13500 | 11.1 / 14.8 ms |

The Hive, with its bees on the full-resolution front layer, at the same size and on the same
machine: comb 4.2 ms on WebGL and 11.1 ms on Canvas2D at ratio 1 (4.7 and 11.7 at 2); ascii
2.6 ms and 14.3 ms (2.6 and 15.5 at 2).

Garden of the day, native, on Canvas2D: 4.4 ms at ratio 1 and 7.4 ms at 2 (on WebGL it was 9.6 and
34.4 ms, the full-resolution upload; so a native scene now takes the 2D canvas when the backend is
left to choose). In ascii: 3.0 ms on WebGL and 11.7 ms on Canvas2D.

The living pictures, in ink, 14 420 cells, at 1440 x 900 (measured 2026-11-01, same machine):
Ejiri (its field as blades in the gale, its trees and sky in the wind) 6.5 ms on WebGL
and 16.3 ms on Canvas2D; Aurora (its curtains as rays) 6.5 ms and 16.3 ms; The Harvest 7.3 ms and
12.6 ms. Ejiri's field as swaying rows of picture took 8.7 and 19.0 ms: its strokes cost less. On
the GPU a stroke is one instanced quad; on the 2D canvas they are one path per colour, strength and
width, stroked once each. The picture is composed once and drawn whole; only its
moving regions are composed each frame, inside their own boxes. Ink reads each cell from 3 x 3
samples, one for each of its nine regions. At 6 x 6 (four samples a region, averaged in linear
light) the picture the scene paints each frame was four times the size, and Ejiri took 22.8 ms on
WebGL and 44.4 ms on Canvas2D for characters that read the same.

On the 2D path a cell's tone comes from a table, not a power and a root per region, and its
character is cached on its rounded reading, so an edge is matched once per distinct cell. Writing
only the cells whose samples and light changed did not pay: the living pictures change 40 to 80% of
their cells every frame (wind, a breathing glow), and the check cost more than it saved. The 2D path
writes every character into one image and its glow into a quarter- and an eighth-size copy:
stamping a character per cell with the canvas took 61.4 ms.

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

- The **picture is sampled at 4 × 4 a cell (3 × 3 in ink), and the light at 2 × 2**, not at screen resolution.
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
