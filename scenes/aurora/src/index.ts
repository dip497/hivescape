/**
 * The aurora australis streaming over the southern Indian Ocean, photographed from the International
 * Space Station by the Expedition 65 crew on August 2, 2021 (NASA, iss065e214281; NASA imagery is not
 * protected by copyright). Deep black, magenta and green. The curtains are drawn as their own rays,
 * free strokes along the photograph's streaks, drifting along the curtain as an aurora's rays do,
 * their feet swaying as it folds; the Earth with its green glow passes below the station. The blue
 * line of the atmosphere and the stars above hold still.
 */
import { defineMasterwork } from "@hivescape/paintings";
import image from "./painting.jpg";

export default defineMasterwork({
  id: "aurora",
  name: "Aurora",
  description: "The aurora australis from the International Space Station, alive: its rays drift along the curtains as the Earth passes below, the stars still.",
  image,
  focus: [0.5, 0.42],
  effects: [
    // The curtains above the horizon, as their rays: long strokes along the photograph's streaks,
    // drifting slowly along the curtain.
    { kind: "strokes", motion: "drift", region: [[0, 0.14], [1, 0.14], [1, 0.42], [0.5, 0.46], [0, 0.49]], spacing: 11, length: 42, width: 1, follow: 0.3, lean: 0.12, wind: -1, speed: 9, under: 0.25 },
    // The green rays hanging below the horizon at the right.
    { kind: "strokes", motion: "drift", region: [[0.58, 0.36], [0.72, 0.36], [0.72, 0.6], [0.58, 0.6]], spacing: 10, length: 30, width: 1, follow: 0.3, lean: 0.1, wind: -1, speed: 6, under: 0.25 },
    // The Earth and the aurora's green glow over its clouds pass below the station.
    { kind: "flow", region: [[0, 0.62], [0.5, 0.55], [1, 0.49], [1, 1], [0, 1]], dir: [-1, 0.05], speed: 0.012 },
  ],
});
