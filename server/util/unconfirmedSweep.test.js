import test from "node:test";
import assert from "node:assert/strict";
import { dueToClose, CONFIRM_SCREEN_LIVE } from "./unconfirmedSweep.js";

const DAY = 864e5;
const now = new Date("2026-10-20T00:00:00Z").getTime();
const ago = (d) => new Date(now - d * DAY);

const oldSignup = { role: "user", emailVerified: false, createdAt: new Date("2026-09-05"), emailVerifySentAt: new Date("2026-09-05") };

test("an old sign-up is never closed on codes it had no screen to enter", () => {
  assert.equal(dueToClose(oldSignup, { now }), false);
});

test("an old sign-up is closed 14 days after the reminder, not before", () => {
  assert.equal(dueToClose({ ...oldSignup, emailVerifyReminderAt: ago(15) }, { now }), true);
  assert.equal(dueToClose({ ...oldSignup, emailVerifyReminderAt: ago(10) }, { now }), false);
});

test("a sign-up after the screen went live has 14 days from its last code", () => {
  const u = { role: "user", emailVerified: false, createdAt: new Date(CONFIRM_SCREEN_LIVE.getTime() + DAY) };
  assert.equal(dueToClose({ ...u, emailVerifySentAt: ago(15) }, { now }), true);
  assert.equal(dueToClose({ ...u, emailVerifySentAt: ago(3) }, { now }), false);
});

test("confirmed, staff, licensed or paying accounts are never closed", () => {
  const due = { ...oldSignup, emailVerifyReminderAt: ago(30) };
  assert.equal(dueToClose({ ...due, emailVerified: true }, { now }), false);
  assert.equal(dueToClose({ ...due, role: "mini_admin" }, { now }), false);
  assert.equal(dueToClose({ ...due, permissions: ["learn"] }, { now }), false);
  assert.equal(
    dueToClose({ ...due, entitlements: [{ status: "active", expiresAt: new Date(now + DAY) }] }, { now }),
    false,
  );
  assert.equal(dueToClose(due, { now, purchased: true }), false);
  assert.equal(dueToClose({ ...due, disabled: true }, { now }), false);
});
