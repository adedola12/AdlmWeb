import { test } from "node:test";
import assert from "node:assert/strict";
import { canDownloadModel, hasLiveLicence, visibleToViewer } from "./demoModelAccess.js";

const ready = (over = {}) => ({
  published: true,
  fileKey: "demo-models/x/y.rvt",
  uploadedAt: new Date(),
  access: "signed-in",
  productKey: "revit",
  ...over,
});
const user = (over = {}) => ({ _id: "u1", entitlements: [], ...over });
const live = { productKey: "revit", status: "active", expiresAt: null };

test("a half-uploaded or unpublished model is nobody's", () => {
  assert.equal(canDownloadModel(ready({ published: false }), user()).allowed, false);
  assert.equal(canDownloadModel(ready({ uploadedAt: null }), user()).allowed, false);
  assert.equal(canDownloadModel(ready({ fileKey: "" }), user()).allowed, false);
  assert.equal(canDownloadModel(null, user()).allowed, false);
});

test("public means public, signed in or not", () => {
  assert.equal(canDownloadModel(ready({ access: "public" }), null).allowed, true);
});

test("signed-in needs an account and nothing else", () => {
  assert.equal(canDownloadModel(ready(), null).allowed, false);
  assert.match(canDownloadModel(ready(), null).reason, /Sign in/);
  assert.equal(canDownloadModel(ready(), user()).allowed, true);
});

test("entitled needs a LIVE licence for that product", () => {
  const m = ready({ access: "entitled" });
  assert.equal(canDownloadModel(m, user()).allowed, false);
  assert.equal(canDownloadModel(m, user({ entitlements: [live] })).allowed, true);
});

test("an expired licence is not a licence", () => {
  // The difference between a customer and a former one.
  const expired = { productKey: "revit", status: "active", expiresAt: "2020-01-01" };
  assert.equal(hasLiveLicence({ entitlements: [expired] }, "revit"), false);
  const future = { productKey: "revit", status: "active", expiresAt: "2099-01-01" };
  assert.equal(hasLiveLicence({ entitlements: [future] }, "revit"), true);
});

test("an inactive entitlement is not a licence, nor is one for another product", () => {
  assert.equal(hasLiveLicence({ entitlements: [{ ...live, status: "expired" }] }, "revit"), false);
  assert.equal(hasLiveLicence({ entitlements: [live] }, "planswift"), false);
  assert.equal(hasLiveLicence(null, "revit"), false);
});

test("a course model is only for somebody enrolled on that course", () => {
  const m = ready({ access: "course", courseSku: "QS-101" });
  assert.equal(canDownloadModel(m, user(), []).allowed, false);
  assert.equal(canDownloadModel(m, user(), [{ courseSku: "OTHER" }]).allowed, false);
  assert.equal(canDownloadModel(m, user(), [{ courseSku: "QS-101" }]).allowed, true);
  // Case does not decide who gets a course they paid for.
  assert.equal(canDownloadModel(m, user(), [{ courseSku: "qs-101" }]).allowed, true);
});

test("a course model with no course is refused, not opened to everyone", () => {
  const m = ready({ access: "course", courseSku: "" });
  assert.equal(canDownloadModel(m, user(), [{ courseSku: "QS-101" }]).allowed, false);
});

test("an access level nobody recognises is a closed door", () => {
  assert.equal(canDownloadModel(ready({ access: "whatever" }), user()).allowed, false);
});

test("every refusal says something the reader can act on", () => {
  for (const m of [
    ready({ published: false }),
    ready({ access: "entitled" }),
    ready({ access: "course", courseSku: "QS-101" }),
  ]) {
    const r = canDownloadModel(m, user(), []);
    assert.equal(r.allowed, false);
    assert.ok(r.reason.length > 10, "a bare refusal teaches nobody anything");
  }
});

test("a student can SEE a course has a model before enrolling", () => {
  // The listing is not the gate; the download is.
  assert.equal(visibleToViewer(ready({ access: "course", courseSku: "QS-101" }), null), true);
  assert.equal(visibleToViewer(ready({ published: false }), user()), false);
});
