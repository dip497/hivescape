/** Small numeric helpers every scene reaches for. No allocation; all pure. */

export const TAU = Math.PI * 2;

export const clamp = (v: number, lo = 0, hi = 1): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** 0 below `e0`, 1 above `e1`, a smooth S between. */
export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
/** `v` folded into [0, n). */
export const wrap = (v: number, n: number): number => ((v % n) + n) % n;
/** The shortest signed turn from angle `a` to angle `b`, in (-π, π]. */
export const angleTo = (a: number, b: number): number => Math.atan2(Math.sin(b - a), Math.cos(b - a));
/** Turn `a` toward `b` by at most a share `k` (0..1) of the way. */
export const turnToward = (a: number, b: number, k: number): number => a + angleTo(a, b) * clamp(k);
/** Frame-rate independent approach: the share to move this step so `rate` per second is kept. */
export const damp = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);
