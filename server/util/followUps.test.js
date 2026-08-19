// server/util/followUps.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import dayjs from "dayjs";
import { effectiveStatus, daysOverdue } from "./followUps.js";

const past = dayjs().subtract(30, "day").toDate();
const future = dayjs().add(30, "day").toDate();

test("an active entitlement past its expiry is expired, whatever the stored status says", () => {
  // This is the whole point: nothing rewrites `status` when a date passes, so
  // the call list would be empty if we trusted the stored value.
  assert.equal(effectiveStatus({ status: "active", expiresAt: past }), "expired");
});

test("an INACTIVE entitlement past its expiry is expired too", () => {
  // The rule that matters most in practice. An expiry date is only ever
  // written when access is granted or renewed, so a past expiry means a real
  // customer lapsed regardless of what `status` says. Counting only "active"
  // here made the call list read empty while the admin Subscriptions tab
  // showed dozens of expired rows.
  assert.equal(effectiveStatus({ status: "inactive", expiresAt: past }), "expired");
  assert.equal(effectiveStatus({ status: "", expiresAt: past }), "expired");
  assert.equal(effectiveStatus({ expiresAt: past }), "expired");
});

test("an entitlement still in date is not on the call list", () => {
  assert.equal(effectiveStatus({ status: "active", expiresAt: future }), "active");
  assert.equal(effectiveStatus({ status: "inactive", expiresAt: future }), "inactive");
});

test("an active entitlement with no expiry never lapses", () => {
  assert.equal(effectiveStatus({ status: "active", expiresAt: null }), "active");
});

test("a stored 'expired' that has not actually lapsed is live", () => {
  // Mirrors effectiveEntStatus in Admin.jsx. Kept so the two screens cannot
  // disagree about the same entitlement.
  assert.equal(effectiveStatus({ status: "expired", expiresAt: future }), "active");
});

test("a disabled entitlement is never counted", () => {
  assert.equal(effectiveStatus({ status: "disabled", expiresAt: past }), "disabled");
  assert.equal(effectiveStatus({ status: "disabled", expiresAt: future }), "disabled");
});

test("expiry is not overdue until the expiry DAY is over", () => {
  // Matches the admin badge: expiring today reads "Expires today", not
  // "Expired 0d", so someone is not called on the last day they still have.
  const today = new Date();
  assert.equal(effectiveStatus({ status: "active", expiresAt: today }), "active");
  assert.equal(daysOverdue(today), 0);
});

test("an unparseable expiry falls back to the stored status", () => {
  assert.equal(
    effectiveStatus({ status: "active", expiresAt: "not-a-date" }),
    "active",
  );
});

test("daysOverdue counts whole days since the expiry day ended", () => {
  assert.equal(daysOverdue(null), 0);
  assert.equal(daysOverdue(future), 0);
  assert.equal(daysOverdue(dayjs().subtract(10, "day").toDate()), 10);
});
