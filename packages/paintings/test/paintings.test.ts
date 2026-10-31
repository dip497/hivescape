import { describe, expect, test } from "bun:test";
import { simulate } from "@hivescape/core";
import { blurAt, cameraAt, depthAt, flowPhases, FLOW_CYCLE, layerRect, levelsFilter, overscan, place, type Camera } from "../src/index.ts";
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
    // The rain's region is the picture's, which the camera's overscan carries a little past each edge.
    for (const d of drops) expect(d.y > -250 && d.y < 1150 && d.x > -250 && d.x < 1690).toBe(true);
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

describe("depth", () => {
  const d = { horizon: 0.4, far: 0.2, near: 1, shapes: [{ poly: [[0.6, 0.2], [0.8, 0.2], [0.8, 0.9], [0.6, 0.9]] as [number, number][], z: 0.7 }] };
  test("above the horizon is the far distance, and the ground comes nearer toward the picture's foot", () => {
    expect(depthAt(d, 0.2, 0.1)).toBe(0);
    expect(depthAt(d, 0.2, 0.41)).toBeCloseTo(0.2 + 0.8 * (0.01 / 0.6), 6);
    expect(depthAt(d, 0.2, 0.7)).toBeLessThan(depthAt(d, 0.2, 0.95));
    expect(depthAt(d, 0.2, 1)).toBeCloseTo(1, 6);
  });
  test("a shape stands at its own depth wherever it is, sky or ground behind it", () => {
    expect(depthAt(d, 0.7, 0.25)).toBe(0.7);
    expect(depthAt(d, 0.7, 0.85)).toBe(0.7);
    expect(depthAt(d, 0.85, 0.85)).not.toBe(0.7);
  });
});

describe("camera", () => {
  const c: Required<Camera> = { drift: 0.035, period: 26, zoom: 0.04, lean: 0.6, pivot: 0.5 };
  const W = 1440, H = 900, p = place({ width: 1024, height: 755 }, { focus: [0.5, 0.5] }, W, H), over = overscan(c);
  test("whatever the camera does, every layer covers the whole screen", () => {
    for (let t = 0; t < 120; t += 0.37) for (const [lx, ly] of [[0, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const) for (const z of [0, 0.25, 0.5, 0.75, 1]) {
      const r = layerRect(p, cameraAt(c, t, lx, ly, W, H), c, z, W, H, over);
      expect(r.x).toBeLessThanOrEqual(0);
      expect(r.y).toBeLessThanOrEqual(0);
      expect(r.x + r.w).toBeGreaterThanOrEqual(W);
      expect(r.y + r.h).toBeGreaterThanOrEqual(H);
    }
  });
  test("near layers slide against far ones as the camera orbits, and the depth at the pivot stays put", () => {
    const at = (t: number, z: number) => layerRect(p, cameraAt(c, t, 0, 0, W, H), c, z, W, H, over).x;
    const quarter = c.period / 4, still = at(0, 0.5);
    expect(at(quarter, 1) - at(0, 1)).toBeLessThan(-20);
    expect(at(quarter, 0) - at(0, 0)).toBeGreaterThan(20);
    // At the pivot only the breathing moves it, a little.
    expect(Math.abs(at(quarter, 0.5) - still)).toBeLessThan(Math.abs(at(quarter, 1) - at(0, 1)) / 4);
  });
  test("the camera leans toward the pointer", () => {
    expect(cameraAt(c, 0, 1, 0, W, H).x).toBeGreaterThan(cameraAt(c, 0, 0, 0, W, H).x + 20);
    expect(cameraAt(c, 0, 0, 1, W, H).y).toBeGreaterThan(cameraAt(c, 0, 0, 0, W, H).y + 5);
  });
});

describe("flow", () => {
  test("the two copies of a flowing region always add up to the whole region", () => {
    for (let t = 0; t < 3 * FLOW_CYCLE; t += 0.05) { const [a, b] = flowPhases(t); expect(a.weight + b.weight).toBeCloseTo(1, 6); }
  });
  test("each copy is invisible at the moment it jumps back upstream, so the loop never shows", () => {
    const eps = 1e-3;
    for (let t = 0; t < 2 * FLOW_CYCLE; t += 0.01) {
      const [a0, b0] = flowPhases(t), [a1, b1] = flowPhases(t + eps);
      if (a1.at < a0.at) expect(Math.min(a0.weight, a1.weight)).toBeLessThan(1e-3);
      if (b1.at < b0.at) expect(Math.min(b0.weight, b1.weight)).toBeLessThan(1e-3);
    }
  });
  test("between jumps, a copy slides steadily downstream", () => {
    const [a0] = flowPhases(0.5), [a1] = flowPhases(1);
    expect(a1.at - a0.at).toBeCloseTo(0.5 / FLOW_CYCLE, 6);
  });
});

describe("depth of field", () => {
  test("what is in focus stays sharp and what is far from it goes soft", () => {
    const f = { depth: 0.7, range: 0.2, blur: 3 };
    expect(blurAt(f, 0.7)).toBe(0);
    expect(blurAt(f, 0.85)).toBe(0);
    expect(blurAt(f, 0.05)).toBeGreaterThan(2);
    expect(blurAt(f, 0.3)).toBeLessThan(blurAt(f, 0.05));
    expect(blurAt(undefined, 0)).toBe(0);
  });
});

describe("levels", () => {
  /** What the filter does to a tone v: brightness(b) multiplies, then contrast(c) spreads round the middle. */
  const apply = (f: string, v: number) => { const [b, c] = [...f.matchAll(/\(([\d.]+)\)/g)].map((x) => +x[1]!); return (v * b! - 0.5) * c! + 0.5; };
  test("a faded picture's darkest tone goes to black and its brightest to white", () => {
    const f = levelsFilter(0.2, 0.8, 1);
    expect(apply(f, 0.2)).toBeCloseTo(0, 3);
    expect(apply(f, 0.8)).toBeCloseTo(1, 3);
    expect(apply(f, 0.5)).toBeCloseTo(0.5, 3);
  });
  test("at no strength the picture is left as it is", () => {
    const f = levelsFilter(0.2, 0.8, 0);
    for (const v of [0, 0.3, 0.9]) expect(apply(f, v)).toBeCloseTo(v, 3);
  });
});
