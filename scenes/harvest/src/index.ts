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
  effects: [
    { kind: "wind", region: [0, 0.3, 0.6, 0.6], amp: 2.5, speed: 0.8 },
    { kind: "wind", region: [0.62, 0.36, 1, 0.55], amp: 1.5, speed: 0.7 },
    { kind: "birds", count: 9, region: [0.05, 0.02, 0.95, 0.16], colour: "#4a4a44" },
    { kind: "water", region: [0.55, 0.2, 1, 0.3], amp: 1.5, speed: 0.6 },
  ],
});
