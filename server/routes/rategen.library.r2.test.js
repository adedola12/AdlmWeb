// R2 routes over real HTTP: the trade-margin table, the plant library, and a
// custom rate written with blank percentages.
//
// The real router, a real signed token and the real entitlement middleware;
// only Mongo is stubbed (the same harness as projects.boq.test.js), so
// nothing here reads or writes a database.

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import mongoose from "mongoose";

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";

const { signAccess } = await import("../middleware/auth.js");
const { User } = await import("../models/User.js");
const { RateGenLibrary } = await import("../models/RateGenLibrary.js");
const { RateGenTradeMargin } = await import("../models/RateGenTradeMargin.js");
const { RateGenPlant } = await import("../models/RateGenPlant.js");
const { default: libraryRouter } = await import("./rategen.library.js");

const USER = new mongoose.Types.ObjectId();

Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true });

let entitled = true;
let lib = null;
let saves = 0;

function freshLib() {
  saves = 0;
  lib = {
    userId: USER,
    materials: [],
    labour: [],
    rateOverrides: [],
    customRates: [],
    priceOverrides: [],
    tradeMargins: [],
    tradeMarginsVersion: 1,
    plant: [],
    plantVersion: 1,
    ratesVersion: 1,
    customRatesVersion: 1,
    save: async () => {
      saves += 1;
    },
  };
}

User.findById = async () => ({
  entitlements: entitled
    ? [{ productKey: "rategen", status: "active", expiresAt: new Date(Date.now() + 86400000) }]
    : [],
});
RateGenLibrary.findOne = async () => lib;
RateGenTradeMargin.find = () => ({ lean: async () => [{ sectionKey: "mep", overheadPercent: 15, profitPercent: 20 }] });

const MIXER = {
  sn: 1,
  name: "Concrete mixer (1-bag)",
  category: "Concrete plant",
  hoursPerDay: 8,
  enabled: true,
  parts: [
    { kind: "hire", description: "Mixer hire", quantity: 1, unit: "day", unitPrice: 25000 },
    { kind: "fuel", description: "Diesel", quantity: 15, unit: "L", unitPrice: 1000 },
    { kind: "operator", description: "Operator", quantity: 1, unit: "day", unitPrice: 8000 },
    { kind: "maintenance", description: "Servicing", quantity: 1, unit: "day", unitPrice: 2000 },
    { kind: "transport", description: "Delivery", quantity: 1, unit: "day", unitPrice: 4000 },
  ],
};
RateGenPlant.find = () => ({ lean: async () => [MIXER] });
RateGenPlant.exists = async (q) => (Number(q?.sn) === 1 ? { _id: "x" } : null);

async function withServer(fn) {
  const app = express();
  app.use(express.json());
  app.use("/rategen-v2", libraryRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn(base);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

const token = signAccess({ id: String(USER), _id: String(USER), email: "qs@example.com", role: "user" });

const call = (base, path, { method = "GET", body } = {}) =>
  fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

// ── rates need a Rate Gen licence ─────────────────────────────────────────

test("without a Rate Gen licence, neither the trade table nor the plant library is served", async () => {
  freshLib();
  entitled = false;
  try {
    await withServer(async (base) => {
      assert.equal((await call(base, "/rategen-v2/library/trade-margins")).status, 403);
      assert.equal((await call(base, "/rategen-v2/library/plant")).status, 403);
    });
  } finally {
    entitled = true;
  }
});

// ── trade margins ──────────────────────────────────────────────────────────

test("a customer saves Blockwork 10/20, and a blank custom rate in it is priced at 10/20", async () => {
  freshLib();
  await withServer(async (base) => {
    const put = await call(base, "/rategen-v2/library/trade-margins", {
      method: "PUT",
      body: { rows: [{ sectionKey: "blockwork", overheadPercent: 10, profitPercent: 20 }], baseVersion: 1 },
    });
    assert.equal(put.status, 200);
    const view = await put.json();
    const bw = view.trades.find((t) => t.sectionKey === "blockwork");
    assert.deepEqual(bw.yours, { overheadPercent: 10, profitPercent: 20 });
    assert.equal(bw.custom.profitSource, "your-trade");
    // ADLM's master figure is shown beside, and does not reach a custom rate.
    const mep = view.trades.find((t) => t.sectionKey === "mep");
    assert.deepEqual(mep.adlm, { overheadPercent: 15, profitPercent: 20 });
    assert.equal(mep.custom.profitPercent, 10);

    // A custom rate with no percentages, net ₦8,000 → 800 + 1,600 = ₦10,400
    const rate = await call(base, "/rategen-v2/library/custom-rates/cr-bw", {
      method: "PUT",
      body: { sectionKey: "blockwork", title: "225mm wall", unit: "m2", netCost: 8000 },
    });
    assert.equal(rate.status, 200);
    const { item } = await rate.json();
    assert.equal(item.overheadPercent, 10);
    assert.equal(item.profitPercent, 20);
    assert.equal(item.totalCost, 10400);

    // Re-sent without percentages after the customer changes the table to
    // 10/30: the stored 20% stays. No stored rate moves.
    await call(base, "/rategen-v2/library/trade-margins", {
      method: "PUT",
      body: { rows: [{ sectionKey: "blockwork", overheadPercent: 10, profitPercent: 30 }] },
    });
    const again = await call(base, "/rategen-v2/library/custom-rates/cr-bw", {
      method: "PUT",
      body: { sectionKey: "blockwork", title: "225mm wall", unit: "m2", netCost: 8000 },
    });
    assert.equal((await again.json()).item.totalCost, 10400);
  });
});

test("a stale table is refused, and a bad figure is refused in words", async () => {
  freshLib();
  lib.tradeMarginsVersion = 4;
  await withServer(async (base) => {
    const stale = await call(base, "/rategen-v2/library/trade-margins", {
      method: "PUT",
      body: { rows: [], baseVersion: 2 },
    });
    assert.equal(stale.status, 409);
    const bad = await call(base, "/rategen-v2/library/trade-margins", {
      method: "PUT",
      body: { rows: [{ sectionKey: "mep", profitPercent: -3 }] },
    });
    assert.equal(bad.status, 400);
    assert.match((await bad.json()).error, /less than 0/);
    assert.equal(saves, 0, "nothing written");
  });
});

// ── the plant library ──────────────────────────────────────────────────────

test("the plant library serves ADLM's mixer at ₦6,750 an hour", async () => {
  freshLib();
  await withServer(async (base) => {
    const res = await call(base, "/rategen-v2/library/plant");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.unit, "hr");
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].dayCost, 54000);
    assert.equal(body.items[0].hourlyRate, 6750);
    assert.equal(body.items[0].source, "adlm");
  });
});

test("a customer's own version of the mixer, at their diesel price, replaces it for them", async () => {
  freshLib();
  await withServer(async (base) => {
    const parts = MIXER.parts.map((p) => (p.kind === "fuel" ? { ...p, unitPrice: 1200 } : p));
    const res = await call(base, "/rategen-v2/library/plant/copy-1", {
      method: "PUT",
      body: { baseSn: 1, name: MIXER.name, hoursPerDay: 8, parts, plantBaseVersion: 1 },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    const m = body.items.find((x) => x.sn === 1);
    assert.equal(m.source, "your-copy");
    assert.equal(m.hourlyRate, 7125); // (54,000 + 3,000) / 8
    assert.equal(m.adlm.hourlyRate, 6750);
    assert.equal(lib.plant.length, 1);

    // and back to ADLM's
    const del = await call(base, "/rategen-v2/library/plant/copy-1", { method: "DELETE" });
    const after = await del.json();
    assert.equal(after.items[0].source, "adlm");
    assert.equal(lib.plant.length, 0);
  });
});

test("a machine with no working day, or a copy of a machine ADLM does not have, is refused", async () => {
  freshLib();
  await withServer(async (base) => {
    const res = await call(base, "/rategen-v2/library/plant/my-tipper", {
      method: "PUT",
      body: { name: "Tipper", hoursPerDay: 0, parts: [{ kind: "hire", quantity: 1, unitPrice: 90000 }] },
    });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /Hours per day/);
    const ghost = await call(base, "/rategen-v2/library/plant/copy-9", {
      method: "PUT",
      body: { baseSn: 9, name: "Ghost", hoursPerDay: 8, parts: [{ kind: "hire", quantity: 1, unitPrice: 1 }] },
    });
    assert.equal(ghost.status, 400);
    assert.equal(saves, 0);
  });
});

// ── the compute engine: explicit > your trade default > the item's own ─────

test("compute: a customer's trade default beats the item default; a figure on the call beats both", async () => {
  const { RateGenComputeItem } = await import("../models/RateGenComputeItem.js");
  const { RateGenMaterial } = await import("../models/RateGenMaterial.js");
  const { RateGenLabour } = await import("../models/RateGenLabour.js");
  const { computeRate } = await import("../services/rategen.computeEngine.js");
  RateGenComputeItem.findOne = () => ({
    lean: async () => ({
      section: "blockwork",
      name: "225 wall",
      outputUnit: "m2",
      overheadPercentDefault: 10,
      profitPercentDefault: 25,
      lines: [{ kind: "constant", unitPriceAtBuild: 8000, qtyPerUnit: 1, factor: 1 }],
    }),
  });
  RateGenMaterial.find = () => ({ lean: async () => [] });
  RateGenLabour.find = () => ({ lean: async () => [] });

  const none = await computeRate({ section: "blockwork", name: "225 wall" });
  assert.deepEqual([none.overheadPercent, none.profitPercent, none.totalCost], [10, 25, 10800]);

  const trade = await computeRate({
    section: "blockwork",
    name: "225 wall",
    tradeDefaults: { overheadPercent: null, profitPercent: 20 },
  });
  assert.deepEqual([trade.overheadPercent, trade.profitPercent, trade.totalCost], [10, 20, 10400]);
  assert.equal(trade.profitSource, "your-trade");
  assert.equal(trade.overheadSource, "default");

  const given = await computeRate({
    section: "blockwork",
    name: "225 wall",
    profitPercent: 5,
    tradeDefaults: { overheadPercent: 12, profitPercent: 20 },
  });
  assert.deepEqual([given.overheadPercent, given.profitPercent, given.totalCost], [12, 5, 9360]);
});
