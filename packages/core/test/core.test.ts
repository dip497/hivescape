import { describe, expect, test } from "bun:test";
import { clock, contrast, DARK, Effects, Flock, hex, Input, isometric, mix, oklch, parallax, resolveStyle, rng, STYLES, toHex, toOklab, type Frames } from "../src/index.ts";

describe("rng", () => {
  test("the same seed gives the same stream; a fork is its own stream, the same every time", () => {
    const a = rng(42), b = rng(42);
    const xs = Array.from({ length: 50 }, () => a());
    expect(Array.from({ length: 50 }, () => b())).toEqual(xs);
    expect(Array.from({ length: 5 }, rng(42).fork(1))).toEqual(Array.from({ length: 5 }, rng(42).fork(1)));
    expect(Array.from({ length: 5 }, rng(42).fork(1))).not.toEqual(Array.from({ length: 5 }, rng(42).fork(2)));
  });
  test("draws stay in range and spread evenly", () => {
    const r = rng(7), counts = [0, 0, 0, 0];
    for (let i = 0; i < 40_000; i++) { const v = r.int(4); expect(v >= 0 && v < 4).toBe(true); counts[v]!++; }
    for (const c of counts) expect(Math.abs(c - 10_000)).toBeLessThan(500);
  });
});

describe("colour", () => {
  test("hex round-trips and OKLab of white and black is L 1 and 0", () => {
    expect(toHex(hex("#d97757"))).toBe("#d97757");
    expect(toOklab([255, 255, 255])[0]).toBeCloseTo(1, 3);
    expect(toOklab([0, 0, 0])[0]).toBeCloseTo(0, 3);
  });
  test("contrast is WCAG's: black on white 21, a colour on itself 1", () => {
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 1);
    expect(contrast(hex("#336699"), hex("#336699"))).toBeCloseTo(1, 5);
  });
  test("oklch keeps lightness and hue while bringing an impossible chroma into gamut", () => {
    const c = oklch(0.7, 0.4, 30);
    for (const v of c) expect(v >= 0 && v <= 255).toBe(true);
    expect(toOklab(c)[0]).toBeCloseTo(0.7, 2);
  });
  test("a mix's ends are its colours", () => {
    expect(mix(hex("#102030"), hex("#f0e0d0"), 0).map(Math.round)).toEqual([16, 32, 48]);
    expect(mix(hex("#102030"), hex("#f0e0d0"), 1).map(Math.round)).toEqual([240, 224, 208]);
  });
});

/** A display that only moves when told: `advance(ms)` delivers every frame due. */
function fakeFrames(hz: number) {
  let now = 0, id = 0;
  const waiting = new Map<number, (t: number) => void>();
  const frames: Frames = { request: (cb) => { waiting.set(++id, cb); return id; }, cancel: (i) => { waiting.delete(i); }, now: () => now };
  return {
    frames,
    advance(ms: number) {
      const end = now + ms;
      while (now + 1000 / hz <= end) { now += 1000 / hz; const cbs = [...waiting.values()]; waiting.clear(); for (const cb of cbs) cb(now); }
      now = end;
    },
  };
}

describe("clock", () => {
  test("running on a 120 Hz display it draws 30 frames a second and steps 60 times a second", () => {
    const d = fakeFrames(120); let steps = 0, draws = 0;
    const c = clock({ step: () => steps++, draw: () => draws++ }, { frames: d.frames });
    c.setMode("run"); d.advance(2000);
    expect(draws).toBeGreaterThanOrEqual(58); expect(draws).toBeLessThanOrEqual(61);
    expect(steps).toBeGreaterThanOrEqual(116); expect(steps).toBeLessThanOrEqual(122);
  });
  test("held it does nothing at all; still it settles and draws once, and again when something changes", () => {
    const d = fakeFrames(60); let steps = 0, draws = 0;
    const c = clock({ step: () => steps++, draw: () => draws++ }, { frames: d.frames, settleSteps: 10 });
    d.advance(1000); expect([steps, draws]).toEqual([0, 0]);
    c.changed(); expect([steps, draws]).toEqual([0, 1]);
    c.setMode("still"); expect([steps, draws]).toEqual([10, 2]);
    d.advance(1000); expect([steps, draws]).toEqual([10, 2]);
    c.changed(); expect([steps, draws]).toEqual([20, 3]);
  });
  test("a stall does not make it race: at most four steps catch up in one frame", () => {
    const d = fakeFrames(30); let steps = 0;
    const c = clock({ step: () => steps++, draw: () => {} }, { frames: d.frames });
    c.setMode("run"); d.advance(34); const before = steps;
    d.advance(33);
    expect(steps - before).toBeLessThanOrEqual(4);
  });
});

describe("flock", () => {
  test("the grid finds exactly the neighbours brute force finds, across the wrapped edges", () => {
    const f = new Flock(400, 800, 500, rng(3));
    (f as unknown as { bucket(s: number): void }).bucket(60);
    for (let i = 0; i < 400; i += 37) {
      const got = new Set<number>(); f.neighbours(i, 60, (j) => got.add(j));
      const want = new Set<number>();
      for (let j = 0; j < 400; j++) {
        if (j === i) continue;
        let dx = Math.abs(f.x[j]! - f.x[i]!), dy = Math.abs(f.y[j]! - f.y[i]!);
        dx = Math.min(dx, 800 - dx); dy = Math.min(dy, 500 - dy);
        if (dx * dx + dy * dy < 3600) want.add(j);
      }
      expect([...got].sort((a, b) => a - b)).toEqual([...want].sort((a, b) => a - b));
    }
  });
  test("members keep within the field and under their top speed", () => {
    const f = new Flock(300, 640, 400, rng(9));
    for (let s = 0; s < 600; s++) f.step(1 / 60);
    for (let i = 0; i < 300; i++) {
      expect(f.x[i]! >= 0 && f.x[i]! < 640 && f.y[i]! >= 0 && f.y[i]! < 400).toBe(true);
      expect(Math.hypot(f.vx[i]!, f.vy[i]!)).toBeLessThanOrEqual(90.01);
    }
  });
});

describe("input", () => {
  test("a pointer that trembles within 10 px is resting; one that moves further starts over", () => {
    const i = new Input();
    i.point(100, 100); for (let k = 0; k < 60; k++) { i.point(100 + (k % 3), 100 - (k % 2)); i.tick(1 / 60); }
    expect(i.pointer.rested).toBeGreaterThan(0.95);
    i.point(140, 100); i.tick(1 / 60);
    expect(i.pointer.rested).toBeLessThan(0.05);
  });
  test("clicks are handed over once, and a storm is capped", () => {
    const i = new Input();
    for (let k = 0; k < 40; k++) i.click(k, k);
    expect(i.takeClicks().length).toBe(16);
    expect(i.takeClicks().length).toBe(0);
  });
});

test("effects keep at most their cap and drop what has run its life", () => {
  const e = new Effects(3);
  for (let k = 0; k < 5; k++) e.ripple({ x: k, y: 0, at: k, life: 1, speed: 100, strength: 1 });
  expect(e.ripples.map((r) => r.x)).toEqual([2, 3, 4]);
  e.prune(4.5);
  expect(e.ripples.map((r) => r.x)).toEqual([4]);
});

describe("style", () => {
  test("comb is the default, and its row step follows its width so its cells stay regular hexagons", () => {
    const s = resolveStyle({ cell: [20, 5] }, DARK);
    expect(s.kind).toBe("comb");
    expect(s.cell[1]).toBeCloseTo(20 * Math.sqrt(3) / 2, 6);
  });
  test("a host that picks another kind keeps only the scene's light, not its tuning for its own kind", () => {
    const s = resolveStyle({ kind: "comb", cell: [13, 0], gap: 9, ambient: 0.4, glow: 0.9 }, DARK, { kind: "glyph" });
    expect(s.kind).toBe("glyph");
    expect(s.gap).toBe(STYLES.glyph.gap);
    expect(s.cell).toEqual(STYLES.glyph.cell);
    expect([s.ambient, s.glow]).toEqual([0.4, 0.9]);
  });
});

describe("views", () => {
  test("isometric: a ground point comes back from its screen point, at any height", () => {
    const iso = isometric({ tile: 64, origin: { x: 400, y: 120 } });
    for (const [x, y, z] of [[0, 0, 0], [3.5, -2, 0], [7, 4, 1.5]] as const) {
      const p = iso.toScreen(x, y, z), g = iso.toGround(p.x, p.y, z);
      expect(g.x).toBeCloseTo(x, 9); expect(g.y).toBeCloseTo(y, 9);
    }
  });
  test("isometric: one step along x goes half a tile right and a quarter down; height lifts straight up", () => {
    const iso = isometric({ tile: 64 });
    expect(iso.toScreen(1, 0)).toEqual({ x: 32, y: 16 });
    expect(iso.toScreen(0, 1)).toEqual({ x: -32, y: 16 });
    expect(iso.toScreen(0, 0, 1)).toEqual({ x: 0, y: -32 });
  });
  test("isometric: what is nearer the viewer sorts later, so it is drawn over what is behind", () => {
    const iso = isometric({ tile: 64 });
    const items = [{ x: 3, y: 3 }, { x: 0, y: 0 }, { x: 2, y: 0 }].sort((a, b) => iso.depth(a.x, a.y) - iso.depth(b.x, b.y));
    expect(items.map((i) => [i.x, i.y])).toEqual([[0, 0], [2, 0], [3, 3]]);
  });
  test("parallax: the horizon holds still, the near layer moves with the camera, a foreground passes faster", () => {
    const cam = { x: 40, y: -10 };
    expect(parallax(cam, 0)).toEqual({ x: -0, y: 0 });
    expect(parallax(cam, 1)).toEqual({ x: -40, y: 10 });
    expect(Math.abs(parallax(cam, 1.5).x)).toBeGreaterThan(40);
  });
});
