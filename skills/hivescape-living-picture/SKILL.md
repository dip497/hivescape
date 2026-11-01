---
name: hivescape-living-picture
description: Turn a photograph or a painting into a living Hivescape scene in the ink style that moves only where the picture itself would - water that flows, grass and leaves bending in the wind, rain, mist, a breathing light - while buildings, figures and the camera hold still; then film it, check its motion map, and ship it as a Hivemind wallpaper. Use when someone gives a picture ("make my village photo move", "this painting as a wallpaper"), asks for a scene in a tradition's own art (a deity, a woodblock print, an ink landscape), or says a picture scene looks static, busy or overanimated.
---

# A living picture

`defineMasterwork` (`@hivescape/paintings`) makes any picture a scene. What makes one stop people is
**contrast between stillness and motion**: the camera, the buildings, the bridge, the figures, a
deity hold perfectly still and crisp, while the things that move in life move in place: water flows,
grass and leaves bend in the wind, rain falls, mist drifts. In `ink` a moving region flips its
characters in place against still ones. (Measured on the ASCII-shader video this style comes from:
the torii moved under half a percent in 24 seconds; all the change was in the snow and grass.)

Animate only what would move. Nothing decorative: no birds, falling petals or drifting mist that the
picture doesn't have, no moving camera, nothing that slides.

## 1. The picture

- **The person's own photo**: theirs to use. Ask nothing more; credit them if they want.
- **A public-domain work**: The Met's Open Access is CC0.
  `https://collectionapi.metmuseum.org/public/collection/v1.1/search?q=<subject>&hasImages=true&isPublicDomain=true`,
  then `/public/collection/v1/objects/<id>`. Use only a record with `isPublicDomain: true` and its
  `primaryImage`. Take the title, maker, date, medium and accession number from the record, never
  from memory, into `package.json` as `hivescape.credit`.
- **Choose well**: wide, with large shapes, and a large part of it that moves in life (a river or
  falls, a field, trees, rain): a picture where only a corner moves makes a weak wallpaper. A cell is 7 x 13 px: a face needs about 12 cells across. A small old scan comes out
  as blocks: find another. Leave out a work whose subject is unwelcome behind someone's work.
- **Sacred images with respect**: whole, upright and still, nothing comic; at most a light that
  breathes (a halo).
- **Bundle it** at most 1400-1600 px on the long side, JPEG quality ~78-80, at `src/painting.jpg`
  (`import image from "./painting.jpg"`). It is in the wallpaper twice: keep it under ~400 KB.

## 2. Look at it on a grid

Draw tenths over the cropped picture and look at it before writing anything:

```bash
python3 -c "from PIL import Image,ImageDraw;im=Image.open('src/painting.jpg');w,h=im.size;d=ImageDraw.Draw(im)
[d.line([(w*k/10,0),(w*k/10,h)],fill='red') or d.line([(0,h*k/10),(w,h*k/10)],fill='red') for k in range(1,10)];im.save('/tmp/grid.png')"
```

Read off: the paper or mount to `crop` away, the point to keep in view (`focus`), and **what moves
in life**: where the water is and which way it runs, which grass, crops or leaves the wind would
touch, whether it rains or mist lies in it. Everything else will hold still.

## 3. What moves

- **`flow`** for water and cloud: `{ kind: "flow", region: <outline or rectangle>, dir: [x, y], speed }`.
  `dir` is the way it runs in the picture (a river toward the viewer `[0.1, 1]`, across `[-1, 0]`);
  `speed` 0.003 (a still pond, far cloud) to 0.012 (rapids), picture widths a second. Outline only
  the water, inside its banks.
- **`wind`** for grass, crops and leaves: `{ kind: "wind", region, amp, speed, shimmer }`. The region
  sways in thin rows and waves of light sweep across it as gusts bend the blades, with each small
  patch fluttering on its own: it bends in place, never slides. `amp` 2-3.5 pixels; `shimmer` 0.1
  (far leaves, sky) to 0.4 (a field, the default); `speed` 0.6 (a breeze) to 1.6 (a gale).
- **`except`** on `flow` and `wind`: outlines inside the region that hold still. Outline the field
  or the river generously, then cut out every figure, rock, trunk or building standing in it; a
  moving region must never touch something that would not move.
- **`rain`** when the picture is of rain, **`mist`** in bands where the picture has mist,
  **`glow`** on a lamp, a halo or the sun, with a small `pulse` (0.1-0.2).
- **`levels`** 0.5-0.9 for a faded photograph or a darkened varnish: it stretches the tones once.
- **`depth` and `sharp`** (optional): softens what is far from the subject, as a lens does, once:
  `depth: { horizon, far, near, shapes: [{ poly, z }] }` (0 far, 1 nearest; things standing up as
  outlines, nearest last) and `sharp: { depth: <the subject's>, range: 0.25, blur: 2.5 }`.

## 4. Film it and read its motion map

Stills cannot show motion. Film it, every frame at its own time, **at pixel ratio 2**: that is what a
laptop shows, and at ratio 1 every character is a blurred 8 x 12 smudge that makes the style look
worse than it is. Never judge it, or show it to anyone, from a small or recompressed preview.

```bash
node packages/cli/bin/hivescape.mjs film scenes/<id> --seconds 5 --fps 24 --dpr 2 --backend webgl2
# out/films/<id>-dark.mp4 (2560 x 1600) and <id>-dark-motion.png
```

Then look at frames **at full size**: whole frames scaled down to see that the picture reads (its
light and dark, its main figure), and crops at 100% beside the same crop of the look you are aiming
for, to see the characters. A frame you have not opened is not reviewed.

The **motion map** is where the frame changes, on average: put it beside a frame and check:

- [ ] Black over everything that should hold still: buildings, bridges, figures, the deity, the sky.
- [ ] Light only on the water, the plants in the wind, the rain, the mist: what you meant to move.
- [ ] Bright enough there to see from across the room. Where the reference's grass moves, a third of
      its frame changes every frame; a sway that changes nothing on the map is too faint: raise
      `shimmer` or `speed`, not the area.
- [ ] In the film: water runs the right way at a believable speed and stays in its banks; the wind
      bends things in place, nothing slides; nothing jerks; it is calm enough to work in front of.
- [ ] The picture still reads from across the room: bright parts bright (dense characters), dark
      parts dark, its main figure clear; `levels` if faded.

Then `hivescape-review` for both looks and the cost (`bench --kind ink`), and `hivescape-hivemind` to pack
it (its credit goes into `CREDITS.txt`) and check it in Hivemind.
