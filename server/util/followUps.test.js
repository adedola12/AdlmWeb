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

  // Pinned, because this read the wall clock and so failed for one hour a
  // night: the hour-based count truncated the minutes past midnight and
  // answered 9 where every other hour answered 10.
  //
  // 4397073 then fixed the cause rather than the symptom — the count is Lagos
  // calendar days now — so the midnight hour answers 10 like the rest, and the
  // tests below this one cover that directly. What is left here is the part
  // still worth holding: the answer must not depend on when the suite runs.
  const at = (hhmm) => dayjs(`2026-09-26T${hhmm}:00`);
  for (const hhmm of ["00:10", "00:40", "01:30", "09:00", "14:00", "23:30"]) {
    const now = at(hhmm);
    assert.equal(daysOverdue(now.subtract(10, "day").toDate(), now), 10, hhmm);
  }
});

test("daysOverdue is right in the hour after Lagos midnight", () => {
  // 23:50 UTC on 25 Sep is 00:50 WAT on 26 Sep. The old hour-based count read
  // 9 here, because the 50 minutes past midnight were truncated away.
  const now = dayjs("2026-09-25T23:50:00Z");
  assert.equal(daysOverdue(new Date("2026-09-15T23:50:00Z"), now), 10);
  assert.equal(daysOverdue(new Date("2026-09-24T23:00:00Z"), now), 1);
  for (let m = 0; m < 60; m += 5) {
    const t = dayjs("2026-09-25T23:00:00Z").add(m, "minute");
    assert.equal(daysOverdue(t.subtract(10, "day").toDate(), t), 10, t.toISOString());
  }
});

test("the expiry day is a Lagos day, whatever zone the server runs in", () => {
  // 23:30 UTC on 15 Sep is 00:30 WAT on 16 Sep, so the customer has all of
  // 16 Sep in Lagos. At 23:30 WAT that evening they are not yet overdue; a
  // UTC-day count would already call them one day late.
  const exp = new Date("2026-09-15T23:30:00Z");
  const lateOnExpiryDay = dayjs("2026-09-16T22:30:00Z");
  assert.equal(daysOverdue(exp, lateOnExpiryDay), 0);
  assert.equal(effectiveStatus({ status: "active", expiresAt: exp }, lateOnExpiryDay), "active");

  const nextLagosDay = dayjs("2026-09-16T23:10:00Z"); // 00:10 WAT, 17 Sep
  assert.equal(daysOverdue(exp, nextLagosDay), 1);
  assert.equal(effectiveStatus({ status: "active", expiresAt: exp }, nextLagosDay), "expired");
});
