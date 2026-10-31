/**
 * The worker side: `serveScene(scene)` is the whole of a scene's worker script. The host hands it
 * two OffscreenCanvases; from then on the scene steps and draws here, off the page's main thread,
 * so the page (or the app that frames it) never waits for it.
 */
import type { Scene, Spot } from "@hivescape/core";
import { Engine } from "./engine.js";
import type { FromWorker, ToWorker } from "./messages.js";

export function serveScene<S>(scene: Scene<S>): void {
  const self_ = globalThis as unknown as { onmessage: ((e: MessageEvent<ToWorker>) => void) | null; postMessage(m: FromWorker): void };
  let engine: Engine<S> | null = null;
  const pending: ToWorker[] = [];
  const handle = (m: ToWorker) => {
    if (!engine) { pending.push(m); return; }
    switch (m.type) {
      case "resize": engine.resize(m.size); break;
      case "look": engine.setLook(m.look); break;
      case "style": engine.setStyle(m.style); break;
      case "mode": engine.setMode(m.mode); break;
      case "point": engine.point(m.x, m.y, m.active); break;
      case "click": engine.click(m.x, m.y); break;
      case "agents": engine.setAgents(m.agents); break;
      case "tiles": engine.setTiles(m.tiles); break;
      case "done": engine.done(m.id); break;
      case "stats": self_.postMessage({ type: "stats", id: m.id, ...engine.stats() }); break;
      case "stop": engine.destroy(); engine = null; break;
      case "init": break;
    }
  };
  self_.onmessage = (e) => {
    const m = e.data;
    if (m.type !== "init") { handle(m); return; }
    Engine.create(scene, { backdrop: m.backdrop, cells: m.cells, front: m.front }, { size: m.size, look: m.look, mode: m.mode }, {
      ...(m.seed !== undefined ? { seed: m.seed } : {}), ...(m.style ? { style: m.style } : {}), ...(m.backend ? { backend: m.backend } : {}), ...(m.fps ? { fps: m.fps } : {}),
    }).then((e2) => {
      engine = e2;
      e2.onDrawn = () => self_.postMessage({ type: "drawn" });
      e2.onSpots = (spots) => self_.postMessage({ type: "spots", spots: spots as Spot[] });
      self_.postMessage({ type: "ready", backend: e2.backend });
      for (const p of pending.splice(0)) handle(p);
    }).catch((err) => self_.postMessage({ type: "error", message: String((err as Error)?.message ?? err) }));
  };
}
