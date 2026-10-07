// server/util/serviceResolve.js
// Shared resolution + pricing orchestration for MEP services. Used by BOTH the
// /rategen-v2/services/compute route and the project-level pricing endpoint, so
// rate resolution + the build-up math live in exactly one place.
import { RateGenMaterial } from "../models/RateGenMaterial.js";
import { RateGenLabour } from "../models/RateGenLabour.js";
import { RateGenLibrary } from "../models/RateGenLibrary.js";
import { ServiceConstant } from "../models/ServiceConstant.js";
import { User } from "../models/User.js";
import { fetchMasterMaterials, fetchMasterLabour } from "./rategenMaster.js";
import { buildPriceIndex, matchPrice } from "./serviceMatch.js";
import {
  computeServiceBuildup,
  SERVICE_TYPE_DEFAULTS,
  mapServiceType,
} from "./serviceCompute.js";

// mapServiceType moved to serviceCompute.js (pure) so the Excel BoQ importer
// can classify services lines without pulling in the mongoose models. Re-exported
// here because callers already import it from this module.
export { mapServiceType };

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

/**
 * Strict price indexes for services pricing (util/serviceMatch.js), built from
 * every list a services line can be priced from, later lists winning on the same
 * name:
 *   1. the RateGen master, priced for the user's state (else zone): the library
 *      desktop RateGen and SERVIQ read, where the MEP items live
 *   2. the web RateGen collections (empty today)
 *   3. the user's own library
 * The web MEP pricing used to read 2 and 3 only, so a services project priced
 * nothing from RateGen; and it matched by "first name that contains the other",
 * which against ~600 master items would price a "connector" as a pan connector.
 * `opts.zone` / `opts.state` override the user's own.
 */
export async function buildPriceIndexes(userId, opts = {}) {
  const user = userId && (opts.zone === undefined || opts.state === undefined)
    ? await User.findById(userId, { zone: 1, state: 1 }).lean().catch(() => null)
    : null;
  const zone = opts.zone ?? user?.zone ?? null;
  const state = opts.state ?? user?.state ?? null;
  const [masterMats, masterLabs, mats, labs, lib] = await Promise.all([
    fetchMasterMaterials(zone, state).catch(() => []),
    fetchMasterLabour(zone, state).catch(() => []),
    RateGenMaterial.find({ enabled: true }).select("name unit defaultUnitPrice").lean(),
    RateGenLabour.find({ enabled: true }).select("name unit defaultUnitPrice").lean(),
    userId ? RateGenLibrary.findOne({ userId }).select("materials labour").lean() : null,
  ]);
  const master = (rows) => (rows || []).map((r) => ({ name: r.description, price: r.price, unit: r.unit, category: r.category, source: "master" }));
  const web = (rows) => (rows || []).map((r) => ({ name: r.name, price: r.defaultUnitPrice, unit: r.unit, source: "web" }));
  const own = (rows) => (rows || []).map((r) => ({ name: r.description || r.name, price: r.price, unit: r.unit, category: r.category, source: "own" }));
  return {
    material: buildPriceIndex([...master(masterMats), ...web(mats), ...own(lib?.materials)]),
    labour: buildPriceIndex([...master(masterLabs), ...web(labs), ...own(lib?.labour)]),
    zone,
    state,
  };
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

// Price one service "item" (resolve rates + compute build-up). Returns
// { type, buildup, resolved }. `maps` are the strict indexes of buildPriceIndexes.
function priceOne(it, constants, maps) {
  const type = norm(it?.type) || "pipe";
  const c = constants[type] || SERVICE_TYPE_DEFAULTS[type] || SERVICE_TYPE_DEFAULTS.pipe;
  const measure = c.measure || "length";
  const unit = it?.unit || c.unit;
  const given = (v) => (Number(v) > 0 ? Number(v) : null);

  const material = given(it?.materialRate) ? null : matchPrice(maps.material, it?.materialName || it?.description, { unit });
  const materialRate = given(it?.materialRate) ?? material?.price ?? 0;
  // An "(installed)" master item is a supply-and-fix price: labour is already in it.
  const allIn = Boolean(material?.allIn);
  const labour = given(it?.labourRate) || allIn ? null : matchPrice(maps.labour, it?.labourName || it?.description, { unit });
  const labourRate = given(it?.labourRate) ?? (allIn ? 0 : labour?.price ?? 0);
  const connector = given(it?.connectorRate) ? null : matchPrice(maps.material, it?.connectorName || "connector", { unit: "nr" });
  const connectorRate = given(it?.connectorRate) ?? connector?.price ?? 0;

  const fittings = (Array.isArray(it?.fittings) ? it.fittings : []).map((f) => ({
    name: f?.name,
    count: Number(f?.count) || 0,
    materialRate: given(f?.materialRate) ?? matchPrice(maps.material, f?.name, { unit: "nr" })?.price ?? 0,
    labourRate: given(f?.labourRate) ?? matchPrice(maps.labour, f?.name, { unit: "nr" })?.price ?? 0,
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

  // what each rate was taken from, so the QS can see it and correct it
  const from = (m) => (m ? { name: m.name, unit: m.unit, source: m.source, how: m.how } : null);
  return {
    type,
    resolved: { materialRate, labourRate, connectorRate, allIn, material: from(material), labour: from(labour), connector: from(connector) },
    buildup,
  };
}

// Resolve + price a list of service items for a user. Returns
// { items:[{...priced}], totals:{net,amount} }.
export async function priceServiceItems(userId, items) {
  const list = Array.isArray(items) ? items.slice(0, 5000) : [];
  if (!list.length) return { items: [], totals: { net: 0, amount: 0 } };
  const [{ types: constants }, maps] = await Promise.all([
    getMergedConstants(userId),
    buildPriceIndexes(userId),
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
