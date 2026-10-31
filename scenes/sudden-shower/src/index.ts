/**
 * Sudden Shower over Shin-Ōhashi Bridge and Atake, from One Hundred Famous Views of Edo, by Utagawa
 * Hiroshige, 1857 (The Metropolitan Museum of Art, JP2522; public domain, CC0). The rain keeps
 * falling over the bridge and the walkers hurrying across it, and the river runs beneath.
 */
import { defineMasterwork } from "@hivescape/paintings";
import image from "./painting.jpg";

export default defineMasterwork({
  id: "sudden-shower",
  name: "Sudden Shower",
  description: "Hiroshige's Sudden Shower over Shin-Ohashi Bridge and Atake (1857), alive: the rain falls, the river runs.",
  image,
  crop: [0.095, 0.07, 0.91, 0.93],
  focus: [0.5, 0.52],
  // The far shore and the sky far off, the river running nearer, the bridge and its walkers nearest.
  depth: {
    horizon: 0.34, far: 0.2, near: 0.7,
    shapes: [
      { poly: [[0, 0.22], [0.3, 0.25], [0.6, 0.29], [0.8, 0.33], [1, 0.35], [1, 0.44], [0.8, 0.41], [0.5, 0.37], [0.2, 0.35], [0, 0.34]], z: 0.12 },
      { poly: [[0, 0.72], [0.2, 0.655], [0.4, 0.605], [0.6, 0.575], [0.8, 0.55], [1, 0.535], [1, 1], [0, 1]], z: 0.88 },
      { poly: [[0.18, 0.64], [0.3, 0.64], [0.3, 0.76], [0.18, 0.76]], z: 0.92 },
      { poly: [[0.34, 0.6], [0.45, 0.6], [0.45, 0.71], [0.34, 0.71]], z: 0.92 },
      { poly: [[0.54, 0.54], [0.77, 0.54], [0.77, 0.66], [0.54, 0.66]], z: 0.92 },
    ],
  },
  sharp: { depth: 0.88, range: 0.3, blur: 2.5 },
  effects: [
    // The Sumida, running left under the rain.
    { kind: "flow", region: [[0, 0.35], [1, 0.43], [1, 0.54], [0.6, 0.575], [0.2, 0.655], [0, 0.72]], dir: [-1, 0.08], speed: 0.008 },
    { kind: "rain", count: 300, angle: 0.06, colour: "#2c3440", alpha: 0.45, length: 34, speed: 1100 },
  ],
});
