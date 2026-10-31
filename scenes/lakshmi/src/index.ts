/**
 * Lakshmi, goddess of fortune, seated on her lotus by the water with her owl and the treasures of
 * the sea, after a print published by the Calcutta Art Studio in 1883 (The Metropolitan Museum of
 * Art, 2021.202; public domain, CC0). Her halo breathes, the ripe wheat behind her stirs, clouds drift
 * over the hills and petals fall; on a screen tall enough to show the pond, it ripples round the lotus.
 */
import { defineMasterwork } from "@hivescape/paintings";
import image from "./painting.jpg";

export default defineMasterwork({
  id: "lakshmi",
  name: "Lakshmi",
  description: "Lakshmi in her halo, after the Calcutta Art Studio print of 1883, alive: the halo breathes, the wheat stirs, petals fall.",
  image,
  crop: [0.155, 0.16, 0.85, 0.875],
  // Crown to knees on a wide screen; a taller one shows the lotus pond below her too.
  focus: [0.5, 0.4],
  effects: [
    { kind: "water", region: [0, 0.74, 0.6, 1], amp: 2.5, speed: 0.8 },
    { kind: "wind", region: [0, 0.49, 0.42, 0.7], amp: 2, speed: 0.7 },
    { kind: "wind", region: [0.82, 0.18, 1, 0.6], amp: 1.5, speed: 0.6 },
    { kind: "mist", bands: [0.08, 0.2, 0.32], colour: "#f2efe6", alpha: 0.18, speed: 6 },
    { kind: "glow", at: [0.575, 0.21], radius: 0.16, colour: [255, 214, 140], alpha: 0.55, pulse: 0.25 },
    { kind: "fall", count: 14, region: [0.1, 0.0, 0.9, 1], colours: ["#f4a7b9", "#ffd36b"], size: 2.6, speed: 16 },
  ],
});
