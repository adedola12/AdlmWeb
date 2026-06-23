// server/util/serviceResolve.js
// Shared resolution + pricing orchestration for MEP services. Used by BOTH the
// /rategen-v2/services/compute route and the project-level pricing endpoint, so
// rate resolution + the build-up math live in exactly one place.
import { RateGenMaterial } from "../models/RateGenMaterial.js";
import { RateGenLabour } from "../models/RateGenLabour.js";
import { RateGenLibrary } from "../models/RateGenLibrary.js";
import { ServiceConstant } from "../models/ServiceConstant.js";
import { computeServiceBuildup, SERVICE_TYPE_DEFAULTS } from "./serviceCompute.js";

export function norm(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}
export function round2(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

// Merge a user's saved per-type constants over the system defaults.
export async function getMergedConstants(userId) {
  const doc = userId ? await ServiceConstant.findOne({ userId }).lean() : null;
  const saved = new Map((doc?.types || []).map((t) => [String(t.type), t]));
  const out = {};
  for (const [type, def] of Object.entries(SERVICE_TYPE_DEFAULTS)) {
    const s = saved.get(type) || {};
    out[type] = {
      type,
      measure: s.measure || def.measure,
      unit: s.unit || def.unit,
      standardLength: s.standardLength ?? def.standardLength,
      connectorRule: s.connectorRule || def.connectorRule,
      connectorsPerJoint: s.connectorsPerJoint ?? 1,
      fittingUpliftPercent: s.fittingUpliftPercent ?? 0,
    };
  }
  for (const t of doc?.types || []) {
    if (out[t.type]) continue;
    out[t.type] = {
      type: t.type,
      measure: t.measure || "length",
      unit: t.unit || "m",
      standardLength: t.standardLength || 0,
      connectorRule: t.connectorRule || "perBreak",
      connectorsPerJoint: t.connectorsPerJoint || 1,
      fittingUpliftPercent: t.fittingUpliftPercent || 0,
    };
  }
  return { unitSystem: doc?.unitSystem || "metric", types: out };
}

// Normalized name→price maps from the RateGen master + the user's library
// (user overrides win). One load per request, not per item.
export async function buildRateMaps(userId) {
  const [mats, labs, lib] = await Promise.all([
    RateGenMaterial.find({ enabled: true }).select("name defaultUnitPrice").lean(),
    RateGenLabour.find({ enabled: true }).select("name defaultUnitPrice").lean(),
    userId
      ? RateGenLibrary.findOne({ userId }).select("materials labour").lean()
      : null,
  ]);
  const material = new Map();
  const labour = new Map();
  for (const m of mats || []) {
    const k = norm(m?.name);
    const p = Number(m?.defaultUnitPrice);
    if (k && p > 0) material.set(k, p);
  }
  for (const l of labs || []) {
    const k = norm(l?.name);
    const p = Number(l?.defaultUnitPrice);
    if (k && p > 0) labour.set(k, p);
  }
  for (const m of lib?.materials || []) {
    const k = norm(m?.description || m?.name);
    const p = Number(m?.price);
    if (k && p > 0) material.set(k, p);
  }
  for (const l of lib?.labour || []) {
    const k = norm(l?.description || l?.name);
    const p = Number(l?.price);
    if (k && p > 0) labour.set(k, p);
  }
  return { material, labour };
}

export function lookup(map, name) {
  const k = norm(name);
  if (!k) return 0;
  if (map.has(k)) return map.get(k);
  for (const [key, val] of map) {
    if (key.includes(k) || k.includes(key)) return val;
  }
  return 0;
}

// Infer a service type (for constants selection) from a bill item's type /
// takeoff line / unit. Heuristic; the QS can refine constants per type.
export function mapServiceType(item) {
  const t = `${norm(item?.type)} ${norm(item?.takeoffLine)} ${norm(item?.category)} ${norm(item?.description)}`;
  const unit = norm(item?.unit);
  const isLength = ["m", "lm", "rm", "metre", "meter", "m."].includes(unit) || /(^|\s)m($|\s)/.test(unit);
  if (/conduit/.test(t)) return "conduit";
  if (/tray/.test(t)) return "tray";
  if (/pipe/.test(t)) return "pipe";
  if (/duct/.test(t) && isLength) return "duct";
  if (/cable/.test(t) && isLength) return "cable";
  if (isLength) return "pipe"; // generic length run
  return "fixture"; // counts: terminals/fixtures/equipment/fittings
}

// Price one service "item" (resolve rates + compute build-up). Returns
// { type, buildup, resolved }.
function priceOne(it, constants, maps) {
  const type = norm(it?.type) || "pipe";
  const c = constants[type] || SERVICE_TYPE_DEFAULTS[type] || SERVICE_TYPE_DEFAULTS.pipe;
  const measure = c.measure || "length";

  const materialRate =
    Number(it?.materialRate) > 0
      ? Number(it.materialRate)
      : lookup(maps.material, it?.materialName || it?.description);
  const labourRate =
    Number(it?.labourRate) > 0
      ? Number(it.labourRate)
      : lookup(maps.labour, it?.labourName || it?.description);
  const connectorRate =
    Number(it?.connectorRate) > 0
      ? Number(it.connectorRate)
      : lookup(maps.material, it?.connectorName || "connector");

  const fittings = (Array.isArray(it?.fittings) ? it.fittings : []).map((f) => ({
    name: f?.name,
    count: Number(f?.count) || 0,
    materialRate:
      Number(f?.materialRate) > 0 ? Number(f.materialRate) : lookup(maps.material, f?.name),
    labourRate:
      Number(f?.labourRate) > 0 ? Number(f.labourRate) : lookup(maps.labour, f?.name),
  }));

  const overheadPercent = Number(it?.overheadPercent) || 0;
  const profitPercent = Number(it?.profitPercent) || 0;

  const buildup = computeServiceBuildup({
    measure,
    qty: Number(it?.qty) || 0,
    unit: it?.unit || c.unit,
    description: it?.description || "",
    constants: {
      standardLength: c.standardLength,
      connectorRule: c.connectorRule,
      connectorsPerJoint: c.connectorsPerJoint,
      fittingUpliftPercent: c.fittingUpliftPercent,
    },
    rates: { materialRate, labourRate, connectorRate },
    fittings,
    overheadPercent,
    profitPercent,
  });

  return { type, resolved: { materialRate, labourRate, connectorRate }, buildup };
}

// Resolve + price a list of service items for a user. Returns
// { items:[{...priced}], totals:{net,amount} }.
export async function priceServiceItems(userId, items) {
  const list = Array.isArray(items) ? items.slice(0, 5000) : [];
  if (!list.length) return { items: [], totals: { net: 0, amount: 0 } };
  const [{ types: constants }, maps] = await Promise.all([
    getMergedConstants(userId),
    buildRateMaps(userId),
  ]);
  let totalNet = 0;
  let totalAmount = 0;
  const out = list.map((it) => {
    const priced = priceOne(it, constants, maps);
    const oh = Number(it?.overheadPercent) || 0;
    const pr = Number(it?.profitPercent) || 0;
    totalNet += priced.buildup.net;
    totalAmount += priced.buildup.net * (1 + (oh + pr) / 100);
    return {
      type: priced.type,
      description: it?.description || "",
      qty: Number(it?.qty) || 0,
      resolved: priced.resolved,
      buildup: priced.buildup,
    };
  });
  return { items: out, totals: { net: round2(totalNet), amount: round2(totalAmount) } };
}
