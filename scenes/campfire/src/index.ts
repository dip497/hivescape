/**
 * Campfire, seen from the side: a fire in a clearing under the moon, ringed by stones, a seat log
 * beside it, firs near and far and a ridge on the horizon. The fire is the scene's light: it lights
 * the firs, the stones and the ground on the side facing it, and flickers. Its flames lean toward the
 * pointer, the layers shift a little as the pointer moves (near ones more than far ones), sparks rise
 * and drift to it, and a click throws a log on, so the fire flares and showers sparks. By day (a
 * light look) it is dusk: a lavender sky, the same fire, the firs lit by the last of the day.
 */
import { clamp, defineScene, hex, parallax, TAU, type Paint, type Point, type Rgb, type World } from "@hivescape/core";

interface Spark { x: number; y: number; vx: number; vy: number; life: number; age: number; hot: boolean }
interface Fir { x: number; h: number; w: number; tone: number; depth: number }
interface Fly { x: number; y: number; phase: number; speed: number }
interface Tuft { x: number; y: number; s: number; depth: number }

interface Camp { sparks: Spark[]; heat: number; flare: number; firs: Fir[]; flies: Fly[]; tufts: Tuft[]; lean: number; t: number; logs: number; cam: Point }

const LOOKS = {
  dark: {
    sky: ["#04060f", "#0a1430", "#16244a"], ridge: ["#0d1630", "#111c38"], moon: "#f1e7c6",
    ground: ["#120f0d", "#1d1915"], firs: ["#4d7364", "#41675d"], farFirs: "#2c4256", grass: "#5f7a4a",
    star: hex("#fff6dd"), stone: "#68646e", log: "#7a5232", spark: [hex("#ffe08a"), hex("#ff8a3d")] as Rgb[],
    fly: hex("#d8ff8a"), moonLight: "rgba(150,170,230,", moonK: 0.3,
  },
  light: {
    sky: ["#a99be0", "#dcc6ea", "#f7d4c4"], ridge: ["#9d8fc4", "#b3a3cf"], moon: "#fff8e8",
    ground: ["#a7a08f", "#bdb4a0"], firs: ["#6f7fa0", "#7f8aa8"], farFirs: "#a497c4", grass: "#7f8f63",
    star: hex("#ffffff"), stone: "#a9a3ad", log: "#8a6040", spark: [hex("#ff9d3d"), hex("#e2622a")] as Rgb[],
    fly: hex("#fff3b0"), moonLight: "rgba(255,230,210,", moonK: 0.12,
  },
};
const palette = (w: World) => (w.look.dark ? LOOKS.dark : LOOKS.light);

const horizonOf = (w: World) => w.size.h * 0.66;
const fire = (w: World) => ({ x: w.size.w * 0.5, y: w.size.h * 0.8, s: clamp(Math.min(w.size.w, w.size.h) / 900, 0.6, 1.4) });

function firsFor(w: World): Fir[] {
  const out: Fir[] = [];
  const { w: W, h: H } = w.size;
  // The far line along the horizon, small and close together.
  for (let i = 0; i < 34; i++) out.push({ x: (i / 33) * W + (w.rng() - 0.5) * 30, h: H * (0.07 + w.rng() * 0.06), w: 26 + w.rng() * 16, tone: w.rng(), depth: 0.35 });
  // The near firs at the sides, tall at the edges, leaving the fire a clearing.
  for (let i = 0; i < 18; i++) {
    const side = i % 2 ? 1 : -1, d = (i >> 1) / 9;
    const x = W / 2 + side * (W * 0.24 + d * W * 0.3 + w.rng() * 30);
    out.push({ x, h: H * (0.3 + d * 0.5 + w.rng() * 0.1), w: 60 + d * 80 + w.rng() * 24, tone: w.rng(), depth: 1 });
  }
  return out.sort((a, b) => a.depth - b.depth || a.h - b.h);
}

function tuftsFor(w: World): Tuft[] {
  const out: Tuft[] = [], f = fire(w), { w: W, h: H } = w.size, horizon = horizonOf(w);
  for (let i = 0; i < 60; i++) {
    const y = horizon + 14 + w.rng() ** 0.8 * (H - horizon), x = w.rng() * W;
    // Trodden bare round the fire.
    if (Math.hypot((x - f.x) / 1.6, y - f.y) < 150 * f.s) continue;
    const near = (y - horizon) / (H - horizon);
    out.push({ x, y, s: (0.5 + near * 0.9) * f.s, depth: 0.5 + near * 0.6 });
  }
  return out;
}

function fliesFor(w: World): Fly[] {
  return Array.from({ length: 9 }, () => ({ x: w.rng() * w.size.w, y: horizonOf(w) - 40 + w.rng() * w.size.h * 0.3, phase: w.rng() * TAU, speed: 0.4 + w.rng() * 0.6 }));
}

export default defineScene<Camp>({
  id: "campfire",
  name: "Campfire",
  description: "A campfire in a clearing under the moon, lighting the firs around it: flames lean to the pointer, and a click throws a log on.",
  style: (look) => ({
    kind: "comb", cell: [13, 0], relief: 0.7, gloss: 0.5,
    shadow: look.dark ? [0, 0, 0] : [50, 30, 70], shadowAlpha: look.dark ? 0.6 : 0.22,
    ambient: look.dark ? 0.42 : 0.9, glow: look.dark ? 0.7 : 0.3, key: look.dark ? [170, 190, 255] : [255, 236, 220],
  }),

  create(w) { return { sparks: [], heat: 1, flare: 0, firs: firsFor(w), flies: fliesFor(w), tufts: tuftsFor(w), lean: 0, t: 0, logs: 3, cam: { x: 0, y: 0 } }; },
  resize(s, w) { s.firs = firsFor(w); s.flies = fliesFor(w); s.tufts = tuftsFor(w); s.sparks.length = 0; },

  click(s, x, y, w) {
    s.flare = 1; s.logs = Math.min(6, s.logs + 1);
    const f = fire(w);
    for (let i = 0; i < 40; i++) s.sparks.push({ x: f.x + (w.rng() - 0.5) * 60 * f.s, y: f.y - 30 * f.s, vx: (w.rng() - 0.5) * 160, vy: -120 - w.rng() * 220, life: 1.2 + w.rng() * 1.6, age: 0, hot: true });
    w.effects.ripple({ x, y, at: w.time, life: 1.2, speed: 280, strength: 0.6 });
  },

  step(s, dt, w) {
    s.t += dt;
    const f = fire(w), p = w.input.pointer;
    s.flare = Math.max(0, s.flare - dt * 0.35);
    s.heat = 0.85 + 0.15 * Math.sin(s.t * 1.7) + s.flare * 0.6;
    // Flames lean toward a pointer, more the nearer it is.
    const target = p.active ? clamp((p.x - f.x) / (w.size.w * 0.35), -1, 1) * clamp(1 - Math.abs(p.y - f.y) / w.size.h, 0.3, 1) : 0;
    s.lean += (target - s.lean) * Math.min(1, dt * 2.5);
    // The camera follows the pointer a little, so the layers part.
    const cx = p.active ? (p.x - w.size.w / 2) * 0.03 : 0, cy = p.active ? (p.y - w.size.h / 2) * 0.015 : 0;
    s.cam.x += (cx - s.cam.x) * Math.min(1, dt * 1.5); s.cam.y += (cy - s.cam.y) * Math.min(1, dt * 1.5);
    if (w.rng() < dt * (10 + s.heat * 10)) s.sparks.push({ x: f.x + (w.rng() - 0.5) * 50 * f.s, y: f.y - 40 * f.s, vx: (w.rng() - 0.5) * 30, vy: -60 - w.rng() * 90, life: 1.4 + w.rng() * 2.2, age: 0, hot: w.rng() < 0.3 });
    for (const k of s.sparks) {
      k.age += dt;
      k.vx += Math.sin(s.t * 2 + k.y * 0.02) * 20 * dt + s.lean * 25 * dt;
      if (p.active) { const dx = p.x - k.x, dy = p.y - k.y, d = Math.hypot(dx, dy); if (d < 260 && d > 1) { k.vx += (dx / d) * 40 * dt; k.vy += (dy / d) * 20 * dt; } }
      k.vy += 12 * dt;
      k.x += k.vx * dt; k.y += k.vy * dt;
    }
    s.sparks = s.sparks.filter((k) => k.age < k.life && k.y > -20);
    if (s.sparks.length > 220) s.sparks.splice(0, s.sparks.length - 220);
    if (s.logs > 3 && w.rng() < dt * 0.05) s.logs--;
    for (const fl of s.flies) {
      fl.phase += dt * fl.speed;
      fl.x += Math.cos(fl.phase * 1.3) * 14 * dt; fl.y += Math.sin(fl.phase * 0.9) * 9 * dt;
    }
  },

  backdrop(_s, g, w) {
    const L = palette(w), { w: W, h: H } = w.size, horizon = horizonOf(w);
    const sky = g.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, L.sky[0]!); sky.addColorStop(0.6, L.sky[1]!); sky.addColorStop(1, L.sky[2]!);
    g.fillStyle = sky; g.fillRect(0, 0, W, horizon + 4);
    // The moon: a crescent, its halo, at the horizon's own distance (it never moves).
    const mx = W * 0.74, my = H * 0.17, mr = Math.min(W, H) * 0.042;
    const halo = g.createRadialGradient(mx, my, mr, mx, my, mr * 6);
    halo.addColorStop(0, w.look.dark ? "rgba(241,231,198,0.16)" : "rgba(255,255,255,0.4)"); halo.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = halo; g.fillRect(mx - mr * 6, my - mr * 6, mr * 12, mr * 12);
    g.save();
    g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.clip();
    g.fillStyle = L.moon; g.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
    // The dark of the moon is the sky behind it.
    g.fillStyle = sky;
    g.beginPath(); g.arc(mx + mr * 0.42, my - mr * 0.22, mr * 0.92, 0, TAU); g.fill();
    g.restore();
    // Two ridges on the horizon, the farther paler.
    for (let r = 0; r < 2; r++) {
      g.fillStyle = L.ridge[r]!;
      g.beginPath(); g.moveTo(0, horizon + 4);
      for (let x = 0; x <= W; x += 24) {
        const y = horizon - H * (0.05 - r * 0.02) - Math.sin(x * 0.004 + r * 2) * H * 0.04 - Math.sin(x * 0.011 + r) * H * 0.015;
        g.lineTo(x, y);
      }
      g.lineTo(W, horizon + 4); g.closePath(); g.fill();
    }
    // The ground: smooth, darker toward the viewer; the fire's glow lights it.
    const ground = g.createLinearGradient(0, horizon, 0, H);
    ground.addColorStop(0, L.ground[1]!); ground.addColorStop(1, L.ground[0]!);
    g.fillStyle = ground; g.fillRect(0, horizon, W, H - horizon);
  },

  picture(s, g, w) {
    const L = palette(w), { w: W, h: H } = w.size, f = fire(w), t = s.t, horizon = horizonOf(w);
    // Far firs, then the ground, then the near firs: each layer shifted by its distance.
    for (const fir of s.firs) if (fir.depth < 1) { const o = parallax(s.cam, fir.depth); drawFir(g, fir, horizon + 6 + o.y, L.farFirs, o.x); }
    const go = parallax(s.cam, 0.6);
    // Tufts of grass over the clearing, thinning toward the fire.
    g.fillStyle = L.grass;
    for (const t of s.tufts) {
      const o = parallax(s.cam, t.depth);
      drawTuft(g, t.x + o.x, t.y + o.y, t.s);
    }
    for (const fir of s.firs) if (fir.depth >= 1) { const o = parallax(s.cam, fir.depth); drawFir(g, fir, horizon + 10 + o.y, L.firs[fir.tone > 0.5 ? 1 : 0]!, o.x); }
    g.save(); g.translate(go.x, go.y);
    // The seat log and the ring of stones.
    drawLog(g, f.x - 230 * f.s, f.y + 40 * f.s, 150 * f.s, 26 * f.s, 0.06, L.log);
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (0.05 + (i / 8) * 0.9), sx = f.x + Math.cos(a) * 74 * f.s, sy = f.y + 14 * f.s + Math.sin(a) * 22 * f.s;
      g.fillStyle = L.stone; g.beginPath(); g.ellipse(sx, sy, 16 * f.s, 11 * f.s, 0, 0, TAU); g.fill();
    }
    for (let i = 0; i < s.logs; i++) drawLog(g, f.x + (i - (s.logs - 1) / 2) * 16 * f.s, f.y + 4 * f.s, 90 * f.s, 15 * f.s, (i % 2 ? 1 : -1) * 0.5, L.log);
    // The flames: tongues from wide and red at the base to small and white-yellow at the heart.
    const layers: [number, string][] = [[1, "#d4361e"], [0.78, "#f26a1b"], [0.56, "#ffa62b"], [0.34, "#ffe28a"], [0.18, "#fff6d8"]];
    for (const [k, colour] of layers) {
      g.fillStyle = colour;
      for (let tongue = 0; tongue < 3; tongue++) {
        // A tall middle tongue and two shorter ones leaning out, each licking on its own beat.
        const off = (tongue - 1) * 36 * f.s * (0.6 + k * 0.4);
        const hgt = (200 + 55 * Math.sin(t * 5 + tongue * 2.1) + 30 * Math.sin(t * 11.3 + tongue)) * f.s * k * (0.85 + s.heat * 0.3) * (tongue === 1 ? 1 : 0.55 + 0.15 * Math.sin(t * 2.3 + tongue * 4));
        const wid = (tongue === 1 ? 32 : 24) * f.s * k;
        drawTongue(g, f.x + off, f.y - 4 * f.s, wid, hgt, s.lean * 0.6 + (tongue - 1) * 0.28 + Math.sin(t * 3 + tongue) * 0.12);
      }
    }
    g.restore();
  },

  light(s, g, w) {
    const L = palette(w), { w: W, h: H } = w.size, f = fire(w), go = parallax(s.cam, 0.6);
    // The moon's wash from the upper right: faint, but it gives every relief a cool rim.
    const mx = W * 0.74, my = H * 0.17, R = Math.max(W, H) * 0.9;
    const moon = g.createRadialGradient(mx, my, 0, mx, my, R);
    moon.addColorStop(0, L.moonLight + L.moonK + ")"); moon.addColorStop(1, L.moonLight + "0)");
    g.fillStyle = moon; g.fillRect(0, 0, W, H);
    // The fire: a broad warm light that breathes with its heat, and a hot heart.
    const fx = f.x + go.x + s.lean * 20 * f.s, fy = f.y - 50 * f.s + go.y;
    const flick = s.heat * (0.92 + 0.08 * Math.sin(s.t * 13.1) * Math.sin(s.t * 7.7));
    const r = 520 * f.s * (0.85 + flick * 0.2);
    const warm = g.createRadialGradient(fx, fy, 0, fx, fy, r);
    warm.addColorStop(0, `rgba(255,170,80,${0.95 * Math.min(1, flick)})`);
    warm.addColorStop(0.12, `rgba(255,140,60,${0.6 * Math.min(1, flick)})`);
    warm.addColorStop(0.45, `rgba(240,100,40,${0.16 * flick})`);
    warm.addColorStop(1, "rgba(240,90,30,0)");
    g.fillStyle = warm; g.fillRect(fx - r, fy - r, r * 2, r * 2);
    const cy = fy - 10 * f.s, cr = 70 * f.s;
    const core = g.createRadialGradient(fx, cy, 0, fx, cy, cr);
    core.addColorStop(0, "rgba(255,240,200,1)"); core.addColorStop(1, "rgba(255,200,120,0)");
    g.fillStyle = core; g.fillRect(fx - cr, cy - cr, cr * 2, cr * 2);
    if (!w.look.dark) return;
    for (const fl of s.flies) {
      const b = Math.max(0, Math.sin(fl.phase * 2.2));
      if (b < 0.2) continue;
      const fr = 40;
      const gl = g.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, fr);
      gl.addColorStop(0, `rgba(200,255,120,${0.5 * b})`); gl.addColorStop(1, "rgba(200,255,120,0)");
      g.fillStyle = gl; g.fillRect(fl.x - fr, fl.y - fr, fr * 2, fr * 2);
    }
  },

  overlay(s, o, w) {
    const L = palette(w), { w: W, h: H } = w.size, t = s.t;
    if (w.look.dark) for (let i = 0; i < 90; i++) {
      const x = W * ((i * 0.6180339) % 1), y = H * 0.58 * ((i * 0.7548776) % 1);
      const b = 0.35 + 0.65 * ((Math.sin(t * (0.6 + (i % 5) * 0.2) + i) + 1) / 2);
      o.dot(x, y, i % 11 === 0 ? 1.4 : 0.8, L.star, b * 0.85, i % 11 === 0 ? 3 : 1.5);
    }
    for (const k of s.sparks) {
      const life = 1 - k.age / k.life;
      o.dot(k.x, k.y, k.hot ? 1.8 : 1.3, L.spark[k.hot ? 0 : 1]!, clamp(life * 1.3), 2.5);
    }
    if (w.look.dark) for (const fl of s.flies) {
      const b = Math.max(0, Math.sin(fl.phase * 2.2));
      if (b > 0.05) o.dot(fl.x, fl.y, 1.6, L.fly, b, 4);
    }
  },
});

function drawTongue(g: Paint, x: number, y: number, w: number, h: number, lean: number): void {
  g.beginPath();
  g.moveTo(x - w, y);
  g.bezierCurveTo(x - w, y - h * 0.45, x + lean * h * 0.3 - w * 0.3, y - h * 0.7, x + lean * h * 0.5, y - h);
  g.bezierCurveTo(x + lean * h * 0.3 + w * 0.3, y - h * 0.7, x + w, y - h * 0.45, x + w, y);
  g.closePath(); g.fill();
}

function drawTuft(g: Paint, x: number, y: number, s: number): void {
  for (let b = -2; b <= 2; b++) {
    g.beginPath();
    g.moveTo(x + b * 5 * s - 3 * s, y); g.quadraticCurveTo(x + b * 7 * s, y - 16 * s, x + b * 10 * s, y - (22 - Math.abs(b) * 4) * s); g.lineTo(x + b * 5 * s + 3 * s, y);
    g.closePath(); g.fill();
  }
}

function drawLog(g: Paint, x: number, y: number, len: number, r: number, rot: number, colour: string): void {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.fillStyle = colour; g.beginPath(); g.roundRect(-len / 2, -r / 2, len, r, r / 2); g.fill();
  g.restore();
}

function drawFir(g: Paint, f: Fir, base: number, colour: string, dx: number): void {
  g.fillStyle = colour;
  const tiers = 5, x = f.x + dx;
  for (let i = 0; i < tiers; i++) {
    const top = base - f.h + (i / tiers) * f.h * 0.75, bottom = top + f.h * 0.38, half = (f.w / 2) * (0.35 + (i / tiers) * 0.75);
    g.beginPath(); g.moveTo(x, top); g.lineTo(x + half, bottom); g.lineTo(x - half, bottom); g.closePath(); g.fill();
  }
  g.fillRect(x - f.w * 0.05, base - f.h * 0.15, f.w * 0.1, f.h * 0.15);
}
