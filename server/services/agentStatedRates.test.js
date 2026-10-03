// Ada's tools for a rate the USER states: propose_price_by_area and
// propose_set_rates. Both read the project the user is on and return a
// confirm card; neither writes. Mongo is stubbed; nothing touches a database.
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

const { TakeoffProject } = await import("../models/TakeoffProject.js");
const { getAreaPricingProposal, getSetRatesProposal } = await import("./agentUserData.js");
const { withCard } = await import("./salesAgent.js");

const OWNER = new mongoose.Types.ObjectId();
const OTHER = new mongoose.Types.ObjectId();
const PROJECT_ID = new mongoose.Types.ObjectId();

const project = {
  _id: PROJECT_ID,
  userId: OWNER,
  productKey: "revit",
  name: "Lekki duplex",
  slug: "lekki-duplex",
  collaborators: [],
  items: [
    { sn: 1, code: "W1", description: "Window W1 (1200×1500)", unit: "nr", qty: 4, rate: 0 },
    { sn: 2, code: "W2", description: "Window W2 (600x600)", unit: "nr", qty: 2, rate: 30000 },
    { sn: 3, code: "WT", description: "Windows – Total Area", unit: "m2", qty: 7.92, rate: 0 },
    { sn: 4, code: "D1", description: "Door D1 (900x2100)", unit: "nr", qty: 3, rate: 0 },
    { sn: 14, code: "B14", description: "225mm sandcrete blockwork in walls", unit: "m2", qty: 120, rate: 0 },
    { sn: 15, code: "C15", description: "Concrete blockwork infill", unit: "m3", qty: 3, rate: 0 },
  ],
};

let saves = 0;
// Only the caller's own project is ever found, as the real filter does.
TakeoffProject.findOne = (filter) => {
  const mine = String(filter?.userId) === String(project.userId);
  const hit = mine && (String(filter?._id) === String(PROJECT_ID) || filter?.slug === project.slug);
  return { lean: async () => (hit ? project : null) };
};
TakeoffProject.find = () => ({ sort: () => ({ lean: async () => [] }) });
TakeoffProject.prototype.save = async () => {
  saves += 1;
};

const here = { projectRef: String(PROJECT_ID), productKey: "revit" };

test("windows at 88,000 per m²: a card with each window's size, rate and split", async () => {
  const out = await getAreaPricingProposal(OWNER, "", { category: "windows", ratePerM2: 88000 }, here);
  assert.equal(typeof out, "object");
  const { text, card } = out;
  assert.equal(card.type, "price-proposal");
  assert.equal(card.mode, "user-rate");
  assert.equal(card.basis, "area");
  assert.equal(card.cardKey, "area-windows");
  assert.deepEqual(card.project, {
    id: String(PROJECT_ID),
    productKey: "revit",
    name: "Lekki duplex",
    slug: "lekki-duplex",
  });
  assert.deepEqual(
    card.lines.map((l) => [l.code, l.sizeLabel, l.areaM2, l.userRate, l.amount, l.ratePerM2]),
    [
      ["W1", "1200×1500", 1.8, 158400, 633600, 88000],
      ["W2", "600×600", 0.36, 31680, 63360, 88000],
    ],
  );
  assert.deepEqual(card.split, { material: 60, labour: 20, overheadProfit: 20 });
  assert.equal(card.repricedCount, 1);
  assert.equal(card.skipped.aggregate, 1);
  // No line carries a rate id: Apply cannot mistake it for a library rate.
  assert.ok(card.lines.every((l) => !l.rateId));
  // What the model is told: proposed, not applied.
  assert.match(text, /NOTHING has been priced/);
  assert.match(text, /Never say the rates are applied/);
  assert.match(text, /1200×1500 mm = 1\.8 m²/);
  assert.match(text, /already have a rate/);
  assert.equal(saves, 0);
});

test("doors with the user's own split", async () => {
  const { card } = await getAreaPricingProposal(
    OWNER,
    "",
    { category: "doors", ratePerM2: 65000, split: { material: 70, labour: 15 } },
    here,
  );
  assert.deepEqual(card.lines.map((l) => [l.code, l.userRate]), [["D1", 122850]]);
  assert.deepEqual(card.split, { material: 70, labour: 15, overheadProfit: 15 });
  assert.equal(card.cardKey, "area-doors");
});

test("a split that does not add up comes back as words, with no card", async () => {
  const out = await getAreaPricingProposal(
    OWNER,
    "",
    { category: "windows", ratePerM2: 88000, split: { material: 80, labour: 30 } },
    here,
  );
  assert.equal(typeof out, "string");
  assert.match(out, /100/);
});

test("set blockwork to 9,500 per m2: lines in m3 are left off, not converted", async () => {
  const { text, card } = await getSetRatesProposal(
    OWNER,
    "",
    { match: { text: "blockwork" }, rate: 9500, unit: "m2" },
    here,
  );
  assert.equal(card.basis, "rate");
  assert.deepEqual(card.lines.map((l) => [l.code, l.userRate, l.amount, l.rateUnit]), [
    ["B14", 9500, 1140000, "m2"],
  ]);
  assert.equal(card.skipped.wrongUnit, 1);
  assert.match(text, /C15: m3/);
  assert.match(text, /Do not convert/);
});

test("rate line 14 at 2,000", async () => {
  const { card } = await getSetRatesProposal(OWNER, "", { match: { sn: [14] }, rate: 2000 }, here);
  assert.deepEqual(card.lines.map((l) => [l.code, l.userRate]), [["B14", 2000]]);
});

test("nothing matches: words, no card", async () => {
  const out = await getSetRatesProposal(OWNER, "", { match: { text: "roof tiles" }, rate: 2000 }, here);
  assert.equal(typeof out, "string");
  assert.match(out, /No bill line/);
});

test("another user's project is never read", async () => {
  const out = await getAreaPricingProposal(OTHER, "", { category: "windows", ratePerM2: 88000 }, here);
  assert.equal(typeof out, "string");
  assert.match(out, /which project/i);
});

test("windows and doors proposed in one reply keep both cards", () => {
  const ctx = { pendingActions: [] };
  withCard({ text: "w", card: { type: "price-proposal", cardKey: "area-windows" } }, ctx);
  withCard({ text: "d", card: { type: "price-proposal", cardKey: "area-doors" } }, ctx);
  withCard({ text: "w2", card: { type: "price-proposal", cardKey: "area-windows", n: 2 } }, ctx);
  assert.deepEqual(
    ctx.pendingActions.map((a) => [a.cardKey, a.n ?? 1]),
    [
      ["area-doors", 1],
      ["area-windows", 2],
    ],
  );
});
