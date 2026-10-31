/** What a host and a scene's worker say to each other. Structured-clone data only. */
import type { Agent, Look, Mode, Size, Spot, StyleSpec, Tile } from "@hivescape/core";
import type { BackendChoice } from "@hivescape/render";

export type ToWorker =
  | { type: "init"; backdrop: OffscreenCanvas; cells: OffscreenCanvas; front: OffscreenCanvas; size: Size; look: Look; mode: Mode; seed?: number; style?: Partial<StyleSpec>; backend?: BackendChoice; fps?: number }
  | { type: "resize"; size: Size }
  | { type: "look"; look: Look }
  | { type: "style"; style: Partial<StyleSpec> }
  | { type: "mode"; mode: Mode }
  | { type: "point"; x: number; y: number; active: boolean }
  | { type: "click"; x: number; y: number }
  | { type: "agents"; agents: Agent[] }
  | { type: "tiles"; tiles: Tile[] }
  | { type: "done"; id: string }
  | { type: "stats"; id: number }
  | { type: "stop" };

export type FromWorker =
  | { type: "ready"; backend: string }
  | { type: "drawn" }
  | { type: "spots"; spots: Spot[] }
  | { type: "stats"; id: number; ms: number; backend: string; cells: number; frames: number }
  | { type: "error"; message: string };
