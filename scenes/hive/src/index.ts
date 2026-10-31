/**
 * The Hive: a wild honeycomb along the bottom of the screen, and a bee for each of the person's
 * agents. In the comb style each wax cell is one of the renderer's own hexagons, so the comb is
 * drawn in relief and lit as real comb is.
 *
 * - A working agent's bee flies out over open canvas, gathers, and comes back to its cells.
 * - A ready one sits on the comb by its cells; a resting one is tucked into a cell, dim.
 * - One whose agent needs the person flies to that agent's tile and dances beside it: the waggle
 *   dance, a figure eight with a straight, shaking run through the middle, glowing in the theme's
 *   attention colour. It is the one thing on the screen that moves like that.
 * - A turn finished well fills another of the agent's cells with honey, and full rows are capped,
 *   so over a session the comb shows the work done.
 *
 * Worker bees keep the hive alive with no agents: they come to a resting pointer, scatter from a
 * fast one, and gather at the drop of nectar a click leaves. A bee's species comes from its
 * program: honey bee, bumblebee, carpenter bee or orchid bee.
 */
import { clamp, COMB_ROW, defineScene, hash32, hex, TAU, turnToward, type Agent, type Paint, type Rgb, type Spot, type Tile, type World } from "@hivescape/core";

type Cell = { x: number; y: number; kind: "wax" | "honey" | "capped" | "pollen"; tint: number; owner: number };

interface Bee {
  id: string | null;
  x: number; y: number; vx: number; vy: number; heading: number;
  tx: number; ty: number;
  /** What it is about: flying somewhere, hovering at a flower, crawling on the comb, dancing. */
  phase: "fly" | "gather" | "comb" | "dance" | "cell";
  timer: number; wing: number; size: number; kind: number;
  /** The agent's own cells: indices into the comb, nearest its home first. */
  home: number[];
  turns: number;
  dance: number;
  urgent: boolean;
}

interface Drop { x: number; y: number; at: number }
interface Spark { x: number; y: number; vx: number; vy: number; age: number }

interface Hive { comb: Cell[]; pitch: number; bees: Bee[]; workers: Bee[]; drop: Drop | null; sparks: Spark[]; t: number; homes: number }

const SPECIES = [
  { name: "honey bee", abdomen: "#e3a02c", band: "#3b2410", thorax: "#b9852f", head: "#2b1c10", wing: "rgba(225,235,250,0.5)", tail: null },
  { name: "bumblebee", abdomen: "#f3c331", band: "#161412", thorax: "#f3c331", head: "#161412", wing: "rgba(220,228,245,0.48)", tail: "#f6f2e6" },
  { name: "carpenter bee", abdomen: "#24263d", band: "#121320", thorax: "#2f2b4d", head: "#101120", wing: "rgba(150,138,220,0.6)", tail: null },
  { name: "orchid bee", abdomen: "#22b673", band: "#0f6b45", thorax: "#1c9d63", head: "#0b4a30", wing: "rgba(205,245,225,0.6)", tail: null },
] as const;
const speciesOf = (kind: number) => SPECIES[Math.min(3, Math.floor(kind * 4))]!;

const LOOKS = {
  dark: {
    ground: ["#1d140b", "#120c07", "#080503"], under: "#2c1d0c", wax: "#9a6d2a", waxLit: "#b8843a", honey: "#e39a12", capped: "#ead39f",
    pollen: ["#d98e2f", "#c95a26", "#e8c444", "#8f6630", "#b8402c"], wallLine: "#d7a24a", spark: hex("#ffe08a"), nectar: hex("#fff3c0"), glow: [255, 176, 70] as Rgb,
  },
  light: {
    ground: ["#f7eedd", "#efe1c6", "#e5d1ac"], under: "#b98c45", wax: "#d9ac5c", waxLit: "#e7c178", honey: "#eba321", capped: "#f6e7c2",
    pollen: ["#e9a240", "#df6b33", "#f0d052", "#a87a3c", "#cf5236"], wallLine: "#9a6a24", spark: hex("#fff2b0"), nectar: hex("#ffffff"), glow: [255, 214, 140] as Rgb,
  },
};
const palette = (w: World) => (w.look.dark ? LOOKS.dark : LOOKS.light);

/** The comb's pitch: the comb style's own cell, so each wax cell is one rendered hexagon; in ascii,
 *  big enough that a cell's walls come out as `/ \ _` characters round its fill. */
const pitchOf = (w: World) => (w.style.kind === "comb" ? w.style.cell[0] : w.style.kind === "ascii" ? 40 : 16);

/** The comb: hexagons of the renderer's grid inside an organic shape along the bottom, a lobe up
 *  the left edge and one in the bottom right, leaving the middle open. */
function combFor(w: World): Pick<Hive, "comb" | "pitch"> {
  const p = pitchOf(w), row = p * COMB_ROW, { w: W, h: H } = w.size;
  const lobes = [[0.13, 1.04, 0.3, 0.46], [0.0, 0.52, 0.09, 0.3], [0.88, 1.06, 0.22, 0.34], [0.5, 1.12, 0.22, 0.16]];
  const comb: Cell[] = [];
  for (let j = 0; j * row < H + row; j++) {
    for (let i = -1; i * p < W + p; i++) {
      const x = (i + 0.5 - (j & 1 ? 0.5 : 0)) * p, y = (j + 0.5) * row;
      let f = -Infinity;
      for (const [cx, cy, rx, ry] of lobes) f = Math.max(f, 1 - (((x / W - cx!) / rx!) ** 2 + ((y / H - cy!) / ry!) ** 2));
      // A ragged edge, as wild comb is: a little noise, the same for every frame and every reload.
      const n = (hash32(i, j, 7) / 4294967296 - 0.5) * 0.16;
      if (f + n <= 0) continue;
      const r = hash32(i, j, 11) / 4294967296;
      // Old comb: honey toward the top of each lobe, pollen round it, empty wax at the edges.
      const kind = f > 0.55 ? (r < 0.5 ? "capped" : r < 0.8 ? "honey" : "pollen") : f > 0.25 ? (r < 0.22 ? "pollen" : r < 0.4 ? "honey" : "wax") : "wax";
      comb.push({ x, y, kind, tint: hash32(i, j, 13) / 4294967296, owner: -1 });
    }
  }
  return { comb, pitch: p };
}

function newBee(w: World, x: number, y: number, kind: number, size: number, id: string | null): Bee {
  return { id, x, y, vx: 0, vy: 0, heading: -Math.PI / 2, tx: x, ty: y, phase: "comb", timer: w.rng() * 2, wing: w.rng() * TAU, size, kind, home: [], turns: 0, dance: 0, urgent: false };
}

/** Is a point under a tile (with room to spare)? */
const underTile = (tiles: readonly Tile[], x: number, y: number, pad = 24) => tiles.some((t) => x > t.x0 - pad && x < t.x1 + pad && y > t.y0 - pad && y < t.y1 + pad);

/** A spot over open canvas, away from the comb and the tiles: where a worker goes to gather. */
function openSpot(w: World, tiles: readonly Tile[]): [number, number] {
  const { w: W, h: H } = w.size;
  for (let k = 0; k < 16; k++) {
    const x = W * (0.12 + w.rng() * 0.76), y = H * (0.08 + w.rng() * 0.52);
    if (!underTile(tiles, x, y)) return [x, y];
  }
  return [W * 0.5, H * 0.3];
}

/** Beside an agent's tile, on the side with the most room: where its bee dances. */
function besideTile(w: World, t: Tile): [number, number] {
  const { w: W, h: H } = w.size, gap = 90;
  const sides: [number, number, number][] = [
    [t.x0 - gap, (t.y0 + t.y1) / 2, t.x0], [t.x1 + gap, (t.y0 + t.y1) / 2, W - t.x1],
    [(t.x0 + t.x1) / 2, t.y0 - gap, t.y0], [(t.x0 + t.x1) / 2, t.y1 + gap, H - t.y1],
  ];
  sides.sort((a, b) => b[2] - a[2]);
  for (const [x, y] of sides) if (x > 40 && x < W - 40 && y > 40 && y < H - 40 && !underTile(w.tiles, x, y, 30)) return [x, y];
  return [sides[0]![0], sides[0]![1]];
}

/** Give each agent a home on the comb: a patch of cells round a point spread along it. */
function settle(s: Hive, w: World): void {
  const byId = new Map(s.bees.map((b) => [b.id, b]));
  const next: Bee[] = [];
  w.agents.forEach((a, i) => {
    let b = byId.get(a.id);
    if (!b) {
      const home = homeFor(s, i, w.agents.length);
      const c = s.comb[home[0] ?? 0] ?? { x: w.size.w / 2, y: w.size.h * 0.9 };
      b = newBee(w, c.x, c.y, a.kind, 0.85 + (a.size - 0.78) * 0.7, a.id);
      b.home = home;
      b.turns = 2 + (hash32(i, 3, 5) % 4);
    }
    b.kind = a.kind;
    next.push(b);
  });
  s.bees = next;
  s.homes = next.length;
  for (const c of s.comb) if (c.owner >= 0) c.owner = -1;
  next.forEach((b, i) => { for (const k of b.home.slice(0, 18)) s.comb[k]!.owner = i; });
}

function homeFor(s: Hive, i: number, n: number): number[] {
  // Spread the homes along the comb's top, from left to right.
  const top = s.comb.filter((c) => c.kind !== "wax").sort((a, b) => a.x - b.x);
  const anchor = top[Math.floor(((i + 0.5) / Math.max(n, 1)) * top.length)] ?? s.comb[0];
  if (!anchor) return [];
  return s.comb.map((c, k) => [k, Math.hypot(c.x - anchor.x, (c.y - anchor.y) * 1.1)] as const).sort((a, b) => a[1] - b[1]).slice(0, 24).map(([k]) => k);
}

export default defineScene<Hive>({
  id: "hive",
  name: "The Hive",
  description: "A honeycomb where each agent is a bee: honey fills its cells as turns finish, and a bee whose agent needs you dances beside its tile.",
  style: (look) => ({
    kind: "comb", cell: [17, 0], relief: 0.85, gloss: 0.8, gap: 1.6, radius: 2,
    shadow: look.dark ? [6, 3, 0] : [90, 60, 20], shadowAlpha: look.dark ? 0.6 : 0.24,
    ambient: look.dark ? 0.55 : 1, glow: look.dark ? 0.6 : 0.22, key: look.dark ? [255, 220, 170] : [255, 248, 232],
  }),

  create(w) {
    const s: Hive = { ...combFor(w), bees: [], workers: [], drop: null, sparks: [], t: 0, homes: 0 };
    for (let k = 0; k < 11; k++) {
      const c = s.comb[Math.floor(w.rng() * s.comb.length)];
      const b = newBee(w, c?.x ?? w.size.w / 2, c?.y ?? w.size.h, w.rng() * 0.25, 0.42 + w.rng() * 0.1, null);
      b.timer = w.rng() * 6;
      s.workers.push(b);
    }
    settle(s, w);
    return s;
  },

  resize(s, w) {
    Object.assign(s, combFor(w));
    for (const b of s.bees) b.home = [];
    s.bees = [];
    settle(s, w);
  },

  done(s, id, w) {
    const b = s.bees.find((x) => x.id === id);
    if (!b) return;
    b.turns++;
    const cell = s.comb[b.home[Math.min(b.home.length - 1, b.turns - 1)] ?? -1];
    if (cell) for (let k = 0; k < 14; k++) {
      const a = (k / 14) * TAU;
      s.sparks.push({ x: cell.x, y: cell.y, vx: Math.cos(a) * (40 + w.rng() * 50), vy: Math.sin(a) * (40 + w.rng() * 50) - 30, age: 0 });
    }
    if (s.sparks.length > 160) s.sparks.splice(0, s.sparks.length - 160);
  },

  click(s, x, y, w) {
    s.drop = { x, y, at: w.time };
    w.effects.ripple({ x, y, at: w.time, life: 1.4, speed: 230, strength: 0.7 });
  },

  step(s, dt, w) {
    s.t += dt;
    if (s.bees.length !== w.agents.length || s.bees.some((b, i) => b.id !== w.agents[i]!.id)) settle(s, w);
    const p = w.input.pointer;
    // Agents' bees: each does what its agent is doing.
    s.bees.forEach((b, i) => {
      const a: Agent = w.agents[i]!;
      const home = s.comb[b.home[0] ?? -1];
      b.timer -= dt;
      b.urgent = a.state === "needs-you";
      if (a.state === "needs-you") {
        const tile = w.tiles.find((t) => t.id === a.id);
        const [dx, dy] = tile ? besideTile(w, tile) : [home?.x ?? w.size.w / 2, (home?.y ?? w.size.h) - 140];
        if (b.phase !== "dance") { b.phase = "fly"; b.tx = dx; b.ty = dy; if (Math.hypot(dx - b.x, dy - b.y) < 24) { b.phase = "dance"; b.dance = 0; } }
        else { b.tx = dx; b.ty = dy; }
      } else if (a.state === "resting") {
        b.phase = home && Math.hypot(home.x - b.x, home.y - b.y) < 6 ? "cell" : "fly";
        if (home) { b.tx = home.x; b.ty = home.y; }
      } else if (a.state === "ready") {
        if (b.phase !== "comb" || b.timer <= 0) {
          const c = s.comb[b.home[Math.floor(w.rng() * Math.min(10, b.home.length))] ?? -1];
          if (c) { b.tx = c.x; b.ty = c.y; }
          b.phase = home && Math.hypot(b.tx - b.x, b.ty - b.y) < 80 ? "comb" : "fly";
          b.timer = 2 + w.rng() * 3;
        }
      } else {
        // Working: out to gather, back to its cells, out again.
        if (b.timer <= 0 || b.phase === "cell" || b.phase === "dance") {
          if (b.phase === "gather" || b.phase === "cell" || b.phase === "dance") { const c = s.comb[b.home[b.turns % Math.max(1, b.home.length)] ?? -1]; if (c) { b.tx = c.x; b.ty = c.y; } b.phase = "fly"; b.timer = 5; }
          else if (b.phase === "comb") { [b.tx, b.ty] = openSpot(w, w.tiles); b.phase = "fly"; b.timer = 7; }
          else { b.phase = Math.hypot(b.tx - b.x, b.ty - b.y) < 30 ? (b.ty > w.size.h * 0.6 ? "comb" : "gather") : "fly"; b.timer = b.phase === "gather" ? 1.6 : b.phase === "comb" ? 1.4 : 0.3; }
        }
      }
      fly(b, dt, w, i);
    });
    // Workers: busy between the comb and the open air, curious about a resting pointer, off from a fast one.
    const drop = s.drop && w.time - s.drop.at < 6 ? s.drop : null;
    if (!drop) s.drop = null;
    s.workers.forEach((b, i) => {
      b.timer -= dt;
      if (drop && Math.hypot(drop.x - b.x, drop.y - b.y) < 700) {
        const a = s.t * 1.7 + i * 1.3;
        b.tx = drop.x + Math.cos(a) * 26; b.ty = drop.y + Math.sin(a) * 16; b.phase = "fly";
      } else if (p.active && p.speed > 520 && Math.hypot(p.x - b.x, p.y - b.y) < 160) {
        b.tx = b.x + (b.x - p.x) * 2; b.ty = b.y + (b.y - p.y) * 2; b.phase = "fly"; b.timer = 1;
      } else if (p.active && p.rested > 0.6 && Math.hypot(p.x - b.x, p.y - b.y) < 420 && i % 2 === 0) {
        const a = s.t * 1.1 + i;
        b.tx = p.x + Math.cos(a) * 64; b.ty = p.y + Math.sin(a) * 40; b.phase = "fly";
      } else if (b.timer <= 0) {
        if (b.phase === "comb") { [b.tx, b.ty] = openSpot(w, w.tiles); b.phase = "fly"; b.timer = 6 + w.rng() * 6; }
        else { const c = s.comb[Math.floor(w.rng() * s.comb.length)]; if (c) { b.tx = c.x; b.ty = c.y; } b.phase = "comb"; b.timer = 4 + w.rng() * 6; }
      }
      fly(b, dt, w, i + 20);
    });
    for (const k of s.sparks) { k.age += dt; k.vy += 60 * dt; k.x += k.vx * dt; k.y += k.vy * dt; k.vx *= 1 - dt; }
    s.sparks = s.sparks.filter((k) => k.age < 1.4);
  },

  backdrop(s, g, w) {
    const L = palette(w), { w: W, h: H } = w.size;
    const r = g.createRadialGradient(W * 0.5, H * 0.35, 0, W * 0.5, H * 0.45, Math.max(W, H) * 0.85);
    r.addColorStop(0, L.ground[0]!); r.addColorStop(0.55, L.ground[1]!); r.addColorStop(1, L.ground[2]!);
    g.fillStyle = r; g.fillRect(0, 0, W, H);
    // Under the comb, the wax between its cells: the gaps of the grid read as walls.
    g.fillStyle = L.under;
    const p = s.pitch * 0.62;
    for (const c of s.comb) { g.beginPath(); g.arc(c.x, c.y, p, 0, TAU); g.fill(); }
  },

  picture(s, g, w) {
    const L = palette(w), p = s.pitch;
    // The comb: one hexagon a cell. Each agent's patch shows its turns as honey, a row of six capped.
    const owned = new Map<number, Bee>();
    s.bees.forEach((b) => b.home.forEach((k, n) => { if (n < 18) owned.set(k, b); }));
    s.comb.forEach((c, k) => {
      let colour: string;
      const b = owned.get(k);
      if (b) {
        const n = b.home.indexOf(k);
        colour = n < b.turns ? (n < Math.floor(b.turns / 6) * 6 ? L.capped : L.honey) : L.wax;
      } else colour = c.kind === "capped" ? L.capped : c.kind === "honey" ? L.honey : c.kind === "pollen" ? L.pollen[Math.floor(c.tint * L.pollen.length)]! : (c.tint > 0.5 ? L.waxLit : L.wax);
      if (w.style.kind === "ascii") {
        // A wall round each cell, thin so it reads as line characters, and its fill inside.
        g.fillStyle = colour;
        hexagon(g, c.x, c.y, p * 0.36);
        g.strokeStyle = L.wallLine; g.lineWidth = 2.2;
        hexagonPath(g, c.x, c.y, p * 0.5); g.stroke();
      } else {
        g.fillStyle = colour;
        hexagon(g, c.x, c.y, p * 0.5);
      }
    });
    if (s.drop) { g.fillStyle = "#ffe7a0"; g.beginPath(); g.arc(s.drop.x, s.drop.y, 6, 0, TAU); g.fill(); }
    // In ascii the bees are characters too, drawn larger so they read in cells of 9 x 13.
    if (w.style.kind === "ascii") {
      for (const b of s.workers) drawBee(g, b, 1.5, false, null);
      s.bees.forEach((b, i) => drawBee(g, b, 1.5, false, w.agents[i]?.state === "needs-you" ? w.look.accent : null));
    }
  },

  front(s, g, w) {
    if (w.style.kind === "ascii") return;
    for (const b of s.workers) drawBee(g, b, 1, true, null);
    s.bees.forEach((b, i) => drawBee(g, b, 1, true, w.agents[i]?.state === "needs-you" ? w.look.accent : null, s.t));
  },

  light(s, g, w) {
    const L = palette(w), { w: W, h: H } = w.size;
    const blob = (x: number, y: number, r: number, c: Rgb, a: number) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${a})`); gr.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    if (w.look.dark) {
      // Inside the hive at night the honey holds the light: a warm glow over the comb, breathing.
      const breathe = 0.9 + 0.1 * Math.sin(s.t * 0.6);
      blob(W * 0.14, H * 0.98, Math.max(W, H) * 0.42, L.glow, 0.32 * breathe);
      blob(W * 0.86, H * 1.02, Math.max(W, H) * 0.32, L.glow, 0.26 * breathe);
    } else blob(W * 0.1, -H * 0.1, Math.max(W, H) * 1.1, [255, 240, 210], 0.2);
    // A bee whose agent needs the person glows in the theme's attention colour, pulsing.
    s.bees.forEach((b, i) => {
      if (w.agents[i]?.state !== "needs-you") return;
      const k = 0.55 + 0.45 * Math.sin(s.t * 4.2);
      blob(b.x, b.y, 150, w.look.accent, (w.look.dark ? 0.75 : 0.55) * k);
    });
  },

  overlay(s, o, w) {
    const L = palette(w);
    for (const k of s.sparks) o.dot(k.x, k.y, 1.6, L.spark, clamp(1.2 - k.age), 2.5);
    if (s.drop) o.dot(s.drop.x - 2, s.drop.y - 2, 1.4, L.nectar, 0.8 + 0.2 * Math.sin(s.t * 6), 3);
    // The waggle dance leaves a short, fading trail of its run.
    s.bees.forEach((b, i) => { if (w.agents[i]?.state === "needs-you" && b.phase === "dance") o.dot(b.x, b.y + 10, 1.2, w.look.accent, 0.5, 2); });
  },

  spots(s) {
    return s.bees.map((b): Spot => ({ id: b.id!, x: b.x, y: b.y, r: 34 * b.size }));
  },
});

/** Move a bee toward its target: quick and wavering in the air, slow on the comb, a figure eight when dancing. */
function fly(b: Bee, dt: number, w: World, n: number): void {
  b.wing += dt * (b.phase === "comb" || b.phase === "cell" ? 0 : 70);
  if (b.phase === "dance") {
    // The waggle dance: a straight run up through the middle, shaking side to side, then a loop
    // back round, one side and then the other.
    b.dance += dt / 2.6;
    const u = b.dance % 1, side = Math.floor(b.dance) % 2 ? 1 : -1, R = 26 * b.size;
    let x: number, y: number, heading: number;
    if (u < 0.45) {
      const v = u / 0.45;
      x = b.tx + Math.sin(v * 52) * 4 * b.size; y = b.ty + R - v * R * 2; heading = -Math.PI / 2 + Math.sin(v * 52) * 0.4;
    } else {
      const v = (u - 0.45) / 0.55, a = -Math.PI / 2 + side * v * TAU * 0.5 * 2;
      x = b.tx + side * R * 0.9 * Math.sin(v * Math.PI); y = b.ty - R + v * R * 2; heading = a;
    }
    b.vx = (x - b.x) / Math.max(dt, 1e-3); b.vy = (y - b.y) / Math.max(dt, 1e-3);
    b.x = x; b.y = y; b.heading = heading;
    b.wing += dt * 40;
    return;
  }
  const crawling = b.phase === "comb" || b.phase === "cell";
  // A bee whose agent needs the person hurries to its tile.
  const speed = crawling ? 14 : b.urgent ? 320 : b.size > 0.6 ? 170 : 120;
  const dx = b.tx - b.x, dy = b.ty - b.y, d = Math.hypot(dx, dy);
  const want = d > 1 ? Math.min(speed, d * 2.2) : 0;
  // A flying bee wavers; a crawling one turns now and then.
  const waver = crawling ? 0 : Math.sin(w.time * 5.3 + n * 1.7) * 0.6;
  const ang = Math.atan2(dy, dx) + waver * Math.min(1, d / 120);
  const k = Math.min(1, dt * (crawling ? 4 : 2.6));
  b.vx += (Math.cos(ang) * want - b.vx) * k;
  b.vy += (Math.sin(ang) * want - b.vy) * k;
  // Round the tiles, not under them: look half a second ahead, and if that is under a tile, turn
  // off by its nearest side; out at once if it is under one already. Its own target is never under one.
  if (b.phase !== "cell") {
    const ax = b.x + b.vx * 0.5, ay = b.y + b.vy * 0.5;
    for (const t of w.tiles) {
      const inside = b.x > t.x0 - 6 && b.x < t.x1 + 6 && b.y > t.y0 - 6 && b.y < t.y1 + 6;
      const ahead = ax > t.x0 - 18 && ax < t.x1 + 18 && ay > t.y0 - 18 && ay < t.y1 + 18;
      const targetIn = b.tx > t.x0 && b.tx < t.x1 && b.ty > t.y0 && b.ty < t.y1;
      if ((!inside && !ahead) || targetIn) continue;
      const px = inside ? b.x : ax, py = inside ? b.y : ay;
      const e = [px - t.x0, t.x1 - px, py - t.y0, t.y1 - py], m = Math.min(...e), f = (inside ? 1400 : 900) * dt;
      if (m === e[0]) b.vx -= f; else if (m === e[1]) b.vx += f; else if (m === e[2]) b.vy -= f; else b.vy += f;
    }
  }
  b.x += b.vx * dt; b.y += b.vy * dt;
  if (Math.hypot(b.vx, b.vy) > 4) b.heading = turnToward(b.heading, Math.atan2(b.vy, b.vx), dt * (crawling ? 3 : 8));
}

function hexagonPath(g: Paint, x: number, y: number, ap: number): void {
  const r = ap * 1.1547;
  g.beginPath();
  for (let k = 0; k < 6; k++) { const a = Math.PI / 2 + (k * Math.PI) / 3; if (k) g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  g.closePath();
}

function hexagon(g: Paint, x: number, y: number, ap: number): void { hexagonPath(g, x, y, ap); g.fill(); }

/** A bee from above: a soft shadow below it, wings over a striped abdomen, a fuzzy thorax, a dark
 *  head with its eyes and antennae, legs when it walks. `crisp` paints the detail a full-resolution
 *  front shows (gradients, gloss, motion-blurred wings); cells want flat shapes. `call` rings a bee
 *  whose agent needs the person, pulsing, in the theme's attention colour. */
function drawBee(g: Paint, b: Bee, scale: number, crisp: boolean, call: Rgb | null, t = 0): void {
  const sp = speciesOf(b.kind), L = (b.size > 0.6 ? 76 : 34) * b.size * scale;
  const flying = b.phase !== "comb" && b.phase !== "cell", dim = b.phase === "cell";
  if (call && crisp) {
    const k = 0.5 + 0.5 * Math.sin(t * 4.2);
    g.strokeStyle = `rgba(${call[0]},${call[1]},${call[2]},${0.25 + 0.35 * k})`;
    g.lineWidth = 2.5;
    g.beginPath(); g.arc(b.x, b.y, L * (0.62 + 0.12 * k), 0, TAU); g.stroke();
  }
  if (crisp) {
    // The shadow falls down and to the right, further and softer the higher the bee flies.
    const h = flying ? 1 : 0.25, sx = b.x + L * 0.18 * h + 2, sy = b.y + L * 0.3 * h + 3;
    const sg = g.createRadialGradient(sx, sy, 0, sx, sy, L * 0.42);
    sg.addColorStop(0, `rgba(20,10,0,${flying ? 0.22 : 0.32})`); sg.addColorStop(1, "rgba(20,10,0,0)");
    g.fillStyle = sg; g.fillRect(sx - L * 0.5, sy - L * 0.5, L, L);
  }
  g.save(); g.translate(b.x, b.y); g.rotate(b.heading + Math.PI / 2); g.globalAlpha = dim ? 0.55 : 1;
  if (!flying && crisp) {
    // Legs, three a side, when it walks.
    g.strokeStyle = sp.head; g.lineWidth = Math.max(1, L * 0.022);
    for (const side of [-1, 1]) for (const [y0, a] of [[-0.16, -0.5], [-0.1, 0.1], [-0.04, 0.6]] as const) {
      g.beginPath(); g.moveTo(side * L * 0.1, L * y0); g.lineTo(side * L * 0.26, L * (y0 + a * 0.18)); g.stroke();
    }
  }
  // Abdomen, behind (+y), in bands.
  g.save();
  g.beginPath(); g.ellipse(0, L * 0.2, L * 0.2, L * 0.3, 0, 0, TAU); g.clip();
  g.fillStyle = sp.abdomen; g.fillRect(-L, -L, L * 2, L * 2);
  g.fillStyle = sp.band;
  const wide = b.kind >= 0.25 && b.kind < 0.5;
  for (let k = 0; k < 3; k++) g.fillRect(-L, L * (0.06 + k * 0.15), L * 2, L * (wide ? 0.08 : 0.06));
  if (sp.tail) { g.fillStyle = sp.tail; g.fillRect(-L, L * 0.42, L * 2, L * 0.12); }
  if (crisp) {
    const gl = g.createLinearGradient(-L * 0.2, 0, L * 0.2, 0);
    gl.addColorStop(0, "rgba(0,0,0,0.28)"); gl.addColorStop(0.35, "rgba(255,255,255,0.18)"); gl.addColorStop(1, "rgba(0,0,0,0.32)");
    g.fillStyle = gl; g.fillRect(-L, -L, L * 2, L * 2);
  }
  g.restore();
  if (crisp) {
    const tg = g.createRadialGradient(-L * 0.04, -L * 0.16, 0, 0, -L * 0.12, L * 0.16);
    tg.addColorStop(0, shadeHex(sp.thorax, 0.25)); tg.addColorStop(1, shadeHex(sp.thorax, -0.25));
    g.fillStyle = tg;
  } else g.fillStyle = sp.thorax;
  g.beginPath(); g.arc(0, -L * 0.12, L * 0.15, 0, TAU); g.fill();
  g.fillStyle = sp.head; g.beginPath(); g.arc(0, -L * 0.3, L * 0.1, 0, TAU); g.fill();
  if (crisp) { g.fillStyle = "rgba(255,255,255,0.55)"; for (const side of [-1, 1]) { g.beginPath(); g.arc(side * L * 0.05, -L * 0.33, L * 0.022, 0, TAU); g.fill(); } }
  // Antennae: thin, so in cells they stay strokes.
  g.strokeStyle = sp.head; g.lineWidth = Math.max(1.4, L * 0.025);
  for (const side of [-1, 1]) { g.beginPath(); g.moveTo(side * L * 0.04, -L * 0.36); g.quadraticCurveTo(side * L * 0.1, -L * 0.5, side * L * 0.16, -L * 0.52); g.stroke(); }
  // Wings: spread and beating in the air (a blur of three, on the front), folded back on the comb.
  g.fillStyle = sp.wing;
  const blur = flying && crisp ? [-0.22, 0, 0.22] : [0];
  for (const side of [-1, 1]) {
    for (const db of blur) {
      const beat = flying ? Math.sin(b.wing) * 0.5 + db : 0;
      const spread = flying ? 1.05 + beat * 0.35 : 0.28;
      // In flight the wings are a faint blur; at rest, glassy and veined.
      g.globalAlpha = (dim ? 0.55 : 1) * (blur.length > 1 ? 0.3 : 0.9);
      for (const [len, off] of [[0.4, 0], [0.28, 0.12]] as const) {
        g.save(); g.translate(side * L * 0.08, -L * 0.1 + L * off); g.rotate(side * spread);
        g.beginPath(); g.ellipse(0, L * len * 0.5, L * len * 0.24, L * len * 0.56, 0, 0, TAU); g.fill();
        if (crisp && db === 0) {
          g.strokeStyle = "rgba(60,40,20,0.35)"; g.lineWidth = 0.7; g.stroke();
          g.beginPath(); g.moveTo(0, L * len * 0.05); g.lineTo(0, L * len * 0.9); g.moveTo(0, L * len * 0.4); g.lineTo(L * len * 0.14, L * len * 0.7); g.stroke();
        }
        g.restore();
      }
    }
  }
  g.restore();
  g.globalAlpha = 1;
}

/** `#rrggbb` moved toward white (k > 0) or black (k < 0). */
function shadeHex(c: string, k: number): string {
  const [r, gg, b] = hex(c), t = k > 0 ? 255 : 0, a = Math.abs(k);
  return `rgb(${Math.round(r + (t - r) * a)},${Math.round(gg + (t - gg) * a)},${Math.round(b + (t - b) * a)})`;
}

