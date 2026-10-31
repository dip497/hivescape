/**
 * Living pictures. A painting or a photograph becomes a scene that moves the way a camera moving
 * through it would. The picture is cut into layers by how far each part of it is (`depth`: a ground
 * running from the horizon to the viewer's feet, and the things that stand up from it), and a slow
 * camera orbits it: near layers slide across far ones, the picture breathes in and out, and it leans
 * a little toward the pointer. Parts far from the depth in focus go soft, as through a lens. Over
 * that, effects where the picture has them: water and cloud that flow (two copies of the region
 * drifting along its flow and cross-fading, as a cinemagraph does), wind through a field, rain, mist,
 * birds, falling petals or snow, lights that breathe. Drawn in the ink style the picture moves under
 * a fixed grid of characters, so every character keeps changing and the whole frame seems to pour.
 *
 * The picture comes with the scene, as base64 bytes in its bundle (a wallpaper may fetch nothing),
 * and is decoded and layered once. Its credit (title, maker, date, collection, licence) goes in the
 * scene's package.json as `hivescape.credit`, and `pack` writes it beside the wallpaper as
 * CREDITS.txt. Everything is placed in the picture's own fractions (0..1 across and down, after
 * `crop`), so an effect stays on the water whatever the screen's shape.
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

/** The camera's slow orbit. */
export interface Camera {
  /** How far it drifts, a share of the screen (default 0.045). */
  drift?: number;
  /** Seconds for one orbit (default 22). */
  period?: number;
  /** How much nearer layers grow as it breathes in (default 0.06). */
  zoom?: number;
  /** How far it leans toward the pointer, a share of `drift` (default 0.4). */
  lean?: number;
  /** The depth that stays put: nearer layers slide one way, farther ones the other (default 0.5). */
  pivot?: number;
}

/** Depth of field: the depth in focus, how far either side of it stays sharp, and the blur at the ends. */
export interface Focus { depth: number; range?: number; blur?: number }

export type Effect =
  /** Water or cloud that flows along `dir` (a direction in the picture), `speed` picture widths a second. */
  | { kind: "flow"; region: Region | Outline; dir: Point; speed?: number }
  /** Wind through a field or trees: rows shifting in a wave that travels across. */
  | { kind: "wind"; region: Region; amp?: number; speed?: number }
  /** Rain: streaks at `angle` (radians from straight down, positive leaning right). */
  | { kind: "rain"; count: number; angle: number; colour: string; alpha?: number; length?: number; speed?: number; region?: Region }
  /** Mist: soft bands drifting across, at heights given in the picture's fractions. */
  | { kind: "mist"; bands: readonly number[]; colour: string; alpha?: number; speed?: number }
  /** Birds: small flocks crossing the sky region. */
  | { kind: "birds"; count: number; region: Region; colour: string }
  /** Falling things: petals, leaves, snow. */
  | { kind: "fall"; count: number; region: Region; colours: readonly string[]; size?: number; speed?: number }
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
  /** How far each part is. Without it the picture is one layer, and the camera only drifts and breathes. */
  depth?: Depth;
  camera?: Camera | false;
  /** Depth of field (needs `depth`). */
  sharp?: Focus;
  /** Stretch the picture's tones toward the full range, 0 (as it is, the default) to 1 (fully): for a faded photograph. */
  levels?: number;
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
function inside(poly: Outline, x: number, y: number): boolean {
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

const CAMERA: Required<Camera> = { drift: 0.045, period: 22, zoom: 0.06, lean: 0.4, pivot: 0.5 };

/** Where the camera is at time `t`, leaning `lx, ly` (-1..1) toward the pointer: its offset in CSS pixels, and how far it has breathed in (0..1). */
export function cameraAt(c: Required<Camera>, t: number, lx: number, ly: number, W: number, H: number): { x: number; y: number; breath: number } {
  const a = (TAU * t) / c.period;
  return {
    x: W * c.drift * (Math.sin(a) + c.lean * lx),
    y: H * c.drift * 0.6 * (Math.sin(a * 0.73 + 1.1) + c.lean * ly),
    breath: 0.5 - 0.5 * Math.cos(a * 0.61),
  };
}

/**
 * How a layer at depth `z` is drawn: the picture's rectangle, grown round the screen's centre (more
 * for nearer layers as the camera breathes in, and enough for every layer to cover the screen at the
 * camera's farthest), and slid across the screen (nearer layers against the camera, farther with it).
 */
export function layerRect(p: Placement, cam: { x: number; y: number; breath: number }, c: Required<Camera>, z: number, W: number, H: number, over: number) {
  const s = over * (1 + c.zoom * cam.breath * z), k = (z - c.pivot) / 0.5;
  return { x: W / 2 + (p.dx - W / 2) * s - cam.x * k, y: H / 2 + (p.dy - H / 2) * s - cam.y * k, w: p.dw * s, h: p.dh * s };
}

/** How much a camera's travel must grow the picture so no layer ever shows the screen's edge. */
export const overscan = (c: Required<Camera>): number => 1 + (2.2 * c.drift * (1 + c.lean) * Math.max(c.pivot, 1 - c.pivot)) / 0.5;

/** How many depth layers a picture is cut into. */
const LAYERS = 6;
/** The layers' width at most, in picture pixels: ink samples a 1440 px screen at about 820 points across. */
const WORK = 1024;
/** The depth map's width: its masks are scaled up, which also softens the layers' edges. */
const MASK = 320;

interface Drop { x: number; y: number; v: number; len: number }
interface Flake { x: number; y: number; vx: number; vy: number; r: number; c: string; spin: number }
interface Bird { x: number; y: number; v: number; phase: number; flock: number }
type Canvas = OffscreenCanvas;
type Ctx = OffscreenCanvasRenderingContext2D;
type Rect = { x: number; y: number; w: number; h: number };

interface Built {
  /** The picture, cropped, at work size. */
  w: number; h: number;
  /** Layer k holds everything at least as near as its band, blurred for its distance from focus. */
  layers: Canvas[];
  /** The part of each layer that has anything in it, in work pixels: only that is drawn. */
  boxes: Rect[];
  /** Each flow's soft outline, at mask size, and the part of the picture it covers (fractions). */
  flows: (Canvas | null)[];
  flowBoxes: (Region | null)[];
  /** A scratch canvas the size of the picture layer, for composing a flow. */
  scratch: Canvas | null;
}

interface State {
  built: Built | null;
  t: number;
  lean: { x: number; y: number };
  drops: Drop[][];
  flakes: Flake[][];
  birds: Bird[][];
}

function decode(b64: string, mime: string): Promise<ImageBitmap> | null {
  if (typeof createImageBitmap !== "function" || typeof atob !== "function" || typeof OffscreenCanvas === "undefined") return null;
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return createImageBitmap(new Blob([bytes], { type: mime }));
}

const ctxOf = (c: Canvas): Ctx => c.getContext("2d") as Ctx;
const outlineOf = (r: Region | Outline): Outline =>
  typeof r[0] === "number" ? (([x0, y0, x1, y1]) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as Outline)(r as Region) : (r as Outline);
const centreOf = (o: Outline): Point => [o.reduce((a, p) => a + p[0], 0) / o.length, o.reduce((a, p) => a + p[1], 0) / o.length];

/** The blur, in work pixels, of a layer at depth `z`: none within `range` of the depth in focus, rising to `blur` beyond. */
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

/** The picture's darkest and brightest tones (its 1st and 99th percentiles of lightness), 0..1. */
function tonesOf(img: ImageBitmap, sx: number, sy: number, sw: number, sh: number): [number, number] {
  const c = new OffscreenCanvas(128, Math.max(1, Math.round((128 * sh) / sw))), g = c.getContext("2d", { willReadFrequently: true }) as Ctx;
  g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height).data, hist = new Uint32Array(256), n = d.length / 4;
  for (let p = 0; p < d.length; p += 4) hist[Math.round(0.299 * d[p]! + 0.587 * d[p + 1]! + 0.114 * d[p + 2]!)]!++;
  const at = (f: number) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= f * n) return v / 255; } return 1; };
  return [at(0.01), at(0.99)];
}

/** A mask at the depth map's size: each pixel's alpha `a(depth)`. */
function maskOf(D: Float32Array, mw: number, mh: number, a: (d: number) => number): Canvas {
  const c = new OffscreenCanvas(mw, mh), g = ctxOf(c), id = g.createImageData(mw, mh);
  for (let q = 0; q < D.length; q++) id.data[q * 4 + 3] = 255 * a(D[q]!);
  g.putImageData(id, 0, 0);
  return c;
}

/** Keep only what `mask` covers (scaled up, which softens its edge). */
function cutTo(g: Ctx, mask: Canvas, w: number, h: number): void {
  g.globalCompositeOperation = "destination-in";
  g.imageSmoothingEnabled = true;
  g.drawImage(mask, 0, 0, w, h);
  g.globalCompositeOperation = "source-over";
}

/**
 * Fill a layer's transparent parts with the colours round them (push-pull): halve it again and again
 * (each half averages what is there), then from the smallest up lay each copy under the next larger,
 * and finally under the layer itself. A hole takes the colour of what surrounds it, smoothly.
 */
function fillHoles(c: Canvas): void {
  const levels: Canvas[] = [];
  let prev = c, w = c.width, h = c.height;
  while (w > 4 && h > 4) {
    w = Math.ceil(w / 2); h = Math.ceil(h / 2);
    const q = new OffscreenCanvas(w, h), g = ctxOf(q);
    g.imageSmoothingEnabled = true;
    g.drawImage(prev, 0, 0, w, h);
    levels.push(q);
    prev = q;
  }
  for (let k = levels.length - 1; k >= 0; k--) {
    const under = levels[k + 1], g = ctxOf(levels[k]!);
    if (!under) continue;
    g.globalCompositeOperation = "destination-over";
    g.imageSmoothingEnabled = true;
    g.drawImage(under, 0, 0, levels[k]!.width, levels[k]!.height);
    g.globalCompositeOperation = "source-over";
  }
  if (!levels[0]) return;
  const g = ctxOf(c);
  g.globalCompositeOperation = "destination-over";
  g.imageSmoothingEnabled = true;
  g.drawImage(levels[0], 0, 0, c.width, c.height);
  g.globalCompositeOperation = "source-over";
}

/** Cut the picture into its layers, once: each the picture masked to its band and nearer, blurred by its distance from focus. */
function build(img: ImageBitmap, m: Masterwork): Built {
  const [c0, c1, c2, c3] = m.crop ?? [0, 0, 1, 1];
  const sw = img.width * (c2 - c0), sh = img.height * (c3 - c1), k = Math.min(1, WORK / sw);
  const tone = m.levels ? levelsFilter(...tonesOf(img, img.width * c0, img.height * c1, sw, sh), m.levels) : "";
  const w = Math.round(sw * k), h = Math.round(sh * k);
  const n = m.depth ? LAYERS : 1;
  const mw = MASK, mh = Math.max(1, Math.round((MASK * h) / w));
  const D = new Float32Array(mw * mh);
  if (m.depth) for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) D[j * mw + i] = depthAt(m.depth, (i + 0.5) / mw, (j + 0.5) / mh);
  const layers: Canvas[] = [], boxes: Rect[] = [], e = 0.35 / n;
  const soft = (v: number, at: number) => clamp((v - at + e) / (2 * e), 0, 1);
  for (let L = 0; L < n; L++) {
    const c = new OffscreenCanvas(w, h), g = ctxOf(c), lo = L / n, hi = (L + 1) / n;
    const blur = blurAt(m.depth ? m.sharp : undefined, (L + 0.5) / n);
    const f = [tone, blur > 0.2 ? `blur(${blur.toFixed(2)}px)` : ""].filter(Boolean).join(" ");
    if (f) g.filter = f;
    g.drawImage(img, img.width * c0, img.height * c1, sw, sh, 0, 0, w, h);
    g.filter = "none";
    if (n === 1) { boxes.push({ x: 0, y: 0, w, h }); layers.push(c); continue; }
    // The band's own picture (and half a band nearer, so the ground runs on under the next layer's
    // soft edge). Where something nearer stands, the layer holds what would be behind it: the colours
    // round it, pulled in from smaller and smaller copies. When the camera moves the near thing
    // aside, that is what shows, not a second copy of the near thing.
    if (L < n - 1) {
      cutTo(g, maskOf(D, mw, mh, (d) => soft(d, lo) * (1 - soft(d, hi + 0.5 / n))), w, h);
      fillHoles(c);
    }
    // Then keep only this band and nearer: farther things are the farther layers'.
    if (L > 0) {
      const keep = (d: number) => soft(d, lo);
      cutTo(g, maskOf(D, mw, mh, keep), w, h);
      let i0 = mw, i1 = -1, j0 = mh, j1 = -1;
      for (let q = 0; q < D.length; q++) if (keep(D[q]!) > 0) { const i = q % mw, j = (q - i) / mw; if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j; }
      // One mask pixel of margin each side: the scaled-up mask's soft edge reaches that far.
      const kx = w / mw, ky = h / mh, x0 = Math.max(0, (i0 - 1) * kx), y0 = Math.max(0, (j0 - 1) * ky);
      boxes.push(i1 < 0 ? { x: 0, y: 0, w: 0, h: 0 } : { x: x0, y: y0, w: Math.min(w, (i1 + 2) * kx) - x0, h: Math.min(h, (j1 + 2) * ky) - y0 });
    } else boxes.push({ x: 0, y: 0, w, h });
    layers.push(c);
  }
  const flows = m.effects.map((e) => {
    if (e.kind !== "flow") return null;
    const c = new OffscreenCanvas(mw, mh), g = ctxOf(c), o = outlineOf(e.region);
    g.filter = "blur(2px)";
    g.fillStyle = "#fff";
    g.beginPath();
    o.forEach(([x, y], i) => (i ? g.lineTo(x * mw, y * mh) : g.moveTo(x * mw, y * mh)));
    g.closePath();
    g.fill();
    return c;
  });
  const flowBoxes = m.effects.map((e): Region | null => {
    if (e.kind !== "flow") return null;
    const o = outlineOf(e.region), xs = o.map((p) => p[0]), ys = o.map((p) => p[1]), pad = 0.02;
    return [Math.max(0, Math.min(...xs) - pad), Math.max(0, Math.min(...ys) - pad), Math.min(1, Math.max(...xs) + pad), Math.min(1, Math.max(...ys) + pad)];
  });
  return { w, h, layers, boxes, flows, flowBoxes, scratch: null };
}

/** The layer holding depth `z`: the band it falls in (each layer holds its band, and behind nearer things the colours round them). */
const layerFor = (b: Built, z: number): Canvas => b.layers[Math.min(b.layers.length - 1, Math.floor(z * b.layers.length))]!;
/** The depth layer `L` is drawn at: its band's middle. */
const zOfLayer = (b: Built, L: number): number => (b.layers.length === 1 ? 0.5 : (L + 0.5) / b.layers.length);

/** How long one cross-fade of a flow takes, seconds: long enough that the drift reads, short enough that nothing smears. */
export const FLOW_CYCLE = 4;

/** The two copies of a flowing region at time `t`: how far each has slid along the flow (-0.5..0.5 of its travel) and how much of it shows. Each is invisible at the moment it jumps back. */
export function flowPhases(t: number): [{ at: number; weight: number }, { at: number; weight: number }] {
  const a = (((t / FLOW_CYCLE) % 1) + 1) % 1, b = (a + 0.5) % 1;
  return [{ at: a - 0.5, weight: Math.sin(Math.PI * a) ** 2 }, { at: b - 0.5, weight: Math.sin(Math.PI * b) ** 2 }];
}

/** Water or cloud that flows, as a cinemagraph does: two copies of the region sliding along the flow, cross-fading, kept inside its soft outline. */
function drawFlow(g: Paint, t: number, b: Built, e: Extract<Effect, { kind: "flow" }>, mask: Canvas, box: Region, r: Rect, src: Canvas): void {
  const len = Math.hypot(e.dir[0], e.dir[1]) || 1, ux = e.dir[0] / len, uy = e.dir[1] / len;
  const travel = (e.speed ?? 0.01) * FLOW_CYCLE * r.w;
  // Compose in a scratch canvas the size of the flow's box on the layer, in device pixels, then lay it on.
  const T = g.getTransform(), sx = T.a, sy = T.d;
  const [bx0, by0, bx1, by1] = box, X = r.x + r.w * bx0, Y = r.y + r.h * by0, BW = r.w * (bx1 - bx0), BH = r.h * (by1 - by0);
  const W = Math.max(1, Math.ceil(BW * sx)), H = Math.max(1, Math.ceil(BH * sy));
  if (!b.scratch || b.scratch.width < W || b.scratch.height < H) b.scratch = new OffscreenCanvas(Math.max(W, b.scratch?.width ?? 0), Math.max(H, b.scratch?.height ?? 0));
  const c = ctxOf(b.scratch);
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = "source-over";
  c.clearRect(0, 0, W, H);
  // In the scratch, the layer's rectangle sits at (r.x - X, r.y - Y) CSS pixels.
  c.setTransform(sx, 0, 0, sy, 0, 0);
  for (const ph of flowPhases(t)) {
    c.globalAlpha = ph.weight;
    c.drawImage(src, r.x - X + ux * travel * ph.at, r.y - Y + uy * travel * ph.at, r.w, r.h);
  }
  c.globalAlpha = 1;
  c.globalCompositeOperation = "destination-in";
  c.drawImage(mask, r.x - X, r.y - Y, r.w, r.h);
  c.globalCompositeOperation = "source-over";
  g.drawImage(b.scratch, 0, 0, W, H, X, Y, W / sx, H / sy);
}

export function defineMasterwork(m: Masterwork): Scene<State> {
  const cam: Required<Camera> | null = m.camera === false ? null : { ...CAMERA, ...m.camera };
  const over = cam ? overscan(cam) : 1;
  const zOf = (x: number, y: number) => (m.depth ? depthAt(m.depth, x, y) : 0.5);
  /** Everything a frame needs to put a point of the picture on the screen. */
  const view = (s: State, W: number, H: number) => {
    const b = s.built;
    const p = place(b ? { width: b.w, height: b.h } : { width: W, height: H }, { focus: m.focus ?? [0.5, 0.5] }, W, H);
    const c = cam ? cameraAt(cam, s.t, s.lean.x, s.lean.y, W, H) : { x: 0, y: 0, breath: 0 };
    const rect = (z: number): Rect => (cam ? layerRect(p, c, cam, z, W, H, over) : { x: p.dx, y: p.dy, w: p.dw, h: p.dh });
    const toScreen = (x: number, y: number, z = zOf(x, y)): [number, number] => { const r = rect(z); return [r.x + r.w * x, r.y + r.h * y]; };
    return { rect, toScreen };
  };
  const seedFx = (W: number, H: number, rng: () => number, s: State) => {
    s.drops = m.effects.map((e) => (e.kind === "rain" ? Array.from({ length: e.count }, () => ({ x: rng() * W, y: rng() * H, v: 0.8 + rng() * 0.4, len: (e.length ?? 26) * (0.6 + rng() * 0.8) })) : []));
    s.flakes = m.effects.map((e) => (e.kind === "fall" ? Array.from({ length: e.count }, () => ({ x: rng() * W, y: rng() * H, vx: (rng() - 0.5) * 12, vy: (e.speed ?? 22) * (0.6 + rng() * 0.8), r: (e.size ?? 3) * (0.6 + rng() * 0.8), c: e.colours[Math.floor(rng() * e.colours.length)]!, spin: rng() * TAU })) : []));
    s.birds = m.effects.map((e) => (e.kind === "birds" ? Array.from({ length: e.count }, (_, i) => ({ x: rng() * W, y: 0, v: 18 + rng() * 14, phase: rng() * TAU, flock: i % 3 })) : []));
  };

  return defineScene<State>({
    id: m.id,
    name: m.name,
    description: m.description,
    style: (look) => ({ kind: "ink", cell: [7, 13], ambient: 1, glow: 0.4, edge: 0.12, ...m.style?.(look) }),

    create(w) {
      const s: State = { built: null, t: 0, lean: { x: 0, y: 0 }, drops: [], flakes: [], birds: [] };
      seedFx(w.size.w, w.size.h, w.rng, s);
      decode(m.image, m.mime ?? "image/jpeg")?.then((img) => { s.built = build(img, m); }).catch(() => {});
      return s;
    },
    resize(s, w) { seedFx(w.size.w, w.size.h, w.rng, s); },

    step(s, dt, w) {
      s.t += dt;
      const { w: W, h: H } = w.size, ptr = w.input.pointer;
      // The camera leans toward a pointer over the picture, slowly, and back when it leaves.
      const tx = ptr.active ? clamp((ptr.x / W) * 2 - 1, -1, 1) : 0, ty = ptr.active ? clamp((ptr.y / H) * 2 - 1, -1, 1) : 0;
      const ease = Math.min(1, dt * 1.2);
      s.lean.x += (tx - s.lean.x) * ease;
      s.lean.y += (ty - s.lean.y) * ease;
      const { toScreen } = view(s, W, H);
      m.effects.forEach((e, k) => {
        if (e.kind === "rain") {
          const [x0, y0, x1, y1] = e.region ?? [0, 0, 1, 1], [ax, ay] = toScreen(x0, y0, 1), [bx, by] = toScreen(x1, y1, 1);
          const sp = (e.speed ?? 900) * dt, sx = Math.sin(e.angle), cy = Math.cos(e.angle);
          for (const d of s.drops[k]!) {
            d.y += sp * d.v * cy; d.x += sp * d.v * sx;
            if (d.y > by) { d.y = ay - d.len; d.x = ax + w.rng() * (bx - ax); }
            if (d.x > bx + 40) d.x -= bx - ax;
            if (d.x < ax - 40) d.x += bx - ax;
          }
        } else if (e.kind === "fall") {
          const [x0, y0, x1, y1] = e.region, [ax, ay] = toScreen(x0, y0, 1), [bx, by] = toScreen(x1, y1, 1);
          for (const f of s.flakes[k]!) {
            f.spin += dt * 2; f.x += (f.vx + Math.sin(s.t * 0.7 + f.spin) * 10) * dt; f.y += f.vy * dt;
            if (f.y > by) { f.y = ay; f.x = ax + w.rng() * (bx - ax); }
          }
        } else if (e.kind === "birds") {
          const [x0, y0, x1, y1] = e.region, z = zOf((x0 + x1) / 2, (y0 + y1) / 2), [ax, ay] = toScreen(x0, y0, z), [bx, by] = toScreen(x1, y1, z);
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
      const b = s.built;
      if (!b) return;
      const { w: W, h: H } = w.size, { rect, toScreen } = view(s, W, H);
      // The layers, far to near, each slid and grown for its depth.
      b.layers.forEach((c, L) => {
        const r = rect(zOfLayer(b, L)), q = b.boxes[L]!;
        if (q.w > 0 && q.h > 0) g.drawImage(c, q.x, q.y, q.w, q.h, r.x + (r.w * q.x) / b.w, r.y + (r.h * q.y) / b.h, (r.w * q.w) / b.w, (r.h * q.h) / b.h);
      });
      m.effects.forEach((e, k) => {
        if (e.kind === "flow") {
          const [cx, cy] = centreOf(outlineOf(e.region)), z = zOf(cx, cy);
          drawFlow(g, s.t, b, e, b.flows[k]!, b.flowBoxes[k]!, rect(z), layerFor(b, z));
        } else if (e.kind === "wind") {
          // Redraw the region in rows, each shifted on a slow wave: a field leans in the wind.
          const [x0, y0, x1, y1] = e.region, rows = 26, amp = e.amp ?? 4, sp = e.speed ?? 1, z = zOf((x0 + x1) / 2, (y0 + y1) / 2);
          const src = layerFor(b, z), r = rect(z);
          for (let q = 0; q < rows; q++) {
            const fy0 = y0 + ((y1 - y0) * q) / rows, fy1 = y0 + ((y1 - y0) * (q + 1)) / rows;
            const off = Math.sin(s.t * 0.9 * sp - q * 0.25) * amp * (1 - (q / rows) * 0.5);
            g.drawImage(src, b.w * x0, b.h * fy0, b.w * (x1 - x0), b.h * (fy1 - fy0), r.x + r.w * x0 + off, r.y + r.h * fy0, r.w * (x1 - x0), r.h * (fy1 - fy0) + 0.5);
          }
        } else if (e.kind === "rain") {
          g.strokeStyle = e.colour; g.globalAlpha = e.alpha ?? 0.55; g.lineWidth = 1.2;
          const sx = Math.sin(e.angle), cy = Math.cos(e.angle);
          g.beginPath();
          for (const d of s.drops[k]!) { g.moveTo(d.x, d.y); g.lineTo(d.x + sx * d.len, d.y + cy * d.len); }
          g.stroke(); g.globalAlpha = 1;
        } else if (e.kind === "mist") {
          const c = hex(e.colour);
          for (const [i, fy] of e.bands.entries()) {
            const [, y] = toScreen(0.5, fy), x = ((s.t * (e.speed ?? 8) * (i % 2 ? 1 : -0.7) + i * 400) % (W * 1.6)) - W * 0.3;
            const gr = g.createRadialGradient(x, y, 0, x, y, W * 0.4);
            gr.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${e.alpha ?? 0.35})`); gr.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
            g.save(); g.translate(x, y); g.scale(1, 0.18); g.translate(-x, -y);
            g.fillStyle = gr; g.fillRect(x - W * 0.4, y - W * 0.4, W * 0.8, W * 0.8); g.restore();
          }
        } else if (e.kind === "birds") {
          g.strokeStyle = e.colour; g.lineWidth = 1.6;
          for (const bd of s.birds[k]!) { const f = Math.sin(bd.phase) * 4; g.beginPath(); g.moveTo(bd.x - 7, bd.y - f); g.quadraticCurveTo(bd.x - 3, bd.y - 2, bd.x, bd.y); g.quadraticCurveTo(bd.x + 3, bd.y - 2, bd.x + 7, bd.y - f); g.stroke(); }
        } else if (e.kind === "fall") {
          for (const f of s.flakes[k]!) { g.fillStyle = f.c; g.beginPath(); g.ellipse(f.x, f.y, f.r, f.r * (0.5 + 0.5 * Math.abs(Math.sin(f.spin))), f.spin, 0, TAU); g.fill(); }
        }
      });
    },

    light(s, g, w) {
      if (!s.built) return;
      const { toScreen, rect } = view(s, w.size.w, w.size.h);
      for (const e of m.effects) {
        if (e.kind !== "glow") continue;
        const [x, y] = toScreen(e.at[0], e.at[1]), r0 = rect(zOf(e.at[0], e.at[1])), r = e.radius * Math.min(r0.w, r0.h);
        const a = e.alpha * (1 + (e.pulse ?? 0) * Math.sin(s.t * 1.7));
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, `rgba(${e.colour[0]},${e.colour[1]},${e.colour[2]},${a})`); gr.addColorStop(1, `rgba(${e.colour[0]},${e.colour[1]},${e.colour[2]},0)`);
        g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    },
  });
}
