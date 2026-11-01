/**
 * The aurora australis streaming over the southern Indian Ocean, photographed from the International
 * Space Station by the Expedition 65 crew on August 2, 2021 (NASA, iss065e214281; NASA imagery is not
 * protected by copyright). Deep black, magenta and green: in ink the curtains are glowing characters
 * over the dark. Waves of light sweep along the curtains as they brighten and dim, and the green glow
 * over the clouds drifts; the blue line of the atmosphere and the stars above hold still.
 */
import { defineMasterwork } from "@hivescape/paintings";
import image from "./painting.jpg";

export default defineMasterwork({
  id: "aurora",
  name: "Aurora",
  description: "The aurora australis from the International Space Station, alive: waves of light sweep along its curtains over the Earth, the stars still.",
  image,
  focus: [0.5, 0.42],
  effects: [
    // The curtains above the horizon: waves of light sweep along them as they brighten and dim, and
    // their rays sway a little, in place.
    { kind: "wind", region: [[0, 0.14], [1, 0.14], [1, 0.42], [0.5, 0.46], [0, 0.49]], amp: 1.5, speed: 0.6, shimmer: 0.35 },
    // The green rays hanging below the horizon at the right.
    { kind: "wind", region: [[0.58, 0.36], [0.72, 0.36], [0.72, 0.6], [0.58, 0.6]], amp: 1.5, speed: 0.8, shimmer: 0.3 },
    // The aurora's green glow over the clouds drifts.
    { kind: "flow", region: [[0, 0.62], [0.5, 0.55], [1, 0.49], [1, 1], [0, 1]], dir: [-1, 0.05], speed: 0.012 },
    // The magenta curtain and the bright green rays breathe.
    { kind: "glow", at: [0.45, 0.3], radius: 0.22, colour: [220, 60, 140], alpha: 0.35, pulse: 0.3 },
    { kind: "glow", at: [0.66, 0.38], radius: 0.1, colour: [120, 255, 150], alpha: 0.3, pulse: 0.3 },
  ],
});
