/**
 * The views a scene can take. The renderer draws whatever a scene paints, so a view is only how the
 * scene turns its own world (ground tiles and heights, layers at a distance) into the picture's CSS
 * pixels, and the pointer's pixels back. Top-down needs nothing; these are the other two.
 */

export interface Point { x: number; y: number }

/** An isometric view: ground `x, y` and height `z`, in tiles, to the screen and back. */
export interface Iso {
  /** A ground tile's width on screen, CSS pixels. */
  readonly tile: number;
  /** Where ground `x, y` and height `z` show. */
  toScreen(x: number, y: number, z?: number): Point;
  /** The ground point (at height `z`) under a screen point: for the pointer and clicks. */
  toGround(sx: number, sy: number, z?: number): Point;
  /** Painter's order: draw in ascending order, so nearer things cover farther ones. */
  depth(x: number, y: number, z?: number): number;
}

export interface IsoOptions {
  /** A ground tile's width on screen, CSS pixels. */
  tile: number;
  /** A tile's height over its width on screen: 0.5 (default) is the 2:1 of pixel art, 0.577 true isometric. */
  ratio?: number;
  /** Where ground 0, 0 sits on screen. */
  origin?: Point;
  /** Screen pixels one unit of height lifts a point (default: a tile's height on screen). */
  rise?: number;
}

export function isometric(o: IsoOptions): Iso {
  const hw = o.tile / 2, hh = (o.tile * (o.ratio ?? 0.5)) / 2;
  const ox = o.origin?.x ?? 0, oy = o.origin?.y ?? 0, rise = o.rise ?? hh * 2;
  return {
    tile: o.tile,
    toScreen: (x, y, z = 0) => ({ x: ox + (x - y) * hw, y: oy + (x + y) * hh - z * rise }),
    toGround: (sx, sy, z = 0) => {
      const u = (sx - ox) / hw, v = (sy - oy + z * rise) / hh;
      return { x: (u + v) / 2, y: (v - u) / 2 };
    },
    depth: (x, y, z = 0) => x + y + z * 1e-3,
  };
}

/**
 * A side view in layers. A layer at `depth` 0 is at the horizon and never moves; at 1 it moves with
 * the camera, one for one; nearer than that (above 1) it passes faster, as a foreground does.
 * Returns the shift to add to the layer's own coordinates for a camera at `camera`.
 */
export const parallax = (camera: Point, depth: number): Point => ({ x: -camera.x * depth, y: -camera.y * depth });

/** A layer's scale in a side view, its things shrinking toward the horizon: `near` at depth 1, `far` at 0. */
export const layerScale = (depth: number, far = 0.35, near = 1): number => far + (near - far) * Math.min(Math.max(depth, 0), 1.5);
