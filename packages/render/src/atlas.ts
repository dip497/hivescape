/**
 * The characters a renderer draws, rasterised once into one texture: white on transparent, a
 * fixed-size slot each. It grows as a scene asks for new characters (an overlay's spark, a star),
 * and is rebuilt only then, or when the cell size or pixel ratio changes.
 */
import { ctx2d, offscreen, type AnyCanvas } from "./surface.js";

/**
 * Line characters the atlas draws itself, edge to edge of the cell, so that neighbours join into
 * one unbroken line as a terminal's box drawing does (a font's `-` and `|` stop short of the cell).
 */
export const JOINED = { across: "\u2500", down: "\u2502", up: "\u2571", fall: "\u2572" } as const;

export const ATLAS_COLS = 16;
export const ATLAS_ROWS = 8;
const CAPACITY = ATLAS_COLS * ATLAS_ROWS;

export class Atlas {
  canvas: AnyCanvas;
  /** One slot's size in device pixels. */
  slotW = 1;
  slotH = 1;
  private index = new Map<string, number>();
  private chars: string[] = [];
  /** Bumped whenever the pixels change, so a GPU copy knows to upload again. */
  version = 0;

  constructor(private family: string) { this.canvas = offscreen(1, 1); }

  /** Lay out for cells of `cw x ch` CSS pixels at `dpr`, characters `scale` of the cell's height. */
  configure(cw: number, ch: number, dpr: number, scale: number): void {
    const slotW = Math.ceil(cw * dpr * 2), slotH = Math.ceil(ch * dpr * 2);
    if (slotW === this.slotW && slotH === this.slotH && this.scale === scale) return;
    this.slotW = slotW; this.slotH = slotH; this.scale = scale;
    this.redraw();
  }
  private scale = 0.6;

  /** The slot of `ch`, adding it if there is room (a full atlas answers slot 0, a blank). */
  slot(ch: string): number {
    const known = this.index.get(ch);
    if (known !== undefined) return known;
    if (this.chars.length >= CAPACITY) return 0;
    if (!this.chars.length) { this.chars.push(" "); this.index.set(" ", 0); }
    const i = this.chars.length;
    this.chars.push(ch); this.index.set(ch, i);
    this.redraw();
    return i;
  }

  /** Slots for every character of `s`, in order. */
  slots(s: string): number[] { return [...s].map((c) => this.slot(c)); }

  private redraw(): void {
    const w = this.slotW * ATLAS_COLS, h = this.slotH * ATLAS_ROWS;
    if (this.canvas.width !== w || this.canvas.height !== h) this.canvas = offscreen(w, h);
    const g = ctx2d(this.canvas);
    g.clearRect(0, 0, w, h);
    g.fillStyle = "#fff";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `600 ${Math.round(this.slotH * this.scale)}px "${this.family}", ui-monospace, monospace`;
    // A joined line is as thick as a stroke of the font, about a ninth of the cell's height.
    const t = Math.max(1, this.slotH * this.scale * 0.11);
    g.strokeStyle = "#fff";
    g.lineWidth = t;
    g.lineCap = "butt";
    this.chars.forEach((c, i) => {
      const x = (i % ATLAS_COLS) * this.slotW, y = Math.floor(i / ATLAS_COLS) * this.slotH, W = this.slotW, H = this.slotH;
      if (c === JOINED.across) g.fillRect(x, y + (H - t) / 2, W, t);
      else if (c === JOINED.down) g.fillRect(x + (W - t) / 2, y, t, H);
      else if (c === JOINED.up || c === JOINED.fall) {
        g.save(); g.beginPath(); g.rect(x, y, W, H); g.clip(); g.beginPath();
        if (c === JOINED.up) { g.moveTo(x, y + H); g.lineTo(x + W, y); } else { g.moveTo(x, y); g.lineTo(x + W, y + H); }
        g.stroke(); g.restore();
      } else g.fillText(c, x + W / 2, y + H / 2 + H * 0.04);
    });
    this.version++;
  }
}
