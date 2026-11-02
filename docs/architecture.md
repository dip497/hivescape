# How Hivescape works

A scene says what is there. Hivescape decides how it is shown. That split is the whole design: a
scene written once can be a lit honeycomb, terminal-style ascii, pixels, a plain illustration or the
characters of an ASCII shader (ink), and it runs in a page, a worker or a Hivemind wallpaper without knowing which.

```
 scene                          renderer                                  layers
 ─────                          ────────                                  ──────
 backdrop()  ──(rarely)───────────────────────────────────────────────▶  backdrop canvas (2D, full resolution)
 picture()   ──every frame──▶ picture canvas, 4×4 samples a cell ──┐
 light()     ──every frame──▶ light canvas, 2×2 samples a cell ────┼──▶ backend ──▶ cells canvas (WebGL2 or 2D)
 overlay()   ──every frame──▶ marks: characters and dots ──────────┘
 front()     ──every frame───────────────────────────────────────────▶  front canvas (2D, full resolution)
 spots()     ──after each frame──▶ where each agent's creature is ──▶  the host's hit test
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

## Agents

`world.agents` lists the person's agents (at most eight): an opaque `id`, the `program`, a `kind`
(0..1, the same for every agent of one program, so one program is one kind of creature), a `size`
and a `state` (`working`, `ready`, `needs-you`, `resting`). `world.tiles` says where the tiles and
panels are, an agent's own tile named by its id. `done(s, id)` is called when an agent finishes a
turn well. `spots(s)` answers, after each frame, where each agent's creature is (circles); the host
keeps the latest and answers its hit test from them at once, on its own thread, even when the scene
runs in a worker. In Hivemind, that is how the app names the agent under the pointer and takes a
click there to its tile.

A creature that must stay crisp (an agent's, whose state matters) is painted in `front`, over the
cells at full resolution; the world around it stays cells. In ascii a scene paints its creatures in
`picture` instead, so they are characters too.

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
  Apiary finds the block under the pointer by trying each column height, highest first.

## Styles

`packages/core/src/style.ts` holds the defaults. A scene suggests a style; the host may choose
another kind, and then only the scene's light settings (`ambient`, `key`, `glow`) carry over, not
its tuning for its own kind.

- **comb**: pointy-topped hexagons. A cell's row step is √3/2 of its width, so they are regular,
  and odd rows sit half a cell to the left. A partly covered cell is drawn smaller, its area
  following its coverage, so edges stay soft without blur.
- **ascii**: cells as a terminal's, 9 × 13 px. Each cell is read as a shape from its 4 × 4
  samples (`cellShapes`: coverage, where the covered part sits, how much it is a stroke, which
  way and how long), and `ascii.ts` picks its character:
  - a body cell is a block of its colour, with a 1 px seam, and a character cut darker into it
    from the ramp (sparse on bright skin, dense in shadow, with a fixed per-cell grain);
  - an edge cell is a light character alone, where the shape sits: `.` `,` low, `'` `"` high,
    `(` `)` along a side, `-` `:` through the middle;
  - a stroke through a cell is a line character along it: `-` `|` `/` `\` and `_` low.
  A night scene's low ambient is lifted to at least 0.65 here, so characters still read.
- **pixel**: square cells, with an optional bevel.
- **native**: the picture itself at the screen's resolution, lit and glowing, with no cells.
- **ink**: the whole frame in characters that carry the picture's light, made for paintings and
  photographs. The backdrop is drawn into the picture, which is sampled 3 × 3 a cell: one sample for
  each of a cell's nine regions (three across, so a bar down the middle is its own column, and three
  down). `ascii.ts` (`readInkCell`, `inkPick`, `inkGlyphs`) and `frame.ts` (`INK`, `inkColour`) hold
  the rules both backends follow:
  - each region's tone is its brightness (its darkness, on a light look), bent by a curve and
    rounded to ten levels;
  - a cell whose regions differ by enough is an edge: it takes the edge character (`INK_EDGES`:
    `_ - | / \ ( ) [ ] ^ ' " , . < > ~`) whose shape, measured out of the atlas and taken against
    its own most covered region, is nearest the cell's (each region against the brightest, sharpened),
    as bright as the cell's brightest region;
  - any other cell is a fill: the style's ramp (` .:;+*%#@`), sorted by each character's measured
    coverage, gives the character as dense as the cell is bright on average, mixing the two either
    side of it by a 4 x 4 ordered dither fixed to the cells (`inkDither`), so a flat stretch is a fine
    even texture and not one character in every cell, which read as rows of text; the blank draws
    nothing. A painting's cell is 7 x 10 px and its characters 1.15 of its height, so one row's
    characters nearly meet the next's: at 7 x 13 the gaps between rows showed as lines;
  - the character's colour is the mean, in linear light, of the cell's samples on its bright side
    (dark side, on a light look), its chroma pushed out as far as it stays in gamut, and lifted
    toward its full brightness on a dark look (deepened on a light one), so a dark cell is dark
    because its character is small, not because it is muddy;
  - beneath, a dim ground of the picture (washed toward the page, on a light look); on a dark look
    the characters glow, their own light spread to a quarter and an eighth of the CSS size.

  `@hivescape/paintings` builds scenes for it from photographs and paintings, which move only where
  they would in life. The picture is composed once, when it is decoded: cropped, its tones stretched
  if faded, and (with `sharp`) softened by depth, each of six depth bands blurred for its distance
  from the focus. Each frame it is drawn whole and still; then each moving region is composed in a
  scratch canvas the size of its box and kept inside its soft outline: a flow is two copies sliding
  along the flow and cross-fading, each invisible at the moment it jumps back; wind is the region in
  thin rows, each swaying a few pixels on its own beat, under its light: an image of one pixel a
  patch (a gust's band sweeping across, and each patch's flutter), drawn scaled up and smooth in one
  go. A region's `except` outlines are cut out of its mask, so what stands in it holds still.

  `strokes` draws a region as free strokes instead, off the cell grid, through the overlay's
  `stroke` (instanced round-ended quads on the GPU; on the 2D canvas one path per colour, strength
  and width, each stroked once). When the picture is decoded its pixels are kept and its grain
  measured (`grainOf`: the structure tensor of its brightness, at mask size, smoothed); strokes are
  seeded once per size (`seedStrokes`) through the region, less its `except` outlines and wherever
  its `on` test of the picture's colour fails, each along the grain as far as `follow` and `lean`
  allow. Each frame a blade bends from its root (`bendAt`: away from the wind, in gusts that travel
  across) or a ray drifts along its curtain (`driftAt`), and takes the picture's colour under it;
  the cells beneath give way (the region's mask, where strokes grow, drawn over the picture in the
  ground's colour). In ink a stroke is lifted as a character's colour is and shows as strongly as
  its tone (`inkStrokeAlpha`).

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

In ink, the renderer measures every ink character's coverage in the nine regions out of the atlas
once per atlas version (`Renderer.inkGlyphs`), and both backends take the same lists. The 2D path
reads each cell, picks its character (cached on the rounded reading), writes the pixels it covers,
read once out of the atlas, in its colour, into one image laid over the dim ground, and adds its
glow from a quarter- and an eighth-size copy of that image. The GPU reads and picks per instance in
the vertex shader, draws the ground in the full-screen pass and, on a dark look, the characters
into a framebuffer of their own, whose mip chain gives the glow at the same CSS spread; a last
full-screen pass lays them and their glow over the ground.

A native scene (its whole picture at full resolution) gains nothing from WebGL and would upload a
full-resolution picture every frame there; when the backend is left to choose, `Engine` draws a
scene whose style is native on the 2D canvas.

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
