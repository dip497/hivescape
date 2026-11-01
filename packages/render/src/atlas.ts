/**
 * The characters a renderer draws, rasterised once into one texture: white on transparent, a
 * fixed-size slot each. It grows as a scene asks for new characters (an overlay's spark, a star),
 * and is rebuilt only then, or when the cell size or pixel ratio changes.
 */
import { ctx2d, offscreen, type AnyCanvas } from "./surface.js";

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
    this.chars.forEach((c, i) => {
      const x = (i % ATLAS_COLS) * this.slotW, y = Math.floor(i / ATLAS_COLS) * this.slotH;
      g.fillText(c, x + this.slotW / 2, y + this.slotH / 2 + this.slotH * 0.04);
    });
    this.version++;
  }
}
