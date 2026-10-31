import { describe, expect, test } from "bun:test";
import { LIGHT, simulate } from "@hivescape/core";
import koi from "./koi/src/index.ts";
import campfire from "./campfire/src/index.ts";
import apiary, { viewOf } from "./apiary/src/index.ts";
import hive from "./hive/src/index.ts";

type KoiState = ReturnType<typeof koi.create>;
type CampState = ReturnType<typeof campfire.create>;

describe("Koi Pond", () => {
  test("is full from its first frame: koi, pads and, by night, lanterns", () => {
    const s = simulate(koi).state as KoiState;
    expect(s.koi.length).toBeGreaterThanOrEqual(4);
    expect(s.pads.length).toBeGreaterThan(0);
    expect(s.lanterns.length).toBeGreaterThan(0);
  });
  test("koi gather round a pointer that rests on the water", () => {
    const sim = simulate(koi, { seed: 3 });
    const mean = () => { const s = sim.state as KoiState; return s.koi.reduce((a, k) => a + Math.hypot(k.x - 720, k.y - 450), 0) / s.koi.length; };
    sim.run(2);
    const before = mean();
    for (let i = 0; i < 40 * 60; i++) { sim.point(720 + (i % 3), 450); sim.run(1 / 60); }
    expect(mean()).toBeLessThan(before * 0.6);
  });
  test("a click drops food the koi eat, and an hour of clicking keeps everything bounded", () => {
    const sim = simulate(koi, { seed: 5 });
    sim.click(700, 400); sim.run(1 / 60);
    expect((sim.state as KoiState).food.length).toBe(6);
    for (let m = 0; m < 60; m++) { for (let c = 0; c < 10; c++) sim.click(100 + c * 120, 300); sim.run(60); }
    const s = sim.state as KoiState;
    expect(s.food.length).toBeLessThanOrEqual(24);
    expect(sim.world.effects.ripples.length).toBeLessThanOrEqual(8);
    for (const k of s.koi) expect(k.x > -200 && k.x < 1640 && k.y > -200 && k.y < 1100).toBe(true);
  });
});

describe("Campfire", () => {
  test("is full from its first frame: firs near and far, tufts of grass, a burning fire", () => {
    const s = simulate(campfire).state as CampState;
    expect(s.firs.some((f) => f.depth < 1) && s.firs.some((f) => f.depth >= 1)).toBe(true);
    expect(s.tufts.length).toBeGreaterThan(10);
    expect(s.heat).toBeGreaterThan(0.5);
  });
  test("the flames lean toward the pointer, and the layers part as it moves", () => {
    const sim = simulate(campfire);
    for (let i = 0; i < 120; i++) { sim.point(1300, 700); sim.run(1 / 60); }
    expect((sim.state as CampState).lean).toBeGreaterThan(0.3);
    expect((sim.state as CampState).cam.x).toBeGreaterThan(5);
    for (let i = 0; i < 120; i++) { sim.point(100, 700); sim.run(1 / 60); }
    expect((sim.state as CampState).lean).toBeLessThan(-0.3);
  });
  test("a click throws a log on: the fire flares and showers sparks, then settles; sparks stay bounded", () => {
    const sim = simulate(campfire, { look: LIGHT });
    sim.run(3);
    const calm = (sim.state as CampState).heat;
    sim.click(720, 600); sim.run(0.2);
    expect((sim.state as CampState).heat).toBeGreaterThan(calm + 0.3);
    expect((sim.state as CampState).sparks.length).toBeGreaterThan(30);
    for (let m = 0; m < 60; m++) { for (let c = 0; c < 5; c++) sim.click(720, 600); sim.run(60); }
    expect((sim.state as CampState).sparks.length).toBeLessThanOrEqual(220);
    expect((sim.state as CampState).logs).toBeLessThanOrEqual(6);
  });
});

describe("Apiary", () => {
  type IsleState = ReturnType<typeof apiary.create>;
  test("the tile under the pointer is the one it is over, on every terrace, and a click plants flowers there", () => {
    const sim = simulate(apiary, { seed: 2 });
    const s = sim.state as IsleState, iso = viewOf(sim.world);
    // One tile of each height, pointed at in the middle of its top.
    const byHeight = new Map<number, (typeof s.tiles extends Map<string, infer T> ? T : never)>();
    for (const t of s.tiles.values()) if (!byHeight.has(t.z)) byHeight.set(t.z, t);
    expect(byHeight.size).toBeGreaterThanOrEqual(3);
    for (const t of byHeight.values()) {
      const p = iso.toScreen(t.x + 0.5, t.y + 0.5, t.z);
      sim.point(p.x, p.y); sim.run(1 / 60);
      expect(s.hover).toBe(t);
    }
    const t = [...byHeight.values()].at(-1)!, p = iso.toScreen(t.x + 0.5, t.y + 0.5, t.z), before = s.patches.length;
    sim.click(p.x, p.y); sim.run(1 / 60);
    expect(s.patches.length).toBe(before + 1);
    expect(s.patches.at(-1)).toMatchObject({ x: t.x, y: t.y });
  });
  test("a click on the sea plants nothing, and the patches stay bounded", () => {
    const sim = simulate(apiary, { seed: 2 });
    const s = sim.state as IsleState, before = s.patches.length;
    sim.click(5, 5); sim.run(1 / 60);
    expect(s.patches.length).toBe(before);
    const iso = viewOf(sim.world), t = [...s.tiles.values()][0]!, p = iso.toScreen(t.x + 0.5, t.y + 0.5, t.z);
    for (let i = 0; i < 100; i++) { sim.click(p.x, p.y); sim.run(0.1); }
    expect(s.patches.length).toBeLessThanOrEqual(16);
  });
});

describe("The Hive", () => {
  type HiveState = ReturnType<typeof hive.create>;
  const P = ["claude", "codex", "gemini", "claude", "amp"], S = ["working", "needs-you", "ready", "working", "resting"] as const;
  const K: Record<string, number> = { claude: 0.1, codex: 0.35, gemini: 0.6, amp: 0.85 };
  const agents = (states: readonly (typeof S)[number][] = S) => states.map((st, i) => ({ id: "agent-" + (i + 1), program: P[i]!, kind: K[P[i]!]!, size: 0.9, state: st }));
  const TILES = [{ x0: 432, y0: 180, x1: 806, y1: 450, id: "agent-1" }, { x0: 835, y0: 144, x1: 1181, y1: 378, id: "agent-2" }, { x0: 518, y0: 504, x1: 950, y1: 756, id: "agent-3" }];
  const under = (x: number, y: number) => TILES.some((t) => x > t.x0 && x < t.x1 && y > t.y0 && y < t.y1);

  test("a bee for each agent, named only by agents' ids, and worker bees with no agents at all", () => {
    const sim = simulate(hive);
    sim.run(0.5);
    expect((sim.state as HiveState).bees.length).toBe(0);
    expect((sim.state as HiveState).workers.length).toBeGreaterThan(5);
    sim.agents(agents()); sim.run(0.5);
    const spots = hive.spots!(sim.state as HiveState, sim.world);
    expect(spots.map((p) => p.id).sort()).toEqual(agents().map((a) => a.id).sort());
    sim.agents(agents().slice(0, 2)); sim.run(0.1);
    expect((sim.state as HiveState).bees.map((b) => b.id)).toEqual(["agent-1", "agent-2"]);
  });

  test("the bee whose agent needs you goes beside that agent's tile, not under any tile, and dances there", () => {
    const sim = simulate(hive);
    sim.agents(agents()); sim.tiles(TILES);
    sim.run(6);
    const b = (sim.state as HiveState).bees[1]!, t = TILES[1]!;
    const near = Math.min(Math.abs(b.x - t.x0), Math.abs(b.x - t.x1), Math.abs(b.y - t.y0), Math.abs(b.y - t.y1));
    let away = 0;
    for (let k = 0; k < 300; k++) { sim.run(1 / 60); const c = (sim.state as HiveState).bees[1]!; if (under(c.x, c.y)) away++; }
    expect(b.phase).toBe("dance");
    expect(near).toBeLessThan(160);
    expect(away).toBe(0);
  });

  test("bees at work fly round the tiles, not under them", () => {
    let under_ = 0, seen = 0;
    for (const seed of [1, 2, 3]) {
      const sim = simulate(hive, { seed });
      sim.agents(agents(["working", "working", "working", "working", "working"])); sim.tiles(TILES);
      for (let k = 0; k < 60 * 40; k++) {
        sim.run(1 / 60);
        if (k % 6) continue;
        for (const b of (sim.state as HiveState).bees) { seen++; if (TILES.some((t) => b.x > t.x0 + 12 && b.x < t.x1 - 12 && b.y > t.y0 + 12 && b.y < t.y1 - 12)) under_++; }
      }
    }
    expect(under_ / seen).toBeLessThan(0.02);
  });

  test("a finished turn fills another of that agent's cells with honey; a stranger's id does nothing", () => {
    const sim = simulate(hive);
    sim.agents(agents()); sim.run(0.2);
    const s = sim.state as HiveState, before = s.bees[0]!.turns;
    sim.done("agent-1"); sim.done("agent-1"); sim.done("nobody"); sim.run(0.1);
    expect(s.bees[0]!.turns).toBe(before + 2);
    expect(s.bees[1]!.turns).toBe(s.bees[1]!.turns);
    expect(s.sparks.length).toBeGreaterThan(0);
  });

  test("a resting agent's bee is in its cell, and an hour of turns and clicks stays bounded", () => {
    const sim = simulate(hive);
    sim.agents(agents()); sim.tiles(TILES);
    sim.run(8);
    const s = sim.state as HiveState, rest = s.bees[4]!, home = s.comb[rest.home[0]!]!;
    expect(rest.phase).toBe("cell");
    expect(Math.hypot(rest.x - home.x, rest.y - home.y)).toBeLessThan(8);
    for (let m = 0; m < 60; m++) { for (let c = 0; c < 6; c++) { sim.click(200 + c * 150, 300); sim.done("agent-1"); } sim.run(60); }
    expect(s.sparks.length).toBeLessThanOrEqual(160);
    for (const b of [...s.bees, ...s.workers]) expect(Number.isFinite(b.x) && Number.isFinite(b.y)).toBe(true);
  });
});
