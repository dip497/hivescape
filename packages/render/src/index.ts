export { Renderer, type Layers, type RendererOptions, type FrameStats } from "./renderer.js";
export type { Backend, BackendChoice } from "./backend.js";
export { GLBackend, probeGL } from "./gl.js";
export { Canvas2DBackend } from "./c2d.js";
export { Atlas } from "./atlas.js";
export { averageCells } from "./kernel.js";
export { OverlayBatch, ringAt, cellHash, lightness, type FrameInput } from "./frame.js";
export { gridFor, loadFont, offscreen, SS, type AnyCanvas, type Grid } from "./surface.js";
export { MONO_FAMILY } from "./font-data.js";
