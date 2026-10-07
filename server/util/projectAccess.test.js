import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import {
  resolveProjectAccess,
  entitlementIsActive,
  userObjectId,
  NO_ACCESS,
} from "./projectAccess.js";

const oid = () => new mongoose.Types.ObjectId();
const withRateGen = { hasRateGen: async () => true };
const withoutRateGen = { hasRateGen: async () => false };

test("the owner may do everything", async () => {
  const uid = oid();
  const a = await resolveProjectAccess(uid, { userId: uid }, withoutRateGen);
  assert.equal(a.role, "owner");
  assert.ok(a.canEdit && a.canExport && a.canManage && a.canSeeRates);
});

test("a full collaborator may edit and export but not manage the project", async () => {
  const uid = oid();
  const project = { userId: oid(), collaborators: [{ userId: uid, accessLevel: "full" }] };
  const a = await resolveProjectAccess(uid, project, withRateGen);
  assert.equal(a.role, "full");
  assert.ok(a.canEdit && a.canExport);
  assert.equal(a.canManage, false, "share codes and collaborators stay with the owner");
});

test("a view-only collaborator may not write, export or manage", async () => {
  // The ArchiCAD hole in one assertion: this reader reached the document
  // through the same query the owner does, and every write endpoint accepted
  // them because nothing asked this question.
  const uid = oid();
  const project = { userId: oid(), collaborators: [{ userId: uid, accessLevel: "view" }] };
  const a = await resolveProjectAccess(uid, project, withRateGen);
  assert.equal(a.role, "view");
  assert.equal(a.canEdit, false);
  assert.equal(a.canExport, false);
  assert.equal(a.canManage, false);
});

test("an accessLevel we do not recognise is treated as view, not as full", async () => {
  const uid = oid();
  const project = { userId: oid(), collaborators: [{ userId: uid, accessLevel: "editor" }] };
  const a = await resolveProjectAccess(uid, project, withRateGen);
  assert.equal(a.role, "view");
  assert.equal(a.canEdit, false);
});

test("a collaborator sees rates only with an active RateGen entitlement", async () => {
  const uid = oid();
  const project = { userId: oid(), collaborators: [{ userId: uid, accessLevel: "full" }] };
  assert.equal((await resolveProjectAccess(uid, project, withRateGen)).canSeeRates, true);
  assert.equal((await resolveProjectAccess(uid, project, withoutRateGen)).canSeeRates, false);
});

test("a stranger gets nothing, even if the query somehow reached the document", async () => {
  const a = await resolveProjectAccess(oid(), { userId: oid(), collaborators: [] }, withRateGen);
  assert.deepEqual(a, NO_ACCESS);
});

test("a sample is fully readable, rates included, and never writable", async () => {
  const a = await resolveProjectAccess(oid(), { isSample: true, userId: oid() }, withoutRateGen);
  assert.equal(a.role, "sample");
  assert.ok(a.canSeeRates && a.canExport);
  assert.equal(a.canEdit, false);
  assert.equal(a.canManage, false);
});

test("no user and no project mean no access rather than an exception", async () => {
  assert.deepEqual(await resolveProjectAccess(null, { userId: oid() }), NO_ACCESS);
  assert.deepEqual(await resolveProjectAccess(oid(), null), NO_ACCESS);
});

test("an absent entitlement checker denies rates rather than granting them", async () => {
  // A caller that forgets to pass one must fail closed.
  const uid = oid();
  const project = { userId: oid(), collaborators: [{ userId: uid, accessLevel: "full" }] };
  assert.equal((await resolveProjectAccess(uid, project)).canSeeRates, false);
});

test("entitlementIsActive honours status and expiry", () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  const past = new Date(Date.now() - 86400000).toISOString();
  assert.equal(entitlementIsActive([{ productKey: "rategen", status: "active" }], "rategen"), true);
  assert.equal(
    entitlementIsActive([{ productKey: "rategen", status: "active", expiresAt: future }], "rategen"),
    true,
  );
  assert.equal(
    entitlementIsActive([{ productKey: "rategen", status: "active", expiresAt: past }], "rategen"),
    false,
  );
  assert.equal(entitlementIsActive([{ productKey: "rategen", status: "paused" }], "rategen"), false);
  assert.equal(entitlementIsActive([], "rategen"), false);
  assert.equal(entitlementIsActive(null, "rategen"), false);
});

test("userObjectId reads either id shape and refuses junk", () => {
  const id = oid();
  assert.ok(userObjectId({ user: { _id: id } }).equals(id));
  assert.ok(userObjectId({ user: { id: String(id) } }).equals(id));
  assert.equal(userObjectId({ user: { id: "not-an-id" } }), null);
  assert.equal(userObjectId({}), null);
  assert.equal(userObjectId(null), null);
});

test("R4b: the owner's switch hides money from a collaborator, RateGen or not", async () => {
  const uid = oid();
  const project = {
    userId: oid(),
    collaborators: [{ userId: uid, accessLevel: "full", showMoney: false }],
  };
  let asked = false;
  const a = await resolveProjectAccess(uid, project, {
    hasRateGen: async () => {
      asked = true;
      return true;
    },
  });
  assert.equal(a.canSeeRates, false);
  assert.equal(a.moneyHiddenByOwner, true);
  assert.equal(a.canEdit, true, "the switch changes money only, not the access level");
  assert.equal(asked, false, "no entitlement lookup when the owner already said no");
});

test("R4b: a collaborator record without showMoney keeps today's RateGen rule", async () => {
  const uid = oid();
  const project = { userId: oid(), collaborators: [{ userId: uid, accessLevel: "view" }] };
  const a = await resolveProjectAccess(uid, project, withRateGen);
  assert.equal(a.canSeeRates, true);
  assert.equal(a.moneyHiddenByOwner, false);
  const on = { userId: oid(), collaborators: [{ userId: uid, accessLevel: "view", showMoney: true }] };
  assert.equal((await resolveProjectAccess(uid, on, withoutRateGen)).canSeeRates, false);
});
