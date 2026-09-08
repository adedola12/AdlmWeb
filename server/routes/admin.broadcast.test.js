// server/routes/admin.broadcast.test.js
// audienceQuery decides who receives a mass mailing. Getting it wrong means
// either mailing people who asked not to be mailed, or quietly mailing nobody,
// and neither shows up until after the send. So it is pinned here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { __test } from "./admin.broadcast.js";

const { audienceQuery } = __test;

test("every audience refuses opted-out and unverified addresses", () => {
  for (const audience of ["all", "entitled", "product:planswift"]) {
    const q = audienceQuery(audience);
    assert.ok(q, `${audience} should be a valid audience`);

    // $ne: false rather than true, so the millions of accounts predating the
    // field — where marketing is simply absent — are still reachable. Only an
    // explicit false, which is what unsubscribing writes, excludes someone.
    assert.deepEqual(
      q["emailPrefs.marketing"],
      { $ne: false },
      `${audience} must honour the marketing opt-out`,
    );
    assert.equal(q.emailVerified, true, `${audience} must require a verified address`);
    assert.deepEqual(q.email, { $ne: "" }, `${audience} must require an address`);
  }
});

test("'all' adds no entitlement constraint", () => {
  const q = audienceQuery("all");
  assert.equal(q["entitlements.status"], undefined);
  assert.equal(q.entitlements, undefined);
});

test("'entitled' narrows to an active entitlement", () => {
  assert.equal(audienceQuery("entitled")["entitlements.status"], "active");
});

test("'product:<key>' matches key and active status on the SAME entitlement", () => {
  const q = audienceQuery("product:PlanSwift");
  // $elemMatch matters: without it, someone with an expired PlanSwift licence
  // and an active RateGen one would satisfy both clauses separately and be
  // mailed as though their PlanSwift licence were live.
  assert.deepEqual(q.entitlements, {
    $elemMatch: { productKey: "planswift", status: "active" },
  });
});

test("an unrecognised audience is refused, not treated as everyone", () => {
  // The dangerous failure mode: a typo silently widening to the whole base.
  for (const bad of ["", "  ", "everyone", "product:", "product:has space", "all;drop", null, undefined]) {
    assert.equal(audienceQuery(bad), null, `${JSON.stringify(bad)} must not resolve`);
  }
});
