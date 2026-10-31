/**
 * Living pictures. A painting or a photograph becomes a scene that moves only where the picture
 * itself would: water flows, grass and leaves bend in the wind, rain falls, mist drifts, a lamp or a
 * halo breathes. Everything else (the buildings, the bridge, the figures, the camera) holds still,
 * and that stillness is what makes the moving parts read. Drawn in the ink style, a region that moves
 * flips its characters in place while the rest stays crisp, as an ASCII shader over a still shot does.
 *
 * Optionally the picture is softened by depth (`depth` and `sharp`): what is far from the depth in
 * focus is blurred, as through a lens, once, when the picture is decoded.
 *
 * The picture comes with the scene, as base64 bytes in its bundle (a wallpaper may fetch nothing).
 * Its credit (title, maker, date, collection, licence) goes in the scene's package.json as
 * `hivescape.credit`, and `pack` writes it beside the wallpaper as CREDITS.txt. Everything is placed
 * in the picture's own fractions (0..1 across and down, after `crop`), so an effect stays on the
 * water whatever the screen's shape.
 */
import { clamp, defineScene, hex, TAU, type Look, type Paint, type Rgb, type Scene, type StyleSpec } from "@hivescape/core";

/** A rectangle in the picture: left, top, right, bottom, each 0..1. */
export type Region = readonly [number, number, number, number];
/** A point in the picture, 0..1 across and down. */
export type Point = readonly [number, number];
/** An outline in the picture. */
export type Outline = readonly Point[];

/** How far each part of the picture is from the eye: 0 the far distance, 1 the nearest. */
export interface Depth {
  /** Where the ground meets the sky, 0..1 down the picture. Above it is the far distance (0). */
  horizon: number;
  /** The ground's depth at the horizon (default 0.15) and at the picture's foot (default 1). */
  far?: number;
  near?: number;
  /** Things standing off the ground (a tree, a bridge, a figure), in order, the nearest last: an outline and its depth. */
  shapes?: readonly { poly: Outline; z: number }[];
}

/** Depth of field: the depth in focus, how far either side of it stays sharp, and the blur at the ends. */
export interface Focus { depth: number; range?: number; blur?: number }

export type Effect =
  /**
   * Water or cloud that flows along `dir` (a direction in the picture), `speed` picture widths a
   * second. `except`: outlines inside the region that hold still (a rock in the river).
   */
  | { kind: "flow"; region: Region | Outline; dir: Point; speed?: number; except?: readonly Outline[] }
  /**
   * Grass, wheat or leaves in the wind, in place: small patches sway, and waves of light sweep across
   * as gusts bend the blades (their paler side turning up), with a quick flutter of each patch on its
   * own, so the characters keep changing. `amp` is the sway in pixels; `shimmer` how strongly the light
   * changes (0..1, default 0.4).
   * `except`: outlines inside the region that hold still (a figure standing in the field).
   */
  | { kind: "wind"; region: Region | Outline; amp?: number; speed?: number; shimmer?: number; except?: readonly Outline[] }
  /** Rain: streaks at `angle` (radians from straight down, positive leaning right). */
  | { kind: "rain"; count: number; angle: number; colour: string; alpha?: number; length?: number; speed?: number; region?: Region }
  /** Mist: soft bands drifting across, at heights given in the picture's fractions. */
  | { kind: "mist"; bands: readonly number[]; colour: string; alpha?: number; speed?: number }
  /** A light that breathes, at a point of the picture: a lamp, a halo, the low sun. */
  | { kind: "glow"; at: Point; radius: number; colour: Rgb; alpha: number; pulse?: number };

export interface Masterwork {
  id: string;
  name: string;
  description: string;
  /** The picture, base64 (import it: the build bundles images as base64). */
  image: string;
  mime?: string;
  /** Crop away the paper, mount or frame round the picture first. */
  crop?: Region;
  /** The point of the picture (after `crop`) kept in view when the screen's shape cuts it, 0..1. */
  focus?: Point;
  /** How far each part is, for `sharp`. */
  depth?: Depth;
  /** Depth of field (needs `depth`): what is far from the depth in focus goes soft. */
  sharp?: Focus;
  /** Stretch the picture's tones toward the full range, 0 (as it is, the default) to 1 (fully): for a faded photograph. */
  levels?: number;
  /** What moves, and only that: the rest holds still. */
  effects: readonly Effect[];
  style?: (look: Look) => Partial<StyleSpec>;
}

/** Where the picture sits on a screen of `W x H`: its drawn rectangle, from its cropped source. */
export interface Placement { sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number }

/** The picture (cropped) covers the screen, scaled to fill it and cut round `focus`. */
export function place(img: { width: number; height: number }, m: { crop?: Region; focus?: Point }, W: number, H: number): Placement {
  const [c0, c1, c2, c3] = m.crop ?? [0, 0, 1, 1];
  const sx = img.width * c0, sy = img.height * c1, sw = img.width * (c2 - c0), sh = img.height * (c3 - c1);
  const k = Math.max(W / sw, H / sh), dw = sw * k, dh = sh * k;
  const [fx, fy] = m.focus ?? [0.5, 0.5];
  return { sx, sy, sw, sh, dx: clamp(W / 2 - dw * fx, W - dw, 0), dy: clamp(H / 2 - dh * fy, H - dh, 0), dw, dh };
}

/** Whether `x, y` is inside `poly` (even-odd). */
export function inside(poly: Outline, x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!, [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** How far the point `x, y` of the picture is: the last shape it is inside, or else the ground. */
export function depthAt(d: Depth, x: number, y: number): number {
  const shapes = d.shapes ?? [];
  for (let k = shapes.length - 1; k >= 0; k--) if (inside(shapes[k]!.poly, x, y)) return shapes[k]!.z;
  if (y <= d.horizon) return 0;
  const far = d.far ?? 0.15, near = d.near ?? 1;
  return far + ((near - far) * (y - d.horizon)) / Math.max(1e-6, 1 - d.horizon);
}

/** The blur, in work pixels, at depth `z`: none within `range` of the depth in focus, rising to `blur` beyond. */
export function blurAt(f: Focus | undefined, z: number): number {
  if (!f) return 0;
  const range = f.range ?? 0.2, off = Math.max(0, Math.abs(z - f.depth) - range) / Math.max(0.05, 1 - range);
  return (f.blur ?? 3) * Math.min(1, off * 1.6);
}

/**
 * A canvas filter that stretches tones from `lo..hi` (0..1) toward the full range by `amount`: a
 * brightness then a contrast, whose product is the stretch's slope and whose offset puts `lo` at 0.
 */
export function levelsFilter(lo: number, hi: number, amount: number): string {
  const K = 1 + (1 / Math.max(0.05, hi - lo) - 1) * amount, L = lo * amount, c = 1 + 2 * K * L, b = K / c;
  return `brightness(${b.toFixed(4)}) contrast(${c.toFixed(4)})`;
}

/** How long one cross-fade of a flow takes, seconds: long enough that the drift reads, short enough that nothing smears. */
export const FLOW_CYCLE = 4;

/** The two copies of a flowing region at time `t`: how far each has slid along the flow (-0.5..0.5 of its travel) and how much of it shows. Each is invisible at the moment it jumps back. */
export function flowPhases(t: number): [{ at: number; weight: number }, { at: number; weight: number }] {
  const a = (((t / FLOW_CYCLE) % 1) + 1) % 1, b = (a + 0.5) % 1;
  return [{ at: a - 0.5, weight: Math.sin(Math.PI * a) ** 2 }, { at: b - 0.5, weight: Math.sin(Math.PI * b) ** 2 }];
}

/** A fixed number 0..1 for patch `i, j`, so each patch of a field sways on its own beat. */
const patchHash = (i: number, j: number): number => {
  let h = (Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
};

/**
 * How far patch `i, j` of a field in the wind bends at time `t`, in pixels: a gust that travels
 * across (`x`, the patch's place across the picture, sets where the gust is), plus the patch's own
 * beat, so neighbours never move together. Never more than `amp` either way: the field bends in
 * place, it never slides.
 */
export function swayAt(t: number, i: number, j: number, x: number, amp: number, speed = 1): [number, number] {
  const ph = patchHash(i, j) * TAU, gust = 0.55 + 0.45 * Math.sin(t * 0.45 * speed - x * 5);
  return [amp * gust * Math.sin(t * 1.9 * speed + ph), amp * 0.35 * gust * Math.sin(t * 1.3 * speed + ph * 1.7)];
}

/**
 * How much patch `i, j` (at `x` across the picture) catches the light at time `t`, -0.4..1 times
 * `shimmer` (above 0 lighter, below darker): a gust's band of light sweeping across the field, and
 * the patch's own quick flutter.
 */
export function shimmerAt(t: number, i: number, j: number, x: number, shimmer: number, speed = 1): number {
  const ph = patchHash(j, i) * TAU, band = Math.max(0, Math.sin(t * 0.9 * speed - x * 9)) ** 2;
  return shimmer * (0.6 * band + 0.4 * Math.sin(t * 5 * speed + ph));
}

/** A wind patch's size on the screen, CSS pixels: about a character and a half, so a patch flips a few at a time. */
const PATCH = 10;
/** The picture's width at most, in its own pixels: ink samples a 1440 px screen at about 820 points across. */
const WORK = 1280;
/** The depth map's width: its masks are scaled up, which also softens their edges. */
const MASK = 320;
/** How many depth bands the depth of field blurs in. */
const BANDS = 6;

interface Drop { x: number; y: number; v: number; len: number }
type Canvas = OffscreenCanvas;
type Ctx = OffscreenCanvasRenderingContext2D;

interface Built {
  /** The picture, cropped, toned and softened by depth, at work size. */
  pic: Canvas;
  /** Each moving region's soft outline, at mask size, and its box in the picture's fractions. */
  masks: (Canvas | null)[];
  boxes: (Region | null)[];
  /** A scratch canvas, for composing a moving region before it goes on. */
  scratch: Canvas | null;
  /** Each wind's light: one pixel a patch, written each frame and drawn scaled up in one go. */
  lights: (Canvas | null)[];
}

interface State {
  built: Built | null;
  t: number;
  drops: Drop[][];
}

function decode(b64: string, mime: string): Promise<ImageBitmap> | null {
  if (typeof createImageBitmap !== "function" || typeof atob !== "function" || typeof OffscreenCanvas === "undefined") return null;
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return createImageBitmap(new Blob([bytes], { type: mime }));
}

const ctxOf = (c: Canvas): Ctx => c.getContext("2d") as Ctx;
const outlineOf = (r: Region | Outline): Outline =>
  typeof r[0] === "number" ? (([x0, y0, x1, y1]) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as Outline)(r as Region) : (r as Outline);

/** The picture's darkest and brightest tones (its 1st and 99th percentiles of lightness), 0..1. */
function tonesOf(img: ImageBitmap, sx: number, sy: number, sw: number, sh: number): [number, number] {
  const c = new OffscreenCanvas(128, Math.max(1, Math.round((128 * sh) / sw))), g = c.getContext("2d", { willReadFrequently: true }) as Ctx;
  g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height).data, hist = new Uint32Array(256), n = d.length / 4;
  for (let p = 0; p < d.length; p += 4) hist[Math.round(0.299 * d[p]! + 0.587 * d[p + 1]! + 0.114 * d[p + 2]!)]!++;
  const at = (f: number) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= f * n) return v / 255; } return 1; };
  return [at(0.01), at(0.99)];
}

/** Compose the picture once: cropped, toned, and (with `sharp`) each depth band blurred for its distance from focus, nearer bands over farther. */
function build(img: ImageBitmap, m: Masterwork): Built {
  const [c0, c1, c2, c3] = m.crop ?? [0, 0, 1, 1];
  const sw = img.width * (c2 - c0), sh = img.height * (c3 - c1), k = Math.min(1, WORK / sw);
  const w = Math.round(sw * k), h = Math.round(sh * k);
  const tone = m.levels ? levelsFilter(...tonesOf(img, img.width * c0, img.height * c1, sw, sh), m.levels) : "";
  const pic = new OffscreenCanvas(w, h), g = ctxOf(pic);
  const mw = MASK, mh = Math.max(1, Math.round((MASK * h) / w));
  const bands = m.depth && m.sharp ? BANDS : 1;
  const D = new Float32Array(mw * mh);
  if (bands > 1) for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) D[j * mw + i] = depthAt(m.depth!, (i + 0.5) / mw, (j + 0.5) / mh);
  for (let L = 0; L < bands; L++) {
    const blur = bands > 1 ? blurAt(m.sharp, (L + 0.5) / bands) : 0;
    const f = [tone, blur > 0.2 ? `blur(${blur.toFixed(2)}px)` : ""].filter(Boolean).join(" ");
    // The farthest band is the whole picture; each nearer one goes over it where the picture is at least that near.
    const c = L === 0 ? pic : new OffscreenCanvas(w, h), cg = ctxOf(c);
    if (f) cg.filter = f;
    cg.drawImage(img, img.width * c0, img.height * c1, sw, sh, 0, 0, w, h);
    cg.filter = "none";
    if (L === 0) continue;
    const lo = L / bands, e = 0.35 / bands, mc = new OffscreenCanvas(mw, mh), mg = ctxOf(mc), id = mg.createImageData(mw, mh);
    for (let q = 0; q < D.length; q++) id.data[q * 4 + 3] = 255 * clamp((D[q]! - lo + e) / (2 * e), 0, 1);
    mg.putImageData(id, 0, 0);
    cg.globalCompositeOperation = "destination-in";
    cg.imageSmoothingEnabled = true;
    cg.drawImage(mc, 0, 0, w, h);
    g.drawImage(c, 0, 0);
  }
  const moving = (e: Effect): e is Extract<Effect, { kind: "flow" | "wind" }> => e.kind === "flow" || e.kind === "wind";
  const masks = m.effects.map((e) => {
    if (!moving(e)) return null;
    const c = new OffscreenCanvas(mw, mh), mg = ctxOf(c);
    const fill = (o: Outline) => { mg.beginPath(); o.forEach(([x, y], i) => (i ? mg.lineTo(x * mw, y * mh) : mg.moveTo(x * mw, y * mh))); mg.closePath(); mg.fill(); };
    mg.filter = "blur(2px)";
    mg.fillStyle = "#fff";
    fill(outlineOf(e.region));
    // What holds still inside it is cut out, with the same soft edge.
    mg.globalCompositeOperation = "destination-out";
    for (const o of e.except ?? []) fill(o);
    return c;
  });
  const boxes = m.effects.map((e): Region | null => {
    if (!moving(e)) return null;
    const o = outlineOf(e.region), xs = o.map((p) => p[0]), ys = o.map((p) => p[1]), pad = 0.02;
    return [Math.max(0, Math.min(...xs) - pad), Math.max(0, Math.min(...ys) - pad), Math.min(1, Math.max(...xs) + pad), Math.min(1, Math.max(...ys) + pad)];
  });
  return { pic, masks, boxes, scratch: null, lights: m.effects.map(() => null) };
}

type Rect = { x: number; y: number; w: number; h: number };

/**
 * A moving region: drawn by `paint` into a scratch canvas the size of its box (in the picture
 * layer's own pixels), kept inside its soft outline, then laid over the still picture.
 */
function drawMoving(g: Paint, b: Built, mask: Canvas, box: Region, r: Rect, paint: (c: Ctx, ox: number, oy: number) => void): void {
  const T = g.getTransform(), sx = T.a, sy = T.d;
  const [bx0, by0, bx1, by1] = box, X = r.x + r.w * bx0, Y = r.y + r.h * by0, BW = r.w * (bx1 - bx0), BH = r.h * (by1 - by0);
  const W = Math.max(1, Math.ceil(BW * sx)), H = Math.max(1, Math.ceil(BH * sy));
  if (!b.scratch || b.scratch.width < W || b.scratch.height < H) b.scratch = new OffscreenCanvas(Math.max(W, b.scratch?.width ?? 0), Math.max(H, b.scratch?.height ?? 0));
  const c = ctxOf(b.scratch);
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = "source-over";
  c.globalAlpha = 1;
  c.clearRect(0, 0, W, H);
  // In the scratch, CSS pixels again, with the box's corner at the origin.
  c.setTransform(sx, 0, 0, sy, 0, 0);
  paint(c, X, Y);
  c.globalAlpha = 1;
  c.globalCompositeOperation = "destination-in";
  c.drawImage(mask, r.x - X, r.y - Y, r.w, r.h);
  c.globalCompositeOperation = "source-over";
  g.drawImage(b.scratch, 0, 0, W, H, X, Y, W / sx, H / sy);
}

export function defineMasterwork(m: Masterwork): Scene<State> {
  const rectOf = (s: State, W: number, H: number): Rect => {
    const p = place(s.built ? { width: s.built.pic.width, height: s.built.pic.height } : { width: W, height: H }, { focus: m.focus ?? [0.5, 0.5] }, W, H);
    return { x: p.dx, y: p.dy, w: p.dw, h: p.dh };
  };
  const seedFx = (W: number, H: number, rng: () => number, s: State) => {
    s.drops = m.effects.map((e) => (e.kind === "rain" ? Array.from({ length: e.count }, () => ({ x: rng() * W, y: rng() * H, v: 0.8 + rng() * 0.4, len: (e.length ?? 26) * (0.6 + rng() * 0.8) })) : []));
  };

  return defineScene<State>({
    id: m.id,
    name: m.name,
    description: m.description,
    style: (look) => ({ kind: "ink", cell: [7, 13], ambient: 1, glow: 0.4, edge: 0.12, ...m.style?.(look) }),

    create(w) {
      const s: State = { built: null, t: 0, drops: [] };
      seedFx(w.size.w, w.size.h, w.rng, s);
      decode(m.image, m.mime ?? "image/jpeg")?.then((img) => { s.built = build(img, m); }).catch(() => {});
      return s;
    },
    resize(s, w) { seedFx(w.size.w, w.size.h, w.rng, s); },

    step(s, dt, w) {
      s.t += dt;
      const r = rectOf(s, w.size.w, w.size.h);
      m.effects.forEach((e, k) => {
        if (e.kind !== "rain") return;
        const [x0, y0, x1, y1] = e.region ?? [0, 0, 1, 1], ax = r.x + r.w * x0, ay = r.y + r.h * y0, bx = r.x + r.w * x1, by = r.y + r.h * y1;
        const sp = (e.speed ?? 900) * dt, sx = Math.sin(e.angle), cy = Math.cos(e.angle);
        for (const d of s.drops[k]!) {
          d.y += sp * d.v * cy; d.x += sp * d.v * sx;
          if (d.y > by) { d.y = ay - d.len; d.x = ax + w.rng() * (bx - ax); }
          if (d.x > bx + 40) d.x -= bx - ax;
          if (d.x < ax - 40) d.x += bx - ax;
        }
      });
    },

    backdrop(_s, g, w) { g.fillStyle = w.look.dark ? "#050505" : "#f4f1ea"; g.fillRect(0, 0, w.size.w, w.size.h); },

    picture(s, g, w) {
      const b = s.built;
      if (!b) return;
      const { w: W } = w.size, r = rectOf(s, W, w.size.h);
      g.drawImage(b.pic, r.x, r.y, r.w, r.h);
      m.effects.forEach((e, k) => {
        if (e.kind === "flow") {
          // Water or cloud, as a cinemagraph: two copies sliding along the flow, cross-fading.
          const len = Math.hypot(e.dir[0], e.dir[1]) || 1, ux = e.dir[0] / len, uy = e.dir[1] / len, travel = (e.speed ?? 0.01) * FLOW_CYCLE * r.w;
          drawMoving(g, b, b.masks[k]!, b.boxes[k]!, r, (c, ox, oy) => {
            for (const ph of flowPhases(s.t)) { c.globalAlpha = ph.weight; c.drawImage(b.pic, r.x - ox + ux * travel * ph.at, r.y - oy + uy * travel * ph.at, r.w, r.h); }
          });
        } else if (e.kind === "wind") {
          // Grass, wheat or leaves in place: the region in thin rows, each swaying on its own beat, and
          // over them its light: one pixel a patch (a gust's band and each patch's flutter), drawn
          // scaled up and smooth in one go. A few dozen draws a frame, whatever the region's size.
          const [bx0, by0, bx1, by1] = b.boxes[k]!, amp = e.amp ?? 3, sp = e.speed ?? 1, shimmer = e.shimmer ?? 0.4;
          const i0 = Math.floor((bx0 * r.w) / PATCH), i1 = Math.ceil((bx1 * r.w) / PATCH), j0 = Math.floor((by0 * r.h) / PATCH), j1 = Math.ceil((by1 * r.h) / PATCH);
          const cols = Math.max(1, i1 - i0), rows = Math.max(1, j1 - j0);
          let L = b.lights[k] ?? null;
          if (!L || L.width !== cols || L.height !== rows) L = b.lights[k] = new OffscreenCanvas(cols, rows);
          const lg = ctxOf(L), img = lg.createImageData(cols, rows), d = img.data;
          for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
            const v = shimmerAt(s.t, i0 + i, j0 + j, ((i0 + i) * PATCH) / r.w, shimmer, sp), q = (j * cols + i) * 4;
            if (v > 0) { d[q] = 255; d[q + 1] = 250; d[q + 2] = 235; d[q + 3] = v * 255; } else d[q + 3] = -v * 255;
          }
          lg.putImageData(img, 0, 0);
          const kx = b.pic.width / r.w, ky = b.pic.height / r.h;
          drawMoving(g, b, b.masks[k]!, b.boxes[k]!, r, (c, ox, oy) => {
            c.drawImage(b.pic, r.x - ox, r.y - oy, r.w, r.h);
            for (let j = j0; j < j1; j++) {
              const [dx] = swayAt(s.t, 0, j, 0.5, amp, sp);
              c.drawImage(b.pic, i0 * PATCH * kx, j * PATCH * ky, cols * PATCH * kx, PATCH * ky, r.x - ox + i0 * PATCH + dx, r.y - oy + j * PATCH, cols * PATCH, PATCH);
            }
            c.imageSmoothingEnabled = true;
            c.drawImage(L!, r.x - ox + i0 * PATCH, r.y - oy + j0 * PATCH, cols * PATCH, rows * PATCH);
          });
        } else if (e.kind === "rain") {
          g.strokeStyle = e.colour; g.globalAlpha = e.alpha ?? 0.55; g.lineWidth = 1.2;
          const sx = Math.sin(e.angle), cy = Math.cos(e.angle);
          g.beginPath();
          for (const d of s.drops[k]!) { g.moveTo(d.x, d.y); g.lineTo(d.x + sx * d.len, d.y + cy * d.len); }
          g.stroke(); g.globalAlpha = 1;
        } else if (e.kind === "mist") {
          const c = hex(e.colour);
          for (const [i, fy] of e.bands.entries()) {
            const y = r.y + r.h * fy, x = ((s.t * (e.speed ?? 8) * (i % 2 ? 1 : -0.7) + i * 400) % (W * 1.6)) - W * 0.3;
            const gr = g.createRadialGradient(x, y, 0, x, y, W * 0.4);
            gr.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${e.alpha ?? 0.35})`); gr.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
            g.save(); g.translate(x, y); g.scale(1, 0.18); g.translate(-x, -y);
            g.fillStyle = gr; g.fillRect(x - W * 0.4, y - W * 0.4, W * 0.8, W * 0.8); g.restore();
          }
        }
      });
    },

    light(s, g, w) {
      if (!s.built) return;
      const r = rectOf(s, w.size.w, w.size.h);
      for (const e of m.effects) {
        if (e.kind !== "glow") continue;
        const x = r.x + r.w * e.at[0], y = r.y + r.h * e.at[1], rad = e.radius * Math.min(r.w, r.h);
        const a = e.alpha * (1 + (e.pulse ?? 0) * Math.sin(s.t * 1.7));
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, `rgba(${e.colour[0]},${e.colour[1]},${e.colour[2]},${a})`); gr.addColorStop(1, `rgba(${e.colour[0]},${e.colour[1]},${e.colour[2]},0)`);
        g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
    },
  });
}
