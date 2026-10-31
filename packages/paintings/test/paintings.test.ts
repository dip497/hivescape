import { describe, expect, test } from "bun:test";
import { simulate } from "@hivescape/core";
import { blurAt, depthAt, flowPhases, FLOW_CYCLE, levelsFilter, place, shimmerAt, swayAt } from "../src/index.ts";
import suddenShower from "../../../scenes/sudden-shower/src/index.ts";

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

describe("wind", () => {
  test("a field in the wind bends in place: no patch ever moves further than its sway", () => {
    for (let t = 0; t < 60; t += 0.13) for (let i = 0; i < 12; i++) for (let j = 0; j < 6; j++) {
      const [dx, dy] = swayAt(t, i, j, i / 12, 2.5);
      expect(Math.abs(dx)).toBeLessThanOrEqual(2.5);
      expect(Math.abs(dy)).toBeLessThanOrEqual(2.5);
    }
  });
  test("neighbouring patches move on their own beats, so the field ripples rather than sliding as one", () => {
    // At any moment, lull or gust, some patches of a row lean one way while others lean the other.
    for (let t = 0; t < 30; t += 0.7) {
      const xs = Array.from({ length: 20 }, (_, i) => swayAt(t, i, 3, 0.4, 2)[0]);
      expect(xs.some((v) => v > 0) && xs.some((v) => v < 0)).toBe(true);
    }
  });
  test("a gust's band of light sweeps across the field: lit where it is, not where it has not reached", () => {
    // At one moment, patches along a row: the band is somewhere, so some are lit well above the flutter.
    const row = (t: number) => Array.from({ length: 60 }, (_, i) => shimmerAt(t, i, 2, i / 60, 0.3));
    for (const t of [0.5, 2, 4.5]) {
      const xs = row(t);
      expect(Math.max(...xs)).toBeGreaterThan(0.15);
      expect(Math.min(...xs)).toBeLessThan(0.1);
    }
    // The band moves: where it is brightest shifts as time passes.
    const peak = (t: number) => { const xs = row(t); return xs.indexOf(Math.max(...xs)); };
    expect(peak(0.5)).not.toBe(peak(1.5));
  });
  test("the light stays within its strength, and each patch flutters on its own", () => {
    for (let t = 0; t < 20; t += 0.11) for (let i = 0; i < 10; i++) {
      const v = shimmerAt(t, i, 1, i / 10, 0.3);
      expect(v).toBeLessThanOrEqual(0.3 + 1e-9);
      expect(v).toBeGreaterThanOrEqual(-0.12 - 1e-9);
    }
    // Two neighbours out of the gust's band do not flicker together.
    const a = Array.from({ length: 30 }, (_, k) => shimmerAt(3.6 + k * 0.05, 4, 1, 0.05, 0.3));
    const b = Array.from({ length: 30 }, (_, k) => shimmerAt(3.6 + k * 0.05, 5, 1, 0.05, 0.3));
    expect(a.some((v, k) => Math.abs(v - b[k]!) > 0.02)).toBe(true);
  });
  test("each patch keeps moving: it is wind, not a still offset", () => {
    const xs = Array.from({ length: 40 }, (_, k) => swayAt(k * 0.25, 5, 2, 0.3, 2)[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(1.5);
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
