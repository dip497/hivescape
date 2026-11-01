/**
 * Ejiri in Suruga Province, from Thirty-six Views of Mount Fuji, by Katsushika Hokusai, about 1830-32
 * (The Metropolitan Museum of Art, JP12; public domain, CC0): a gale across the rice fields, the
 * travellers bent against it, papers torn from a bundle and a hat flying, Fuji still and white beyond.
 * Everything the wind touches moves: the field is drawn as its own blades, free strokes along the
 * print's own grain, bending away from the gale in gusts that run across it; the two trees' leaves,
 * the papers and leaves in the air sway. The travellers, the trunks, the shrine, the paths and the
 * mountain hold still.
 */
import { defineMasterwork } from "@hivescape/paintings";
import image from "./painting.jpg";

export default defineMasterwork({
  id: "ejiri",
  name: "Ejiri",
  description: "Hokusai's gale at Ejiri (about 1830), alive: gusts run through the blades of the rice fields and the trees and toss the papers, the travellers and Fuji still.",
  image,
  focus: [0.5, 0.55],
  effects: [
    // The rice field, all of it, as blades bending in the gale (it blows left to right, as the trees,
    // the papers and the hat say), on the field's cool greens only: the cream paths hold their
    // characters. The travellers, the trunks and the shrine hold still.
    {
      kind: "strokes", motion: "bend", region: [[0.000, 0.437], [1.000, 0.437], [1.000, 0.973], [0.000, 0.973]],
      on: (r, g, b) => (g + b) / 2 - r > 6, spacing: 8, length: 15, width: 1.3, follow: 0.7, lean: 1.0, wind: 1, amp: 0.4, speed: 1.4,
      // Traced close round what stands in the field, so the blades grow right up to it.
      except: [
        [[0.11, 0.74], [0.16, 0.725], [0.2, 0.75], [0.25, 0.82], [0.24, 0.92], [0.2, 0.975], [0.13, 0.975], [0.12, 0.86]],
        [[0.205, 0.975], [0.235, 0.975], [0.275, 0.6], [0.295, 0.43], [0.272, 0.43], [0.252, 0.6]],
        [[0.22, 0.92], [0.245, 0.92], [0.31, 0.62], [0.36, 0.43], [0.335, 0.43], [0.29, 0.6]],
        [[0.37, 0.72], [0.42, 0.72], [0.45, 0.77], [0.44, 0.87], [0.4, 0.96], [0.355, 0.96], [0.355, 0.8]],
        [[0.48, 0.7], [0.53, 0.69], [0.6, 0.7], [0.62, 0.76], [0.58, 0.8], [0.53, 0.86], [0.5, 0.91], [0.47, 0.88], [0.475, 0.78]],
        [[0.715, 0.6], [0.77, 0.6], [0.815, 0.64], [0.81, 0.7], [0.78, 0.72], [0.775, 0.78], [0.74, 0.78], [0.74, 0.68], [0.715, 0.66]],
        [[0.545, 0.57], [0.6, 0.57], [0.62, 0.6], [0.65, 0.67], [0.6, 0.69], [0.52, 0.68], [0.52, 0.62]],
        [[0.355, 0.55], [0.455, 0.54], [0.455, 0.6], [0.355, 0.6]],
        [[0.13, 0.58], [0.165, 0.58], [0.165, 0.635], [0.13, 0.635]],
      ],
    },
    // The two trees' leaves, and the papers and leaves blown through the sky.
    { kind: "wind", region: [[0.270, 0.000], [0.608, 0.000], [0.630, 0.175], [0.503, 0.230], [0.376, 0.197], [0.270, 0.087]], amp: 3.5, speed: 1.4, shimmer: 0.5 },
    { kind: "wind", region: [[0.450, 0.044], [0.979, 0.044], [0.979, 0.437], [0.450, 0.437]], amp: 5, speed: 1.6, shimmer: 0.1 },
  ],
});
