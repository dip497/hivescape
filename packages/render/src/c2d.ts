/**
 * The CPU path, for machines whose WebGL runs in software (VMs, some Linux setups) and anything
 * without WebGL2. The 2D canvas is slow per shape, so it draws as few as it can. It reads the
 * picture and the lights back and averages them into cells (`averageCells`), lights each cell flat
 * (one colour, by the same rules as the GPU) into an image of one pixel a cell, then scales that up
 * in one draw and cuts it into cells with a mask, and lays the cells' bevel over them, both drawn
 * once per size. Five full-layer draws a frame, whatever the cell count; no cast shadows. The layer
 * is kept at one device pixel per CSS pixel: the CSS scales it on a denser screen. Characters (the
 * ascii style's and the overlay's) are stamped one by one from a tinted copy of their own slot; a
 * body's cut character is one black copy at a fixed strength, so it needs no tint per colour.
 */
import { clamp, smoothstep } from "@hivescape/core";
import { ATLAS_COLS, type Atlas } from "./atlas.js";
import type { Backend } from "./backend.js";
import { cellHash, cellSize, KEY, lightness, ringAt, type FrameInput } from "./frame.js";
import { CUT, bodyGlyph, edgeGlyph } from "./ascii.js";
import { averageCells, cellShapes } from "./kernel.js";
import { ctx2d, LS, offscreen, SS, type AnyCanvas, type Ctx2D, type Grid } from "./surface.js";

/** Characters tinted one colour each, one slot a copy, colours rounded to 5 bits a channel. */
class Tints {
  private cache = new Map<number, AnyCanvas>();
  private version = -1;
  constructor(private cap = 2048) {}
  get(atlas: Atlas, slot: number, r: number, g: number, b: number): AnyCanvas {
    if (atlas.version !== this.version) { this.cache.clear(); this.version = atlas.version; }
    const key = slot * 32768 + (((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
    let c = this.cache.get(key);
    if (!c) {
      const sw = atlas.slotW, sh = atlas.slotH;
      c = offscreen(sw, sh);
      const t = ctx2d(c);
      t.drawImage(atlas.canvas as CanvasImageSource, (slot % ATLAS_COLS) * sw, Math.floor(slot / ATLAS_COLS) * sh, sw, sh, 0, 0, sw, sh);
      t.globalCompositeOperation = "source-in";
      t.fillStyle = `rgb(${(r >> 3) << 3},${(g >> 3) << 3},${(b >> 3) << 3})`;
      t.fillRect(0, 0, sw, sh);
      if (this.cache.size >= this.cap) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, c);
    }
    return c;
  }
}

/** A pointy-topped hexagon of apothem 1 around the origin. */
function hexPath(): Path2D {
  const p = new Path2D(), r = 2 / Math.sqrt(3);
  for (let k = 0; k < 6; k++) {
    const t = Math.PI / 2 + (k * Math.PI) / 3;
    if (k) p.lineTo(Math.cos(t) * r, Math.sin(t) * r); else p.moveTo(Math.cos(t) * r, Math.sin(t) * r);
  }
  p.closePath();
  return p;
}

/** Where cell `i, j` sits, CSS pixels. */
const centreOf = (g: Grid, i: number, j: number): [number, number] => [(i + 0.5 - (g.hex && j & 1 ? 0.5 : 0)) * g.cw, (j + 0.5) * g.ch];

export class Canvas2DBackend implements Backend {
  readonly kind = "canvas2d" as const;
  readonly readsPicture = true;
  private g: Ctx2D;
  private cells = new Float32Array(0);
  private lights = new Float32Array(0);
  private shapesOut = new Float32Array(0);
  private tints = new Tints();
  /** One pixel a cell (two a cell across for a comb, so odd rows can sit half a cell over). */
  private tiny: AnyCanvas = offscreen(1, 1);
  private tinyImg: ImageData | null = null;
  /** The cells composed, before they go onto the layer. */
  private scratch: AnyCanvas = offscreen(1, 1);
  /** Every cell's shape (white) and its bevel, drawn once per grid. */
  private mask: AnyCanvas | null = null;
  private relief: AnyCanvas | null = null;
  private shapesKey = "";
  private dpr = 1;
  private w = 1;
  private h = 1;

  constructor(private canvas: AnyCanvas) { this.g = ctx2d(canvas); }

  resize(w: number, h: number, dpr: number): void {
    this.w = w; this.h = h; this.dpr = Math.min(dpr, 1);
    this.canvas.width = Math.max(1, Math.round(w * this.dpr));
    this.canvas.height = Math.max(1, Math.round(h * this.dpr));
  }

  /** The bevel of one cell, lit by the key light (the GPU's normal and light), as white and black on transparent. */
  private bevel(hx: number, hy: number, hex: boolean, relief: number, gloss: number): AnyCanvas {
    const s = this.dpr, W = Math.ceil(hx * 2 * s), H = Math.ceil(hy * 2 * s);
    const c = offscreen(W, H), g = ctx2d(c), img = g.createImageData(W, H), d = img.data;
    const sd = (x: number, y: number) => {
      const ax = Math.abs(x), ay = Math.abs(y);
      return hex ? Math.max(ax - hx, ax * 0.5 + ay * 0.8660254 - hx) : Math.max(ax - hx, ay - hy);
    };
    const bw = Math.max(Math.min(hx, hy) * 0.5, 1.2), rise = relief * Math.min(hx, hy) * 0.9;
    const hz = Math.hypot(KEY[0], KEY[1], KEY[2] + 1);
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const x = (px + 0.5) / s - hx, y = (py + 0.5) / s - hy, dd = sd(x, y);
      if (dd > 0) continue;
      let gx = sd(x + 0.5, y) - sd(x - 0.5, y), gy = sd(x, y + 0.5) - sd(x, y - 0.5);
      const gl = Math.hypot(gx, gy) || 1; gx /= gl; gy /= gl;
      const t = clamp(-dd / bw), k = (2 * (1 - t) * rise) / bw;
      let nx = gx * k + (x / hy) * 0.16 * relief, ny = gy * k + (y / hy) * 0.16 * relief, nz = 1;
      const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
      const lift = (nx * KEY[0] + ny * KEY[1] + nz * KEY[2] - KEY[2]) * 1.3;
      const spec = Math.max(0, (nx * KEY[0] + ny * KEY[1] + nz * (KEY[2] + 1)) / hz) ** 36 * gloss * 0.6;
      const o = (py * W + px) * 4;
      if (lift + spec >= 0) { d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = Math.min(255, (lift * 0.5 + spec) * 255); }
      else { d[o] = d[o + 1] = d[o + 2] = 0; d[o + 3] = Math.min(255, -lift * 255); }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /** Draw every cell's shape into the mask and its bevel into the relief, when the grid or style changed. */
  private shapes(grid: Grid, f: FrameInput): void {
    const { style } = f, { cols, rows, cw, ch, hex } = grid;
    const key = `${cols},${rows},${cw},${ch},${hex},${style.gap},${style.radius},${style.relief},${style.gloss},${this.dpr},${this.canvas.width},${this.canvas.height}`;
    if (key === this.shapesKey) return;
    this.shapesKey = key;
    const W = this.canvas.width, H = this.canvas.height, s = this.dpr;
    const ap = Math.max((cw - style.gap) / 2, 0.5);
    const hx = hex ? ap : Math.max((cw - style.gap) / 2, 0.5), hy = hex ? ap * 1.1547 : Math.max((ch - style.gap) / 2, 0.5);
    this.mask = offscreen(W, H);
    const m = ctx2d(this.mask), path = hexPath();
    m.fillStyle = "#fff";
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const [x, y] = centreOf(grid, i, j);
      if (hex) { m.setTransform(s * ap, 0, 0, s * ap, x * s, y * s); m.fill(path); }
      else m.fillRect((x - hx) * s, (y - hy) * s, hx * 2 * s, hy * 2 * s);
    }
    this.relief = null;
    if (style.relief > 0) {
      const b = this.bevel(hx, hy, hex, style.relief, style.gloss);
      this.relief = offscreen(W, H);
      const r = ctx2d(this.relief);
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const [x, y] = centreOf(grid, i, j);
        r.drawImage(b as CanvasImageSource, (x - hx) * s, (y - hy) * s, hx * 2 * s, hy * 2 * s);
      }
    }
  }

  draw(f: FrameInput, atlas: Atlas): void {
    const { grid, style, pointer } = f;
    const { cols, rows, cw, ch, hex } = grid;
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // The scene's lights: one value a cell, and their glow over the ground.
    let L: Float32Array | null = null;
    if (f.light) {
      const lpx = ctx2d(f.light, { willReadFrequently: true }).getImageData(0, 0, cols * LS, rows * LS).data;
      if (this.lights.length !== cols * rows * 4) this.lights = new Float32Array(cols * rows * 4);
      averageCells(lpx, cols, rows, LS, this.lights, hex);
      L = this.lights;
      if (style.glow > 0) {
        g.save();
        g.globalCompositeOperation = "lighter";
        g.globalAlpha = Math.min(1, style.glow);
        g.imageSmoothingEnabled = true;
        g.drawImage(f.light as CanvasImageSource, 0, 0, cols * cw, rows * ch);
        g.restore();
      }
    }

    if (style.kind === "native") {
      g.drawImage(f.picture as CanvasImageSource, 0, 0, this.w, this.h);
      this.drawOverlay(f, atlas);
      return;
    }

    const px = ctx2d(f.picture, { willReadFrequently: true }).getImageData(0, 0, cols * SS, rows * SS).data;
    if (this.cells.length !== cols * rows * 4) this.cells = new Float32Array(cols * rows * 4);
    averageCells(px, cols, rows, SS, this.cells, hex);
    const C = this.cells, amb = style.ambient, key = style.key;
    const torch = style.torch > 0 && pointer.active ? style.torch : 0;
    const ascii = style.kind === "ascii";
    const tick = Math.floor(f.time * style.flicker);
    const TW = hex ? cols * 2 + 1 : cols;
    if (this.tiny.width !== TW || this.tiny.height !== rows || !this.tinyImg) {
      this.tiny = offscreen(TW, rows);
      this.tinyImg = ctx2d(this.tiny).createImageData(TW, rows);
    }
    this.tinyImg.data.fill(0);
    const T = this.tinyImg.data;
    // ascii: each cell read as a shape; its characters drawn after the blocks, cut first, edges after.
    if (ascii) {
      if (this.shapesOut.length !== cols * rows * 6) this.shapesOut = new Float32Array(cols * rows * 6);
      cellShapes(px, cols, rows, SS, cw, ch, this.shapesOut);
    }
    const S = this.shapesOut, cuts: number[] = [], edges: number[] = [];

    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const o = (j * cols + i) * 4, a = C[o + 3]!;
        const size = cellSize(a, style.soft, style.threshold);
        if (size <= 0) continue;
        const [x, y] = centreOf(grid, i, j);
        const ring = f.ripples.length ? ringAt(x, y, f.ripples, f.time) : 0;
        const r0 = C[o]!, g0 = C[o + 1]!, b0 = C[o + 2]!;
        // Lit flat: the key light's share, the scene's light here, the torch, and a ripple's lift.
        let lr = (amb + ring * 0.3) * 255, lg = lr, lb = lr, em = 0;
        if (L) {
          lr += L[o]! * 1.7; lg += L[o + 1]! * 1.7; lb += L[o + 2]! * 1.7;
          em = smoothstep(0.78, 1.0, lightness(L[o]!, L[o + 1]!, L[o + 2]!));
        }
        if (torch) {
          const dx = pointer.x - x, dy = pointer.y - y;
          const att = Math.max(0, 1 - Math.hypot(dx, dy) / torch) ** 2;
          if (att > 0) { const nz = (torch * 0.3) / Math.hypot(dx, dy, torch * 0.3); lr += key[0] * att * nz * 0.6; lg += key[1] * att * nz * 0.6; lb += key[2] * att * nz * 0.6; }
        }
        let r = (r0 * lr) / 255, gg = (g0 * lg) / 255, b = (b0 * lb) / 255;
        if (em > 0 && L) { r += (r0 * 1.12 + L[o]! * 0.35 - r) * em; gg += (g0 * 1.12 + L[o + 1]! * 0.35 - gg) * em; b += (b0 * 1.12 + L[o + 2]! * 0.35 - b) * em; }
        r = Math.min(255, r); gg = Math.min(255, gg); b = Math.min(255, b);
        if (ascii) {
          const lift = -ring * ch * 0.4;
          if (a < style.threshold) {
            const q = (j * cols + i) * 6;
            const e = edgeGlyph({ cov: S[q]!, cx: S[q + 1]!, cy: S[q + 2]!, aniso: S[q + 3]!, angle: S[q + 4]!, len: S[q + 5]! });
            const k = f.look.dark ? 0.12 : -0.15;
            edges.push(f.edges[e]!, x, y + lift, k > 0 ? r + (255 - r) * k : r * (1 + k), k > 0 ? gg + (255 - gg) * k : gg * (1 + k), k > 0 ? b + (255 - b) * k : b * (1 + k), Math.min(1, 0.5 + a));
            continue;
          }
          const flick = style.flicker > 0 ? (cellHash(i, j, tick) - 0.5) * 0.12 : 0;
          cuts.push(f.ramp[bodyGlyph(clamp(lightness(r, gg, b) + flick), f.ramp.length, cellHash(i, j, 0) - 0.5)]!, x, y + lift);
        }
        // A partly covered cell shows fainter where the GPU shows it smaller: the same area of colour.
        const alpha = ascii ? 255 : Math.round(Math.min(1, size * size) * (style.kind === "pixel" && a < style.threshold ? a : 1) * 255);
        const p0 = hex ? i * 2 + (j & 1 ? 0 : 1) : i;
        for (let k = 0; k < (hex ? 2 : 1); k++) {
          const q = (j * TW + p0 + k) * 4;
          T![q] = r; T![q + 1] = gg; T![q + 2] = b; T![q + 3] = alpha;
        }
      }
    }
    g.globalAlpha = 1;

    {
      this.shapes(grid, f);
      ctx2d(this.tiny).putImageData(this.tinyImg!, 0, 0);
      if (this.scratch.width !== this.canvas.width || this.scratch.height !== this.canvas.height) this.scratch = offscreen(this.canvas.width, this.canvas.height);
      const sg = ctx2d(this.scratch), s = this.dpr;
      sg.globalCompositeOperation = "source-over";
      sg.clearRect(0, 0, this.scratch.width, this.scratch.height);
      sg.imageSmoothingEnabled = false;
      sg.drawImage(this.tiny as CanvasImageSource, hex ? (-cw / 2) * s : 0, 0, TW * (hex ? cw / 2 : cw) * s, rows * ch * s);
      sg.globalCompositeOperation = "destination-in";
      sg.drawImage(this.mask as CanvasImageSource, 0, 0);
      if (this.relief) { sg.globalCompositeOperation = "source-atop"; sg.drawImage(this.relief as CanvasImageSource, 0, 0); }
      sg.globalCompositeOperation = "source-over";
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(this.scratch as CanvasImageSource, 0, 0);
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
    if (ascii) {
      // A body's character is cut into its block: black at the share that leaves CUT of its colour.
      const sw = atlas.slotW, sh = atlas.slotH;
      g.globalAlpha = 0.92 * (1 - (f.look.dark ? CUT.dark : CUT.light));
      for (let n = 0; n < cuts.length; n += 3) g.drawImage(this.tints.get(atlas, cuts[n]!, 0, 0, 0) as CanvasImageSource, cuts[n + 1]! - cw / 2, cuts[n + 2]! - ch / 2, cw, ch);
      for (let n = 0; n < edges.length; n += 7) {
        g.globalAlpha = edges[n + 6]!;
        g.drawImage(this.tints.get(atlas, edges[n]!, edges[n + 3]! | 0, edges[n + 4]! | 0, edges[n + 5]! | 0) as CanvasImageSource, edges[n + 1]! - cw / 2, edges[n + 2]! - ch / 2, cw, ch);
      }
      g.globalAlpha = 1;
      void sw; void sh;
    }
    this.drawOverlay(f, atlas);
  }

  private drawOverlay(f: FrameInput, atlas: Atlas): void {
    const g = this.g, ov = f.overlay, { cw, ch } = f.grid;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    for (let n = 0; n < ov.n; n++) {
      const slot = ov.slot[n]!, s = ov.scale[n]!, a = ov.rgba[n * 4 + 3]!;
      const r = (ov.rgba[n * 4]! * 255) | 0, gg = (ov.rgba[n * 4 + 1]! * 255) | 0, b = (ov.rgba[n * 4 + 2]! * 255) | 0;
      if (slot < 0) {
        const soft = -slot - 1;
        if (soft > 0) {
          g.fillStyle = `rgba(${r},${gg},${b},${a * 0.22})`;
          g.beginPath(); g.arc(ov.x[n]!, ov.y[n]!, s * (1 + soft * 0.6), 0, Math.PI * 2); g.fill();
        }
        g.fillStyle = `rgba(${r},${gg},${b},${a})`;
        g.beginPath(); g.arc(ov.x[n]!, ov.y[n]!, s, 0, Math.PI * 2); g.fill();
        continue;
      }
      const w = cw * s, h = ch * s;
      g.globalAlpha = a;
      g.drawImage(this.tints.get(atlas, slot, r, gg, b) as CanvasImageSource, ov.x[n]! - w / 2, ov.y[n]! - h / 2, w, h);
    }
    g.globalAlpha = 1;
  }

  destroy(): void {}
}
