import { describe, expect, test } from "bun:test";
import { LIGHT, simulate } from "@hivescape/core";
import koi from "./koi/src/index.ts";
import campfire from "./campfire/src/index.ts";

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
