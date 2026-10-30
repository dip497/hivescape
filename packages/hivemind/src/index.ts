/**
 * A Hivescape scene as a Hivemind live wallpaper (protocol 1). The app frames the wallpaper's
 * script in a sandboxed page, serves it `@hivemind/view-sdk`, and tells it the size, the look, the
 * mode, the pointer over open canvas and clicks there. This forwards each to the scene, which runs
 * in a worker when the build gave it one, and says `drawn` after the first frame.
 *
 * The scene is ambient: it names no creature, so the app names no agent over it and a click opens
 * nothing. (A scene that draws agents is a later addition to the Scene contract.)
 */
import { hex, type Look } from "@hivescape/core";
import type { Scene, StyleSpec } from "@hivescape/core";
import type { BackendChoice } from "@hivescape/render";
import { mount, type Mounted } from "@hivescape/runtime";
import { connectWallpaper, type WallpaperLook } from "@hivemind/view-sdk";

export interface WallpaperOptions {
  /** The scene's worker script as text; `hivescape pack --hivemind` provides it. */
  workerSource?: string;
  style?: Partial<StyleSpec>;
  backend?: BackendChoice;
  seed?: number;
}

/** The app's look as a scene's: its page, text and attention colours, and dark or light. */
export const lookOf = (l: WallpaperLook): Look => ({ dark: l.dark, page: hex(l.page), text: hex(l.text), accent: hex(l.attention) });

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
  wp.on("viewport", (v) => view.resize({ w: v.w, h: v.h, dpr: v.dpr }));
  wp.on("look", (l) => view.setLook(lookOf(l)));
  wp.on("mode", (m) => view.setMode(m));
  wp.on("pointer", (p) => view.point(p.x, p.y, p.over));
  wp.on("click", (c) => { if (c.id === null) view.click(c.x, c.y); });
  return view;
}
