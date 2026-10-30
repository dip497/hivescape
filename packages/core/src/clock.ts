/**
 * The clock every scene runs on, wherever it runs (a page, a worker, a test): the simulation moves
 * in fixed steps of `step` seconds whatever the frame rate, frames are drawn at most `fps` a
 * second, and nothing at all happens while held. Its rules are the Hivemind wallpaper clock's
 * (run, hold, still), so a scene behaves the same in the app and anywhere else.
 */

export type Mode = "run" | "hold" | "still";

export interface Frames {
  request(cb: (now: number) => void): number;
  cancel(id: number): void;
  now(): number;
}

export interface Steps {
  /** Move the world on by `dt` seconds (always the clock's step). */
  step(dt: number): void;
  /** Draw it as it is; `dt` is the time since the last frame, for what fades. */
  draw(dt: number): void;
  /** For a still frame: put everything where it would be after a while. */
  settle?(): void;
}

export interface ClockOptions {
  /** Frames a second at most (default 30: characters read smooth at 30 and cost half of 60). */
  fps?: number;
  /** The simulation step in seconds (default 1/60). */
  step?: number;
  /** A clock this many steps behind (a busy machine) drops the rest instead of racing. */
  maxSteps?: number;
  /** Steps a still frame is settled for when the scene has no `settle` (default 360: 6 s). */
  settleSteps?: number;
  frames?: Frames;
}

export interface Clock {
  readonly mode: Mode;
  setMode(mode: Mode): void;
  /** Something shown changed (size, look): draw again now if held or still. */
  changed(): void;
  stop(): void;
}

const g = globalThis as { requestAnimationFrame?: (cb: (now: number) => void) => number; cancelAnimationFrame?: (id: number) => void };

/** The display's frames where there are any (a page, a worker with an OffscreenCanvas), else a timer. */
export function displayFrames(fps = 30): Frames {
  return {
    request: (cb) => (g.requestAnimationFrame ? g.requestAnimationFrame(cb) : (setTimeout(() => cb(performance.now()), 1000 / fps) as unknown as number)),
    cancel: (id) => (g.cancelAnimationFrame ? g.cancelAnimationFrame(id) : clearTimeout(id)),
    now: () => performance.now(),
  };
}

export function clock(steps: Steps, opts: ClockOptions = {}): Clock {
  const fps = Math.max(1, Math.min(120, opts.fps ?? 30));
  const frameMs = 1000 / fps;
  const step = opts.step ?? 1 / 60;
  const maxSteps = opts.maxSteps ?? 4;
  const frames = opts.frames ?? displayFrames(fps);
  let mode: Mode = "hold";
  let id = 0, last = 0, drawnAt = -Infinity, acc = 0;

  const settle = () => {
    if (steps.settle) steps.settle();
    else for (let i = 0; i < (opts.settleSteps ?? 360); i++) steps.step(step);
    steps.draw(step);
  };
  const frame = (now: number) => {
    id = frames.request(frame);
    // A display faster than the cap: wait for the frame that is due (2 ms early counts as on time).
    if (now - drawnAt < frameMs - 2) return;
    drawnAt = now;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt;
    let n = 0;
    while (acc >= step && n < maxSteps) { steps.step(step); acc -= step; n++; }
    if (n === maxSteps) acc = 0;
    steps.draw(dt);
  };
  return {
    get mode() { return mode; },
    setMode(next) {
      if (next === mode) return;
      mode = next;
      frames.cancel(id);
      if (mode === "run") { last = frames.now(); drawnAt = -Infinity; acc = 0; id = frames.request(frame); }
      else if (mode === "still") settle();
    },
    changed() {
      if (mode === "still") settle();
      else if (mode === "hold") steps.draw(step);
    },
    stop() { frames.cancel(id); mode = "hold"; },
  };
}
