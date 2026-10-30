/** What a host and a scene's worker say to each other. Structured-clone data only. */
import type { Look, Mode, Size, StyleSpec } from "@hivescape/core";
import type { BackendChoice } from "@hivescape/render";

export type ToWorker =
  | { type: "init"; backdrop: OffscreenCanvas; cells: OffscreenCanvas; size: Size; look: Look; mode: Mode; seed?: number; style?: Partial<StyleSpec>; backend?: BackendChoice; fps?: number }
  | { type: "resize"; size: Size }
  | { type: "look"; look: Look }
  | { type: "style"; style: Partial<StyleSpec> }
  | { type: "mode"; mode: Mode }
  | { type: "point"; x: number; y: number; active: boolean }
  | { type: "click"; x: number; y: number }
  | { type: "stats"; id: number }
  | { type: "stop" };

export type FromWorker =
  | { type: "ready"; backend: string }
  | { type: "drawn" }
  | { type: "stats"; id: number; ms: number; backend: string; cells: number; frames: number }
  | { type: "error"; message: string };
