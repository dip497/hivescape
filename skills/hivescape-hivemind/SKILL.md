---
name: hivescape-hivemind
description: Ship Hivescape scenes as Hivemind live wallpapers - pack them into a package, run Hivemind's own check, install and see them in the app, and publish to HiveHub. Use when a scene should become someone's Hivemind background, or when a packed wallpaper fails `hive plugins check` or does not appear in the app.
---

# Hivescape scenes in Hivemind

`@hivescape/hivemind` speaks Hivemind's live wallpaper protocol 1: the app gives the wallpaper its
size, look, mode (run, hold, still), the pointer over open canvas and clicks there, its agents'
creatures, where the tiles are, and each turn an agent finishes; the wallpaper says `drawn` after
its first frame and, for a scene with `spots`, which creature is under the pointer (the app shows
that agent's name, and a click goes to its tile). It runs in a sandboxed frame with no network; the
scene runs in a worker on an OffscreenCanvas.

## Pack

```bash
node packages/cli/bin/hivescape.mjs pack scenes/koi      --out out/hivemind --package @owner/name --name "Package name"
node packages/cli/bin/hivescape.mjs pack scenes/campfire --out out/hivemind --package @owner/name
```

Each `pack` adds `wallpapers/<scene>/` (`dist/main.js`, `hivemind-wallpaper.json`, `preview.webp`,
the licences) and lists it in `hivemind-package.json`. The first one packed is the package's
`startup.wallpaper`, offered once when it is installed. The package id must be `@owner/name`.

## Check, install, look

```bash
hive plugins check out/hivemind       # each wallpaper runs in headless Chromium, sandboxed, as the app runs it
hive plugins install out/hivemind     # the app offers "Use <scene> as your background?"
```

Then open the app and look at it behind real tiles, in a dark and a light theme. For a scene that
shows agents, open two or three agent tiles: each gets its creature, and pointing at one shows
the agent's name. Things to confirm:
the scene is not turned off (a notice says so if it was), the pointer over open canvas reaches it,
and the canvas text stays readable over it.

## Publish

Push the package folder to a repository and publish it to HiveHub the way any Hivemind package is
published (see the Hivemind guide's plugin pages). Bump `version` in `hivemind-package.json` for each
release.
