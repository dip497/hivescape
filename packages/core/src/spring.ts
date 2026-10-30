/**
 * Things that answer the pointer: each body sits where the scene puts it, plus an offset on a
 * damped spring that the pointer pulls or pushes. `flee` (fish, leaves), `curious` (comes to a
 * resting pointer, keeps a little distance, startles at a fast one) and `attract` (follows close).
 */
import type { Pointer } from "./input.js";
import { clamp } from "./math.js";

export type Temper = "flee" | "curious" | "attract";

export interface Body { ox: number; oy: number; vx: number; vy: number }

export interface Pull {
  temper: Temper;
  /** Reach of the pointer, pixels. */
  reach: number;
  /** Strength, 1 is the default. */
  force?: number;
  /** A curious body keeps this far away (pixels). */
  keep?: number;
}

/** Move `b` one step toward where the pointer wants it, and return its spot: `x, y` plus its offset. */
export function pull(b: Body, x: number, y: number, p: Pointer | null, rule: Pull, dt: number): [number, number] {
  const F = rule.force ?? 1;
  let tx = 0, ty = 0;
  const active = !!p && p.active;
  if (active) {
    const px = x + b.ox, py = y + b.oy, dx = px - p!.x, dy = py - p!.y, d = Math.hypot(dx, dy) || 1, n = clamp(1 - d / rule.reach);
    if (n > 0) {
      const fast = p!.speed > 380;
      if (rule.temper === "flee" || (rule.temper === "curious" && fast)) {
        const s = n ** 1.4 * rule.reach * 0.55 * F * (1 + clamp(p!.speed / 900));
        tx = b.ox + (dx / d) * s; ty = b.oy + (dy / d) * s;
      } else if (rule.temper === "curious" && p!.speed < 120) {
        const s = Math.max(0, d - (rule.keep ?? 70)) * 0.8 * n ** 0.5 * F;
        tx = b.ox - (dx / d) * s; ty = b.oy - (dy / d) * s;
      } else if (rule.temper === "attract") {
        const s = d * 0.85 * n ** 0.4 * F;
        tx = b.ox - (dx / d) * s; ty = b.oy - (dy / d) * s;
      } else { tx = b.ox; ty = b.oy; }
    }
  }
  const stiff = rule.temper === "attract" ? 5 : 3.2, damp = rule.temper === "attract" ? 3.4 : 2.6, k = active ? 1 : 0.6;
  b.vx += ((tx - b.ox) * stiff - b.vx * damp) * dt * k;
  b.vy += ((ty - b.oy) * stiff - b.vy * damp) * dt * k;
  if (!active) { b.vx -= b.ox * 1.8 * dt; b.vy -= b.oy * 1.8 * dt; }
  b.ox += b.vx * dt; b.oy += b.vy * dt;
  return [x + b.ox, y + b.oy];
}

export const body = (): Body => ({ ox: 0, oy: 0, vx: 0, vy: 0 });
