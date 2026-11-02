/**
 * Koi Pond: koi drift through a lily pond. They wander, gather under a pointer that rests on the
 * water and keep a little distance, scatter from a fast one, and race for the pellets a click drops
 * (the click sends a swell through the water too). Lily pads drift and give way to the pointer. Each
 * koi's body follows the path its head took, so it bends as it turns. By night paper lanterns float
 * on the pond and light the koi that pass them; by day the sun's dapple moves over everything.
 */
import { body, clamp, defineScene, hex, pull, TAU, turnToward, type Body, type Paint, type Rgb, type World } from "@hivescape/core";

interface Pal { body: string; fin: string; patches: [t: number, side: number, r: number, colour: string][] }

const VARIETIES: Pal[] = [
  { body: "#fbf7ef", fin: "rgba(255,244,236,0.9)", patches: [[0.05, 0, 0.11, "#e8401c"], [0.36, -0.05, 0.13, "#e8401c"], [0.62, 0.04, 0.1, "#e8401c"]] }, // kohaku
  { body: "#ffb42a", fin: "rgba(255,214,130,0.9)", patches: [[0.1, 0, 0.1, "#ffe08a"], [0.5, 0, 0.08, "#ffc53d"]] }, // yamabuki
  { body: "#202027", fin: "rgba(70,70,84,0.92)", patches: [[0.08, 0, 0.1, "#e5482a"], [0.32, 0.06, 0.1, "#f3f0e8"], [0.5, -0.06, 0.11, "#e5482a"], [0.76, 0.03, 0.07, "#f3f0e8"]] }, // showa
  { body: "#eeebe1", fin: "rgba(250,248,240,0.85)", patches: [[0.06, 0, 0.09, "#e23b25"]] }, // tancho
  { body: "#7f9ec0", fin: "rgba(170,195,220,0.85)", patches: [[0.45, 0.07, 0.12, "#e5823f"], [0.7, -0.05, 0.09, "#e5823f"]] }, // asagi
  { body: "#f6f1e4", fin: "rgba(255,250,240,0.9)", patches: [[0.2, 0.05, 0.08, "#17171c"], [0.42, -0.06, 0.1, "#e8401c"], [0.66, 0.05, 0.07, "#17171c"]] }, // taisho sanke
];

/** Width of the body along its length, head to tail, as a share of its length. */
const PROFILE = [0.24, 0.31, 0.34, 0.32, 0.27, 0.2, 0.13, 0.08];
const TRAIL = 96;
/** The trail keeps a point every this many pixels the head moves, so it is long enough for any body. */
const TRAIL_STEP = 4;

interface Koi {
  x: number; y: number; heading: number; speed: number;
  tx: number; ty: number; retarget: number;
  pal: Pal; len: number; phase: number;
  /** Where the head has been: a ring of points, newest at `ti`. */
  trail: Float32Array; ti: number;
}

interface Pad { fx: number; fy: number; r: number; rot: number; flower: number; b: Body; drift: number }
interface Pellet { x: number; y: number; at: number }

interface Lantern { x: number; y: number; vx: number; vy: number; phase: number; hue: number }

interface Pond { koi: Koi[]; pads: Pad[]; food: Pellet[]; lanterns: Lantern[] }

const LOOKS = {
  dark: {
    deep: ["#11454a", "#0b2e33", "#05171b"], bed: "rgba(120,190,170,0.06)", stone: ["#163b3c", "#0f2c2e"],
    pad: ["#3a8f47", "#47a052"], vein: "#2a6f35", spark: hex("#cfeff0"), shadow: hex("#00100f"),
    dapple: "rgba(120,170,210,", dappleK: 0.07, lantern: ["#ffd9a0", "#ffb36b"], lanternLight: [255, 176, 96] as Rgb,
  },
  light: {
    deep: ["#c8efe4", "#9fd8ca", "#6fb5a5"], bed: "rgba(255,255,240,0.2)", stone: ["#8cc4b4", "#7ab3a3"],
    pad: ["#4aa957", "#5cb862"], vein: "#3b8a45", spark: hex("#ffffff"), shadow: hex("#0d4a3e"),
    dapple: "rgba(255,248,220,", dappleK: 0.16, lantern: ["#ffe7c2", "#ffc58a"], lanternLight: [255, 200, 140] as Rgb,
  },
};
const palette = (w: World) => (w.look.dark ? LOOKS.dark : LOOKS.light);

function placeKoi(w: World, k: Koi, x: number, y: number): void {
  k.x = x; k.y = y;
  // Lay the trail out straight behind, so the body is whole on the first frame.
  for (let i = 0; i < TRAIL; i++) {
    const back = i * TRAIL_STEP;
    k.trail[i * 2] = x - Math.cos(k.heading) * back;
    k.trail[i * 2 + 1] = y - Math.sin(k.heading) * back;
  }
  k.ti = 0;
  void w;
}

function spawnKoi(w: World, n: number): Koi[] {
  const { w: W, h: H } = w.size;
  const cols = Math.ceil(Math.sqrt(n * (W / H))), rows = Math.ceil(n / cols);
  const out: Koi[] = [];
  for (let i = 0; i < n; i++) {
    const cx = ((i % cols) + 0.2 + w.rng() * 0.6) / cols, cy = (Math.floor(i / cols) + 0.2 + w.rng() * 0.6) / rows;
    const k: Koi = {
      x: 0, y: 0, heading: w.rng() * TAU, speed: 40 + w.rng() * 20, tx: 0, ty: 0, retarget: 0,
      pal: VARIETIES[i % VARIETIES.length]!, len: (170 + w.rng() * 70) * clamp(Math.min(W, H) / 900, 0.7, 1.3), phase: w.rng() * TAU,
      trail: new Float32Array(TRAIL * 2), ti: 0,
    };
    placeKoi(w, k, cx * W, cy * H);
    newTarget(w, k);
    out.push(k);
  }
  return out;
}

function newTarget(w: World, k: Koi): void {
  const m = 80;
  k.tx = m + w.rng() * (w.size.w - 2 * m);
  k.ty = m + w.rng() * (w.size.h - 2 * m);
  k.retarget = 6 + w.rng() * 8;
}

function layoutPads(w: World): Pad[] {
  const { w: W, h: H } = w.size, s = clamp(Math.min(W, H) / 900, 0.7, 1.4);
  // Mostly round the edges, a few further in: the middle stays open water for the koi.
  const spots = [[0.07, 0.16, 82], [0.16, 0.86, 70], [0.9, 0.12, 92], [0.93, 0.7, 76], [0.42, 0.08, 58], [0.62, 0.93, 64], [0.27, 0.48, 46], [0.76, 0.42, 52], [0.03, 0.55, 60]];
  return spots.map(([fx, fy, r], i) => ({ fx: fx!, fy: fy!, r: r! * s, rot: i * 1.7, flower: i % 3 === 1 ? 1 : i % 4 === 0 ? 2 : 0, b: body(), drift: w.rng() * TAU }));
}

function launchLanterns(w: World): Lantern[] {
  const { w: W, h: H } = w.size;
  return [[0.3, 0.3], [0.68, 0.62], [0.52, 0.18]].map(([fx, fy], i) => ({
    x: fx! * W, y: fy! * H, vx: (w.rng() - 0.5) * 8, vy: (w.rng() - 0.5) * 8, phase: w.rng() * TAU, hue: i % 2,
  }));
}

export default defineScene<Pond>({
  id: "koi",
  name: "Koi Pond",
  description: "Koi drift through a lily pond, gather under a resting pointer, and race for the food a click drops. By night, floating lanterns light them.",
  style: (look) => ({
    kind: "comb", cell: [10, 0], gap: 1, relief: 0.8, gloss: 0.75,
    shadow: look.dark ? LOOKS.dark.shadow : LOOKS.light.shadow, shadowAlpha: look.dark ? 0.55 : 0.22,
    ambient: look.dark ? 0.62 : 1, glow: look.dark ? 0.55 : 0.25, key: look.dark ? [200, 225, 255] : [255, 250, 235],
  }),

  create(w) {
    const n = Math.round(clamp(3 + (w.size.w * w.size.h) / 260_000, 4, 11));
    return { koi: spawnKoi(w, n), pads: layoutPads(w), food: [], lanterns: launchLanterns(w) };
  },

  resize(s, w) {
    s.pads = layoutPads(w);
    s.lanterns = launchLanterns(w);
    const n = Math.round(clamp(3 + (w.size.w * w.size.h) / 260_000, 4, 11));
    for (const k of s.koi) placeKoi(w, k, clamp(k.x, 20, w.size.w - 20), clamp(k.y, 20, w.size.h - 20));
    if (s.koi.length < n) s.koi.push(...spawnKoi(w, n - s.koi.length));
    s.koi.length = Math.min(s.koi.length, n);
  },

  click(s, x, y, w) {
    w.effects.ripple({ x, y, at: w.time, life: 1.8, speed: 240, strength: 0.8 });
    for (let i = 0; i < 6; i++) s.food.push({ x: x + (w.rng() - 0.5) * 50, y: y + (w.rng() - 0.5) * 40, at: w.time });
    if (s.food.length > 24) s.food.splice(0, s.food.length - 24);
  },

  step(s, dt, w) {
    const p = w.input.pointer, { w: W, h: H } = w.size;
    s.food = s.food.filter((f) => w.time - f.at < 9);
    for (const k of s.koi) {
      let want = 48, turn = 1.4;
      k.retarget -= dt;
      const food = s.food.length ? s.food.reduce((a, f) => (Math.hypot(f.x - k.x, f.y - k.y) < Math.hypot(a.x - k.x, a.y - k.y) ? f : a)) : null;
      const dp = p.active ? Math.hypot(p.x - k.x, p.y - k.y) : Infinity;
      if (food && Math.hypot(food.x - k.x, food.y - k.y) < 700) {
        k.tx = food.x; k.ty = food.y; want = 120; turn = 3.2;
        if (Math.hypot(food.x - k.x, food.y - k.y) < 16) s.food.splice(s.food.indexOf(food), 1);
      } else if (p.active && p.speed > 420 && dp < 180) {
        k.tx = k.x + (k.x - p.x) * 3; k.ty = k.y + (k.y - p.y) * 3; want = 160; turn = 4;
      } else if (p.active && p.rested > 0.35 && dp < 460) {
        // Curious: circle the resting pointer at a little distance.
        const a = Math.atan2(k.y - p.y, k.x - p.x) + 0.9;
        k.tx = p.x + Math.cos(a) * 90; k.ty = p.y + Math.sin(a) * 90; want = 34; turn = 1.3;
      } else if (k.retarget <= 0 || Math.hypot(k.tx - k.x, k.ty - k.y) < 40) newTarget(w, k);
      // Keep apart from the others.
      let ax = 0, ay = 0;
      for (const o of s.koi) {
        if (o === k) continue;
        const dx = k.x - o.x, dy = k.y - o.y, d = Math.hypot(dx, dy);
        if (d < k.len * 0.6 && d > 0) { ax += (dx / d) * (1 - d / (k.len * 0.6)); ay += (dy / d) * (1 - d / (k.len * 0.6)); }
      }
      const tx = k.tx + ax * 120, ty = k.ty + ay * 120;
      k.heading = turnToward(k.heading, Math.atan2(ty - k.y, tx - k.x), turn * dt);
      k.speed += (want - k.speed) * Math.min(1, dt * 1.5);
      k.phase += dt * (2 + k.speed / 25);
      k.x += Math.cos(k.heading) * k.speed * dt;
      k.y += Math.sin(k.heading) * k.speed * dt;
      // A koi that strays off the pond turns back in.
      const m = 30;
      if (k.x < -m || k.x > W + m || k.y < -m || k.y > H + m) { k.tx = W / 2; k.ty = H / 2; k.retarget = 3; }
      if (Math.hypot(k.x - k.trail[k.ti * 2]!, k.y - k.trail[k.ti * 2 + 1]!) >= TRAIL_STEP) {
        k.ti = (k.ti + TRAIL - 1) % TRAIL;
        k.trail[k.ti * 2] = k.x; k.trail[k.ti * 2 + 1] = k.y;
      }
    }
    for (const pad of s.pads) {
      pad.drift += dt * 0.15;
      pull(pad.b, pad.fx * W, pad.fy * H, p, { temper: "flee", reach: pad.r * 2.2, force: 0.3 }, dt);
    }
    // Lanterns float on a slow current, turn back from the banks, and bob away from a koi below.
    for (const l of s.lanterns) {
      l.phase += dt;
      l.vx += Math.sin(l.phase * 0.21 + l.hue) * 1.2 * dt;
      l.vy += Math.cos(l.phase * 0.17 + l.hue * 2) * 1.2 * dt;
      const m = 90;
      if (l.x < m) l.vx += 6 * dt; if (l.x > W - m) l.vx -= 6 * dt;
      if (l.y < m) l.vy += 6 * dt; if (l.y > H - m) l.vy -= 6 * dt;
      const v = Math.hypot(l.vx, l.vy), cap = 9;
      if (v > cap) { l.vx *= cap / v; l.vy *= cap / v; }
      l.x += l.vx * dt; l.y += l.vy * dt;
    }
  },

  backdrop(_s, g, w) {
    const { w: W, h: H } = w.size, L = palette(w);
    const r = Math.max(W, H) * 0.8;
    const grad = g.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.45, r);
    grad.addColorStop(0, L.deep[0]!); grad.addColorStop(0.6, L.deep[1]!); grad.addColorStop(1, L.deep[2]!);
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    // The bed below the water: rounded stones, soft with depth.
    const stones = Math.round((W * H) / 9000);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < stones; i++) {
      const x = rnd() * W, y = rnd() * H, rx = 10 + rnd() * 26, ry = rx * (0.55 + rnd() * 0.3);
      g.fillStyle = L.stone[i % 2]!;
      g.globalAlpha = 0.35 + rnd() * 0.35;
      g.beginPath(); g.ellipse(x, y, rx, ry, rnd() * TAU, 0, TAU); g.fill();
      g.fillStyle = L.bed;
      g.beginPath(); g.ellipse(x - rx * 0.25, y - ry * 0.3, rx * 0.55, ry * 0.4, 0, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
    // The pond is deeper toward its edges.
    const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, w.look.dark ? "rgba(0,8,10,0.55)" : "rgba(20,80,70,0.18)");
    g.fillStyle = v; g.fillRect(0, 0, W, H);
  },

  picture(s, g, w) {
    const L = palette(w), { w: W, h: H } = w.size, t = w.time;
    for (const pad of s.pads) drawPad(g, pad, pad.fx * W + pad.b.ox + Math.sin(pad.drift) * 6, pad.fy * H + pad.b.oy + Math.cos(pad.drift * 0.8) * 5, L, t);
    for (const f of s.food) {
      const age = (t - f.at) / 9;
      g.globalAlpha = 1 - age;
      g.fillStyle = "#b07a3a";
      g.beginPath(); g.arc(f.x, f.y + age * 6, 5, 0, TAU); g.fill();
      g.globalAlpha = 1;
    }
    for (const k of s.koi) drawKoi(g, k, t);
    if (w.look.dark) for (const l of s.lanterns) drawLantern(g, l, L);
  },

  light(s, g, w) {
    const L = palette(w), { w: W, h: H } = w.size, t = w.time;
    // Dapple: the surface's moving lenses of light, broad and faint.
    for (let i = 0; i < 9; i++) {
      const x = W * (0.5 + 0.45 * Math.sin(t * 0.05 + i * 1.9)), y = H * (0.5 + 0.45 * Math.cos(t * 0.04 + i * 2.7));
      const r = Math.min(W, H) * (0.16 + 0.06 * Math.sin(t * 0.3 + i));
      const k = L.dappleK * (0.6 + 0.4 * Math.sin(t * 0.7 + i * 1.3));
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, L.dapple + k + ")"); gr.addColorStop(1, L.dapple + "0)");
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    if (!w.look.dark) return;
    // The lanterns: warm, flickering a little, reaching a koi's length.
    for (const l of s.lanterns) {
      const f = 0.9 + 0.1 * Math.sin(l.phase * 7.3) * Math.sin(l.phase * 3.1), r = 230 * f;
      const [cr, cg, cb] = L.lanternLight;
      const gr = g.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
      gr.addColorStop(0, `rgba(${cr},${cg},${cb},${0.95 * f})`);
      gr.addColorStop(0.18, `rgba(${cr},${cg},${cb},${0.45 * f})`);
      gr.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      g.fillStyle = gr; g.fillRect(l.x - r, l.y - r, r * 2, r * 2);
    }
  },

  overlay(s, o, w) {
    const L = palette(w), { w: W, h: H } = w.size, t = w.time;
    // Light glancing off the water: a glint swells and goes.
    for (let i = 0; i < 30; i++) {
      const b = (Math.sin(t * 0.9 + i * 2.3) + 1) / 2;
      if (b < 0.75) continue;
      o.dot(W * ((i * 0.618 + 0.05) % 1), H * ((i * 0.381 + 0.07) % 1), 1.1 + (b - 0.75) * 4, L.spark, (b - 0.75) * 2.4, 2.5);
    }
    void s;
  },
});

function drawLantern(g: Paint, l: Lantern, L: (typeof LOOKS)["dark"]): void {
  // A round paper lantern seen from above: a warm disc with its frame's ribs.
  const r = 22;
  g.fillStyle = L.lantern[1]!;
  g.beginPath(); g.arc(l.x, l.y, r, 0, TAU); g.fill();
  g.fillStyle = L.lantern[0]!;
  g.beginPath(); g.arc(l.x, l.y, r * 0.62, 0, TAU); g.fill();
}

function drawPad(g: Paint, pad: Pad, x: number, y: number, L: (typeof LOOKS)["dark"], t: number): void {
  const r = pad.r;
  g.save(); g.translate(x, y); g.rotate(pad.rot + Math.sin(t * 0.1 + pad.drift) * 0.08);
  g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, r, 0.32, TAU - 0.02); g.closePath();
  g.fillStyle = L.pad[pad.flower ? 1 : 0]!; g.fill();
  g.strokeStyle = L.vein; g.lineWidth = r * 0.05;
  for (let v = 1; v < 6; v++) { const a = 0.3 + (v / 6) * (TAU - 0.3); g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85); g.stroke(); }
  if (pad.flower) {
    g.translate(-r * 0.22, r * 0.2);
    const k = r / 80;
    g.fillStyle = pad.flower === 1 ? "#ff8fbf" : "#fff3f8";
    for (let p = 0; p < 8; p++) { g.save(); g.rotate((p * TAU) / 8 + 0.2); g.beginPath(); g.ellipse(26 * k, 0, 26 * k, 11 * k, 0, 0, TAU); g.fill(); g.restore(); }
    g.fillStyle = pad.flower === 1 ? "#ffc4dc" : "#ffd9ea";
    for (let p = 0; p < 6; p++) { g.save(); g.rotate((p * TAU) / 6); g.beginPath(); g.ellipse(15 * k, 0, 15 * k, 8 * k, 0, 0, TAU); g.fill(); g.restore(); }
    g.fillStyle = "#ffd84a"; g.beginPath(); g.arc(0, 0, 8 * k, 0, TAU); g.fill();
  }
  g.restore();
}

/** The spine: `PROFILE.length` points spaced along the path the head took. */
function spine(k: Koi): [number, number][] {
  const pts: [number, number][] = [];
  const step = k.len / (PROFILE.length - 1);
  let want = 0, px = k.x, py = k.y, acc = 0;
  pts.push([px, py]);
  for (let n = 0; n < TRAIL && pts.length < PROFILE.length; n++) {
    const i = (k.ti + n) % TRAIL, x = k.trail[i * 2]!, y = k.trail[i * 2 + 1]!;
    const d = Math.hypot(x - px, y - py);
    want = step * pts.length;
    while (acc + d >= want && pts.length < PROFILE.length) {
      const u = (want - acc) / (d || 1);
      pts.push([px + (x - px) * u, py + (y - py) * u]);
      want = step * pts.length;
    }
    acc += d; px = x; py = y;
  }
  while (pts.length < PROFILE.length) pts.push(pts[pts.length - 1]!);
  return pts;
}

function drawKoi(g: Paint, k: Koi, t: number): void {
  const pts = spine(k), L = k.len;
  const at = (u: number): [number, number, number] => {
    const f = u * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), r = f - i;
    const a = pts[i]!, b = pts[i + 1]!;
    return [a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r, Math.atan2(a[1] - b[1], a[0] - b[0])];
  };
  // Fins under the body: two pectorals behind the head, and the tail's fan, swaying.
  const sway = Math.sin(k.phase) * 0.35;
  const [fx, fy, fa] = at(0.22);
  g.fillStyle = k.pal.fin;
  for (const side of [-1, 1]) { g.beginPath(); g.ellipse(fx + Math.cos(fa + side * 1.9) * L * 0.15, fy + Math.sin(fa + side * 1.9) * L * 0.15, L * 0.13, L * 0.06, fa + side * 2.3 + sway * 0.5, 0, TAU); g.fill(); }
  const [tx, ty, ta] = at(1);
  for (const side of [-1, 1]) { g.beginPath(); g.ellipse(tx - Math.cos(ta + side * 0.5 + sway) * L * 0.12, ty - Math.sin(ta + side * 0.5 + sway) * L * 0.12, L * 0.15, L * 0.065, ta + side * 0.5 + sway, 0, TAU); g.fill(); }
  // The body: discs along the spine, wide behind the head, narrow to the tail.
  g.fillStyle = k.pal.body;
  for (let s = 0; s <= 28; s++) {
    const u = s / 28, [x, y] = at(u);
    const pi = u * (PROFILE.length - 1), i = Math.min(PROFILE.length - 2, Math.floor(pi)), w = PROFILE[i]! + (PROFILE[i + 1]! - PROFILE[i]!) * (pi - i);
    g.beginPath(); g.arc(x, y, (w * L) / 2, 0, TAU); g.fill();
  }
  // Its markings ride the body.
  for (const [u, side, r, colour] of k.pal.patches) {
    const [x, y, a] = at(u);
    g.fillStyle = colour;
    g.beginPath(); g.ellipse(x + Math.cos(a + Math.PI / 2) * side * L, y + Math.sin(a + Math.PI / 2) * side * L, r * L, r * L * 0.7, a, 0, TAU); g.fill();
  }
  void t;
}
