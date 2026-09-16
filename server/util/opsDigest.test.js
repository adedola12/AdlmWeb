// server/util/opsDigest.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDigest, recipients, isNewlySilent } from "./opsDigest.js";

const AT = new Date("2026-09-16T07:00:00Z");

const quiet = (over = {}) => ({
  name: "Innocent Sunday",
  firm: "Y.S. Associates Ltd",
  email: "sundayinnocent1988@gmail.com",
  phone: "08078190250",
  status: "to_call",
  calls: 0,
  seats: 32,
  days: 70,
  neverUsed: false,
  products: ["QUIV", "HERON"],
  isNew: false,
  ...over,
});

test("an empty morning still produces a report, and says so", () => {
  const { subject, html, text } = buildDigest({ at: AT, silent: [], unconfirmed: [], waiting: [], netFails: [], ses: { production: true, sent24h: 3, max24h: 50000 } });
  assert.equal(subject, "ADLM daily watch: 0 quiet customers");
  assert.match(html, /Every paid desktop licence has been used/);
  assert.match(html, /SES is in production/);
  assert.match(text, /Quiet customers: 0/);
});

test("the subject counts what needs a person, and flags the sandbox", () => {
  const { subject } = buildDigest({
    at: AT,
    silent: [quiet(), quiet({ email: "b@x.com", isNew: true })],
    unconfirmed: [{ name: "A", title: "Planswift stopped", productKey: "planswift", resolvedAt: AT, daysSince: 57 }],
    waiting: [],
    netFails: [{ who: "a@b.com", count: 4, paths: ["/me/summary"], last: AT }],
    ses: { production: false, review: "DENIED" },
  });
  assert.equal(
    subject,
    "ADLM daily watch: 2 quiet customers (1 new), 1 unconfirmed fix, 1 blocked browser, SES sandbox",
  );
});

test("the body names the firm, the seats and how long it has been quiet", () => {
  const { html } = buildDigest({ at: AT, silent: [quiet(), quiet({ firm: "", name: "Solo QS", neverUsed: true, days: 30, seats: 4 })], unconfirmed: [], waiting: [], netFails: [], ses: {} });
  assert.match(html, /Y\.S\. Associates Ltd/);
  assert.match(html, />32</);
  assert.match(html, /70 days/);
  assert.match(html, /never used/);
});

test("customer-supplied text is escaped", () => {
  const { html } = buildDigest({
    at: AT,
    silent: [],
    unconfirmed: [{ name: "<script>x</script>", title: "<img src=x>", productKey: "revit", resolvedAt: AT, daysSince: 4 }],
    waiting: [],
    netFails: [],
    ses: {},
  });
  assert.doesNotMatch(html, /<script>x<\/script>/);
  assert.doesNotMatch(html, /<img src=x>/);
  assert.match(html, /&lt;script&gt;/);
});

test("the sandbox warning is explicit", () => {
  const { html } = buildDigest({ at: AT, silent: [], unconfirmed: [], waiting: [], netFails: [], ses: { production: false, review: "PENDING" } });
  assert.match(html, /SES is still in the sandbox/);
  assert.match(html, /PENDING/);
});

test("recipients are parsed, lower-cased and de-duplicated", () => {
  assert.deepEqual(recipients("Dolapo836@gmail.com, fadeyibiebunoluwa@gmail.com;dolapo836@gmail.com"), [
    "dolapo836@gmail.com",
    "fadeyibiebunoluwa@gmail.com",
  ]);
  assert.deepEqual(recipients("not-an-address"), []);
  assert.deepEqual(recipients(""), ["dolapo836@gmail.com"]);
});

test("newly quiet means crossing the line in the last two days", () => {
  assert.equal(isNewlySilent({ neverUsed: false, days: 14 }), true);
  assert.equal(isNewlySilent({ neverUsed: false, days: 15 }), true);
  assert.equal(isNewlySilent({ neverUsed: false, days: 16 }), false);
  assert.equal(isNewlySilent({ neverUsed: true, days: 7 }), true);
  assert.equal(isNewlySilent({ neverUsed: true, days: 40 }), false);
  assert.equal(isNewlySilent({ neverUsed: true, days: null }), false);
  assert.equal(isNewlySilent(null), false);
});
