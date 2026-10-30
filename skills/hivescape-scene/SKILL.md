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
| Anything meant to read as character art; type, code, signal | any | `ascii` |

For `ascii`, paint thin things (grass, reeds, rigging) as strokes about 2 px wide, so they come out
as `| / \ -`, and give flat areas some shading (a gradient down each tier, a lit side), because a
body's characters follow its lightness: a flat colour is a wall of one character.

Cells have a size: a comb cell of 13-15 px means a shape needs about 5 cells across to read. Size
creatures and objects for the cell, not for the screen: a koi is 170-240 px long and a third as
wide. If what you want to show cannot be read at 5 cells, choose `native` for that scene.

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

## 5. Motion and interaction

- Full from the first frame: `create` lays everything out; nothing flies in.
- Calm: speeds in tens of pixels a second; things wander toward targets and retarget every few
  seconds. Use `w.rng` only (seeded), never `Math.random`.
- The pointer: something should notice it within a second (lean, gather, light up the tile under
  it) and something should *respect* it (scatter from a fast pointer, give way).
- A click: a visible answer at once (`w.effects.ripple` lifts the cells) and a consequence that
  lasts (food, a log on the fire, flowers planted).
- Bounded: cap every list (sparks, food, patches). An hour of clicking costs what a minute does.

## 6. Both looks

Every scene has a dark and a light look (`w.look.dark`), designed separately: night and day, or
night and dusk. Keep the light look's shadows soft (`shadowAlpha` about 0.2) and its glow low.

## 7. Cost

Paint is the frame's cost. Keep per-frame gradients to tens, not hundreds; build paths once where
you can; never read pixels back. Check with `hivescape bench`: under 20 ms of script a frame on
Canvas2D at 1440 x 900 (`docs/performance.md`).

## 8. Tests

Write scene tests with `simulate()` in `scenes/scenes.test.ts`: full on the first frame, the
pointer and click behaviours, and bounded after an hour of clicks. Break each behaviour once and
see its test fail.

Then run the `hivescape-review` skill before you call it done.
