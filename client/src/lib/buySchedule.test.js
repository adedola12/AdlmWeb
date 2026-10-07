import { describe, it, expect } from "vitest";
import {
  clampLeadDays,
  buyByDate,
  startOfDay,
  buyScheduleGroups,
} from "./buySchedule.js";

const NOW = new Date(2026, 8, 22, 14, 30); // 22 Sep 2026, afternoon
const day = (d) => new Date(2026, 8, d);

describe("buy schedule", () => {
  it("clamps the lead time to 0-120 whole days", () => {
    expect(clampLeadDays(14)).toBe(14);
    expect(clampLeadDays(-5)).toBe(0);
    expect(clampLeadDays(999)).toBe(120);
    expect(clampLeadDays("21.4")).toBe(21);
    expect(clampLeadDays("nonsense")).toBe(14);
    expect(clampLeadDays(undefined, 7)).toBe(7);
  });

  it("takes the lead time off the on-site date", () => {
    expect(buyByDate(day(30), 14)).toEqual(new Date(2026, 8, 16));
    expect(buyByDate(day(30), 0)).toEqual(day(30));
  });

  it("gives no buy-by date when nothing says when it is needed", () => {
    expect(buyByDate(null, 14)).toBe(null);
    expect(buyByDate(new Date("nope"), 14)).toBe(null);
  });

  it("counts late, this week and unscheduled against the real today", () => {
    const rows = [
      { key: "a", buyBy: day(20), amount: 100 }, // two days late
      { key: "b", buyBy: day(22), amount: 200 }, // today → this week
      { key: "c", buyBy: day(29), amount: 400 }, // exactly seven days out
      { key: "d", buyBy: day(30), amount: 800 }, // beyond the week
      { key: "e", buyBy: null, amount: 1600 }, // in no task
    ];
    const g = buyScheduleGroups(rows, NOW);
    expect(g.late.map((r) => r.key)).toEqual(["a"]);
    expect(g.week.map((r) => r.key)).toEqual(["b", "c"]);
    expect(g.unscheduled.map((r) => r.key)).toEqual(["e"]);
    expect(g.lateValue).toBe(100);
    expect(g.weekValue).toBe(600);
  });

  it("a material already bought is late for nothing", () => {
    const g = buyScheduleGroups(
      [
        { key: "a", buyBy: day(1), amount: 100, done: true },
        { key: "b", buyBy: day(1), amount: 100 },
      ],
      NOW,
    );
    expect(g.late.map((r) => r.key)).toEqual(["b"]);
    expect(g.lateValue).toBe(100);
  });

  it("survives rows with no numbers and no list at all", () => {
    expect(buyScheduleGroups(null, NOW).late).toEqual([]);
    const g = buyScheduleGroups([{ key: "x", buyBy: day(1), amount: "?" }], NOW);
    expect(g.lateValue).toBe(0);
  });

  it("starts the day at midnight, so late means the day has passed", () => {
    expect(startOfDay(NOW)).toEqual(new Date(2026, 8, 22, 0, 0, 0, 0));
  });
});
