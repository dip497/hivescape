---
name: hivescape-review
description: Review a Hivescape scene against the quality bar before it ships - contact sheets in both looks and both backends, what to look for in them (readable shapes, light that reads, originality, calm), the cost budget, and the tests. Use before calling any scene or renderer change done, and when someone says a scene looks low quality, generic or copied.
---

# Reviewing a Hivescape scene

Nothing is done until you have looked at it. Run these and *open every picture*.

```bash
node packages/cli/bin/hivescape.mjs shot scenes/<id> --backend webgl2 --out /tmp/shots/<id>
node packages/cli/bin/hivescape.mjs shot scenes/<id> --backend canvas2d --out /tmp/shots/<id>-cpu
node packages/cli/bin/hivescape.mjs bench scenes/<id>
pnpm typecheck && pnpm test
```

`shot` writes four moments in each look (running, the pointer resting, a click, after) and a
contact sheet. Look at the sheet first, then crop to full size where the detail is (a creature, the
light source) and look again.

## The bar

Answer each with a picture in front of you. One "no" is a fix, not a note.

1. **Is it ours?** Nothing in it looks like another product's scene: no borrowed motif, character
   ramp, tile treatment or composition. Could you say what idea it came from?
2. **Does every subject read at a glance?** A fish is a fish, not a worm; a fire has tongues, not a
   cone; a house has a roof the right way round. If not: make it bigger relative to the cell, change
   the silhouette, or show it in `native`.
3. **Does the light read?** You can tell where each light is from the cells alone: their lit sides
   face it, the source itself shines, the ground glows round it. Nothing near a light is washed to
   white except the source.
4. **Is the ground quiet?** The objects stand out from it; it is not a carpet of cells.
5. **Both looks finished?** The light look is not the dark look inverted; each has its own palette.
6. **Calm?** Nothing flickers fast, nothing crosses the screen in under a few seconds, the pointer
   does not cause a jump.
7. **The pointer and the click show.** In "pointer" something has noticed it; in "click" the swell
   is visible; in "after" the consequence is there.
8. **The CPU path is the same scene.** The Canvas2D sheet shows the same subjects and light (no cast
   shadows there, and partly covered cells are fainter rather than smaller: that is expected).
9. **Cost.** `bench`: Canvas2D under 20 ms of script a frame at 1440 x 900 at both pixel ratios;
   WebGL's script time under 5 ms. A GPU frame rate is valid only on a real GPU (SwiftShader lies).
10. **Tests.** Scene tests cover first frame, pointer, click and an hour of clicks, and each fails
    when its behaviour is broken.

Report what you looked at (the files) and what you changed for each "no".
