/**
 * One running scene: its world, its clock and its renderer, wherever it lives (the page's main
 * thread or a worker; the code is the same). The host tells it the size, the look, the mode and what
 * the person does; it steps, draws, and says once that its first frame is up.
 */
import {
  clock, Effects, Input, resolveStyle, rng,
  type Clock, type Frames, type Look, type Mode, type Scene, type Size, type StyleSpec, type World,
} from "@hivescape/core";
import { Renderer, type BackendChoice, type Layers } from "@hivescape/render";

export interface EngineOptions {
  seed?: number;
  /** Override the scene's style (its kind, cell size, …). */
  style?: Partial<StyleSpec>;
  backend?: BackendChoice;
  /** Frames a second at most (30). */
  fps?: number;
  frames?: Frames;
}

export interface EngineStart {
  size: Size;
  look: Look;
  mode?: Mode;
}

export class Engine<S> {
  readonly world: World;
  private state: S;
  private clock: Clock;
  private override: Partial<StyleSpec>;
  private drawnOnce = false;
  private frames = 0;
  /** Called once, after the first frame is on the layers. */
  onDrawn: (() => void) | null = null;

  private constructor(private scene: Scene<S>, readonly renderer: Renderer, start: EngineStart, opts: EngineOptions) {
    this.override = opts.style ?? {};
    this.world = {
      size: start.size, look: start.look, style: resolveStyle(scene.style, start.look, this.override),
      time: 0, rng: rng(opts.seed ?? 1), input: new Input(), effects: new Effects(),
    };
    renderer.configure(this.world.size, this.world.style);
    this.state = scene.create(this.world);
    this.clock = clock({ step: (dt) => this.step(dt), draw: () => this.draw(), settle: () => this.settle() }, { fps: opts.fps ?? 30, ...(opts.frames ? { frames: opts.frames } : {}) });
    // The first frame now, whatever the mode: a held scene still shows something.
    if ((start.mode ?? "run") === "hold") this.draw();
    this.clock.setMode(start.mode ?? "run");
  }

  static async create<S>(scene: Scene<S>, layers: Layers, start: EngineStart, opts: EngineOptions = {}): Promise<Engine<S>> {
    const renderer = await Renderer.create(layers, { backend: opts.backend ?? "auto" });
    return new Engine(scene, renderer, start, opts);
  }

  get mode(): Mode { return this.clock.mode; }
  get backend(): string { return this.renderer.backend.kind; }

  private step(dt: number): void {
    const w = this.world;
    w.time += dt;
    w.input.tick(dt);
    for (const c of w.input.takeClicks()) this.scene.click?.(this.state, c.x, c.y, w);
    this.scene.step(this.state, dt, w);
    w.effects.prune(w.time);
  }

  private draw(): void {
    this.renderer.frame(this.scene, this.state, this.world);
    this.frames++;
    if (!this.drawnOnce) { this.drawnOnce = true; this.onDrawn?.(); }
  }

  private settle(): void {
    if (this.scene.settle) this.scene.settle(this.state, this.world);
    else for (let i = 0; i < 360; i++) this.step(1 / 60);
  }

  resize(size: Size): void {
    const old = this.world.size;
    if (old.w === size.w && old.h === size.h && old.dpr === size.dpr) return;
    this.world.size = size;
    this.renderer.configure(size, this.world.style);
    if (this.scene.resize) this.scene.resize(this.state, this.world);
    else this.state = this.scene.create(this.world);
    this.clock.changed();
  }

  setLook(look: Look): void {
    this.world.look = look;
    this.world.style = resolveStyle(this.scene.style, look, this.override);
    this.renderer.configure(this.world.size, this.world.style);
    this.clock.changed();
  }

  setStyle(style: Partial<StyleSpec>): void {
    this.override = { ...this.override, ...style };
    this.world.style = resolveStyle(this.scene.style, this.world.look, this.override);
    this.renderer.configure(this.world.size, this.world.style);
    this.clock.changed();
  }

  setMode(mode: Mode): void { this.clock.setMode(mode); }

  /** Pointer and clicks are heard only while running: a held or still scene does not react. */
  point(x: number, y: number, active = true): void {
    if (this.clock.mode === "run") this.world.input.point(x, y, active);
    else if (!active) this.world.input.point(0, 0, false);
  }

  click(x: number, y: number): void {
    if (this.clock.mode === "run") this.world.input.click(x, y);
  }

  /** The last frame's script time, the backend, the cell count, and frames drawn so far. */
  stats(): { ms: number; backend: string; cells: number; frames: number } {
    const g = this.renderer.cells;
    return { ms: this.renderer.stats.ms, backend: this.backend, cells: g.cols * g.rows, frames: this.frames };
  }

  destroy(): void { this.clock.stop(); this.renderer.destroy(); }
}
