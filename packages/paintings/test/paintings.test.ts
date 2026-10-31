import { describe, expect, test } from "bun:test";
import { simulate } from "@hivescape/core";
import { place } from "../src/index.ts";
import suddenShower from "../../../scenes/sudden-shower/src/index.ts";
import lakshmi from "../../../scenes/lakshmi/src/index.ts";

type State = ReturnType<typeof suddenShower.create>;

describe("place", () => {
  const img = { width: 1000, height: 1600 };
  test("the painting always covers the screen, whatever their shapes", () => {
    for (const [W, H] of [[1440, 900], [900, 1440], [3000, 600], [600, 600]] as const) {
      const p = place(img, { crop: [0.1, 0.1, 0.9, 0.9], focus: [0.2, 0.9] }, W, H);
      expect(p.dx).toBeLessThanOrEqual(0);
      expect(p.dy).toBeLessThanOrEqual(0);
      expect(p.dx + p.dw).toBeGreaterThanOrEqual(W - 1e-6);
      expect(p.dy + p.dh).toBeGreaterThanOrEqual(H - 1e-6);
    }
  });
  test("the screen's shape cuts the painting round its focus", () => {
    // A tall painting on a wide screen: the focus sits at the screen's middle when it can;
    // near the painting's top it cannot, and the painting stops at its edge rather than leave a gap.
    const mid = place(img, { focus: [0.5, 0.7] }, 1440, 900), top = place(img, { focus: [0.5, 0.05] }, 1440, 900);
    const yOf = (p: typeof mid, fy: number) => p.dy + p.dh * fy;
    expect(yOf(mid, 0.7)).toBeCloseTo(450, 6);
    expect(top.dy).toBe(0);
    expect(yOf(top, 0.05)).toBeGreaterThan(0);
    expect(yOf(top, 0.05)).toBeLessThan(450);
  });
  test("a crop takes the painted area out of its paper", () => {
    const p = place(img, { crop: [0.1, 0.2, 0.9, 0.8] }, 800, 600);
    [100, 320, 800, 960].forEach((v, k) => expect([p.sx, p.sy, p.sw, p.sh][k]!).toBeCloseTo(v, 6));
  });
});

describe("effects", () => {
  test("the same seed draws the same rain, so a still frame is the same each time", () => {
    const a = simulate(suddenShower, { seed: 7 }), b = simulate(suddenShower, { seed: 7 });
    a.run(30); b.run(30);
    expect((a.state as State).drops).toEqual((b.state as State).drops);
  });
  test("rain keeps falling: after an hour every drop is still in the sky, none lost", () => {
    const sim = simulate(suddenShower, { seed: 2 });
    const n = (sim.state as State).drops.flat().length;
    sim.run(3600);
    const drops = (sim.state as State).drops.flat();
    expect(drops.length).toBe(n);
    for (const d of drops) expect(d.y > -100 && d.y < 1000 && d.x > -60 && d.x < 1500).toBe(true);
  });
  test("petals keep falling through the painting rather than piling up at its foot", () => {
    const sim = simulate(lakshmi, { seed: 4 });
    sim.run(600);
    const flakes = (sim.state as State).flakes.flat();
    expect(flakes.length).toBeGreaterThan(0);
    const low = flakes.filter((f) => f.y > 850).length;
    expect(low).toBeLessThan(flakes.length / 2);
  });
});
