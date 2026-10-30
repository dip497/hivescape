/**
 * The contract a scene keeps. A scene says what is there and how it moves; it never says how it is
 * shown. It paints a backdrop (the ground, drawn rarely), a picture (its subjects, in plain canvas
 * calls, sampled into cells by the renderer in whatever style is chosen), optionally its lights
 * (which light the cells and glow), and optionally an overlay of exact marks placed by hand. The
 * same scene can then be a lit honeycomb, a glyph field, pixels or a plain illustration, in a page,
 * a worker or a Hivemind wallpaper. Its view is its own: top-down, side-on or isometric (see
 * `project.ts`).
 */
import type { Rgb } from "./colour.js";
import type { Effects } from "./effects.js";
import type { Input } from "./input.js";
import type { Rng } from "./random.js";

/** The colours around the scene: the host's page, its text and its accent, and whether it is dark. */
export interface Look {
  dark: boolean;
  page: Rgb;
  text: Rgb;
  accent: Rgb;
}

export interface Size {
  /** CSS pixels. */
  w: number;
  h: number;
  /** Device pixels per CSS pixel. */
  dpr: number;
}

/**
 * - `comb`: a honeycomb of hexagonal cells in relief, lit by a key light, the scene's own lights and
 *   the pointer's torch. Hivescape's own look, and the default.
 * - `ascii`: character cells, as a terminal draws them. A body is a block of its colour with a
 *   character cut into it; an edge is a light character alone, chosen by where the shape sits in
 *   the cell (`. , _ ' " ( )`); a thin stroke is a line character along its direction (`- | / \`).
 * - `pixel`: square cells, flat or in relief.
 * - `native`: the picture at full resolution, lit and glowing: plain 2D (or 2.5D) illustration.
 */
export type StyleKind = "comb" | "ascii" | "pixel" | "native";

/** How the picture is shown. A scene suggests one; the host (or the person) may choose another. */
export interface StyleSpec {
  kind: StyleKind;
  /** A cell's width and height, CSS pixels. A comb cell's height follows from its width (a regular hexagon). */
  cell: readonly [number, number];
  /** The characters cut into a body's cells, from the brightest skin to the deepest shadow (ascii). */
  ramp: string;
  /** Corner radius of a cell, CSS pixels. */
  radius: number;
  /** Gap between cells, CSS pixels. */
  gap: number;
  /** How far a cell stands up from the ground, 0 (flat) to 1: its bevel, its highlight and its shadow. */
  relief: number;
  /** How glossy a cell's surface is, 0..1: the glint where its bevel faces a light. */
  gloss: number;
  /** A cell at least this covered is whole. */
  threshold: number;
  /** A cell at least this covered shows, smaller the less it is covered: the soft edge of a shape. */
  soft: number;
  /** The colour of the shadow a raised cell casts (away from the key light), or null for none. */
  shadow: Rgb | null;
  shadowAlpha: number;
  /** How much of the key light the picture gets, 0..1: 1 shows its colours as painted, lower leaves the scene's own lights to show it. */
  ambient: number;
  /** The key light's colour (from the upper left). */
  key: Rgb;
  /** The pointer's torch: cells within this many pixels are lit from where it is. 0 turns it off. */
  torch: number;
  /** How strongly the scene's lights glow over the ground, 0..1. */
  glow: number;
  /** How often a body's character changes on its own, per second (ascii; 0 keeps them still). */
  flicker: number;
}

/** Everything a scene may read while it builds, steps and paints. */
export interface World {
  size: Size;
  look: Look;
  style: StyleSpec;
  /** Seconds since the scene began, on its own clock. */
  time: number;
  rng: Rng;
  input: Input;
  effects: Effects;
}

export type Paint = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Exact marks on top of the cells, placed at a point and never sampled: characters and soft dots. */
export interface Overlay {
  glyph(x: number, y: number, ch: string, colour: Rgb, alpha?: number, scale?: number): void;
  /** A round mark `r` CSS pixels across its core, fading to nothing at `r * (1 + soft)`: an ember, a firefly, a star. */
  dot(x: number, y: number, r: number, colour: Rgb, alpha?: number, soft?: number): void;
}

export interface Scene<S = unknown> {
  /** Lowercase letters, digits and dashes. */
  id: string;
  name: string;
  description?: string;
  /** The style it is made for; the rest comes from the style's defaults. */
  style?: Partial<StyleSpec> | ((look: Look) => Partial<StyleSpec>);
  /** Build the world for this size: full from the first frame, nothing waiting to fly in. */
  create(w: World): S;
  /** The window changed size: keep the world, fit it to the new size. Without it, it is built again. */
  resize?(s: S, w: World): void;
  /** Move on `dt` seconds (always the clock's fixed step). Clicks arrive through `click`. */
  step(s: S, dt: number, w: World): void;
  /** A click on the scene, at CSS pixels `x, y`. */
  click?(s: S, x: number, y: number, w: World): void;
  /** The ground, at full resolution. Drawn when the size or look changes, and `backdropRate` times a second if set. */
  backdrop(s: S, g: Paint, w: World): void;
  backdropRate?: number;
  /** The subjects, on a transparent ground, in CSS pixels. The renderer samples it into cells. */
  picture(s: S, g: Paint, w: World): void;
  /**
   * What gives off light, painted additively (`lighter`) in CSS pixels on black: a fire, a lamp, the
   * moon's wash, fireflies. Optional. The renderer lights each cell from the direction its light comes
   * from, lets it glow over the ground, and makes a cell sitting in strong light shine on its own.
   * Painted at two samples a cell, so broad soft shapes (radial gradients) are what it wants.
   */
  light?(s: S, g: Paint, w: World): void;
  overlay?(s: S, o: Overlay, w: World): void;
  /** For a still frame: put everything where it would be after a while (default: 6 s of steps). */
  settle?(s: S, w: World): void;
}

export const defineScene = <S>(scene: Scene<S>): Scene<S> => scene;

export const DARK: Look = { dark: true, page: [18, 18, 20], text: [232, 233, 235], accent: [218, 119, 86] };
export const LIGHT: Look = { dark: false, page: [246, 246, 244], text: [29, 31, 34], accent: [196, 92, 60] };
