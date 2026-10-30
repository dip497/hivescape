import type { Atlas } from "./atlas.js";
import type { FrameInput } from "./frame.js";

/** Draws the cells (and the overlay) of one frame onto the cells layer. */
export interface Backend {
  readonly kind: "webgl2" | "canvas2d";
  /** Size the layer: `w x h` CSS pixels at `dpr`. */
  resize(w: number, h: number, dpr: number): void;
  draw(f: FrameInput, atlas: Atlas): void;
  /** Does the picture need to be readable from the CPU (2D sampling) rather than uploaded? */
  readonly readsPicture: boolean;
  destroy(): void;
}

export type BackendChoice = "auto" | "webgl2" | "canvas2d";
