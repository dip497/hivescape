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
  focus: [0.5, 0.62],
  effects: [
    { kind: "water", region: [0, 0.27, 1, 0.53], amp: 3, speed: 0.9 },
    { kind: "water", region: [0, 0.9, 1, 1], amp: 3, speed: 1.1 },
    { kind: "rain", count: 300, angle: 0.06, colour: "#2c3440", alpha: 0.45, length: 34, speed: 1100 },
  ],
});
