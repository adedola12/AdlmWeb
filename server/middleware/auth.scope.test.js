// server/middleware/auth.scope.test.js
//
// The step-up proof and the God-login challenge share JWT_ACCESS_SECRET with
// access tokens. They carry a `scope`; an access token never does. Neither may
// ever pass as an access token: the God-login challenge is minted after the
// password but BEFORE the email OTP.
import test from "node:test";
import assert from "node:assert/strict";

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";

const auth = await import("./auth.js");
const jwtUtil = await import("../util/jwt.js");

const SUB = "66f1c0ffee0000000000abcd";
const stepUp = jwtUtil.signStepUp({ sub: SUB });
const godChallenge = jwtUtil.signGodChallenge({ sub: SUB });
const access = auth.signAccess({ _id: SUB, email: "a@example.com", role: "user" });

for (const [name, verify] of [
  ["middleware/auth.js", auth.verifyAccess],
  ["util/jwt.js", jwtUtil.verifyAccess],
]) {
  test(`${name}: a real access token still verifies`, () => {
    assert.equal(verify(access)._id, SUB);
  });
  test(`${name}: a step-up token is not an access token`, () => {
    assert.throws(() => verify(stepUp));
  });
  test(`${name}: a God-login challenge is not an access token`, () => {
    assert.throws(() => verify(godChallenge));
  });
}

test("the scoped tokens still verify for their own purpose", () => {
  assert.equal(jwtUtil.verifyStepUp(stepUp).sub, SUB);
  assert.equal(jwtUtil.verifyGodChallenge(godChallenge).sub, SUB);
});

function run(mw, token) {
  return new Promise((resolve) => {
    const req = { headers: { authorization: `Bearer ${token}` }, cookies: {}, originalUrl: "/x" };
    const res = {
      status(code) {
        resolve({ code });
        return { json: () => {} };
      },
    };
    Promise.resolve(mw(req, res, () => resolve({ code: 200 }))).catch(() => resolve({ code: 500 }));
  });
}

test("requireAuth and requireAdmin refuse the God-login challenge", async () => {
  assert.equal((await run(auth.requireAuth, godChallenge)).code, 401);
  assert.equal((await run(auth.requireAdmin, godChallenge)).code, 401);
  assert.equal((await run(auth.requireAuth, stepUp)).code, 401);
});
