// server/middleware/designMode.test.js
// The mask is the only thing standing between a design-access user and the
// real customer list, so its behaviour is pinned here rather than trusted.
import { test } from "node:test";
import assert from "node:assert/strict";
import { __test, designPolicy } from "./designMode.js";

const { maskValue } = __test;
const mask = (body, seed = "/admin/test") => maskValue("", body, seed);

test("personal details never survive the mask", () => {
  const out = mask({
    email: "richard@realcustomer.com",
    firstName: "Richard",
    lastName: "Okonkwo",
    username: "richard_o",
    whatsapp: "+2348031234567",
    company: "Real Client Ltd",
    city: "Lagos",
  });

  assert.notEqual(out.email, "richard@realcustomer.com");
  assert.match(out.email, /@example-demo\.test$/);
  assert.notEqual(out.firstName, "Richard");
  assert.notEqual(out.lastName, "Okonkwo");
  assert.notEqual(out.username, "richard_o");
  assert.notEqual(out.whatsapp, "+2348031234567");
  assert.notEqual(out.company, "Real Client Ltd");
});

test("an email is masked even under an unexpected key name", () => {
  const out = mask({ someField: "leak@real.com" });
  assert.notEqual(out.someField, "leak@real.com");
  assert.match(out.someField, /@example-demo\.test$/);
});

test("money and volume are replaced but keep their magnitude", () => {
  const out = mask({ totalRevenue: 4_812_500, amount: 45_000, userCount: 1423 });
  assert.notEqual(out.totalRevenue, 4_812_500);
  assert.ok(out.totalRevenue >= 1_000_000, "millions stay millions");
  assert.notEqual(out.amount, 45_000);
  assert.ok(out.amount >= 1_000 && out.amount < 100_000);
  assert.notEqual(out.userCount, 1423);
});

test("structural values are preserved so the UI still works", () => {
  const out = mask({
    _id: "652f1c9a4b2e7d1a3c8f0b11",
    status: "active",
    role: "mini_admin",
    productKey: "revit",
    currency: "NGN",
    disabled: true,
    page: 2,
    limit: 50,
    createdAt: "2026-03-14T09:20:00.000Z",
  });

  assert.equal(out._id, "652f1c9a4b2e7d1a3c8f0b11");
  assert.equal(out.status, "active");
  assert.equal(out.role, "mini_admin");
  assert.equal(out.productKey, "revit");
  assert.equal(out.currency, "NGN");
  assert.equal(out.disabled, true);
  assert.equal(out.page, 2);
  assert.equal(out.limit, 50);
  assert.equal(out.createdAt, "2026-03-14T09:20:00.000Z");
});

test("long free text is replaced even under an unrecognised key", () => {
  const secret = "Confidential note about a named client and their contract value.";
  const out = mask({ someUnknownField: secret });
  assert.notEqual(out.someUnknownField, secret);
});

test("lists are truncated so the real total can't be counted", () => {
  const rows = Array.from({ length: 400 }, (_, i) => ({
    _id: String(i),
    email: `user${i}@real.com`,
  }));
  const out = mask({ rows });
  assert.ok(out.rows.length <= 12, `expected <= 12 rows, got ${out.rows.length}`);
  assert.ok(out.rows.length >= 6);
  for (const r of out.rows) assert.match(r.email, /@example-demo\.test$/);
});

test("scalar and structural arrays pass through intact", () => {
  const out = mask({
    permissions: ["users", "invoices"],
    areas: [{ key: "users", label: "Users" }],
    tags: ["draft", "featured"],
  });
  assert.deepEqual(out.permissions, ["users", "invoices"]);
  assert.deepEqual(out.areas, [{ key: "users", label: "Users" }]);
  assert.deepEqual(out.tags, ["draft", "featured"]);
});

test("nested records are masked all the way down", () => {
  const out = mask({
    purchase: { buyer: { email: "deep@real.com", firstName: "Deep" }, amount: 250_000 },
  });
  assert.match(out.purchase.buyer.email, /@example-demo\.test$/);
  assert.notEqual(out.purchase.buyer.firstName, "Deep");
  assert.notEqual(out.purchase.amount, 250_000);
});

test("the same field masks to the same value on every call", () => {
  const body = { email: "stable@real.com", amount: 90_000 };
  assert.deepEqual(mask(body), mask(body));
});

test("a top-level array response is masked too", () => {
  const out = mask([{ email: "list@real.com" }]);
  assert.ok(Array.isArray(out));
  assert.match(out[0].email, /@example-demo\.test$/);
});

/* ─────────────────────────────── request policy ────────────────────────────── */

test("writes are simulated, never executed", () => {
  assert.equal(designPolicy("POST", "/admin/users-lite/123/entitlements"), "simulate");
  assert.equal(designPolicy("PATCH", "/admin/products/abc"), "simulate");
  assert.equal(designPolicy("DELETE", "/admin/coupons/xyz"), "simulate");
  assert.equal(designPolicy("PUT", "/admin/settings"), "simulate");
});

test("file exports are refused — the mask cannot reach inside a byte stream", () => {
  assert.equal(designPolicy("GET", "/admin/invoices/123/pdf"), "block");
  assert.equal(designPolicy("GET", "/admin/users-lite/export"), "block");
  assert.equal(designPolicy("GET", "/admin/proposals/9/download"), "block");
  assert.equal(designPolicy("GET", "/admin/reports/summary.csv"), "block");
});

test("a blocked export stays blocked even as a write", () => {
  assert.equal(designPolicy("POST", "/admin/invoices/123/pdf"), "block");
});

test("platform-describing screens are served unmasked", () => {
  assert.equal(designPolicy("GET", "/admin/roles"), "passthrough");
  assert.equal(designPolicy("GET", "/admin/roles/catalog"), "passthrough");
  assert.equal(designPolicy("GET", "/admin/settings"), "passthrough");
  assert.equal(designPolicy("GET", "/admin/products"), "passthrough");
});

test("screens holding customer data are always masked", () => {
  assert.equal(designPolicy("GET", "/admin/users-lite"), "mask");
  assert.equal(designPolicy("GET", "/admin/roles/users"), "mask");
  assert.equal(designPolicy("GET", "/admin/roles/mini_admin/members"), "mask");
  assert.equal(designPolicy("GET", "/admin/roles/area-users"), "mask");
  assert.equal(designPolicy("GET", "/admin/waitlist"), "mask");
  assert.equal(designPolicy("GET", "/admin/ai-usage"), "mask");
});

test("a word ending in 'id' is money, not an identifier", () => {
  // amountPaid once slipped through untouched because ".*id" matched "…aid".
  const out = mask({ amountPaid: 1_750_000, totalPaid: 90_000, isValid: 42_000 });
  assert.notEqual(out.amountPaid, 1_750_000);
  assert.notEqual(out.totalPaid, 90_000);
  assert.notEqual(out.isValid, 42_000);
});

test("genuine identifier keys are still preserved", () => {
  const out = mask({ userId: "abc123", parent_id: "p-9", _id: "x1", id: "y2" });
  assert.equal(out.userId, "abc123");
  assert.equal(out.parent_id, "p-9");
  assert.equal(out._id, "x1");
  assert.equal(out.id, "y2");
});

test("a priced rate keeps its magnitude instead of collapsing to a percentage", () => {
  const out = mask({ rate: 45_000 });
  assert.notEqual(out.rate, 45_000);
  assert.ok(out.rate >= 1_000, "a RateGen rate is money, not a percent");
});
