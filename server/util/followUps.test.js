// server/util/followUps.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import dayjs from "dayjs";
import { effectiveStatus } from "./followUps.js";

const past = dayjs().subtract(30, "day").toDate();
const future = dayjs().add(30, "day").toDate();

test("an active entitlement past its expiry is expired, whatever the stored status says", () => {
  // This is the whole point: nothing rewrites `status` when a date passes, so
  // the call list would be empty if we trusted the stored value.
  assert.equal(effectiveStatus({ status: "active", expiresAt: past }), "expired");
});

test("an active entitlement still in date is active", () => {
  assert.equal(effectiveStatus({ status: "active", expiresAt: future }), "active");
});

test("an active entitlement with no expiry never lapses", () => {
  assert.equal(effectiveStatus({ status: "active", expiresAt: null }), "active");
});

test("a never-activated entitlement is not a renewal call", () => {
  // Nobody lost access, so there is nothing to win back — it must not show up
  // on the list as churn.
  assert.equal(effectiveStatus({ status: "inactive", expiresAt: past }), "inactive");
  assert.equal(effectiveStatus({ status: "inactive", expiresAt: future }), "inactive");
});

test("a disabled entitlement is never counted", () => {
  assert.equal(effectiveStatus({ status: "disabled", expiresAt: past }), "disabled");
  assert.equal(effectiveStatus({ status: "disabled", expiresAt: future }), "disabled");
});

test("an unparseable expiry falls back to the stored status", () => {
  assert.equal(
    effectiveStatus({ status: "active", expiresAt: "not-a-date" }),
    "active",
  );
});
