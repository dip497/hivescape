/**
 * Apiary, in blocks: a small island built of cubes in a calm sea, a voxel world seen from above at
 * an angle. Grass blocks over dirt, a sand beach, trees of logs and leaves, a plank cottage under a
 * stepped roof, a lantern post and three hive boxes. Bees work the flower patches and fly home; the
 * block under the pointer is picked out, and a click plants flowers on it, so the bees come to it.
 * By night the bees are in, fireflies are out, and the cottage's windows and the lantern light the
 * island from where they stand.
 *
 * Every block face is a 4 x 4 grid of flat pixels in its material's shades, lit flat from above
 * (top full, one side a little darker, the other darker still), as blocks are. The island is
 * built once a size and look into an image of its own; a frame draws that image, then what moves.
 */
import { clamp, defineScene, hex, isometric, TAU, type Iso, type Paint, type Rgb, type World } from "@hivescape/core";

interface Tile { x: number; y: number; z: number }
interface Thing { kind: "tree" | "hive" | "cottage" | "lamp"; x: number; y: number }
interface Patch { x: number; y: number; hue: number; born: number }
interface Bee { from: number; to: number; t: number; speed: number; wobble: number; home: number }

/** What a block is made of. */
type Block = "grass" | "dirt" | "sand" | "log" | "leaf" | "plank" | "roof" | "glass" | "door" | "hive" | "lid" | "lantern" | "post";

interface Isle {
  /** The top of each ground column, by `x,y`: where flowers grow and what the pointer picks. */
  tiles: Map<string, Tile>;
  things: Thing[];
  patches: Patch[];
  bees: Bee[];
  hover: Tile | null;
  t: number;
  /** Every block of the island and what stands on it, by `x,y,z`. */
  blocks: Map<string, Block>;
  /** The island drawn once for a size and look, and what it was drawn for. */
  image: OffscreenCanvas | null;
  imageFor: string;
}

/** The island's grid, in blocks each way. */
const N = 20;
/** The sea's surface, in block heights: a little below the beach's top. */
const SEA = 0.8;
const key = (x: number, y: number) => `${x},${y}`;
const vkey = (x: number, y: number, z: number) => `${x},${y},${z}`;

const LOOKS = {
  dark: {
    sea: ["#071a2e", "#0b2742", "#10345a"], water: "#1c4f7c", foam: "#5d8fb8",
    grass: "#4c8a4a", dirt: "#6b4a30", sand: "#b8a57a", log: "#5e4128", logTop: "#9a7a52", leaf: "#2f6b36",
    plank: "#a77c4f", roof: "#8e3f2c", glass: "#ffd27a", door: "#4a3020", hive: "#e6dcc0", lid: "#8a6038", lantern: "#ffd27a", post: "#4a3424",
    flowers: [hex("#e98ab5"), hex("#f2d06b"), hex("#b9a2f0"), hex("#f4f1ea")], stem: "#3e7a3a", bee: hex("#ffd34d"), fly: hex("#d8ff8a"), star: hex("#fff6dd"),
  },
  light: {
    sea: ["#bfe4f2", "#9fd2e8", "#7dbedb"], water: "#5fb0d8", foam: "#e4f5fc",
    grass: "#6fb04f", dirt: "#8a6040", sand: "#e8d49a", log: "#7a5634", logTop: "#b8956a", leaf: "#4a9a42",
    plank: "#c89a62", roof: "#b5533a", glass: "#a8d6ee", door: "#5a3a24", hive: "#f6efd8", lid: "#a8744a", lantern: "#f0c860", post: "#5a4030",
    flowers: [hex("#e05f97"), hex("#f0b82e"), hex("#8f6fe0"), hex("#ffffff")], stem: "#3f8a3a", bee: hex("#3a2d14"), fly: hex("#fff3b0"), star: hex("#ffffff"),
  },
};
type Look = (typeof LOOKS)["dark"];
const palette = (w: World): Look => (w.look.dark ? LOOKS.dark : LOOKS.light);

/** The view: blocks sized so the island fills about half the screen's width. */
export function viewOf(w: World): Iso {
  const tile = clamp(Math.min(w.size.w * 0.62, w.size.h * 1.25) / N, 16, 72);
  return isometric({ tile, origin: { x: w.size.w / 2, y: w.size.h / 2 - (N * tile) / 4 + tile * 0.8 }, rise: tile * 0.58 });
}

/** A fixed number 0..1 for `a, b, c`, so a block's pixels are the same each time it is drawn. */
const hash = (a: number, b: number, c = 0): number => {
  let h = (Math.imul(a, 0x27d4eb2d) ^ Math.imul(b, 0x165667b1) ^ Math.imul(c, 0x9e3779b1)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0; h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};

/** The island: its ground columns (sand at the rim, grass terraces rising to a hill), and what is built on them. */
function islandFor(w: World): Pick<Isle, "tiles" | "things" | "blocks"> {
  const tiles = new Map<string, Tile>(), blocks = new Map<string, Block>(), c = (N - 1) / 2, R = c - 0.5;
  const set = (x: number, y: number, z: number, b: Block) => blocks.set(vkey(x, y, z), b);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot(x - c, y - c) + (w.rng() - 0.5) * 1.3;
    if (d > R) continue;
    const h = d > R - 1.4 ? 1 : d > R - 4 ? 2 : d > 3.2 ? 3 : 4;
    for (let z = 0; z < h; z++) set(x, y, z, z === h - 1 ? (h === 1 ? "sand" : "grass") : h === 1 ? "sand" : "dirt");
    tiles.set(key(x, y), { x, y, z: h });
  }
  const things: Thing[] = [];
  const top = (x: number, y: number) => tiles.get(key(x, y))?.z ?? 0;
  const free = (x: number, y: number, w = 1, d = 1) => {
    for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) if (top(x + i, y + j) < 2) return false;
    return true;
  };
  // The cottage at the back of the hill, where nothing stands in front of it: plank walls two blocks
  // high on a 4 x 3 footprint, a door and a window on each side you see, a gable roof stepping up to
  // its ridge, overhanging a block all round.
  const cx = 6, cy = 5, cw = 4, cd = 3;
  if (free(cx, cy, cw, cd)) {
    let z0 = 0;
    for (let j = 0; j < cd; j++) for (let i = 0; i < cw; i++) z0 = Math.max(z0, top(cx + i, cy + j));
    for (let j = 0; j < cd; j++) for (let i = 0; i < cw; i++) {
      // Footings of plank down to the ground where the hill falls away under it.
      for (let z = top(cx + i, cy + j); z < z0; z++) set(cx + i, cy + j, z, "plank");
      for (let z = z0; z < z0 + 2; z++) {
        const front = j === cd - 1, side = i === cw - 1;
        const door = front && i === 1 && z === z0, window = z === z0 + 1 && ((front && i === 2) || (side && j === 1));
        set(cx + i, cy + j, z, door ? "door" : window ? "glass" : "plank");
      }
    }
    for (let j = -1; j <= cd; j++) for (let i = -1; i <= cw; i++) set(cx + i, cy + j, z0 + 2, "roof");
    for (let i = -1; i <= cw; i++) set(cx + i, cy + 1, z0 + 3, "roof");
    things.push({ kind: "cottage", x: cx, y: cy });
  }
  // Trees round the edges, never in front of the cottage: a trunk of logs and a crown of leaves, corners left open.
  for (const [x, y] of [[3, 4], [13, 3], [2, 9], [15, 6], [5, 14], [9, 15]] as const) {
    if (!free(x, y)) continue;
    const z0 = top(x, y), hgt = 3 + Math.floor(hash(x, y) * 2);
    for (let z = z0; z < z0 + hgt; z++) set(x, y, z, "log");
    for (let dz = 0; dz < 3; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const corner = Math.abs(dx) + Math.abs(dy) === 2;
      if (dz === 2 && (dx || dy)) continue;
      if (corner && (dz === 1 || hash(x + dx, y + dy, dz) < 0.5)) continue;
      const k = vkey(x + dx, y + dy, z0 + hgt - 1 + dz);
      if (!blocks.has(k)) blocks.set(k, "leaf");
    }
    things.push({ kind: "tree", x, y });
  }
  // Three hive boxes in a row on the meadow to the right, each a box under its lid.
  for (const [x, y] of [[12, 10], [13, 11], [14, 12]] as const) {
    if (!free(x, y) || blocks.has(vkey(x, y, top(x, y)))) continue;
    set(x, y, top(x, y), "hive");
    things.push({ kind: "hive", x, y });
  }
  // The lantern on its post beside the cottage door, clear of it.
  const [lx, ly] = [cx + cw, cy + cd + 1];
  if (free(lx, ly) && !blocks.has(vkey(lx, ly, top(lx, ly)))) {
    set(lx, ly, top(lx, ly), "post"); set(lx, ly, top(lx, ly) + 1, "lantern");
    things.push({ kind: "lamp", x: lx, y: ly });
  }
  return { tiles, things, blocks };
}

function patchesFor(w: World, tiles: Map<string, Tile>, blocks: Map<string, Block>): Patch[] {
  const free = [...tiles.values()].filter((t) => t.z >= 2 && !blocks.has(vkey(t.x, t.y, t.z)));
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
  description: "A blocky island apiary: bees work the flowers between their hive boxes; click a block to plant flowers.",
  // Made for the native style: its pixels are its own, drawn at the screen's resolution.
  style: (look) => ({
    kind: "native", relief: 0.65, gloss: 0.45, shadow: look.dark ? [0, 6, 14] : [20, 50, 70], shadowAlpha: look.dark ? 0.55 : 0.2,
    ambient: look.dark ? 0.45 : 1, glow: look.dark ? 0.65 : 0.2, key: look.dark ? [170, 190, 255] : [255, 248, 232],
  }),

  create(w) {
    const isle = islandFor(w), patches = patchesFor(w, isle.tiles, isle.blocks);
    return { ...isle, patches, bees: beesFor(w, { things: isle.things, patches }), hover: null, t: 0, image: null, imageFor: "" };
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
  },

  picture(s, g, w) {
    const L = palette(w), iso = viewOf(w), T = g.getTransform(), k = T.a || 1;
    const want = `${w.size.w}x${w.size.h}@${k}:${w.look.dark}`;
    if (!s.image || s.imageFor !== want) { s.image = drawIsland(s, iso, L, w.size.w, w.size.h, k); s.imageFor = want; }
    g.drawImage(s.image, 0, 0, w.size.w, w.size.h);
    // Waves: short crests of light drifting slowly across the sea, in steps of the blocks' pixels.
    drawWaves(g, iso, s, w, L);
    for (const p of s.patches) { const t = s.tiles.get(key(p.x, p.y)); if (t) drawFlowers(g, iso, t, p, L, s.t); }
    if (s.hover) outline(g, iso, s.hover);
  },

  light(s, g, w) {
    const iso = viewOf(w);
    const glow = (x: number, y: number, r: number, c: Rgb, a: number) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${a})`); gr.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    if (s.hover) { const p = iso.toScreen(s.hover.x + 0.5, s.hover.y + 0.5, s.hover.z + 0.4); glow(p.x, p.y, iso.tile * 1.6, [255, 244, 210], w.look.dark ? 0.5 : 0.3); }
    if (!w.look.dark) {
      // The sun from the upper left: a broad warm wash.
      glow(w.size.w * 0.15, -w.size.h * 0.1, Math.max(w.size.w, w.size.h) * 1.1, [255, 236, 200], 0.18);
      return;
    }
    glow(w.size.w * 0.85, -w.size.h * 0.05, Math.max(w.size.w, w.size.h), [150, 175, 240], 0.22);
    for (const t of s.things) {
      const tile = s.tiles.get(key(t.x, t.y));
      if (!tile) continue;
      if (t.kind === "cottage") { const p = iso.toScreen(t.x + 3, t.y + 3, tile.z + 1.4); glow(p.x, p.y, iso.tile * 5, [255, 150, 70], 0.42 * (0.94 + 0.06 * Math.sin(s.t * 3.1))); }
      if (t.kind === "lamp") { const p = iso.toScreen(t.x + 0.5, t.y + 0.5, tile.z + 1.5); glow(p.x, p.y, iso.tile * 3.5, [255, 180, 100], 0.5); }
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
        const a = s.t * 0.3 + i * 2.1, r = N * 0.3 + Math.sin(a * 1.3) * 2;
        const p = iso.toScreen(N / 2 + Math.cos(a) * r, N / 2 + Math.sin(a) * r, 3 + Math.sin(a * 2.7) * 0.8);
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
        if (i === -1) { const t = s.tiles.get(key(hive.x, hive.y))!; return iso.toScreen(hive.x + 0.5, hive.y + 1, t.z + 0.2); }
        const p = s.patches[i % s.patches.length]!, t = s.tiles.get(key(p.x, p.y))!;
        return iso.toScreen(p.x + 0.5, p.y + 0.5, t.z + 0.3);
      };
      const a = end(b.from), c = end(b.to), u = b.t, lift = Math.sin(u * Math.PI) * iso.tile * 1.4;
      const x = a.x + (c.x - a.x) * u + Math.sin(b.wobble) * 3, y = a.y + (c.y - a.y) * u - lift + Math.cos(b.wobble * 1.3) * 2;
      o.dot(x, y, 1.8, L.bee, 0.95, 0.4);
    }
  },
});

/** The ground column under a screen point: the highest one whose top it falls on. */
function tileAt(s: Isle, iso: Iso, sx: number, sy: number): Tile | null {
  let best: Tile | null = null;
  for (let z = 6; z >= 1; z--) {
    const g = iso.toGround(sx, sy, z), t = s.tiles.get(key(Math.floor(g.x), Math.floor(g.y)));
    if (t && t.z === z && (!best || iso.depth(t.x, t.y, t.z) > iso.depth(best.x, best.y, best.z))) best = t;
  }
  return best;
}

type P = { x: number; y: number };

/** A face's 4 x 4 pixels: `shade(i, j)` gives each one's colour; `o` is the face's corner, `u` and `v` its edges. */
function pixels(g: Paint, o: P, u: P, v: P, shade: (i: number, j: number) => string, n = 4): void {
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = { x: o.x + (u.x * i + v.x * j) / n, y: o.y + (u.y * i + v.y * j) / n };
    g.fillStyle = shade(i, j);
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(a.x + u.x / n, a.y + u.y / n);
    g.lineTo(a.x + (u.x + v.x) / n, a.y + (u.y + v.y) / n);
    g.lineTo(a.x + v.x / n, a.y + v.y / n);
    g.closePath();
    // A hair wider than the pixel, so neighbours meet without a seam of the sea between them.
    g.fill(); g.lineWidth = 0.6; g.strokeStyle = g.fillStyle; g.stroke();
  }
}

/** `c` (a hex colour) scaled by `k` and nudged by `n` (-1..1) for a pixel's own shade. */
function tone(c: string, k: number, n: number): string {
  const [r, g, b] = hex(c), f = k * (1 + n * 0.09);
  return `rgb(${Math.min(255, r * f) | 0},${Math.min(255, g * f) | 0},${Math.min(255, b * f) | 0})`;
}

/** How a face of `b` is pixelled: `side` (0 top, 1 the +x side, 2 the +y side), pixel `i` across and `j` down. */
function texel(b: Block, L: Look, side: 0 | 1 | 2, i: number, j: number, n: number, up: boolean): string {
  const k = side === 0 ? 1 : side === 1 ? 0.8 : 0.64;
  switch (b) {
    case "grass": return side === 0 ? tone(L.grass, k, n) : j === 0 || (j === 1 && n > 0.2) ? tone(L.grass, k, n) : tone(L.dirt, k, n);
    case "dirt": return tone(L.dirt, k, n);
    case "sand": return tone(L.sand, k, n * 0.6);
    case "log": return side === 0 ? tone(L.logTop, (i === 0 || i === 3 || j === 0 || j === 3) ? k * 0.75 : k, n * 0.5) : tone(L.log, i % 2 ? k * 0.82 : k, n * 0.5);
    case "leaf": return tone(L.leaf, n > 0.55 ? k * 0.62 : k, n);
    case "plank": return tone(L.plank, j % 2 ? k * 0.86 : k, n * 0.4);
    case "roof": return tone(L.roof, j % 2 ? k * 0.82 : k, n * 0.4);
    case "glass": return side === 0 || i === 0 || j === 0 || i === 3 || j === 3 ? tone(L.plank, k * 0.8, n * 0.3) : tone(L.glass, up ? 1.05 : k, n * 0.2);
    case "door": return side === 0 ? tone(L.plank, k, n * 0.4) : tone(L.door, j === 2 && i === 2 ? k * 1.6 : k, n * 0.3);
    case "hive": return side === 0 ? tone(L.lid, k, n * 0.3) : j === 0 ? tone(L.lid, k, n * 0.3) : j === 2 ? tone(L.hive, k * 0.86, n * 0.3) : j === 3 && (i === 1 || i === 2) && side === 2 ? tone(L.door, k, 0) : tone(L.hive, k, n * 0.3);
    case "lid": return tone(L.lid, k, n * 0.3);
    case "post": return tone(L.post, i === 1 || i === 2 ? k : k * 0.7, n * 0.3);
    case "lantern": return i === 0 || i === 3 || j === 0 || j === 3 ? tone(L.post, k, 0) : tone(L.lantern, up ? 1.1 : k, n * 0.2);
  }
}

/** Every block, nearest last, each face that shows, into an image of its own. */
function drawIsland(s: Isle, iso: Iso, L: Look, W: number, H: number, k: number): OffscreenCanvas {
  const c = new OffscreenCanvas(Math.max(1, Math.round(W * k)), Math.max(1, Math.round(H * k))), g = c.getContext("2d") as OffscreenCanvasRenderingContext2D;
  g.setTransform(k, 0, 0, k, 0, 0);
  drawSea(g, iso, s, L, W, H);
  const list = [...s.blocks.entries()].map(([kk, b]) => { const [x, y, z] = kk.split(",").map(Number) as [number, number, number]; return { x, y, z, b }; });
  list.sort((a, b) => a.x + a.y + a.z - (b.x + b.y + b.z) || a.z - b.z);
  const S = iso.toScreen, has = (x: number, y: number, z: number) => s.blocks.has(vkey(x, y, z));
  // A block glows by night only if it is a window or the lantern.
  const night = s.imageFor.endsWith("true") || L === LOOKS.dark;
  for (const { x, y, z, b } of list) {
    const seed = (i: number, j: number, f: number) => hash(x * 4 + i, y * 4 + j, z * 8 + f) * 2 - 1;
    const lit = night && (b === "glass" || b === "lantern");
    if (!has(x + 1, y, z)) { const o = S(x + 1, y, z + 1); pixels(g, o, { x: S(x + 1, y + 1, z + 1).x - o.x, y: S(x + 1, y + 1, z + 1).y - o.y }, { x: 0, y: S(x + 1, y, z).y - o.y }, (i, j) => texel(b, L, 1, i, j, seed(i, j, 1), lit)); }
    if (!has(x, y + 1, z)) { const o = S(x, y + 1, z + 1); pixels(g, o, { x: S(x + 1, y + 1, z + 1).x - o.x, y: S(x + 1, y + 1, z + 1).y - o.y }, { x: 0, y: S(x, y + 1, z).y - o.y }, (i, j) => texel(b, L, 2, i, j, seed(i, j, 2), lit)); }
    if (!has(x, y, z + 1)) { const o = S(x, y, z + 1); pixels(g, o, { x: S(x + 1, y, z + 1).x - o.x, y: S(x + 1, y, z + 1).y - o.y }, { x: S(x, y + 1, z + 1).x - o.x, y: S(x, y + 1, z + 1).y - o.y }, (i, j) => texel(b, L, 0, i, j, seed(i, j, 0), lit)); }
  }
  return c;
}

/** The sea: a plane of water blocks' tops, two by two pixels each, as far as the screen shows. */
function drawSea(g: OffscreenCanvasRenderingContext2D, iso: Iso, s: Isle, L: Look, W: number, H: number): void {
  const corners = [iso.toGround(0, 0, SEA), iso.toGround(W, 0, SEA), iso.toGround(0, H, SEA), iso.toGround(W, H, SEA)];
  const x0 = Math.floor(Math.min(...corners.map((p) => p.x))) - 1, x1 = Math.ceil(Math.max(...corners.map((p) => p.x))) + 1;
  const y0 = Math.floor(Math.min(...corners.map((p) => p.y))) - 1, y1 = Math.ceil(Math.max(...corners.map((p) => p.y))) + 1;
  const S = iso.toScreen;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (s.tiles.has(key(x, y))) continue;
    const o = S(x, y, SEA);
    // Deeper, darker, away from the island.
    const d = Math.hypot(x - N / 2, y - N / 2), deep = clamp(1.08 - d / (N * 2.2), 0.55, 1.05);
    pixels(g, o, { x: S(x + 1, y, SEA).x - o.x, y: S(x + 1, y, SEA).y - o.y }, { x: S(x, y + 1, SEA).x - o.x, y: S(x, y + 1, SEA).y - o.y }, (i, j) => tone(L.water, deep, hash(x * 2 + i, y * 2 + j, 99) * 2 - 1), 2);
  }
}

/** Waves: crests of light a pixel deep drifting across the sea, slowly, each on its own row. */
function drawWaves(g: Paint, iso: Iso, s: Isle, w: World, L: Look): void {
  const S = iso.toScreen;
  g.fillStyle = L.foam;
  for (let k = 0; k < 70; k++) {
    const row = Math.floor(hash(k, 7) * N * 3) - N, speed = 0.25 + hash(k, 9) * 0.35;
    const x = ((hash(k, 3) * N * 3 + s.t * speed) % (N * 3)) - N, y = row;
    if (s.tiles.has(key(Math.floor(x), Math.floor(y))) || s.tiles.has(key(Math.floor(x) + 1, Math.floor(y)))) continue;
    const a = S(x, y, SEA), b = S(x + 1.2, y, SEA), c = S(x + 1.2, y + 0.18, SEA), d = S(x, y + 0.18, SEA);
    g.globalAlpha = (w.look.dark ? 0.35 : 0.6) * (0.5 + 0.5 * Math.sin(s.t * 0.8 + k));
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(d.x, d.y); g.closePath(); g.fill();
  }
  g.globalAlpha = 1;
}

/** A patch's flowers: small blocks on stems standing on the column's top, grown in over a second. */
function drawFlowers(g: Paint, iso: Iso, t: Tile, p: Patch, L: Look, now: number): void {
  const grow = clamp((now - p.born) / 1.2), [r, gg, b] = L.flowers[p.hue]!, S = iso.toScreen;
  for (const [u, v] of SPOTS) {
    const h = 0.32 * grow, z = t.z, cube = 0.13 * grow;
    const base = S(t.x + u, t.y + v, z), top = S(t.x + u, t.y + v, z + h);
    g.strokeStyle = L.stem; g.lineWidth = Math.max(1, iso.tile * 0.03);
    g.beginPath(); g.moveTo(base.x, base.y); g.lineTo(top.x, top.y); g.stroke();
    const q = (dx: number, dy: number, dz: number) => S(t.x + u + dx, t.y + v + dy, z + h + dz);
    const face = (pts: P[], f: number) => { g.fillStyle = `rgb(${(r * f) | 0},${(gg * f) | 0},${(b * f) | 0})`; g.beginPath(); pts.forEach((pt, i) => (i ? g.lineTo(pt.x, pt.y) : g.moveTo(pt.x, pt.y))); g.closePath(); g.fill(); };
    face([q(-cube, cube, 0), q(cube, cube, 0), q(cube, cube, cube * 2), q(-cube, cube, cube * 2)], 0.7);
    face([q(cube, -cube, 0), q(cube, cube, 0), q(cube, cube, cube * 2), q(cube, -cube, cube * 2)], 0.85);
    face([q(-cube, -cube, cube * 2), q(cube, -cube, cube * 2), q(cube, cube, cube * 2), q(-cube, cube, cube * 2)], 1);
  }
}

/** Where a patch's flowers stand on its block. */
const SPOTS = [[0.25, 0.3], [0.65, 0.25], [0.45, 0.55], [0.78, 0.65], [0.3, 0.78]] as const;

/** The block under the pointer, picked out: its top's outline, as a world of blocks shows the one you point at. */
function outline(g: Paint, iso: Iso, t: Tile): void {
  const S = iso.toScreen, a = S(t.x, t.y, t.z), b = S(t.x + 1, t.y, t.z), c = S(t.x + 1, t.y + 1, t.z), d = S(t.x, t.y + 1, t.z);
  g.strokeStyle = "rgba(20,20,20,0.75)"; g.lineWidth = Math.max(1.5, iso.tile * 0.04);
  g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(d.x, d.y); g.closePath(); g.stroke();
}
