/**
 * The Harvesters, by Pieter Bruegel the Elder, 1565 (The Metropolitan Museum of Art, 19.164; public
 * domain, CC0): a village at harvest, the wheat half cut, the reapers resting under the pear tree.
 * Wind runs through the standing wheat and birds cross the summer sky.
 */
import { defineMasterwork } from "@hivescape/paintings";
import image from "./painting.jpg";

export default defineMasterwork({
  id: "harvest",
  name: "The Harvest",
  description: "Bruegel's The Harvesters (1565), alive: wind runs through the wheat, birds cross the summer sky.",
  image,
  focus: [0.5, 0.55],
  // The sky and the bay far off, the village and the fields running nearer, the church's trees, then
  // the pear tree the reapers rest under.
  depth: {
    horizon: 0.31, far: 0.12, near: 1,
    shapes: [
      { poly: [[0.7, 0.2], [0.85, 0.15], [1, 0.12], [1, 0.48], [0.7, 0.48]], z: 0.38 },
      { poly: [[0.35, 0.1], [0.45, 0.02], [0.6, 0], [0.85, 0], [1, 0.05], [1, 0.2], [0.85, 0.28], [0.7, 0.25], [0.66, 0.35], [0.67, 0.6], [0.66, 0.8], [0.6, 0.8], [0.6, 0.6], [0.58, 0.4], [0.52, 0.3], [0.45, 0.2], [0.38, 0.15]], z: 0.66 },
    ],
  },
  sharp: { depth: 0.75, range: 0.28, blur: 2.5 },
  effects: [
    { kind: "wind", region: [0, 0.45, 0.62, 0.78], amp: 2.5, speed: 0.8 },
    { kind: "wind", region: [0.66, 0.48, 1, 0.7], amp: 1.5, speed: 0.7 },
    { kind: "birds", count: 9, region: [0.05, 0.02, 0.6, 0.16], colour: "#4a4a44" },
    // The bay beyond the village, and the pond below it.
    { kind: "flow", region: [0, 0.29, 0.55, 0.36], dir: [-1, 0], speed: 0.003 },
    { kind: "flow", region: [[0.08, 0.52], [0.3, 0.52], [0.32, 0.57], [0.1, 0.58]], dir: [1, 0], speed: 0.004 },
  ],
});
