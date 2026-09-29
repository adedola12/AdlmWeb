import { describe, expect, it } from "vitest";
import { elongatedFrame } from "./modelFraming.js";

const box = (sx, sy, sz) => ({ min: { x: 0, y: 0, z: 0 }, max: { x: sx, y: sy, z: sz } });

describe("elongatedFrame", () => {
  it("leaves a building to the whole-model fit", () => {
    expect(elongatedFrame(box(17, 8, 12))).toBeNull();
    expect(elongatedFrame(box(7.5, 7, 16))).toBeNull();
  });

  it("frames the first stretch of a road along x and looks down it", () => {
    const f = elongatedFrame(box(480, 3, 12));
    expect(f.min.x).toBe(0);
    expect(f.max.x).toBe(36);
    expect(f.max.z).toBe(12);
    expect(f.dir.x).toBeLessThan(0);
    expect(f.dir.y).toBeGreaterThan(0);
  });

  it("handles a corridor running along z, with a 30 m minimum stretch", () => {
    const f = elongatedFrame(box(6, 2, 1200));
    expect(f.max.z).toBe(30);
    expect(f.max.x).toBe(6);
    expect(f.dir.z).toBeLessThan(0);
  });

  it("never frames more than the model", () => {
    const f = elongatedFrame(box(28, 1, 4));
    expect(f.max.x).toBe(28);
  });

  it("ignores an empty or flat plan", () => {
    expect(elongatedFrame(box(0, 1, 0))).toBeNull();
  });
});
