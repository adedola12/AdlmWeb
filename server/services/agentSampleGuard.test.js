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
import mongoose from "mongoose";

const { TakeoffProject } = await import("../models/TakeoffProject.js");
const { ActivityLog } = await import("../models/ActivityLog.js");
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

const id = () => new mongoose.Types.ObjectId();
const ME = id();
const OTHER = id();

// Sample figures are deliberately huge and odd so any leak is unmistakable.
const OWN = {
  _id: id(),
  userId: ME,
  productKey: "revit",
  name: "Lekki Duplex",
  slug: "lekki-duplex",
  collaborators: [],
  updatedAt: new Date("2026-10-01"),
  items: [
    { sn: 1, code: "A1", description: "Concrete in strip foundation", unit: "m3", qty: 10, rate: 100000 },
    { sn: 2, code: "A2", description: "Window W1 (1200x1500)", unit: "nr", qty: 2, rate: 0 },
  ],
  budgetItems: [{ materialName: "Cement", unit: "bags", qty: 100, rate: 9000, componentKind: "Material" }],
  roomFinishes: [],
};
const SAMPLE = {
  _id: id(),
  userId: null,
  isSample: true,
  sample: { key: "duplex-raft", order: 3 },
  productKey: "revit",
  name: "Sample: 5-Bedroom Duplex - Raft Foundation",
  slug: "sample-5-bedroom-duplex-raft-foundation",
  collaborators: [],
  updatedAt: new Date("2026-10-07"),
  items: [
    { sn: 1, code: "S1", description: "Concrete in raft foundation", unit: "m3", qty: 500, rate: 100000 },
    { sn: 2, code: "S2", description: "Window W9 (1200x1500)", unit: "nr", qty: 20, rate: 0 },
  ],
  budgetItems: [{ materialName: "Cement", unit: "bags", qty: 9999, rate: 9000, componentKind: "Material" }],
  roomFinishes: [{ name: "Toilet", number: "S01", level: "Ground", floorFinish: "Tiles", floorAreaM2: 99, skirtingM: 99 }],
};
// The stress case: a sample that somehow carries the user's own id.
const SAMPLE_OWNED = {
  ...SAMPLE,
  _id: id(),
  userId: ME,
  name: "Sample: 4-Bedroom Duplex - Strip Foundation",
  slug: "sample-4-bedroom-duplex-strip-foundation",
  updatedAt: new Date("2026-10-08"),
  items: [{ sn: 1, code: "T1", description: "Concrete in strip foundation", unit: "m3", qty: 770, rate: 100000 }],
  budgetItems: [{ materialName: "Cement", unit: "bags", qty: 7777, rate: 9000, componentKind: "Material" }],
};
const STRANGER = { ...OWN, _id: id(), userId: OTHER, name: "Secret Tower", slug: "secret-tower" };
const ALL = [OWN, SAMPLE, SAMPLE_OWNED, STRANGER];

const USER = {
  _id: ME,
  name: "Ade",
  email: "ade@example.com",
  entitlements: [{ productKey: "revit", status: "active", expiresAt: new Date("2030-01-01") }],
};

// ── a small Mongo stand-in ──────────────────────────────────────────────────
function get(doc, path) {
  return path.split(".").reduce((v, k) => (v == null ? v : v[k]), doc);
}
function eq(a, b) {
  if (a == null || b == null) return a == b; // eslint-disable-line eqeqeq
  return String(a) === String(b);
}
function fieldMatches(doc, key, cond) {
  if (key === "collaborators.userId") {
    return (doc.collaborators || []).some((c) => eq(c.userId, cond));
  }
  const v = get(doc, key);
  if (cond instanceof RegExp) return cond.test(String(v ?? ""));
  if (cond && typeof cond === "object" && !(cond instanceof mongoose.Types.ObjectId)) {
    for (const [op, arg] of Object.entries(cond)) {
      if (op === "$ne" && eq(v, arg)) return false;
      if (op === "$in" && !arg.some((x) => eq(v, x))) return false;
      if (op === "$not" && arg.test(String(v ?? ""))) return false;
      if (op === "$exists" && (v !== undefined) !== arg) return false;
    }
    return true;
  }
  return eq(v, cond);
}
function matches(doc, filter = {}) {
  for (const [k, cond] of Object.entries(filter)) {
    if (k === "$or") {
      if (!cond.some((f) => matches(doc, f))) return false;
    } else if (!fieldMatches(doc, k, cond)) {
      return false;
    }
  }
  return true;
}
function query(rows) {
  let out = rows;
  const q = {
    sort: (s) => {
      if (s?.updatedAt === -1) out = [...out].sort((a, b) => b.updatedAt - a.updatedAt);
      return q;
    },
    limit: (n) => {
      out = out.slice(0, n);
      return q;
    },
    select: () => q,
    lean: async () => out,
    then: (res, rej) => Promise.resolve(out).then(res, rej),
  };
  return q;
}
function single(row) {
  return { lean: async () => row, select: () => single(row), then: (res, rej) => Promise.resolve(row).then(res, rej) };
}
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const real = {
  find: TakeoffProject.find,
  findOne: TakeoffProject.findOne,
  aggregate: TakeoffProject.aggregate,
  activity: ActivityLog.find,
};
const seen = [];
function install(docs = ALL) {
  seen.length = 0;
  TakeoffProject.find = (filter) => {
    seen.push(filter);
    return query(docs.filter((d) => matches(d, filter)));
  };
  TakeoffProject.findOne = (filter) => {
    seen.push(filter);
    return single(docs.find((d) => matches(d, filter)) || null);
  };
  // Honours the $match stage; the rest of each pipeline is worked in JS.
  TakeoffProject.aggregate = async (pipeline) => {
    const match = pipeline.find((s) => s.$match)?.$match || {};
    seen.push(match);
    const rows = docs.filter((d) => matches(d, match));
    if (pipeline.some((s) => s.$group)) {
      const by = new Map();
      for (const r of rows) by.set(r.productKey, (by.get(r.productKey) || 0) + 1);
      return [...by.entries()].map(([k, count]) => ({ _id: k, count }));
    }
    return rows.map((r) => ({
      productKey: r.productKey,
      name: r.name,
      clientName: r.clientName,
      updatedAt: r.updatedAt,
      itemCount: (r.items || []).length,
      totalCost: (r.items || []).reduce((a, it) => a + num(it.qty) * num(it.rate), 0),
      valuedAmount: 0,
      progressShare: 0,
    }));
  };
  ActivityLog.find = () => query([]);
}
// A resolver bug, simulated: every lookup returns this document whatever the
// filter says. The tools' own refusal must still hold.
function installBroken(doc) {
  TakeoffProject.find = () => query([doc]);
  TakeoffProject.findOne = () => single(doc);
  ActivityLog.find = () => query([]);
}
afterEach(() => {
  TakeoffProject.find = real.find;
  TakeoffProject.findOne = real.findOne;
  TakeoffProject.aggregate = real.aggregate;
  ActivityLog.find = real.activity;
});

const LEAKS = [/Sample:/, /50,000,000/, /77,000,000/, /9,999/, /7,777/, /9999/, /7777/];
function assertNoSample(text) {
  for (const re of LEAKS) assert.doesNotMatch(String(text), re);
}

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
