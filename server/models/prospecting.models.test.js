// server/models/prospecting.models.test.js
//
// Schema rules for outbound prospecting, checked with validateSync so no
// database is needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { IdealCustomerProfile } from "./IdealCustomerProfile.js";
import { Prospect } from "./Prospect.js";
import { OutreachDraft } from "./OutreachDraft.js";
import { Suppression } from "./Suppression.js";
import { SEED_PROFILES } from "../config/prospectingProfiles.js";

const id = () => new mongoose.Types.ObjectId();

test("all three seed profiles are valid and have unique keys", () => {
  assert.equal(SEED_PROFILES.length, 3);
  for (const p of SEED_PROFILES) assert.equal(new IdealCustomerProfile(p).validateSync(), undefined, p.key);
  assert.equal(new Set(SEED_PROFILES.map((p) => p.key)).size, 3);
});

test("a profile must pitch one of the four prospecting products", () => {
  const err = new IdealCustomerProfile({ ...SEED_PROFILES[0], targetProduct: "civiq" }).validateSync();
  assert.ok(err?.errors?.targetProduct);
});

const prospect = (over = {}) => ({
  profileId: id(),
  matchedProduct: "heron",
  companyName: "Example QS Partners",
  domain: "exampleqs.com.ng",
  foundDay: "2026-09-26",
  sources: [{ url: "https://exampleqs.com.ng/about" }],
  ...over,
});

test("a prospect without a source URL is refused (NDPA)", () => {
  assert.equal(new Prospect(prospect()).validateSync(), undefined);
  assert.ok(new Prospect(prospect({ sources: [] })).validateSync()?.errors?.sources);
});

test("foundDay must be a YYYY-MM-DD Lagos day", () => {
  assert.ok(new Prospect(prospect({ foundDay: "26/09/2026" })).validateSync()?.errors?.foundDay);
});

const emails = [
  { step: 0, dayOffset: 0, subject: "a", body: "b" },
  { step: 1, dayOffset: 3, subject: "a", body: "b" },
  { step: 2, dayOffset: 7, subject: "a", body: "b" },
];
const draft = (over = {}) => ({
  prospectId: id(), contactId: id(), profileId: id(), product: "heron", emails, ...over,
});

test("a draft is exactly three emails in step order and starts pending_review", () => {
  const d = new OutreachDraft(draft());
  assert.equal(d.validateSync(), undefined);
  assert.equal(d.status, "pending_review");
  assert.ok(new OutreachDraft(draft({ emails: emails.slice(0, 2) })).validateSync()?.errors?.emails);
  assert.ok(new OutreachDraft(draft({ emails: [emails[1], emails[0], emails[2]] })).validateSync()?.errors?.emails);
});

test("an email suppression needs a hash, a domain suppression needs a domain", async () => {
  const hash = "a".repeat(64);
  await new Suppression({ kind: "email", emailHash: hash, reason: "opt_out" }).validate();
  await new Suppression({ kind: "domain", domain: "exampleqs.com.ng", reason: "bad_fit" }).validate();
  await assert.rejects(new Suppression({ kind: "email", reason: "opt_out" }).validate());
  await assert.rejects(new Suppression({ kind: "domain", reason: "manual" }).validate());
  await assert.rejects(new Suppression({ kind: "email", emailHash: "not-a-hash", reason: "opt_out" }).validate());
});
