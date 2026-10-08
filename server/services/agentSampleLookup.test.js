// Ada can read ONE sample project, read-only, when the user names it or is on
// its page (work-board item ada-reads-samples). Every such answer is labelled
// "This is a sample project, figures are illustrative." The guard still holds:
// the user's own project wins, a name that only resembles a sample never
// reaches one, a sample is never in a cross-project answer, and nothing can be
// priced on a sample or carried from it into a real project.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";

import { ME, OWN, SAMPLE, SAMPLE_OWNED, USER, id, install, restore, assertNoSample } from "./agentSampleFixtures.js";

const {
  getProjectDetails,
  getProjectBill,
  getProjectBudget,
  getResourceQuantity,
  getPortfolioSummary,
  getPricingProposal,
  getProjectPeriodReport,
  getProjectTipsForAgent,
  getBillItemsForAi,
} = await import("./agentUserData.js");
const { handleAccountTool } = await import("./salesAgent.js");
const {
  SAMPLE_LABEL,
  SAMPLE_MARK,
  SAMPLE_RATE_NOT_TYPED,
  SAMPLE_REPORT_TITLE,
  isSampleAnswer,
  labelSampleReply,
  mentionsSample,
  withoutSampleWord,
  numbersIn,
  rateTypedByUser,
} = await import("../util/agentSampleGuard.js");

afterEach(restore);

// What the chat hands the tools: the page, and who may open samples.
const lookup = (extra = {}) => ({ projectRef: "", productKey: "", sampleViewer: USER, ...extra });
const NO_LICENCE = {
  ...USER,
  entitlements: [{ productKey: "planswift", status: "active", expiresAt: new Date("2030-01-01") }],
};

// ── naming a sample ─────────────────────────────────────────────────────────
test("a named sample is answered, read-only and labelled", async () => {
  install();
  const text = await getProjectDetails(ME, "5-Bedroom Duplex sample", lookup());
  assert.ok(text.startsWith(SAMPLE_MARK), "starts with the sample mark");
  assert.match(text, new RegExp(`Start your answer with exactly: "${SAMPLE_LABEL.replace(/[.,]/g, "\\$&")}"`));
  assert.match(text, /Sample: 5-Bedroom Duplex - Raft Foundation/);
  assert.match(text, /Total project value: ₦53,750,000/); // the bill plus VAT, as on the page
  assert.match(text, /Never add them to, compare them with, or copy them into the user's own projects/);
});

test("the sample's bill and budget are readable, each labelled", async () => {
  install();
  const bill = await getProjectBill(ME, "Sample: 5-Bedroom Duplex - Raft Foundation", "concrete", lookup());
  assert.ok(isSampleAnswer(bill));
  assert.match(bill, /500 m3 @ ₦100,000 = ₦50,000,000/);
  const budget = await getProjectBudget(ME, "raft foundation sample", lookup());
  assert.ok(isSampleAnswer(budget));
  assert.match(budget, /9,999 bags/);
});

test("a quantity on ONE named sample is labelled and counts only that sample", async () => {
  install();
  const text = await getResourceQuantity(ME, "cement", "5-bedroom duplex sample", lookup());
  assert.ok(isSampleAnswer(text));
  assert.match(text, /TOTAL QUANTITY: 9,999 bags/);
  assert.doesNotMatch(text, /across \d+ project/);
});

test("a name without the word 'sample' never reaches a sample", async () => {
  install();
  const text = await getProjectDetails(ME, "5-Bedroom Duplex - Raft Foundation", lookup());
  assert.ok(!isSampleAnswer(text));
  assert.doesNotMatch(text, /50,000,000/);
  // Ada is told the samples exist and how to ask for one, with no figures.
  assert.match(text, /No project clearly matches/);
  assert.match(text, /pass the name with the word "sample"/);
});

test("the user's own project always wins over a sample", async () => {
  const OWN_SAMPLE_NAMED = { ...OWN, _id: id(), name: "Sample House Ikoyi", slug: "sample-house-ikoyi" };
  install([OWN, OWN_SAMPLE_NAMED, SAMPLE]);
  const a = await getProjectDetails(ME, "Lekki Duplex sample", lookup());
  assert.ok(!isSampleAnswer(a));
  assert.match(a, /Project: Lekki Duplex/);
  const b = await getProjectDetails(ME, "sample house", lookup());
  assert.ok(!isSampleAnswer(b));
  assert.match(b, /Project: Sample House Ikoyi/);
});

test("only samples of a product the user is licensed for can be read", async () => {
  install();
  const named = await getProjectDetails(ME, "5-Bedroom Duplex sample", lookup({ sampleViewer: NO_LICENCE }));
  assert.ok(!isSampleAnswer(named));
  assert.doesNotMatch(named, /50,000,000/);
  const opened = await getProjectBill(ME, "", "", lookup({ sampleViewer: NO_LICENCE, projectRef: SAMPLE.slug, productKey: "revit" }));
  assert.equal(opened, "Ask the user which project they mean (by name).");
});

test("no viewer (a tool that did not ask for samples): never a sample", async () => {
  install();
  const text = await getProjectDetails(ME, "5-Bedroom Duplex sample", { projectRef: "", productKey: "" });
  assert.ok(!isSampleAnswer(text));
  assert.doesNotMatch(text, /50,000,000/);
});

// ── opening a sample ────────────────────────────────────────────────────────
test("on a sample's page with no name, Ada reads that sample, labelled", async () => {
  install();
  const bySlug = await getProjectBill(ME, "", "", lookup({ projectRef: SAMPLE.slug, productKey: "revit" }));
  assert.ok(isSampleAnswer(bySlug));
  assert.match(bySlug, /Bill of Quantities for "Sample: 5-Bedroom Duplex - Raft Foundation"/);
  const byId = await getProjectDetails(ME, String(SAMPLE._id), lookup({ projectRef: String(SAMPLE._id), productKey: "revit" }));
  assert.ok(isSampleAnswer(byId));
});

test("tips on a sample are labelled and never offer to price it", async () => {
  install();
  const text = await getProjectTipsForAgent(ME, "", lookup({ projectRef: SAMPLE.slug, productKey: "revit" }));
  assert.ok(isSampleAnswer(text));
  assert.doesNotMatch(text, /propose_project_pricing/);
});

test("the AI rate check / error scan gets a sample's lines marked as a sample", async () => {
  install();
  const picked = await getBillItemsForAi(ME, "5-bedroom duplex sample", "", 150, {}, lookup());
  assert.equal(picked.sample, true);
  assert.ok(picked.banner.startsWith(SAMPLE_MARK));
  const own = await getBillItemsForAi(ME, "Lekki Duplex", "", 150, {}, lookup());
  assert.equal(own.sample, false);
  assert.equal(own.banner, "");
});

// ── the guard still holds with samples visible ─────────────────────────────
test("cross-project answers still never count a sample, with samples readable", async () => {
  install();
  assertNoSample(await getPortfolioSummary(ME));
  const total = await getResourceQuantity(ME, "cement", "", lookup());
  assert.match(total, /TOTAL QUANTITY: 100 bags/);
  assertNoSample(total);
});

test("no Proposed rates card on a named or opened sample (pricing still refuses)", async () => {
  install();
  const named = await getPricingProposal(ME, "5-bedroom duplex sample", lookup());
  assert.equal(typeof named, "string");
  assert.match(named, /read-only SAMPLE project/);
  const opened = await getPricingProposal(ME, "", lookup({ projectRef: SAMPLE.slug, productKey: "revit" }));
  assert.equal(typeof opened, "string");
  assert.match(opened, /read-only SAMPLE project/);
});

// ── the period report on ONE sample (owner's decision, 8 Oct 2026) ─────────
// Figures in September: the sample moved 50,000,000 (its raft, 500 m3 at
// 100,000), the user's own job 250,000. Any sample figure in an own answer is a leak.
const SEPT = new Date("2026-09-10T09:00:00Z");
const SAMPLE_MOVED = {
  ...SAMPLE,
  items: SAMPLE.items.map((it) => (it.code === "S1" ? { ...it, completed: true, completedAt: SEPT } : it)),
  valuationEvents: [{ itemKey: "S1", amount: 50000000, markedAt: SEPT }],
};
const OWN_MOVED = {
  ...OWN,
  valuationEvents: [{ itemKey: "A1", amount: 250000, markedAt: SEPT }],
};
const MOVED = [OWN_MOVED, SAMPLE_MOVED, SAMPLE_OWNED];

test("period report: ONE named sample is allowed, labelled, and covers that sample only", async () => {
  install(MOVED);
  const out = await getProjectPeriodReport(ME, "5-bedroom duplex sample", "2026-09-01", "2026-09-30", lookup());
  assert.equal(typeof out, "object", "a report with a card");
  assert.ok(isSampleAnswer(out.text), "starts with the sample mark");
  assert.ok(out.text.includes(SAMPLE_LABEL));
  assert.ok(out.text.includes(SAMPLE_REPORT_TITLE));
  assert.ok(out.text.indexOf(SAMPLE_REPORT_TITLE) < out.text.indexOf("50,000,000"), "label before any figure");
  assert.match(out.text, /50,000,000/);
  assert.doesNotMatch(out.text, /Lekki|250,000/, "none of the user's own projects in it");
  assert.equal(out.card.type, "project-report");
  assert.equal(out.card.sample, true);
  assert.equal(out.card.title, "Sample project, figures are illustrative");
  assert.equal(out.card.project.id, String(SAMPLE_MOVED._id));
  assert.equal(out.card.summary.valued, 50000000);
});

test("period report: an opened sample (on its page, no name) is allowed and labelled", async () => {
  install(MOVED);
  const out = await getProjectPeriodReport(ME, "", "2026-09-01", "2026-09-30", lookup({ projectRef: SAMPLE.slug, productKey: "revit" }));
  assert.equal(typeof out, "object");
  assert.ok(isSampleAnswer(out.text));
  assert.equal(out.card.sample, true);
  assert.equal(out.card.title, SAMPLE_REPORT_TITLE);
});

test("period report: a sample needs a licence and the word 'sample' or its page", async () => {
  install(MOVED);
  const unlicensed = await getProjectPeriodReport(
    ME,
    "5-bedroom duplex sample",
    "2026-09-01",
    "2026-09-30",
    lookup({ sampleViewer: NO_LICENCE }),
  );
  assert.equal(typeof unlicensed, "string");
  assertNoSample(unlicensed);
  // A name without "sample" never reaches it.
  const plain = await getProjectPeriodReport(ME, "5-Bedroom Duplex - Raft Foundation", "2026-09-01", "2026-09-30", lookup());
  assert.equal(typeof plain, "string");
  assert.doesNotMatch(plain, /50,000,000/);
});

test("period report: the user's own project after a sample came up carries no sample figures", async () => {
  install(MOVED);
  const ctx = {
    user: USER,
    page: {},
    lookup: lookup(),
    pendingActions: [],
    message: "report on the 5-bedroom duplex sample for September",
    sampleInConversation: false,
  };
  const sampleOut = await handleAccountTool(
    "project_report",
    { projectName: "5-bedroom duplex sample", from: "2026-09-01", to: "2026-09-30" },
    ctx,
  );
  assert.ok(isSampleAnswer(sampleOut), "the sample report reaches the chat, labelled");
  assert.equal(ctx.pendingActions.length, 1);
  assert.equal(ctx.pendingActions[0].sample, true);
  assert.equal(ctx.pendingActions[0].title, SAMPLE_REPORT_TITLE);

  ctx.message = "now the same for my Lekki Duplex";
  ctx.sampleInConversation = true;
  const mine = await handleAccountTool(
    "project_report",
    { projectName: "Lekki Duplex", from: "2026-09-01", to: "2026-09-30" },
    ctx,
  );
  assert.ok(!isSampleAnswer(mine));
  assertNoSample(mine);
  assert.doesNotMatch(mine, /50,000,000|illustrative/);
  assert.match(mine, /250,000/);
  // One report card per reply: the own card replaces the sample's, so the two
  // are never shown side by side.
  assert.equal(ctx.pendingActions.length, 1);
  const own = ctx.pendingActions[0];
  assert.equal(own.project.id, String(OWN._id));
  assert.equal(own.sample, undefined);
  assert.equal(own.title, undefined);
  assert.equal(own.summary.valued, 250000);
});

test("through the chat handler: stated rates and pricing refuse on an opened sample", async () => {
  install();
  const ctx = {
    user: USER,
    page: { projectRef: SAMPLE.slug, productKey: "revit" },
    lookup: lookup({ projectRef: SAMPLE.slug, productKey: "revit" }),
    pendingActions: [],
    userRates: true,
    message: "set concrete to 95,000 per m3",
    sampleInConversation: false,
  };
  const set = await handleAccountTool("propose_set_rates", { match: { text: "concrete" }, rate: 95000, unit: "m3" }, ctx);
  assert.match(set, /read-only SAMPLE project/);
  const area = await handleAccountTool("propose_price_by_area", { category: "windows", ratePerM2: 88000 }, { ...ctx, message: "windows are 88k per m2" });
  assert.match(area, /read-only SAMPLE project/);
  const price = await handleAccountTool("propose_project_pricing", {}, ctx);
  assert.match(price, /read-only SAMPLE project/);
  assert.deepEqual(ctx.pendingActions, []);
});

test("after a sample was discussed, a rate the user did not type is never carried to their project", async () => {
  install();
  const ctx = {
    user: USER,
    page: { projectRef: OWN.slug, productKey: "revit" },
    lookup: lookup({ projectRef: OWN.slug, productKey: "revit" }),
    pendingActions: [],
    userRates: true,
    message: "use the sample's concrete rate on my Lekki job",
    sampleInConversation: true,
  };
  const out = await handleAccountTool("propose_set_rates", { match: { text: "concrete" }, rate: 100000, unit: "m3" }, ctx);
  assert.equal(out, SAMPLE_RATE_NOT_TYPED);
  assert.deepEqual(ctx.pendingActions, []);
  // The user typing their own figure is their decision, and is proposed.
  ctx.message = "set concrete to 100,000 per m3 on my Lekki job";
  const ok = await handleAccountTool("propose_set_rates", { match: { text: "concrete" }, rate: 100000, unit: "m3" }, ctx);
  assert.doesNotMatch(ok, /SAMPLE/);
  assert.equal(ctx.pendingActions.length, 1);
  assert.equal(ctx.pendingActions[0].project.id, String(OWN._id));
});

test("through the chat handler: a sample answer is marked so the reply gets its label", async () => {
  install();
  const ctx = { user: USER, page: {}, lookup: lookup(), pendingActions: [] };
  const out = await handleAccountTool("get_project_details", { projectName: "5-bedroom duplex sample" }, ctx);
  assert.ok(isSampleAnswer(out));
  const mine = await handleAccountTool("get_project_details", { projectName: "Lekki Duplex" }, ctx);
  assert.ok(!isSampleAnswer(mine));
});

test("a sample carrying the user's id is still never treated as theirs", async () => {
  install();
  const text = await getProjectDetails(ME, "4-Bedroom Duplex - Strip Foundation", lookup());
  assert.ok(!isSampleAnswer(text));
  assert.doesNotMatch(text, /77,000,000/);
  // Named as a sample it is read as a sample, labelled.
  const asSample = await getProjectDetails(ME, "4-Bedroom Duplex strip sample", lookup());
  assert.ok(isSampleAnswer(asSample));
  assert.match(asSample, new RegExp(SAMPLE_OWNED.name));
});

// ── the label and the helpers ──────────────────────────────────────────────
test("the reply is labelled when a sample was answered and the model left it out", () => {
  assert.equal(labelSampleReply("Substructure is ₦50m.", true), `${SAMPLE_LABEL}\n\nSubstructure is ₦50m.`);
  const already = `${SAMPLE_LABEL} Substructure is ₦50m.`;
  assert.equal(labelSampleReply(already, true), already);
  assert.equal(labelSampleReply("Your project is ₦1m.", false), "Your project is ₦1m.");
  assert.equal(SAMPLE_LABEL, "This is a sample project, figures are illustrative.");
});

test("helpers: 'sample' detection, name matching and typed numbers", () => {
  assert.equal(mentionsSample("the 5-bedroom duplex sample"), true);
  assert.equal(mentionsSample("Sample: Estate Road"), true);
  assert.equal(mentionsSample("samples"), true);
  assert.equal(mentionsSample("resampled survey"), false);
  assert.equal(mentionsSample("Lekki Duplex"), false);
  assert.equal(withoutSampleWord("Sample: 5-Bedroom Duplex"), "5-Bedroom Duplex");
  assert.deepEqual(numbersIn("windows are 88k per m2, doors 9,500"), [88, 88000, 2, 9500]);
  assert.equal(rateTypedByUser(88000, "windows are 88k per sqm"), true);
  assert.equal(rateTypedByUser(9500, "set blockwork to 9,500 per m2"), true);
  assert.equal(rateTypedByUser(100000, "use the sample's rate"), false);
  assert.equal(rateTypedByUser(0, "0"), false);
});
