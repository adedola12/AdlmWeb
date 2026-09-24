import test from "node:test";
import assert from "node:assert/strict";
import { noStore, isCacheExempt } from "./noStore.js";

function run(path, headers = {}) {
  const req = { path, headers: { ...headers } };
  const set = {};
  const res = { set: (k, v) => { set[k] = v; } };
  let called = false;
  noStore(req, res, () => { called = true; });
  return { req, set, called };
}

test("personal routes: no-store and no conditional headers reach the route", () => {
  const { req, set, called } = run("/me/summary", {
    "if-none-match": 'W/"abc"',
    "if-modified-since": "Tue, 01 Sep 2026 00:00:00 GMT",
    authorization: "Bearer x",
  });
  assert.equal(called, true);
  assert.equal(set["Cache-Control"], "no-store");
  assert.equal(req.headers["if-none-match"], undefined);
  assert.equal(req.headers["if-modified-since"], undefined);
  assert.equal(req.headers.authorization, "Bearer x");
});

test("rate libraries keep their ETag round-trip", () => {
  for (const p of ["/rategen/library", "/rategen-v2/library/meta", "/admin/rategen-v2/library"]) {
    const { req, set, called } = run(p, { "if-none-match": 'W/"abc"' });
    assert.equal(called, true, p);
    assert.equal(set["Cache-Control"], undefined, p);
    assert.equal(req.headers["if-none-match"], 'W/"abc"', p);
  }
});

test("exemption is a prefix on path segments, not a substring", () => {
  assert.equal(isCacheExempt("/rategen"), true);
  assert.equal(isCacheExempt("/rategenx/foo"), false);
  assert.equal(isCacheExempt("/me/rategen"), false);
  assert.equal(isCacheExempt(undefined), false);
});
