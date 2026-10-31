/**
 * A Hivescape scene as a Hivemind live wallpaper (protocol 1). The app frames the wallpaper's
 * script in a sandboxed page, serves it `@hivemind/view-sdk`, and tells it the size, the look, the
 * mode, the pointer over open canvas and clicks there, and the workspace's agents: a creature for
 * each (its program's kind, its size, what it is doing), where the tiles are, and when one finishes
 * a turn well. This forwards each to the scene, which runs in a worker when the build gave it one,
 * says `drawn` after the first frame, and answers the app's hit test from where the scene last drew
 * its creatures: the app names the agent under the pointer, and a click there goes to its tile.
 *
 * A scene that draws no agents (no `spots`) is ambient: nothing is ever under the pointer.
 */
import { hex, type Agent, type Look, type Tile } from "@hivescape/core";
import type { Scene, StyleSpec } from "@hivescape/core";
import type { BackendChoice } from "@hivescape/render";
import { mount, type Mounted } from "@hivescape/runtime";
import { connectWallpaper, type WallpaperCreature, type WallpaperLook, type WallpaperTile } from "@hivemind/view-sdk";

export interface WallpaperOptions {
  /** The scene's worker script as text; `hivescape pack --hivemind` provides it. */
  workerSource?: string;
  style?: Partial<StyleSpec>;
  backend?: BackendChoice;
  seed?: number;
}

/** The app's look as a scene's: its page, text and attention colours, and dark or light. */
export const lookOf = (l: WallpaperLook): Look => ({ dark: l.dark, page: hex(l.page), text: hex(l.text), accent: hex(l.attention) });

/** The app's creatures as a scene's agents. */
export const agentsOf = (cs: readonly WallpaperCreature[]): Agent[] => cs.map((c) => ({ id: c.id, program: c.agent, kind: c.kind, size: c.size, state: c.state }));

export const tilesOf = (ts: readonly WallpaperTile[]): Tile[] => ts.map((t) => ({ x0: t.x0, y0: t.y0, x1: t.x1, y1: t.y1, ...(t.id !== undefined ? { id: t.id } : {}) }));

export async function runWallpaper<S>(scene: Scene<S>, opts: WallpaperOptions = {}): Promise<Mounted> {
  const wp = await connectWallpaper();
  document.documentElement.style.cssText = "margin:0;height:100%;overflow:hidden;background:transparent";
  document.body.style.cssText = "margin:0;height:100%;overflow:hidden;background:transparent";
  const vp = wp.viewport;
  const view = await mount(document.body, scene, {
    look: lookOf(wp.look),
    mode: wp.mode,
    input: "manual",
    size: { w: vp.w, h: vp.h, dpr: vp.dpr },
    thread: opts.workerSource ? "auto" : "main",
    ...(opts.workerSource ? { workerSource: opts.workerSource } : {}),
    ...(opts.style ? { style: opts.style } : {}),
    ...(opts.backend ? { backend: opts.backend } : {}),
    ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
    onDrawn: () => wp.drawn(),
  });
  if (scene.spots) {
    view.setAgents(agentsOf(wp.creatures));
    view.setTiles(tilesOf(wp.tiles));
    wp.on("creatures", (cs) => view.setAgents(agentsOf(cs)));
    wp.on("tiles", ({ tiles }) => view.setTiles(tilesOf(tiles)));
    wp.on("done", ({ id }) => view.done(id));
    wp.hitTest((x, y) => view.hitTest(x, y));
  }
  wp.on("viewport", (v) => view.resize({ w: v.w, h: v.h, dpr: v.dpr }));
  wp.on("look", (l) => view.setLook(lookOf(l)));
  wp.on("mode", (m) => view.setMode(m));
  wp.on("pointer", (p) => view.point(p.x, p.y, p.over));
  // A click on a creature went to its agent's tile; the scene hears only clicks on open water.
  wp.on("click", (c) => { if (c.id === null) view.click(c.x, c.y); });
  return view;
}
