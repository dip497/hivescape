/**
 * A section of Landscape, a handscroll in six sections by Song Nian, dated 1898 (The Metropolitan
 * Museum of Art, 1986.267.76; public domain, CC0): cliffs brushed in ink, a pine grove round two
 * houses, far peaks in cloud. Mist drifts through the valleys, the pines stir, birds cross the sky.
 */
import { defineMasterwork } from "@hivescape/paintings";
import image from "./painting.jpg";

export default defineMasterwork({
  id: "mountain-mist",
  name: "Mountain Mist",
  description: "Song Nian's ink landscape of 1898, alive: mist drifts through the valleys, the pines stir, birds cross the sky.",
  image,
  focus: [0.6, 0.5],
  effects: [
    { kind: "mist", bands: [0.36, 0.53, 0.86], colour: "#f6f3ec", alpha: 0.42, speed: 6 },
    { kind: "wind", region: [0.33, 0.6, 0.98, 0.81], amp: 1.2, speed: 0.5 },
    { kind: "birds", count: 6, region: [0.6, 0.03, 0.98, 0.15], colour: "#2b2a28" },
  ],
});
