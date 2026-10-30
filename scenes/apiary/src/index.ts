/**
 * Apiary, in isometric 2.5D: a small island of grass terraces in a calm sea, with a cottage, a lamp,
 * trees and three hives. Bees work the flower patches and fly home; the tile under the pointer
 * lifts its light, and a click plants flowers there, so the bees come to it. By night the bees
 * are in, fireflies are out, and the cottage's windows and the lamp light the island from where
 * they stand.
 */
import { clamp, defineScene, hex, isometric, TAU, type Iso, type Paint, type Rgb, type World } from "@hivescape/core";

interface Tile { x: number; y: number; z: number }
interface Thing { kind: "tree" | "hive" | "cottage" | "lamp"; x: number; y: number }
interface Patch { x: number; y: number; hue: number; born: number }
interface Bee { from: number; to: number; t: number; speed: number; wobble: number; home: number }

interface Isle { tiles: Map<string, Tile>; things: Thing[]; patches: Patch[]; bees: Bee[]; hover: Tile | null; t: number }

const N = 11;
const key = (x: number, y: number) => `${x},${y}`;

const LOOKS = {
  dark: {
    sea: ["#08182b", "#0d2741", "#123352"], top: ["#3f7d54", "#4c8f5d", "#5ba068"], sand: "#a99a76", left: "#6b5440", right: "#4f3d2f",
    trunk: "#6a4b33", leaf: ["#2f6e4a", "#3b7f55"], hive: "#d9c79e", roof: "#8a5a3c", lid: "#b9875a", wall: "#cfc2a8", window: "#ffd28a",
    flowers: [hex("#e98ab5"), hex("#f2d06b"), hex("#b9a2f0"), hex("#f4f1ea")], bee: hex("#ffd34d"), fly: hex("#d8ff8a"), star: hex("#fff6dd"),
  },
  light: {
    sea: ["#bfe4f2", "#9fd2e8", "#7dbedb"], top: ["#7fbf6a", "#8ccc74", "#9bd67f"], sand: "#ecd9a6", left: "#b08a62", right: "#8e6c4c",
    trunk: "#86603f", leaf: ["#4f9a52", "#5fae5c"], hive: "#f3e3b8", roof: "#b9714a", lid: "#d98c5f", wall: "#f1e8d6", window: "#7fa7c4",
    flowers: [hex("#e05f97"), hex("#f0b82e"), hex("#8f6fe0"), hex("#ffffff")], bee: hex("#3a2d14"), fly: hex("#fff3b0"), star: hex("#ffffff"),
  },
};
const palette = (w: World) => (w.look.dark ? LOOKS.dark : LOOKS.light);

/** The view: tiles sized so the island fills about half the screen's width. */
export function viewOf(w: World): Iso {
  const tile = clamp(Math.min(w.size.w * 0.74, w.size.h * 1.45) / N, 40, 130);
  return isometric({ tile, origin: { x: w.size.w / 2, y: w.size.h / 2 - (N * tile) / 4 + tile * 0.3 }, rise: tile * 0.42 });
}

function islandFor(w: World): Pick<Isle, "tiles" | "things"> {
  const tiles = new Map<string, Tile>(), c = (N - 1) / 2;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot(x - c, y - c) + (w.rng() - 0.5) * 0.9;
    if (d > c + 0.3) continue;
    // Terraces: a beach ring, a meadow, a hill.
    const z = d > c - 1 ? 0 : d > c - 2.6 ? 0.5 : d > 1.6 ? 1 : 1.5;
    tiles.set(key(x, y), { x, y, z });
  }
  const at = (x: number, y: number) => tiles.has(key(x, y));
  const things: Thing[] = [];
  const want: [Thing["kind"], number, number][] = [["cottage", 4, 4], ["lamp", 6, 5], ["hive", 2, 6], ["hive", 4, 7], ["hive", 6, 8], ["tree", 6, 2], ["tree", 7, 3], ["tree", 3, 2], ["tree", 7, 7], ["tree", 8, 5], ["tree", 2, 3]];
  for (const [kind, x, y] of want) if (at(x, y)) things.push({ kind, x, y });
  return { tiles, things };
}

function patchesFor(w: World, tiles: Map<string, Tile>, things: Thing[]): Patch[] {
  const taken = new Set(things.map((t) => key(t.x, t.y)));
  const free = [...tiles.values()].filter((t) => !taken.has(key(t.x, t.y)) && t.z > 0);
  const out: Patch[] = [];
  for (let i = 0; i < 7 && free.length; i++) { const t = free.splice(Math.floor(w.rng() * free.length), 1)[0]!; out.push({ x: t.x, y: t.y, hue: i % 4, born: -10 }); }
  return out;
}

function beesFor(w: World, s: Pick<Isle, "things" | "patches">): Bee[] {
  const hives = s.things.filter((t) => t.kind === "hive").length;
  return Array.from({ length: 14 }, (_, i) => ({ from: -1, to: Math.floor(w.rng() * Math.max(1, s.patches.length)), t: w.rng(), speed: 0.25 + w.rng() * 0.2, wobble: w.rng() * TAU, home: i % Math.max(1, hives) }));
}

export default defineScene<Isle>({
  id: "apiary",
  name: "Apiary",
  description: "An isometric island apiary: bees work the flowers between their hives; click a tile to plant flowers.",
  // Made for the native style: an illustration's detail is lost in cells this small.
  style: (look) => ({
    kind: "native", relief: 0.65, gloss: 0.45, shadow: look.dark ? [0, 6, 14] : [20, 50, 70], shadowAlpha: look.dark ? 0.55 : 0.2,
    ambient: look.dark ? 0.4 : 1, glow: look.dark ? 0.65 : 0.2, key: look.dark ? [170, 190, 255] : [255, 248, 232],
  }),

  create(w) {
    const isle = islandFor(w), patches = patchesFor(w, isle.tiles, isle.things);
    return { ...isle, patches, bees: beesFor(w, { things: isle.things, patches }), hover: null, t: 0 };
  },
  resize(s) { s.hover = null; },

  click(s, x, y, w) {
    const tile = tileAt(s, viewOf(w), x, y);
    if (!tile) return;
    s.patches.push({ x: tile.x, y: tile.y, hue: Math.floor(w.rng() * 4), born: s.t });
    if (s.patches.length > 16) s.patches.shift();
    // The nearest bees come to the new flowers.
    for (const b of s.bees.slice(0, 5)) { b.from = -1; b.to = s.patches.length - 1; b.t = 0; }
    w.effects.ripple({ x, y, at: w.time, life: 1.2, speed: 220, strength: 0.6 });
  },

  step(s, dt, w) {
    s.t += dt;
    const p = w.input.pointer;
    s.hover = p.active ? tileAt(s, viewOf(w), p.x, p.y) : null;
    for (const b of s.bees) {
      b.t += dt * b.speed;
      b.wobble += dt * 9;
      if (b.t >= 1) {
        // Out to a patch, back to its hive, out again.
        b.t = 0;
        if (b.from === -1) { b.from = b.to; b.to = -1; }
        else { b.from = -1; b.to = Math.floor(w.rng() * Math.max(1, s.patches.length)); }
      }
    }
  },

  backdrop(_s, g, w) {
    const L = palette(w), { w: W, h: H } = w.size;
    const sea = g.createLinearGradient(0, 0, 0, H);
    sea.addColorStop(0, L.sea[0]!); sea.addColorStop(0.5, L.sea[1]!); sea.addColorStop(1, L.sea[2]!);
    g.fillStyle = sea; g.fillRect(0, 0, W, H);
    // Rings of swell round the island, flattened as the view flattens the ground, and its shadow in the water.
    const iso = viewOf(w), c = iso.toScreen(N / 2, N / 2, -0.6), R = N * iso.tile * 0.36;
    const shade = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, R * 1.4);
    shade.addColorStop(0, w.look.dark ? "rgba(0,8,20,0.5)" : "rgba(30,90,120,0.25)"); shade.addColorStop(1, "rgba(0,0,0,0)");
    g.save(); g.translate(c.x, c.y); g.scale(1, 0.5); g.translate(-c.x, -c.y);
    g.fillStyle = shade; g.beginPath(); g.arc(c.x, c.y, R * 1.4, 0, TAU); g.fill();
    g.strokeStyle = w.look.dark ? "rgba(150,200,255,0.08)" : "rgba(255,255,255,0.35)";
    for (let k = 1; k <= 4; k++) { g.lineWidth = 2.2 - k * 0.4; g.beginPath(); g.arc(c.x, c.y, R * (1.05 + k * 0.22), 0, TAU); g.stroke(); }
    g.restore();
  },

  picture(s, g, w) {
    const L = palette(w), iso = viewOf(w);
    const tiles = [...s.tiles.values()].sort((a, b) => iso.depth(a.x, a.y) - iso.depth(b.x, b.y));
    const thingAt = new Map(s.things.map((t) => [key(t.x, t.y), t]));
    const patchesAt = new Map<string, Patch[]>();
    for (const p of s.patches) { const k = key(p.x, p.y); patchesAt.set(k, [...(patchesAt.get(k) ?? []), p]); }
    for (const t of tiles) {
      drawBlock(g, iso, t, L, s.hover === t);
      for (const p of patchesAt.get(key(t.x, t.y)) ?? []) drawPatch(g, iso, t, p, L, s.t);
      const thing = thingAt.get(key(t.x, t.y));
      if (thing) drawThing(g, iso, t, thing, L);
    }
  },

  light(s, g, w) {
    const iso = viewOf(w);
    const glow = (x: number, y: number, r: number, c: Rgb, a: number) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${a})`); gr.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    if (s.hover) { const p = iso.toScreen(s.hover.x + 0.5, s.hover.y + 0.5, s.hover.z + 0.6); glow(p.x, p.y, iso.tile * 1.1, [255, 244, 210], w.look.dark ? 0.55 : 0.35); }
    if (!w.look.dark) {
      // The sun from the upper left: a broad warm wash.
      glow(w.size.w * 0.15, -w.size.h * 0.1, Math.max(w.size.w, w.size.h) * 1.1, [255, 236, 200], 0.18);
      return;
    }
    glow(w.size.w * 0.85, -w.size.h * 0.05, Math.max(w.size.w, w.size.h), [150, 175, 240], 0.22);
    for (const t of s.things) {
      const tile = s.tiles.get(key(t.x, t.y))!;
      if (t.kind === "cottage") { const p = iso.toScreen(t.x + 0.5, t.y + 1, tile.z + 0.7); glow(p.x, p.y, iso.tile * 2.2, [255, 150, 70], 0.42 * (0.94 + 0.06 * Math.sin(s.t * 3.1))); }
      if (t.kind === "lamp") { const p = iso.toScreen(t.x + 0.5, t.y + 0.5, tile.z + 1.6); glow(p.x, p.y, iso.tile * 1.8, [255, 180, 100], 0.5); }
    }
  },

  overlay(s, o, w) {
    const L = palette(w), iso = viewOf(w), { w: W, h: H } = w.size;
    if (w.look.dark) {
      for (let i = 0; i < 60; i++) {
        const b = 0.4 + 0.6 * ((Math.sin(s.t * (0.5 + (i % 4) * 0.2) + i) + 1) / 2);
        o.dot(W * ((i * 0.618) % 1), H * 0.3 * ((i * 0.7548) % 1), 0.8, L.star, b * 0.6, 1.5);
      }
      for (let i = 0; i < 10; i++) {
        const a = s.t * 0.3 + i * 2.1, r = N * 0.35 + Math.sin(a * 1.3) * 1.5;
        const p = iso.toScreen(N / 2 + Math.cos(a) * r, N / 2 + Math.sin(a) * r, 1.2 + Math.sin(a * 2.7) * 0.4);
        const b = Math.max(0, Math.sin(s.t * 2.2 + i * 1.7));
        if (b > 0.05) o.dot(p.x, p.y, 1.5, L.fly, b, 4);
      }
      return;
    }
    const hives = s.things.filter((t) => t.kind === "hive");
    for (const b of s.bees) {
      const hive = hives[b.home] ?? hives[0];
      if (!hive || !s.patches.length) continue;
      const end = (i: number) => {
        if (i === -1) { const t = s.tiles.get(key(hive.x, hive.y))!; return iso.toScreen(hive.x + 0.5, hive.y + 0.5, t.z + 0.9); }
        const p = s.patches[i % s.patches.length]!, t = s.tiles.get(key(p.x, p.y))!;
        return iso.toScreen(p.x + 0.5, p.y + 0.5, t.z + 0.3);
      };
      const a = end(b.from), c = end(b.to), u = b.t, lift = Math.sin(u * Math.PI) * iso.tile * 0.9;
      const x = a.x + (c.x - a.x) * u + Math.sin(b.wobble) * 3, y = a.y + (c.y - a.y) * u - lift + Math.cos(b.wobble * 1.3) * 2;
      o.dot(x, y, 1.6, L.bee, 0.95, 0.6);
    }
  },
});

/** The tile under a screen point: the highest one whose top it falls on. */
function tileAt(s: Isle, iso: Iso, sx: number, sy: number): Tile | null {
  let best: Tile | null = null;
  for (const z of [1.5, 1, 0.5, 0]) {
    const g = iso.toGround(sx, sy, z), t = s.tiles.get(key(Math.floor(g.x), Math.floor(g.y)));
    if (t && t.z === z && (!best || iso.depth(t.x, t.y, t.z) > iso.depth(best.x, best.y, best.z))) best = t;
  }
  return best;
}

function face(g: Paint, pts: { x: number; y: number }[], colour: string): void {
  g.fillStyle = colour;
  g.beginPath(); g.moveTo(pts[0]!.x, pts[0]!.y);
  for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
  g.closePath(); g.fill();
}

function drawBlock(g: Paint, iso: Iso, t: Tile, L: (typeof LOOKS)["dark"], lit: boolean): void {
  const { x, y, z } = t, b = -0.6, s = iso.toScreen;
  face(g, [s(x, y + 1, z), s(x + 1, y + 1, z), s(x + 1, y + 1, b), s(x, y + 1, b)], L.left);
  face(g, [s(x + 1, y, z), s(x + 1, y + 1, z), s(x + 1, y + 1, b), s(x + 1, y, b)], L.right);
  const top = z === 0 ? L.sand : L.top[Math.min(2, Math.round(z * 2) - 1)]!;
  face(g, [s(x, y, z), s(x + 1, y, z), s(x + 1, y + 1, z), s(x, y + 1, z)], lit ? "#f6f0c8" : top);
}

function drawPatch(g: Paint, iso: Iso, t: Tile, p: Patch, L: (typeof LOOKS)["dark"], now: number): void {
  const grow = clamp((now - p.born) / 1.2);
  const [r, gg, b] = L.flowers[p.hue]!;
  g.fillStyle = `rgb(${r},${gg},${b})`;
  for (const [u, v] of SPOTS) {
    const q = iso.toScreen(t.x + u, t.y + v, t.z);
    g.beginPath(); g.arc(q.x, q.y - 3 * grow, iso.tile * 0.05 * grow + 0.5, 0, TAU); g.fill();
  }
}

/** Where a patch's flowers stand on its tile. */
const SPOTS = [[0.25, 0.3], [0.62, 0.22], [0.45, 0.52], [0.78, 0.6], [0.3, 0.76], [0.6, 0.8]] as const;

function drawThing(g: Paint, iso: Iso, t: Tile, th: Thing, L: (typeof LOOKS)["dark"]): void {
  const c = iso.toScreen(t.x + 0.5, t.y + 0.5, t.z), u = iso.tile;
  if (th.kind === "tree") {
    g.fillStyle = L.trunk; g.fillRect(c.x - u * 0.05, c.y - u * 0.45, u * 0.1, u * 0.45);
    g.fillStyle = L.leaf[0]!; g.beginPath(); g.ellipse(c.x, c.y - u * 0.62, u * 0.3, u * 0.32, 0, 0, TAU); g.fill();
    g.fillStyle = L.leaf[1]!; g.beginPath(); g.ellipse(c.x - u * 0.06, c.y - u * 0.72, u * 0.2, u * 0.2, 0, 0, TAU); g.fill();
  } else if (th.kind === "hive") {
    // Three boxes stacked under a lid, each a small block in the same view as the ground.
    const S = iso.toScreen, { x, y, z } = t, a = 0.3, b = 0.7;
    for (let k = 0; k < 3; k++) {
      const z0 = z + k * 0.32, z1 = z0 + 0.3;
      face(g, [S(x + a, y + b, z0), S(x + b, y + b, z0), S(x + b, y + b, z1), S(x + a, y + b, z1)], k % 2 ? L.hive : L.wall);
      face(g, [S(x + b, y + a, z0), S(x + b, y + b, z0), S(x + b, y + b, z1), S(x + b, y + a, z1)], L.roof);
    }
    const top = z + 0.98;
    face(g, [S(x + a - 0.04, y + a - 0.04, top), S(x + b + 0.04, y + a - 0.04, top), S(x + b + 0.04, y + b + 0.04, top), S(x + a - 0.04, y + b + 0.04, top)], L.lid);
  } else if (th.kind === "lamp") {
    g.fillStyle = L.trunk; g.fillRect(c.x - u * 0.03, c.y - u * 0.8, u * 0.06, u * 0.8);
    g.fillStyle = L.window; g.beginPath(); g.arc(c.x, c.y - u * 0.85, u * 0.09, 0, TAU); g.fill();
  } else {
    // A cottage: two walls and a pitched roof, a window on each wall.
    const s = iso.toScreen, { x, y, z } = t, h = z + 1.1, r = z + 1.8;
    face(g, [s(x + 0.1, y + 0.9, z), s(x + 0.9, y + 0.9, z), s(x + 0.9, y + 0.9, h), s(x + 0.1, y + 0.9, h)], L.wall);
    face(g, [s(x + 0.9, y + 0.1, z), s(x + 0.9, y + 0.9, z), s(x + 0.9, y + 0.9, h), s(x + 0.9, y + 0.1, h)], L.hive);
    // The roof's ridge runs along x: its far slope, the gable on the near (+x) end, its near slope.
    face(g, [s(x + 0.1, y + 0.1, h), s(x + 0.9, y + 0.1, h), s(x + 0.9, y + 0.5, r), s(x + 0.1, y + 0.5, r)], L.lid);
    face(g, [s(x + 0.9, y + 0.1, h), s(x + 0.9, y + 0.9, h), s(x + 0.9, y + 0.5, r)], L.hive);
    face(g, [s(x + 0.1, y + 0.9, h), s(x + 0.9, y + 0.9, h), s(x + 0.9, y + 0.5, r), s(x + 0.1, y + 0.5, r)], L.roof);
    face(g, [s(x + 0.35, y + 0.9, z + 0.35), s(x + 0.65, y + 0.9, z + 0.35), s(x + 0.65, y + 0.9, z + 0.75), s(x + 0.35, y + 0.9, z + 0.75)], L.window);
    face(g, [s(x + 0.9, y + 0.35, z + 0.35), s(x + 0.9, y + 0.65, z + 0.35), s(x + 0.9, y + 0.65, z + 0.75), s(x + 0.9, y + 0.35, z + 0.75)], L.window);
  }
}
