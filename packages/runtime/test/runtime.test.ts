import { expect, test } from "bun:test";
import { hitSpot } from "../src/mount.ts";

test("the creature under a point is the one it is deepest inside, and open water is nobody's", () => {
  const spots = [{ id: "a", x: 100, y: 100, r: 40 }, { id: "b", x: 150, y: 100, r: 40 }, { id: "a", x: 300, y: 300, r: 10 }];
  expect(hitSpot(spots, 110, 100)).toBe("a");
  // Inside both: the one it is deeper inside, whichever comes last.
  expect(hitSpot(spots, 120, 100)).toBe("a");
  expect(hitSpot(spots, 130, 100)).toBe("b");
  expect(hitSpot(spots, 140, 100)).toBe("b");
  expect(hitSpot(spots, 302, 301)).toBe("a");
  expect(hitSpot(spots, 220, 220)).toBeNull();
  expect(hitSpot([], 0, 0)).toBeNull();
});
