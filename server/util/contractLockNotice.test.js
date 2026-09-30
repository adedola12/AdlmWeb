import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isShared,
  lockedByName,
  lockNoticeRecipients,
  maySeeMoney,
} from "./contractLockNotice.js";

const OWNER = "652f00000000000000000001";
const ALICE = "652f00000000000000000002";
const BOB = "652f00000000000000000003";

const users = new Map([
  [OWNER, { email: "Owner@Firm.com", name: "Bola Adeyemi" }],
  [ALICE, { email: "alice@firm.com", name: "Alice Okon" }],
  [BOB, { email: "bob@firm.com", name: "Bob Eze" }],
]);

const project = (over = {}) => ({
  userId: OWNER,
  collaborators: [
    { userId: ALICE, email: "alice@firm.com", accessLevel: "full" },
    { userId: BOB, email: "bob@firm.com", accessLevel: "view" },
  ],
  ...over,
});

test("everybody on the project is told, except the person who locked it", () => {
  const to = lockNoticeRecipients(project(), { _id: ALICE, email: "alice@firm.com" }, users);
  assert.deepEqual(
    to.map((r) => r.email),
    ["owner@firm.com", "bob@firm.com"],
  );
});

test("a VIEW-ONLY collaborator is told too", () => {
  // They are reading figures whose meaning just changed. Withholding it because
  // they cannot edit gets it backwards.
  const to = lockNoticeRecipients(project(), { _id: OWNER, email: "owner@firm.com" }, users);
  const bob = to.find((r) => r.email === "bob@firm.com");
  assert.ok(bob);
  assert.equal(bob.role, "viewer");
});

test("the owner is told when somebody else locked it, and not when they did", () => {
  const byOther = lockNoticeRecipients(project(), { _id: ALICE, email: "alice@firm.com" }, users);
  assert.ok(byOther.some((r) => r.role === "owner"));

  const byOwner = lockNoticeRecipients(project(), { _id: OWNER, email: "owner@firm.com" }, users);
  assert.ok(!byOwner.some((r) => r.role === "owner"));
});

test("the locker is excluded by EMAIL as well as by id", () => {
  // The two can disagree: a social account whose id differs from the row's, or a
  // stale snapshot. Either match is enough — telling somebody their own action
  // happened is the one mail nobody wants.
  const to = lockNoticeRecipients(project(), { _id: "652f0000000000000000dead", email: "ALICE@firm.com" }, users);
  assert.ok(!to.some((r) => r.email === "alice@firm.com"));
});

test("nobody is told twice, however many ways they appear", () => {
  // The owner joined their own project through a share code — which happens.
  const p = project({
    collaborators: [
      { userId: OWNER, email: "owner@firm.com", accessLevel: "full" },
      { userId: ALICE, email: "alice@firm.com", accessLevel: "full" },
      { userId: ALICE, email: "ALICE@FIRM.COM", accessLevel: "view" },
    ],
  });
  const to = lockNoticeRecipients(p, { _id: BOB, email: "bob@firm.com" }, users);
  assert.deepEqual(
    to.map((r) => r.email),
    ["owner@firm.com", "alice@firm.com"],
  );
});

test("a live address beats the snapshot taken at join time", () => {
  // collaborators[].email is a display snapshot and can be months old. Sending
  // to it would mail an address the person no longer reads.
  const moved = new Map(users);
  moved.set(ALICE, { email: "alice@newfirm.com", name: "Alice Okon" });
  const to = lockNoticeRecipients(project(), { _id: BOB, email: "bob@firm.com" }, moved);
  assert.ok(to.some((r) => r.email === "alice@newfirm.com"));
  assert.ok(!to.some((r) => r.email === "alice@firm.com"));
});

test("a collaborator with no address is skipped, not an error", () => {
  // A row with no email snapshot is a data gap. Failing the contract lock over
  // it would be absurd.
  const p = project({ collaborators: [{ userId: "652f0000000000000000beef", accessLevel: "full" }] });
  const to = lockNoticeRecipients(p, { _id: OWNER, email: "owner@firm.com" }, new Map());
  assert.deepEqual(to, []);
});

test("it survives a project with nothing on it", () => {
  assert.deepEqual(lockNoticeRecipients(null, null), []);
  assert.deepEqual(lockNoticeRecipients({}, {}), []);
  assert.deepEqual(lockNoticeRecipients({ collaborators: "nope" }, {}), []);
});

test("addressed by name when there is one, so it does not open with an email", () => {
  const to = lockNoticeRecipients(project(), { _id: OWNER, email: "owner@firm.com" }, users);
  assert.equal(to.find((r) => r.email === "alice@firm.com").firstName, "Alice Okon");
});

test("an unshared project has nobody to tell", () => {
  // The overwhelming majority. Checked so the whole notification, including the
  // user reads it needs, is skipped rather than done and thrown away.
  assert.equal(isShared({ collaborators: [] }), false);
  assert.equal(isShared({}), false);
  assert.equal(isShared(project()), true);
});

test("whoever locked it is named readably, never blank", () => {
  assert.equal(lockedByName({ name: "Bola Adeyemi" }), "Bola Adeyemi");
  assert.equal(lockedByName({ firstName: "Bola", lastName: "Adeyemi" }), "Bola Adeyemi");
  assert.equal(lockedByName({ email: "bola@firm.com" }), "bola@firm.com");
  assert.equal(lockedByName({}), "Somebody on this project");
  assert.equal(lockedByName(null), "Somebody on this project");
});

// ── The mail must not say what the screen hides ──
//
// A collaborator without RateGen has canSeeRates false (util/projectAccess.js),
// so every read of the project comes back with contract.contractSum: 0 and
// _ratesMasked: true. Posting the real figure into their inbox would hand over,
// unprompted and in writing, the one number the product is built to withhold.

test("the owner is always told what the contract is worth", () => {
  return maySeeMoney({ role: "owner", userId: OWNER }, async () => false).then((v) =>
    assert.equal(v, true),
  );
});

test("a collaborator WITH RateGen is told the figure", async () => {
  const seen = [];
  const v = await maySeeMoney({ role: "editor", userId: ALICE }, async (uid) => {
    seen.push(uid);
    return true;
  });
  assert.equal(v, true);
  assert.deepEqual(seen, [ALICE]);
});

test("a collaborator WITHOUT RateGen is not", async () => {
  assert.equal(await maySeeMoney({ role: "viewer", userId: BOB }, async () => false), false);
  assert.equal(await maySeeMoney({ role: "editor", userId: BOB }, async () => false), false);
});

test("an entitlement lookup that FAILS withholds the figure", async () => {
  // Failing open would leak exactly the number this guard exists for.
  assert.equal(
    await maySeeMoney({ role: "viewer", userId: BOB }, async () => {
      throw new Error("db down");
    }),
    false,
  );
});

test("no check to make, no figure", async () => {
  assert.equal(await maySeeMoney({ role: "viewer", userId: BOB }, null), false);
  assert.equal(await maySeeMoney({ role: "viewer", userId: "" }, async () => true), false);
  assert.equal(await maySeeMoney(null, async () => true), false);
});

test("recipients default to not seeing money unless they own the project", () => {
  // The default on the row matters: a caller that forgets to ask must not leak.
  const to = lockNoticeRecipients(project(), { _id: BOB, email: "bob@firm.com" }, users);
  assert.equal(to.find((r) => r.role === "owner").seesMoney, true);
  assert.equal(to.find((r) => r.role === "editor").seesMoney, false);
});
