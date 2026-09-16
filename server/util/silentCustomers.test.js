// server/util/silentCustomers.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySilence, isStaffAccount, isLiveDesktop } from "./silentCustomers.js";

const NOW = new Date("2026-09-16T08:00:00Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
const inAYear = new Date("2027-09-16T00:00:00Z");

const licence = (over = {}) => ({
  productKey: "revit",
  status: "active",
  expiresAt: inAYear,
  seats: 8,
  organizationName: "Y.S. Associates Ltd",
  devices: [],
  ...over,
});

test("a licence last used three weeks ago is silent, with the day count", () => {
  const s = classifySilence({
    entitlements: [licence({ devices: [{ lastSeenAt: daysAgo(21) }] })],
    now: NOW,
  });
  assert.equal(s.neverUsed, false);
  assert.equal(s.days, 21);
  assert.equal(s.seats, 8);
  assert.equal(s.organizationName, "Y.S. Associates Ltd");
});

test("a licence used this week is not silent", () => {
  const s = classifySilence({
    entitlements: [licence({ devices: [{ lastSeenAt: daysAgo(3) }] })],
    now: NOW,
  });
  assert.equal(s, null);
});

test("a recent usage heartbeat outweighs an old sign-in", () => {
  // Plugins stay signed in for weeks, so lastSeenAt alone would flag people
  // who use the software every day.
  const s = classifySilence({
    entitlements: [licence({ devices: [{ lastSeenAt: daysAgo(60) }] })],
    lastUsageAt: daysAgo(1),
    now: NOW,
  });
  assert.equal(s, null);
});

test("a revoked machine still counts as evidence of use", () => {
  // Revoking frees a seat. It does not change when the machine was last seen,
  // and freeing seats for a firm must not put them on the call list.
  const s = classifySilence({
    entitlements: [licence({ devices: [{ lastSeenAt: daysAgo(2), revokedAt: daysAgo(1) }] })],
    now: NOW,
  });
  assert.equal(s, null);
});

test("a never-used licence gets a grace period from when it was granted", () => {
  const fresh = classifySilence({ entitlements: [licence()], grantedAt: daysAgo(2), now: NOW });
  assert.equal(fresh, null);

  const stale = classifySilence({ entitlements: [licence()], grantedAt: daysAgo(30), now: NOW });
  assert.equal(stale.neverUsed, true);
  assert.equal(stale.days, 30);
});

test("an expired or disabled licence is the renewal desk's business, not silence", () => {
  const expired = licence({ expiresAt: daysAgo(10), devices: [{ lastSeenAt: daysAgo(90) }] });
  const disabled = licence({ status: "disabled", devices: [{ lastSeenAt: daysAgo(90) }] });
  assert.equal(classifySilence({ entitlements: [expired], now: NOW }), null);
  assert.equal(classifySilence({ entitlements: [disabled], now: NOW }), null);
});

test("web-only entitlements are ignored", () => {
  assert.equal(isLiveDesktop({ productKey: "boq-import", status: "active", expiresAt: inAYear }, NOW), false);
  assert.equal(
    classifySilence({ entitlements: [{ productKey: "ai", status: "active", expiresAt: inAYear }], now: NOW }),
    null,
  );
});

test("seats add up across silent products, and days is the shortest quiet spell", () => {
  const s = classifySilence({
    entitlements: [
      licence({ productKey: "revit", seats: 8, devices: [{ lastSeenAt: daysAgo(70) }] }),
      licence({ productKey: "planswift", seats: 8, devices: [{ lastSeenAt: daysAgo(20) }] }),
    ],
    now: NOW,
  });
  assert.equal(s.seats, 16);
  assert.equal(s.days, 20);
  assert.equal(s.products.length, 2);
});

test("one product in use does not hide others that have gone dark", () => {
  // Y.S. Associates, 15 Sep 2026: Rate Gen came back on a new build while
  // QUIV, HERON and MEP had not been seen since 8 July. Judging the account as
  // a whole called them healthy.
  const s = classifySilence({
    entitlements: [
      licence({ productKey: "mep", devices: [{ lastSeenAt: daysAgo(70), revokedAt: daysAgo(1) }] }),
      licence({ productKey: "revit", devices: [{ lastSeenAt: daysAgo(70), revokedAt: daysAgo(1) }] }),
      licence({ productKey: "planswift", devices: [{ lastSeenAt: daysAgo(71), revokedAt: daysAgo(1) }] }),
      licence({ productKey: "rategen", devices: [{ lastSeenAt: daysAgo(1), revokedAt: daysAgo(1) }] }),
    ],
    now: NOW,
  });
  assert.ok(s, "the account must be flagged");
  assert.deepEqual(s.products.map((p) => p.productKey).sort(), ["mep", "planswift", "revit"]);
  assert.equal(s.seats, 24);
  assert.equal(s.days, 70);
  assert.equal(s.neverUsed, false);
});

test("usage heartbeats count per product", () => {
  const s = classifySilence({
    entitlements: [
      licence({ productKey: "revit", devices: [{ lastSeenAt: daysAgo(60) }] }),
      licence({ productKey: "planswift", devices: [{ lastSeenAt: daysAgo(60) }] }),
    ],
    lastUsageAt: new Map([["revit", daysAgo(2)]]),
    now: NOW,
  });
  assert.deepEqual(s.products.map((p) => p.productKey), ["planswift"]);
  assert.equal(s.seats, 8);
});

test("neverUsed is true only when every silent product has never been used", () => {
  const mixed = classifySilence({
    entitlements: [
      licence({ productKey: "revit", devices: [{ lastSeenAt: daysAgo(40) }] }),
      licence({ productKey: "mep" }),
    ],
    grantedAt: daysAgo(90),
    now: NOW,
  });
  assert.equal(mixed.neverUsed, false);
  assert.equal(mixed.products.length, 2);
  assert.equal(mixed.days, 40);
});

test("staff accounts never land on the customer list", () => {
  assert.equal(isStaffAccount({ role: "admin", email: "x@gmail.com" }), true);
  assert.equal(isStaffAccount({ role: "mini_admin", email: "x@gmail.com" }), true);
  assert.equal(isStaffAccount({ isGod: true, email: "x@gmail.com" }), true);
  assert.equal(isStaffAccount({ role: "user", email: "admin@adlmstudio.net" }), true);
  assert.equal(isStaffAccount({ role: "user", email: "sundayinnocent1988@gmail.com" }), false);
  assert.equal(isStaffAccount({ email: "someone@firm.com" }), false);
});
