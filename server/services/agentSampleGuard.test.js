// THE SAMPLE GUARD (owner's rule, 8 Oct 2026): a sample project's figures must
// never reach a client's real estimate. Ada's portfolio, totals across
// projects, slot counts and period reports never count a sample, and the
// write/proposal tools and the Proposed rates card refuse on one.
//
// The samples here are VISIBLE to the user (they hold an active QUIV licence,
// which is what opens the samples on the website), and one of them even
// carries the user's own id: the guard must hold without relying on samples
// being owner-less. Mongo is stood in for by a small matcher that honours the
// filters the code really sends; nothing touches a database.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  ME,
  OWN,
  SAMPLE,
  SAMPLE_OWNED,
  STRANGER,
  USER,
  matches,
  install,
  installBroken,
  restore,
  seen,
  assertNoSample,
} from "./agentSampleFixtures.js";

const { TakeoffProject } = await import("../models/TakeoffProject.js");
const {
  getPortfolioSummary,
  getResourceQuantity,
  getAccountSummary,
  getProjectDetails,
  getProjectBill,
  getPricingProposal,
  getSetRatesProposal,
  getAreaPricingProposal,
  getProjectPeriodReport,
} = await import("./agentUserData.js");
const { refuseSampleCard, withCard } = await import("./salesAgent.js");
const { getRoomFinishes } = await import("./agentRoomFinishes.js");
const { rejectSampleWrites } = await import("../util/sampleProjects.js");
const { ownOnly, NOT_SAMPLE } = await import("../util/agentSampleGuard.js");

afterEach(restore);

// ── the filter itself ───────────────────────────────────────────────────────
test("ownOnly adds the sample exclusion and keeps every other clause", () => {
  assert.deepEqual(NOT_SAMPLE, { isSample: { $ne: true } });
  assert.deepEqual(ownOnly({ userId: ME, pmTrackerOnly: { $ne: true } }), {
    userId: ME,
    pmTrackerOnly: { $ne: true },
    isSample: { $ne: true },
  });
  assert.equal(matches(SAMPLE_OWNED, ownOnly({ userId: ME })), false);
  assert.equal(matches(OWN, ownOnly({ userId: ME })), true);
});

// ── cross-project answers never count a sample ─────────────────────────────
test("portfolio: the total, the count and the list never include a sample", async () => {
  install();
  const text = await getPortfolioSummary(ME);
  assert.match(text, /Total projects: 1\b/);
  assert.match(text, /Combined project value \(sum of BoQ qty×rate\): ₦1,000,000/);
  assert.match(text, /Lekki Duplex/);
  assertNoSample(text);
  assert.ok(seen.every((f) => f.isSample?.$ne === true), "every portfolio query excludes samples");
});

test("portfolio: a user whose only 'projects' are samples has no projects", async () => {
  install([SAMPLE, SAMPLE_OWNED, STRANGER]);
  assert.equal(await getPortfolioSummary(ME), "The user has no takeoff projects yet.");
});

test("a quantity across all projects never adds a sample's quantity", async () => {
  install();
  const text = await getResourceQuantity(ME, "cement", "");
  assert.match(text, /TOTAL QUANTITY: 100 bags/);
  assertNoSample(text);
  assert.ok(seen.every((f) => f.isSample?.$ne === true));
});

test("slot usage never counts a sample as one of the user's projects", async () => {
  install();
  const text = await getAccountSummary(USER);
  assert.match(text, /1 of 30 used/);
});

// ── a sample is never taken for one of the user's own projects ─────────────
test("a name close to a sample's never resolves to the sample as the user's project", async () => {
  install();
  const text = await getProjectDetails(ME, "4-Bedroom Duplex - Strip Foundation");
  assertNoSample(text.replace(/The user's projects are: .*$/m, ""));
  assert.doesNotMatch(text, /Total project value: ₦77,000,000/);
});

test("the bill tool never answers from a sample carrying the user's id", async () => {
  install([SAMPLE_OWNED]);
  const text = await getProjectBill(ME, "Strip Foundation", "");
  assert.doesNotMatch(text, /77,000,000/);
});

test("rooms are never read from a sample", async () => {
  install();
  const text = await getRoomFinishes(ME, { project: "Sample: 5-Bedroom Duplex" }, {});
  assert.doesNotMatch(text, /99/);
  install();
  const here = await getRoomFinishes(ME, {}, { projectRef: String(SAMPLE_OWNED._id), productKey: "revit" });
  assert.doesNotMatch(here, /Toilet/);
});

// ── write / proposal tools and the Proposed rates card refuse on a sample ──
test("Proposed rates: refused on a sample even if a resolver handed one over", async () => {
  installBroken(SAMPLE);
  const out = await getPricingProposal(ME, SAMPLE.name, {});
  assert.equal(typeof out, "string", "no card object");
  assert.match(out, /read-only SAMPLE project/);
  assert.match(out, /never be copied into one of the user's own projects/);
});

test("stated-rate proposals (by area, set rates): refused on a sample", async () => {
  installBroken(SAMPLE);
  const area = await getAreaPricingProposal(ME, SAMPLE.name, { category: "windows", ratePerM2: 88000 }, {});
  assert.equal(typeof area, "string");
  assert.match(area, /read-only SAMPLE project/);
  const set = await getSetRatesProposal(ME, SAMPLE.name, { match: { code: ["S1"] }, rate: 9500, unit: "m3" }, {});
  assert.equal(typeof set, "string");
  assert.match(set, /read-only SAMPLE project/);
});

test("period report: refused on a sample", async () => {
  installBroken(SAMPLE);
  const out = await getProjectPeriodReport(ME, SAMPLE.name, "2026-09-01", "2026-09-30", {});
  assert.equal(typeof out, "string");
  assert.match(out, /Period reports cover the user's own projects only/);
});

test("the card lock: a price-proposal or report card for a sample is never queued", async () => {
  install();
  const ctx = { pendingActions: [] };
  const card = (type) => ({
    text: "Proposed 1.",
    card: { type, project: { id: String(SAMPLE._id), productKey: "revit", name: SAMPLE.name, slug: "" } },
  });
  const a = withCard(await refuseSampleCard(card("price-proposal")), ctx);
  const b = withCard(await refuseSampleCard(card("project-report")), ctx);
  assert.match(a, /read-only SAMPLE project/);
  assert.match(b, /Period reports cover the user's own projects only/);
  assert.deepEqual(ctx.pendingActions, []);
  // An own project's card passes untouched.
  const own = { text: "ok", card: { type: "price-proposal", project: { id: String(OWN._id) } } };
  assert.equal(withCard(await refuseSampleCard(own), ctx), "ok");
  assert.equal(ctx.pendingActions.length, 1);
});

test("the card lock fails closed when the check cannot run", async () => {
  TakeoffProject.findOne = () => ({
    lean: async () => {
      throw new Error("db down");
    },
  });
  const ctx = { pendingActions: [] };
  const out = withCard(
    await refuseSampleCard({ text: "x", card: { type: "price-proposal", project: { id: String(OWN._id) } } }),
    ctx,
  );
  assert.match(out, /could not be checked/);
  assert.deepEqual(ctx.pendingActions, []);
});

test("applying rates to a sample is refused by the API itself (rejectSampleWrites)", async () => {
  install();
  const run = (method, pid) =>
    new Promise((resolve) => {
      const res = {
        status(code) {
          this.code = code;
          return this;
        },
        json(body) {
          resolve({ code: this.code, body });
        },
      };
      rejectSampleWrites({ method }, res, (err) => resolve({ next: true, err }), String(pid));
    });
  const post = await run("POST", SAMPLE._id);
  assert.equal(post.code, 403);
  assert.equal(post.body.code, "SAMPLE_READ_ONLY");
  const patch = await run("PATCH", SAMPLE._id);
  assert.equal(patch.code, 403);
  assert.deepEqual(await run("GET", SAMPLE._id), { next: true, err: undefined });
  assert.deepEqual(await run("POST", OWN._id), { next: true, err: undefined });
});
