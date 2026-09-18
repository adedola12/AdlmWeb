import test from "node:test";
import assert from "node:assert/strict";
import { mustVerifyEmail, allowedWhileUnverified } from "./emailGate.js";

const future = new Date(Date.now() + 864e5).toISOString();
const past = new Date(Date.now() - 864e5).toISOString();

test("an unconfirmed ordinary account must confirm", () => {
  assert.equal(mustVerifyEmail({ role: "user", emailVerified: false }), true);
  // No claim at all is not "unconfirmed": left alone.
  assert.equal(mustVerifyEmail({ role: "user" }), false);
});

test("a confirmed account is never gated", () => {
  assert.equal(mustVerifyEmail({ role: "user", emailVerified: true }), false);
});

test("staff are never gated", () => {
  for (const u of [
    { role: "admin" },
    { role: "mini_admin" },
    { isSuperAdmin: true },
    { isGod: true },
    { designAccess: true },
    { demoMode: true },
    { role: "user", permissions: ["learn"] },
  ]) {
    assert.equal(mustVerifyEmail({ ...u, emailVerified: false }), false, JSON.stringify(u));
  }
});

test("a live licence is prompted, not locked out; an expired one is not a pass", () => {
  assert.equal(
    mustVerifyEmail({ role: "user", emailVerified: false, entitlements: [{ productKey: "revit", status: "active", expiresAt: future }] }),
    false,
  );
  assert.equal(
    mustVerifyEmail({ role: "user", emailVerified: false, entitlements: [{ productKey: "revit", status: "active", expiresAt: past }] }),
    true,
  );
  assert.equal(
    mustVerifyEmail({ role: "user", emailVerified: false, entitlements: [{ productKey: "revit", status: "disabled" }] }),
    true,
  );
});

test("only the /auth requests are open to an unconfirmed account", () => {
  assert.equal(allowedWhileUnverified("/auth/verify-email"), true);
  assert.equal(allowedWhileUnverified("/auth/resend-verification?x=1"), true);
  assert.equal(allowedWhileUnverified("/auth"), true);
  assert.equal(allowedWhileUnverified("/me/profile"), false);
  assert.equal(allowedWhileUnverified("/projects/revit"), false);
  assert.equal(allowedWhileUnverified("/authx"), false);
});
