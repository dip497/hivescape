---
name: hivescape-living-picture
description: Turn a photograph or a painting into a living Hivescape scene in the ink style - cut into depth layers that a slow camera orbits (near things sliding across far ones, depth of field), water and cloud that flow, wind, rain, mist, birds - then film it, review it and ship it as a Hivemind wallpaper. Use when someone gives a picture ("make my village photo move", "this painting as a wallpaper"), asks for a scene in a tradition's own art (a deity, a woodblock print, an ink landscape), or says a picture scene looks static or flat.
---

# A living picture

`defineMasterwork` (`@hivescape/paintings`) makes any picture a scene. What makes one stop people is
**motion through depth**, not effects on a flat picture: the picture is cut into layers by how far each
part is, a slow camera orbits it, near things slide across far ones, and in `ink` the picture moves
under a fixed grid of characters, so every character keeps changing and the frame seems to pour.
Water flows where the picture has water. You describe all of it in the picture's own fractions
(0..1 across and down, after `crop`), so it holds on any screen.

## 1. The picture

- **The person's own photo**: theirs to use. Ask nothing more; credit them if they want.
- **A public-domain work**: The Met's Open Access is CC0.
  `https://collectionapi.metmuseum.org/public/collection/v1.1/search?q=<subject>&hasImages=true&isPublicDomain=true`,
  then `/public/collection/v1/objects/<id>`. Use only a record with `isPublicDomain: true` and its
  `primaryImage`. Take the title, maker, date, medium and accession number from the record, never
  from memory, into `package.json` as `hivescape.credit`.
- **Choose well**: wide, with large shapes and clear depth (a near thing, a middle, a far distance,
  water). A cell is 7 x 13 px: a face needs about 12 cells across. A small old scan comes out as
  blocks: find another. Leave out a work whose subject is unwelcome behind someone's work.
- **Sacred images with respect**: whole and upright, nothing comic, no effect on the figure itself
  except light (a halo that breathes).
- **Bundle it** at most 1400-1600 px on the long side, JPEG quality ~78-80, at `src/painting.jpg`
  (`import image from "./painting.jpg"`). It is in the wallpaper twice: keep it under ~400 KB.

## 2. Look at it on a grid

Draw tenths over the cropped picture and look at it before writing anything:

```bash
python3 -c "from PIL import Image,ImageDraw;im=Image.open('src/painting.jpg');w,h=im.size;d=ImageDraw.Draw(im)
[d.line([(w*k/10,0),(w*k/10,h)],fill='red') or d.line([(0,h*k/10),(w,h*k/10)],fill='red') for k in range(1,10)];im.save('/tmp/grid.png')"
```

Read off: the paper or mount to `crop` away, the point to keep in view (`focus`), where the ground
meets the sky (`horizon`), each thing that stands up (its outline), and where the water is.

## 3. Depth

```ts
depth: {
  horizon: 0.42,            // above this is the far distance (0)
  far: 0.3, near: 1,        // the ground's depth at the horizon and at the picture's foot
  shapes: [                 // things standing up, in order, the nearest LAST
    { poly: [[0.6, 0.2], [0.8, 0.2], [0.8, 0.9], [0.6, 0.9]], z: 0.7 },
  ],
},
sharp: { depth: 0.7, range: 0.25, blur: 2.5 },   // what is in focus; farther and nearer go soft
```

- 0 is the far distance (sky, far mountains), 1 the nearest thing. Most pictures need 2-5 shapes:
  a far range, a middle mass (trees, a village), the subject, and a near foreground.
- **Outline a little outside the thing**, not tight to it: a shape's edge is where a near thing
  slides over a far one, and a shape that cuts through the subject tears it.
- A tree, a figure or a bridge is one shape at one depth, from its foot to its top: never let the
  ground's gradient run up a standing thing (its top would slide differently from its foot).
- `sharp`: focus on the subject's depth. A strong blur on the far layers is the reference's
  tilt-shift look; keep it under ~3 px on a painting whose distance is part of it.

## 4. What moves

- **`flow`** for water and cloud: `{ kind: "flow", region: <outline or rectangle>, dir: [x, y], speed }`.
  `dir` is the way it runs in the picture (a river toward the viewer is `[0.1, 1]`, across is
  `[-1, 0]`); `speed` 0.003 (a still pond, far cloud) to 0.012 (rapids), picture widths a second.
  Outline only the water.
- `wind` on a field or trees; `rain`; `mist` in bands between hills; `birds` in open sky; `fall`
  (petals, leaves, snow); `glow` on a lamp, a halo, the sun.
- **`camera`**: the defaults (an orbit of ~22 s, drift 0.045) suit most pictures. Slower (`period`
  30-40) for a quiet ink landscape; `camera: false` only for a picture with no depth at all.
- **`levels`** 0.5-0.9 for a faded photograph or a darkened varnish: it stretches the tones once.

## 5. Film it and look

Stills cannot show motion. Film it, every frame at its own time:

```bash
node packages/cli/bin/hivescape.mjs film scenes/<id> --seconds 8 --backend webgl2 --webp   # out/films/<id>-dark.mp4 and .webp
```

Then take the same crop from frames a few seconds apart and put them side by side:

- [ ] Near things slide across far ones; the subject holds still in focus. Nothing tears through the
      subject (an outline too tight) and nothing near is doubled (a ghost: report it, the layers fill
      behind near things with the colours round them).
- [ ] No screen edge, black corner or seam shows at any moment of the orbit.
- [ ] The water runs the right way, at a believable speed, and stays in its banks.
- [ ] The picture still reads from across the room: its main figure, its tones (`levels` if faded).
- [ ] It is calm enough to work in front of: nothing jerks, nothing crosses the screen in a second.

Then `hivescape-review` for both looks and the cost (`bench --kind ink`), and `hivescape-hivemind` to pack
it (its credit goes into `CREDITS.txt`) and check it in Hivemind.
