import test from "node:test";
import assert from "node:assert/strict";
import { originVerify, originVerifyMode, ORIGIN_VERIFY_HEADER } from "./originVerify.js";

const SECRET = "s3cret-value-for-tests";

function run(env, headers = {}) {
  const warnings = [];
  const req = { method: "POST", path: "/auth/signup", headers: { ...headers } };
  const res = {
    code: null,
    body: null,
    status(c) {
      this.code = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
  let passed = false;
  originVerify({ env, log: { warn: (m) => warnings.push(m) } })(req, res, () => {
    passed = true;
  });
  return { req, res, passed, warnings };
}

test("mode is off without a secret, whatever the mode says", () => {
  assert.equal(originVerifyMode({ ORIGIN_VERIFY_MODE: "enforce" }), "off");
  assert.equal(originVerifyMode({ ORIGIN_VERIFY_MODE: "enforce", ORIGIN_VERIFY_SECRET: SECRET }), "enforce");
  assert.equal(originVerifyMode({ ORIGIN_VERIFY_MODE: "bogus", ORIGIN_VERIFY_SECRET: SECRET }), "off");
});

test("off lets everything through and logs nothing", () => {
  const r = run({});
  assert.equal(r.passed, true);
  assert.equal(r.warnings.length, 0);
});

test("the right header passes in enforce, and is stripped from the request", () => {
  const r = run({ ORIGIN_VERIFY_MODE: "enforce", ORIGIN_VERIFY_SECRET: SECRET }, { [ORIGIN_VERIFY_HEADER]: SECRET });
  assert.equal(r.passed, true);
  assert.equal(r.req.headers[ORIGIN_VERIFY_HEADER], undefined);
  assert.equal(r.warnings.length, 0);
});

test("report logs a missing header but lets the request through", () => {
  const r = run({ ORIGIN_VERIFY_MODE: "report", ORIGIN_VERIFY_SECRET: SECRET });
  assert.equal(r.passed, true);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /would refuse POST \/auth\/signup .*header=missing/);
});

test("enforce refuses a missing or wrong header with 403, without echoing it", () => {
  const missing = run({ ORIGIN_VERIFY_MODE: "enforce", ORIGIN_VERIFY_SECRET: SECRET });
  assert.equal(missing.passed, false);
  assert.equal(missing.res.code, 403);

  const wrong = run({ ORIGIN_VERIFY_MODE: "enforce", ORIGIN_VERIFY_SECRET: SECRET }, { [ORIGIN_VERIFY_HEADER]: "guess" });
  assert.equal(wrong.passed, false);
  assert.equal(wrong.res.code, 403);
  assert.doesNotMatch(wrong.warnings[0], /guess/);
});
