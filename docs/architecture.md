# How Hivescape works

A scene says what is there. Hivescape decides how it is shown. That split is the whole design: a
scene written once can be a lit honeycomb, a glyph field, pixels or a plain illustration, and it
runs in a page, a worker or a Hivemind wallpaper without knowing which.

```
 scene                          renderer                                  layers
 ─────                          ────────                                  ──────
 backdrop()  ──(rarely)───────────────────────────────────────────────▶  backdrop canvas (2D, full resolution)
 picture()   ──every frame──▶ picture canvas, 4×4 samples a cell ──┐
 light()     ──every frame──▶ light canvas, 2×2 samples a cell ────┼──▶ backend ──▶ cells canvas (WebGL2 or 2D)
 overlay()   ──every frame──▶ marks: characters and dots ──────────┘
```

## The scene

`packages/core/src/scene.ts` is the contract. A scene has state of its own and these hooks:

- `create(world)` builds the state, full from the first frame: nothing waits to fly in.
- `step(state, dt, world)` moves it on by one fixed step of 1/60 s, whatever the display's rate.
- `backdrop` paints the ground at full resolution. It runs when the size or the look changes, or
  at `backdropRate` times a second, never every frame.
- `picture` paints the subjects, on transparent, in CSS pixels. The renderer samples it into cells.
- `light` paints what gives off light, added together on black (see below).
- `overlay` places exact marks: characters, and soft dots for embers, stars and fireflies.
- `click`, `resize` and `settle` (put things where they would be after a while, for a still frame).

`world` carries the size, the look (dark or light, and the host's page, text and accent colours),
the resolved style, the scene's own time, a seeded `rng`, the pointer (position, smoothed speed and
how long it has rested) and short-lived effects (ripples).

## Views

A view is how a scene turns its own world into the picture's pixels. Hivescape draws whatever is
painted, so a view is a helper, not a mode:

- **Top-down**: paint in screen coordinates (Koi Pond).
- **Side-on**: `parallax(camera, depth)` shifts each layer by its distance. Depth 0 is the horizon
  and never moves; depth 1 moves with the camera; a foreground above 1 passes faster.
  `layerScale(depth)` shrinks things toward the horizon. Campfire moves its camera a little after
  the pointer, so the layers part.
- **Isometric**: `isometric({ tile, ratio, origin })` maps ground `x, y` and height `z` to the
  screen (`toScreen`) and back (`toGround`, for the pointer). `depth()` gives the painter's order.

## Styles

`packages/core/src/style.ts` holds the defaults. A scene suggests a style; the host may choose
another kind, and then only the scene's light settings (`ambient`, `key`, `glow`) carry over, not
its tuning for its own kind.

- **comb**: pointy-topped hexagons. A cell's row step is √3/2 of its width, so they are regular,
  and odd rows sit half a cell to the left. A partly covered cell is drawn smaller, its area
  following its coverage, so edges stay soft without blur.
- **glyph**: a character a cell, chosen from the ramp by coverage and lightness, flickering
  slowly.
- **pixel**: square cells, with an optional bevel.
- **native**: the picture itself at the screen's resolution, lit and glowing, with no cells.

## Light

Each cell is shaded by three lights.

1. **The key light** comes from the upper left. `ambient` sets how much of it the picture gets:
   1 shows the picture's colours as painted. A night scene sets it low and lets its own lights do
   the work.
2. **The scene's lights.** `light()` is painted additively at two samples a cell and mipmapped. At
   each fragment the shader reads how much light is there, and which way it comes from: the slope
   of the light's brightness, a little overhead. It then shades the cell's bevel from that
   direction and puts a glint on the bevel that faces it. A cell sitting in very strong light (the
   fire itself) shines on its own instead of being shaded.
3. **The torch.** The pointer is a point light above the relief. It lights the cells within
   `torch` pixels from where it is, so their highlights move as it moves.

The scene's lights also glow over the ground. One full-screen pass, before the cells, adds two
blurred mip levels of the light layer.

A cell's relief is a signed-distance bevel: steep at the rim, flat on top, with a slight dome. Its
normal comes from the distance function's own slope (central differences), so it is exact at any
pixel ratio. A raised cell casts a soft shadow away from the key light. A ripple lifts the cells it
crosses: they rise toward the light, catch more of it, and their shadows lengthen.

## Backends

- **WebGL2** (`packages/render/src/gl.ts`) is used when the machine draws WebGL on a GPU. Software
  rasterisers such as SwiftShader and llvmpipe are refused, because they are slower than the 2D
  path. Each frame:
  1. Upload the picture and the light layer, and let the GPU build their mip chains.
  2. Draw the glow, or the native picture, in one full-screen pass.
  3. Draw the cells' shadows, then the cells, with one instanced draw each. The vertex shader reads
     each cell's colour and coverage from the mip chain. Level log2(SS) − 1, read bilinearly at the
     cell's centre, is exactly the average of that cell's window, even on an offset comb row.
  4. Draw the overlay with one instanced draw.

  That is four draw calls at most, whatever the cell count, and nothing is read back to the CPU.
- **Canvas2D** (`packages/render/src/c2d.ts`) is for everything else. It reads the picture and the
  lights back, averages them per cell (`averageCells`, which a WebAssembly kernel can replace
  behind the same signature) and lights each cell flat. It then writes one pixel a cell into a
  small image (two a cell across for a comb), scales that up in one draw, cuts it into cells with a
  mask, and lays the bevels over it. The mask and the bevels are drawn once per size. That is five
  full-layer draws a frame, whatever the cell count, with no cast shadows. The layer is kept at one
  device pixel per CSS pixel.

## Running

- `Engine` (`packages/runtime/src/engine.ts`) owns a scene's world, its clock and its renderer.
- The clock steps at a fixed 60 Hz and draws at most 30 frames a second. Its modes are:
  - `run`;
  - `hold`: nothing at all;
  - `still`: settle, draw once, and draw again only when something changes.

  A stall catches up at most four steps.
- `mount(element, scene)` stacks the two canvases in a page. It moves the scene into a worker when
  it can (`OffscreenCanvas`) and forwards the size, look, mode, pointer and clicks.
- `serveScene(scene)` is the whole of a scene's worker script.
- `@hivescape/hivemind`'s `runWallpaper(scene)` speaks Hivemind's live wallpaper protocol 1. It says
  `drawn` after the first frame.
