/**
 * Ejiri in Suruga Province, from Thirty-six Views of Mount Fuji, by Katsushika Hokusai, about 1830-32
 * (The Metropolitan Museum of Art, JP12; public domain, CC0): a gale across the rice fields, the
 * travellers bent against it, papers torn from a bundle and a hat flying, Fuji still and white beyond.
 * Everything the wind touches moves (the whole field, the two trees' leaves, the papers and leaves in
 * the air); the travellers, the trunks, the shrine and the mountain hold still.
 */
import { defineMasterwork } from "@hivescape/paintings";
import image from "./painting.jpg";

export default defineMasterwork({
  id: "ejiri",
  name: "Ejiri",
  description: "Hokusai's gale at Ejiri (about 1830), alive: the wind runs through the rice fields and the trees and tosses the papers, the travellers and Fuji still.",
  image,
  focus: [0.5, 0.55],
  effects: [
    // The rice field, all of it, in the gale; the travellers, the trunks and the shrine hold still.
    {
      kind: "wind", region: [[0.000, 0.437], [1.000, 0.437], [1.000, 0.973], [0.000, 0.973]], amp: 4, speed: 1.5, shimmer: 0.7,
      except: [
        [[0.111, 0.481], [0.196, 0.470], [0.249, 0.568], [0.238, 0.973], [0.111, 0.973]],
        [[0.354, 0.503], [0.439, 0.503], [0.450, 0.634], [0.429, 0.940], [0.344, 0.940]],
        [[0.450, 0.470], [0.640, 0.470], [0.630, 0.590], [0.545, 0.634], [0.524, 0.940], [0.450, 0.940]],
        [[0.704, 0.393], [0.820, 0.393], [0.820, 0.612], [0.778, 0.743], [0.725, 0.743], [0.704, 0.612]],
        [[0.354, 0.339], [0.460, 0.339], [0.460, 0.426], [0.354, 0.426]],
        [[0.111, 0.372], [0.175, 0.372], [0.175, 0.459], [0.111, 0.459]],
        [[0.524, 0.361], [0.630, 0.361], [0.630, 0.481], [0.524, 0.481]],
        [[0.175, 0.984], [0.259, 0.984], [0.429, 0.055], [0.365, 0.044], [0.291, 0.284]],
      ],
    },
    // The two trees' leaves, and the papers and leaves blown through the sky.
    { kind: "wind", region: [[0.270, 0.000], [0.608, 0.000], [0.630, 0.175], [0.503, 0.230], [0.376, 0.197], [0.270, 0.087]], amp: 3.5, speed: 1.4, shimmer: 0.5 },
    { kind: "wind", region: [[0.450, 0.044], [0.979, 0.044], [0.979, 0.437], [0.450, 0.437]], amp: 5, speed: 1.6, shimmer: 0.1 },
  ],
});
