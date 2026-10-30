/**
 * Run a scene with no screen: build it, step it, poke it. What tests use to check that a scene is
 * full from its first frame, answers the pointer, and stays bounded over an hour, in milliseconds.
 */
import { Effects } from "./effects.js";
import { Input } from "./input.js";
import { rng } from "./random.js";
import { DARK, type Look, type Scene, type Size, type StyleSpec, type World } from "./scene.js";
import { resolveStyle } from "./style.js";

export interface Simulation<S> {
  readonly state: S;
  readonly world: World;
  /** Step `seconds` of scene time at the scene's fixed step. */
  run(seconds: number): void;
  point(x: number, y: number, active?: boolean): void;
  click(x: number, y: number): void;
  resize(w: number, h: number): void;
}

export interface SimulateOptions {
  size?: Partial<Size>;
  look?: Look;
  seed?: number;
  style?: Partial<StyleSpec>;
  step?: number;
}

export function simulate<S>(scene: Scene<S>, opts: SimulateOptions = {}): Simulation<S> {
  const look = opts.look ?? DARK;
  const world: World = {
    size: { w: 1440, h: 900, dpr: 1, ...opts.size },
    look,
    style: resolveStyle(scene.style, look, opts.style),
    time: 0,
    rng: rng(opts.seed ?? 1),
    input: new Input(),
    effects: new Effects(),
  };
  const dt = opts.step ?? 1 / 60;
  let state = scene.create(world);
  const one = () => {
    world.time += dt;
    world.input.tick(dt);
    for (const c of world.input.takeClicks()) scene.click?.(state, c.x, c.y, world);
    scene.step(state, dt, world);
    world.effects.prune(world.time);
  };
  return {
    get state() { return state; },
    world,
    run(seconds) { for (let i = 0, n = Math.round(seconds / dt); i < n; i++) one(); },
    point(x, y, active = true) { world.input.point(x, y, active); },
    click(x, y) { world.input.click(x, y); },
    resize(w, h) {
      world.size = { ...world.size, w, h };
      if (scene.resize) scene.resize(state, world);
      else state = scene.create(world);
    },
  };
}
