/**
 * The renderer: two layers (the backdrop, drawn rarely, and the cells, drawn every frame), the
 * scene's picture and lights between them, and a backend chosen for the machine. It asks the scene
 * for its backdrop only when the size or look changed (or at `backdropRate`), for its picture and
 * lights every frame, and keeps its own time for each, so a calm scene costs a calm amount.
 */
import type { Look, Overlay, Rgb, Scene, Size, StyleSpec, World } from "@hivescape/core";
import { ASCII_EDGES, INK_EDGES, INK_SX, INK_SY, inkGlyphs, measureShape, type InkGlyphs } from "./ascii.js";
import { Atlas, ATLAS_COLS } from "./atlas.js";
import type { Backend, BackendChoice } from "./backend.js";
import { Canvas2DBackend } from "./c2d.js";
import { inkColourInto, inkStrokeAlpha, OverlayBatch } from "./frame.js";
import { GLBackend, probeGL } from "./gl.js";
import { ctx2d, gridFor, loadFont, LS, offscreen, SS, type AnyCanvas, type Ctx2D, type Grid } from "./surface.js";

export interface Layers {
  /** Under the cells: the scene's ground, at full resolution. */
  backdrop: AnyCanvas;
  /** The cells and the overlay. Takes a WebGL2 or a 2D context, whichever the machine is good at. */
  cells: AnyCanvas;
  /** Over the cells: the scene's `front`, at full resolution. Optional. */
  front?: AnyCanvas;
}

export interface RendererOptions {
  /** `auto` (default) takes WebGL2 when it runs on a GPU, else the 2D canvas. */
  backend?: BackendChoice;
}

export interface FrameStats {
  /** Milliseconds of script in the last frame (picture, backdrop if drawn, and the backend's draw call). */
  ms: number;
  backdropDrawn: boolean;
}

export class Renderer {
  readonly backend: Backend;
  private atlas: Atlas;
  private picture: AnyCanvas;
  private pg: Ctx2D;
  private bg: Ctx2D;
  private fg: Ctx2D | null;
  private frontDrawn = false;
  private light: AnyCanvas;
  private lg: Ctx2D;
  private overlay = new OverlayBatch();
  private grid: Grid = { cols: 1, rows: 1, cw: 1, ch: 1, hex: false };
  private size: Size = { w: 1, h: 1, dpr: 1 };
  private style!: StyleSpec;
  private ramp: number[] = [];
  private edges: number[] = [];
  /** The picture's samples per cell, across and down (ink reads 4 x 6, every other style SS x SS). */
  private sx = SS;
  private sy = SS;
  /** ink: its characters, measured out of the atlas, and the atlas version they were measured at. */
  private ink: InkGlyphs | null = null;
  private inkAt = -1;
  private backdropAt = -Infinity;
  private backdropDirty = true;
  readonly stats: FrameStats = { ms: 0, backdropDrawn: false };
  private overlayApi: Overlay;
  /** The look the overlay is being drawn for (ink's strokes are tinted for it), and a colour reused. */
  private dark = true;
  private tint = [0, 0, 0];

  private constructor(private layers: Layers, backend: Backend, family: string) {
    this.backend = backend;
    this.atlas = new Atlas(family);
    this.picture = offscreen(1, 1);
    this.pg = ctx2d(this.picture, backend.readsPicture ? { willReadFrequently: true } : undefined);
    this.bg = ctx2d(layers.backdrop);
    this.fg = layers.front ? ctx2d(layers.front) : null;
    this.light = offscreen(1, 1);
    this.lg = ctx2d(this.light, backend.readsPicture ? { willReadFrequently: true } : undefined);
    this.overlayApi = {
      glyph: (x: number, y: number, ch: string, c: Rgb, alpha = 1, scale = 1) => this.overlay.push(x, y, this.atlas.slot(ch), c[0], c[1], c[2], alpha, scale),
      dot: (x: number, y: number, r: number, c: Rgb, alpha = 1, soft = 0) => this.overlay.push(x, y, -(1 + Math.max(0, soft)), c[0], c[1], c[2], alpha, r),
      stroke: (x0: number, y0: number, x1: number, y1: number, c: Rgb, alpha = 1, width = 1.4) => {
        let r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
        // In ink a stroke shows as a character would: lifted (deepened) as a character's colour is,
        // and as faint as its colour is dark (pale, on a light page).
        if (this.style?.kind === "ink") {
          alpha *= inkStrokeAlpha(r, g, b, this.dark);
          inkColourInto(this.tint, r, g, b, this.dark);
          r = this.tint[0]!; g = this.tint[1]!; b = this.tint[2]!;
        }
        if (alpha > 0.01) this.overlay.pushStroke(x0, y0, x1, y1, r, g, b, Math.min(1, alpha), width);
      },
    };
  }

  /** Load the font and pick a backend: WebGL2 on a GPU, else (or if asked) the 2D canvas. */
  static async create(layers: Layers, opts: RendererOptions = {}): Promise<Renderer> {
    const family = await loadFont();
    const want = opts.backend ?? "auto";
    let backend: Backend | null = null;
    // Asked on a throwaway canvas first: a canvas that once asked for WebGL can't give a 2D context after.
    if (want !== "canvas2d" && probeGL(() => offscreen(1, 1), want === "webgl2")) {
      try { backend = new GLBackend(layers.cells, { allowSoftware: want === "webgl2" }); }
      catch (e) { if (want === "webgl2") throw e; }
    }
    return new Renderer(layers, backend ?? new Canvas2DBackend(layers.cells), family);
  }

  /** The size, look or style changed: lay the grid out again and draw the backdrop at the next frame. */
  configure(size: Size, style: StyleSpec): void {
    this.size = size;
    this.style = style;
    this.grid = gridFor(size, style);
    // A native picture is drawn at the screen's resolution; any other is sampled into cells.
    const native = style.kind === "native";
    this.sx = style.kind === "ink" ? INK_SX : SS;
    this.sy = style.kind === "ink" ? INK_SY : SS;
    const pw = native ? Math.max(1, Math.round(size.w * size.dpr)) : this.grid.cols * this.sx;
    const ph = native ? Math.max(1, Math.round(size.h * size.dpr)) : this.grid.rows * this.sy;
    if (this.picture.width !== pw || this.picture.height !== ph) { this.picture.width = pw; this.picture.height = ph; }
    const lw = this.grid.cols * LS, lh = this.grid.rows * LS;
    if (this.light.width !== lw || this.light.height !== lh) { this.light.width = lw; this.light.height = lh; }
    const bw = Math.max(1, Math.round(size.w * size.dpr)), bh = Math.max(1, Math.round(size.h * size.dpr));
    for (const c of [this.layers.backdrop, this.layers.front]) {
      if (!c) continue;
      if (c.width !== bw) c.width = bw;
      if (c.height !== bh) c.height = bh;
    }
    this.backend.resize(size.w, size.h, size.dpr);
    this.atlas.configure(this.grid.cw, this.grid.ch, size.dpr, style.kind === "ascii" ? 0.82 : style.kind === "ink" ? 0.95 : 0.6);
    this.ramp = this.atlas.slots(style.ramp || " ");
    this.edges = this.atlas.slots(style.kind === "ink" ? INK_EDGES : ASCII_EDGES);
    this.inkAt = -1;
    this.backdropDirty = true;
  }

  /** The backdrop changed for a reason the renderer can't see (the look): draw it at the next frame. */
  invalidateBackdrop(): void { this.backdropDirty = true; }

  get cells(): Grid { return this.grid; }

  /** ink's characters, measured once per atlas version (a new character elsewhere redraws the atlas, the same shapes). */
  private inkGlyphs(): InkGlyphs | null {
    const a = this.atlas;
    if (this.style.kind !== "ink") return null;
    if (a.version === this.inkAt && this.ink) return this.ink;
    const W = a.canvas.width, d = ctx2d(a.canvas).getImageData(0, 0, W, a.canvas.height).data;
    const measure = (slot: number) => ({ slot, cover: measureShape(d, W, (slot % ATLAS_COLS) * a.slotW, Math.floor(slot / ATLAS_COLS) * a.slotH, a.slotW, a.slotH) });
    this.ink = inkGlyphs([...new Set(this.ramp)].map(measure), this.edges.map(measure));
    this.inkAt = a.version;
    return this.ink;
  }

  frame<S>(scene: Scene<S>, state: S, world: World): void {
    const t0 = performance.now();
    const { w, h, dpr } = this.size;
    this.stats.backdropDrawn = false;
    const rate = scene.backdropRate ?? 0;
    if (this.backdropDirty || (rate > 0 && world.time - this.backdropAt >= 1 / rate)) {
      const g = this.bg;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, this.layers.backdrop.width, this.layers.backdrop.height);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      scene.backdrop(state, g, world);
      this.backdropAt = world.time;
      this.backdropDirty = false;
      this.stats.backdropDrawn = true;
    }
    const pg = this.pg, { cw, ch } = this.grid;
    pg.setTransform(1, 0, 0, 1, 0, 0);
    pg.clearRect(0, 0, this.picture.width, this.picture.height);
    if (this.style.kind === "ink") {
      // ink draws the whole frame in characters: the backdrop is sampled too, under the picture.
      pg.drawImage(this.layers.backdrop as CanvasImageSource, 0, 0, this.layers.backdrop.width, this.layers.backdrop.height, 0, 0, (w / cw) * this.sx, (h / ch) * this.sy);
    }
    if (this.style.kind === "native") pg.setTransform(dpr, 0, 0, dpr, 0, 0);
    else pg.setTransform(this.sx / cw, 0, 0, this.sy / ch, 0, 0);
    scene.picture(state, pg, world);
    let light: AnyCanvas | null = null;
    if (scene.light) {
      const lg = this.lg;
      lg.setTransform(1, 0, 0, 1, 0, 0);
      lg.globalCompositeOperation = "source-over";
      lg.fillStyle = "#000";
      lg.fillRect(0, 0, this.light.width, this.light.height);
      lg.globalCompositeOperation = "lighter";
      lg.setTransform(LS / cw, 0, 0, LS / ch, 0, 0);
      scene.light(state, lg, world);
      lg.globalCompositeOperation = "source-over";
      light = this.light;
    }
    this.overlay.clear();
    this.dark = world.look.dark;
    scene.overlay?.(state, this.overlayApi, world);
    const fg = this.fg;
    if (fg && (scene.front || this.frontDrawn)) {
      fg.setTransform(1, 0, 0, 1, 0, 0);
      fg.clearRect(0, 0, fg.canvas.width, fg.canvas.height);
      fg.setTransform(dpr, 0, 0, dpr, 0, 0);
      scene.front?.(state, fg, world);
      this.frontDrawn = !!scene.front;
    }
    const p = world.input.pointer;
    this.backend.draw({
      picture: this.picture, grid: this.grid, style: this.style, look: world.look, time: world.time,
      pointer: { x: p.x, y: p.y, active: p.active }, ripples: world.effects.ripples, ramp: this.ramp, edges: this.edges, ink: this.inkGlyphs(), overlay: this.overlay, light,
    }, this.atlas);
    this.stats.ms = performance.now() - t0;
    void w; void h;
  }

  destroy(): void { this.backend.destroy(); }
}

export type { Look };
