/**
 * Village de Gèdres, Route de Gavarnie, a photograph by Joseph Vigier, 1853 (The Metropolitan Museum
 * of Art, 2005.100.503.10; public domain, CC0): a village in the Pyrenees, its houses and a hotel by
 * a stone bridge, the river pouring over rapids in front, a mountain behind. A photograph made into a
 * living picture as a painting is: the river pours toward you over the rapids and drifts across the
 * pool, and the trees stir. The village, the bridge and the mountain hold still.
 */
import { defineMasterwork } from "@hivescape/paintings";
import image from "./painting.jpg";

export default defineMasterwork({
  id: "gedres",
  name: "Gèdres",
  description: "Joseph Vigier's photograph of Gèdres in the Pyrenees, 1853, alive: the river pours over the rapids under the bridge and the trees stir, the village still.",
  image,
  focus: [0.5, 0.5],
  // A salted paper print, faded in 170 years: its tones stretched back to the full range.
  levels: 0.6,
  // For the depth of field: the mountain and sky far off; the wooded valley; the houses, the hotel
  // and its bridge; then the rapids and the pool, nearest, in focus with the village.
  depth: {
    horizon: 0.655, far: 0.45, near: 1,
    shapes: [
      { poly: [[0, 0], [0.13, 0.07], [0.4, 0.13], [0.47, 0.18], [0.65, 0.2], [0.85, 0.12], [1, 0.1], [1, 0.66], [0, 0.66]], z: 0.3 },
      { poly: [[0, 0.17], [0.12, 0.17], [0.2, 0.2], [0.33, 0.24], [0.35, 0.35], [0.3, 0.63], [0, 0.63]], z: 0.5 },
      { poly: [[0.42, 0.38], [0.5, 0.33], [0.55, 0.36], [0.66, 0.38], [0.75, 0.45], [0.75, 0.7], [0.4, 0.7]], z: 0.48 },
    ],
  },
  sharp: { depth: 0.6, range: 0.3, blur: 2.5 },
  effects: [
    // The river over the rapids, toward the viewer, then across the pool.
    { kind: "flow", region: [[0.29, 0.72], [0.72, 0.71], [0.75, 0.82], [0.66, 0.86], [0.3, 0.86]], dir: [0.12, 1], speed: 0.012 },
    { kind: "flow", region: [[0, 0.86], [0.66, 0.85], [0.72, 0.95], [0.62, 1], [0, 1]], dir: [1, 0.04], speed: 0.006 },
    // The trees on the right bank and the bushes by the water, in the wind.
    { kind: "wind", region: [[0.76, 0.14], [1, 0.1], [1, 0.62], [0.78, 0.66]], amp: 3, speed: 0.8 },
    { kind: "wind", region: [[0, 0.64], [0.3, 0.66], [0.3, 0.84], [0, 0.86]], amp: 3, speed: 0.9 },
  ],
});
