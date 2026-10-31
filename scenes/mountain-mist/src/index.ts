/**
 * A section of Landscape, a handscroll in six sections by Song Nian, dated 1898 (The Metropolitan
 * Museum of Art, 1986.267.76; public domain, CC0): cliffs brushed in ink, a pine grove round two
 * houses, far peaks in cloud. Mist drifts through the valleys, cloud moves on the far peaks, the pines stir.
 */
import { defineMasterwork } from "@hivescape/paintings";
import image from "./painting.jpg";

export default defineMasterwork({
  id: "mountain-mist",
  name: "Mountain Mist",
  description: "Song Nian's ink landscape of 1898, alive: mist drifts through the valleys, cloud moves on the far peaks, the pines stir.",
  image,
  focus: [0.6, 0.5],
  // For the depth of field: the far peaks in cloud, the hills under them, the pine grove nearer, the
  // cliff on the left nearest.
  depth: {
    horizon: 0.42, far: 0.3, near: 1,
    shapes: [
      { poly: [[0.08, 0], [0.5, 0], [0.57, 0.2], [0.62, 0.3], [0.7, 0.4], [0.8, 0.45], [1, 0.42], [1, 0.6], [0.3, 0.6], [0.2, 0.45], [0.12, 0.2]], z: 0.45 },
      { poly: [[0, 0], [0.1, 0], [0.18, 0.2], [0.22, 0.45], [0.26, 0.62], [0.27, 0.8], [0.24, 1], [0, 1]], z: 0.85 },
    ],
  },
  sharp: { depth: 0.65, range: 0.3, blur: 2 },
  effects: [
    { kind: "flow", region: [[0.55, 0.18], [1, 0.18], [1, 0.46], [0.75, 0.44], [0.6, 0.32]], dir: [1, -0.05], speed: 0.004 },
    { kind: "mist", bands: [0.36, 0.53, 0.86], colour: "#f6f3ec", alpha: 0.42, speed: 6 },
    { kind: "wind", region: [0.33, 0.6, 0.98, 0.81], amp: 2.5, speed: 0.6 },
  ],
});
