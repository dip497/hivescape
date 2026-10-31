/**
 * Living paintings. A public-domain masterwork becomes a scene: the painting fills the screen, kept
 * round the point that matters, and effects laid over it bring it to life: water that ripples where the painter put water, rain, mist drifting
 * across the hills, wind through a field, birds, falling petals or snow, lights that breathe. Drawn
 * in the ink style the painting becomes characters in its own colours, as an ASCII shader draws.
 *
 * The picture comes with the scene, as base64 bytes in its bundle (a wallpaper may fetch nothing),
 * and is decoded once. Its credit (title, artist, date, collection, licence) goes in the scene's
 * package.json as `hivescape.credit`, and `pack` writes it beside the wallpaper as CREDITS.txt. Regions are given in the painting's own fractions (0..1 across and down), so
 * an effect stays on the water whatever the screen's shape.
 */
import { clamp, defineScene, hex, TAU, type Look, type Rgb, type Scene, type StyleSpec, type World } from "@hivescape/core";

/** A rectangle in the painting: left, top, right, bottom, each 0..1. */
export type Region = readonly [number, number, number, number];

export type Effect =
  /** Water: the region redrawn in thin rows, each swaying a little, so it ripples. */
  | { kind: "water"; region: Region; amp?: number; speed?: number }
  /** Wind through a field or trees: rows shifting in a wave that travels across. */
  | { kind: "wind"; region: Region; amp?: number; speed?: number }
  /** Rain: streaks at `angle` (radians from straight down, positive leaning right). */
  | { kind: "rain"; count: number; angle: number; colour: string; alpha?: number; length?: number; speed?: number; region?: Region }
  /** Mist: soft bands drifting across, at heights given in the painting's fractions. */
  | { kind: "mist"; bands: readonly number[]; colour: string; alpha?: number; speed?: number }
  /** Birds: small flocks crossing the sky region. */
  | { kind: "birds"; count: number; region: Region; colour: string }
  /** Falling things: petals, leaves, snow. */
  | { kind: "fall"; count: number; region: Region; colours: readonly string[]; size?: number; speed?: number }
  /** A light that breathes, at a point of the painting: a lamp, a halo, the low sun. */
  | { kind: "glow"; at: readonly [number, number]; radius: number; colour: Rgb; alpha: number; pulse?: number };

export interface Masterwork {
  id: string;
  name: string;
  description: string;
  /** The painting, base64 (import it: the build bundles images as base64). */
  image: string;
  mime?: string;
  /** The point of the painting (after `crop`) kept in view when the screen's shape cuts it, 0..1. */
  focus?: readonly [number, number];
  /** Crop away the paper or mount round the painted area first. */
  crop?: Region;
  effects: readonly Effect[];
  style?: (look: Look) => Partial<StyleSpec>;
}

interface Drop { x: number; y: number; v: number; len: number }
interface Flake { x: number; y: number; vx: number; vy: number; r: number; c: string; spin: number }
interface Bird { x: number; y: number; v: number; phase: number; flock: number }

interface State {
  img: ImageBitmap | null;
  t: number;
  drops: Drop[][];
  flakes: Flake[][];
  birds: Bird[][];
}

/** Where the painting sits on a screen of `W x H`: its drawn rectangle, from its cropped source. */
export interface Placement { sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number }

/** The painting (cropped) covers the screen, scaled to fill it and cut round `focus`. */
export function place(img: { width: number; height: number }, m: Pick<Masterwork, "crop" | "focus">, W: number, H: number): Placement {
  const [c0, c1, c2, c3] = m.crop ?? [0, 0, 1, 1];
  const sx = img.width * c0, sy = img.height * c1, sw = img.width * (c2 - c0), sh = img.height * (c3 - c1);
  const k = Math.max(W / sw, H / sh), dw = sw * k, dh = sh * k;
  const [fx, fy] = m.focus ?? [0.5, 0.5];
  return { sx, sy, sw, sh, dx: clamp(W / 2 - dw * fx, W - dw, 0), dy: clamp(H / 2 - dh * fy, H - dh, 0), dw, dh };
}

/** A point of the painting (its fractions, after the crop) on the screen. */
export const at = (p: Placement, fx: number, fy: number): [number, number] => [p.dx + p.dw * fx, p.dy + p.dh * fy];

function decode(b64: string, mime: string): Promise<ImageBitmap> | null {
  if (typeof createImageBitmap !== "function" || typeof atob !== "function") return null;
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return createImageBitmap(new Blob([bytes], { type: mime }));
}

export function defineMasterwork(m: Masterwork): Scene<State> {
  const seedFx = (w: World, s: State) => {
    s.drops = m.effects.map((e) => (e.kind === "rain" ? Array.from({ length: e.count }, () => ({ x: w.rng() * w.size.w, y: w.rng() * w.size.h, v: 0.8 + w.rng() * 0.4, len: (e.length ?? 26) * (0.6 + w.rng() * 0.8) })) : []));
    s.flakes = m.effects.map((e) => (e.kind === "fall" ? Array.from({ length: e.count }, () => ({ x: w.rng() * w.size.w, y: w.rng() * w.size.h, vx: (w.rng() - 0.5) * 12, vy: (e.speed ?? 22) * (0.6 + w.rng() * 0.8), r: (e.size ?? 3) * (0.6 + w.rng() * 0.8), c: e.colours[Math.floor(w.rng() * e.colours.length)]!, spin: w.rng() * TAU })) : []));
    s.birds = m.effects.map((e) => (e.kind === "birds" ? Array.from({ length: e.count }, (_, i) => ({ x: w.rng() * w.size.w, y: 0, v: 18 + w.rng() * 14, phase: w.rng() * TAU, flock: i % 3 })) : []));
  };

  return defineScene<State>({
    id: m.id,
    name: m.name,
    description: m.description,
    style: (look) => ({ kind: "ink", cell: [7, 13], ambient: 1, glow: 0.4, edge: 0.12, ...m.style?.(look) }),

    create(w) {
      const s: State = { img: null, t: 0, drops: [], flakes: [], birds: [] };
      seedFx(w, s);
      decode(m.image, m.mime ?? "image/jpeg")?.then((img) => { s.img = img; }).catch(() => {});
      return s;
    },
    resize(s, w) { seedFx(w, s); },

    step(s, dt, w) {
      s.t += dt;
      const { w: W, h: H } = w.size;
      const p = s.img ? place(s.img, m, W, H) : { sx: 0, sy: 0, sw: 1, sh: 1, dx: 0, dy: 0, dw: W, dh: H };
      m.effects.forEach((e, k) => {
        if (e.kind === "rain") {
          const [x0, y0, x1, y1] = e.region ?? [0, 0, 1, 1], [ax, ay] = at(p, x0, y0), [bx, by] = at(p, x1, y1);
          const sp = (e.speed ?? 900) * dt, sx = Math.sin(e.angle), cy = Math.cos(e.angle);
          for (const d of s.drops[k]!) {
            d.y += sp * d.v * cy; d.x += sp * d.v * sx;
            if (d.y > by) { d.y = ay - d.len; d.x = ax + w.rng() * (bx - ax); }
            if (d.x > bx + 40) d.x -= bx - ax; if (d.x < ax - 40) d.x += bx - ax;
          }
        } else if (e.kind === "fall") {
          const [x0, y0, x1, y1] = e.region, [ax, ay] = at(p, x0, y0), [bx, by] = at(p, x1, y1);
          for (const f of s.flakes[k]!) {
            f.spin += dt * 2; f.x += (f.vx + Math.sin(s.t * 0.7 + f.spin) * 10) * dt; f.y += f.vy * dt;
            if (f.y > by) { f.y = ay; f.x = ax + w.rng() * (bx - ax); }
          }
        } else if (e.kind === "birds") {
          const [x0, y0, x1, y1] = e.region, [ax, ay] = at(p, x0, y0), [bx, by] = at(p, x1, y1);
          s.birds[k]!.forEach((b, i) => {
            b.phase += dt * 9; b.x += b.v * dt;
            if (b.x > bx + 30) b.x = ax - 30;
            b.y = ay + (by - ay) * (0.3 + 0.4 * ((b.flock * 0.37 + 0.2) % 1)) + Math.sin(s.t * 0.4 + i) * 10 + (i % 5) * 6;
          });
        }
      });
    },

    backdrop(_s, g, w) { g.fillStyle = w.look.dark ? "#050505" : "#f4f1ea"; g.fillRect(0, 0, w.size.w, w.size.h); },

    picture(s, g, w) {
      const { w: W, h: H } = w.size;
      if (!s.img) return;
      const p = place(s.img, m, W, H);
      g.drawImage(s.img, p.sx, p.sy, p.sw, p.sh, p.dx, p.dy, p.dw, p.dh);
      m.effects.forEach((e, k) => {
        if (e.kind === "water" || e.kind === "wind") {
          // Redraw the region in rows, each shifted on a slow wave: water ripples, a field leans in the wind.
          const [x0, y0, x1, y1] = e.region, rows = 26, amp = e.amp ?? (e.kind === "water" ? 3 : 4), sp = e.speed ?? 1;
          for (let r = 0; r < rows; r++) {
            const fy0 = y0 + ((y1 - y0) * r) / rows, fy1 = y0 + ((y1 - y0) * (r + 1)) / rows;
            const off = e.kind === "water"
              ? Math.sin(s.t * 1.3 * sp + r * 0.9) * amp * (0.4 + (r / rows) * 0.6)
              : Math.sin(s.t * 0.9 * sp - r * 0.25) * amp * (1 - (r / rows) * 0.5);
            const sx = p.sx + p.sw * x0, sy = p.sy + p.sh * fy0, sw = p.sw * (x1 - x0), sh = p.sh * (fy1 - fy0);
            const [dx, dy] = at(p, x0, fy0), [ex, ey] = at(p, x1, fy1);
            g.drawImage(s.img!, sx, sy, sw, sh, dx + off, dy, ex - dx, ey - dy + 0.5);
          }
        } else if (e.kind === "rain") {
          g.strokeStyle = e.colour; g.globalAlpha = e.alpha ?? 0.55; g.lineWidth = 1.2;
          const sx = Math.sin(e.angle), cy = Math.cos(e.angle);
          g.beginPath();
          for (const d of s.drops[k]!) { g.moveTo(d.x, d.y); g.lineTo(d.x + sx * d.len, d.y + cy * d.len); }
          g.stroke(); g.globalAlpha = 1;
        } else if (e.kind === "mist") {
          for (const [i, fy] of e.bands.entries()) {
            const [, y] = at(p, 0, fy), x = ((s.t * (e.speed ?? 8) * (i % 2 ? 1 : -0.7) + i * 400) % (W * 1.6)) - W * 0.3;
            const gr = g.createRadialGradient(x, y, 0, x, y, W * 0.4);
            const c = hex(e.colour);
            gr.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${e.alpha ?? 0.35})`); gr.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
            g.save(); g.translate(x, y); g.scale(1, 0.18); g.translate(-x, -y);
            g.fillStyle = gr; g.fillRect(x - W * 0.4, y - W * 0.4, W * 0.8, W * 0.8); g.restore();
          }
        } else if (e.kind === "birds") {
          g.strokeStyle = e.colour; g.lineWidth = 1.6;
          for (const b of s.birds[k]!) { const f = Math.sin(b.phase) * 4; g.beginPath(); g.moveTo(b.x - 7, b.y - f); g.quadraticCurveTo(b.x - 3, b.y - 2, b.x, b.y); g.quadraticCurveTo(b.x + 3, b.y - 2, b.x + 7, b.y - f); g.stroke(); }
        } else if (e.kind === "fall") {
          for (const f of s.flakes[k]!) { g.fillStyle = f.c; g.beginPath(); g.ellipse(f.x, f.y, f.r, f.r * (0.5 + 0.5 * Math.abs(Math.sin(f.spin))), f.spin, 0, TAU); g.fill(); }
        }
      });
    },

    light(s, g, w) {
      if (!s.img) return;
      const p = place(s.img, m, w.size.w, w.size.h);
      for (const e of m.effects) {
        if (e.kind !== "glow") continue;
        const [x, y] = at(p, e.at[0], e.at[1]), r = e.radius * Math.min(p.dw, p.dh);
        const a = e.alpha * (1 + (e.pulse ?? 0) * Math.sin(s.t * 1.7));
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, `rgba(${e.colour[0]},${e.colour[1]},${e.colour[2]},${a})`); gr.addColorStop(1, `rgba(${e.colour[0]},${e.colour[1]},${e.colour[2]},0)`);
        g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    },
  });
}

