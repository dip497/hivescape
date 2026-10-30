/**
 * The styles' defaults, and how a scene's suggestion and a host's choice combine into the one the
 * renderer uses. Data only: the renderers live in @hivescape/render.
 */
import type { Look, StyleKind, StyleSpec } from "./scene.js";

/** A regular hexagon's row step over its width: rows of pointy-top cells sit this far apart. */
export const COMB_ROW = Math.sqrt(3) / 2;

const BASE = {
  ramp: "",
  radius: 0,
  gap: 0,
  relief: 0,
  gloss: 0,
  threshold: 0.5,
  soft: 0.12,
  shadow: null,
  shadowAlpha: 0.3,
  ambient: 1,
  key: [255, 250, 240] as const,
  torch: 180,
  glow: 0.6,
  flicker: 0,
} satisfies Partial<StyleSpec>;

export const STYLES: Record<StyleKind, StyleSpec> = {
  comb: { ...BASE, kind: "comb", cell: [18, 18 * COMB_ROW], radius: 2.5, gap: 2, relief: 0.75, gloss: 0.55, shadow: [0, 0, 0], shadowAlpha: 0.32 },
  // Cells as a terminal's, taller than wide. A body's character, cut darker into its block, is
  // sparse on bright skin and dense in shadow, so the texture deepens the shading.
  ascii: { ...BASE, kind: "ascii", cell: [9, 13], ramp: ".:-=+*x%#@", gap: 1, threshold: 0.58, soft: 0.1, torch: 150 },
  pixel: { ...BASE, kind: "pixel", cell: [8, 8], soft: 0.5, relief: 0.3, gloss: 0.2 },
  native: { ...BASE, kind: "native", cell: [1, 1], soft: 0, threshold: 0 },
};

/** The style to draw in: the defaults of `kind` (or the scene's kind), the scene's suggestion, then `override`. */
export function resolveStyle(
  scene: Partial<StyleSpec> | ((look: Look) => Partial<StyleSpec>) | undefined,
  look: Look,
  override: Partial<StyleSpec> = {},
): StyleSpec {
  const fromScene = typeof scene === "function" ? scene(look) : scene ?? {};
  const kind = override.kind ?? fromScene.kind ?? "comb";
  // A scene's tuning is for its own kind; when the host picks another kind, only its light carries
  // over. Characters need contrast to read, so a night scene's low ambient does not dim them below 0.65.
  let carried: Partial<StyleSpec> = fromScene.kind && fromScene.kind !== kind
    ? { ambient: fromScene.ambient ?? BASE.ambient, key: fromScene.key ?? BASE.key, glow: fromScene.glow ?? BASE.glow }
    : fromScene;
  if (kind === "ascii" && carried.ambient !== undefined && fromScene.kind !== "ascii") carried = { ...carried, ambient: Math.max(carried.ambient, 0.65) };
  const out = { ...STYLES[kind], ...carried, ...override, kind };
  if (kind === "comb") out.cell = [out.cell[0], out.cell[0] * COMB_ROW];
  return out;
}
