import { describe, it, expect } from "vitest";
import dayjs from "dayjs";
import { isExpiryPast, daysUntilExpiry } from "./expiryDays.js";

describe("daysUntilExpiry", () => {
  it("returns null without a usable date", () => {
    expect(daysUntilExpiry(null)).toBe(null);
    expect(daysUntilExpiry("not-a-date")).toBe(null);
  });

  it("is 0 all through the expiry day", () => {
    const exp = new Date("2026-09-16T11:00:00Z"); // 16 Sep in Lagos
    expect(daysUntilExpiry(exp, dayjs("2026-09-15T23:05:00Z"))).toBe(0); // 00:05 WAT
    expect(daysUntilExpiry(exp, dayjs("2026-09-16T22:55:00Z"))).toBe(0); // 23:55 WAT
  });

  it("counts whole days in the hour after Lagos midnight", () => {
    // 23:50 UTC on 25 Sep is 00:50 WAT on 26 Sep. The old
    // ceil(hours / 24) read 9 here.
    for (let m = 0; m < 60; m += 5) {
      const now = dayjs("2026-09-25T23:00:00Z").add(m, "minute");
      expect(daysUntilExpiry(now.subtract(10, "day").toDate(), now)).toBe(-10);
      expect(daysUntilExpiry(now.add(10, "day").toDate(), now)).toBe(10);
    }
  });

  it("uses the Lagos day, not the UTC day", () => {
    // 23:30 UTC on 15 Sep is already 16 Sep in Lagos.
    const exp = new Date("2026-09-15T23:30:00Z");
    expect(daysUntilExpiry(exp, dayjs("2026-09-16T22:30:00Z"))).toBe(0);
    expect(daysUntilExpiry(exp, dayjs("2026-09-16T23:10:00Z"))).toBe(-1);
  });
});

describe("isExpiryPast", () => {
  it("is false through the expiry day and true the next Lagos day", () => {
    const exp = new Date("2026-09-15T23:30:00Z"); // 16 Sep in Lagos
    expect(isExpiryPast(exp, dayjs("2026-09-16T22:30:00Z"))).toBe(false);
    expect(isExpiryPast(exp, dayjs("2026-09-16T23:10:00Z"))).toBe(true);
    expect(isExpiryPast(null)).toBe(false);
  });
});
