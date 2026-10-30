/**
 * A flock in flat arrays, its neighbours found through a spatial grid: each step costs about
 * O(n · neighbours) rather than O(n²), so a thousand fish cost what thirty would by brute force.
 * Positions wrap round the field.
 */

export interface FlockRules {
  /** Neighbours within this radius count (pixels). */
  radius: number;
  /** Closer than this they push apart. */
  personal: number;
  cohesion: number;
  alignment: number;
  separation: number;
  /** Top speed, pixels a second. */
  maxSpeed: number;
}

export const DEFAULT_RULES: FlockRules = { radius: 60, personal: 20, cohesion: 0.6, alignment: 3, separation: 3, maxSpeed: 90 };

export class Flock {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  private head: Int32Array = new Int32Array(0);
  private next: Int32Array;
  private gw = 0;
  private gh = 0;

  constructor(readonly n: number, public w: number, public h: number, seed: () => number) {
    this.x = new Float32Array(n); this.y = new Float32Array(n); this.vx = new Float32Array(n); this.vy = new Float32Array(n);
    this.next = new Int32Array(n);
    for (let i = 0; i < n; i++) { this.x[i] = seed() * w; this.y[i] = seed() * h; const a = seed() * Math.PI * 2; this.vx[i] = Math.cos(a) * 30; this.vy[i] = Math.sin(a) * 30; }
  }

  /** Bucket every member into grid cells of `size` (a linked list through `next`). */
  private bucket(size: number): void {
    const gw = Math.max(1, Math.ceil(this.w / size)), gh = Math.max(1, Math.ceil(this.h / size));
    if (gw * gh !== this.head.length) this.head = new Int32Array(gw * gh);
    this.gw = gw; this.gh = gh;
    this.head.fill(-1);
    for (let i = 0; i < this.n; i++) {
      const cx = Math.min(gw - 1, Math.max(0, (this.x[i]! / size) | 0)), cy = Math.min(gh - 1, Math.max(0, (this.y[i]! / size) | 0));
      const c = cy * gw + cx;
      this.next[i] = this.head[c]!;
      this.head[c] = i;
    }
  }

  /** Calls `fn(j, dx, dy, d2)` for every other member within `radius` of member `i` (wrapping). */
  neighbours(i: number, radius: number, fn: (j: number, dx: number, dy: number, d2: number) => void): void {
    const size = this.w / this.gw, xi = this.x[i]!, yi = this.y[i]!, r2 = radius * radius;
    const cx = (xi / size) | 0, cy = (yi / (this.h / this.gh)) | 0, reach = Math.ceil(radius / size);
    for (let oy = -reach; oy <= reach; oy++) for (let ox = -reach; ox <= reach; ox++) {
      const gx = (cx + ox + this.gw) % this.gw, gy = (cy + oy + this.gh) % this.gh;
      for (let j = this.head[gy * this.gw + gx]!; j !== -1; j = this.next[j]!) {
        if (j === i) continue;
        let dx = this.x[j]! - xi, dy = this.y[j]! - yi;
        if (dx > this.w / 2) dx -= this.w; else if (dx < -this.w / 2) dx += this.w;
        if (dy > this.h / 2) dy -= this.h; else if (dy < -this.h / 2) dy += this.h;
        const d2 = dx * dx + dy * dy;
        if (d2 < r2) fn(j, dx, dy, d2);
      }
    }
  }

  step(dt: number, rules: FlockRules = DEFAULT_RULES, steer?: (i: number) => [number, number] | null): void {
    this.bucket(rules.radius);
    const p2 = rules.personal * rules.personal;
    let cx = 0, cy = 0, ax = 0, ay = 0, sx = 0, sy = 0, k = 0;
    const visit = (j: number, dx: number, dy: number, d2: number) => {
      cx += dx; cy += dy; ax += this.vx[j]!; ay += this.vy[j]!; k++;
      if (d2 < p2) { const f = 1 - Math.sqrt(d2) / rules.personal; sx -= dx * f; sy -= dy * f; }
    };
    for (let i = 0; i < this.n; i++) {
      cx = cy = ax = ay = sx = sy = k = 0;
      this.neighbours(i, rules.radius, visit);
      let fx = sx * rules.separation, fy = sy * rules.separation;
      if (k) { fx += (cx / k) * rules.cohesion + (ax / k - this.vx[i]!) * rules.alignment; fy += (cy / k) * rules.cohesion + (ay / k - this.vy[i]!) * rules.alignment; }
      const s = steer?.(i);
      if (s) { fx += s[0]; fy += s[1]; }
      let vx = this.vx[i]! + fx * dt, vy = this.vy[i]! + fy * dt;
      const sp = Math.hypot(vx, vy);
      if (sp > rules.maxSpeed) { vx *= rules.maxSpeed / sp; vy *= rules.maxSpeed / sp; }
      this.vx[i] = vx; this.vy[i] = vy;
    }
    for (let i = 0; i < this.n; i++) {
      let x = this.x[i]! + this.vx[i]! * dt, y = this.y[i]! + this.vy[i]! * dt;
      if (x < 0) x += this.w; else if (x >= this.w) x -= this.w;
      if (y < 0) y += this.h; else if (y >= this.h) y -= this.h;
      this.x[i] = x; this.y[i] = y;
    }
  }

  resize(w: number, h: number): void {
    const sx = w / this.w, sy = h / this.h;
    for (let i = 0; i < this.n; i++) { this.x[i] = this.x[i]! * sx; this.y[i] = this.y[i]! * sy; }
    this.w = w; this.h = h;
  }
}
