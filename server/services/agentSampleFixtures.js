// Shared by the sample tests (agentSampleGuard.test.js, agentSampleLookup.test.js).
// Not a test file itself. A user with an active QUIV licence (so the samples are
// VISIBLE to them, as on the website), their own project, two samples (one even
// carrying the user's own id) and a stranger's project, plus a small Mongo
// stand-in that honours the filters the code really sends.
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { TakeoffProject } from "../models/TakeoffProject.js";
import { ActivityLog } from "../models/ActivityLog.js";

export const id = () => new mongoose.Types.ObjectId();
export const ME = id();
export const OTHER = id();

// Sample figures are deliberately huge and odd so any leak is unmistakable.
export const OWN = {
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
export const SAMPLE = {
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
export const SAMPLE_OWNED = {
  ...SAMPLE,
  _id: id(),
  userId: ME,
  name: "Sample: 4-Bedroom Duplex - Strip Foundation",
  slug: "sample-4-bedroom-duplex-strip-foundation",
  updatedAt: new Date("2026-10-08"),
  items: [{ sn: 1, code: "T1", description: "Concrete in strip foundation", unit: "m3", qty: 770, rate: 100000 }],
  budgetItems: [{ materialName: "Cement", unit: "bags", qty: 7777, rate: 9000, componentKind: "Material" }],
};
export const STRANGER = { ...OWN, _id: id(), userId: OTHER, name: "Secret Tower", slug: "secret-tower" };
export const ALL = [OWN, SAMPLE, SAMPLE_OWNED, STRANGER];

export const USER = {
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
export function matches(doc, filter = {}) {
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
export const seen = [];
export function install(docs = ALL) {
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
export function installBroken(doc) {
  TakeoffProject.find = () => query([doc]);
  TakeoffProject.findOne = () => single(doc);
  ActivityLog.find = () => query([]);
}
export function restore() {
  TakeoffProject.find = real.find;
  TakeoffProject.findOne = real.findOne;
  TakeoffProject.aggregate = real.aggregate;
  ActivityLog.find = real.activity;
}

export const LEAKS = [/Sample:/, /50,000,000/, /53,750,000/, /77,000,000/, /9,999/, /7,777/, /9999/, /7777/];
export function assertNoSample(text) {
  for (const re of LEAKS) assert.doesNotMatch(String(text), re);
}
