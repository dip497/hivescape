/**
 * Short-lived things a scene starts and the renderer can show without the scene drawing them:
 * ripples (a ring that lifts the tiles it crosses) and pulses of light. Bounded: past `cap` the
 * oldest goes, so a click storm costs the same as one click.
 */

export interface Ripple {
  x: number;
  y: number;
  /** Scene time it began, seconds. */
  at: number;
  /** Seconds it lives. */
  life: number;
  /** Pixels a second the ring grows. */
  speed: number;
  /** 0..1, how much it lifts what it crosses. */
  strength: number;
}

export class Effects {
  readonly ripples: Ripple[] = [];
  constructor(private readonly cap = 8) {}

  ripple(r: Ripple): void {
    this.ripples.push(r);
    if (this.ripples.length > this.cap) this.ripples.shift();
  }

  /** Drop what has run its life by `now`. */
  prune(now: number): void {
    for (let i = this.ripples.length - 1; i >= 0; i--) if (now - this.ripples[i]!.at >= this.ripples[i]!.life) this.ripples.splice(i, 1);
  }

  clear(): void { this.ripples.length = 0; }
}
