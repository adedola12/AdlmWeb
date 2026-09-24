import { describe, it, expect } from "vitest";
import { upcomingTrainings } from "./upcomingTrainings.js";

const NOW = Date.parse("2026-09-24T09:00:00.000Z");
const at = (days, hours = 0) =>
  new Date(NOW + days * 86400000 + hours * 3600000).toISOString();

const ev = (id, startAt, endAt) => ({ _id: id, title: id, startAt, endAt });

describe("upcomingTrainings", () => {
  it("drops a session that has finished", () => {
    const list = [ev("last month", at(-30), at(-28)), ev("next month", at(30), at(32))];
    expect(upcomingTrainings(list, NOW).map((e) => e._id)).toEqual(["next month"]);
  });

  it("keeps a session that is running today", () => {
    // The case a startAt-only filter gets wrong: day two of a three-day
    // workshop is still a session someone can walk into.
    const list = [ev("running", at(-1), at(1))];
    expect(upcomingTrainings(list, NOW).map((e) => e._id)).toEqual(["running"]);
  });

  it("keeps a one-day session until the end of the day it starts", () => {
    const list = [ev("later today", at(0, 6)), ev("earlier today", at(0, -6))];
    expect(upcomingTrainings(list, NOW).map((e) => e._id)).toEqual(["later today"]);
  });

  it("orders by when a session starts, soonest first", () => {
    const list = [ev("third", at(30)), ev("first", at(2)), ev("second", at(9))];
    expect(upcomingTrainings(list, NOW).map((e) => e._id)).toEqual(["first", "second", "third"]);
  });

  it("drops an event with no usable start date rather than showing it undated", () => {
    const list = [ev("no date"), ev("nonsense", "soon"), ev("real", at(3))];
    expect(upcomingTrainings(list, NOW).map((e) => e._id)).toEqual(["real"]);
  });

  it("falls back to the start when the end date cannot be read", () => {
    const list = [ev("bad end", at(5), "TBC"), ev("bad end, past", at(-5), "TBC")];
    expect(upcomingTrainings(list, NOW).map((e) => e._id)).toEqual(["bad end"]);
  });

  it("survives a failed fetch handing it something that is not a list", () => {
    expect(upcomingTrainings(null, NOW)).toEqual([]);
    expect(upcomingTrainings(undefined, NOW)).toEqual([]);
    expect(upcomingTrainings({ items: [] }, NOW)).toEqual([]);
  });
});
