// server/util/demoData.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { maskPayload } from "./demoData.js";

test("identities are replaced, never passed through", () => {
  const out = maskPayload({
    email: "enochrichard6@gmail.com",
    firstName: "Richard",
    lastName: "Enoch",
    phone: "+2348031234567",
  });

  assert.notEqual(out.email, "enochrichard6@gmail.com");
  assert.notEqual(out.firstName, "Richard");
  assert.notEqual(out.lastName, "Enoch");
  assert.notEqual(out.phone, "+2348031234567");
  // Reserved domain — a demo address can never reach a real inbox.
  assert.match(out.email, /@example\.com$/);
});

test("the same real value always yields the same placeholder", () => {
  const once = maskPayload({ email: "a@real.com", name: "Ada Real" });
  const twice = maskPayload({ email: "a@real.com", name: "Ada Real" });
  assert.deepEqual(once, twice);
});

test("different real values yield different placeholders", () => {
  const a = maskPayload({ email: "one@real.com" }).email;
  const b = maskPayload({ email: "two@real.com" }).email;
  assert.notEqual(a, b);
});

test("`name` is masked on a person record but survives on a titled record", () => {
  // Has an email → a person.
  const person = maskPayload({ name: "Ada Okafor", email: "ada@real.com" });
  assert.notEqual(person.name, "Ada Okafor");

  // No email → a product/course/role title, which the UI needs intact.
  const product = maskPayload({ name: "ADLM Revit Plugin", price: 45000 });
  assert.equal(product.name, "ADLM Revit Plugin");
});

test("structural fields survive so the UI still renders", () => {
  const out = maskPayload({
    _id: "652f1a9c8b3d4e0012ab34cd",
    id: "652f1a9c8b3d4e0012ab34cd",
    key: "adminhub",
    role: "mini_admin",
    status: "active",
    currency: "NGN",
    createdAt: "2026-01-08T07:25:06Z",
  });
  assert.equal(out._id, "652f1a9c8b3d4e0012ab34cd");
  assert.equal(out.key, "adminhub");
  assert.equal(out.role, "mini_admin");
  assert.equal(out.status, "active");
  assert.equal(out.currency, "NGN");
  assert.equal(out.createdAt, "2026-01-08T07:25:06Z");
});

test("money is replaced but keeps its order of magnitude", () => {
  const out = maskPayload({ total: 45000, balance: 250 });
  assert.notEqual(out.total, 45000);
  assert.equal(String(Math.floor(out.total)).length, 5);
  assert.equal(String(Math.floor(out.balance)).length, 3);
});

test("a zero balance stays zero", () => {
  // "Nothing outstanding" is a layout state, not a figure worth hiding.
  assert.equal(maskPayload({ balance: 0 }).balance, 0);
});

test("generic numeric keys are left alone", () => {
  // `value` and `count` carry settings and list totals — masking them would
  // corrupt screens that hold no customer data at all.
  const out = maskPayload({ value: 12, count: 340, userCount: 7 });
  assert.equal(out.value, 12);
  assert.equal(out.count, 340);
  assert.equal(out.userCount, 7);
});

test("nested arrays and objects are walked, and shape is preserved", () => {
  const payload = {
    users: [
      { _id: "a1", name: "Real One", email: "one@real.com", walletBalance: 5000 },
      { _id: "b2", name: "Real Two", email: "two@real.com", walletBalance: 7500 },
    ],
    page: 1,
  };
  const out = maskPayload(payload);

  assert.equal(out.users.length, 2);
  assert.equal(out.page, 1);
  assert.equal(out.users[0]._id, "a1");
  assert.notEqual(out.users[0].email, "one@real.com");
  assert.notEqual(out.users[0].name, "Real One");
  assert.notEqual(out.users[0].walletBalance, 5000);
  // Two distinct people must not collapse into one placeholder.
  assert.notEqual(out.users[0].name, out.users[1].name);
});

test("the input payload is never mutated", () => {
  const input = { email: "keep@real.com" };
  maskPayload(input);
  assert.equal(input.email, "keep@real.com");
});

test("null, undefined and empty values do not throw", () => {
  assert.deepEqual(maskPayload({ email: null, name: undefined, total: null }), {
    email: null,
    name: undefined,
    total: null,
  });
  assert.equal(maskPayload(null), null);
  assert.deepEqual(maskPayload([]), []);
});

test("Dates survive the walk intact", () => {
  const d = new Date("2026-01-08T07:25:06Z");
  const out = maskPayload({ createdAt: d, email: "x@real.com" });
  assert.equal(out.createdAt.getTime(), d.getTime());
});
