/**
 * What the person does, as a scene reads it: where the pointer is, how fast it moves, how long it
 * has rested, and the clicks since the last step. A host (page, worker, Hivemind) writes into it;
 * the scene only reads. Times are the scene's own clock (seconds since it began), so a held scene
 * does not see the pointer rest for an hour while nobody watched.
 */

export interface Pointer {
  x: number;
  y: number;
  /** Over the scene (not over a panel, not outside the window). */
  active: boolean;
  /** Smoothed speed, CSS pixels a second. */
  speed: number;
  /** Seconds it has stayed within `REST_RADIUS` of where it settled; 0 while it moves. */
  rested: number;
}

export interface Click { x: number; y: number; at: number }

/** A pointer that wanders less than this many pixels still counts as resting. */
export const REST_RADIUS = 10;

export class Input {
  readonly pointer: Pointer = { x: 0, y: 0, active: false, speed: 0, rested: 0 };
  private clicks: Click[] = [];
  private restX = 0;
  private restY = 0;
  private lastX = 0;
  private lastY = 0;
  private moved = 0;
  private time = 0;

  /** The host: the pointer is at `x, y` (or left the scene). */
  point(x: number, y: number, active = true): void {
    const p = this.pointer;
    if (!active) { p.active = false; p.speed = 0; p.rested = 0; return; }
    if (!p.active) { this.lastX = x; this.lastY = y; this.restX = x; this.restY = y; }
    this.moved += Math.hypot(x - this.lastX, y - this.lastY);
    this.lastX = x; this.lastY = y;
    p.x = x; p.y = y; p.active = true;
    if (Math.hypot(x - this.restX, y - this.restY) > REST_RADIUS) { this.restX = x; this.restY = y; p.rested = 0; }
  }

  /** The host: a click at `x, y`. */
  click(x: number, y: number): void {
    if (this.clicks.length < 16) this.clicks.push({ x, y, at: this.time });
  }

  /** The scene's clock moved `dt`: smooth the speed, count the rest. */
  tick(dt: number): void {
    this.time += dt;
    const p = this.pointer;
    if (!p.active) return;
    const v = this.moved / Math.max(dt, 1e-3);
    p.speed += (v - p.speed) * Math.min(1, dt * 10);
    this.moved = 0;
    p.rested += dt;
  }

  /** The clicks since the last call, oldest first. */
  takeClicks(): Click[] {
    if (!this.clicks.length) return NONE;
    const c = this.clicks;
    this.clicks = [];
    return c;
  }
}

const NONE: Click[] = [];
