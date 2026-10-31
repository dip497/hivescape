/**
 * Put a scene in a page. `mount(element, scene)` stacks two canvases inside the element, runs the
 * scene in a worker when it can (an OffscreenCanvas and the worker's own source, which a build
 * provides) and on the main thread when it can't, and wires the size, the pointer, clicks, the
 * page's visibility and the person's reduced-motion setting. A host that has its own input (a
 * Hivemind wallpaper, told the pointer by the app) passes `input: "manual"` and `size` and calls
 * `point`, `click` and `resize` itself.
 */
import { DARK, type Agent, type Frames, type Look, type Mode, type Scene, type Size, type Spot, type StyleSpec, type Tile } from "@hivescape/core";
import type { BackendChoice } from "@hivescape/render";
import { Engine } from "./engine.js";
import type { FromWorker, ToWorker } from "./messages.js";

export interface MountOptions {
  look?: Look;
  /** Start running (default), held, or still. */
  mode?: Mode;
  seed?: number;
  style?: Partial<StyleSpec>;
  backend?: BackendChoice;
  fps?: number;
  /** Where frames come from, on the main thread (default: the display's). A film steps its own. */
  frames?: Frames;
  /** `auto` runs in a worker when `workerSource` is given and OffscreenCanvas exists. */
  thread?: "auto" | "main" | "worker";
  /** The scene's worker script as text (a Hivescape build provides it). */
  workerSource?: string;
  /** `dom` (default) listens to the element; `manual` leaves pointer and clicks to the caller. */
  input?: "dom" | "manual";
  /** A fixed size; by default the element is watched. */
  size?: Size;
  /** Called once the first frame is up. */
  onDrawn?: () => void;
}

export interface Mounted {
  readonly thread: "main" | "worker";
  backend(): Promise<string>;
  resize(size: Size): void;
  setLook(look: Look): void;
  setStyle(style: Partial<StyleSpec>): void;
  setMode(mode: Mode): void;
  point(x: number, y: number, active?: boolean): void;
  click(x: number, y: number): void;
  /** The person's agents and what each is doing (a scene that shows agents draws a creature for each). */
  setAgents(agents: readonly Agent[]): void;
  /** Where the tiles and panels are, CSS pixels. */
  setTiles(tiles: readonly Tile[]): void;
  /** An agent finished a turn well. */
  done(id: string): void;
  /** The agent whose creature is at `x, y` in the last frame drawn, or null. Answers at once. */
  hitTest(x: number, y: number): string | null;
  /** The last frame's script time and the backend: what `hivescape bench` reads. */
  stats(): Promise<{ ms: number; backend: string; cells: number; frames: number }>;
  destroy(): void;
}

/** Commands either side of the thread boundary takes. */
interface Driver {
  send(m: Exclude<ToWorker, { type: "init" }>): void;
  stats(): Promise<{ ms: number; backend: string; cells: number; frames: number }>;
  backend(): Promise<string>;
  destroy(): void;
}

function layer(el: HTMLElement, z: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.style.cssText = `position:absolute;inset:0;width:100%;height:100%;display:block;z-index:${z};pointer-events:none`;
  el.appendChild(c);
  return c;
}

export async function mount<S>(el: HTMLElement, scene: Scene<S>, opts: MountOptions = {}): Promise<Mounted> {
  if (getComputedStyle(el).position === "static") el.style.position = "relative";
  const backdrop = layer(el, 0), cells = layer(el, 1), front = layer(el, 2);
  const measure = (): Size => opts.size ?? { w: Math.max(1, el.clientWidth), h: Math.max(1, el.clientHeight), dpr: Math.min(2, globalThis.devicePixelRatio || 1) };
  const look = opts.look ?? DARK;
  const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mode: Mode = opts.mode ?? (reduce ? "still" : "run");
  const canWorker = typeof OffscreenCanvas !== "undefined" && "transferControlToOffscreen" in cells && !!opts.workerSource;
  const useWorker = opts.frames ? false : opts.thread === "worker" ? true : opts.thread === "main" ? false : canWorker;
  const engineOpts = { ...(opts.seed !== undefined ? { seed: opts.seed } : {}), ...(opts.style ? { style: opts.style } : {}), ...(opts.backend ? { backend: opts.backend } : {}), ...(opts.fps ? { fps: opts.fps } : {}) };

  // Where the creatures were in the last frame: the hit test answers from this, on this thread.
  let spots: readonly Spot[] = [];
  let driver: Driver;
  if (useWorker) {
    if (!opts.workerSource) throw new Error("hivescape: a worker needs the scene's worker source");
    const url = URL.createObjectURL(new Blob([opts.workerSource], { type: "text/javascript" }));
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    const ob = backdrop.transferControlToOffscreen(), oc = cells.transferControlToOffscreen(), of = front.transferControlToOffscreen();
    let backendName: string | null = null;
    const waiting = new Map<number, (s: { ms: number; backend: string; cells: number; frames: number }) => void>();
    const backendWaiters: ((b: string) => void)[] = [];
    let next = 0;
    worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      if (m.type === "ready") { backendName = m.backend; for (const w of backendWaiters.splice(0)) w(m.backend); }
      else if (m.type === "drawn") opts.onDrawn?.();
      else if (m.type === "spots") spots = m.spots;
      else if (m.type === "stats") { waiting.get(m.id)?.(m); waiting.delete(m.id); }
      else if (m.type === "error") console.error("hivescape worker:", m.message);
    };
    const init: ToWorker = { type: "init", backdrop: ob, cells: oc, front: of, size: measure(), look, mode, ...engineOpts };
    worker.postMessage(init, [ob, oc, of]);
    driver = {
      send: (m) => worker.postMessage(m),
      stats: () => new Promise((res) => { const id = ++next; waiting.set(id, res); worker.postMessage({ type: "stats", id }); }),
      backend: () => backendName ? Promise.resolve(backendName) : new Promise((res) => backendWaiters.push(res)),
      destroy: () => { worker.postMessage({ type: "stop" }); worker.terminate(); },
    };
  } else {
    const engine = await Engine.create(scene, { backdrop, cells, front }, { size: measure(), look, mode }, { ...engineOpts, ...(opts.frames ? { frames: opts.frames } : {}) });
    engine.onDrawn = () => opts.onDrawn?.();
    engine.onSpots = (s) => { spots = s; };
    driver = {
      send: (m) => {
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
          case "stop": engine.destroy(); break;
          case "stats": break;
        }
      },
      stats: () => Promise.resolve(engine.stats()),
      backend: () => Promise.resolve(engine.backend),
      destroy: () => engine.destroy(),
    };
  }

  const cleanup: (() => void)[] = [];
  if (!opts.size && typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => driver.send({ type: "resize", size: measure() }));
    ro.observe(el);
    cleanup.push(() => ro.disconnect());
  }
  if ((opts.input ?? "dom") === "dom") {
    const at = (e: PointerEvent | MouseEvent) => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const; };
    const move = (e: PointerEvent) => { const [x, y] = at(e); driver.send({ type: "point", x, y, active: true }); };
    const leave = () => driver.send({ type: "point", x: 0, y: 0, active: false });
    const down = (e: MouseEvent) => { const [x, y] = at(e); driver.send({ type: "click", x, y }); };
    el.addEventListener("pointermove", move, { passive: true });
    el.addEventListener("pointerleave", leave, { passive: true });
    el.addEventListener("click", down);
    cleanup.push(() => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); el.removeEventListener("click", down); });
  }
  // Nobody can see a hidden page: hold while it is hidden, and go back to what was asked when it shows.
  let wanted: Mode = mode;
  if ((opts.input ?? "dom") === "dom" && typeof document !== "undefined") {
    const vis = () => driver.send({ type: "mode", mode: document.hidden ? "hold" : wanted });
    document.addEventListener("visibilitychange", vis);
    cleanup.push(() => document.removeEventListener("visibilitychange", vis));
  }

  return {
    thread: useWorker ? "worker" : "main",
    backend: () => driver.backend(),
    resize: (size) => driver.send({ type: "resize", size }),
    setLook: (l) => driver.send({ type: "look", look: l }),
    setStyle: (s) => driver.send({ type: "style", style: s }),
    setMode: (m) => { wanted = m; if (typeof document === "undefined" || !document.hidden || opts.input === "manual") driver.send({ type: "mode", mode: m }); },
    point: (x, y, active = true) => driver.send({ type: "point", x, y, active }),
    click: (x, y) => driver.send({ type: "click", x, y }),
    setAgents: (agents) => driver.send({ type: "agents", agents: agents.map((a) => ({ ...a })) }),
    setTiles: (tiles) => driver.send({ type: "tiles", tiles: tiles.map((t) => ({ ...t })) }),
    done: (id) => driver.send({ type: "done", id }),
    hitTest: (x, y) => hitSpot(spots, x, y),
    stats: () => driver.stats(),
    destroy: () => { for (const c of cleanup) c(); driver.destroy(); backdrop.remove(); cells.remove(); front.remove(); },
  };
}

/** The creature under `x, y`: of the circles that hold it, the one it is deepest inside. */
export function hitSpot(spots: readonly Spot[], x: number, y: number): string | null {
  let best: string | null = null, bestIn = 1;
  for (const p of spots) {
    const k = Math.hypot(x - p.x, y - p.y) / Math.max(p.r, 1e-3);
    if (k < bestIn) { bestIn = k; best = p.id; }
  }
  return best;
}
