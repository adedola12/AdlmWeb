// Rates are built in Rate Gen (owner's rule, 4 Oct 2026): a browser may read
// the rate library but not write to it. The failure that must never happen is
// the opposite one, Rate Gen desktop losing its sync, so that is tested first.
import test from "node:test";
import assert from "node:assert/strict";

import {
  RATES_BUILT_IN_RATEGEN,
  isBrowserRateWrite,
  isBrowserRequest,
  refuseBrowserRateWrites,
} from "./rateGenOnlyWrites.js";

// Shaped like an Express request: lower-cased `headers` plus `get()`.
const reqWith = (method, headers = {}) => ({
  method,
  headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
  get(name) {
    const k = String(name).toLowerCase();
    const found = Object.keys(headers).find((h) => h.toLowerCase() === k);
    return found ? headers[found] : undefined;
  },
});

const BROWSER = { origin: "https://adlmstudio.net", "sec-fetch-site": "same-site" };

function run(req) {
  let nextCalled = false;
  const res = {
    statusCode: 200,
    body: null,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
  refuseBrowserRateWrites(req, res, () => {
    nextCalled = true;
  });
  return { nextCalled, res };
}

test("Rate Gen desktop and the plugins keep writing", () => {
  for (const method of ["PUT", "PATCH", "DELETE"]) {
    // .NET HttpClient: no Origin, no Sec-Fetch-*.
    assert.equal(run(reqWith(method, { "user-agent": "RateGen/2.9" })).nextCalled, true);
    assert.equal(run(reqWith(method, {})).nextCalled, true);
    // Naming itself is fine as long as it is not a browser.
    assert.equal(run(reqWith(method, { "x-adlm-client": "rategen" })).nextCalled, true);
  }
});

test("X-ADLM-Client does not let a browser through: page code can set it", () => {
  for (const headers of [
    { origin: "https://adlmstudio.net", "x-adlm-client": "rategen" },
    { "sec-fetch-mode": "cors", "x-adlm-client": "rategen" },
    { ...BROWSER, "X-ADLM-Client": "installer-hub" },
  ]) {
    const { nextCalled, res } = run(reqWith("PUT", headers));
    assert.equal(nextCalled, false, JSON.stringify(headers));
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, RATES_BUILT_IN_RATEGEN);
  }
});

test("any Sec-Fetch-* header marks a browser, not only Sec-Fetch-Site", () => {
  for (const h of ["sec-fetch-site", "sec-fetch-mode", "sec-fetch-dest", "Sec-Fetch-User"]) {
    assert.equal(isBrowserRequest(reqWith("GET", { [h]: "x" })), true, h);
  }
  assert.equal(isBrowserRequest(reqWith("GET", { "user-agent": "RateGen/2.9" })), false);
});

test("a browser's PUT, PATCH and DELETE are refused with 403 and a reason", () => {
  for (const method of ["PUT", "PATCH", "DELETE", "put"]) {
    for (const headers of [
      BROWSER,
      { origin: "https://adlmstudio.net" },
      { "sec-fetch-site": "same-origin" },
    ]) {
      const { nextCalled, res } = run(reqWith(method, headers));
      assert.equal(nextCalled, false, `${method} ${JSON.stringify(headers)} must not reach the route`);
      assert.equal(res.statusCode, 403);
      assert.equal(res.body.code, RATES_BUILT_IN_RATEGEN);
      assert.match(res.body.error, /built and edited in ADLM Rate Gen/);
    }
  }
});

test("a browser can still read, look up prices and restore an archived rate", () => {
  for (const method of ["GET", "HEAD", "OPTIONS", "POST"]) {
    assert.equal(isBrowserRateWrite(reqWith(method, BROWSER)), false, method);
    assert.equal(run(reqWith(method, BROWSER)).nextCalled, true, method);
  }
});
