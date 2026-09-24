import test from "node:test";
import assert from "node:assert/strict";

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-secret-email-gate";
const { requireAuth, signAccess } = await import("./auth.js");

function run(token, url) {
  return new Promise((resolve) => {
    const req = { headers: { authorization: `Bearer ${token}` }, originalUrl: url, get: () => "" };
    const res = {
      status(code) { this.code = code; return this; },
      json(body) { resolve({ code: this.code, body }); },
      setHeader() {},
    };
    requireAuth(req, res, () => resolve({ code: 200 }));
  });
}

const unconfirmed = () => signAccess({ id: "u1", email: "a@b.co", role: "user", emailVerified: false, entitlements: [] });

test("an unconfirmed account is refused outside /auth, with the reason", async () => {
  const r = await run(unconfirmed(), "/me/profile");
  assert.equal(r.code, 403);
  assert.equal(r.body.code, "EMAIL_NOT_VERIFIED");
});

test("an unconfirmed account can still confirm, ask again and refresh", async () => {
  for (const url of ["/auth/verify-email", "/auth/resend-verification", "/auth/refresh"]) {
    assert.equal((await run(unconfirmed(), url)).code, 200, url);
  }
});

test("a confirmed account passes everywhere", async () => {
  const t = signAccess({ id: "u2", email: "c@d.co", role: "user", emailVerified: true });
  assert.equal((await run(t, "/me/profile")).code, 200);
});
