/**
 * Lakshmi, goddess of fortune, seated on her lotus by the water with her owl and the treasures of
 * the sea, after a print published by the Calcutta Art Studio in 1883 (The Metropolitan Museum of
 * Art, 2021.202; public domain, CC0). She holds still; her halo breathes, the ripe wheat behind her and
 * the tree beside her stir, and on a screen tall enough to show the pond, it flows round the lotus.
 */
import { defineMasterwork } from "@hivescape/paintings";
import image from "./painting.jpg";

export default defineMasterwork({
  id: "lakshmi",
  name: "Lakshmi",
  description: "Lakshmi in her halo, after the Calcutta Art Studio print of 1883, alive: the halo breathes, the wheat and the tree stir in the wind.",
  image,
  crop: [0.155, 0.16, 0.85, 0.875],
  // Crown to knees on a wide screen; a taller one shows the lotus pond below her too.
  focus: [0.5, 0.36],
  // For the depth of field: the sky and hills far off, the wheat and the pond nearer, the tree beside
  // her, then the goddess on her rock (in focus), and the shells and the lotus nearest.
  depth: {
    horizon: 0.4, far: 0.25, near: 0.8,
    shapes: [
      { poly: [[0.72, 0.17], [0.9, 0.16], [1, 0.17], [1, 0.76], [0.72, 0.76]], z: 0.45 },
      { poly: [[0.53, 0.16], [0.6, 0.17], [0.62, 0.24], [0.6, 0.3], [0.68, 0.33], [0.74, 0.4], [0.77, 0.5], [0.8, 0.6], [0.85, 0.7], [0.8, 0.76], [0.7, 0.8], [0.6, 0.85], [0.52, 0.9], [0.45, 0.88], [0.38, 0.84], [0.33, 0.76], [0.33, 0.62], [0.36, 0.55], [0.33, 0.48], [0.36, 0.4], [0.42, 0.4], [0.47, 0.35], [0.48, 0.27], [0.5, 0.2]], z: 0.7 },
      { poly: [[0.6, 0.78], [0.85, 0.72], [1, 0.7], [1, 1], [0.38, 1], [0.38, 0.86], [0.5, 0.88]], z: 0.9 },
    ],
  },
  sharp: { depth: 0.7, range: 0.25, blur: 2 },
  effects: [
    { kind: "flow", region: [[0, 0.73], [0.38, 0.74], [0.42, 0.82], [0.36, 1], [0, 1]], dir: [-1, 0.05], speed: 0.004 },
    // The ripe wheat behind her and the tree beside her, in the wind; she holds still.
    { kind: "wind", region: [[0, 0.42], [0.33, 0.42], [0.33, 0.74], [0, 0.74]], amp: 3.5, speed: 0.7 },
    { kind: "wind", region: [[0.8, 0.17], [1, 0.17], [1, 0.62], [0.84, 0.62]], amp: 3, speed: 0.6 },
    { kind: "glow", at: [0.575, 0.21], radius: 0.16, colour: [255, 214, 140], alpha: 0.5, pulse: 0.15 },
  ],
});
