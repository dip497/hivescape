/**
 * Garden of the day, seen from the side: beds along the bottom, one plot for each of the person's
 * agents, and the sky above left open for the tiles. It starts bare each day. Every turn an agent
 * finishes well grows a plant in its plot (a seed, a stem, leaves, the flower opening, over a few
 * seconds), its flower by its program: tulip, poppy, sunflower or lavender. By evening the beds are
 * the day's work.
 *
 * Each agent is a garden bird, its species by program too (robin, blue tit, goldfinch, wren):
 * working, it hops about its plot and pecks; ready, it sits on its plot's stake; resting, it sleeps
 * there with its head tucked. When its agent needs the person it flies to that agent's tile, perches
 * on the tile's top edge and sings, ringed in the theme's attention colour; and while it waits, the
 * flowers in its plot wilt, and lift again once it is answered.
 *
 * Butterflies by day and fireflies by night; a resting pointer draws the butterflies, and a click on
 * the soil sows wildflowers there.
 */
import { clamp, defineScene, hash32, hex, mix, TAU, type Agent, type Paint, type Rgb, type Spot, type Tile, type World } from "@hivescape/core";

type Flower = "tulip" | "poppy" | "sunflower" | "lavender" | "daisy";
interface Plant { x: number; born: number; h: number; flower: Flower; hue: number; heads: number; row: number }
interface Plot { x0: number; x1: number; plants: Plant[]; wilt: number }

interface Bird {
  id: string;
  x: number; y: number; vx: number; vy: number;
  /** Facing right (1) or left (-1). */
  face: number;
  tx: number; ty: number;
  phase: "fly" | "hop" | "perch" | "sing" | "sleep";
  timer: number; flap: number; hop: number; peck: number; size: number; kind: number;
}

interface Fly { x: number; y: number; vx: number; vy: number; phase: number; hue: number }
interface Note { x: number; y: number; age: number; drift: number }

interface Garden {
  plots: Plot[]; birds: Bird[]; wild: Plant[]; flies: Fly[]; notes: Note[];
  t: number; day: string; ground: number;
}

const FLOWERS: Flower[] = ["tulip", "poppy", "sunflower", "lavender"];
const flowerOf = (kind: number): Flower => FLOWERS[Math.min(3, Math.floor(kind * 4))]!;

const BIRDS = [
  { name: "robin", back: "#7a5a3c", breast: "#e2733a", head: "#7a5a3c", cap: "#7a5a3c", cheek: null, wing: "#5f4630", tail: "#5f4630", cocked: false },
  { name: "blue tit", back: "#7f9a52", breast: "#f0d24a", head: "#f4f1e6", cap: "#3f7fc8", cheek: "#f4f1e6", wing: "#4a86c9", tail: "#3f6fa8", cocked: false },
  { name: "goldfinch", back: "#b58f5e", breast: "#e9dcc4", head: "#f2efe6", cap: "#1d1d1d", cheek: "#d23a2c", wing: "#1d1d1d", tail: "#1d1d1d", cocked: false },
  { name: "wren", back: "#8a6a48", breast: "#c9a77d", head: "#8a6a48", cap: "#8a6a48", cheek: null, wing: "#6c5136", tail: "#6c5136", cocked: true },
] as const;
const birdOf = (kind: number) => BIRDS[Math.min(3, Math.floor(kind * 4))]!;

const LOOKS = {
  dark: {
    sky: ["#060b1a", "#0f1a35", "#1c2b4a"], hills: ["#13213a", "#172a3d"], trees: "#0e1a26", soil: ["#2a1d14", "#1a120c"], path: "#3a2b1f",
    bedSoil: "#3a2818", board: "#6b4a2e", boardDark: "#4a321e",
    stem: "#3f7a46", leaf: ["#3f8a4e", "#2f6e3e"], grass: "#3c7246", stake: "#7a5a3a", star: hex("#fff6dd"), fly: hex("#d8ff8a"), note: hex("#f4e6c8"),
    petals: { tulip: ["#e2504a", "#f0b53a", "#e98ab5"], poppy: ["#e0402e", "#e86a2a"], sunflower: ["#f1b72a"], lavender: ["#9a7ad6", "#8466c8"], daisy: ["#f2f0e8"] },
  },
  light: {
    sky: ["#6fbbea", "#b4dcf3", "#fdf0d6"], hills: ["#a5cd96", "#8dbd82"], trees: "#6f9e6c", soil: ["#8a6142", "#6e4a31"], path: "#b09070",
    bedSoil: "#5e3f28", board: "#a87b4f", boardDark: "#7d5838",
    stem: "#4f9a50", leaf: ["#5cae58", "#459645"], grass: "#5aa255", stake: "#9b7550", star: hex("#ffffff"), fly: hex("#fff3b0"), note: hex("#5a4a3a"),
    petals: { tulip: ["#e2443e", "#f2b230", "#ea7fb0"], poppy: ["#e23a28", "#ec6326"], sunflower: ["#f4b81e"], lavender: ["#9d7ddb", "#7f5fc6"], daisy: ["#ffffff"] },
  },
};
const palette = (w: World) => (w.look.dark ? LOOKS.dark : LOOKS.light);

/** Where the soil starts: the beds take the bottom of the screen. */
const groundOf = (w: World) => Math.round(w.size.h * 0.86);
/** The most plants a plot holds; past that, a turn adds a head to one already there. */
const PLOT_MAX = 16;

function plotsFor(w: World, n: number, old: Plot[]): Plot[] {
  const { w: W } = w.size;
  // Plots side by side in the middle of the beds; wild ground at either end.
  const span = Math.min(W * 0.86, n * 300), x0 = (W - span) / 2;
  return Array.from({ length: n }, (_, i) => ({ x0: x0 + (span * i) / n + 10, x1: x0 + (span * (i + 1)) / n - 10, plants: old[i]?.plants ?? [], wilt: old[i]?.wilt ?? 0 }));
}

function wildFor(w: World): Plant[] {
  const { w: W } = w.size, out: Plant[] = [];
  for (let i = 0; i < 26; i++) {
    const side = i % 2 ? 1 : 0, x = side ? W - 20 - w.rng() * W * 0.14 : 20 + w.rng() * W * 0.14;
    out.push({ x, born: -10, h: 60 + w.rng() * 70, flower: i % 5 === 0 ? "lavender" : "daisy", hue: w.rng(), heads: 1, row: w.rng() < 0.5 ? 0 : 1 });
  }
  return out;
}

function fliesFor(w: World): Fly[] {
  return Array.from({ length: 4 }, (_, i) => ({ x: w.rng() * w.size.w, y: groundOf(w) - 80 - w.rng() * 160, vx: 0, vy: 0, phase: w.rng() * TAU, hue: i / 4 }));
}

const dayOf = () => new Date().toDateString();

/** A stake at the left end of each plot: where its bird perches and sleeps. */
const stakeOf = (p: Plot, ground: number) => ({ x: p.x0 + 6, y: ground - 70 });

const underTile = (tiles: readonly Tile[], x: number, y: number, pad = 10) => tiles.some((t) => x > t.x0 - pad && x < t.x1 + pad && y > t.y0 - pad && y < t.y1 + pad);

/** Where a bird whose agent needs the person perches: on its tile's top edge, near the end with more
 *  sky above; under a tile at the very top, beside it instead. */
function perchOn(t: Tile, w: World): [number, number] {
  const x = t.x1 - Math.min(60, (t.x1 - t.x0) * 0.2), y = t.y0 - 2;
  if (y > 60 && !underTile(w.tiles.filter((o) => o !== t), x, y - 20, 0)) return [x, y];
  return [Math.min(w.size.w - 40, t.x1 + 50), Math.max(60, t.y0 + 40)];
}

function settle(s: Garden, w: World): void {
  const byId = new Map(s.birds.map((b) => [b.id, b]));
  s.plots = plotsFor(w, w.agents.length, s.plots);
  s.birds = w.agents.map((a, i) => {
    const old = byId.get(a.id);
    if (old) { old.kind = a.kind; return old; }
    const st = stakeOf(s.plots[i]!, s.ground);
    return { id: a.id, x: st.x, y: st.y, vx: 0, vy: 0, face: 1, tx: st.x, ty: st.y, phase: "perch", timer: w.rng() * 2, flap: 0, hop: 0, peck: 0, size: 0.85 + (a.size - 0.78) * 0.7, kind: a.kind };
  });
  // A new plot starts with a seedling, so each agent's flower can be seen from the first turn.
  s.plots.forEach((p, i) => { if (!p.plants.length) sow(p, w.agents[i]!, s.t - 2.5, w); });
}

function sow(p: Plot, a: Agent, at: number, w: World): void {
  const n = p.plants.length;
  if (n >= PLOT_MAX) {
    const pl = p.plants[hash32(n, Math.floor(at * 10), 3) % n]!;
    pl.heads = Math.min(3, pl.heads + 1);
    return;
  }
  // Fill the plot from the back row to the front, spread out and a little jittered.
  const row = n < PLOT_MAX / 2 ? 1 : 0, k = row ? n : n - PLOT_MAX / 2, slots = PLOT_MAX / 2;
  const x = p.x0 + 24 + ((k + 0.5) / slots) * (p.x1 - p.x0 - 30) + ((hash32(n, 7, 1) % 13) - 6);
  const base = flowerOf(a.kind) === "sunflower" ? 175 : flowerOf(a.kind) === "lavender" ? 110 : 125;
  p.plants.push({ x, born: at, h: (base + (hash32(n, 9, 2) % 40)) * (row ? 1.1 : 0.82), flower: flowerOf(a.kind), hue: (hash32(n, 3, 3) % 100) / 100, heads: 1, row });
  void w;
}

export default defineScene<Garden>({
  id: "garden",
  name: "Garden of the day",
  description: "Every turn an agent finishes grows a flower in its plot; its bird perches on its tile and sings when it needs you.",
  // Made for the native style: stems, petals and birds are illustration, finer than cells.
  style: (look) => ({
    kind: "native", ambient: look.dark ? 0.62 : 1, glow: look.dark ? 0.6 : 0.2, key: look.dark ? [190, 205, 255] : [255, 246, 228],
  }),

  create(w) {
    const s: Garden = { plots: [], birds: [], wild: wildFor(w), flies: fliesFor(w), notes: [], t: 0, day: dayOf(), ground: groundOf(w) };
    settle(s, w);
    return s;
  },

  resize(s, w) {
    s.ground = groundOf(w); s.wild = wildFor(w); s.flies = fliesFor(w);
    s.plots = plotsFor(w, w.agents.length, []);
    s.birds = [];
    settle(s, w);
  },

  done(s, id, w) {
    const i = w.agents.findIndex((a) => a.id === id), p = s.plots[i], b = s.birds[i];
    if (!p || !b) return;
    sow(p, w.agents[i]!, s.t, w);
    // The bird goes to the new plant and sings once.
    const pl = p.plants[p.plants.length - 1]!;
    if (b.phase !== "sing") { b.tx = pl.x - 20; b.ty = s.ground - 4; b.phase = "hop"; b.timer = 3; }
    s.notes.push({ x: b.x, y: b.y - 20, age: 0, drift: 0.5 });
  },

  click(s, x, y, w) {
    w.effects.ripple({ x, y, at: w.time, life: 1.2, speed: 220, strength: 0.5 });
    if (y < s.ground - 10) return;
    // Wildflowers where the click fell on the soil, a few at most, the oldest giving way.
    for (let k = 0; k < 3; k++) s.wild.push({ x: x + (k - 1) * 14, born: s.t + k * 0.2, h: 34 + w.rng() * 30, flower: "daisy", hue: w.rng(), heads: 1, row: 0 });
    if (s.wild.length > 60) s.wild.splice(26, s.wild.length - 60);
  },

  step(s, dt, w) {
    s.t += dt;
    // A new day, a bare garden.
    if (Math.floor(s.t) !== Math.floor(s.t - dt) && Math.floor(s.t) % 60 === 0) {
      const d = dayOf();
      if (d !== s.day) { s.day = d; for (const p of s.plots) p.plants.length = 0; }
    }
    if (s.birds.length !== w.agents.length || s.birds.some((b, i) => b.id !== w.agents[i]!.id)) settle(s, w);
    const p = w.input.pointer;
    s.birds.forEach((b, i) => {
      const a = w.agents[i]!, plot = s.plots[i]!, stake = stakeOf(plot, s.ground);
      // A plot wilts while its agent waits on the person, a little each second, and lifts quickly after.
      plot.wilt = clamp(plot.wilt + (a.state === "needs-you" ? dt / 40 : -dt / 3));
      b.timer -= dt;
      if (a.state === "needs-you") {
        const tile = w.tiles.find((t) => t.id === a.id);
        const [px, py] = tile ? perchOn(tile, w) : [stake.x, stake.y];
        b.tx = px; b.ty = py;
        b.phase = Math.hypot(px - b.x, py - b.y) < 4 ? "sing" : "fly";
        if (b.phase === "sing" && b.timer <= 0) { s.notes.push({ x: b.x + b.face * 10, y: b.y - 22, age: 0, drift: (hash32(Math.floor(s.t * 10), i) % 100) / 100 }); b.timer = 0.7; }
      } else if (a.state === "resting" || a.state === "ready") {
        b.tx = stake.x; b.ty = stake.y;
        const there = Math.hypot(stake.x - b.x, stake.y - b.y) < 4;
        b.phase = there ? (a.state === "resting" ? "sleep" : "perch") : "fly";
        if (a.state === "resting" && there && b.timer <= 0) { s.notes.push({ x: b.x + 8, y: b.y - 18, age: 0, drift: -1 }); b.timer = 2.2; }
      } else {
        // Working: hop about the plot, peck, now and then fly up to the stake and back down.
        if (b.phase === "sing" || b.phase === "sleep" || b.phase === "perch") { b.phase = "fly"; b.tx = plot.x0 + 30 + w.rng() * (plot.x1 - plot.x0 - 40); b.ty = s.ground - 2; }
        if (b.timer <= 0 && b.phase !== "fly") {
          b.phase = "hop";
          let x = b.x;
          for (let k = 0; k < 6; k++) { x = clamp(b.x + (w.rng() - 0.5) * 120, plot.x0 + 20, plot.x1 - 10); if (!underTile(w.tiles, x, s.ground - 10)) break; }
          b.tx = x; b.ty = s.ground - 2; b.timer = 1.2 + w.rng() * 1.8; b.peck = 0.8;
        }
        if (b.phase === "fly" && Math.hypot(b.tx - b.x, b.ty - b.y) < 4) b.phase = "hop";
      }
      move(b, dt, w);
    });
    // Butterflies: from flower to flower, to a resting pointer, off from a fast one.
    const flowers = [...s.plots.flatMap((pl) => pl.plants), ...s.wild];
    s.flies.forEach((f, i) => {
      f.phase += dt * 9;
      let tx: number, ty: number;
      if (p.active && p.rested > 0.6 && Math.hypot(p.x - f.x, p.y - f.y) < 380) { const a = s.t * 0.9 + i * 1.6; tx = p.x + Math.cos(a) * 50; ty = p.y + Math.sin(a) * 30; }
      else { const fl = flowers[(hash32(i, Math.floor(s.t / 5 + i), 4) % Math.max(1, flowers.length))]; tx = fl ? fl.x : w.size.w / 2; ty = fl ? s.ground - fl.h * 1.1 - 20 : s.ground - 120; }
      if (p.active && p.speed > 520 && Math.hypot(p.x - f.x, p.y - f.y) < 140) { tx = f.x + (f.x - p.x) * 3; ty = f.y + (f.y - p.y) * 3; }
      const k = Math.min(1, dt * 0.8);
      f.vx += ((tx - f.x) * 0.9 - f.vx) * k + Math.sin(f.phase * 0.31) * 40 * dt;
      f.vy += ((ty - f.y) * 0.9 - f.vy) * k + Math.cos(f.phase * 0.27) * 50 * dt;
      const v = Math.hypot(f.vx, f.vy); if (v > 90) { f.vx *= 90 / v; f.vy *= 90 / v; }
      f.x += f.vx * dt; f.y += f.vy * dt;
    });
    for (const n of s.notes) { n.age += dt; n.y -= dt * 22; n.x += Math.sin(n.age * 3 + n.drift * 6) * dt * 10; }
    s.notes = s.notes.filter((n) => n.age < 2.4);
    if (s.notes.length > 40) s.notes.splice(0, s.notes.length - 40);
  },

  backdrop(s, g, w) {
    const L = palette(w), { w: W, h: H } = w.size, G = s.ground;
    const sky = g.createLinearGradient(0, 0, 0, G);
    sky.addColorStop(0, L.sky[0]!); sky.addColorStop(0.65, L.sky[1]!); sky.addColorStop(1, L.sky[2]!);
    g.fillStyle = sky; g.fillRect(0, 0, W, G + 2);
    if (w.look.dark) {
      // The moon, high on the right.
      const mx = W * 0.82, my = H * 0.16, mr = Math.min(W, H) * 0.035;
      const halo = g.createRadialGradient(mx, my, mr, mx, my, mr * 6);
      halo.addColorStop(0, "rgba(240,232,200,0.16)"); halo.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = halo; g.fillRect(mx - mr * 6, my - mr * 6, mr * 12, mr * 12);
      g.fillStyle = "#f1e8c8"; g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();
    } else {
      const sx = W * 0.12, sy = H * 0.1, sr = Math.min(W, H) * 0.3;
      const sun = g.createRadialGradient(sx, sy, 0, sx, sy, sr);
      sun.addColorStop(0, "rgba(255,248,220,0.85)"); sun.addColorStop(0.2, "rgba(255,240,200,0.35)"); sun.addColorStop(1, "rgba(255,240,200,0)");
      g.fillStyle = sun; g.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    }
    // Two rolling hills and a line of trees behind the garden wall.
    for (let r = 0; r < 2; r++) {
      g.fillStyle = L.hills[r]!;
      g.beginPath(); g.moveTo(0, G);
      for (let x = 0; x <= W; x += 20) g.lineTo(x, G - H * (0.16 - r * 0.06) - Math.sin(x * 0.0035 + r * 2.1) * H * 0.04 - Math.sin(x * 0.009 + r) * H * 0.015);
      g.lineTo(W, G); g.closePath(); g.fill();
    }
    g.fillStyle = L.trees;
    for (let x = -10; x < W + 20; x += 26) {
      const h = 18 + (hash32(x, 1, 1) % 20);
      g.beginPath(); g.ellipse(x, G - 6, 16, h, 0, Math.PI, TAU); g.fill();
    }
    // The beds: soil, darker toward the viewer, and a path of flat stones between the plots.
    const soil = g.createLinearGradient(0, G, 0, H);
    soil.addColorStop(0, L.soil[0]!); soil.addColorStop(1, L.soil[1]!);
    g.fillStyle = soil; g.fillRect(0, G, W, H - G);
    g.fillStyle = L.path;
    for (let x = 8; x < W; x += 34) { g.beginPath(); g.ellipse(x, H - 18 - (hash32(x, 2, 2) % 6), 13, 5, 0, 0, TAU); g.fill(); }
  },

  picture(s, g, w) {
    const L = palette(w), G = s.ground, t = s.t;
    // Grass along the edge of the beds: thin blades, so in ascii they are | / \ characters.
    g.strokeStyle = L.grass; g.lineWidth = 2; g.lineCap = "round";
    for (let x = 4; x < w.size.w; x += 9) {
      const h = 10 + (hash32(x, 5, 5) % 12), sway = Math.sin(t * 1.3 + x * 0.05) * 3;
      g.beginPath(); g.moveTo(x, G + 2); g.quadraticCurveTo(x + sway * 0.5, G - h * 0.5, x + sway, G - h); g.stroke();
    }
    for (const p of s.wild) drawPlant(g, p, G, t, 0, L);
    s.plots.forEach((plot, i) => {
      const st = stakeOf(plot, G);
      // A raised bed: dark soil heaped in a wooden frame, its stake at the left with the agent's tag.
      g.fillStyle = L.bedSoil; g.beginPath(); g.ellipse((plot.x0 + plot.x1) / 2, G - 2, (plot.x1 - plot.x0) / 2, 9, 0, Math.PI, TAU); g.fill();
      for (const p of plot.plants) if (p.row === 1) drawPlant(g, p, G - 4, t, plot.wilt, L);
      for (const p of plot.plants) if (p.row === 0) drawPlant(g, p, G + 6, t, plot.wilt, L);
      g.fillStyle = L.board; g.fillRect(plot.x0, G, plot.x1 - plot.x0, 18);
      g.fillStyle = L.boardDark; g.fillRect(plot.x0, G + 14, plot.x1 - plot.x0, 4);
      g.fillStyle = L.stake; g.fillRect(st.x - 3, st.y + 4, 6, G + 18 - st.y);
      const sp = birdOf(s.birds[i]?.kind ?? 0);
      g.fillStyle = sp.breast; g.fillRect(st.x - 9, st.y + 8, 18, 12);
    });
    // In ascii the birds are characters too, drawn larger.
    if (w.style.kind === "ascii") s.birds.forEach((b) => drawBird(g, b, 1.5, false, t));
  },

  light(s, g, w) {
    const { w: W, h: H } = w.size;
    const blob = (x: number, y: number, r: number, c: Rgb, a: number) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${a})`); gr.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    if (w.look.dark) {
      blob(W * 0.82, H * 0.16, Math.max(W, H) * 0.8, [150, 170, 230], 0.16);
      s.flies.forEach((f, i) => { const b = Math.max(0, Math.sin(s.t * 1.7 + i * 2)); if (b > 0.2) blob(f.x, f.y, 46, [200, 255, 120], 0.5 * b); });
    } else blob(W * 0.12, H * 0.1, Math.max(W, H) * 0.7, [255, 236, 190], 0.12);
    s.birds.forEach((b, i) => {
      if (w.agents[i]?.state !== "needs-you") return;
      blob(b.x, b.y - 10, 130, w.look.accent, (w.look.dark ? 0.7 : 0.5) * (0.6 + 0.4 * Math.sin(s.t * 4)));
    });
  },

  overlay(s, o, w) {
    const L = palette(w), { w: W, h: H } = w.size;
    if (w.look.dark) {
      for (let i = 0; i < 70; i++) o.dot(W * ((i * 0.6180339) % 1), H * 0.55 * ((i * 0.7548776) % 1), i % 9 ? 0.8 : 1.3, L.star, 0.4 + 0.5 * ((Math.sin(s.t * (0.5 + (i % 4) * 0.2) + i) + 1) / 2), 1.5);
      s.flies.forEach((f, i) => { const b = Math.max(0, Math.sin(s.t * 1.7 + i * 2)); if (b > 0.05) o.dot(f.x, f.y, 1.6, L.fly, b, 4); });
    } else {
      // Pollen drifting in the sun.
      for (let i = 0; i < 24; i++) {
        const x = (W * ((i * 0.618) % 1) + s.t * (6 + (i % 5))) % W, y = H * (0.25 + 0.5 * ((i * 0.381) % 1)) + Math.sin(s.t * 0.7 + i) * 8;
        o.dot(x, y, 1, hex("#fff6c8"), 0.35 + 0.25 * Math.sin(s.t + i), 2);
      }
    }
  },

  front(s, g, w) {
    if (w.style.kind !== "ascii") s.birds.forEach((b, i) => drawBird(g, b, 1, true, s.t, w.agents[i]?.state === "needs-you" ? w.look.accent : null));
    if (!w.look.dark) s.flies.forEach((f) => drawButterfly(g, f, w.style.kind === "ascii" ? 1.3 : 1));
    // Song and sleep: notes rising from a bird that sings, z from one asleep.
    const L = palette(w);
    g.textAlign = "center"; g.textBaseline = "middle";
    for (const n of s.notes) {
      const a = clamp(1.4 - n.age * 0.6);
      g.fillStyle = `rgba(${L.note[0]},${L.note[1]},${L.note[2]},${a})`;
      g.font = n.drift < 0 ? "600 11px ui-monospace, monospace" : "600 15px system-ui, sans-serif";
      g.fillText(n.drift < 0 ? "z" : n.drift > 0.5 ? "♪" : "♫", n.x, n.y);
    }
  },

  spots(s) { return s.birds.map((b): Spot => ({ id: b.id, x: b.x, y: b.y - 8 * b.size, r: 30 * b.size })); },
});

/** Fly to the target in an easy arc, or hop along the ground; land facing the way it went. */
function move(b: Bird, dt: number, w: World): void {
  const dx = b.tx - b.x, dy = b.ty - b.y, d = Math.hypot(dx, dy);
  if (b.phase === "hop") {
    // Hops: short arcs along the ground, a peck between.
    b.peck = Math.max(0, b.peck - dt);
    if (d > 2) {
      b.hop += dt * 5;
      const step = Math.min(d, 70 * dt);
      b.x += (dx / d) * step; b.y = b.ty - Math.abs(Math.sin(b.hop * Math.PI)) * 8;
      if (Math.abs(dx) > 1) b.face = dx > 0 ? 1 : -1;
    } else b.y = b.ty;
    return;
  }
  if (b.phase === "fly") {
    b.flap += dt * 22;
    const urgent = w.agents.find((a) => a.id === b.id)?.state === "needs-you";
    const speed = urgent ? 320 : 190, want = Math.min(speed, d * 2.4);
    const lift = d > 60 ? -Math.min(80, d * 0.3) : 0;
    const k = Math.min(1, dt * 3);
    b.vx += ((d > 0 ? (dx / d) * want : 0) - b.vx) * k;
    b.vy += ((d > 0 ? (dy / d) * want : 0) + lift - b.vy) * k;
    // Round the tiles on the way, looking a little ahead.
    const ax = b.x + b.vx * 0.4, ay = b.y + b.vy * 0.4;
    for (const t of w.tiles) {
      if (b.tx > t.x0 - 2 && b.tx < t.x1 + 2 && b.ty > t.y0 - 6 && b.ty < t.y1) continue;
      if (ax > t.x0 - 14 && ax < t.x1 + 14 && ay > t.y0 - 14 && ay < t.y1 + 14) {
        const e = [ax - t.x0, t.x1 - ax, ay - t.y0, t.y1 - ay], m = Math.min(...e), f = 900 * dt;
        if (m === e[0]) b.vx -= f; else if (m === e[1]) b.vx += f; else if (m === e[2]) b.vy -= f; else b.vy += f;
      }
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (Math.abs(b.vx) > 8) b.face = b.vx > 0 ? 1 : -1;
    if (d < 6) { b.x = b.tx; b.y = b.ty; b.vx = b.vy = 0; }
    return;
  }
  b.vx = b.vy = 0;
}

/** A plant from the soil: a stem that sways, leaves, and its flower opening as it grows. `wilt`
 *  bends it over and fades its colour. */
function drawPlant(g: Paint, p: Plant, ground: number, t: number, wilt: number, L: (typeof LOOKS)["dark"]): void {
  const grow = clamp((t - p.born) / 3.2), ease = grow * grow * (3 - 2 * grow);
  if (ease <= 0) return;
  const h = p.h * ease, sway = Math.sin(t * 1.1 + p.x * 0.03) * h * 0.04, droop = wilt * h * 0.55;
  const tipX = p.x + sway + droop, tipY = ground - h + wilt * h * 0.22;
  g.strokeStyle = L.stem; g.lineWidth = p.flower === "sunflower" ? 4 : 2.8; g.lineCap = "round";
  g.beginPath(); g.moveTo(p.x, ground); g.quadraticCurveTo(p.x + sway * 0.3, ground - h * 0.6, tipX, tipY); g.stroke();
  // Leaves unfurl after the stem is up.
  if (grow > 0.3) {
    const lk = clamp((grow - 0.3) / 0.3);
    g.fillStyle = L.leaf[p.hue > 0.5 ? 1 : 0]!;
    for (const [at, side] of [[0.3, -1], [0.5, 1], ...(p.flower === "sunflower" ? [[0.68, -1]] : [])] as const) {
      const lx = p.x + (tipX - p.x) * at, ly = ground - (ground - tipY) * at;
      g.save(); g.translate(lx, ly); g.rotate(side * (0.9 - wilt * 0.6) + Math.PI / 2 * (side < 0 ? 0 : 0));
      g.beginPath(); g.ellipse(side * 14 * lk, 0, 16 * lk, 5.5 * lk, side * 0.35, 0, TAU); g.fill();
      g.restore();
    }
  }
  if (grow < 0.62) return;
  const open = clamp((grow - 0.62) / 0.38);
  const petals = (L.petals as Record<Flower, readonly string[]>)[p.flower];
  let colour = petals[Math.floor(p.hue * petals.length) % petals.length]!;
  if (wilt > 0.05) { const c = mix(hex(colour), hex("#8a6a4a"), wilt * 0.6); colour = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; }
  g.save(); g.translate(tipX, tipY); g.rotate(wilt * 1.3);
  for (let k = 0; k < p.heads; k++) {
    const ox = k === 0 ? 0 : (k === 1 ? -24 : 24), oy = k === 0 ? 0 : 20;
    drawHead(g, p.flower, ox, oy, open * (k === 0 ? 1 : 0.75), colour);
  }
  g.restore();
}

function drawHead(g: Paint, f: Flower, x: number, y: number, s: number, colour: string): void {
  g.save(); g.translate(x, y); g.scale(s * 1.7, s * 1.7);
  if (f === "tulip") {
    g.fillStyle = colour;
    g.beginPath(); g.ellipse(0, -8, 8, 11, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(-6, -7, 5, 10, -0.35, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(6, -7, 5, 10, 0.35, 0, TAU); g.fill();
  } else if (f === "poppy") {
    g.fillStyle = colour;
    for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; g.beginPath(); g.arc(Math.cos(a) * 7, -6 + Math.sin(a) * 5, 8, 0, TAU); g.fill(); }
    g.fillStyle = "#2a1a14"; g.beginPath(); g.arc(0, -6, 4, 0, TAU); g.fill();
  } else if (f === "sunflower") {
    g.fillStyle = colour;
    for (let k = 0; k < 14; k++) { const a = (k / 14) * TAU; g.save(); g.rotate(a); g.beginPath(); g.ellipse(0, -15, 4.4, 9, 0, 0, TAU); g.fill(); g.restore(); }
    g.fillStyle = "#5a3a1c"; g.beginPath(); g.arc(0, 0, 9, 0, TAU); g.fill();
  } else if (f === "lavender") {
    g.fillStyle = colour;
    for (let k = 0; k < 7; k++) { g.beginPath(); g.ellipse((k % 2 ? 2.5 : -2.5), -k * 5, 3.2, 3.8, 0, 0, TAU); g.fill(); }
  } else {
    g.fillStyle = colour;
    for (let k = 0; k < 9; k++) { const a = (k / 9) * TAU; g.save(); g.rotate(a); g.beginPath(); g.ellipse(0, -6, 2.4, 5.2, 0, 0, TAU); g.fill(); g.restore(); }
    g.fillStyle = "#f2c230"; g.beginPath(); g.arc(0, 0, 3, 0, TAU); g.fill();
  }
  g.restore();
}

/** A garden bird from the side: tail, body and breast, wing (beating in the air, folded at rest),
 *  head with cap, cheek, eye and beak, and legs when it stands. Asleep, its head is tucked in. */
function drawBird(g: Paint, b: Bird, scale: number, crisp: boolean, t: number, call: Rgb | null = null): void {
  const sp = birdOf(b.kind), L = 46 * b.size * scale, flying = b.phase === "fly", asleep = b.phase === "sleep";
  if (call && crisp) {
    const k = 0.5 + 0.5 * Math.sin(t * 4.2);
    g.strokeStyle = `rgba(${call[0]},${call[1]},${call[2]},${0.3 + 0.4 * k})`; g.lineWidth = 2.5;
    g.beginPath(); g.arc(b.x, b.y - L * 0.25, L * (0.75 + 0.1 * k), 0, TAU); g.stroke();
  }
  if (crisp && !flying) {
    g.fillStyle = "rgba(20,12,4,0.25)"; g.beginPath(); g.ellipse(b.x, b.y + 2, L * 0.3, L * 0.06, 0, 0, TAU); g.fill();
  }
  const bob = b.phase === "hop" && b.peck > 0.4 ? Math.sin(b.peck * 20) * 0.25 : 0;
  g.save(); g.translate(b.x, b.y - L * 0.32); g.scale(b.face, 1);
  if (!flying) {
    g.strokeStyle = "#5a4636"; g.lineWidth = Math.max(1.2, L * 0.03);
    for (const lx of [-L * 0.06, L * 0.06]) { g.beginPath(); g.moveTo(lx, L * 0.14); g.lineTo(lx + L * 0.02, L * 0.32); g.stroke(); }
  }
  // Tail, cocked up for a wren.
  g.fillStyle = sp.tail;
  g.beginPath(); g.moveTo(-L * 0.24, -L * 0.02); g.lineTo(-L * 0.56, sp.cocked ? -L * 0.32 : -L * 0.08); g.lineTo(-L * 0.52, sp.cocked ? -L * 0.2 : L * 0.04); g.closePath(); g.fill();
  // Body and breast.
  g.fillStyle = sp.back; g.beginPath(); g.ellipse(0, 0, L * 0.32, L * 0.21, -0.12, 0, TAU); g.fill();
  g.fillStyle = sp.breast; g.beginPath(); g.ellipse(L * 0.08, L * 0.06, L * 0.2, L * 0.15, -0.3, 0, TAU); g.fill();
  if (crisp) {
    const gl = g.createLinearGradient(0, -L * 0.2, 0, L * 0.2);
    gl.addColorStop(0, "rgba(255,255,255,0.18)"); gl.addColorStop(1, "rgba(0,0,0,0.18)");
    g.fillStyle = gl; g.beginPath(); g.ellipse(0, 0, L * 0.32, L * 0.21, -0.12, 0, TAU); g.fill();
  }
  // Head: forward, or tucked into the back when asleep.
  const hx = asleep ? L * 0.1 : L * 0.27, hy = asleep ? -L * 0.12 : -L * 0.16 + bob * L * 0.3;
  g.save(); g.translate(hx, hy); g.rotate(bob);
  g.fillStyle = sp.head; g.beginPath(); g.arc(0, 0, L * 0.15, 0, TAU); g.fill();
  g.fillStyle = sp.cap; g.beginPath(); g.arc(0, -L * 0.02, L * 0.15, Math.PI * 1.05, Math.PI * 1.95); g.fill();
  if (sp.cheek) { g.fillStyle = sp.cheek; g.beginPath(); g.arc(L * 0.04, L * 0.03, L * 0.07, 0, TAU); g.fill(); }
  if (!asleep) {
    g.fillStyle = "#e6b35a"; g.beginPath(); g.moveTo(L * 0.12, -L * 0.02); g.lineTo(L * 0.27, L * 0.01); g.lineTo(L * 0.12, L * 0.04); g.closePath(); g.fill();
    g.fillStyle = "#141414"; g.beginPath(); g.arc(L * 0.05, -L * 0.04, L * 0.028, 0, TAU); g.fill();
    if (crisp) { g.fillStyle = "rgba(255,255,255,0.8)"; g.beginPath(); g.arc(L * 0.058, -L * 0.05, L * 0.009, 0, TAU); g.fill(); }
  } else { g.strokeStyle = "#141414"; g.lineWidth = 1.2; g.beginPath(); g.arc(L * 0.04, -L * 0.03, L * 0.03, 0.2, Math.PI - 0.2); g.stroke(); }
  g.restore();
  // Wing: beating in flight, folded along the back otherwise.
  g.fillStyle = sp.wing;
  g.save(); g.translate(-L * 0.02, -L * 0.04);
  if (flying) {
    const a = Math.sin(b.flap) * 0.9 - 0.3;
    g.rotate(a); g.beginPath(); g.ellipse(-L * 0.04, -L * 0.18, L * 0.12, L * 0.28, 0.4, 0, TAU); g.fill();
  } else { g.rotate(-0.2); g.beginPath(); g.ellipse(-L * 0.06, 0, L * 0.22, L * 0.1, 0, 0, TAU); g.fill(); }
  g.restore();
  g.restore();
}

/** A butterfly, its wings opening and closing as it flies. */
function drawButterfly(g: Paint, f: Fly, scale: number): void {
  const open = Math.abs(Math.sin(f.phase)) * 0.85 + 0.15, s = 9 * scale;
  const hues = ["#f29a3a", "#7fb2e8", "#f2d24a", "#e88ab5"], c = hues[Math.floor(f.hue * 4) % 4]!;
  g.save(); g.translate(f.x, f.y);
  g.fillStyle = c;
  for (const side of [-1, 1]) {
    g.beginPath(); g.ellipse(side * s * 0.7 * open, -s * 0.3, s * 0.75 * open, s * 0.7, side * 0.3, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(side * s * 0.5 * open, s * 0.45, s * 0.5 * open, s * 0.45, -side * 0.3, 0, TAU); g.fill();
  }
  g.fillStyle = "#2a2018"; g.fillRect(-1, -s * 0.6, 2, s * 1.3);
  g.restore();
}
