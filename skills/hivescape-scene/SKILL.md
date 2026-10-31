---
name: hivescape-scene
description: Design and write a Hivescape scene that looks finished and is its own: choosing the view (top-down, side-on, isometric) and the style (comb, ascii, pixel, native), painting colour apart from light, using the light layer and the torch, motion and interaction, originality, and cost. Use when making a new scene, reworking one that looks flat or generic, or adding a view or a light to one.
---

# Writing a Hivescape scene

A scene runs behind someone's work all day. It has to be beautiful at a glance, calm to live with,
and cheap. Read `packages/core/src/scene.ts` (the contract) and one of `scenes/*/src/index.ts`
before you start; Koi Pond is top-down, Campfire is side-on, Apiary is isometric.

## 1. Start from an idea that is yours

Write one sentence: *what is there, what it does on its own, and what it does when the person
points and clicks.* "Koi drift through a lily pond; they gather under a resting pointer; a click
drops food and they race for it." If the sentence could describe a scene someone else already made,
change it until it could not. Never copy another product's look, motifs, character ramps or
layouts, even to "match the style": take the idea from the subject itself (its place, its light,
its ritual) and go further than the obvious version.

## 2. Pick the view and the style together

| The subject | View | Style |
|---|---|---|
| Things moving over a ground: water, a field, a board | top-down | `comb` |
| A place with depth: a horizon, near and far, sky | side-on, layers with `parallax()` | `comb` |
| A built world, terraces, objects with tops and sides | `isometric()` | `native` (cells lose the detail) |
| Growing things, petals, birds: illustration | side-on | `native` (Garden of the day) |
| Anything meant to read as character art; type, code, signal | any | `ascii` |
| A painting or a photograph, alive | the painting's own | `ink`, with `@hivescape/paintings` |

For `ascii`, paint thin things (grass, reeds, rigging) as strokes about 2 px wide, so they come out
as `| / \ -`, and give flat areas some shading (a gradient down each tier, a lit side), because a
body's characters follow its lightness: a flat colour is a wall of one character.

Cells have a size: a comb cell of 13-15 px means a shape needs about 5 cells across to read. Size
creatures and objects for the cell, not for the screen: a koi is 170-240 px long and a third as
wide. If what you want to show cannot be read at 5 cells, choose `native` for that scene.

### A living painting

`defineMasterwork` (`@hivescape/paintings`) turns a painting into a scene, shown in `ink`. It is the
fastest way to a picture of the highest quality, and the right one for a tradition's own art (a
deity, a woodblock print, an ink landscape) that drawing it ourselves would only imitate.

1. **Find a painting that is free to use.** The Met's Open Access works are public domain under
   CC0: `https://collectionapi.metmuseum.org/public/collection/v1.1/search?q=<subject>&hasImages=true&isPublicDomain=true`,
   then `/public/collection/v1/objects/<id>` for its record. Use only a record with
   `isPublicDomain: true`, and its `primaryImage` (the full scan). Check the record, not your
   memory, for the title, maker, date, medium and accession number.
2. **Prefer a wide painting with large shapes.** A cell is 7 x 13 px, so a face needs about 12
   cells across to read; a portrait painting on a wide screen is cut to its middle, so frame it with
   `focus` on what matters (crown to knees, not the whole figure), or choose a wider work. A scan
   older and smaller than about 1200 px across comes out as blocks: find another.
3. **Bundle it**: at most about 1400-1600 px on its long side, JPEG quality ~78 (ink samples a
   1440 px screen at about 820 x 280 points; more is only weight, and the picture is in the bundle
   twice). Put it at `src/painting.jpg` and `import image from "./painting.jpg"`.
4. **`crop`** to the painted area (no paper, mount or roller), **`focus`** on what must stay in view.
5. **Effects where the painter put them**, in the cropped painting's fractions: `water` on water,
   `wind` on a field or trees, `rain`, `mist` in bands between hills, `birds` in open sky, `fall`
   (petals, leaves, snow), `glow` on a lamp or a halo. Keep them calm: a still painting that breathes,
   not a busy one.
6. **Credit it** in `package.json` as `hivescape.credit`: title, maker, date, medium, the collection,
   its accession number, and the licence. `pack` writes it beside the wallpaper.
7. **Depict a sacred image with respect**: show it whole and upright, no effect on the figure itself
   except light (a halo that breathes), nothing comic, and leave out works whose subject would be
   unwelcome behind someone's work (a cremation ground, a battle).

## 3. Paint colour, let light make brightness

Paint the picture in its *own* colours (albedo), mid-tone, never pre-shaded. Then:

- `ambient` (style) sets how much of the key light the scene gets: 1 by day, 0.3-0.6 by night.
- `light()` paints what glows, additively on black: radial gradients, broad and soft. A fire is a
  wide warm gradient plus a small hot core; a lantern is a gradient a body-length across; the moon
  is a faint wash from its side of the sky. Cells are shaded *from the side the light comes from*.
  A cell in light above about 0.8 shines on its own, so only the light source itself should reach
  that.
- `glow` (style) is how much the light blooms over the ground: 0.5-0.7 at night, 0.2-0.3 by day.
- `torch` is the pointer as a light; leave it on.

Night scenes come alive this way: dark albedo-correct shapes, and light that picks out the sides
facing it. Do not paint highlights into the picture; the bevels make them.

## 4. Backdrop, picture, overlay

- `backdrop`: the ground, smooth, drawn rarely (size or look change). Sky, water, ridges, the moon.
  Keep cells off the ground unless the ground *is* the subject: a field of identical cells reads as
  a carpet and hides the objects on it.
- `picture`: the subjects, every frame. Draw back to front (`iso.depth`, or depth-sorted layers).
- `overlay`: `dot()` for embers, stars, fireflies, bees, glints; `glyph()` only for real text.

## 5. Agents as creatures

If the scene shows the person's agents, it is the most useful thing on the screen; make it read at
a glance. Read `w.agents` each step and keep one creature per agent (add, remove, keep by id).

- **A kind per program** from `agent.kind`; a size from `agent.size`.
- **Each state looks different** in place, speed and light: working busy and out in the open,
  ready close by and calm, resting tucked away and dim, and **needs-you** at its agent's tile
  (`w.tiles.find(t => t.id === agent.id)`), on the side with room, doing something nothing else
  does, in the theme's attention colour (`w.look.accent`). Nobody may miss it.
- **A finished turn** (`done`) leaves a mark that lasts (honey in a cell), not only a flash.
- **Keep off the tiles**: targets outside them, and steer by looking half a second ahead.
- **Paint the creatures in `front`** (crisp over the cells), or in `picture` for ascii.
- **`spots`** returns a circle or a few per creature, so the host can name it under the pointer.
- Test with `sim.agents(...)`, `sim.tiles(...)`, `sim.done(id)`: the visit, the honey, the time
  spent under tiles. Preview with `?agents=5&tiles=1` (`&turns=40` for a day's finished turns),
  shoot with `--agents 5 --turns 40`.
- **Use the tiles themselves**: a creature can sit on a tile's top edge (Garden's birds) or dance
  beside it (The Hive's bees); the workspace is part of the scene.

## 6. Motion and interaction

- Full from the first frame: `create` lays everything out; nothing flies in.
- Calm: speeds in tens of pixels a second; things wander toward targets and retarget every few
  seconds. Use `w.rng` only (seeded), never `Math.random`.
- The pointer: something should notice it within a second (lean, gather, light up the tile under
  it) and something should *respect* it (scatter from a fast pointer, give way).
- A click: a visible answer at once (`w.effects.ripple` lifts the cells) and a consequence that
  lasts (food, a log on the fire, flowers planted).
- Bounded: cap every list (sparks, food, patches). An hour of clicking costs what a minute does.

## 7. Both looks

Every scene has a dark and a light look (`w.look.dark`), designed separately: night and day, or
night and dusk. Keep the light look's shadows soft (`shadowAlpha` about 0.2) and its glow low.

## 8. Cost

Paint is the frame's cost. Keep per-frame gradients to tens, not hundreds; build paths once where
you can; never read pixels back. Check with `hivescape bench`: under 20 ms of script a frame on
Canvas2D at 1440 x 900 (`docs/performance.md`).

## 9. Tests

Write scene tests with `simulate()` in `scenes/scenes.test.ts`: full on the first frame, the
pointer and click behaviours, and bounded after an hour of clicks. Break each behaviour once and
see its test fail.

Then run the `hivescape-review` skill before you call it done.
